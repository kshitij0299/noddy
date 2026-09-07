# 05 — Responsive Contract Inputs (Phase 0 — NOT the Phase 1 contract)

> Static-audit findings on stable baseline. Binding thresholds/behaviors will be defined in the Phase 1 responsive contract and approved before implementation. No `overflow:hidden` patches or hard-coded-width fixes until then.

## Current desktop behavior

- Root `#app__wrapper` `100vw/vh`, rows `40px calc(100vh-40px)`; top-bar `150px 150px 1fr`; `min-width:1000px`.
- Editor `.editor__page` `450px 40px 1fr`; panel scrolls internally; canvas area `overflow:hidden`, canvas `min-width:80px`.
- Content `.content__page` `450px 1fr` with right scroll area.
- Nav L1/L2/L3 are absolute dropdowns (`max-height:calc(100%-95px)`), not a sidebar.
- Modal `clamp(500px,66vw,1000px)`, `max-height:calc(100vh-80px)`, body scrolls.
- Open-project split `475px 1fr`.

## Narrow-width findings (<1000px today = clipped)

- Only 3 `min-width` queries (810px bug blurb, 645px zoom, 885px toolbar group) — progressive enhancement, no `max-width` fallback, no container queries, no drawer/collapse, no mobile logic.
- `min-width:1000px` + `html,body/app__wrapper overflow:hidden` = clip with no horizontal scroll.
- Chrome costs ~500px (450 panel + 40 rail + gaps) before canvas; canvas squeezes to sliver.
- Fixed widths at risk: panel cards 450px (`editor-pages:24`, `panels:11`, `content-pages:35`), `#textBlockTextInput` 260, kern sort 240, item row 430, actions grid ~430 (`repeat(11,30px)`), content cards 400/600, open-project 475/350/400, modal floor 500px (overflows <520px viewports), `dialogs.css:190 overflow-x:none` invalid.
- Nav dropdown text 360/340px + nowrap + hidden = ellipsis, no wrap (title only).

## Short-height findings

- Zero height queries. Heights are `calc(100vh-…)`. Internal scroll exists (editor panel, content panel/nav/right-area, modal body, lists) — works.
- Fragile absolute overlays: toast `left:520px`, notation `right:900px`, zoom `right:15px bottom:14px`, done-path `left:530px top:107px` — overlap/clip when short/narrow. Canvas wrappers clip correctly but hide overflowed controls with no fallback.

## Accessibility findings (must fix in contracts, not ad hoc)

- Focus: `--global-focus-style:1px dashed purple` exists but canvas/nav/context-menu/open-tabs remove outlines; almost no `:focus-visible`.
- ARIA: zero `aria-*`/role; nav dropdowns, TabControl, modal (div not dialog), context-menu expose no `expanded/selected/modal`.
- Keyboard: `tabindex:1` positive (order hazard); no focus trap/roving; icon rows hover-only.
- Contrast/size: `0.64em` super-title blues, `blue-l80` dropdown text, `opacity:.4-.6` states, `0.8em` notes — likely <4.5:1; targets 20–24px (close/guide/checkbox) below 24–44px guidance.
- Icon-only buttons (30px tools, 30px actions, 28px point-type, 22px guide controls) with inconsistent titles.

## What Phase 1 contract must define

- Supported widths (keep 1000 minimum? add 360/768/1024/1280? — examples only, not proposed decisions) + panel-overlay vs squeeze rule (<~900px?) + single-column rule (<~700px?) + fluid panel (`clamp(320px,30vw,450px)`?) + canvas min size before tools collapse + dialog `min(500px,100vw-32px)` + top-bar collapse.
- Short-height thresholds (short <600px?) + nav/modal max-h + toolbar wrap vs scroll + zoom/toast anchoring viewport-relative.
- Per-region overflow policy (where `auto` allowed vs clip), touch target floor (≥24/32px), focus-visible + ARIA requirements (`expanded/selected/modal`, trap, ban `tabindex>0`), long-text/large-numeric handling, preview-separation rule.
- Validation checklist per surface: wide, narrow, short, keyboard/tab order, pointer/touch, long text + large numerics, no clip/overflow/contrast failure.
