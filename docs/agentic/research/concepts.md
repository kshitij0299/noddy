=== CONCEPT A (specimen-first) ===
## 1. Galley

**Your font is always set in type.** The window is a live proof plus the whole character set. The agent works through the set in front of you, and clicking any letter opens the pen on it. (A galley is a typesetter's first proof: the thing you check.)

## 2. Layout

**Desktop (1100px and wider).** Every region has a fixed size, so content never pushes the layout around.

- **Header (48px).** Noddy, project name, **Set chip** ("Latin Kernel · 61/117"), **Run chip** ("Drafting b · 41/117 · Pause · Stop", hidden when idle), File, **Export**. Hiding the agent pane never stops a run.
- **Spec bar (40px, sticky).** UPM, x-height, cap height, ascender, descender, overshoot, stems (n/o/H/O), mono or proportional. You and the agent edit the same numbers. They draw as guides in the proof and on the canvas.
- **Galley (centre, scrolls vertically).**
  - **Proof band** (fixed height, resizable divider). Text you type into, rendered in the font being made.
    - Presets: Specimen · Spacing · All sets · Paragraph · Waterfall.
    - A **Follow line** shows the active glyph in context (`nnbnn oobo HbH`).
    - A **Space row** shows LSB, advance and RSB, editable inline.
  - **Set grid.** Groups Uppercase / Lowercase / Figures / Punctuation / Symbols / Spaces & .notdef, each with a counter ("a–z 18/26 · 4 need review"). Cells are a fixed 72px and include a text status slot. Filters: Empty · Needs review · Yours · Held · Failed.
- **Agent pane (docked right, `clamp(340px,28vw,420px)`).** Model row, collapsible Plan checklist, timeline (one row per glyph), composer. Attachments and selection appear as chips (for example "Selected: T h e" from the proof).
- **Glyph sheet.** Rises over the grid only, so the proof, spec bar and pane stay visible. It hosts the existing edit canvas, tool rail and inspector.

**Narrow windows.**
- **760–1099px:** the pane becomes an overlay drawer, and the sheet keeps one proof line pinned.
- **Under 760px:** monitor mode, with proof, grid, Pause/Stop and Keep/Revert. The agent opens as a bottom sheet, and the pen is disabled with the reason shown.
- **Under 620px tall:** the proof shrinks to one line.

## 3. Key screens

1. **Empty start.** 117 ghost cells: a dashed box with the code point. The UI font never fakes a glyph. Placeholders in the proof reserve their width, so lines don't jump. With no model connected, a Connect card shows:
   - curated models with Free/Paid, Tools and Vision badges
   - "Check connection (one tiny billed call)"
   - the API key field (the key is kept in memory only)

   Your draft is kept, and manual tools work without a model.
2. **Brief + reference.** "Rounded geometric sans for a bakery" plus an image chip, which warns you if the model has no vision. The agent asks which characters the image shows. Each crop becomes an underlay in its glyph's sheet and is sent only with that job. "Will send: brief + 1 image to OpenAI."
3. **Plan.** Proposed spec values appear in peach in the spec bar (Accept / Edit). The checklist runs: Metrics → controls **n o H O** (gate) → families → spacing pass.
   - Glyph chips can be dragged, struck out or held.
   - Cells read "Queued #12".
   - Estimate: "89 to draw · 26 derived · 2 empty · ~1.4M tokens · ~$4 · cap $6".
4. **Control gate.** The run stops by design after the controls, and the proof switches to Spacing. Each control shows its render, measured stems and check results. Choose **Approve style & continue**, Refine or Open. Nothing spreads before approval.
5. **Mid-run.**
   - Cells go Queued → Drafting (peach ring plus text) → Drafted.
   - The proof updates once per atomic glyph commit, never half a letter.
   - Timeline rows read like "b · stem from n, bowl from o · 4 checks passed · 3.1k tokens" and expand to show the tool calls.
   - Throttling shows "Waiting 12 s".
6. **Pen during a run.** Click a cell, or double-click a letter in the proof. The sheet opens with the pen one key away, and the clicked word becomes the context string.
   - **The agent is elsewhere:** the glyph is **Yours** while open, and the queue skips it.
   - **The agent is drafting this glyph:** a banner reads "Agent is drafting g — Watch · Take over". Take over rolls the job back.
7. **Conflict.**
   - **Spec edit mid-run:** the run pauses at the next job boundary with "31 drafts use x-height 500 — Rescale · Keep · Undo change."
   - **Cmd+Z on an agent glyph:** treated as a rejection, with "Skip r · Redraw with a note."
   - **Two stale reads:** the glyph is skipped and re-queued.
8. **Review in place**, honouring PLAN.md's "no separate review screen". The "Needs review (24)" filter dims the other cells and rebuilds the proof from those glyphs. The sheet shows an onion-skin of the previous outline with Keep · Revert · Ask. Each group offers "Keep all drafts".
9. **"Make it bolder."** The agent proposes a spec change (n stem 88→104). A **Proposal line** under the current proof line is rendered from uncommitted candidates. Scope: Drafted only · All · Include approved. Approved and Yours glyphs are excluded by default. Apply bookmarks "Before bolder" and queues one job per glyph.
10. **Scope.** The Set chip opens a picker: Basic Latin (95) · **Latin Kernel (117)** · Latin Core (323, "Later: needs accents"). Asking for "é" gets a one-line OUT_OF_SET reply and no partial attempt.
11. **Interrupted run.** "Interrupted at 41/117 — Resume · Keep drafts · Discard drafts."
12. **Export preflight.** Checks:
    - coverage, with missing characters as chips that open each glyph
    - .notdef and space/NBSP width
    - failed or unreviewed glyphs
    - metrics that cover every extent

    "Proof exported file" loads the compiled font into the proof. "Export draft anyway" is allowed. Export is blocked while a job commits.

## 4. Core flows

- **From scratch:** brief → map the images → accept the spec (guides appear) → the agent draws the controls → you approve at the gate → the agent works through the families → review with the filter → spacing pass → export.
- **Manual takeover:** click a cell or a proof letter → the sheet opens, locked to you → pen edits → Esc. The glyph is marked "Edited by you". An optional chip offers "Ask agent to match this to n". To edit several glyphs: Pause → edit → Resume, and the agent re-reads what changed.
- **Global change:** chat or spec bar → Proposal line → scope → bookmark → one job per glyph → review. "Revert run" lives in History.
- **Export:** preflight → fix chips → proof the exported file → you download it. The agent never exports.

## 5. Real time, all sets

- A new `itemChanged{id}` topic fires on agent commits, manual edits and undo/redo.
- The proof (`display-canvas` + `TextBlock`) subscribes with a 150ms debounce.
- Tiles re-fetch their glyph by ID, because a commit replaces the glyph object.
- Atomic candidate commits mean the proof only ever shows whole glyphs.
- The **All sets** preset sets one line per group as text, so spacing shows as well as shapes.
- A **Real font** toggle builds the font in memory with `buildFontBuffer` while idle, as an honest check.

## 6. Character set

**The name.**
- Those 95 characters are the Unicode **Basic Latin** block, also called **printable ASCII**.
- The standard set for "English plus some symbols" is Google's **GF Latin Kernel**: the 95, plus curly quotes, – —, …, • ·, NBSP, ¢ £ ¥ €, © ® ™ ° and × ÷ −. With .notdef that makes **117 glyphs**.
- v1 uses that set, labelled "Latin Kernel (English)".

**How it's built.**
- A new `CharacterSet`: an ordered list, source and version, groups, and a status per glyph. `CharacterRange` stays for import and export.
- Derived glyphs (about 26) carry a recipe tag, such as "from .".
- Space and NBSP show a width bar marked "Empty by design".
- Scope changes only through the picker. Removing a glyph from scope hides it and leaves it out of export, but never deletes the outline.

## 7. P0 edge cases

| Case | Handling |
|---|---|
| No key, wrong key, no tool calling, no vision | Check connection plus a capability probe. The draft is kept. Image chips warn about vision. Receipts come from native results, not the model's text. |
| Limits sized for one glyph; relay throttling | A queue of per-glyph jobs, each with its own budget, paced. |
| Spend | Estimate, live meter, and a cap that pauses the run. |
| Same glyph; any click makes the agent stale | Ownership lock (screen 6), per-glyph revisions. The agent never moves your selection or view. |
| Inspector undo bug; Cmd+Z mid-run; undo navigating across glyphs | Ship the INSPECTOR-UNDO proposal first. Undo counts as a rejection. One history entry per job, plus "Revert run". |
| Stop leaves half a letter; Hide kills the run | Atomic commits. Pause finishes the current glyph; Stop rolls it back. Hide is not Stop. |
| Agent knows only UPM, can't see, can read at most 8 glyphs | Font Spec, `render_glyphs`, `measure_set`. |
| Validation is bounds-only; no replace or delete | `check_outlines` must pass before "Drafted"; `replace_paths` and `delete_paths`. |
| Ambiguous prompt | Proposal line plus scope picker. |
| Autosave, crash mid-run | Autosave per job, a visible "Not autosaving" status, a leave warning, a run manifest. |
| Incomplete export; data leaving the machine | Preflight; a first-run disclosure plus "Will send…" on every request. |

## 8. Native agent tools

**Existing (extended):**
- `get_context`: adds spec, set, statuses and ownership
- `read_glyphs`
- `set_spacing`
- `transform_paths`: adds scale, rotate, skew and flip
- `add_paths`

**New:**
- `create_glyph(codepoint)`: uses `addItemByType`, no navigation, rejects characters outside the set
- `replace_paths`, `delete_paths`
- `edit_points`: points, handles and point type
- `import_svg_path`: SVG `d` to native paths, flipping y and fixing winding
- `derive_glyph`: copy, mirror, rotate or scale from a source glyph, e.g. ) from (
- `boolean_paths` (`combinePaths`), `offset_paths`
- `get_font_spec`, `propose_font_spec`
- `render_glyphs`, `render_proof`: PNGs with guides; needs a side-effect-free `drawGlyph`
- `measure_set`: bounds against guides, stems, overshoot
- `check_outlines`, `check_coverage`, `compile_check`
- `propose_plan`, `write_glyph_note`

**Later (v2):** `place_component`, `set_kerning`.

**Host-only:** queue, pacer, ownership lock, gate, bookmarks, export.

## 9. Risks

- **The pen is one step away.** People who live in the canvas may feel demoted. The sheet can be pinned open.
- **Protected areas.** Hosting the single `edit-canvas` in a sheet needs `nav.page` decoupled from the visible page, plus a keyboard-scope guard so typing in the proof never fires tool shortcuts. It also touches history. All of this needs approval and tests.
- **Bad drafts are very visible.** LLMs draw a recognisable letter less than half the time. The gate and `derive_glyph` reuse keep quality up.
- **Real font is CPU-heavy:** opt-in, idle-only.
- **Review adds a step PLAN.md didn't have.** PLAN.md applies edits directly. Galley still does, but adds a "Needs review" status and Keep/Revert on top. Confirm with the user that this extra step is wanted.

=== CONCEPT B (studio-first) ===
# Bench: Noddy studio direction

**Pitch:** a real font editor with the agent working beside you. The character set is on the left, the letter you're editing is in the middle, the agent is on the right, and the whole font is always set in type along the bottom.

## 1. Layout

The top bar has a fixed height. It holds: Noddy · project name · **Set chip** ("Latin Kernel · 41/117") · **Run chip** (progress and Pause; it stays visible when the thread is hidden) · model chip · **Export**.

| Region | Contents |
|---|---|
| **Left: Set** | Grouped cells: Uppercase 26 · Lowercase 26 · Figures 10 · Punctuation 27 · Symbols 25 · Spaces 2 · .notdef. Each group header shows done/total. Each cell shows a live glyph render, the character, and a status in text: Empty, Queued #12, Drafting, Drafted, Needs review, Approved, Yours, Held or Failed. Cells have a filter row, a Hold toggle and multi-select. |
| **Center: Canvas** | The existing edit canvas, tool strip and zoom. It is mounted once and pointed at a new glyph instead of rebuilding the page. Header: character name, owner badge (You / Agent drafting / Free), and toggles for Follow agent, Reference underlay and Before/After. A context string (`HH▢OO`) sits around the glyph. |
| **Right: Agent \| Inspect** (segmented) | **Agent:** a run card that stays at the top, an editable plan, the activity timeline, and a composer with a scope chip. **Inspect:** the existing panels stacked and collapsible (Attributes, Layers, Transforms, Guides, Quality, History), not one panel at a time. With nothing selected, Inspect shows the **Font Spec**. |
| **Bottom: Proof strip** | Fixed height, with tabs: Sets · Spacing (with an editable Space Matrix) · Text · Waterfall. |

**Layout rules**
- Every region is either fixed-size or fills its space.
- Status chips have a fixed width, so a status change never moves the layout.
- Highlights are paint-only tints and respect reduced motion.
- The agent never moves your focus, selection or view.

**Narrow widths**
- **T1 (≥1100px):** all four regions.
- **T2 (760–1099px):** the canvas plus one side region, switched from the top bar. The side region overlays the edge of the canvas and doesn't squeeze it. The proof strip stays.
- **T3 (<760px):** monitor mode. You get the set grid, run card, proof, and Approve/Stop. The agent opens as a bottom sheet. The pen is disabled and says why: "Needs a wider window to draw".
- **Short height (<620px):** the proof strip shrinks to one line.

## 2. Key screens

1. **New font.** Welcome › New: a name, then a set picker:
   - **Latin Kernel (English), 117:** the default
   - **Basic Latin, 95**
   - **Latin Core:** greyed out, "v2"

   Then "Start with agent" or "Draw myself". You land with 117 ghost cells and A on the canvas with its metric guides. The manual tools work with or without a model connected.
2. **Connect model.** This happens inside the Agent region, not in a modal.
   - A curated list of models with badges: Tools, Vision, Free/Paid.
   - A Custom model ID under Advanced, which shows which protocol it resolved to.
   - A key field labelled "kept in memory only".
   - **Check connection**, which states that it makes a tiny billed call.

   Errors show inline and your draft prompt is kept. After a reload, a banner keeps the provider and model and asks only for the key.
3. **Brief and reference image.** Attaching an image opens a mapper that asks "Which characters are in this image?". You type them and crop one box per character.
   - Each mapped crop becomes a canvas underlay for both you and the agent, and is sent only with that glyph's job.
   - The image chip warns when the model can't read images.
   - A line above Send says exactly what leaves your machine, for example "Brief + 1 image + 0 outlines → OpenAI".
4. **Planning.** The agent returns two cards:
   - **Spec proposal:** UPM, x-height, cap height, ascender, descender, overshoot, stems and spacing mode, shown as a diff with an Apply button.
   - **Plan:** phases in drawing order (metrics → controls n o H O → families → punctuation → space and .notdef). The plan also appears on the grid as queue numbers. You can drag to reorder, strike glyphs out or Hold them.

   Below the plan: an estimate (glyphs, tokens, $), a budget cap, and a button, "Draw controls (4)".
5. **Style gate.** The agent draws n o H O first. A card then shows their renders and the proof string `nnonoHHOHO`, with three choices: Approve style, Revise in chat, or Edit by hand. Nothing is copied to other glyphs until you approve.
6. **Mid-run.**
   - Cells move from Queued to Drafting to Drafted. Each commit tints the cell and its letters in the proof strip once.
   - The timeline groups entries by glyph. Each entry has a receipt built from native results, plus the agent's own render, for example "b: +2 contours, LSB 48 / RSB 52, outline check passed".
   - The run card shows 41/117, the current phase, tokens and $, a wait message such as "Waiting 12 s (rate limit)", and Pause and Stop.
   - The canvas stays on the glyph you chose. **Follow agent** shows the glyph the agent is drafting as a read-only overlay.
7. **Take over.** Double-click any cell or proof letter to open it on the canvas with the Pen ready.
   - **Glyph the agent is drafting:** a banner reads "Agent is drafting g · Take over · Watch". Take over throws away the agent's draft, marks the glyph **Yours**, and the run moves on.
   - **Queued glyph:** it is held while open. Any edit makes it Yours, and later runs skip it.
8. **Conflict cards.**
   - "You undid e. Retry e · Keep yours · Draw it myself"
   - "x-height 500→520: 30 drafts use the old value. Rescale drafts · Keep"
   - "Skipped k after 2 stale reads, re-queued"
9. **Review.** "Review 24 changes" opens a list. Selecting a glyph shows Before / After / Overlay on the canvas, with its receipt and the agent's note on why it changed. Each glyph has Keep · Revert · Edit, and each phase has Keep all. Approved glyphs are excluded from later runs by default.
10. **Refine: "make it bolder".** The agent says that weight metadata doesn't change outlines. It proposes a spec change (stem 84→100) and renders 4 sample glyphs before and after.
    - **Scope picker:** Drafted only · Everything except Approved and Yours · Include approved.
    - A cost estimate.
    - An automatic checkpoint, "Before bolder".
11. **Out of set.** Ask for "Add é" and you get one line: "é isn't in Latin Kernel. Latin Core (+206, mostly built from components) comes in v2." The agent doesn't try a partial version.
12. **Export.** A preflight sheet checks:
    - coverage, with each missing character linking to its cell
    - outline failures and unreviewed glyphs
    - space and NBSP width
    - .notdef (added automatically)
    - vertical metrics that would clip any glyph
    - a test compile

    Then you choose the format and Export, or "Export draft anyway". Export waits while a job is committing. Afterwards, "Proof exported file" loads the exported font into the strip.

## 3. Core flows

- **From scratch with the agent:**
  1. Name the font and pick the set.
  2. Write the brief, attach an image and map its characters.
  3. Connect a model if needed; the draft is kept.
  4. Apply the spec diff.
  5. Edit the plan and set the budget.
  6. Draw controls, then pass the style gate.
  7. Continue the remaining 113 while you watch, taking over any glyph as needed.
  8. Review the changes.
  9. Export.
- **Manual takeover:**
  1. Click a cell to preview it on the canvas, or double-click to open it with the Pen.
  2. Take over if the banner shows.
  3. Draw. Each inspector edit is its own history step.
  4. Move on; the cell is now Yours.

  You can also select a contour or point and choose "Ask agent about this". The selection becomes the composer's scope.
- **Global change:**
  1. Optionally select cells to set the scope.
  2. Type a prompt, such as "rounder terminals".
  3. Review the spec diff and sample renders.
  4. Choose the scope and check the estimate.
  5. Run. Each glyph is its own job.
  6. Review the changes. History offers "Revert run" to undo the whole run.
- **Export:**
  1. Run the preflight.
  2. Fix issues through their links, or choose "Export draft anyway".
  3. Pick OTF, TTF or WOFF2.
  4. You trigger the download yourself.
  5. Optionally proof the exported file.

## 4. "See the font in real time, all the sets"

- Agent commits, manual edits and undo/redo all send a new `itemChanged{id}` event.
- Grid cells re-fetch their glyph by ID and redraw.
- The proof strip (a `display-canvas` text block) redraws, debounced to about 150 ms.
- The **Sets** tab has four fixed lines: uppercase, lowercase, figures, and punctuation + symbols. All the sets fit in one glance.
- Empty glyphs show as dotted boxes, so gaps are obvious.
- The **Spacing** tab follows the active glyph (`HH g HH oo g oo`), and its Space Matrix is editable inline.
- The pop-out preview stays available for a second monitor, now debounced.

## 5. Character set

The UI calls it what it is: **"Latin Kernel (English): 116 characters + .notdef"**. An info popover explains that it is Basic Latin (printable ASCII, 95) plus NBSP, curly quotes, dashes, ellipsis, bullet, middle dot (·), ¢ £ ¥ €, © ® ™ °, and × ÷ −.

A new `CharacterSet` drives the grid, the counts, the agent's scope and export. It holds an ordered code-point list, groups and a source version. `CharacterRange` stays for import/export compatibility.

About 25 glyphs are tagged "Derived from …", for example ) from ( or … from ., which keeps them cheap in the plan.

**Changing the set:** Set chip › Change set shows the difference first: glyphs added, how many are assembled vs drawn, and the cost. It needs confirmation. Removing characters never deletes glyphs; they move to an "Outside set" group that isn't exported.

## 6. P0 edge cases

| Case | Handling |
|---|---|
| Set definition | 0x20–0x7E plus the Kernel extras. DEL is excluded. Exactly 117 cells. |
| No key | Connect state inside the thread. Everything else works. The draft is kept. |
| Wrong key or model access | Check connection. The error shows inline in the sheet. The draft is kept. |
| Model can't call tools, or prints fake JSON | A capability probe on connect. Every turn ends with a receipt from native results ("0 edits applied"), whatever the model says. |
| Image sent to a non-vision model | A warning on the chip. On failure, "Send without image". |
| Limits sized for one glyph | A run is a queue of per-glyph jobs, each with its own step and time budget. |
| Relay throttles its own requests | A pacer shows "Waiting 12 s", not an error. |
| Spend | A pre-run estimate, a live meter, and a cap that **pauses** the run. |
| Agent and user on the same glyph | A glyph open with an active tool or pointer is the user's. A per-glyph lock blocks agent commits. Banner: Take over / Watch. |
| User browses other glyphs | Revisions are tracked per glyph. The agent targets glyphs by ID and never touches selection or view. |
| Inspector edits skip undo | Ship INSPECTOR-UNDO-PROPOSAL first. It's a prerequisite. |
| Cmd+Z during a run | Treated as a rejection: that glyph's job pauses and the agent asks before retrying. |
| Undo across glyphs navigates instead | History gets named checkpoints: "Revert run" and "Revert glyph to before run". |
| Stop mid-glyph | Each glyph is drafted separately and committed in one step (`submit_glyph`). Stop throws away the draft. Pause finishes the current glyph first. |
| Hiding the panel stops the run | Hide and Stop are separate. The Run chip stays visible. |
| Agent only knows UPM | It reads `get_font_spec` first. The canvas draws the spec as guides. |
| Agent can't see its work | It must call `render_glyphs` before `submit_glyph`. |
| Reads capped at 8 glyphs | `measure_set` covers the whole set in one call. |
| Validation only checks bounds | `check_outlines` must pass before a glyph counts as Drafted. You see the same badges, but they don't block manual work. |
| No delete or replace | `replace_paths` and `delete_paths`. |
| Ambiguous prompt | A spec proposal, 4 sample renders, and the scope picker. |
| Autosave freezes and fails silently | Autosave once per job, move to IndexedDB, and show a persistent "Not autosaving" status. |
| Reload or crash mid-run | A leave-page warning, plus a run manifest without secrets. On reopen: "Interrupted at 41/117: Resume · Keep drafts · Discard". |
| Exporting an incomplete set | The preflight sheet (screen 12). |
| Data leaving the machine | A first-run disclosure, a line on every send saying what goes out, and the project name is optional. |

## 7. Native agent tools

**Existing:** `get_context`, `read_glyphs`, `set_spacing`, `transform_paths` (translate only), `add_paths`.

**New:**

| Tool | Purpose |
|---|---|
| `get_font_spec` / `set_font_spec` | Read or write an allowlisted set of metrics and design values (stems, overshoot, spacing mode), with history for the whole project. |
| `get_set_status` | Coverage, statuses, holds and owners for each glyph. |
| `create_glyph(codepoint)` | Create a glyph without navigating. Anything outside the set is refused with `OUT_OF_SET`. |
| `begin_glyph` / `submit_glyph(id, note)` | Open a draft copy of the glyph, then validate it and commit it as one history entry with a note. |
| `replace_paths` / `delete_paths` | Swap or remove contours, with the same revision rules. |
| `edit_points` | Move points and handles, set point type, smooth. Respects locks. |
| `transform_paths` (extended) | Scale, rotate, skew and flip. |
| `import_svg_path` | Convert SVG `d` data to native paths, handling the y-flip and winding. |
| `boolean_paths` | Unite, subtract, intersect or exclude. |
| `offset_paths` | Offset a contour. The result is render-checked. |
| `derive_glyph` | Copy a glyph with a transform, for mirrors and rotations such as ) ] } \ > and the quote marks. |
| `render_glyphs` / `render_text` | PNG images with metric guides, drawn without side effects. |
| `measure_set` | Bounds against guides, stems at a given y, and overshoot, for the whole set in one call. |
| `check_outlines` | Winding, self-intersections, duplicate points, specks, point count, extents. |
| `compile_check` | A test build of the font in memory, with no download. |
| `update_plan` | Mark a glyph done, skipped or needing a retry. |

