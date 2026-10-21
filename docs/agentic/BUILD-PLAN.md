# Build plan

## How to use this plan

- Build **one milestone at a time, in order**. Each bullet is one GitHub issue; **one PR per milestone** (WORKFLOW.md "PR size"), with one commit per bullet so it stays reviewable and revertable. Protected-area (P) changes still get their own PR.
- The integration branch is `dev`. `main` stays the stable pre-agent app.
- The design source is the Figma screens (see [FIGMA.md](FIGMA.md)): `figma/screens/flow-NN.png` and `ripple-NN.png`.
- Every UI issue names the screen it implements.
- Codes: **(P)** touches a protected area (AGENTS.md §3); see WORKFLOW.md for the rules. **(D)** design or UX work for the UI agent first.

## M1 Foundations

1. **Tokens and type roles from Figma.**
   - Add the `Noddy/Color` semantic tokens (light/dark), space/radius tokens and text roles (Display/Title/Heading ROND 60, Body, Label, Meta, Mono, Glyph ref) to `src/common/colors.css` and `resets.css`, with names matching the Figma code syntax.
   - No visual regressions on existing pages.
2. **(P) Inspector numeric undo fix.** Apply `docs/agent/INSPECTOR-UNDO-PROPOSAL.md` together with its regression test.
3. **`itemChanged{id}` topic.**
   - Emitted by agent commits, manual edits and undo/redo.
   - Glyph tiles re-fetch their glyph by ID.
   - Debounced redraw helper.
   - Tests.
4. **Safety.** A "Not autosaving" indicator and a leave-page warning while unsaved work or an agent run exists.

## M2 Workspace shell (Flow 02/05) (D)

1. **App shell for an open project.**
   - Top bar: mark, editable font name, set progress ring `n/116`, undo, redo, theme, Export.
   - Two-column workspace: left column plus the right agent panel slot.
   - Responsive tiers are documented in the PR.
2. **Specimen card**, 240 tall.
   - Live text rendered from the project's glyphs, with missing glyphs drawn as dashed ghosts of correct height (cap / x-height / descender).
   - Mode pill: Text / Spacing / Waterfall. Size slider.
3. **Character set model** for GF Latin Kernel (116 + .notdef).
   - Stored as single-codepoint custom ranges so export includes all of them.
   - Export round-trip test.
4. **Letters & figures grid.**
   - GlyphTile with statuses (Empty/Queued/Drafting/Draft/Kept/Yours/Failed), shape + colour.
   - Legend counts. "62 · All 116" switch.
   - Keyboard navigation (arrows, Enter opens). Selected state.
5. **Glyph status store.** Per-glyph status + owner (agent/user), persisted in the project in a backward-compatible way (no `.gs2` breakage; **(P)** if serialization changes, propose first).

## M3 Editor focus mode (Flow 06) (D)

1. **Open a glyph in focus mode**, reusing the existing edit canvas and tools. **(P)** if canvas hosting changes.
   - Header: close (Esc) on the left, prev/next pill.
   - Metric guides with labels, side-bearing lines.
2. **Floating tool pill** (select, pen, add point, rectangle, oval, hand) mapped to the real tools, plus the **inspector card** (advance / left / right in mono fields; Keep / Revert for drafts).
3. **Context strip** ("nnann ooaoo") rendered live under the canvas. Closing marks the glyph Yours only if the outline changed.

## M4 Agent panel (Flow 02–05, 07) (D)

1. **Full-height right agent panel.**
   - Header: mark, "Agent", model chip, status dot, **minimize only**.
   - Thread anchored at the bottom. Composer with attachments.
2. **Minimized pill:** Idle / Running (progress) / Needs you / Paused. Minimizing never stops a run.
3. **Wiring.**
   - Connect the existing controller/relay (`src/agent/agent-controller.js`, `server/agent/*`) to the new panel.
   - Remove the Codex floating window and welcome composer UI.
   - Model connect card (provider, model, key in memory, Check connection).
4. **Message cards:** Plan card, Approval card (n o H O, Approve/Tweak/Edit by hand), Receipt strip ("22 new · 1 failed"), step lines.

## M5 Start (Flow 01)

_Read [UI-RESET.md](UI-RESET.md) first: every start lands on the Workspace, there is no page menu, and the old pages are hidden behind `?legacy`._

1. **New font screen:** wordmark, name field, set chip, three starts (Start with agent / Draw myself / From a font file). "Draw myself" opens the Workspace with the empty set.
2. **From a font file:** import, then subset to Latin Kernel with a licence note. This reuses the existing import.

## M6 Agent tools v2 (see research/synthesis.md §5)

1. Read tools: `get_font_spec`, `get_set_status`, `render_glyphs` / `render_text` (PNG for vision), `check_outlines`.
2. **(P)** Atomic per-glyph writes:
   - `create_glyph`, `begin_glyph` / `submit_glyph` (one history entry per glyph job)
   - `replace_paths` / `delete_paths`
   - extended `transform_paths`
   - `add_svg_path`
3. **Ownership lock.** The agent skips glyphs that are Yours or open in the editor. Take over / Hand to agent. Mutation log.

## M7 Runs (Flow 03, 04, 05, 07)

1. **Plan + spec proposal → Approve the style gate (n o H O) → queue.**
   - Pause / Stop (inline confirm) / progress.
   - Drafts land as Draft.
2. **Review:** Keep, Keep all per group (excludes failed and Yours), Revert, Retry.
   - "Before run" checkpoint.
   - Cmd+Z during a run only undoes the user's own edits.

## M8 Ripple v1 (Ripple R1–R8, [RIPPLE-SPEC.md](RIPPLE-SPEC.md))

1. **EditTracker** (baseline when a glyph is opened; diff when it is left) + `get_glyph_edit`.
2. **Noticed pill** → "What I see" card (diff overlay + chips) → Not quite (alternatives / Point at it).
3. **Pick:** kin table, ghost previews, Subtle/Same/Wild, include-Yours consent.
4. **(P)** `plan_ripple` / `commit_ripple` (one undo for the whole ripple), Drafts landed card, Keep all / Revert all. Notices On / Quiet / Off.

## M9 Export (Flow 08)

1. **Export preflight sheet:** coverage ring, checks, "Keep N & export OTF", "Export with drafts".

## Definition of done (every PR)

- `npm run lint` passes with 0 errors.
- `npx vitest run` passes in full.
- `npm run build` passes.
- `npm run test:agent-relay` passes when agent code changed.
- New behaviour has tests: unit tests (jsdom) for logic and DOM; regression tests for anything near undo/history.
- UI PRs carry screenshots, from a headless browser if one is available, next to the Figma reference, plus the UX edge cases checked.
- QA agent sign-off is a comment on the PR.
- No secrets or keys in code or logs. No new runtime dependency without a reason stated in the PR.
