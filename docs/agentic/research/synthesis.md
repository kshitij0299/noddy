## 1. Concept scores

| Concept | Wants | Pro | Feasible | P0 | Prototype | Total |
|---|---|---|---|---|---|---|
| A · Galley (specimen-first) | 5 | 4 | 4 | 5 | 5 | **23** |
| B · Bench (studio-first) | 4 | 5 | 3 | 5 | 3 | 20 |
| C · Runbook (run-first) | 3 | 3 | 3 | 4 | 4 | 17 |

**A · Galley**
- **Wants:** the whole set is always set in type, which matches "see the font in real time, all the sets". The editor opens on click, which is the exact ask.
- **Pro:** type designers judge work in a proof, so this is how they already work. The risk is that the canvas feels one step away.
- **Feasible:** making the proof and grid live is cheap (`itemChanged` plus tiles that re-fetch by ID). Hosting the editor in a sheet needs `nav.page` decoupled from the visible page, but every option needs that.
- **P0:** the most complete coverage: atomic commits, an ownership lock, a spend cap that pauses, Hide ≠ Stop.
- **Prototype:** the key moments (ghost cells filling, the gate, take-over) are visual and easy to fake.

**B · Bench**
- **Wants:** it is the closest to Cursor, but the font is reduced to a bottom strip. The canvas dominates even while the agent does the work.
- **Pro:** reads as a real editor. Stacking the panels fixes "one panel at a time".
- **Feasible:** four regions at 1100px is tight. It also needs new overlay rendering for Follow-agent and a refactor of the panels into a stack.
- **P0:** complete.
- **Prototype:** a static mock reads as "Glyphs plus a chat box", so the new parts don't show.

**C · Runbook**
- **Wants:** the user asked to see and edit the font, but here the plan is the hero.
- **Pro:** the checkpoints are strong. But a layout that leads with a plan rail drifts toward workflow and orchestration software, the "AI swarm" feel the user rejected. A small ask like "fix the g" gets ceremony.
- **Feasible:** step dependencies, re-derive tracking and variants add host logic before the basics work.
- **P0:** good, but variants and re-derive add new failure states.
- **Prototype:** the plan is easy to show, but the demo risks showing process instead of letters.

## 2. Recommended direction: Galley, with Bench's editor and Runbook's plan

**Base: A.**
- **From B:** the set picker at New, a Connect card inside the agent pane, stacked collapsible inspector panels, Before/After and reference-underlay toggles in the editor header, "Ask agent about this" (your selection becomes the scope).
- **From C:** the plan as an editable checklist with gates and dependency warnings ("e reuses o"), "I'll draw this", a re-derive prompt when a source glyph changes, steps that double as bookmarks.
- **Left out of v1:** B's four-region layout and Follow-agent overlay; C's plan rail and "3 variants".

### Layout (T1 ≥1100, designed at 1280×800)

- **Header (48px):** Noddy · project name · Set chip ("Latin Kernel · 61/117") · Run chip (only while a run exists: "Drafting b · 41/117 · Pause · Stop") · File · Export.
- **Spec readout (40px, sticky over the centre):**
  - One line: "UPM 1000 · x 500 · Cap 700 · Asc 750 · Desc −250 · Overshoot 12 · Stems n88 o96 H96 O104 · Proportional".
  - Click a number to edit it in place. Each edit is one history step and draws as guides in the proof and on the canvas.
  - Agent proposals appear in peach with Accept and Edit.
- **Proof band (top of the centre, fixed height, resizable divider):**
  - Presets: **All sets** (default, one line per group) · Spacing · Text · Waterfall.
  - A Follow line sets the active glyph in context (`nnbnn oobo HbH`).
  - A Space row shows LSB · advance · RSB, editable inline.
- **Set grid (rest of the centre):**
  - Groups with counters ("a–z 18/26 · 4 drafts").
  - Fixed 72px cells, each with a fixed-width text status slot.
  - Filters: Empty · Agent draft · Yours · Held · Failed.
