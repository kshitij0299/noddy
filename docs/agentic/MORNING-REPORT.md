# Morning report: overnight agentic build

_Updated by the orchestrator after merges. Run window: 2026-10-20 21:45 → 2026-10-21 02:30 UTC (see [BUDGET.md](BUDGET.md))._

## TL;DR

- Build in progress: M1 foundations and the M2 data layer are landing; the M2 workspace UI (shell, specimen, grid) is being built.
- Every PR went issue → developer agent → QA agent (combined QA + UX review for UI) → squash-merge into `dev`.

## Protected-area PRs to review first

| PR | What | Status |
|---|---|---|
| [#4](https://github.com/kshitij0299/noddy/pull/4) | Test-only: SVG fixture filename case so `svg_outline.test.js` loads on Linux (file sits under `src/formats_io/`) | merged, QA PASS |
| [#37](https://github.com/kshitij0299/noddy/pull/37) | [M1] Inspector numeric undo fix (`src/panels/cards.js`, per `docs/agent/INSPECTOR-UNDO-PROPOSAL.md`); one existing agent test reordered because it relied on the bug | open, QA running |

## Merged into `dev`

| PR | Issue | What | QA |
|---|---|---|---|
| [#40](https://github.com/kshitij0299/noddy/pull/40) | [#7](https://github.com/kshitij0299/noddy/issues/7) | [M1] Figma tokens (`--color-*`, `--space-N`, `--radius-*`, shadows, focus ring) light + dark, text-role classes (ROND 60 headings, Google Sans Code mono + glyph ref). Pixel-diff shows no regressions. | PASS (values checked against live Figma variables) |
| [#38](https://github.com/kshitij0299/noddy/pull/38) | [#15](https://github.com/kshitij0299/noddy/issues/15) | [M2] Per-glyph status store `editor.glyphStatus` (Empty…Failed, owner agent/user). Stored in localStorage per project, **not in the `.gs2` file** (see decision below). The agent can't change a Yours glyph without explicit consent. | PASS |
| [#39](https://github.com/kshitij0299/noddy/pull/39) | [#13](https://github.com/kshitij0299/noddy/issues/13) | [M2] GF Latin Kernel model (116 + .notdef, 62 letters & figures), apply-to-project, OTF export round-trip test | PASS |
| [#36](https://github.com/kshitij0299/noddy/pull/36) | [#9](https://github.com/kshitij0299/noddy/issues/9) | [M1] `itemChanged {id}` topic (agent commits, manual edits, undo/redo) + debounced redraw helper. No protected files touched. | PASS |
| [#35](https://github.com/kshitij0299/noddy/pull/35) | [#5](https://github.com/kshitij0299/noddy/issues/5) | [ARCHITECTURE.md](ARCHITECTURE.md): codebase map for builders | PASS |
| [#4](https://github.com/kshitij0299/noddy/pull/4) | [#3](https://github.com/kshitij0299/noddy/issues/3) | Test-only fix: the SVG import tests now run on Linux (62 tests were silently not loading) | PASS |
| [#2](https://github.com/kshitij0299/noddy/pull/2) | [#1](https://github.com/kshitij0299/noddy/issues/1) | The lockfile pointed 38 packages at private Azure feeds, so `npm ci` failed everywhere else. Now uses the public npm registry. | Orchestrator-verified tooling chore |

## Decisions made for you (please check)

- **Glyph status is not saved in the `.gs2` file yet.** The format has no place for extra data without a serialization change, which needs your approval. Status lives in the browser (localStorage, keyed by project id), so it doesn't travel with the file and undo doesn't revert it. The in-file proposal is [proposals/GLYPH-STATUS-IN-GS2.md](proposals/GLYPH-STATUS-IN-GS2.md); say yes and it becomes a protected-area PR.
- **Latin Kernel ranges:** the 95 ASCII characters stay one "Basic Latin" range and the 21 extra characters are single-codepoint ranges. Export includes exactly 116 + `.notdef`.

## Open PRs and why

- [#37](https://github.com/kshitij0299/noddy/pull/37) inspector undo (protected): QA running.
- App shell (#11), specimen card (#12) and Letters & figures grid (#14): in development.

## Known bugs / caveats

- [#41](https://github.com/kshitij0299/noddy/issues/41) (pre-existing, protected): after opening a project, undoing the *only* edit does nothing (`history.initialProject` holds the live project).
- Dark theme on the **old** pages: some header and nav text disappears because legacy tokens have no dark values. The new screens use the new tokens.
- **Build churn:** `npm run build` rewrites the tracked `dist/` folder and `src/app/app_config.json`. Agents revert these after every build and never commit them.
- **Branch cleanup:** this cloud session can't delete remote branches, so merged feature branches stay on GitHub.
- **Labels** were auto-created by GitHub (grey, no descriptions); names follow WORKFLOW.md.
- **`gh` CLI** isn't authenticated in the cloud session, so issues, PRs, comments and merges go through the GitHub connector under your account.

## How to run it

```bash
git switch dev && npm ci
npx vite serve ./src/ --port 5300   # app (npm run dev also works but flips app_config.json to dev mode)
npm run agent:serve                  # local model relay for the agent
npm run lint && npx vitest run && npm run build
```

## What's next

- Finish M1 (#8 undo, #10 safety) and M2 (#11 shell, #12 specimen, #14 grid), then M3 focus mode and M4 agent panel.
