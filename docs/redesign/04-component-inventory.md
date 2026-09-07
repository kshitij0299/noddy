# 04 — Component Inventory (stable baseline)

## Pages (`src/pages/`)

| Page | File | Role |
|------|------|------|
| Overview | `overview.js` | Dashboard, welcome + links out |
| Characters | `characters.js` | Edit-canvas page, glyph chooser |
| Ligatures | `ligatures.js` | Edit-canvas page, ligature IDs |
| Components | `components.js` | Edit-canvas page, component IDs |
| Kerning | `kerning.js` | Kern page (`Tool_Kern`), group chips |
| Live preview | `live_preview.js` | TextBlock DisplayCanvas renderer |
| Global actions | `global_actions.js` + `global_actions_cards.js` | Batch ops |
| Settings | `settings.js` → `settings_app.js`, `settings_font.js`, `settings_project.js`, `settings_data.js` | App/Font/Project/Data tabs |
| Help | `help.js` | Tutorial + glyphrstudio links (~20) |
| About | `about.js` | Version/Contact/Family/License tabs |
| Styles | `editor-pages.css`, `content-pages.css`, `bezier_boolean_card.html` | Layout + boolean card template |

Edit-canvas pages share `.editor__page` (`450px 40px 1fr`); content pages share `.content__page` (`450px 1fr`).

## Panels (`src/panels/` + `panels.css`, `.panel__card` 450px)

Attributes (glyph-edit vs kern), layers (key handlers), transforms, context_characters, guides, history, character_info, quality_checks; builders `cards.js`, `card_glyph/path/path_point/component_instance/kern_group.js`, `item_chooser.js` (pagination), `actions.js` + `action_buttons.js` (~430px grid), `live_preview.js`, `panel_events.js`. Lifecycle: `panels.js:makePanel/refreshPanel/unsubscribeExcept`; allowed per page in `navigator.js:panelsPerPage`.

## Controls (`src/controls/`)

Custom elements: `display-canvas` (read-only previews), `edit-canvas` (interactive), `fancy-button`, `font-preview` (`FontPreviewBuilder`, has test), `glyph-tile`, `info-bubble`, `input-number` (mono numerics candidate), `option-chooser`, `option-toggle`. Non-elements: `dialogs/` (modal/toast/context-menu/notation, `dialogs.css` modal `clamp(500px,66vw,1000px)`), `tabs/` (`tab_control.js`, `tabindex:1` hazard), `fancy-slider/`, `progress-indicator/`.

## Shell / nav

`index.html` (title, favicon, manifest, `#app__landing-page` + `#app__wrapper`), `app/main.js` (boot, `registerCustomComponents`, global mouseup/resize), `app/app.js` (app nav, autosave, email link), `app/menu.js` (save/export entries), `app/open_project.js` (hero + version badge + tabs), `project_editor/navigator.js` (L1 PAGE / L2 EDITING / L3 item dropdowns, absolute positioned), `project_editor/nav.css`.

## Canvas modules

`display_canvas/`: `display_canvas.js`, `draw_paths.js`, `text_block.js` (+options), css. `edit_canvas/`: `edit_canvas.js` (577L), `events*.js`, `draw/detect_edit_affordances.js`, `context_characters.js`, `cursors.js`, `tools/` (pan, resize, path_edit, new_path, new_basic_path, path_add_point, kern).

## Domain + IO (reference only — protected)

`project_data/` (GlyphrStudioProject + primitives), `formats_io/` (otf/svg_font/svg_outlines + validate), `project_editor/` (ProjectEditor 1132L, history, multiselect, file_io, import_project, guide, cross_item_actions, actions, boolean_combine, quality_checks, pop_out_window).

## Shared-foundation candidates (Phase 2)

Tokens (`colors.css`/`colors.js`), resets/typography roles, focus/hover/selected/disabled/loading/empty/error states, `fancy-button`/`input-number`/`option-*`/`tabs`/`dialogs`/`info-bubble`/`progress-indicator`, top-bar + navigator, logos/metadata/version badge. Each needs wide/narrow/short/keyboard/touch/long-text/contrast/preview-separation checks.