- **Agent pane (docked right, `clamp(340px,28vw,420px)`, shared tokens):** model row, run card, collapsible plan, timeline grouped by glyph, composer with a scope chip and a "Will send" line.
- **Glyph editor:**
  - Opens in the grid's exact box, with the same edges, so nothing reflows. The proof band and agent pane stay visible.
  - It hosts the single existing edit canvas, the tool rail and the stacked inspector.
  - Header: glyph and name, owner badge, ‹ › for previous/next, Before/After, Underlay, Close.
  - Clicking any letter in the proof switches the editor to that glyph.

**Narrower windows**
- **760–1099px:** the agent pane becomes an overlay drawer, so it never squeezes the editor.
- **Under 760px:** monitor mode: proof, grid, run card, Keep/Revert, Pause/Stop. The pen is disabled and says why. The agent opens as a bottom sheet.
- **Under 620px tall:** the proof shrinks to one line.

### Key states

- **Cell statuses (text plus colour, never colour alone):** Empty · Queued #n · Drafting · Agent draft · Kept · Yours · Held · Failed (reason).
- **Cell tags:** "from (" for derived glyphs; "Empty by design" for space and NBSP, which show a width bar instead of a blank.
- **Run states:** idle · planning · waiting for you (gate) · running · waiting (pacing, "Waiting 12 s") · paused (by you, budget cap or error) · interrupted · done.

### Core flows

1. **New font:** Welcome › New: name and set (Latin Kernel by default), then **Start with agent** or **Draw myself**. You land on the galley with 117 ghost cells. Manual tools work with no model connected.
2. **Agent build:**
   1. Write a brief and attach images. You map each image to the characters it shows.
   2. The agent proposes a spec, which appears in the spec bar.
   3. The plan appears in the pane. You can drag, strike out or hold glyphs, or mark them "I'll draw this". It shows an estimate and a budget cap.
   4. The agent draws the controls **n o H O**.
   5. **Gate:** Approve style · Ask for changes · Edit by hand.
   6. The agent works through the families, then does a spacing pass.
   7. Review, then export.
3. **Manual edit:** click a cell, or a letter in the proof (or press Enter on a focused cell).
   - An empty glyph opens with the **Pen** selected; a drawn glyph opens with **Path edit** selected.
   - Close or Esc returns to the grid. If you changed the glyph, it becomes **Yours**.
   - Select a contour or points, then "Ask agent about this".
4. **Global change ("make it bolder"):**
   1. The agent explains that the weight setting is only metadata and outlines must be redrawn.
   2. It shows a spec diff plus a Proposal line rendered from uncommitted drafts.
   3. Scope: Agent drafts · + Kept · + Yours. The last two are off by default.
   4. A "Before bolder" checkpoint is saved automatically, then one job runs per glyph.
5. **Export:** preflight → fix issues through their links → you export → "Proof exported file" loads the built font into the proof.

### Live preview

- A new `itemChanged{id}` signal fires on agent commits, manual edits and undo/redo.
- Grid cells re-fetch their glyph by ID, because a commit replaces the glyph object.
- The proof redraws with a 150ms debounce.
- Agent commits are atomic per glyph, so **the proof only ever shows whole letters**.
- The **Drafting cell** shows the agent's in-progress draft with a hatched "draft" treatment. You can watch a letter form without half-letters reaching the proof.
- Missing glyphs show as dashed boxes that keep their width, so lines never jump.
- A "Real font" check builds the actual font in memory (`buildFontBuffer`) at gates or when idle.

### Character-set scope

- The Set chip opens a picker: Basic Latin 95 · **Latin Kernel 117** · Latin Core ("v2", greyed). Before switching it shows what changes: added glyphs, how many are drawn vs assembled, and the cost.
- Only you can change the set. If the agent is asked for something outside it, it replies in one line (`OUT_OF_SET`) with a "Change set…" button and makes no partial attempt.
- Removing characters never deletes outlines. They move to a collapsed "Outside set" group that the agent cannot touch, and export asks about them.

### Concurrency

