# Morning report: agentic build

_Run 1: 2026-10-20 21:45 → ~22:30 UTC (stopped at the session usage limit). Run 2: 07:42 → 09:40 UTC (2-hour window). Run 3: 11:31 → 13:05 UTC (M3 and M4, then stop as the owner asked). See [BUDGET.md](BUDGET.md)._

## UI reset (local, 2026-10-21, after the run)

The owner opened the M1–M4 build and found UI drift, then approved a one-PR reset: `feat/ui-reset` into `dev`. Read [UI-RESET.md](UI-RESET.md) before M5. In short:

- **One page.** No "PAGE" menu; the old Glyphr Studio pages are hidden behind `?legacy` (`src/app/legacy_pages.js`, guard in `Navigator.navigate()`). Kerning, ligatures, components, metrics, settings: agent tools, never pages.
- **Specimen card:** pill and slider in a header row above the glyphs; pangram default at 72 px/em; Text mode wraps by words; the card grows from 240 px to half the window, then steps the size down.
- **Focus mode:** context strip highlights only the middle slot of each group; inspector fields have no stepper arrows (`hide-arrows`), Keep/Revert match the 36 px fields.
- **Shell:** the compact-tier "Panel" button is gone (the pill does that job); token-coloured thin scrollbars; one scroll container.
- **Skills:** `design-taste-frontend` (TASTE) and `refactoring-ui` vendored into `.claude/skills/`; `responsive-design` allowed again. Roles load them (WORKFLOW.md).
- **Process:** one PR per milestone; the developer checks the browser before the PR; QA capped at two rounds (WORKFLOW.md "PR size").

## TL;DR

