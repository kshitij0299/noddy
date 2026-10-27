# Morning report: agentic build

## Local session 2026-10-26 (evening) — READ THIS FIRST

**Merged into `dev`:**
- [#96](https://github.com/kshitij0299/noddy/pull/96) Agent panel: chips (status/Model · Mode · Target) sit in a row above the composer, with chevrons on the ones that open a menu; the box holds only text, attach, send.
- [#99](https://github.com/kshitij0299/noddy/pull/99) Slim tool replies: only `get_context` carries the context; every other reply has `revision`; whole-set targets are a count; slim glyph summaries; a reply-size budget test.

**Token before/after (tool replies only, measured over MCP):**

| | Before (G–L, 6 glyphs) | After (M–Z, a–z, 0–9, 50 glyphs) |
|---|---|---|
| Tool calls | 46 | 249 |
| Reply tokens (text + images) | ~35.5k | ~34.5k |
| **Per glyph** | **~5.9k** | **~0.7k (≈8× less)** |
| apply_chaos / submit_glyph per call | ~850 / ~1,020 | ~53 / ~116 |

**Slash Gothic:** the owner's DotGothic16 remix, all 62 letters and figures, built live over MCP (A is the owner's; every other glyph carries the slash family; extras on about one in three). All are Drafts waiting for Keep. Renamed to "Slash Gothic" (DotGothic16 is a Fontworks trademark; the font stays OFL with its copyright notice). Saved: `tmp/projects/SlashGothic-62-done.gs2` plus the browser autosave. Owner rules learnt: add marks rather than reshape ("a lil" extra is fine); no wave/bulge/twist on pixel fonts; mirror and kick looked bad.

**Open:** [#98](https://github.com/kshitij0299/noddy/issues/98) jobs die with the MCP connection (bug 45). New bugs 42–51 in `SMOKE-TEST-BUGS.md` (stale server tool list, reload closes the project, Remix deck cycles and drifts off style, copied marks fail the outline check).

**Next (owner-approved order, 2026-10-28):**
1. **Don't lose work:** [#98](https://github.com/kshitij0299/noddy/issues/98) jobs survive reconnects (bugs 45, 51); reload keeps the open project (43); dev saves to `tmp/projects/` on disk, not only browser Restore (53).
2. **Remix deck:** always one card from the reference mark (47), no warps on pixel fonts (46), real seed variety (49), "add only" option (owner request), copied marks untangle (50).
3. **Chaos stacking:** [#103](https://github.com/kshitij0299/noddy/issues/103) apply effect on top of effect; Re-roll only the last (bug 54; overrides "takes never stack").
4. **History log UI:** [#104](https://github.com/kshitij0299/noddy/issues/104) list of every change (who, glyph, what, when), step back to any point; design first (bug 55).
5. **Small fixes batch:** 31, 39, 42, 52. Later: 36, then M8/M9 when unparked.
6. **Issue hygiene:** make `dev` the GitHub default branch so "Closes #N" works (owner OK needed for the setting); close issues already done (56 open, many merged, e.g. #95, #97) with PR links; flag stale ones; open issues for bug-log entries that lack one. Rule from then on: every real bug/feature gets an issue, `SMOKE-TEST-BUGS.md` links to it.
7. **Release:** PR `dev` → `main` as a release once the owner is happy (`main` is still Sep 12).

Folder cleanup 2026-10-27: the only clone is `font agent/noddy`; old branches archived (`archive/*`, tag `archive/pre-cleanup-2026-10-27`); GitHub repos `Glyphr-Studio-2` and `-Help` archived. `main` is still Sep 12 (dev is 83 commits ahead; fast-forward, offered as a release PR).

## Local session 2026-10-23 → 26 (owner + orchestrator on the laptop) — READ THIS FIRST

**Merged into `dev` (in order):**
- [#84](https://github.com/kshitij0299/noddy/pull/84) dev-only `.env.local` key: type `env` as the OpenRouter key on the dev server (free models only); per-step 5-min timeout.
- [#85](https://github.com/kshitij0299/noddy/pull/85) **Local agent:** Claude Code (or any MCP client) drives Noddy's tools over `/mcp` on the dev server; panel switch shows the `claude mcp add …` command. See `plans/LOCAL-AGENT-MCP.md`.
- [#86](https://github.com/kshitij0299/noddy/pull/86) **Tools fix:** `copy_paths`, `boolean_paths` (paper.js, lazy; `exclude` = the owner's graffiti cut), transform pivots, smarter outline gate with hints, optional fields optional, tools see the draft, built-in agent self-repairs invalid calls, 40-call cap.
- [#88](https://github.com/kshitij0299/noddy/pull/88) **Panel controls:** model / mode (Exact·Remix·Wild + chaos) / target chips, New chat, grid multi-pick, talk to Claude Code from the panel (`wait_for_user_message` / `reply_to_user`).
- [#90](https://github.com/kshitij0299/noddy/pull/90) **Chaos tools tab:** slash cut, glitch bands, warp, grid snap, Pixel Life; seeds, legibility guard, Apply as Drafts; `apply_chaos` tool. Owner rule: tab Apply on This/Selected may edit Yours and the open glyph; Whole set skips Yours; agents keep their locks. See `CHAOS-TOOLS.md`.
- [#92](https://github.com/kshitij0299/noddy/pull/92) **Remix mode v1:** `draw_cards` (tabu), `op_history` (regret), `describe_mark`, Telephone, novelty reject, seeds + Re-roll on receipts.
- Docs: #87, #89, #91, this report. Plan: `plans/AGENT-TOOLS-PANEL-REMIX.md`. Research: `research/remix-mode.md`. Bugs: `SMOKE-TEST-BUGS.md` (1–41, fixed ones marked).

**What the owner did and liked:** imported DotGothic16 (Google Fonts, OFL), drew a graffiti slash on A; Claude over MCP copied it to B–F, then made creative per-glyph versions (double tap, spark, reversed slash, speed lines, lightning). Saved projects: `tmp/projects/` (git-ignored) and the owner's Downloads (`DotGothic16 - Noddy Project - remix A-F.gs2`). Scripts: `tmp/noddy-mcp/`.

**Owner decisions:** agent panel = two tabs (Agent | Chaos); Chaos tab is algorithmic, the agent shares its engine; Remix/Wild modes should feel "cracked, creative, vibe-driven"; every control earns its place.

**Hard-won rules:**
- Subagents NEVER use the built-in browser pane (it is the owner's live workspace; one QA run wiped the owner's work). Headless Playwright only.
- Save the owner's open project (Export → Save project file, or to `tmp/projects/`) before any dev-server restart.
- Never read `.env.local`. The owner's dev server runs on 5300 from this folder (`npx vite serve ./src/ --port 5300 --strictPort`); never use 5187.
- Builders cost ~350–500k tokens, QA ~120–190k: keep briefs lean (full test suite once, quiet output, screenshots only where QA needs them).

**Parked:** M8 Ripple (#30–#33) and M9 Export (#34) are not started and parked by the owner, who is
building and testing by hand first. Do not start them unless asked; trigger prompts are in
`plans/RESUME-M8-M9.md`. M8 should reuse the new tools (`RIPPLE-SPEC.md` §8).

**Next:**
1. Live test Remix mode with the owner (Claude connected over MCP, DotGothic16 A → B–Z).
2. Open bugs worth doing next: 31 (Whole set needs an open glyph), 36 (whole-set Chaos is slow; progress + worker), 39 (8 renders per message cuts A–Z runs), 32–35, 37–38, 40–41.
3. Later ideas: Breed, Style DNA, Drop, Weld, Pixel Life polish (`research/remix-mode.md`).


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
- **M7 Runs: done** (PR #66): ask for a font → Plan card → gate 1 → the agent draws n o H O → "Approve the style" → the queue drafts the set in DESIGN-BRIEF order → receipt with Keep all / Retry; Keep and Revert per glyph; Pause / Stop; Esc, minimize and opening a glyph never stop a run. Milestone point `7c64dc5` (`m7-done`). Two QA rounds (provider errors and pause races, fixed).
- **Live run, no key:** a Sonnet 5.5 agent stood in for the model and drew n o H O, h and m through the real app. Screenshots on branch `qa/m7-live-run-shots` and in the PR #66 comment. The letters are a plain geometric sans; about 8 model steps per glyph, so a full set is ~1,000 steps.
- **Stopped after M7** as asked. M8 and M9 not started.

- **M3 Editor focus mode: done** (PR #57). Clicking a letter opens the Figma editor: close ×, prev/next pill, metric guides, floating tool pill, inspector card with Keep / Revert, live context strip. Milestone point `5f3ba04` (`m3-done`).
- **M4 Agent panel: done** (PR #60). Full-height right panel with minimize only, empty state, composer with attachments, minimized pill, model connect card, wired to the existing controller and relay. **The old Codex floating window and welcome composer are deleted.** Milestone point `f020e18` (`m4-done`).
- **Stopped after M4** as asked. M5–M9 not started.

- **M1 Foundations: done** (tokens, inspector undo fix, `itemChanged`, the not-autosaving chip and leave-page warning). Milestone point: `3de97d3` (`m1-done`).
- **M2 Workspace: done** (app shell, specimen card + Workspace page, character set, Letters & figures grid, status store). Milestone point: `f6939d7` (`m2-done`; see caveat on tags).
- **M4 Agent panel:** the message cards are done; the panel itself (#19–#21) isn't started.
- **Four undo bugs fixed** (all protected areas). Three were pre-existing; #52 surfaced once the new top bar put Undo on every page., plus two tooling fixes that let the project install and test on Linux.
- Every PR went issue → developer agent → QA agent → fixes → re-QA → squash-merge into `dev`. QA failed six rounds across five PRs, and each failure was fixed before merge.
- `dev` checks after the last merge: lint 0 errors, **63 test files / 1121 tests pass**, build passes, agent relay 29/29.

## Local session 2026-10-22 → 23 (owner + orchestrator on the laptop)

**Merged into `dev`:**
- [#70](https://github.com/kshitij0299/noddy/pull/70) Anthropic provider
- [#77](https://github.com/kshitij0299/noddy/pull/77) live model list with models.dev badges
- [#81](https://github.com/kshitij0299/noddy/pull/81) segmented pill hover fix, one shared component
- [#83](https://github.com/kshitij0299/noddy/pull/83) connect flow: provider → key → model
  - **OpenRouter** added and recommended.
  - Supported-only model list, free first (rules in `src/agent/model-requirements.js`).
  - Errors carry a status code and a fix.
  - Zen now uses the `/inference` routes.

Superseded and closed: #78, #79.

**Zen caveat:** Zen's free models return `403 FreeTierError` ("free tier only from within OpenCode") to third-party apps. Use OpenRouter free models to test Noddy.

**Owner smoke test, not done yet:** OpenRouter with a real key in the app. Open localhost:5300 → Examples → Oblegg → agent panel → OpenRouter → key → free model → open `n` → small ask → expect a Draft and a receipt.

**Open UX issues from the stand-in test:**
- [#71](https://github.com/kshitij0299/noddy/issues/71) "same style as my a" → whole-font plan with no cancel
- [#72](https://github.com/kshitij0299/noddy/issues/72) "Open a glyph first" on Workspace
- [#73](https://github.com/kshitij0299/noddy/issues/73) 8-tool-call cap
- [#74](https://github.com/kshitij0299/noddy/issues/74) truncated refusals
- [#75](https://github.com/kshitij0299/noddy/issues/75) error bubble not announced

**Parked (owner asked):** a dev-only `.env.local` key option for agent live tests (free models only). The owner already created `.env.local` (git-ignored locally) with an OpenRouter key. Never read or print it.

**Cost rules:** see WORKFLOW.md "Cost discipline" (QA tiers, Opus medium for code, Sonnet medium for read-only, no Fable).

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
| [#66](https://github.com/kshitij0299/noddy/pull/66) | [#28](https://github.com/kshitij0299/noddy/issues/28), refs [#29](https://github.com/kshitij0299/noddy/issues/29) | [M7] Runs: plan, style gate, queue, review (Keep / Keep all / Revert / Retry), pill states, Before-run checkpoint. Run-scoped Cmd+Z split out to #67 (protected). |
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

## What the agent still can't do

- **Run-scoped undo** ([#67](https://github.com/kshitij0299/noddy/issues/67), protected): during a run, Cmd+Z undoes the newest entry, which is usually the last agent glyph. PRODUCT.md wants it to undo only your own change.
- **See its own draft mid-job** ([#68](https://github.com/kshitij0299/noddy/issues/68)): render/check tools read the committed project, so the model draws blind until submit.
- Plan and spec are proposed locally from the project metrics; the model only draws. Spend is an estimate. No resume after reload. No disconnect/model-change control in the panel.

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
- **Milestone tags:** the cloud proxy rejects tag pushes. To create them yourself: `git tag m1-done 3de97d3 && git tag m2-done f6939d7 && git tag m3-done 5f3ba04 && git tag m4-done f020e18 && git tag m5-done 5addc8b && git tag m6-done 126746a && git tag m7-done 7c64dc5 && git push origin m1-done m2-done m3-done m4-done m5-done m6-done m7-done`.
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
