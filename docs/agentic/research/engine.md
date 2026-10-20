Paths are relative to `/Users/kshitij/Documents/cursor shit/font agent/noddy-agent-plan/src/` (branch `codex/native-agent-plan`).

## 1. Native operations

**Safe** = works on a detached candidate glyph and commits through the agent transaction (`agent/native-tools.js:146-160, 178-268`). **Wrap** = the logic is fine, but the entry point is tied to the UI or selection. **No** = don't expose.

| Area | Main functions | Fit |
|---|---|---|
| Font settings/metrics | `settings.font.{upm,ascent,descent,capHeight,xHeight,overshoot,italicAngle,weight}` `project_data/glyphr_studio_project.js:88-121`; the UI assigns directly with no history (`pages/settings.js:99-104`) | Wrap: allowlisted setter plus whole-project history. Weight and italicAngle are metadata only. |
| Glyph lookup/create/delete | `getItem(id, force)` :289 (when forced it creates the glyph and writes history, so never use it as a read); `getItemID(chars)` :349; `addItemByType` :374 → `incrementRangeCountFor` :414; `editor.deleteItem` `project_editor/project_editor.js:640`; the `selectedGlyph` getter :251 and `selectedGlyphID` setter :469 create glyphs implicitly | Create: Safe via `addItemByType`. Delete: Wrap (needs `resolveItemLinks` and a confirmation). |
| Glyph metrics/transforms | `project_data/glyph.js`: LSB/RSB get :299/308, set :582/593; `setGlyphPosition` :607; `set/updateGlyphSize` :657/698; `skewAngle` :804 (skips components); `flipNS/EW` :817/837; `rotate` :869; `roundAll` :854; `reverseWinding` :883 | Safe |
| Paths | `addOneShape` glyph.js:446; `project_data/path.js`: `set/updateShapePosition` :582/602, `set/updateShapeSize` :494/519, `rotate` :634, `skewAngle/Distance` :651/679, `flipNS/EW` :1079/1102, `findWinding` :962, `reverseWinding` :1056, `addPathPoint` :1134, `insertPathPoint(n,t)` :1152, `mergePathPoints` :1222, `addPointsAtPathIntersections` :936. Paths are always closed. Identity is by index only. | Safe |
| Points/handles (pen internals) | `path_point.js`: `updatePathPointPosition('p'/'h1'/'h2',dx,dy)` :261 (moving p carries the handles), `type` setter :242, `makeSymmetric/makeFlat` :313/390, `makePointedTo` :569, `resetHandles` :628. The pen tool (`Tool_NewPath`) adds to `editor.selectedItem` (`edit_canvas/tools/new_path.js:59`) and records history per point (:148). | Safe as an `edit_points` tool. Low-level moves ignore locks, so the gate must check them (`assertMoveAllowed` native-tools.js:438). Don't drive the pen tool itself. |
| Boolean | `combinePaths(paths, unite/subtract/intersect/exclude/divide)` `project_editor/boolean_combine.js:11` is pure in/out. The UI path goes through selection plus setTimeout (`multiselect.js:546`, `actions.js:243`). | Safe on candidate paths. Only the first loop per path is converted (:59). |
| Offset | `path.makePolySegment().makeOffsetPolySegment(d).path` (`poly_segment.js:548`); the UI is the Transforms panel (`panels/transforms.js:219`). There is no expand-stroke because there are no open paths. | Safe-ish. Quality is heuristic, so render-check the result. |
| Components | `ComponentInstance` (translate, resize deltas, flip, rotate) `component_instance.js:18,133`; `insertComponentInstance` `project_editor/cross_item_actions.js:81`; cycle check :174; `resolveItemLinks` :253; `glyphChanged` cascade :24 | Wrap: these use the global project. The agent currently rejects component glyphs (native-tools.js:149-155) and reused glyphs (:426). |
| Kerning | `KernGroup{leftGroup,rightGroup,value}` (class-style) `kern_group.js:18`; add `pages/kerning.js:220`; the renderer applies the first match (`display_canvas/text_block.js:434`) | Wrap: needs an overlap/conflict check. Negative values tighten. |
| History | `addState` snapshots `editor.selectedItem` and depends on the current page (`project_editor/history.js:39,330`); `addWholeProjectChangePre/PostState` :56/75 store a full copy of the project; `restoreState` navigates when the item differs (:146) | Use the agent adapter. A whole-project copy per edit won't scale (there's already an 8 MB guard at native-tools.js:137). |
| Bulk | `glyphIterator` `pages/global_actions.js:148` uses a setTimeout chain, toasts and swallowed errors, and writes the Post state (:239) before the Pre state (:196). Cards for move, scale, skew, side bearings, monospace, all caps and diacritics are in `global_actions_cards.js:34-935`. | No as-is. Reuse the per-item callbacks inside an atomic batch. |
| Import | `validateSingleFileInput` `formats_io/validate_file_input.js:34`; `ioFont_importFont` `otf/font_import.js:69`; SVG → Glyph via `ioSVG_convertSVGTagsToGlyph` `svg_outlines/svg_outline_import.js:17` (y-down, so the caller flips and reverses winding, `edit_canvas/events_drag_drop_paste.js:21-22`) | SVG `d` → native paths is a strong agent primitive, easier for an LLM to write than point JSON. |
| Export | `ioFont_exportFont` `otf/font_export.js:81` → `saveFontFile` :283 (downloads; module state is mutable); only enabled ranges are exported (:548); `.notdef` is added automatically (:632). In-memory compile with no download: `FontPreviewBuilder.buildFontBuffer(text)` `controls/font-preview/font_preview.js:98` | Saving and exporting stay with the user. `buildFontBuffer` is Safe as a compile check. |
| Rendering | `drawGlyph(glyph, ctx, view)` `display_canvas/draw_paths.js:22` draws into any 2D context with a nonzero fill (:52), but it has a side effect: it deletes component instances with broken links (:39-45). Also `TextBlock({project,ctx,options})` layout with kerning and ligatures (`text_block.js:15`; the kern lookup uses the global project, :444); `glyph.svgPathData` :899; `makeItemThumbnail` SVG glyphr_studio_project.js:543 (hardcoded 50px) | Feasible: OffscreenCanvas + `drawGlyph`/`TextBlock` → PNG for a vision model. No such helper exists yet. |