**Not given to the agent:** deleting glyphs, export, kerning (v1), components (v2).

## 8. Risks

- **It looks like a normal editor.** It could read as "Glyphs plus a chat box". The new parts (the plan shown on the grid, Follow agent, receipts) need to be visible right away.
- **It's dense.** Four regions at 1100px is tight, and T2 has to give up a region.
- **It touches protected code.** Moving the canvas without rebuilding the page, the per-glyph lock, `itemChanged`, and the history checkpoints all change protected areas (`history.js`, canvas events, navigator). Each needs your approval and tests.
- **Follow mode is new rendering work.** It needs an overlay layer to draw the agent's in-progress draft.
- **Drawing quality depends on the model.** The render-and-check loop and the style gate reduce the risk, but they can't fix a weak model.
- **Running in the browser has limits.** The tab must stay open while the agent works.

=== CONCEPT C (run-first) ===
# Runbook: plan-first Noddy

**Pitch:** The font is built from a plan you can read, reorder and take over at any step. The agent works through the plan one glyph at a time, using Noddy's own operations. Every commit shows up on a live proof of the whole set. Nothing moves past a checkpoint until you approve it.

## 1. Layout

This is the desktop layout, for 1100px and wider. None of these views rebuild the page when you move around.

- **Header:**
  - project name;
  - set chip, "Latin Kernel · 58/117";
  - run chip, on every view ("Step 5/14 · b · $0.41 · Pause · Stop");
  - Connect model;
  - Export.
