---
description: Start Noddy in the browser and connect this Claude Code session as its agent
---

Start Noddy and connect yourself to it as the agent. Work from the repo root. Never print the pairing token in chat.

1. **Dev server.** If nothing answers on `http://localhost:5300`, start it in the background:
   `npx vite serve ./src/ --port 5300 --strictPort` (run `npm ci` first if `node_modules` is missing).
   Wait until the page answers with HTTP 200. If 5300 is taken by something that isn't Noddy, tell the user.

2. **Pairing token** (loopback only; the same call the page makes when Local agent is turned on):
   ```bash
   TOKEN=$(curl -s -X POST http://localhost:5300/api/agent/bridge -H 'Origin: http://localhost:5300' -H 'Content-Type: application/json' -d '{"type":"enable"}' | node -e "process.stdin.on('data',d=>process.stdout.write(JSON.parse(d).token))")
   ```
   The token changes every time the dev server starts, so re-register each time.

3. **Register the MCP server** for this project (replaces an old registration):
   ```bash
   claude mcp remove noddy -s local >/dev/null 2>&1; claude mcp add --transport http -s local noddy http://localhost:5300/mcp --header "Authorization: Bearer $TOKEN"
   ```

4. **Open Noddy** in the user's browser: `open http://localhost:5300` (macOS; `xdg-open` on Linux).
   Tell the user, in one short message:
   - open or start a project,
   - in the agent panel press the terminal button (**Local agent**) once (it stays on after reloads),
   - run `/mcp` here and reconnect **noddy** (a new registration needs a reconnect; a new session also works).

5. **Confirm.** When the `noddy` tools are available, call `get_context` and tell the user the project name and glyph count. If the tools aren't there yet, wait for the user to say they reconnected.

6. **While working** (the Noddy playbook, see `CLAUDE.md` owner rules and `docs/agentic/plans/LOCAL-AGENT-MCP.md`):
   - Keep this one MCP session for the whole run: glyph jobs die with the session (#98).
   - Pass the latest `revision` as `expectedRevision`. Every submit lands as a Draft the user keeps.
   - Remix: describe the user's reference mark first, keep every glyph in its family, reshape only a little, no wave/bulge/twist on pixel fonts, render and look before submitting.
   - Before a dev-server restart or `git pull`, make sure the user's project is saved to a file (Export → Save project file, or `tmp/projects/`).
