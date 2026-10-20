## Over-promises against the engine

1. **The main bet is untested.** The prototype shows finished OFL-sans outlines as "agent drafts", but no real model call has been made yet (M2). Nobody has seen a model draw an acceptable `n` with bezier tools. If it can't, the screen of 117 ghost cells is selling something that doesn't exist.
   **Fix:** add an **M0 drawing spike** before the prototype is signed off. Use the existing `add_paths` on n o H O, try two models, and record tokens, time and quality. Build the prototype's drafts from the spike's real output, or draw them deliberately rough. Label every estimate "uncalibrated" until then.
2. **Per-glyph Cmd+Z and "Revert glyph" can't work on the current history.** Agent commits store whole-project snapshots (`native-tools.js:208-225` → `addWholeProjectChangePre/PostState`). Restoring one of them rolls back every glyph changed after it. A per-item history would mean rewriting `history.js`, which is protected, and no milestone covers that.
   **Fix:** list it as its own protected milestone with tests. For v1, implement Revert as a new forward commit built from the stored revision, and let editor Cmd+Z undo only the entries made in that editor session.
3. **The in-place editor won't fit.** At 1280×800, subtract the header (48), spec bar (40), proof band (about 160) and agent pane (420). That leaves roughly 860×550 for the grid box. The existing panels are a fixed 450px (R6), so the canvas gets about 400px, and less still at 1024.
   **Fix:** show the measured box in the prototype. Cap the inspector at 240px or less and let it collapse to icons. When the editor opens, swap the proof band to the one-line Follow line (a fixed-height swap, not a reflow).
4. **Kernel's extra characters are dropped at export.** `populateExportList` (`font_export.js` ~555) exports only glyphs that sit in enabled `characterRanges`. Kernel's 21 non-ASCII characters live in five other Unicode blocks. Separately, `.notdef` is generated from `glyph-0x0` and no range lists it.
   **Fix:** M3 writes single-codepoint custom ranges, which uses an existing feature with no schema change, and adds an export round-trip test. Say how the `.notdef` cell maps to `glyph-0x0`.
5. **The spec bar's inline edits hide big operations.**
   - Changing UPM means rescaling every glyph.
   - Changing x-height moves only the guides, and "Rescale" on 31 drafts squashes the stems.
   - `settings.font` writes have no history at all today (`pages/settings.js:99-104`).

   **Fix:** make UPM read-only in v1, or open a dialog for it. Change the conflict card to "Keep · Undo change · Redraw drafts (agent job, estimate)".
6. **Two promised features have no milestone.** Nothing in `src/` renders a reference image under the canvas, which the Underlay needs. Crop-to-character mapping plus sending each image only to its own jobs is a controller change. Screens 3 and 7 promise both. **Fix:** give them a milestone (M10) or remove them from the prototype.

## Contradictions

7. **"Ask agent about this" clashes with the lock.** It runs while the editor is open, but an open glyph is Yours and the agent can't commit to it. **Fix:** add an explicit hand-off. "Hand to agent" makes the editor read-only with "Agent editing · Take back". Or the agent returns an overlay with an Apply button.
8. **The edge-case doc still says Basic Latin with 96 cells**, and puts Kernel at P2 "because accents need components". Kernel has no accented letters. I checked the synthesis table against `googlefonts/glyphsets` `GF_Latin_Kernel.nam`: 116 codepoints, and it matches. The counts in the picker are also inconsistent: "95" leaves out `.notdef` but "117" includes it. **Fix:** update the doc, and show character counts (95 / 116) with `.notdef` listed separately.
9. **The status words differ between the two docs.** One says Drafted / Needs review / Approved, the other Agent draft / Kept. States like Needs retry, Incomplete, outline-check failure, drift outlier, Outside set and "Uses component" appear in neither cell spec. Labels like "Queued #104" and "Failed (reason)" won't fit in a 72px cell. **Fix:** one primary status of 8 characters or fewer, plus one icon tag, with a precedence rule. Put reasons in the tooltip or inspector, and give the filters every primary status.
10. **"Yours" is too sticky.** A single nudge excludes a glyph forever, including from the spacing pass. **Fix:** track outline ownership separately from spacing. Count a glyph as changed only if its geometry differs from the revision it had when opened.
11. **Global Cmd+Z during a run undoes whatever the agent did most recently,** so the user can't predict which glyph changes. **Fix:** while a run is active, Cmd+Z undoes only the user's own last entry. Agent work is reverted from the cell or the receipt.
12. **The vault and the edge-case doc disagree on import.** The vault's QoL 001 picker keeps all blocks on by default; the edge-case doc defaults to "Basic Latin only". Pick one.