- **Plan rail (left):** a numbered list of steps. Each step shows:
  - its glyphs, as chips;
  - its owner (Agent or You);
  - its status and cost estimate;
  - its checkpoint gate.

  Step 0 is the **Font Spec** card: metrics, stem widths, overshoot, and whether the font is proportional or monospaced. Named bookmarks sit between steps.
- **Proof band (centre top, resizable):** the whole set drawn live, plus spacing strings and a Space Matrix.
- **Set board (centre bottom):** 117 cells in groups: Uppercase, Lowercase, Figures, Punctuation, Symbols, Spaces and .notdef. Each cell shows its status in words and its step number.
- **Agent pane (right, docked):** the chat, a timeline grouped by step, a receipt for each glyph, and the message box. Hiding the pane or pressing Esc never stops a run.
- **Glyph editor (on demand):** a sheet over the centre. It holds the *existing* canvas, tool strip and inspector; it is not a second canvas. It opens with the Pen tool ready, and the board and proof stay visible around it.

**Narrower windows:**
- **760–1099px:** the plan rail becomes a horizontal step bar. The agent pane becomes a drawer that slides over the content without shifting it.
- **Pen editing** needs at least 1024px. Below that the editor is read-only and says why.
- **Under 760px:** monitor mode. You get the run chip, step bar, proof, and Approve, Pause and Stop. The agent pane becomes a bottom sheet.

