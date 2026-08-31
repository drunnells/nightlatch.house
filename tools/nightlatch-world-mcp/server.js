import crypto from 'node:crypto';
import process from 'node:process';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { WebSocketServer, WebSocket } from 'ws';
import { z } from 'zod';

const bridgePort = Number.parseInt(process.env.NIGHTLATCH_BRIDGE_PORT || '8321', 10);
const bridgeHost = process.env.NIGHTLATCH_BRIDGE_HOST || '127.0.0.1';
const allowedOrigins = (process.env.NIGHTLATCH_BRIDGE_ORIGIN || 'http://localhost,http://127.0.0.1')
    .split(',').map((origin) => origin.trim()).filter(Boolean);
const pairingLifetimeMs = 5 * 60 * 1000;
const commandLifetimeMs = 15 * 1000;

let bridgeSocket = null;
let bridgePage = null;
let activePairing = null;
let activeSessionId = null;
const pendingCommands = new Map();
const approvals = new Map();
const audit = [];

function log(message) {
    process.stderr.write(`[nightlatch-world-mcp] ${message}\n`);
}

function text(value) {
    return { content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] };
}

function fail(message) {
    return { content: [{ type: 'text', text: message }], isError: true };
}

function randomToken(bytes = 18) {
    return crypto.randomBytes(bytes).toString('base64url');
}

function addAudit(message, level = 'info') {
    audit.unshift({ at: new Date().toISOString(), level, message });
    if (audit.length > 50) audit.length = 50;
    log(message);
}

function pairingStatus() {
    if (!activePairing) return null;
    const remainingSeconds = Math.max(0, Math.ceil((activePairing.expiresAt - Date.now()) / 1000));
    if (!remainingSeconds) {
        activePairing = null;
        return null;
    }
    return { code: activePairing.code, remainingSeconds };
}

function sessionStatus() {
    const pending = Array.from(approvals.values()).map((approval) => ({
        requestId: approval.requestId,
        action: approval.action,
        title: approval.title,
        status: approval.status,
        detail: approval.detail,
        result: approval.result || null,
        error: approval.error || ''
    }));
    return {
        connected: !!bridgeSocket && bridgeSocket.readyState === WebSocket.OPEN,
        page: bridgePage,
        pairing: pairingStatus(),
        approvals: pending,
        audit: audit.slice(0, 12)
    };
}

function requireBridge() {
    if (!bridgeSocket || bridgeSocket.readyState !== WebSocket.OPEN) {
        throw new Error('No Nightlatch admin tab is paired. Call begin_pairing, then connect from the admin Agent session panel.');
    }
}

function callBridge(command, args = {}, timeoutMs = commandLifetimeMs) {
    requireBridge();
    const id = randomToken(12);
    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            pendingCommands.delete(id);
            reject(new Error('The paired admin tab did not respond. Confirm it is still open and connected.'));
        }, timeoutMs);
        pendingCommands.set(id, { resolve, reject, timeout });
        bridgeSocket.send(JSON.stringify({ type: 'command', id, command, args }));
    });
}

function cleanSocket(socket) {
    if (bridgeSocket === socket) {
        bridgeSocket = null;
        bridgePage = null;
        addAudit('Paired admin tab disconnected.', 'warning');
    }
}

function allowedOrigin(request) {
    const origin = request.headers.origin || '';
    return allowedOrigins.includes(origin);
}

const webSocketServer = new WebSocketServer({
    host: bridgeHost,
    port: Number.isFinite(bridgePort) ? bridgePort : 8321,
    verifyClient: (info, done) => {
        if (!allowedOrigin(info.req)) {
            done(false, 403, 'This Nightlatch bridge origin is not allowed.');
            return;
        }
        done(true);
    }
});

