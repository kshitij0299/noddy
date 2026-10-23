# Noddy architecture: codebase map for builders

Read this before you touch code. It maps the Glyphr Studio 2 engine that Noddy is built on, the native agent plumbing, and where each M1–M9 change should land. Every path and name below was checked against `dev` when this file was written. If one has moved, fix this file in the same PR.

Binding rules live elsewhere: [AGENTS.md](../../AGENTS.md) (protected areas, never-break list), [PRODUCT.md](PRODUCT.md), [WORKFLOW.md](WORKFLOW.md).

**Stack:** vanilla JS ES modules and Web Components (no framework), Vite 7, Vitest 4 with jsdom, Node 22 or later. The agent relay uses the Vercel AI SDK (`ai`, `@ai-sdk/*`) on the server side only.

---

## 1. Run, test, build

| Task | Command | Notes |
|---|---|---|
| Install | `npm ci` | Lockfile is fixed. Run it in every fresh worktree (about 30s). |
| Dev server (yours) | `npx vite serve ./src/ --port 53NN --strictPort` | Pick a port from 5300 to 5399. This does **not** rewrite `app_config.json`. |
| Dev server (scripted) | `npm run dev` | Runs `scripts.js dev` first, which **rewrites `src/app/app_config.json`** (`devMode: true`). In dev mode `GlyphrStudioApp.setUp()` auto-loads the Oblegg sample and jumps to the **Live preview** page (`settings.dev` in `src/app/app.js`). |
| Agent relay in dev | (automatic) | `src/vite.config.js` installs `agentRelayPlugin()` from `server/agent/vite-plugin.js`, so `POST /api/agent/step` works on any Vite dev or preview server. |
| Agent relay, production host | `npm run build && npm run agent:serve` | `server/agent/serve.js` serves `dist/` at `http://127.0.0.1:5189/app/` (set `NODDY_AGENT_PORT` to change it). It accepts loopback requests only. |
| Lint | `npm run lint` | `eslint src`. Baseline: 0 errors and 2 known warnings (`src/common/colors.js` unused eslint-enable, `src/project_editor/boolean_combine.js` unused `e`). |
| Unit tests | `npx vitest run` | jsdom plus `vi-canvas-mock` (`vitest.config.js`, `vitest-setup.js`). |
| Relay tests | `npm run test:agent-relay` and `npm run typecheck:agent-relay` | Required when `src/agent/` or `server/agent/` changes. They use `node --test server/agent/*.checks.js` and `tsc -p server/agent/tsconfig.json`. |
| Build | `npm run build` | Runs `scripts.js build` and then `vite build ./src/ --emptyOutDir --base=/app/` into `dist/`. |
| Versions | `npm run ci:versions` | `scripts/check-versions.mjs` |

**Gotchas**
- **Build churn.** `npm run build` (and `npm run dev`) rewrite the tracked files `dist/**` and `src/app/app_config.json`. Afterwards, run `git checkout -- dist src/app/app_config.json && git clean -fdq dist`. Never commit either.
- **Port 5187 is the owner's preview. Never use it**, not even for fixtures. Docs and agents use ports 5300–5399.
- **Linux is case-sensitive; macOS is not.** `src/formats_io/svg_outlines/tests/svg_outline.test.js` imports `./path_A.svg` but the file is `Path_A.svg`, so on Linux that one file fails to load (the other 625 tests pass). PR #4 fixes it. Match file-name case exactly in new imports.
- **Imports outside `src/`.** `vite.config.js` lives in `src/` and imports `../server/agent/vite-plugin.js`. Keep server code free of DOM imports, because the relay runs in Node.
- **Custom elements are defined once.** In tests, guard with `if (!customElements.get('x')) customElements.define(...)`.

## 2. Source map