## 2. Key screens

1. **Start.** The New tab offers "Start with a plan" or "Empty font". The start form takes:
   - a brief and attachments;
   - a character set: Latin Kernel (117) by default, or Basic Latin (96);
   - a template: Text sans, Serif, Mono or Display.

   With no model connected, "Make plan" still gives you a manual checklist. Connect opens in place and keeps what you typed.
2. **Reference mapping.** Noddy asks "Which characters are in this image?" Each crop you map is shown under that glyph on its canvas. It is sent only with that glyph's job. If the model can't read images, the attachment chip shows a warning and offers "Send without image".
3. **Plan proposed.** The steps run in this order:
   1. Spec.
   2. Control glyphs n o H O (checkpoint).
   3. Lowercase families.
   4. Lowercase spacing (checkpoint).
   5. Capitals by family (checkpoint).
   6. Figures.
   7. Core punctuation, then derived punctuation.
   8. Brackets, math and symbols.
   9. Spaces.
   10. Spacing pass (checkpoint).

   Empty cells on the board are tinted by step. You can:
   - reorder steps, with warnings about dependencies ("e reuses o");
   - strike out glyphs;
   - mark a step or glyph "I'll draw this". Steps that depend on it wait for you, and the others keep running.
   - add or remove checkpoints.

   The footer reads "117 glyphs · ~620 calls · est. $3–5 · Run plan".
