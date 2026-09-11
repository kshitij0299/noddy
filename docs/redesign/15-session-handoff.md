# 15 — Session Handoff (start here in a new session)

Last updated: 2026-09-11. Branch: `noddy/phase3-leftside`. Stable tag: `noddy/completion-baseline` (all green, verified — rewind here if anything breaks).

## Where we are

- Phases 0–3.5 + completion pass: DONE and shipped (see CHANGELOG.md, newest at top).
- Only open thread: optional **styling round** (old-branch polish on this base) — NOT started, needs user go-ahead.
- User's link: http://127.0.0.1:5174/ served from this checkout (`npm run dev` or equivalent, started by the user — never kill it).

## How we work (do not improvise alternatives)

- Orchestrator (you) integrates only. Implementation agents get narrow scopes + isolated worktree/branch each. Independent reviewer per milestone. Verification packet + STOP for approval after every milestone (AGENTS.md §5).
- Browser loop is mandatory for UI work: `scripts/browser/drive.mjs` (README beside it) + rubric `skills/NODDY-UX-RUBRIC.md`. Builder screenshots itself → verifier surveys → relay defects → integrate → full suite → review → packet.
- Reports stay compact (defect lists + paths, no image dumps). View screenshots yourself only for tiebreaks and final sign-off.

## Environment gotchas (learned the hard way)

1. Background dev servers: ALWAYS start vite with an ABSOLUTE src path and curl-verify identity afterwards (a marker edit or title check). Relative-path servers have landed in the wrong checkout twice.
2. Never use ports 5174 (user's), 5175, 9222 for your own servers.
3. Symlinked `node_modules` in worktrees BREAKS vitest (`vi-canvas-mock` `/@fs/` failure). Full `npx vitest run` ONLY in the main checkout. Worktree agents run `eslint` on touched files; canonical suite runs at integration.
4. `npm run build` rewrites `src/app/app_config.json:versionDate` and empties `dist/`. Always: backup app_config → build → restore file → `git checkout -- dist/` → delete ONLY untracked leftovers (explicit paths, never globs — a glob once ate tracked files).
5. Driver limits (`drive.mjs`): click-only (no hover/keys/drag/file-pickers). Always set viewport first; clicks auto-scroll. `/json/new` needs PUT. Overlay-open states need `viewportOnly:true` shots (full-page mis-composites them).
6. Headless hides headed scrollbars and overlay fade effects — the user confirms those in their browser. Note it in packets, don't claim otherwise.
7. Chrome 150+: custom-element constructors must NOT call `setAttribute` on the host (throws `NotSupportedError` → dead element, no shadow DOM). Writes go in `connectedCallback` (idempotent, guarded).
8. Never resume image-heavy agent sessions (50-image provider cap) — spawn fresh agents with written briefs instead (pass `task_id` only for light sessions).
9. Editing CHANGELOG.md: section headers repeat similar words — always anchor edits with unique surrounding lines (the header-swap bug has happened 4 times).
10. `browser-agent/` (untracked, repo root) is ANOTHER session's Browserbase work. Never list/read/touch/clean it, never its `.env`, no root installs because of it. Verifier briefs must restate this.
11. No `npm install` without explicit user approval, ever.

## User profile (don't re-learn)

- Designer + vibe coder. Plain language, short packets, no jargon, no sciencey briefs.
- Figma mental model: buttons are fixed-size OR fill (full container width). Hover must NEVER move layout (tint-only). Left-aligned rhythms; shared box edges matter to them (they measure).
- They screenshot well — treat user screenshots as first-class evidence. Visual decks go in Obsidian: `/Users/kshitij/Documents/Obsidian Vault/Noddy/assets/` (they give paths on request).
- They run the browser link themselves; always tell them when to hard-refresh (`Cmd+Shift+R`) after merges or they'll judge stale code.
- Approval gates are real: stop after every milestone until "approved"/"continue". They approve fast when packets are short.