| Path | What lives there | Key entry points |
|---|---|---|
| `src/index.html` | Single page. Landing splash, `#app__wrapper`, and the global `<link>` stylesheets | `glyphrStudioOnLoad` on `DOMContentLoaded` |
| `src/app/` | App bootstrap, app-level pages (open project, cross-project actions), and the top bar | `main.js` (`glyphrStudioOnLoad`, `registerCustomComponents`, `getCurrentProjectEditor`, `getCurrentProject`), `app.js` (`GlyphrStudioApp`, `appPageNavigate`, `addAutoSaveState`, `updateWindowUnloadEvent`), `menu.js` (`makeAppTopBar`), `open_project.js` (`makePage_OpenProject`, `importProjectDataAndNavigate`) |
| `src/project_editor/` | Per-project app state (not domain). Navigation, pub/sub, history, selection, clipboard, file I/O | `project_editor.js` (`ProjectEditor`), `navigator.js` (`Navigator`), `pub_sub.js`, `history.js` (`History`), `multiselect.js`, `actions.js`, `cross_item_actions.js` (`glyphChanged`), `import_project.js` (`importGlyphrProjectFromText`), `file_io.js` (`saveTextFile`, `saveFile`), `pop_out_window.js` |
| `src/project_data/` | **Pure domain model, no DOM.** Project, glyphs, paths, points, kerning, ranges. Serialization via `save()` | `glyphr_studio_project.js` (`GlyphrStudioProject`, `merge`, `makeItemThumbnail`), `glyph.js` (`Glyph`), `glyph_element.js` (`GlyphElement.changed()`), `path.js`, `path_point.js`, `component_instance.js`, `kern_group.js`, `character_range.js` |
| `src/pages/` | Page makers, one per Navigator page. Each returns an `#app__page` element | `makePage_Overview`, `makePage_Characters`, `makePage_Ligatures`, `makePage_Components`, `makePage_Kerning`, `makePage_LivePreview`, `makePage_GlobalActions`, `makePage_Settings`, `makePage_Help`, `makePage_About` |
| `src/panels/` | Left-column panels on edit pages (Attributes, Layers, History, Guides, …) plus input "cards" | `panels.js` (`makePanel`, `refreshPanel`), `cards.js` (`makeSingleInput`), `item_chooser.js` (glyph grid, `makeAllItemTypeChooserContent`), `actions.js`, `history.js` (`makePanel_History`) |
| `src/controls/` | Reusable Web Components and dialogs | `glyph-tile/`, `font-preview/`, `input-number/`, `fancy-button/`, `option-chooser/`, `option-toggle/`, `info-bubble/`, `tabs/`, `dialogs/` (`showToast`, `closeEveryTypeOfDialog`) |
| `src/edit_canvas/` | `<edit-canvas>`: the glyph editing surface, tools, affordances and **input events** | `edit_canvas.js` (`EditCanvas`, `sXcX`/`sYcY`/`cXsX`/`cYsY`), `events*.js`, `tools/*.js`, `draw_edit_affordances.js`, `context_characters.js` |
| `src/display_canvas/` | `<display-canvas>`: read-only text rendering of project glyphs on a canvas | `display_canvas.js` (`DisplayCanvas`), `draw_paths.js` (`drawGlyph`, `drawGlyphOutlineMode`), `text_block.js` (`TextBlock`, kerning and ligatures) |
| `src/formats_io/` | Import and export: OTF/TTF/WOFF(2), SVG font, SVG outlines, file validation | `otf/font_export.js` (`ioFont_exportFont`, `shouldExportItem`), `otf/font_import.js` (`ioFont_importFont`), `svg_font/*`, `svg_outlines/svg_outline_import.js`, `validate_file_input.js` (`validateSingleFileInput`) |
| `src/common/` | Tokens, CSS reset, DOM and maths helpers, icons, character ids | `colors.css`, `resets.css`, `colors.js` (`designTokens`, `accentColors`), `dom.js` (`makeElement`, `addAsChildren`), `graphics.js` (`makeIcon`), `functions.js`, `character_ids.js` |
| `src/agent/` | Browser half of the native agent (§9) | `native-tools.js`, `tool-definitions.js`, `agent-controller.js`, `agent-window.js`, `agent-composer.js`, `attachments.js`, `provider-config.js`, `font-attachment.js`, `model-list.js` (badges, price and end-date copy, the relay-answer reader), `model-requirements.js` (the ONE place that says which models can run the agent: required and recommended capabilities, filter and order), `connect-flow.js` (pure logic of the stepped connect flow: memory, key trimming, grouping, search, every error's copy), `connect-api.js` (the two relay calls), `ui/agent-connect-card.js` (the three steps and the Connected row), `ui/agent-model-list.js`, `ui/agent-listbox.js` (shared ARIA listbox) |
| `server/agent/` | Node relay: one model step per request, no tool execution | `relay.js` (`createAgentMiddleware`: `/api/agent/step` and `/api/agent/models`), `agent.js` (`generateAgentStep`), `providers.js` (fixed endpoints per provider and protocol, OpenRouter included, and the GET allowlist), `errors.js` (provider failures to `{code, message, status, hint?, detail?}`), `models.js` and `model-catalog.js` (key check plus live model list: OpenRouter from its own API, the rest from models.dev with a 6 h cache), `zen-routing.fixture.js` (the documented Zen table and live list), `model-snapshot.js` (generated by `npm run models:snapshot`), `validation.js`, `tool-schema.js`, `serve.js`, `vite-plugin.js`, `relay.checks.js`, `models.checks.js` |
| `src/lib/` | Third-party data (Unicode names and blocks, Panose) | Do not edit. |
| `src/samples/` | Sample projects (`oblegg.gs2`, `simpleExampleProject.json`, …) | |

**Tests.** Unit tests sit next to code in `tests/` folders: `src/project_data/tests` (15 files), `src/project_editor/tests` (`navigator`, `cross_item_actions`, `boolean_combine`), `src/agent/tests` (`agent-composer`, `agent-controller`, `agent-window`, `attachments`, `font-attachment`), `src/agent/native-tools.test.js`, `src/common/tests`, `src/formats_io/**/tests`, `src/lib/unicode/tests` and `src/controls/font-preview/font_preview.test.js`. Repo-level tests are in `test/`: `roundtrip.test.js` (save/load), `composite_export.test.js`, and `css-typography-guard.test.js` (it fails if global CSS sets font properties on content surfaces; §6). Relay tests are `server/agent/relay.checks.js` (node:test).

## 3. Boot, project open and page navigation

```
index.html  DOMContentLoaded → main.js glyphrStudioOnLoad()
  registerCustomComponents()   option-chooser, option-toggle, display-canvas, fancy-button,
                               font-preview, glyph-tile, info-bubble, input-number, edit-canvas
  addGlobalEventListeners()    window mouseup/resize close menus, choosers and bubbles
  GlyphrStudioApp.setUp()      addProjectEditorAndSetAsImportTarget() → new ProjectEditor()
     ├ dev mode: load a sample, set editor.nav.page and editor.navigate()
     └ else: app.appPageNavigate(makePage_OpenProject)   ← welcome / open screen
```

- **Singletons.** `getGlyphrStudioApp()` returns the one app, `GlyphrStudioApp`. The app holds `projectEditors[]` (at most 2, for cross-project actions) and `selectedProjectEditor`. Always reach state through `getCurrentProjectEditor()` and `getCurrentProject()` (`src/app/main.js`).
- **Opening a project.** The welcome tabs in `open_project.js` (`makeOpenProjectTabs`) end in `importProjectDataAndNavigate(data?)`. It sets `editor.project`, which calls `initializeHistory()` and selects `glyph-0x41`. It then calls `resetSessionStateForAllItems()`, sets `nav.page = 'Overview'`, calls `updateWindowUnloadEvent()` and then `editor.navigate()`. File drops go through `validateSingleFileInput` and the format importers. `.gs2`/JSON go through `importGlyphrProjectFromText` (`src/project_editor/import_project.js`), which runs the v1→v2 and v2.0→v2.5 migrations and then `new GlyphrStudioProject(data)`.
- **Page switching** is a full re-render. Set `editor.nav.page = '<Page name>'`, then call `editor.navigate()`, which calls `Navigator.navigate()`. That clears `#app__wrapper` and appends `makeAppTopBar()` plus `makePageContent()`, an `#app__main-content` wrapping `tableOfContents[page].pageMaker()`. Page names are the keys of `Navigator.tableOfContents` (`src/project_editor/navigator.js`). Entries with `type: 'subtitle'` are menu headings. `'Import & export'` has no page maker. The page dropdown is `makeNavButton_Page` in the same file. It also prunes the panel through `panelsPerPage` and may add a "Navigated to …" history entry. App-level pages (open project, cross-project actions) use `GlyphrStudioApp.appPageNavigate(pageMaker)` instead and have **no top bar**.
- **Consequences.** Every `navigate()` rebuilds the DOM, including the `<edit-canvas>`. Subscriptions are keyed by `subscriberID` and overwrite rather than pile up, so reuse stable IDs. Anything that must survive navigation has to live outside `#app__wrapper`. The current agent window does this by portalling to `document.body`.
- **Layout today.** `#app__wrapper` is a grid of `40px` top bar plus the page (`src/app/app.css`). Edit pages use `.editor__page` (`src/pages/editor-pages.css`): a panel column, a tools column and the canvas. Content pages (Overview, Settings, …) use `.content__page` (`src/pages/content-pages.css`).

## 4. App state and pub/sub

**`ProjectEditor`** (`src/project_editor/project_editor.js`) holds one project's state:
- `project`: the setter re-initialises history.
- `history`
- `nav`: the `Navigator` (`page`, `panel`).
- `selectedGlyphID`, `selectedLigatureID`, `selectedComponentID`, `selectedKernGroupID`, `selectedItem`, `selectedItemID`: page-aware getters and setters. The setters publish `which*IsSelected`.
- `selectedTool`, `multiSelect.shapes` / `multiSelect.points` (`src/project_editor/multiselect.js`), `editCanvas` (the live `<edit-canvas>`), `view` (pan/zoom per item in `_views`), `eventHandlers` (tool instances), `clipboard`, `livePreviews`, `popOutWindow`
- `projectSaved`, `setProjectAsSaved()` / `setProjectAsUnsaved()` (a ` •` suffix on `document.title`), `saveProjectFile()`

**Pub/sub** (`src/project_editor/pub_sub.js`) is mixed into each editor. Use `editor.subscribe({ topic | [topics] | '*', subscriberID, callback })`, `editor.publish(topic, data)` and `editor.unsubscribe({ topicToRemove?, idToRemove? })`. `idToRemove` matches by **substring**. `publish` fans out along a hierarchy. `currentItem` / `currentGlyph` / … also fire `currentItem`, `currentVirtualGlyph`, the specific `current<Type>`, the singleton `currentPath`/`currentPathPoint`, and call **`glyphChanged()`**, which clears caches and recalculates maxes for the glyph and its `usedIn` dependents. `currentPath` and `currentPathPoint*` bubble up to `currentItem`. `which{Glyph,Ligature,Component}IsSelected` clears multi-select. `whichToolIsSelected` closes notations and runs `checkForFirstShapeAutoRSB()`.

| Topic | Emitted by (files) | Notable subscribers |
|---|---|---|
| `currentItem` | `agent/native-tools.js`, `edit_canvas/events_keyboard.js`, `events_drag_drop_paste.js`, `tools/path_edit.js`, `tools/resize.js`, `panels/actions.js`, `panels/card_glyph.js`, `panels/transforms.js`, `project_editor/actions.js`, **`project_editor/history.js`** (after undo/redo), `panels/cards.js` (dynamic topics) | `panels/card_glyph.js`, `layers.js`, `quality_checks.js`, `pages/components.js`, agent `agent-history-project-restoration` |
| `currentPath` | `tools/new_basic_path.js`, `tools/path_add_point.js`, `tools/path_edit.js`, `panels/card_path.js` | `card_path.js`, `layers.js`, `quality_checks.js` |
| `currentPathPoint` (+`.p`/`.h1`/`.h2`) | `events_keyboard.js`, `tools/new_path.js`, `tools/path_add_point.js`, `tools/path_edit.js`, `panels/actions.js`, `panels/card_path_point.js` | `card_path_point.js` |
| `currentComponentInstance` | `tools/path_add_point.js` | |
| `currentKernGroup` | `events_keyboard.js`, `tools/kern.js`, `pages/kerning.js` | |
| `whichGlyphIsSelected` / `whichLigatureIsSelected` / `whichComponentIsSelected` / `whichKernGroupIsSelected` | `ProjectEditor` setters, `panels/actions.js` | `pages/characters.js` (sets the canvas `editing-item-id` and refreshes the panel), `panels/item_chooser.js`, the matching pages |
| `whichShapeIsSelected` | `multiselect.js` `publishChanges()`, `tools/path_add_point.js`, `panels/actions.js`, `panels/layers.js` | pages, `attributes_glyph_edit.js`, `transforms.js`, `layers.js` |
| `whichPathPointIsSelected` | `multiselect.js` `publishChanges()`, `tools/new_path.js`, `project_editor/actions.js` | pages, `attributes_glyph_edit.js` |
| `whichToolIsSelected` | `edit_canvas/events.js`, `tools/tools.js` (`switchToolTo`), `tools/new_path.js`, `tools/path_add_point.js` | `tools/tools.js` |
| `editCanvasView` | `events_mouse.js`, `tools/pan.js`, `tools/resize.js`, `tools/tools.js` (`selectTool`), `panels/cards.js`, `project_editor.js` | `tools/tools.js` |
| `qualityChecks` | `panels/quality_checks.js` | `pages/characters.js`, `panels/quality_checks.js` (not in `allTopics`, so `'*'` misses it) |
| `'*'` | — | `EditCanvas` (`editCanvas-all`, so any topic triggers a redraw), `pop_out_window.js` |

Notes: `cross_item_actions.js` publishes `whatShapeIsSelected`, a typo with no subscribers. **No `itemChanged` topic exists yet** (M1.3). Glyph tiles do not subscribe to anything (§7).

## 5. Edit canvas: hosting, tools, events, selection, pan/zoom

- **Hosting.** `makePage_Characters` (`src/pages/characters.js`) renders `<edit-canvas id="editor-page__edit-canvas" editing-item-id="${selectedGlyphID}">` inside `.editor-page__edit-canvas-wrapper`. Ligatures and Components pages do the same. The element reads `editing-item-id` and on `whichGlyphIsSelected` the page updates that attribute. `attributeChangedCallback` then redraws. `EditCanvas` (`src/edit_canvas/edit_canvas.js`) builds a shadow-DOM `<canvas>` (2000×2000 by default) and on construction sets `editor.editCanvas = this`, calls `initEventHandlers(canvas)` and subscribes `'*'` to `redraw()`. `connectedCallback` calls `editor.autoFitIfViewIsDefault()`. Auto-fit measures `.editor-page__edit-canvas-wrapper` (`ProjectEditor.getEditCanvasWrapperBounds`), so a new host (M3 focus mode) must keep that class or extend this lookup **(P: canvas geometry)**.
- **Redraw** (`EditCanvas.redraw`) runs on `requestAnimationFrame`. It calls `project.getItem(editingItemID)` and `runQualityChecksForItem`, draws guides, then `drawGlyph` / `drawGlyphOutlineMode`, then tool affordances from `draw_edit_affordances.js`, plus context characters (`context_characters.js`) and the kern view for `kern-` IDs.
- **Tools.** `initEventHandlers` (`src/edit_canvas/events.js`) creates `editor.eventHandlers.tool_pan` / `tool_addRectOval` / `tool_resize` / `tool_addPath` / `tool_pathEdit` / `tool_pathAddPoint` / `tool_kern`. These are the `Tool_*` classes in `src/edit_canvas/tools/`. `handleMouseEvents` (`events_mouse.js`) dispatches on `editor.selectedTool`, one of `resize`, `pathEdit`, `pan`, `pathAddPoint`, `newPath`, `newRectangle`, `newOval` or `kern`, and calls `handler[event.type](event)`. Shared drag state lives in the exported `eventHandlerData`. Tool buttons come from `makeEditToolsButtons()` / `makeViewToolsButtons()`. Switching goes through `selectTool(name)` / `switchToolTo(name)` in `tools/tools.js`. For the M3 tool pill, **call `selectTool()`**. Don't set `selectedTool` directly.
- **Keyboard.** `initEventHandlers` adds `document` `keydown`/`keyup` listeners (`handleKeyPress`, `handleKeyUp` in `events_keyboard.js`). They return early when `isFocusedOnInput()` is true. Global shortcuts work on any page: Ctrl+S save, Ctrl+E export, Ctrl+G SVG export, Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo, Esc `closeEveryTypeOfDialog()`. Canvas-only shortcuts follow `if (!editor.nav.isOnEditCanvasPage) return`. UI that takes focus outside inputs (like the agent panel) must `stopPropagation()` on keydown/keyup, or Delete and tool keys will reach the canvas.
- **Selection.** `editor.multiSelect.shapes` / `.points` (`multiselect.js`) offer `select`, `add`, `remove`, `clear`, `members` and `singleton`, and publish `whichShapeIsSelected` / `whichPathPointIsSelected`.
- **Pan/zoom.** `editor.view` (`{dx, dy, dz}`, stored per `selectedItemID`), `updateViewZoom`, `setViewZoom`, `autoFitView`, `makeAutoFitView`. Wheel input goes through `handleMouseWheel`, Space through `togglePanOn`/`togglePanOff`, and the pan tool through `Tool_Pan`. Coordinate conversion uses `sXcX`, `sYcY`, `cXsX` and `cYsY` from `edit_canvas.js`.

## 6. History and undo/redo (`src/project_editor/history.js`, protected)

- `editor.history` is a `History` with `queue` (newest first), `redoQueue` (an array of entry arrays) and `initialProject` (the project as loaded).
- **Single-item edit:** make the change, then call `history.addState(title)`. That snapshots `new Glyph(selectedItem.save())` (a `KernGroup` on the Kerning page) with `itemID` and `page`. Tools do this on mouseup when `eventHandlerData.undoQueueHasChanged` is set (for example `tools/resize.js`, `tools/path_edit.js`). Panels and actions call it after their change.
- **Whole-project edit:** call `addWholeProjectChangePreState(title)` **before** and `addWholeProjectChangePostState()` **after**. These are paired entries holding full `GlyphrStudioProject` copies, and `length` counts the pair as one entry.
- `updateAfterSaveState()` marks the project unsaved, refreshes the History panel, toggles `#actionButtonUndo` / `#actionButtonRedo` and **autosaves** to localStorage (`GlyphrStudioApp.addAutoSaveState`, gated by `settings.app.autoSave`).
- `restoreState()` (undo) installs `q[1].itemState`. For whole-project entries it does this by **replacing `editor._project`**, so object references held by UI become stale. It then publishes `currentItem`. If the previous entry belongs to a different item, it navigates there instead of undoing ("Navigated without undo-ing"). `redoState()` mirrors this. `jumpToState(n)` backs the History panel.
- **Navigation creates history entries** (Overview tile click, prev/next on the glyph card, the page dropdown).
- **Known gap.** Numeric inspector edits (`makeSingleInput` in `src/panels/cards.js`) record no history. The fix is drafted in `docs/agent/INSPECTOR-UNDO-PROPOSAL.md` (M1.2, P).
- **Agent edits** never call `History` blindly. `native-tools.js` `commit()` wraps one tool call as one whole-project pre/post pair, swaps a **detached candidate glyph** into `project.glyphs[id]`, and replaces the two entries' `itemState` with getter snapshots (`captureHistorySnapshot`/`hydrateSnapshot`). Undo then always installs a fresh project and the session flags (`hasChangedThisSession`, `wasCreatedThisSession`) survive. It rolls back fully on error. M6 `begin_glyph`/`submit_glyph` extend it (`commit(targetId, candidate, title, signal, { create })`): one job is one pair titled "Agent · b", a new glyph is added with `addItemByType` inside the pair, and a commit to a glyph other than the selected one publishes only `itemChanged {id}` (no `currentItem`, no panel refresh, selection untouched). The agent's history observer (`ensureHistoryPanelRefresh`) announces `itemChanged` for every changed glyph after a whole-project undo/redo and restores or reapplies a job's Draft status. M8 `commit_ripple` must extend this adapter too, not bypass it.

## 7. Rendering glyphs; UI font vs project font

| Surface | How it renders | Font source |
|---|---|---|
| `<edit-canvas>` | Canvas 2D: `drawGlyph` / `drawGlyphOutlineMode` (`src/display_canvas/draw_paths.js`) | Project outlines |
| `<display-canvas>` (`src/display_canvas/display_canvas.js`) | Canvas 2D text layout via `TextBlock` (kerning from `calculateKernOffset`, `findAndMergeLigatures`). Observed attributes: `text`, `font-size`, `line-gap`, `page-padding`, `show-*-extras`, `width-adjustment` | Project outlines |
| `<font-preview>` (`src/controls/font-preview/font_preview.js`) | `FontPreviewBuilder` compiles the project to a real OTF/TTF binary via FontFlux. `createFontFaceSource` then loads it as a `FontFace` and shows it in a shadow-DOM `<textarea>` | Compiled project font |
| `<glyph-tile>` (`src/controls/glyph-tile/glyph_tile.js`) | Shadow DOM. If the glyph has shapes, it renders the inline SVG from `project.makeItemThumbnail(glyph)` (50px, `svgPathData`); otherwise the **character in the UI font** as a placeholder. Built once in the constructor. `redraw()` re-reads `this.glyph`, but **nothing calls it on change**, and after an undo that replaces the project the tile still holds the old glyph object. Used by `panels/item_chooser.js`. | Project SVG or a UI-font placeholder |
| Overview / Live preview pages | `display-canvas` or `font-preview`, depending on the flavor | Project |

**Separation rule (Contract 2, enforced by `test/css-typography-guard.test.js`).** The UI font (`--font-sans` / `--font-serif` / `--font-mono`, Google Sans Flex and Code with a FiraGo fallback) is applied **only** to chrome selectors listed in `src/common/resets.css` (`#app__wrapper`, `#app__top-bar`, `.editor__page`, controls, …). Global stylesheets must never set `font-family`, `font-variation-settings`, `font-feature-settings` or `letter-spacing` on `*`, `canvas`, `display-canvas`, `font-preview`, `edit-canvas` or `[data-font-content]`. New specimen or tile surfaces that show project glyphs should render from outlines (SVG or canvas) or `font-preview`, and should carry `data-font-content`. A new global stylesheet must be added to `GLOBAL_STYLESHEETS` in that test.

## 8. Styling, custom elements, icons

- **Tokens.** `src/common/colors.css` holds the Noddy OKLCH tokens on `:root` (`--background`, `--foreground`, `--card`, `--primary`, `--secondary`, `--muted`, `--muted-foreground`, `--border`, `--ring`, `--destructive`, `--radius`, `--radius-sm`, `--radius-full`, `--space-1..8`, `--shadow-xs/sm/md`, `--font-sans/serif/mono`). Dark values sit under `.dark, [data-theme='dark']`, but **nothing sets that attribute yet** (the M2 theme toggle would set it on `<html>`). Below them are **frozen** legacy `hsl()` ramps (`--gray-l*`, `--blue-l*`, …) still used by old CSS. Don't edit them; migrate call sites instead. `designTokens` in `src/common/colors.js` is the JS mirror for canvas drawing and must stay in sync.
- **Reset and type.** `src/common/resets.css` `@import`s Google Sans Flex (with the `ROND` axis), Google Sans Code and Material Symbols Rounded. h1–h3 use `--font-serif` with `font-variation-settings: 'ROND' 60`. `:focus-visible` gives a 2px `--ring` outline. Global stylesheets are linked in `src/index.html`. Component CSS is either imported `?inline` into a shadow root (`glyph-tile.css`, `display-canvas.css`) or imported as a side effect (`import './agent-window.css'`).
- **Custom element pattern.** `class X extends HTMLElement` takes a constructor `attributes` object, mirrors it to attributes, `attachShadow({mode:'open'})` and adds a `<style>` from a `?inline` CSS import. Register it in `registerCustomComponents()` in `src/app/main.js`, and in `pop_out_window.js` if it must work in the pop-out. Newer agent UI uses plain DOM factories instead (`element()` / `button()` in `src/agent/agent-composer.js`; `makeElement()` in `src/common/dom.js`). Both styles are fine. Prefer light-DOM plus tokens for chrome so tokens and themes cascade, and shadow DOM only for encapsulated glyph art.
- **Icons.** There are two systems. (1) The legacy `makeIcon({ name, color })` (`src/common/graphics.js`) returns inline SVG strings (`page_*`, `panel_*`, tool icons via `makeToolButtonSVG`). (2) Noddy's **Material Symbols Rounded, outlined** class `.material-symbols-rounded` (`resets.css`, `FILL 0`), currently used only through `fancy-button`. New UI uses (2): `<span class="material-symbols-rounded" aria-hidden="true">undo</span>` next to a label, or with `aria-label` on the host button.

## 9. Agent plumbing: keep vs replace

**Request flow.** The composer submits and `agent-controller.js` `run()` takes over. It creates a `createNativeToolSession()` (`native-tools.js`), which captures the editor and the glyph selected **on the Characters page**. Each step `POST`s `/api/agent/step` (`requestAgentStep`) to `server/agent/relay.js` `createAgentMiddleware`, which checks loopback Host/Origin, enforces size, rate and timeout limits, and calls `agent.js` `generateAgentStep`. That runs one AI SDK `ToolLoopAgent` step with `TOOL_DEFINITIONS` and **no server-side executors**, and returns `{messages, toolCalls, text, finishReason}`. The browser runs `session.execute(name, input, {callId, signal})`, which validates the input (`validateToolInput`) and the revision, edits a detached candidate and commits through history (§6). The loop is capped at 8 tool calls; each model step times out after 5 min in the relay (310 s in the browser). Keys are held in memory only.

| KEEP: plumbing (reuse and extend) | Role |
|---|---|
| `src/agent/native-tools.js` | Session, revision fingerprint, scope check, history transaction adapter (`commit`, `undoLast`, `captureHistorySnapshot`, `hydrateSnapshot`, `captureSessionState`), `ensureHistoryPanelRefresh` |
| `src/agent/tool-definitions.js` | `TOOL_DEFINITIONS` (`get_context`, the M6 read tools `get_font_spec` / `get_set_status` / `render_glyphs` / `render_text` / `check_outlines` / `get_mutation_log`, `read_glyphs`, `set_spacing`, `transform_paths`, `add_paths`), `READ_ONLY_TOOLS` and `validateToolInput`, shared with the relay. Optional arguments are required-but-nullable. `server/agent/tools.checks.js` keeps the relay on the same contract |
| `src/agent/ownership.js`, `render.js`, `outline-check.js` (M6) | Ownership lock (`assertAgentMayWrite` → `LOCKED_YOURS` / `LOCKED_OPEN`, UI-minted grants, `handToAgent` / `takeBack` / `takeOver`, `agentJobSignal`) and the in-memory mutation log; PNG rendering through `drawGlyph` on a detached canvas from glyph copies; outline diagnostics. Render results go to the model as `content` tool results with a PNG `file` part (`toolOutput` in `agent-controller.js`, validated in `server/agent/validation.js`) |
| `src/agent/agent-controller.js` | `createAgentController` (connect, disconnect, run, stop, clear, undo; emits `start`, `text`, `tool`, `error`, `finish`, `connection`, `clear`), `requestAgentStep`, `requireSelectedGlyph` |
| `src/agent/run/` (M7) | Whole-set runs: `run-controller.js` (states idle → plan (gate 1) → controls → style (gate 2) → drafting ⇄ paused → done / stopped; Pause finishes the current glyph, Stop discards only the unfinished draft, spend cap, Yours/open skips, "Before run" checkpoint), `run-order.js` (DESIGN-BRIEF queue order), `glyph-job.js` (one glyph = one `controller.run(…, { job: true, scope: [id] })`; the session's `jobScope` refuses other glyphs), `intent.js` (small ask vs run), `spend.js` (estimate), `review.js` (Keep / Keep all / Revert / Revert run through `commitReview` in `native-tools.js`: one whole-project pair per action, statuses replayed on undo/redo). UI: `ui/agent-run-bar.js` (run bar, inline "Stop run?", checkpoint line), tile actions in `controls/glyph-grid/glyph-tile.js` |
| `src/agent/attachments.js`, `font-attachment.js`, `provider-config.js` | Attachment validation and summaries, open-font-as-project, provider/protocol resolution |
| `server/agent/*` | Relay, provider factory (fixed endpoints), request validation, tool-schema shaping, local server, Vite plugin, `relay.checks.js` |
| `src/agent/native-tools.test.js`, `src/agent/tests/agent-controller.test.js`, `attachments.test.js`, `font-attachment.test.js` | Regression coverage to keep green |

| REPLACE: rejected Codex UI (M4.3) | Exact location |
|---|---|
| Floating agent window | `src/agent/agent-window.js`: `createAgentWindow()` builds `section#noddy-agent-window.agent-window[role=dialog]`, appended to `document.body`. It has a drag handle, a "Connect model" toggle, a × hide button that **stops the run** (PRODUCT says minimize only and never stop), inline connection form, messages, footer "Undo last agent edit" / "Clear chat", Esc→`hide()`. Also `getAgentWindow()` (singleton) and `makeAgentToggle()` |
| Top-bar "Agent" toggle | `src/app/menu.js` `makeAppTopBar()`: `addAsChildren(rightActions, [bugContact, makeAgentToggle()])` |
| Welcome composer | `src/app/open_project.js` `makeOpenProjectTabs()`: the `div#open-project__agent-start.agent-start` holding `createAgentComposer(...)`, which on submit imports a blank project, selects `glyph-0x41`, goes to Characters and calls `getAgentWindow().start(...)`. Also the `.agent-start-button` "Start from scratch with an agent" |
| Codex styles | `src/agent/agent-window.css`, all of it: `.agent-window*`, `.agent-toggle`, `.agent-start`, `.agent-start-button`, `.agent-connection*`, `.agent-messages*`, `.agent-message*`, `.agent-reference`, `.agent-composer*`, `.agent-attachment(s)`, `.agent-button*` |
| Tests to rewrite with it | `src/agent/tests/agent-window.test.js`; parts of `agent-composer.test.js` |

`src/agent/agent-composer.js` (`createAgentComposer`: textarea, attachments, drag/drop/paste, busy state) is UI. The new panel's composer may reuse its logic, but restyle it with tokens and drop the `.agent-*` Codex look. Current scope limits to plan around: a session can only write the glyph selected on **Characters** (`writable` needs `nav.page === 'Characters'`). Glyphs with component instances or dependents are rejected. There is no glyph creation, font-wide tool or status awareness yet (M6).

## 10. Protected areas (AGENTS.md §3): exact paths

| Area | Paths |
|---|---|
| Domain model and serialization | `src/project_data/**` (especially `glyphr_studio_project.js` `save`/constructor/`merge`, `glyph.js` `save`), `src/project_editor/import_project.js` (migrations), `ProjectEditor.saveProjectFile` |
| Import/export | `src/formats_io/**`, `src/project_editor/file_io.js` |
| Canvas events and interaction | `src/edit_canvas/events.js`, `events_keyboard.js`, `events_mouse.js`, `events_drag_drop_paste.js`, plus behaviour in `src/edit_canvas/tools/*`, `detect_edit_affordances.js`, the `edit_canvas.js` geometry helpers |
| Undo/redo | `src/project_editor/history.js`, and any change to *when* `addState` is called (`src/panels/cards.js`, `actions.js`, tools), plus the agent adapter in `native-tools.js` `commit()` |
| Selection, pan/zoom | `src/project_editor/multiselect.js`, `ProjectEditor.view` / `autoFitView` / `getEditCanvasWrapperBounds` |
| Keyboard shortcuts | `src/edit_canvas/events_keyboard.js`, `src/panels/panel_events.js` (`handlePanelsKeyPress`, imported by `src/panels/panels.js`) |

Changes here go in their own PR labelled `protected-area`, with regression tests. `.gs2` format changes need the owner (WORKFLOW.md).

## 11. Extension points for M1–M9

| Need | Where | Notes |
|---|---|---|
| **M1.1 tokens and type roles** | `src/common/colors.css` (`:root` and `[data-theme='dark']`), `src/common/resets.css` (role classes), mirror in `designTokens` (`src/common/colors.js`) | Add only. Leave the legacy ramps frozen. Keep the typography guard green. |
| **M1.3 `itemChanged{id}`** | Add the topic to `allTopics` in `pub_sub.js`. Emit it from (a) `native-tools.js` `commit()` after `editor.publish('currentItem', candidate)`; (b) manual edits, in one place: `publish()` where it already calls `glyphChanged(data)` for `currentItem`-family topics (covers tools, panels and keyboard); (c) undo/redo in `History.restoreState()`/`redoState()` after their `publish('currentItem', …)`. **(b) and (c) touch `pub_sub.js`/`history.js`, so they are (P).** A non-P alternative is a `currentItem` subscriber that re-publishes. | Whole-project undo swaps `editor._project`, so subscribers must re-fetch by ID (`project.getItem(id)`) and never hold glyph references. Debounce redraws with `requestAnimationFrame`. |
| **M1.4 unsaved / leave warning** | `updateWindowUnloadEvent()` (`src/app/app.js`), `editor.projectSaved`, `setProjectAsUnsaved`, `settings.app.autoSave` | |
| **M2.1 app shell / top bar** | Today: `makeAppTopBar()` (`src/app/menu.js`), `#app__top-bar` and the grid in `src/app/app.css`, assembled in `Navigator.navigate()`. New shell: replace `makeAppTopBar()` with a Noddy top bar (font name, progress ring, undo/redo through `editor.history`, theme, Export through `ioFont_exportDefaultFormat`), and add a workspace page maker plus a persistent **agent panel slot**. | `navigate()` rebuilds `#app__wrapper`. Mount the agent panel once, outside the per-page content (or re-attach the same node after each navigate) so it survives navigation and a run never stops. |
| **New page** | Add a `pageMaker` to `Navigator.tableOfContents` (`navigator.js`), a `makePage_X` in `src/pages/`, and CSS in `content-pages.css` or a new stylesheet (then also list it in `GLOBAL_STYLESHEETS`) | Navigate with `editor.nav.page = 'X'; editor.navigate()` |
| **New panel** | `src/panels/`, add a branch in `makePanel()`, an `unsubscribeExcept` prefix, and `panelsPerPage` in `navigator.js` | |
| **M2.4 glyph tile / grid** | New Noddy tile next to (or extending) `src/controls/glyph-tile/`, registered in `main.js`. Render from `project.makeItemThumbnail()` / `svgPathData`. Subscribe to `itemChanged` and re-fetch by ID. | Status needs shape plus colour. The tile must not use UI font for project glyphs. |
| **M2.2 specimen** | `<display-canvas>` (outline-accurate, missing glyphs absent) or `<font-preview>` (compiled font) | Dashed "ghosts" for missing glyphs need custom drawing next to `TextBlock`. |
| **M2.3 character set** | `settings.project.characterRanges` (`CharacterRange`, `{name, begin, end, enabled}`, `getMemberIDs()`). OTF export (`populateExportList` in `font_export.js`) only emits glyphs that fall inside an **enabled** range, which is why Latin Kernel must be stored as ranges. | Ranges already round-trip in `.gs2`, so no format change. |
| **M2.5 per-glyph status** | See below | |
| **M3 focus mode** | Reuse `<edit-canvas editing-item-id>`, keep the `.editor-page__edit-canvas-wrapper` host (auto-fit), and use `selectTool()` for the pill and `makeSingleInput` for inspector fields | Esc: keyboard Esc already calls `closeEveryTypeOfDialog()`. Handle focus-mode Esc without stopping agent runs. |
| **M4 agent panel** | New UI module(s) in `src/agent/` driving `createAgentController`. Remove `agent-window.js`, the welcome composer and `makeAgentToggle` (§9) | Keep the event contract of `createAgentController` so `agent-controller.test.js` stays valid. |
| **M6 tools** | Schema in `tool-definitions.js`, behaviour in `native-tools.js` `applyCommand`, prompt text in `server/agent/agent.js` `INSTRUCTIONS` | `getItem(id, true)` creates glyphs **and** writes a history post-state. Create through the adapter instead. |

**Can per-glyph status be stored without a `.gs2` format change? Not in the project file.** There is no pass-through bag at any level:
- `GlyphrStudioProject`'s constructor reads only `settings`, `glyphs`, `ligatures`, `components` and `kerning`. Other top-level keys are dropped.
- `settings` goes through `merge(template, imported)`, which **keeps only keys already in the template** and copies only string or number values. Booleans and unknown objects are ignored, so a dynamic `{glyphId: status}` map under `settings` would not survive loading.
- `Glyph`'s constructor destructures a fixed argument list and `Glyph.save()` whitelists its fields, so unknown per-glyph keys are dropped both ways.
- The session flags `hasChangedThisSession` / `wasCreatedThisSession` are deliberately **not** serialized (they drive `shouldExportItem` / `exportUneditedItems`).

Options for M2.5:
- **(a)** A session-only store on `ProjectEditor` (a map keyed by glyph ID), optionally mirrored to localStorage under `settings.project.id` (that ID *does* round-trip). No format change, but it doesn't travel with the `.gs2`.
- **(b)** Persist in the file with a small additive field, for example a top-level `noddy: { glyphStatus: {...} }` hydrated and saved explicitly in `GlyphrStudioProject`. Older Glyphr builds would ignore it, so it is backward-compatible for readers. It is still a **serialization change: (P) plus owner approval**, with round-trip tests in `test/roundtrip.test.js`.

Either way, whole-project undo snapshots come from `project.save()`, so status kept outside the project is **not** reverted by undo. Decide on purpose whether Keep/Revert should be undoable.