## 2. Live preview and grid today

- **Edit canvas** subscribes to every topic (`edit_canvas/edit_canvas.js:117`). The agent commit publishes `currentItem` (native-tools.js:227), so the canvas and inspector already update live. ✓
- **Pop-out preview window** subscribes to every topic (`project_editor/pop_out_window.js:58`), and `redrawPopOutWindow` (:194) rebuilds the text. For the OTF/TTF flavors it recompiles a font from only the glyphs in the text (`font_preview.js:470`). It updates live ✓, but in a separate browser window, and it recompiles on every publish with no debounce.
- **Live preview page** (`pages/live_preview.js:13`) is its own nav page, rebuilt only when options change (:73). It can't be visible while you edit and has no subscription. ✗
- **Overview preview** (`pages/overview.js:56-65`) is a static `<display-canvas>` that redraws only on attribute changes. ✗
- **Glyph grid** (`panels/item_chooser.js:235`, on Overview and in the nav dropdown): each `GlyphTile` keeps the glyph object it was built with, renders once (`controls/glyph-tile/glyph_tile.js:34,118`) and listens only for selection changes (:255). Agent commits *replace* the glyph object (native-tools.js:212), so tiles would be stale even if redrawn. ✗
- Every pub/sub topic means "current/selected" (`pub_sub.js:29-51`). There is no "item X changed" topic. Publishing `currentItem` for a glyph that isn't selected would make the inspector show the wrong glyph.

**Making it live is cheap:**
- Add an `itemChanged{id}` topic, emitted by agent commits and by undo/redo.
- `GlyphTile.redraw()` re-fetches the glyph by ID.
- `display-canvas` already exposes `updateTextBlock()` and `redraw()`.
- Debounce font-preview rebuilds (~150 ms).

## 3. Edit canvas and pen tool as a popover

The canvas is mounted as `<edit-canvas editing-item-id>` inside the Characters page template (`pages/characters.js:44`). That page also wires the tools, panels and canvas subscriptions (:97-132). How tightly it is coupled:

1. **Singleton.** `editor.editCanvas = this` (edit_canvas.js:114) and the fixed subscriber ID `editCanvas-all` (:117), so a second canvas overwrites the first.
2. **Selection follows the page.** The canvas draws `editingItemID`, but tools, multi-selection, panels and history use `editor.selectedItem`, which depends on `nav.page` (`project_editor.js:208`). On Overview it returns `false`, so the pen breaks.
3. **Global state and keyboard.** `eventHandlerData` is module-global (`edit_canvas/events.js:19`). Each mount adds another document-level key listener (:81-82). Delete, arrow keys and Ctrl+Z would fire while the agent input has focus unless guarded.
4. **View and fit.** Zoom/pan is stored per `selectedItemID` (project_editor.js:775). Autofit reads `.editor-page__edit-canvas-wrapper` from the DOM (:991).
5. **Navigation wipes the page.** `navigate()` clears `#app__wrapper` (`navigator.js:97-113`), so a popover must live outside it, as the agent window already does on `document.body`.
6. **Undo can navigate** the main view (history.js:146).
7. **Opening creates.** Selecting a glyph that doesn't exist yet creates it (project_editor.js:251,469).
8. **Race with the agent.** An agent commit swaps the glyph object and rebinds only the multi-selection (native-tools.js:215-225). An in-progress pen path (`Tool_NewPath.newPath`) or drag would keep pointing at the orphaned old glyph.