- The agent targets glyphs by ID. It never moves your selection, view or focus.
- **Open in the editor = Yours while open.** The agent cannot commit to it, and the queue skips it and comes back later.
- **If the agent is drafting the glyph you open:** a banner reads "Agent is drafting g · Watch · Take over". Watch shows the draft read-only. Take over discards the agent's draft.
- **On close:** if you changed it, it stays Yours and later runs skip it. If you didn't, it goes back to the queue.
- **Conflicts pause at the next glyph boundary:**
  - Spec change mid-run: "31 drafts use x-height 500 · Rescale · Keep · Undo change".
  - Editing an approved control: "9 drafts were built from n · Re-derive · Keep".
  - After two stale reads on one glyph, it is skipped and re-queued.

### Undo

- **One history.** Each agent glyph job is one entry ("Agent · b"). Each manual gesture or inspector edit is its own entry (needs the inspector-undo fix first).
- In the editor, Cmd+Z only undoes changes to the open glyph, so it never jumps between glyphs.
- Undoing an agent edit during a run counts as a rejection. That glyph is held, with "Retry with a note · Leave to me".
- History lists named checkpoints: Before run · Spec approved · Controls approved · Before bolder. Each offers **Revert run** and **Revert glyph to before run**.
- **Pause** finishes the current glyph. **Stop** throws away the unfinished draft. **Esc and Hide never stop a run.**

### Onboarding and model connection

- A Connect card inside the pane:
  - curated models with Tools / Vision / Free / Paid badges
  - a Custom model ID under Advanced, which shows the protocol it resolved to
  - the key, kept in memory only
- **Check connection** states that it makes a tiny billed call, then runs a tool-calling probe. Errors show inline and your draft is kept.
- After a reload, a banner keeps the provider and model and asks only for the key.
- First-run disclosure of what leaves your machine. On each send: "Will send: brief + 1 image + 4 outlines → OpenAI".
- Every turn ends with a receipt built from what Noddy actually changed ("0 edits applied" if nothing happened), whatever the model's text says.

## 3. v1 character set

- **The name you asked for:** those 95 characters are the Unicode **Basic Latin** block, also called **printable ASCII** (U+0020–007E).
- **The standard for "English plus some symbols"** is Google's **GF Latin Kernel**: 116 characters, plus `.notdef` = **117 glyphs**.
- UI label: **"Latin Kernel (English)"**. DEL is excluded. Verify the list against `googlefonts/glyphsets` `GF_Latin_Kernel.nam` before it ships.