4. **Spec checkpoint.** The proof shows the metric lines and overshoot zones. You edit the numbers inline, then Approve.
5. **Control glyphs checkpoint (the turning point).** The proof line "nnonoo HHOHOO" is drafted. Beside it the agent shows:
   - measurements against the spec (stem 88/88, overshoot 12);
   - the render it checked its work against.

   You can choose:
   - **Approve style**;
   - **Ask for changes**;
   - **Show 3 variants** (alternate proof lines; pick one);
   - **Draw it myself**.

   Nothing after this step runs until you approve.
6. **Mid-run.** Each cell moves from Queued to Drafting, then to Drafted, Needs review or Failed (with a reason).
   - Drafting shows a label and a slow pulse. The pulse stays still when the system's reduced-motion setting is on.
   - The proof redraws after every commit.
   - The timeline nests step › glyph › collapsed tool calls › receipt ("b: 2 contours · LSB 62 RSB 48 · checks passed").
   - When the provider is rate-limiting, it says "Waiting 12 s".
7. **Taking a glyph mid-run.** Double-click a cell or a glyph in the proof.
   - If the agent isn't working on that glyph, it opens at once as **Held by you**, and the agent skips it.
   - If the agent is working on it, a banner reads "Agent is drafting d · Watch · Take over". Take over throws away the agent's unsaved draft.

   When you close the editor, choose "Hand back" or "Keep as mine".