**Feasible design:** don't build a second canvas. Make the popover the only host for the existing canvas, tool strip and inspector. Opening a glyph sets the Characters selection semantics without rebuilding the page, while the grid and preview stay underneath. This requires:
- separating `nav.page` from which DOM page is showing;
- a parameterised wrapper for bounds;
- a keyboard-scope guard;
- a per-glyph mutation lock, so the agent can't commit to glyph X while the user is mid-gesture on X.

## 4. Character ranges

- **Model.** `CharacterRange{begin,end,name,enabled,count}` (`project_data/character_range.js:15`), saved as hex in `settings.project.characterRanges` (:114). On load it's hydrated at glyphr_studio_project.js:161-172; the default is Basic Latin.
- **Blocks.** `lib/unicode/unicode_blocks_0_bmp.js:3-5` lists Basic Latin 0x20–0x7F, Latin-1 Supplement 0xA0–0xFF, Latin Extended-A/B and so on. `getParentRange` is at `unicode_blocks.js:81`.
- **Basic Latin is special-cased.** The generator yields `basicLatinOrder`: A–Z, a–z, 0–9, punctuation, then space. That's 95 characters, without DEL (character_range.js:85,175).
- **UI.**
  - Settings › Project range tables: `pages/settings_project.js:53-122`; Unicode dialog :763; custom range :505.
  - Range dropdown in the chooser: item_chooser.js:194.
  - Default range: Basic Latin (project_editor.js:365-401).
  - Global actions filter by range: global_actions.js:220.
  - Export uses only enabled ranges: font_export.js:556.
- **Counts drift.** `count` only goes up through `addItemByType`. Implicit creation and deletion don't update it, so it needs a recount (`updateAllCharacterRangeCounts` :477).
- **The technical name you asked for** is the **Basic Latin** Unicode block, which is the same as **printable ASCII**: U+0020–U+007E, 95 characters (52 letters, 10 digits, 32 punctuation/symbols, space). Fonts also need `.notdef`, which export adds automatically. Google Fonts calls its smallest Latin glyph set "GF Latin Kernel". The natural v2 is Latin-1 Supplement; diacritic generators already exist (`global_actions_cards.js:864,935`; maps `unicode_mappings.js:31,122`).

## 5. Gaps for building a whole set

1. **Scope.** A session is bound to one selected glyph on the Characters page (native-tools.js:29,125-129). It allows 64 calls (:109), and the controller allows 8 tool calls per 120 s (`agent/agent-controller.js:49-50`). Needed: explicit glyph targets, `create_glyph(codepoint)` without navigating, and a long-running job (plan → per-glyph steps → progress, pause and resume).
2. **Missing writes.** Replacing or deleting paths, `edit_points`, scale/rotate/skew/flip, boolean, offset, SVG-`d` import, metrics across many glyphs, kerning, components and font settings.
3. **Batch transactions.** Each glyph should commit atomically as one history entry, without a full-project copy per edit (history.js:330; plus the agent's own snapshots, native-tools.js:289). Fix the `glyphIterator` Pre/Post order before reusing it.
4. **Shared design parameters.** Only vertical metrics exist. `overshoot` is never drawn as a guide, and `stemv`/`stemh` are only SVG-font metadata. Custom guides are global and limited to 0° or 90° (`project_editor/guide.js:8`). Needed: a project "design spec" (stems, contrast, overshoot, round/straight bearing classes) that the agent reads first and the canvas draws.
5. **Spacing consistency.** There is no metric linking (for example o's LSB = n's RSB) and no spacing classes. Kern groups use the first match with no conflict detection.
6. **Components.** The engine supports them, but the agent rejects them. They're needed for shared parts (i/j dots, serifs) and later for accents, and they need `usedIn` and the `glyphChanged` cascade kept correct.
7. **Self-review rendering.** Add `render_glyphs(ids)` and `render_text(str)` that return PNGs, with metric guides. `drawGlyph` must be made side-effect-free first. Also add numeric proof data: bounding box against the metrics, and measured stems.
8. **Validation.** Today the only checks are point-proximity checks, off by default (`project_editor/quality_checks.js:4-19`). Missing checks:
   - contour direction consistency (the fill is nonzero; `findWinding` exists);
   - overlaps and self-intersections (reuse `findSegmentIntersections`, `poly_segment.js:566`);
   - missing extrema;
   - duplicate or zero-length points;
   - outlines outside ascent/descent plus overshoot;
   - zero advance or empty glyphs;
   - coverage against the target set;
   - a compile check through `buildFontBuffer`.

   Open paths can't occur.
9. **Global coupling.** `getCurrentProject()` is called inside `CharacterRange.generator`, the `TextBlock` kern lookup, `drawGlyph` and component resolution. Run agent operations only against the active editor.