## User's wants and the "AI toy" risk

13. **The manual path barely appears.** 9 of the 12 screens are about agent runs, and the pen (which the user named) shows up in one static screen. **Fix:**
    - Make the pen interactive in screen 7: place points and drag handles.
    - Add a flow with no model connected: draw A by hand and watch the proof update.
    - Add manual spacing in the Space row.
14. **A standalone mock not wired to the app repeats the failure the user hated.** **Fix:** start from screenshots and measurements of the running app (Characters page, panels, tokens) and show each new region next to the real one. Trace every new control to an engine function.
15. **The orchestration chrome looks like Runbook again:** run chip, meter, cap, plan with dependency warnings, gates, checkpoints, conflict cards, re-derive prompts, pacer. **Fix:**
    - Collapse the plan to one line by default.
    - Give a one-glyph ask ("fix the g") no plan and no gate, only a receipt, and prototype that screen.
    - No "filling" animation on cells, only state changes. Respect reduced motion.
16. **Two places will make the layout jump,** which the user called out before. The Run chip appears only during a run, so the header shifts. Peach proposals with Accept/Edit can't fit inside a 40px one-line bar. **Fix:** reserve the chip's slot, and show proposals in a popover anchored to the value.
17. **New font has no "Start from a font file" option** (import, then subset to the set, with a licence notice). That is probably the most practical route to good quality, and the edge-case doc covers it. **Fix:** add it as a third choice on the New screen.
18. **One open question is missing.** The vault asks "MCP first or CLI first", so the user may want Claude Code or OpenCode to drive Noddy rather than only the in-app relay. **Fix:** add it to the open questions.

## Missing prototype states

- **Run control:** Pausing… and Stopping… (a glyph job can take minutes).
- **Provider and connection:**
  - provider rate or credit limit auto-pause
  - the key-lost banner after a reload
  - the empty pane with no model connected
- **Model output:**
  - a "0 edits applied" receipt while the model's text claims it made edits
  - Needs retry after an output-length failure
  - an outline-check failure with "Fix direction"
- **Project state:**
  - the "Outside set" group
  - two-tab read-only
  - how to reach the legacy Kerning, Settings and Global actions pages, and what happens to a run when the user navigates there
- **Keyboard:** grid focus with the focus ring on an edge cell, and Esc in the editor while a pen path is open.

## Roadmap order

- **The vault's own rule:** it says read-only, then guarded writes, then generation, and it says to keep the agent track apart from the redesign. M5 (Shell) is redesign work sitting inside the agent track. **Fix:** move it to the redesign track.
- **Data-loss guards come too late.** The "Not autosaving" status and the run leave-page warning arrive at M12, after real runs at M8–M10, so testing can lose work. **Fix:** move both to M1, and the drawing spike into M2.
- **The mutation log is missing.** The vault asks for a log of every agent mutation (timestamp, command, args hash, result hash), and the synthesis has none. **Fix:** add it to M8.

Sources: `/Users/kshitij/Documents/cursor shit/font agent/noddy-agent-plan/src/agent/native-tools.js`, `src/formats_io/otf/font_export.js`, `docs/redesign/07-risk-register.md`, `AGENTS.md` (§3), and `/Users/kshitij/Documents/Obsidian Vault/Noddy/Noddy agent track and QoL track.md`.