webSocketServer.on('connection', (socket) => {
    let paired = false;
    socket.on('message', (raw) => {
        let message;
        try {
            message = JSON.parse(raw.toString());
        } catch {
            socket.send(JSON.stringify({ type: 'error', error: 'Bridge messages must be JSON.' }));
            return;
        }
        if (!paired) {
            const providedCode = Buffer.from(String(message.code || ''));
            const expectedCode = activePairing ? Buffer.from(activePairing.code) : null;
            const validPair = message.type === 'pair' && activePairing && Date.now() < activePairing.expiresAt
                && providedCode.length === expectedCode.length
                && crypto.timingSafeEqual(providedCode, expectedCode);
            const validResume = message.type === 'resume' && activeSessionId
                && typeof message.sessionId === 'string'
                && message.sessionId.length === activeSessionId.length
                && crypto.timingSafeEqual(Buffer.from(message.sessionId), Buffer.from(activeSessionId));
            if (!validPair && !validResume) {
                socket.send(JSON.stringify({ type: 'error', error: 'Pairing was rejected. Request a new code from the agent and try again.' }));
                socket.close();
                return;
            }
            if (bridgeSocket && bridgeSocket !== socket) bridgeSocket.close();
            paired = true;
            bridgeSocket = socket;
            bridgePage = message.page || null;
            if (validPair) activePairing = null;
            if (!activeSessionId || validPair) activeSessionId = randomToken(24);
            socket.send(JSON.stringify({ type: 'paired', sessionId: activeSessionId }));
            addAudit('Paired an admin tab.');
            return;
        }
        if (message.type === 'page') {
            bridgePage = message.page || null;
            return;
        }
        if (message.type === 'command_result') {
            const pending = pendingCommands.get(message.id);
            if (!pending) return;
            clearTimeout(pending.timeout);
            pendingCommands.delete(message.id);
            if (message.ok) pending.resolve(message.result);
            else pending.reject(new Error(message.error || 'The admin tab rejected the command.'));
            return;
        }
        if (message.type === 'approval_result') {
            const approval = approvals.get(message.requestId);
            if (!approval) return;
            approval.status = message.approved ? 'approved' : 'declined';
            approval.result = message.result || null;
            approval.error = message.error || '';
            addAudit(`${approval.title} ${approval.status}.`, message.error ? 'warning' : 'info');
        }
    });
    socket.on('close', () => cleanSocket(socket));
    socket.on('error', () => cleanSocket(socket));
});
webSocketServer.on('listening', () => log(`Browser bridge listening on ws://${bridgeHost}:${bridgePort}`));

const server = new McpServer({ name: 'nightlatch-world-builder', version: '0.1.0' });

server.tool('begin_pairing', 'Create a five-minute pairing code for the open Nightlatch admin tab. Tell the human to open Agent session in the admin header, paste this code, and connect.', {}, async () => {
    activePairing = { code: randomToken(18), expiresAt: Date.now() + pairingLifetimeMs };
    addAudit('Created a new browser pairing code.');
    return text({
        pairingCode: activePairing.code,
        expiresInSeconds: pairingLifetimeMs / 1000,
        instructions: 'The human must paste this code into the Nightlatch admin Agent session panel and click Connect local agent.'
    });
});

server.tool('session_status', 'Read the paired admin tab, open editor summary, pending human approvals, and recent agent activity.', {}, async () => text(sessionStatus()));

server.tool('inspect_open_editor', 'Read the full draft and authoring choices for the room or object editor currently open in the paired admin tab.', {}, async () => {
    try {
        return text(await callBridge('inspect'));
    } catch (error) {
        return fail(error.message);
    }
});

server.tool('open_room_editor', 'Navigate the paired admin tab to a room editor. Omit roomId to open a new unsaved room.', {
    roomId: z.union([z.string(), z.number()]).optional()
}, async ({ roomId }) => {
    try {
        const result = await callBridge('navigate_editor', { kind: 'room', id: roomId === undefined ? '' : String(roomId) });
        addAudit(roomId === undefined ? 'Navigating to a new room editor.' : `Navigating to room ${roomId}.`);
        return text(result);
    } catch (error) {
        return fail(error.message);
    }
});

