# Plan: connect a local coding agent (Claude Code etc.) to Noddy

Owner request (2026-10-23): when the repo runs locally, let Claude Code (or Codex, Cursor,
OpenCode) drive Noddy's agent tools directly, using the owner's own subscription instead of an API
key and free models. Dev/local only; never part of a hosted build.

## How it works

```
Claude Code ──MCP (HTTP)──▶ dev server /mcp ──bridge──▶ open Noddy tab ──▶ native tools
            ◀──── result ──                  ◀─ result ─  (same validation, locks, undo, drafts)
```

1. The Vite dev server (`configureServer` only; not preview, not `serve.js`, not the build)
   exposes an MCP endpoint at `/mcp` (Streamable HTTP, via `@modelcontextprotocol/sdk` — new
   dev dependency, owner approves by approving this plan).
2. The tools are the existing `TOOL_DEFINITIONS` with the same `validateToolInput`. No new tools
   in this PR (better tools are the next PR).
3. A Noddy tab connects to the dev server over a bridge (`/api/agent/bridge`: server-sent events
   for calls, POST for results). Each MCP tool call is forwarded to that tab, executed by
   `createNativeToolSession().execute(...)`, and the result goes back. Render tools return MCP
   image content so the agent can see the glyphs.
4. Everything the built-in agent obeys still applies: revision checks, LOCKED_YOURS / LOCKED_OPEN,
   glyph jobs as drafts, one undo step per submit, the mutation log.

## Consent and safety

- **Off by default.** The agent panel gets a "Local agent" option (dev server only). Turning it on
  makes this tab the target and shows a pairing token plus a copyable command:
  `claude mcp add --transport http noddy http://localhost:5300/mcp --header "Authorization: Bearer <token>"`
- `/mcp` and the bridge reuse `assertLocalRequest` (loopback, Host and Origin checks), require the
  token, and refuse everything while no tab is connected. The token is random per dev-server start
  and kept in memory; it never reaches logs.
- One tab at a time. Turning it off, closing the tab or pressing Stop rejects pending and further
  calls with a clear error the agent can read.
- Per-call timeout (default 60 s) with an error result, not a hang.

## UI (agent panel, minimal)

- Connected state: "Claude Code · connected" chip in place of the model chip (the MCP client name
  from `initialize`). The chat area shows the external agent's tool calls with the same tool
  chips and receipts as a normal run, so the owner sees what it does. Stop button.
- No new screens. Follows `noddy-ui-feedback`: every control earns its place.

## Connect Claude Code

1. Run the dev server from your checkout: `npm run dev` (or `npx vite serve ./src/ --port <port>`).
   The preview server, `npm run agent:serve` and built copies have no Local agent.
2. Open Noddy, open a project, and in the agent panel header press the terminal button
   (**Local agent**). The thread shows a command like:
   `claude mcp add --transport http noddy http://localhost:<port>/mcp --header "Authorization: Bearer <token>"`
   Press **Copy command**.
3. Paste it in a terminal. If `noddy` is already registered from an earlier dev-server start,
   run `claude mcp remove noddy` first: the token changes every time the dev server starts.
4. Start Claude Code (or `/mcp` → reconnect in a running session). The chip in the panel turns to
   "Claude Code · connected".
5. Ask, for example, "use the noddy tools to list the glyphs" or "apply A's style to B". Each tool
   call shows as a step line; each `submit_glyph` lands as a Draft with a receipt (Keep) and is one
   step in the editor's Undo.
6. Press **Stop** in the composer (or the switch again, or close the tab) to turn it off. Pending
   and later calls get a readable tool error; turn it on again for a fresh command.

Notes: one tab at a time (turning it on in another tab takes over). A native session lives as
long as the MCP session (32 renders, 256 calls); it is replaced when the project changes or it
reaches a limit, which drops unsubmitted drafts (the result says `sessionRestarted: true` and its
`notice` names the dropped drafts). A reload keeps Local agent on for that tab; after a dev-server
restart the panel shows the new command. After Stop or closing the tab the chip says "waiting"
until the coding agent calls again. Other clients
(Codex, Cursor, OpenCode) use the same URL and `Authorization` header in their MCP config.

## Talk to it from the panel (PR B, bug 30)

While Local agent is on, the composer sends to the coding agent instead of the built-in model.
Tell Claude Code once, for example: "Use the noddy tools: call wait_for_user_message, do what
I ask with the Noddy tools, answer with reply_to_user, and loop." Then type in the panel:

- `wait_for_user_message` (MCP only) long-polls up to `timeoutSeconds` (default 45, at most 60)
  and returns `{message: {id, text, attachments: [{name, kind, size}], target: {scope, glyphIds},
  mode, chaos}}`, or `{message: null, timedOut: true}` (call it again). Messages typed while the
  agent is busy wait in a queue (20 at most) and come one per call, in order.
- `reply_to_user {text}` shows the text in the thread as the agent's message.
- The thread says "Queued for Claude Code" (it is not listening yet) or "Sent", then "Claude Code
  read it" and "Claude Code is working…" until it replies or waits again. While it works, Send
  is Stop, which turns Local agent off (pending calls and a waiting call fail with
  LOCAL_AGENT_OFF, the queue is dropped).
- Same rules as the other bridge routes: the panel's POST carries the token and the page's
  Origin, loopback only; without a tab connected both tools return NO_TAB.
- `get_context` reports the panel's `mode`, `chaos` and `target` too. Attachments are metadata
  only (the files stay in the tab).

## Out of scope (next PRs)

- Better tools (copy shape from another glyph, move/mirror/scale, primitives), error feedback and
  repair for the built-in agent, streaming, loosening the outline gate. See SMOKE-TEST-BUGS.md.
- Hosted builds, remote agents, multiple tabs.

## Done means

- `claude mcp add ...` then, in Claude Code, "list the glyphs" and "apply A's style to B" work
  against the open tab, with drafts and undo intact.
- Tests: relay checks for `/mcp` (no token → 401, non-loopback → 403, no tab → clear error,
  unknown tool / invalid input → tool error), bridge round trip with a fake tab, timeout, Stop;
  panel test for the toggle and connected state. `npm run lint`, `npx vitest run`,
  `npm run build`, `npm run test:agent-relay` pass; the build contains no `/mcp` code.
- Browser check at 1440 and 1024 with screenshots in the PR.

## Process (WORKFLOW.md)

- Before this: commit branch `agent/dev-env-key` (the `env` key shortcut, 5-minute relay timeout,
  SMOKE-TEST-BUGS.md) as its own PR, tier-3 QA, merge into `dev`.
- This feature: one PR off `dev`, labels `area:agent`, `protected-area` (relay), `qa:tier-3`.
- Developer on Opus 5.5 at medium effort; QA on Sonnet 5.5 at medium, read-only. Effort set
  explicitly. One heavy run at a time.
- The developer works in its own worktree on its own port (not 5187, not 5300) so the owner's
  5300 server and open project are never restarted.
- After merge: live test by connecting this Claude Code session to the owner's 5300 server.
