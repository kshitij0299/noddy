# Contract 2 — Typography & Font-Rendering (binding, Phase 1)

Status: PROPOSED — requires user approval before any product code.

## 1. The separation rule (binding)

**Application UI typography MUST NEVER determine the rendering of user/project font content.** Two disjoint roles:

- **UI role** (`--font-sans`, `--font-serif` display, `--font-mono` for code): application chrome text only — top bar, nav, panels, dialogs, pages, buttons, labels, toasts.
- **Content role**: anything that renders project/font data — glyph outlines on canvases, `display-canvas` output, `font-preview` rendered text, live-preview text, pop-out window preview, exported-font previews, SVG/canvas output. These render ONLY project data + their own explicitly set fonts.

## 2. Enforcement mechanism

- UI font is applied via **scoped selectors** (app wrapper, top bar, nav, panels, dialogs, content pages, controls) — NEVER via a global `*` font-family reset. The current `*` reset must be narrowed in Phase 2 so it does not set `font-family`.
- Content surfaces are **explicitly excluded**: `display-canvas`, `font-preview` internals, `edit-canvas` glyph content, `glyph-tile` glyph art, pop-out preview body, and any element with `[data-font-content]` (new marker attribute Phase 2 adds to preview roots). No UI stylesheet may target these except for chrome AROUND them (borders, labels outside the surface).
- `font-preview` sets its project `@font-face` family inline/with control-scoped CSS; UI CSS specificity must stay below it on those nodes (verified by V14 check each milestone).
- **Guard test (Phase 2 delivers):** `test/css-typography-guard.test.js` fails the suite if any *global* stylesheet sets `font-family` on `*`, `canvas`, `display-canvas`, `font-preview`, or `[data-font-content]`, or if preview roots lack the marker. Each control's own component-scoped stylesheet (e.g. `font-preview`'s internal styles) is explicitly allowlisted — the ban applies to global stylesheets only. Until the guard exists, V14 is a manual checklist item.

## 3. Numeric / technical typography role

Tabular monospace (`--font-mono`, `font-variant-numeric: tabular-nums`, no ligatures) is REQUIRED for: `input-number` values, measurement/kerning/tracking fields, coordinate readouts, Unicode codepoints (`U+0041`), version strings, advance widths, side bearings. Rationale: proportional UI font makes metrics jitter and misleads editing decisions.

## 4. Case, icons, fallback

- Sentence case everywhere in UI copy; `label--meta` uppercase reserved for super-titles (eyebrow labels above titles), never for buttons/body.
- Icon font (`Material Symbols Rounded`) is decorative ligature text: always paired with `aria-hidden="true"` + adjacent accessible label, or the host control carries `aria-label`.
- Offline: `FiraGo` remains the sans fallback stack (`'Google Sans Flex', 'FiraGo', system-ui, sans-serif`); Code falls back to `ui-monospace, monospace`. Missing webfonts must degrade to fallback, never to project fonts.

## 5. What this contract forbids (binding)

- Any global rule that changes `font-family`, `font-variation-settings`, `font-feature-settings`, or `letter-spacing` on preview/glyph surfaces.
- Using `--font-serif` (ROND 60 display) outside h1–h3.
- Rendering project font data in UI chrome (e.g., setting a panel header in the user's typeface) — UI chrome stays in UI type even on font-preview pages (preview area itself excepted).