8. **Conflict.**
   - If you edit an approved control glyph, Noddy asks "You changed n. 9 drafts derive from it · Re-derive · Keep".
   - If you press Cmd+Z on an agent glyph during a run, Noddy treats it as a rejection. That job pauses and asks "Retry with a note · Leave to me".
9. **Step review.** The board filters to that step's glyphs. Each cell can switch to a before/after overlay. Glyphs that don't match the spec are flagged ("k stem 104, spec 88"). Keep or Revert each glyph, or Keep all. There is no separate review screen.
10. **"Make it bolder."** The agent replies with:
    - a spec change (stem 88→104);
    - a preview line of n o H O;
    - a scope choice: Drafted, All, or Include approved and your own glyphs (off by default).

    The font's weight setting is only a label, so making it bolder means redrawing outlines. Confirming adds a step, "Weight +18% · 62 glyphs · ~$1.10", with its own checkpoint.
11. **Scope change.** Asking for "é" gets one line, "é is outside Latin Kernel", and an **Add set…** button.
    - That sheet shows Latin Core: 206 more characters, made up of 32 new drawings, 26 accent marks and 145 assembled glyphs.
    - Adding a set appends steps but never starts them.
12. **Export.** The pre-export check lists:
    - missing or unreviewed glyphs;
    - failed checks;
    - the width of the space;
    - .notdef (made automatically);
    - whether the vertical metrics cover every glyph.

    Choose Export or "Export draft anyway". The exported file comes back as a proof line, "As exported (OTF)", so you can compare.

