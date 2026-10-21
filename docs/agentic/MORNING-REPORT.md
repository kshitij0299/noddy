# Morning report: agentic build

_Run 1: 2026-10-20 21:45 → ~22:30 UTC (stopped at the session usage limit). Run 2: 2026-10-21 07:42 → 09:40 UTC (your 2-hour window, see [BUDGET.md](BUDGET.md))._

## TL;DR

- **M1 Foundations:** 3 of 4 done (tokens, inspector undo fix, `itemChanged`). The fourth, safety indicator #10, isn't started.
- **M2 Workspace: done** (app shell, specimen card + Workspace page, character set, Letters & figures grid, status store). Tagged `m2-done`.
- **M4 Agent panel:** the message cards are done; the panel itself (#19–#21) isn't started.
- **Two pre-existing undo bugs fixed** (both protected areas), plus two tooling fixes that let the project install and test on Linux.
- Every PR went issue → developer agent → QA agent → fixes → re-QA → squash-merge into `dev`. QA failed six rounds across five PRs, and each failure was fixed before merge.
- `dev` checks after the last merge: lint 0 errors, **52 test files / 891 tests pass**, build passes.

## Protected-area PRs to review first

All merged after QA PASS with adversarial undo/history tests. Each is a small, separately revertable squash commit.

| PR | What | Files |
|---|---|---|
| [#37](https://github.com/kshitij0299/noddy/pull/37) | Numeric inspector edits now create one undo step each (per `docs/agent/INSPECTOR-UNDO-PROPOSAL.md`). One existing agent test was reordered because it only passed due to the bug. | `src/panels/cards.js` |
| [#46](https://github.com/kshitij0299/noddy/pull/46) | Fixes [#41](https://github.com/kshitij0299/noddy/issues/41): undoing the first edit after opening a project did nothing. The initial history state is now a real snapshot. The first QA round caught a crash on glyphs created after load, fixed before merge. | `src/project_editor/project_editor.js` |
| [#48](https://github.com/kshitij0299/noddy/pull/48) | Fixes [#44](https://github.com/kshitij0299/noddy/issues/44): after undo, typing in the inspector edited a stale copy of the glyph | `src/project_editor/history.js` |
| [#4](https://github.com/kshitij0299/noddy/pull/4) | Test-only: SVG import tests now load on Linux (fixture filename case) | `src/formats_io/…/svg_outline.test.js` |

No `.gs2` serialization changes were made.

## Merged into `dev`

| PR | Issue | What |
|---|---|---|
| [#42](https://github.com/kshitij0299/noddy/pull/42) | [#11](https://github.com/kshitij0299/noddy/issues/11) | [M2] App shell: 56px top bar (mark → Back to start, editable font name, `n/116` ring, undo, redo, theme, Export menu), persistent 384px agent panel slot, responsive tiers. Passed QA on the third round: undo enable, file actions, start-screen layout and keyboard menu were fixed first. |
| [#47](https://github.com/kshitij0299/noddy/pull/47) | [#14](https://github.com/kshitij0299/noddy/issues/14) | [M2] Letters & figures grid: `62 · All 116` switch, legend counts, status marks (shape + colour + label), keyboard nav (arrows wrap, Home/End, Enter opens), live tile refresh. 13 / 10 / 6 columns by width. |
| [#45](https://github.com/kshitij0299/noddy/pull/45) | [#22](https://github.com/kshitij0299/noddy/issues/22) | [M4] Agent message cards: Plan, Approve-the-style (n o H O from your outlines), Receipt ("22 new · 1 failed", Keep / Retry), step lines. Presentational only; the panel wires them later. |
| [#43](https://github.com/kshitij0299/noddy/pull/43) | [#12](https://github.com/kshitij0299/noddy/issues/12) | [M2] Specimen card (Text / Spacing / Waterfall, size slider, dashed ghosts for missing letters) and a new **Workspace** page, now the default page after opening a project |
| [#40](https://github.com/kshitij0299/noddy/pull/40) | [#7](https://github.com/kshitij0299/noddy/issues/7) | [M1] Figma tokens (light + dark) and text roles. QA checked the values against your live Figma variables; there are no visual regressions. |
| [#39](https://github.com/kshitij0299/noddy/pull/39) | [#13](https://github.com/kshitij0299/noddy/issues/13) | [M2] GF Latin Kernel model (116 + .notdef), with an export round-trip test |
| [#38](https://github.com/kshitij0299/noddy/pull/38) | [#15](https://github.com/kshitij0299/noddy/issues/15) | [M2] Per-glyph status store; the agent can't change a Yours glyph without consent |
| [#36](https://github.com/kshitij0299/noddy/pull/36) | [#9](https://github.com/kshitij0299/noddy/issues/9) | [M1] `itemChanged {id}` topic + debounced redraw helper |
| [#35](https://github.com/kshitij0299/noddy/pull/35) | [#5](https://github.com/kshitij0299/noddy/issues/5) | [ARCHITECTURE.md](ARCHITECTURE.md), the codebase map for builders |
| [#2](https://github.com/kshitij0299/noddy/pull/2) | [#1](https://github.com/kshitij0299/noddy/issues/1) | `npm ci` was failing: the lockfile pointed at private Azure feeds |

## Decisions made for you (please check)

1. **Glyph status isn't saved in the `.gs2` file.** Saving it there needs a format change, which needs your approval. For now it lives in the browser (per project), so it doesn't travel with the file and undo doesn't revert it. The proposal is [proposals/GLYPH-STATUS-IN-GS2.md](proposals/GLYPH-STATUS-IN-GS2.md).
2. **File actions in the new top bar (#42).** The UX note forbids a project menu, so:
   - the **Export** button opens a small menu: Save project, Save a copy, each export format;
   - clicking the **Noddy mark** goes "Back to start" to open or import another project, asking first if there are unsaved changes.
3. **Latin Kernel ranges:** ASCII stays one Basic Latin range and the 21 extra characters are single-codepoint ranges. Export contains exactly 116 + `.notdef`.
4. **Workspace is the default page** after a project opens. The old pages are still reachable from the page menu until later milestones replace them.

## Open PRs and why

- _Being finished in the last hour: [#10](https://github.com/kshitij0299/noddy/issues/10) safety indicator and [#49](https://github.com/kshitij0299/noddy/issues/49) keyboard undo on Workspace (see final status below)._

## Known bugs / caveats

- [#49](https://github.com/kshitij0299/noddy/issues/49): Ctrl/Cmd+Z does nothing on the Workspace page; the top bar Undo button works. Pre-existing and protected (keyboard shortcuts).
- Dark theme on the **old** pages hides some header and nav text, because legacy tokens have no dark values. The new screens are fine.
- Specimen Waterfall mode ignores the size slider (QA nit).
- **Build churn:** `npm run build` rewrites the tracked `dist/` folder and `src/app/app_config.json`. Never commit those.
- Merged feature branches stay on GitHub, because this cloud session can't delete remote branches.
- Labels were auto-created by GitHub (grey, no descriptions).

## Models used

- **Orchestrator:** Opus 5.5, medium effort.
- **Subagents:** Opus 5.5 (medium) for undo/history and engine work; Fable 5.1 (medium) for UI, UX notes and QA; Sonnet 5.5 (medium) for one small investigation. No Fable "high" runs.

## How to run it

```bash
git switch dev && npm ci
npx vite serve ./src/ --port 5300   # open http://localhost:5300, then New or Examples
npm run agent:serve                  # local model relay for the agent
npm run lint && npx vitest run && npm run build
```

## What's next (in order)

2. [#10](https://github.com/kshitij0299/noddy/issues/10) Safety indicator: mounts in the shell's status slot `#top-bar-status`.
3. **M3 Editor focus mode:** [#16](https://github.com/kshitij0299/noddy/issues/16), [#17](https://github.com/kshitij0299/noddy/issues/17), [#18](https://github.com/kshitij0299/noddy/issues/18). The grid's `openGlyph(id)` in `src/controls/glyph-grid/glyph-grid.js` is the one hook to replace.
4. **M4 Agent panel:** [#19](https://github.com/kshitij0299/noddy/issues/19), [#20](https://github.com/kshitij0299/noddy/issues/20), [#21](https://github.com/kshitij0299/noddy/issues/21). Mount with `mountAgentPanel()` and render the merged cards from `src/agent/ui/cards/`. #21 removes the old Codex window.
5. [#49](https://github.com/kshitij0299/noddy/issues/49) keyboard undo on Workspace (protected).
6. M5–M9 (issues #23–#34 are written and labelled).

UX notes are already posted on #11, #12, #14, #16–#22.
