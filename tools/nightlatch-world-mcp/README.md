# Nightlatch World Builder MCP

This local MCP server pairs an LLM with the visible Nightlatch House admin editor. It does not receive the admin password, cookie, CSRF token, database credentials, or `config/config.php`; the authenticated browser tab performs the existing save and image requests.

## Install

Run these commands on the same computer as the browser and AnythingLLM:

```bash
cd /absolute/path/to/nightlatch/www/tools/nightlatch-world-mcp
npm install
```

The server uses stdio for AnythingLLM and a loopback WebSocket at `ws://127.0.0.1:8321` for the already-open Nightlatch admin tab.

## AnythingLLM configuration

Add this server from AnythingLLM’s MCP settings, or add the equivalent entry to its MCP server configuration. Replace the paths and the permitted origin with your real values.

```json
{
  "mcpServers": {
    "nightlatch-world-builder": {
      "command": "node",
      "args": ["/absolute/path/to/nightlatch/www/tools/nightlatch-world-mcp/server.js"],
      "env": {
        "NIGHTLATCH_BRIDGE_ORIGIN": "https://nightlatch.house"
      }
    }
  }
}
```

AnythingLLM supports stdio MCP servers configured with a command and arguments. See its current [MCP compatibility documentation](https://docs.useanything.com/mcp-compatibility/overview).

If AnythingLLM runs in Docker, the MCP process and WebSocket listener are inside the container by default. Use a host-network/container-port setup that makes the listener reachable as `127.0.0.1:8321` from the browser, and set `NIGHTLATCH_BRIDGE_HOST=0.0.0.0` only when that port is published exclusively to the local host.

## Pair and use

1. Open any room or object editor while signed in to the deployed Nightlatch admin UI.
2. Ask the agent to call `begin_pairing`.
3. Open **Agent session** in the admin header, paste the returned code, and select **Connect local agent**.
4. The agent can inspect and patch the visible unsaved draft. An explicit request to make a room/object image starts Gemini immediately in the visible editor; you explicitly approve saving, discarding, and Gemini overlay generation in that panel.

The pairing code lasts five minutes. The paired connection survives navigation among room/object pages during the current browser tab session. Restarting the MCP server requires a new pairing.

## Current capabilities

- Open a new room/object editor or a known room/object ID.
- Inspect an open room/object draft, canvas, regions, rules, flags, inventory objects, rooms, and sounds.
- Add/select/edit regions; set metadata; replace click or automatic rule logic; add reusable overlay library entries.
- Simulate a region against flags and inventory without saving.
- “Make an image,” “create a background,” or a description of desired room/object artwork directly fills the visible Image prompt and starts Gemini background generation. It is not an approval request; the prompt and resulting artwork remain visibly unsaved for review.
- Request a human-approved Gemini overlay generation or save/discard.

Map and sound-library adapters are deliberately not exposed yet. They need their own visible draft adapters and confirmation flows; this server does not bypass the admin UI to reach those APIs.

## Security model

- The listener defaults to `127.0.0.1` and rejects page origins other than `NIGHTLATCH_BRIDGE_ORIGIN` (comma-separated origins are supported).
- Pairing requires a short-lived random code, then a session token held only in browser session storage.
- The MCP server exposes typed authoring commands only. It cannot run arbitrary browser JavaScript, issue arbitrary HTTP requests, read config, or delete content.
- Save, discard, and overlay generation are user-approved in the page that is visibly being edited. An explicitly requested room/object background is generated immediately and remains unsaved for review.

For an HTTPS admin site, some browsers may block a plaintext `ws://` loopback connection. If that happens, run a locally trusted TLS proxy/certificate in front of the loopback listener and enter its `wss://` URL in the Agent session panel; keep the origin allowlist and pairing flow unchanged.
