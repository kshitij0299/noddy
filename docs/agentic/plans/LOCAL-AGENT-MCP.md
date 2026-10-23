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
