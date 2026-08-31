(function () {
    'use strict';

    var socket = null;
    var paired = false;
    var pendingApproval = null;
    var logEntries = [];
    var elements = {};

    function byId(id) { return document.getElementById(id); }
    function adapter() { return window.NLRoomEditorBridge || null; }
    function state(message, connected) {
        if (!elements.state) return;
        elements.state.textContent = message;
        elements.state.classList.toggle('connected', !!connected);
    }
    function addLog(message, isError) {
        logEntries.unshift({ message: String(message || ''), error: !!isError });
        logEntries = logEntries.slice(0, 12);
        if (!elements.log) return;
        elements.log.innerHTML = '';
        logEntries.forEach(function (entry) {
            var item = document.createElement('li');
            item.textContent = entry.message;
            if (entry.error) item.className = 'error';
            elements.log.appendChild(item);
        });
    }
    function send(payload) {
        if (!socket || socket.readyState !== WebSocket.OPEN) return false;
        socket.send(JSON.stringify(payload));
        return true;
    }
    function pageSummary() {
        var current = adapter();
        if (!current) return { kind: 'admin', path: window.location.pathname, ready: false };
        var snapshot = current.snapshot();
        return {
            kind: snapshot.kind,
            path: window.location.pathname,
            ready: true,
            id: snapshot.id,
            title: snapshot.title,
            regionCount: snapshot.regions.length,
            dirty: snapshot.dirty
        };
    }
    function updatePageSummary() {
        if (!elements.page) return;
        var summary = pageSummary();
        if (!summary.ready) {
            elements.page.textContent = 'Open a room or object editor to begin.';
            return;
        }
        elements.page.textContent = (summary.kind === 'object' ? 'Object' : 'Room') + ': ' + (summary.title || 'Untitled') + ' · ' + summary.regionCount + ' regions' + (summary.dirty ? ' · unsaved changes' : '');
    }
    function commandResult(id, ok, result, error) {
        send({ type: 'command_result', id: id, ok: !!ok, result: result === undefined ? null : result, error: error || '' });
    }
    function showApproval(request) {
        pendingApproval = request;
        elements.approval.hidden = false;
        elements.approval.innerHTML = '';
        var title = document.createElement('strong');
        title.textContent = request.title || 'Agent approval required';
        var detail = document.createElement('small');
        detail.textContent = request.detail || 'Review this requested action.';
        var actions = document.createElement('div');
        actions.className = 'agent-approval-actions';
        var reject = document.createElement('button');
        reject.type = 'button';
        reject.className = 'btn-ghost';
        reject.textContent = 'Decline';
        reject.addEventListener('click', function () { resolveApproval(false); });
        var approve = document.createElement('button');
        approve.type = 'button';
        approve.className = 'btn-forge';
        approve.textContent = request.approveLabel || 'Approve';
        approve.addEventListener('click', function () { resolveApproval(true); });
        actions.appendChild(reject);
        actions.appendChild(approve);
        elements.approval.appendChild(title);
        elements.approval.appendChild(detail);
        elements.approval.appendChild(actions);
    }
    function finishApproval(request, approved, result, error) {
        pendingApproval = null;
        elements.approval.hidden = true;
        send({ type: 'approval_result', requestId: request.requestId, approved: !!approved, result: result || null, error: error || '' });
        addLog(approved ? (request.title + ' approved') : (request.title + ' declined'), !!error);
        updatePageSummary();
    }
    function resolveApproval(approved) {
        var request = pendingApproval;
        if (!request) return;
        if (!approved) {
            finishApproval(request, false);
            return;
        }
        var current = adapter();
        if (!current) {
            finishApproval(request, false, null, 'Open a room or object editor before approving this action.');
            return;
        }
        var operation;
        if (request.action === 'save') operation = current.save();
        else if (request.action === 'discard') operation = current.discard();
        else if (request.action === 'generate_overlay') operation = current.generateOverlay(request.payload || {});
        else operation = Promise.reject(new Error('Unsupported approval action.'));
        Promise.resolve(operation).then(function (result) {
            finishApproval(request, true, result);
        }).catch(function (error) {
            finishApproval(request, false, null, error && error.message ? error.message : String(error));
        });
    }
    function navigateEditor(args) {
        args = args || {};
        var query = args.id ? '?id=' + encodeURIComponent(String(args.id)) : '';
        var page = args.kind === 'object' ? 'object-edit.php' : 'room-edit.php';
        window.location.href = page + query;
        return { navigating: true, target: page + query };
    }
    function handleCommand(message) {
        var current = adapter();
        var args = message.args || {};
        try {
            if (message.command === 'inspect') {
                commandResult(message.id, true, current ? current.snapshot() : pageSummary());
                return;
            }
            if (message.command === 'navigate_editor') {
                commandResult(message.id, true, navigateEditor(args));
                return;
            }
            if (message.command === 'apply_patch') {
                if (!current) throw new Error('Open a room or object editor before applying a patch.');
                commandResult(message.id, true, current.applyPatch(args.operations || []));
                updatePageSummary();
                addLog('Agent applied ' + (args.operations || []).length + ' draft change' + ((args.operations || []).length === 1 ? '' : 's'));
                return;
            }
            if (message.command === 'simulate') {
                if (!current) throw new Error('Open a room or object editor before simulating a region.');
                commandResult(message.id, true, current.simulate(args));
                return;
            }
            if (message.command === 'generate_background') {
                if (!current) throw new Error('Open a room or object editor before generating a background.');
                current.generateBackground(args.prompt || '').then(function (result) {
                    commandResult(message.id, true, result);
                    updatePageSummary();
                    addLog('Agent generated a new ' + (current.snapshot().kind === 'object' ? 'object' : 'room') + ' background');
                }).catch(function (error) {
                    commandResult(message.id, false, null, error && error.message ? error.message : String(error));
                });
                return;
            }
            if (message.command === 'request_approval') {
                if (!current) throw new Error('Open a room or object editor before requesting approval.');
                showApproval(args);
                commandResult(message.id, true, { status: 'awaiting_user_approval', requestId: args.requestId });
                addLog('Agent requested approval: ' + (args.title || args.action));
                return;
            }
            throw new Error('Unsupported bridge command.');
        } catch (error) {
            commandResult(message.id, false, null, error && error.message ? error.message : String(error));
        }
    }
    function openConnection(url, initialMessage) {
        if (socket) socket.close();
        paired = false;
        state('Connecting to local bridge…', false);
        try {
            socket = new WebSocket(url);
        } catch (error) {
            state('Could not open the local bridge.', false);
            addLog(error.message || 'Could not open the local bridge.', true);
            return;
        }
        socket.addEventListener('open', function () {
            initialMessage.page = pageSummary();
            send(initialMessage);
        });
        socket.addEventListener('message', function (event) {
            var message;
            try { message = JSON.parse(event.data); } catch (ignored) { return; }
            if (message.type === 'paired') {
                paired = true;
                elements.code.value = '';
                if (message.sessionId) window.sessionStorage.setItem('nightlatch-agent-bridge-session', message.sessionId);
                state('Connected to local agent', true);
                addLog('Local agent paired');
                updatePageSummary();
                return;
            }
            if (message.type === 'command') handleCommand(message);
            if (message.type === 'error') {
                state(message.error || 'Local bridge rejected the connection.', false);
                addLog(message.error || 'Local bridge rejected the connection.', true);
            }
        });
        socket.addEventListener('close', function () {
            if (paired) addLog('Local agent disconnected', true);
            paired = false;
            state('Not connected', false);
        });
        socket.addEventListener('error', function () {
            state('Could not reach the local bridge.', false);
        });
    }
    function connect() {
        var url = elements.url.value.trim();
        var code = elements.code.value.trim();
        if (!url || !code) {
            state('Enter the local bridge URL and pairing code.', false);
            return;
        }
        window.localStorage.setItem('nightlatch-agent-bridge-url', url);
        window.sessionStorage.removeItem('nightlatch-agent-bridge-session');
        openConnection(url, { type: 'pair', code: code });
    }
    function resume() {
        var url = elements.url.value.trim();
        var sessionId = window.sessionStorage.getItem('nightlatch-agent-bridge-session');
        if (!url || !sessionId) return;
        openConnection(url, { type: 'resume', sessionId: sessionId });
    }
    function init() {
        elements = {
            panel: byId('agent-session'), launch: byId('agent-session-launch'), close: byId('agent-session-close'),
            url: byId('agent-bridge-url'), code: byId('agent-pairing-code'), connect: byId('agent-session-connect'),
            state: byId('agent-session-state'), page: byId('agent-session-page'), approval: byId('agent-session-approval'), log: byId('agent-session-log')
        };
        if (!elements.panel) return;
        elements.url.value = window.localStorage.getItem('nightlatch-agent-bridge-url') || elements.url.value;
        elements.launch.addEventListener('click', function () { elements.panel.hidden = false; updatePageSummary(); });
        elements.close.addEventListener('click', function () { elements.panel.hidden = true; });
        elements.connect.addEventListener('click', connect);
        elements.code.addEventListener('keydown', function (event) { if (event.key === 'Enter') connect(); });
        window.setInterval(function () {
            updatePageSummary();
            if (paired) send({ type: 'page', page: pageSummary() });
        }, 1500);
        updatePageSummary();
        resume();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
}());