## 3. Core flows

**Start from scratch with the agent**
1. Write the brief and add images.
2. Map the reference images to characters.
3. Make the plan, then edit it.
4. Run.
5. Approve the spec.
6. Approve the control glyphs, asking for variants if needed.
7. The steps run, and the proof updates after each glyph.
8. Review at the lowercase, capitals and spacing checkpoints.
9. Run the pre-export check and export.

**Take over with the pen**
1. Double-click a glyph.
2. The editor opens with the Pen ready, the spec guides drawn, and a context line ("nnXnn HHXHH").
3. You now hold that glyph's lock. Every agent commit checks the lock.
4. Edit.
5. Close, then hand the glyph back or keep it.
6. If other glyphs are derived from it, Noddy offers to re-derive them.

Later jobs measure your outline (`measure_glyphs`), so the agent adjusts to your change instead of overwriting it.

**Ask for a global change**
1. Ask in chat.
2. The agent proposes a spec change (`propose_spec_change`).
3. It renders the change on 4 sample glyphs.
4. You pick the scope.
5. A new step is inserted into the plan.
6. Each glyph in it is redrawn as one atomic job.
7. You review at the checkpoint. "Revert this step" stays available as one named history entry.

**Export**
1. You click Export. The agent never exports.
2. The pre-export check links each issue to its cell.
3. Pick a format.
4. Noddy compiles the font and loads it back into the proof.

## 4. Seeing all the sets live

- **What the proof shows:**
  - one row each for A–Z, a–z, 0–9, punctuation and symbols;
  - spacing strings (HOHOH, nonon);
  - a line that follows the glyph you have selected;
  - free text.
- **How it updates:** Noddy adds a new "glyph changed" signal (`itemChanged{id}`). Agent commits, manual edits and undo all send it. The proof (`TextBlock`) redraws, and each board cell re-reads its glyph. Redraws wait about 150 ms so a burst of changes draws once.
- **Compiled view:** builds the real font file (`buildFontBuffer`) at checkpoints or when you ask.
- **Missing glyphs:** shown as a dashed box, never as a stand-in from another font.
- **Changed glyphs:** get a brief colour tint. The tint never shifts the layout.
- **Space Matrix:** left side bearing (LSB), advance width and right side bearing (RSB) can be edited inline, and each edit goes into history.
- **The agent sees the same proof** through `render_text`.

## 5. Character set

- **The name:** the v1 set is **Latin Kernel (English)**, which is Google's "GF Latin Kernel". It is printable ASCII plus 21 more characters, plus .notdef, for 117 glyphs:
  - **Printable ASCII:** the 95 characters of the Unicode Basic Latin block.
  - **The 21 extras:** curly quotes, en and em dashes, … • ·, ¢ £ ¥ €, © ® ™ °, × ÷ −, and the non-breaking space.
- **Smaller option:** **Basic Latin (printable ASCII)**, 96 glyphs including .notdef. The DEL control character is left out.
- **Data model:** a new `CharacterSet` holds an ordered list, a source ID and version, groups, and a status for each glyph. The existing `CharacterRange` stays for import and export.
- **On the board:**
  - each group shows a count ("a–z 18/26");
  - the space and non-breaking space show a width bar instead of a blank cell;
  - .notdef says "generated at export unless drawn";
  - derived glyphs are tagged with their source (for example "from (").