- **M5 Start screen: done** (PR #62): the flow-01 start screen (name, set chip, Start with agent / Draw myself / From a font file) and font-file import subsetted to the Kernel with a licence note. Milestone point `5addc8b` (`m5-done`). Two QA rounds.
- **M6 Agent tools v2: done.** PR #64: read tools (`get_font_spec`, `get_set_status`, `render_glyphs`, `render_text`, `check_outlines`, `get_mutation_log`), ownership lock (agent can't touch Yours or the open glyph; Take over / Hand to agent), mutation log. PR #65 (protected: undo behaviour): atomic per-glyph writes, one history entry per job, Draft status. Milestone point `126746a` (`m6-done`).
- **M7 Runs in progress:** plan → approve the style → queue → review.

- **M3 Editor focus mode: done** (PR #57). Clicking a letter opens the Figma editor: close ×, prev/next pill, metric guides, floating tool pill, inspector card with Keep / Revert, live context strip. Milestone point `5f3ba04` (`m3-done`).
- **M4 Agent panel: done** (PR #60). Full-height right panel with minimize only, empty state, composer with attachments, minimized pill, model connect card, wired to the existing controller and relay. **The old Codex floating window and welcome composer are deleted.** Milestone point `f020e18` (`m4-done`).
- **Stopped after M4** as asked. M5–M9 not started.

- **M1 Foundations: done** (tokens, inspector undo fix, `itemChanged`, the not-autosaving chip and leave-page warning). Milestone point: `3de97d3` (`m1-done`).
- **M2 Workspace: done** (app shell, specimen card + Workspace page, character set, Letters & figures grid, status store). Milestone point: `f6939d7` (`m2-done`; see caveat on tags).
- **M4 Agent panel:** the message cards are done; the panel itself (#19–#21) isn't started.
- **Four undo bugs fixed** (all protected areas). Three were pre-existing; #52 surfaced once the new top bar put Undo on every page., plus two tooling fixes that let the project install and test on Linux.
- Every PR went issue → developer agent → QA agent → fixes → re-QA → squash-merge into `dev`. QA failed six rounds across five PRs, and each failure was fixed before merge.
- `dev` checks after the last merge: lint 0 errors, **57 test files / 982 tests pass**, build passes, agent relay 22/22.

## Protected-area PRs to review first

All merged after QA PASS with adversarial undo/history tests. Each is a small, separately revertable squash commit.

| PR | What | Files |
|---|---|---|
| [#37](https://github.com/kshitij0299/noddy/pull/37) | Numeric inspector edits now create one undo step each (per `docs/agent/INSPECTOR-UNDO-PROPOSAL.md`). One existing agent test was reordered because it only passed due to the bug. | `src/panels/cards.js` |
| [#46](https://github.com/kshitij0299/noddy/pull/46) | Fixes [#41](https://github.com/kshitij0299/noddy/issues/41): undoing the first edit after opening a project did nothing. The initial history state is now a real snapshot. The first QA round caught a crash on glyphs created after load, fixed before merge. | `src/project_editor/project_editor.js` |
| [#48](https://github.com/kshitij0299/noddy/pull/48) | Fixes [#44](https://github.com/kshitij0299/noddy/issues/44): after undo, typing in the inspector edited a stale copy of the glyph | `src/project_editor/history.js` |
| [#53](https://github.com/kshitij0299/noddy/pull/53) | Fixes [#52](https://github.com/kshitij0299/noddy/issues/52): on the Workspace page (no glyph selected), Undo/Redo used the history entry up without changing the glyph. They now restore the glyph the entry recorded. Editing pages behave as before. | `src/project_editor/history.js` |
| [#51](https://github.com/kshitij0299/noddy/pull/51) | Fixes [#49](https://github.com/kshitij0299/noddy/issues/49): Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z and Ctrl+Y now work on the Workspace page. Typing in the font-name field keeps normal text undo. Side effect: Ctrl+S/E/G/O also work there. | `src/edit_canvas/events_keyboard.js`, `src/pages/workspace.js` |
| [#65](https://github.com/kshitij0299/noddy/pull/65) | [M6] Atomic agent writes: `create_glyph`, `begin_glyph`/`submit_glyph`, `replace_paths`, `delete_paths`, extended `transform_paths`, `add_svg_path`. One job = one undo step; failed submits leave history unchanged. No protected file edited; counted as protected because undo behaviour changes. QA ran 14 adversarial undo tests, all pass. | `src/agent/*` only |
| [#4](https://github.com/kshitij0299/noddy/pull/4) | Test-only: SVG import tests now load on Linux (fixture filename case) | `src/formats_io/…/svg_outline.test.js` |

No `.gs2` serialization changes were made.

## Merged into `dev`

| PR | Issue | What |
|---|---|---|
| [#60](https://github.com/kshitij0299/noddy/pull/60) | [#19](https://github.com/kshitij0299/noddy/issues/19) [#20](https://github.com/kshitij0299/noddy/issues/20) [#21](https://github.com/kshitij0299/noddy/issues/21) | [M4] Agent panel, minimized pill, controller wiring, model connect card; Codex UI removed. Two QA rounds (pill overlapped the grid; old pages' zoom controls sat under the panel). |
| [#57](https://github.com/kshitij0299/noddy/pull/57) | [#16](https://github.com/kshitij0299/noddy/issues/16) [#17](https://github.com/kshitij0299/noddy/issues/17) [#18](https://github.com/kshitij0299/noddy/issues/18) | [M3] Focus mode editor. Three QA rounds (legacy button styles, keyboard tab trap, zoom reset on prev/next, modifier keys swallowed). No protected files: it is the Characters page with new chrome around the unchanged canvas. |
| [#56](https://github.com/kshitij0299/noddy/pull/56) | — | Wire the shared skills you pushed into the developer and QA roles |
| [#55](https://github.com/kshitij0299/noddy/pull/55) | — | Model roles, combined PRs, CAVEMAN.md |
| [#64](https://github.com/kshitij0299/noddy/pull/64) | [#25](https://github.com/kshitij0299/noddy/issues/25) [#27](https://github.com/kshitij0299/noddy/issues/27) | [M6] Read tools, ownership lock, mutation log. Two QA rounds (a result-field collision and Take over not cancelling writes, both fixed). |
| [#62](https://github.com/kshitij0299/noddy/pull/62) | [#23](https://github.com/kshitij0299/noddy/issues/23) [#24](https://github.com/kshitij0299/noddy/issues/24) | [M5] Start screen and start from a font file. Two QA rounds. |
| [#50](https://github.com/kshitij0299/noddy/pull/50) | [#10](https://github.com/kshitij0299/noddy/issues/10) | [M1] "Not autosaving" chip in the top bar (only when autosave is off and there are unsaved changes), plus a leave-page warning when there are unsaved changes or an agent run is active. Owner note: if you turned off "stop page navigation", nothing warns, not even during a run. |
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

- None. Every PR opened in this run is merged. Nothing is half-done, and no agent is still running.

## Not yet real in the agent panel (M7 wires them)

- Plan **Start / Adjust**, **Approve the style** and **Keep** show a "coming in M7" step line. Retry, Tweak and Edit by hand work.
- Pill progress `n/N` and the Paused state wait for the M7 queue; a live run shows "Drafting a" with a spinner.
- No disconnect or model-change control (the model chip is not a button per the UX note).
- Opening an attached font as a project was dropped from the old composer.

## Small things to decide when you look at it

- M6: a Send from the focus editor lifts the open-glyph lock for that one request (otherwise every edit from there would fail). Yours stays locked.
- M5: imported glyphs default to **Kept**; you may prefer Yours. The font keeps its own name, not the typed one. Card says "OTF, TTF or SVG" (no UFO importer). Ligatures are dropped on import. Fonts opened via Open a file / drag-drop skip the Kernel subset and licence note (only the "From a font file" card does them).

- Inspector fields still show number-input spinner arrows (hiding them changes a shared control).
- In the context strip every copy of the current glyph is peach; Figma could be read as only one.
- Revert in the inspector is disabled: the status store keeps no pre-draft snapshot yet.
- Phone read-only editor mode needs a protected canvas change; left for its own PR.

## Known bugs / caveats

- [#63](https://github.com/kshitij0299/noddy/issues/63): `validate_file_input` keeps the previous pick's result (protected; worked around in the start screen).
- [#58](https://github.com/kshitij0299/noddy/issues/58): pen tool click-only points add no undo entry (pre-existing, protected).
- [#59](https://github.com/kshitij0299/noddy/issues/59): undo after switching glyphs leaves a stray path (pre-existing, protected).
- Keyboard Tab is cancelled by the canvas (protected); focus mode moves Tab itself, the old Characters page still traps it.

- [#54](https://github.com/kshitij0299/noddy/issues/54): after a width-only undo, the grid tile keeps the old width until the next redraw. The specimen card is fine. Low severity, cosmetic.
- Renaming the font in the top bar doesn't add an undo step (QA note on #50).
- Dark theme on the **old** pages hides some header and nav text, because legacy tokens have no dark values. The new screens are fine.
- Specimen Waterfall mode ignores the size slider (QA nit).
- **Build churn:** `npm run build` rewrites the tracked `dist/` folder and `src/app/app_config.json`. Never commit those.
- Merged feature branches stay on GitHub, because this cloud session can't delete remote branches.
- **Milestone tags:** the cloud proxy rejects tag pushes. To create them yourself: `git tag m1-done 3de97d3 && git tag m2-done f6939d7 && git tag m3-done 5f3ba04 && git tag m4-done f020e18 && git tag m5-done 5addc8b && git tag m6-done 126746a && git push origin m1-done m2-done m3-done m4-done m5-done m6-done`.
- Labels were auto-created by GitHub (grey, no descriptions).

## Models used

- Runs 1–2: orchestrator Opus 5.5; developers Opus (engine) and Fable (UI); QA Fable; one Sonnet investigation.
- Run 3 (M3, M4): orchestrator Fable 5.1; developer and QA Opus 5.5; see [WORKFLOW.md](WORKFLOW.md) roles table. All medium effort.
- **Caveman** (terse agent reports, read less): in place since run 3. Measured effect so far is small. The M3 developer used 274k tokens on its first pass vs ~242k for the comparable M2 shell developer; QA rounds, not report prose, are what cost tokens (M3 took three rounds, M4 two).

## How to run it

```bash
git switch dev && npm ci
npx vite serve ./src/ --port 5300   # open http://localhost:5300, then New or Examples
npm run agent:serve                  # local model relay for the agent
npm run lint && npx vitest run && npm run build
```

## What's next (in order)

0. **Merge `feat/ui-reset`** (owner reviews on port 5300), then start M5 with [UI-RESET.md](UI-RESET.md) read.
1. **M5 Start screen:** [#23](https://github.com/kshitij0299/noddy/issues/23), [#24](https://github.com/kshitij0299/noddy/issues/24). Every start lands on the Workspace; no page menu.
2. **M6 Agent tools v2:** [#25](https://github.com/kshitij0299/noddy/issues/25), [#26](https://github.com/kshitij0299/noddy/issues/26) (protected), [#27](https://github.com/kshitij0299/noddy/issues/27).
3. **M7 Runs:** [#28](https://github.com/kshitij0299/noddy/issues/28), [#29](https://github.com/kshitij0299/noddy/issues/29). This is what makes the panel's Plan / Approve / Keep buttons real.
4. **M8 Ripple** (#30–#33) and **M9 Export** (#34).
5. Small fixes: [#54](https://github.com/kshitij0299/noddy/issues/54), [#58](https://github.com/kshitij0299/noddy/issues/58), [#59](https://github.com/kshitij0299/noddy/issues/59).

UX notes are already posted on #11, #12, #14, #16–#22.
