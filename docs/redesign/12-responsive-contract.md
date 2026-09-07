# Contract 3 — Responsive (binding, Phase 1)

Status: PROPOSED — requires user approval before any product code. Values below are DECISIONS (not examples) unless marked TBD.

## 1. Supported tiers (widths)

| Tier | Width | Editor behavior |
|------|-------|-----------------|
| T1 desktop | ≥1100px | Full 3-zone layout (panel + rail + canvas). Panel width fluid `clamp(340px, 30vw, 450px)` for the shell; existing fixed 450px cards (panels, content pages, dialogs — see `05-responsive-contract.md`) are remediated per-surface in their own milestones, not by this rule alone. |
| T2 compact | 760–1099px | Panel becomes a dismissible overlay drawer (slides over canvas, does not squeeze it); focus moves into drawer on open, returns on close; canvas keeps full width. Toolbar condenses to essentials (overflow into "more" menu, never clipped). |
| T3 narrow | <760px | Single column: canvas full-viewport; panel becomes full-screen overlay sheet; nav collapses to one menu button; dialogs constrained `min(500px, 100vw-32px)`. |

`min-width:1000px` root lock is REMOVED in Phase 2 (it is the current clip source). No new `min-width` locks above 320px anywhere.

## 2. Short height (<620px)

- Panels, nav dropdowns, modal bodies, chooser lists scroll INTERNALLY (`max-height: calc(100vh - reserved)`); page itself never traps the user.
- Absolute overlays re-anchored viewport-relative: toast bottom-center, notation near trigger with flip, zoom controls dock to canvas corner with safe offset, done-path button pins to toolbar. The px-anchored positions (`left:520px`, `right:900px`, `left:530px top:107px`) are REMOVED.
- Canvas remains usable: minimum canvas interactive area 320×240 before T3 overlay rules take over.

## 3. Overflow policy (binding)

- Scroll is allowed ONLY in designated regions (panel column, nav dropdown, modal body, lists, reading area). Document/body-level horizontal scrolling is a bug.
- BANNED as fixes: `overflow-x: clip/hidden` to hide layout overflow, `scrollbar-gutter: stable` as a patch, `contain: layout` to mask sizing bugs, hard-coded px widths to force fit. Overflow found in testing must be fixed at the layout cause (flex minmax `min-width:0`, wrapping, tier rules).
- Long text: nav/item names ellipsize WITH full `title` tooltip; numeric fields scroll horizontally within their input, never push layout; tables/lists wrap or scroll in-region.

## 4. Input & focus (all tiers)

- Touch/pointer targets on new/changed controls: ≥24px minimum, 32px preferred; icon-only buttons keep 30px+ hit area even if glyph is smaller.
- Visible `:focus-visible` ring everywhere (Contract 1 states); zero `tabindex > 0`; modals trap focus and return it on close; drawer/sheet follows modal focus discipline; nav dropdowns expose `aria-expanded`, tabs `aria-selected`, dialogs `role=dialog aria-modal`.
- Keyboard shortcuts from `02-critical-workflows.md` §5 keep working at every tier (no tier may swallow them); canvas keeps priority except when focus is in a text input.

## 5. Validation rule (binding, per surface per milestone)

Wide (T1) + compact (T2) + narrow (T3) + short height + keyboard-only pass + long-text/large-numeric content: no clipping, no unreachable controls, no unreadable contrast, canvas interactive, previews render project data. Failures block the milestone — no tier may be declared "unsupported, won't fix" without user approval.
