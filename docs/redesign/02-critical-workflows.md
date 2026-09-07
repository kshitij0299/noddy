# 02 — Critical Workflows (must remain stable)

Source: read-only domain audit of stable baseline. Any UI change touching these needs the §3 gate (domain rationale + tests + highlight + approval).

## 1. Project create / open / save / reload

- Entry: `src/app/open_project.js` (`makePage_OpenProject`, file input/picker/drag-drop, `postValidationCallback`, `importProjectDataAndNavigate`, `handleNewProject`, `handleLoadSample`, `loadProjectFromAutoSave`).
- Validate: `src/formats_io/validate_file_input.js` (`validateSingleFileInput`, TXT/GS2 + font + SVG readers, codes FR*/FF*/SVG*/PF*).
- Import: `src/project_editor/import_project.js` (`importGlyphrProjectFromText`, migrations, `latestVersion` stamp, `new GlyphrStudioProject()`).
- Editor: `src/project_editor/project_editor.js` (`saveProjectFile`, `setProjectAsSaved/Unsaved`, history init).
- IO: `src/project_editor/file_io.js` (`saveTextFile`, `showSaveFilePicker` + Blob fallback, `makeFileName` → `*.gs2`).
- Samples: `src/samples/` (modegg, california_gothic, merriweather_sans, oblegg.gs2, boolean_tests.gs2, simpleExampleProject.json).
- Autosave: `src/app/app.js` (localStorage `GlyphrStudio.autoSaves`, unload guard).

## 2. Glyph / path editing

- Domain: `project_data/glyph.js`, `path.js`, `path_point.js`, `control_point.js`, `coord.js`, `xy_point.js`, `segment.js`, `poly_segment*.js`, `maxes.js`, `glyph_element.js`.
- Tools: `edit_canvas/tools/path_edit.js`, `new_path.js`, `new_basic_path.js` (rect/oval from maxes), `path_add_point.js`, `resize.js`.
- Actions: `project_editor/actions.js` (delete paths/points, move layer, clipboard, combine, select next/prev point), `boolean_combine.js:combinePaths`, `cross_item_actions.js:glyphChanged/resolveItemLinks`.

## 3. Selection / pan / zoom / geometry

- Select: `project_editor/multiselect.js` (`MultiSelectPoints/Shapes`).
- Canvas: `edit_canvas/edit_canvas.js` (`redraw`, `sXcX/sYcY/cXsX/cYsY`), `events.js` (`initEventHandlers`, `eventHandlerData`), `events_mouse.js` (wheel, marquee `selectItemsInArea`, `clickEmptySpace`), `tools/pan.js` + `tools/tools.js` (hit-test, side-bearings).
- View: `project_editor.js` (`view {dx,dy,dz}`, `updateViewZoom/setViewZoom/makeAutoFitView/autoFit*`).
- Draw: `display_canvas/draw_paths.js`, `display_canvas.js`, `detect/draw_edit_affordances.js`, `context_characters.js`.

## 4. Undo / redo

- `src/project_editor/history.js`: `History {addState, addWholeProjectChangePre/PostState, restoreState, jumpToState, redoState, updateAfterSaveState}` + `makeHistoryEntry` (per-item clone vs whole-project snapshot; `queue/redoQueue`; nav-aware itemID/page). Ordering of addState calls is load-bearing.

## 5. Keyboard shortcuts

Defined in `src/edit_canvas/events_keyboard.js` (`handleKeyPress/Up`, `getKeyFromEvent`, `handleSpecialKeys`, `nudge`, `getEditMode`; `isFocusedOnInput` guard; Kern early-return). Wired in `events.js:81-82`, `edit_canvas.js:86-87`.
Global: Ctrl+S save, Ctrl+E OTF export, Ctrl+G SVG export, Ctrl+O open, Ctrl+Alt/Q console (dev). Canvas: Space pan, Ctrl+Space overlay, Ctrl+Z/Y / Ctrl+Shift+Z, Ctrl+Plus/Minus/0, Arrows nudge (Shift ×10, Ctrl+Arrows prev/next point), Ctrl+./, next/prev item, Esc close. Edit pages: V/A resize, B/P path-edit, M/R rect, O/Q oval, H/W new-path, U/E add-point, Del/Backspace, Ctrl+A/Shift+A, [/] cycle shape, Ctrl+[/] layer, Ctrl+C/V, Ctrl+R round. Kern page: arrows nudge value.

## 6. Components / ligatures / kerning

- Domain: `component_instance.js`, `kern_group.js`, `glyph.js` (`gsub`, `usedIn`).
- Pages: `pages/components.js` (`makeComponentID`), `ligatures.js` (`makeLigatureID`), `kerning.js` (`makeKernGroupID`, chips), `characters.js`.
- Links: `cross_item_actions.js` (`insertComponentInstance`, `makeGlyphWithResolvedLinks`, `canAddComponentInstance`, usedIn add/remove, kern widths).
- Kern tool: `edit_canvas/tools/kern.js`. Preview kern/ligature resolution: `display_canvas/text_block.js` (`calculateKernOffset`, `findAndMergeLigatures`). OTF: `formats_io/otf/tables/gpos.js`, `gsub.js`, `glyphs.js` (composites).

## 7. Live preview

- `pages/live_preview.js` (renderer, redraw DisplayCanvas), `controls/font-preview/font_preview.js` (`FontPreviewBuilder`, `resizeAndRedraw`, `createFontFaceSource`), `display_canvas/text_block*.js`, `panels/live_preview.js`, `project_editor/pop_out_window.js`.

## 8. Import / export contracts

- Project: `.gs2` (v2 JSON) save/load; `.txt` v1 JSON import-only; plain SVG rejected `[SVG1]`; fonts `.otf/.ttf/.woff` via font-flux; export otf/ttf/woff/woff2/svg.
- Handlers: `otf/font_import.js:ioFont_importFont` + `tables/head/os2/name/post/glyphs/gsub/gpos`; `otf/font_export.js:ioFont_export*`; `svg_font/*_import/_export`; `svg_outlines/svg_outline_import.js:ioSVG_convertSVGTagsToGlyph` + drag-drop-paste handlers.
- Version gates: `parseSemVer/isSemVerLessThan/tryToGetProjectVersion`; reject future `[PF4]`, reject <1.13.2 `[PF5]`; migrations v1→v2 (IDs, LSB/RSB, guides), v2.0→v2.5 (kern `*=-1`); `latestVersion/initialVersion` stamping; `save()` shape `{settings,glyphs,ligatures,components,kerning}` + per-class save; `formatSaveFile` pretty/min; `saveLivePreviews` flag.

## Protected files (summary)

`project_data/*` (schema/save symmetry), `history.js`, `project_editor.js` (view/selection/save), `import_project.js`, `validate_file_input.js`, `file_io.js`, `events_keyboard.js` + `events*.js`, `multiselect.js`, `tools/*.js`, `draw_paths.js` + `text_block.js`, `otf/*` + `svg_*/*`, `cross_item_actions.js`. Item IDs (`glyph-/liga-/comp-/kern-`) and `save()` keys must not change.