- **Expanding the set:** only you can expand it.
  - If the agent tries to go outside the set, Noddy refuses (`OUT_OF_SET`), and the agent can only suggest adding it.
  - Extra glyphs in an imported font go in a collapsed "Outside set" group. The agent can read them but not change them, and they stay in the file.

## 6. P0 edge cases

- **No API key:** the plan, board and editor all work without one. The key is kept in memory only, so reconnecting after a reload asks for the key alone.
- **Wrong key, or a model that can't call tools:**
  - "Check connection" runs a quick test and says first that it costs a tiny amount.
  - A second test checks the model can call tools.
  - A glyph only counts as Drafted when Noddy itself confirms the edit. If the model just prints made-up tool text, the turn reads "0 edits applied".
- **Run limits:** each glyph job gets its own budget. This replaces today's cap of 8 calls and 120 seconds per message. A pacer stays within the local relay's limits (2 requests at once, 30 per minute).
- **Spend:** an estimate for each step, a live cost meter, and a budget cap that pauses at the next glyph.
- **Both editing the same glyph:** whoever has the glyph open owns it, enforced by a per-glyph lock. Take over discards the agent's draft.
- **Browsing during a run:** changes are tracked per glyph. The agent works on glyphs by ID and never moves your selection, view or focus.
- **Inspector undo bug:** the fix in INSPECTOR-UNDO-PROPOSAL must ship first.
- **Undo across glyphs:** each glyph job is one history entry. Steps double as bookmarks, with "Revert step" and "Revert glyph to before run".
- **Stop in the middle of a glyph:** a glyph is saved all at once or not at all. Pause finishes the current glyph and then waits. Stop throws away the glyph in progress.
- **Agent can't see its work, or the style drifts:**
  - every job reads the spec and the approved control glyphs first;
  - before submitting, the agent must render (`render_glyphs`) and measure (`measure_glyphs`) its glyph.
- **Broken outlines:**
  - a glyph only reaches Drafted after the outline check (`check_outlines`) passes;
  - your manual edits get the same warning badges but are never blocked;
  - a redraw replaces the old outline (`replace_paths`) instead of stacking on top of it.
- **Vague requests:** the agent first proposes a spec change, then shows a sample preview, then asks for the scope.
- **Crash or reload:**
  - Autosave runs once per glyph job and stores to the browser's database (IndexedDB). If it stops, a "Not autosaving" warning stays visible.
  - A saved run record for each project offers "Interrupted at step 6, 58/117 · Resume · Keep drafts · Discard drafts".
  - Leaving the page mid-run shows a warning.
- **Exporting an incomplete font:** the pre-export check catches it.
- **Privacy:** a disclosure on first use, then a line for each step such as "Sending 4 outlines + 1 image to OpenAI".

## 7. Native agent tools

**Existing tools:**
- `get_context`, `read_glyphs`, `add_paths`.
- `set_spacing`, extended to accept several glyphs.
- `transform_paths`, extended from move only to scale, rotate, skew and flip.

**New tools for reading:**
- `get_job`: the glyphs for this job, the spec and the control glyphs.
- `get_font_spec`.
- `render_glyphs` and `render_text`: return images. These need the glyph-drawing function (`drawGlyph`) to stop changing data as it draws.
- `measure_glyphs`: bounds, stem widths and overshoot across the set.
- `check_outlines`.
- `compile_check`: builds the font to make sure it compiles.

**New tools for writing.** Each works on a draft copy of the glyph and saves all at once.
- `create_glyph`: refuses characters outside the set.
- `replace_paths`, `delete_paths`, `edit_points`.
- `add_svg_path`: accepts SVG path data and fixes its orientation and contour direction.
- `boolean_paths`.
- `offset_paths`: always checked by rendering.
- `derive_glyph`: copies a glyph and transforms it, and remembers which glyph it came from.
- `set_metrics`: only in step 0 or from an approved spec change.
- `write_glyph_note`.

**New tools for the plan:**
- `propose_plan`, `propose_spec_change`.
- `submit_glyph`: only after the glyph passes its checks.
- `ask_user`.
- `report_kerning_pairs`: read-only in v1.

**Kept by the app, never given to the agent:** the job queue, the pacer, glyph locks, checkpoint gates, expanding the set, bookmarks and export.

## 8. Risks and weaknesses

- **Too much plan for small asks:** "fix the g" becomes a one-glyph step, but the whole idea may still feel heavy.
- **Checkpoint balance:** too many checkpoints are tiring, too few let the style drift.
- **Everything depends on the control glyphs:**
  - In research tests, AI models drawing letter outlines without seeing them produce a recognisable letter less than half the time. The control glyphs checkpoint may need many rounds.
  - Derived glyphs are copies, not linked components. Changing a source glyph means re-derive prompts.
- **Fixed build order:** the order suits text typefaces. Pixel and script fonts need other templates.
- **Protected code:** the groundwork touches areas that need your approval:
  - grouping history entries;
  - separating "which page is showing" from "which glyph is selected" so the editor can float;
  - tracking changes per glyph;
  - changing the glyph-drawing function.
- **Density:** four regions are tight at 1100px.
- **Runs live in the browser tab:** if the laptop sleeps the run pauses, and cost estimates can be wrong.