| Group | Characters | Count |
|---|---|---|
| Uppercase | A–Z | 26 |
| Lowercase | a–z | 26 |
| Figures | 0–9 | 10 |
| Punctuation | `. , : ; ! ? ' " - ( ) [ ] { } / \ _` ‘ ’ “ ” – — … · • | 27 |
| Symbols | `# $ % & * + < = > @ ^ \| ~` `` ` `` × ÷ − ¢ £ ¥ € © ® ™ ° | 25 |
| Spaces | space, NBSP | 2 |
| Unencoded | .notdef | 1 |

Workload: 2 empty, about 25 derived from other glyphs, about 89 drawn from scratch.

**Drawing order the agent follows** (gates in bold):
0. Spec: metrics, overshoot, stems. **Gate.**
1. Controls n o H O. **Gate: Approve style.**
2. Lowercase: h m u l i j r → b d p q c e → a g s f t → v w y x k z → lowercase spacing proof (`nnonnoo`, `hamburgefontsiv`). Optional gate.
3. Capitals: I L E F T → C G D Q → B P R J U S → V A W X Y K N M Z. Optional gate.
4. Figures: 0 and 1, then 2–9, all one width (tabular).
5. Core punctuation `. , ' ! ? : ;`, then the derived ones: quotes, … · • - – — −.
6. Brackets and slashes `( ) [ ] { } / \ _ |`; the closing forms are mirrors.
7. Math: `+ − × ÷ = < > ~ ^`.
8. Symbols: `# $ % & @ * ` ° © ® ™ ¢ £ ¥ €`.
9. space, NBSP, .notdef; then the global spacing pass. Kerning pairs are reported only in v1.

## 4. Clickable prototype scope

**How it's built:**
- Standalone HTML (a private artifact or `docs/prototype/`), not wired to the engine.
- Uses the real tokens from `src/common/colors.css`, Google Sans Flex and Code, Material Symbols Rounded, and the 4px grid.
- Glyphs are real outlines (a subset of an OFL sans, rendered as SVG), so letters look like letters.
- Shown at 1280×800, 1024×768 and 390×844.
- A state menu jumps between states.
- Regions have fixed sizes, hover changes paint only, and focus rings are never clipped. All of this is measured.

| # | Screen | Shows | Faked interactions |
|---|---|---|---|
| 1 | New font | Name, set picker, Start with agent / Draw myself | Pick a set, continue |
| 2 | Empty galley + Connect | 117 ghost cells, default spec, Connect card | Pick a model, type a key, Check connection (states: checking / ok / wrong key / no tool calling) |
| 3 | Brief + reference | Image chip, "Which characters are in this image?", crop boxes, "Will send" line | Map crops to characters, toggle the vision warning |
| 4 | Plan + spec proposal | Peach values in the spec bar, plan checklist, queue numbers on cells, estimate and cap | Accept the spec, drag/strike/Hold, "I'll draw this", Run |
| 5 | Control gate | n o H O drafted, proof on Spacing, measurements and checks | Approve / Ask for changes / Edit by hand |
| 6 | Mid-run | Scripted timer moves cells Queued → Drafting (live draft) → Agent draft; proof updates per glyph; timeline receipts; "Waiting 12 s" | Pause, Stop, Hide pane (run continues), expand a receipt |
| 7 | Editor on a free glyph | Editor in the grid's box, Pen ready, stacked inspector, guides, context line | Switch tools, ‹ › previous/next, click a proof letter to retarget, Close → Yours |
| 8 | Take over | "Agent is drafting g" banner | Watch (read-only draft), Take over → draft discarded |
| 9 | Conflict cards | Undo counted as rejection; x-height change mid-run; stale skip | Card actions |
| 10 | Review in place | "Agent draft" filter, onion-skin in the editor | Keep / Revert / Ask, Keep all for a group |
| 11 | "Make it bolder" | Spec diff, Proposal line, scope picker, estimate, checkpoint | Change scope, Apply |
| 12 | Export preflight | Missing-glyph chips, checks, test compile | Open a missing glyph, Export draft anyway, Proof exported file |

**Edge-case states to include in the state menu:**
- out-of-set reply
- budget cap paused
- interrupted run ("Interrupted at 41/117 · Resume · Keep drafts · Discard")
- "Not autosaving"
- relay offline vs provider down
- image sent to a model without vision ("Send without image")
- space width bar
- "Uses component — manual only" tag
- T2 drawer
- T3 monitor mode with the pen disabled

## 5. New native agent tools

| Tool | Purpose | Pri | Engine mapping |
|---|---|---|---|
| `get_context` (extend) | Add spec, set, statuses, owners | P0 | `agent/native-tools.js` |
| `get_font_spec` / `propose_font_spec` | Read the spec; propose a diff that you accept | P0 | `settings.font` `glyphr_studio_project.js:88-121` + a new design-spec store; whole-project history |
| `get_set_status` | Coverage, statuses, holds, owners | P0 | New `CharacterSet` |
| `create_glyph(cp)` | Create a glyph without navigating; `OUT_OF_SET` | P0 | `addItemByType` :374 (never `getItem(force)`) |
| `begin_glyph` / `submit_glyph(id, note)` | Draft copy, then validate and commit as one history entry | P0 | Candidate + transaction `native-tools.js:146-268` |
| `replace_paths` / `delete_paths` | Swap or remove contours | P0 | Candidate paths |
| `transform_paths` (extend) | Scale, rotate, skew, flip | P0 | `path.js` :519, :634, :651, :1079/1102 |
| `add_svg_path` | SVG `d` → native paths | P0 | `svg_outline_import.js:17` + y-flip + `reverseWinding` |
| `render_glyphs` / `render_text` | PNGs with guides | P0 | `drawGlyph` `draw_paths.js:22` (remove the :39-45 side effect), `TextBlock`, OffscreenCanvas |
| `check_outlines` | Winding, self-intersections, duplicates, specks, extents | P0 | `findWinding` path.js:962, `findSegmentIntersections` poly_segment.js:566 |
| `set_spacing` (extend) | Several glyphs per call | P1 | glyph.js :582/593 |
| `measure_set` | Bounds vs guides, stems at a given y, overshoot, whole set | P1 | New, built on path bounds |
| `edit_points` | Points, handles, point type | P1 | `path_point.js` :261, :242, :313/390, :628; lock check `assertMoveAllowed` :438 |
| `derive_glyph` | Copy + mirror/rotate/scale; remembers its source | P1 | glyph.js :837, :869, :607 |
| `boolean_paths` | Unite, subtract, intersect, exclude | P1 | `combinePaths` `boolean_combine.js:11` |
| `compile_check` | Test-build the font in memory, no download | P1 | `buildFontBuffer` `font_preview.js:98` |
| `update_plan` / `write_glyph_note` | Plan progress; why a glyph changed | P1 | Host plan store |
| `offset_paths` | Offset a contour; always render-checked | P2 | `makeOffsetPolySegment` poly_segment.js:548 |
| `report_kerning_pairs` | Read-only list of pairs that need kerning | P2 | `TextBlock` kern lookup |
| `place_component`, `set_kerning` | v2 | — | `cross_item_actions.js:81`, `KernGroup` |

**Kept by the app, never given to the agent:** the queue and pacer, glyph locks, gates, changing the set, checkpoints, deleting glyphs, export.

## 6. Build roadmap (after prototype approval)

Each milestone ends with a verification packet and a stop for approval (AGENTS.md §5). Milestones marked **(protected)** change protected code and need your sign-off plus tests.

1. **M1 Groundwork (protected):** apply INSPECTOR-UNDO; Hide and Esc no longer stop a run; the context line shows "A" instead of `glyph-0x41`.
2. **M2 A real model, proven:** curated models, Check connection plus the tool probe, receipts from native results, reconnect banner, distinct errors for offline / relay / provider. Done when a real provider runs read plus `set_spacing` end to end. No real model call has been tested yet.
3. **M3 CharacterSet and set grid:** verified Kernel list, groups and counters, ghost cells, status field, Set chip and picker.
4. **M4 Live everywhere:** `itemChanged{id}`, tiles re-fetch by ID, proof band with presets and Follow line, debounce.
5. **M5 Shell:** header, editable spec readout with history, agent pane docked and on shared tokens, no full-page rebuilds; T2 and T3 behaviour.
6. **M6 Editor in place (protected):** host the single canvas in the grid's box, decouple `nav.page`, keyboard-scope guard, fit bounds, stacked panels, per-glyph undo in the editor.
7. **M7 Agent eyes (read-only):** spec and set status, render, measure, outline check, compile check.
8. **M8 Atomic glyph writes (protected):** create, begin/submit, replace/delete, extended transforms, SVG paths, per-glyph revisions, ownership lock, Take over. Done when the agent draws n and o and you take over o mid-draft cleanly.
9. **M9 Shape tools:** `edit_points`, `derive_glyph`, `boolean_paths`, multi-glyph spacing.
10. **M10 Runs:** plan checklist, queue, pacer, Pause/Stop, Run chip, estimate, meter and cap, gates.
11. **M11 Review and checkpoints (protected):** Agent draft/Kept, Before/After onion-skin, Keep all, named checkpoints, Revert run/glyph, re-derive prompt.
12. **M12 Resilience:** run record and resume, autosave once per job to IndexedDB, "Not autosaving" status, leave-page warning, two-tab guard.
13. **M13 Export preflight:** coverage, checks, metrics that cover every glyph, Proof exported file.

## 7. Open questions for you

1. **Review:** agent edits apply live, as PLAN.md says. Should each agent glyph also stay marked "Agent draft" until you press Keep (with Keep all per group), or is it simply done unless you undo it?
2. **Editor placement:** should the editor open over the set grid with the proof always visible (recommended), or should the canvas stay permanently in the middle like Glyphs or Cursor? The prototype can show both on screen 7.
3. **Default set:** Latin Kernel (117, with curly quotes, dashes, €, ©) or plain Basic Latin (95)?
4. **How hands-off:** should the agent stop only at the spec and the control glyphs, or also after lowercase and after capitals? And what spend cap per font feels right?
5. **First kind of font:** text sans, serif, display or pixel? This sets the drawing order, the spec fields and the sample glyphs in the prototype.