server.tool('open_object_editor', 'Navigate the paired admin tab to an object editor. Omit objectId to open a new unsaved object.', {
    objectId: z.union([z.string(), z.number()]).optional()
}, async ({ objectId }) => {
    try {
        const result = await callBridge('navigate_editor', { kind: 'object', id: objectId === undefined ? '' : String(objectId) });
        addAudit(objectId === undefined ? 'Navigating to a new object editor.' : `Navigating to object ${objectId}.`);
        return text(result);
    } catch (error) {
        return fail(error.message);
    }
});

server.tool('apply_room_draft', 'Apply visible, unsaved draft operations to the open room or object. Supported types: set_metadata, add_region, update_region, replace_logic, replace_automatic_behaviors, add_overlay_library_item, and select_region. This never saves.', {
    operations: z.array(z.object({ type: z.string() }).passthrough()).min(1)
}, async ({ operations }) => {
    try {
        const result = await callBridge('apply_patch', { operations });
        addAudit(`Applied ${operations.length} visible draft operation${operations.length === 1 ? '' : 's'}.`);
        return text(result);
    } catch (error) {
        return fail(error.message);
    }
});

server.tool('simulate_region', 'Evaluate the current draft logic for one room/object region against optional flags and inventory. This does not change the draft or save.', {
    regionId: z.string(),
    flags: z.record(z.string()).optional(),
    items: z.record(z.string()).optional()
}, async ({ regionId, flags, items }) => {
    try {
        return text(await callBridge('simulate', { regionId, state: { flags: flags || {}, items: items || {} } }));
    } catch (error) {
        return fail(error.message);
    }
});

server.tool('generate_background', 'Use the configured Gemini model to generate a background for the open room or object. Call this directly when the human asks for a new background: it visibly writes the prompt into the editor, starts generation immediately, and leaves the result unsaved for human review.', {
    prompt: z.string().min(1).max(2000)
}, async ({ prompt }) => {
    try {
        const result = await callBridge('generate_background', { prompt }, 120000);
        addAudit('Generated a visible Gemini background draft.');
        return text(result);
    } catch (error) {
        return fail(error.message);
    }
});

function approvalRequest(action, title, detail, payload = {}, approveLabel) {
    const requestId = randomToken(12);
    const approval = { requestId, action, title, detail, payload, approveLabel, status: 'awaiting_user_approval', result: null, error: '' };
    approvals.set(requestId, approval);
    return callBridge('request_approval', approval).then(() => approval);
}

server.tool('request_save', 'Ask the human in the visible admin tab to save the current room/object draft. The tool only queues the approval; use session_status afterward to learn whether the human approved it.', {}, async () => {
    try {
        const approval = await approvalRequest('save', 'Save this draft?', 'Saving promotes selected graphics and persists the visible room or object changes.', {}, 'Save draft');
        addAudit('Requested human approval to save the current draft.');
        return text(approval);
    } catch (error) {
        return fail(error.message);
    }
});

server.tool('request_discard', 'Ask the human in the visible admin tab to discard the current unsaved room/object draft. The human must explicitly approve the reload.', {}, async () => {
    try {
        const approval = await approvalRequest('discard', 'Discard this draft?', 'This reloads the editor and removes tracked temporary graphics. Unsaved human and agent work will be lost.', {}, 'Discard draft');
        addAudit('Requested human approval to discard the current draft.');
        return text(approval);
    } catch (error) {
        return fail(error.message);
    }
});

server.tool('request_overlay_generation', 'Ask the human in the visible editor to generate an overlay for a selected region. The generated overlay is added to that region’s reusable overlay library but is not saved until the human later approves Save.', {
    regionId: z.string(),
    prompt: z.string().min(1).max(2000),
    referenceOverlayAsset: z.string().optional()
}, async ({ regionId, prompt, referenceOverlayAsset }) => {
    try {
        const approval = await approvalRequest(
            'generate_overlay',
            'Generate region overlay?',
            `Gemini will generate a new overlay for the selected region: ${prompt}`,
            { regionId, prompt, referenceOverlayAsset: referenceOverlayAsset || '' },
            'Generate overlay'
        );
        addAudit(`Requested human approval to generate an overlay for region ${regionId}.`);
        return text(approval);
    } catch (error) {
        return fail(error.message);
    }
});

const transport = new StdioServerTransport();
await server.connect(transport);
