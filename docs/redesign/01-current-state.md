# 01 — Current State (Phase 0 baseline)

Branch: `noddy/phase0-discovery` from `main` @ `b84c54db`. Clean (restored stray `devMode` tweak). Prior redesign branches untouched.

## Architecture (from read-only audit)

- **Shell:** `src/index.html` → `src/app/main.js:glyphrStudioOnLoad` → `#app__wrapper` (`#app__landing-page` + app). No router; `wrapper.innerHTML=''` replace + `makeAppTopBar()` + page content. App nav `src/app/app.js:appPageNavigate`; project nav `src/project_editor/navigator.js:Navigator.navigate/makePageContent`.
- **Pages (`src/pages/`, 15):** overview (dashboard), characters/ligatures/components/kerning (edit-canvas pages), live_preview, global_actions (+cards), settings (wraps settings_app/font/project/data), help, about.
- **Panels (`src/panels/`, 21 + panels.css):** attributes_glyph_edit vs attributes_kern, layers, transforms, context_characters, guides, history, character_info, quality_checks; helpers cards/card_* / item_chooser / actions+action_buttons / live_preview / panel_events. Allowed set per page in `navigator.js:panelsPerPage`.
- **Controls:** custom elements `display-canvas`, `edit-canvas`, `fancy-button`, `font-preview`, `glyph-tile`, `info-bubble`, `input-number`, `option-chooser`, `option-toggle` (registered in `main.js`); helpers `dialogs.js` (toast/modal/context-menu/notation), `tabs/`, `fancy-slider/`, `progress-indicator/`.
- **CSS load order (`src/index.html`):** app/app.css → common/resets.css → common/colors.css → dialogs/fancy-slider/tabs/progress → project_editor/nav.css → pages/editor-pages.css → pages/content-pages.css → app/app-pages.css → panels/panels.css. Tokens in `common/colors.css` (+ mirror `common/colors.js`); base/reset in `common/resets.css`.
- **Canvas boundaries:** `display_canvas/DisplayCanvas` read-only (TextBlock-driven, `draw_paths:drawGlyph`); `edit_canvas/EditCanvas` interactive (577L + `events*.js` + `tools/` pan/resize/path_edit/new_path/new_basic_path/path_add_point/kern, hit-test `detect_edit_affordances`, overlays `draw_edit_affordances`); `project_editor/ProjectEditor` owns project/nav/history/view/selection/clipboard (1132L).
- **State:** `src/project_data/` pure domain (`GlyphrStudioProject` 930L + Glyph/Path/PathPoint/ControlPoint/Coord/XYPoint/Segment/ComponentInstance/KernGroup/CharacterRange); UI singletons `getGlyphrStudioApp/getCurrentProjectEditor/getCurrentProject`; PubSub ~18 topics + `unsubscribeExcept`; `history.js` undo queue (+ whole-project snapshots); `app.js` localStorage autosaves.
- **Save/load:** open_project tabs/drag-drop/picker → `formats_io/validate_file_input.js` (OTF via font-flux, SVG font tag check, TXT/GS2 JSON + PF0-PF5 gates) → `otf/font_import` / `svg_font_import` / `import_project.js:importGlyphrProjectFromText` (migrations v1.13.2→v2, v2.0→v2.5 kern flip, stamp latestVersion) → `editor.project`. Save: `project.save()` → strip defaults → `file_io.js:saveTextFile` (File System Access + Blob fallback, `makeFileName` → `*.gs2`). Export via `menu.js` → `otf/font_export`, `svg_font_export`.
- **Version/config:** `package.json:2.10` (build only) vs `src/app/app_config.json:2.10.3 + versionDate + devMode` (runtime; drift noted) → `app.version/versionName`; `src/manifest.json` (Glyphr name, glyphrstudio URL, `#29b7ff`); project `settings.project.{name,id,latestVersion,initialVersion}` + `settings.font.version:1.0` (font meta, not app) + `settings.app.*`.

## Test coverage

`vitest.config.js` (jsdom + vi-canvas-mock). 30 files / 612 tests pass. Strong in `project_data/tests/` (15 files), `formats_io/{otf,svg_font,svg_outlines}/tests/`, `common/tests/`, `lib/unicode/tests/`, `project_editor/tests/{navigator,cross_item_actions,boolean_combine}`, `controls/font-preview`, `test/roundtrip.test.js` (OTF import→export→import), `composite_export.test.js`. Gaps: pages/, panels/, edit_canvas/, app/menu/open_project, CSS.

## Baseline results (2026-09-07, clean tree)

- `npm run lint` → 0 errors, 2 warnings (`common/colors.js:190` unused eslint-enable; `project_editor/boolean_combine.js:61` unused `e`).
- `npx vitest run` → 30 passed, 612 passed (~23.6s).
- `npm run build` → passes (vite 8.2.1, ~2.9MB JS + wasm, CSS ~55KB).

## Layout facts (stable main, not prior branches)

- `#app__wrapper` grid `40px / 1fr`; top-bar `150px 150px 1fr`; `min-width:1000px` + root `overflow:hidden`.
- `.editor__page` grid `450px 40px 1fr`; `.panel__card` fixed `450px`; `.content__page` `450px 1fr`; open-project `475px 1fr`.
- Only 3 `min-width` media queries (810/645/885px, progressive enhancement); no max-width/container/drawer logic; below 1000px clips. Zero height queries; internal scroll per panel/nav/modal. See `05-responsive-contract.md`.
