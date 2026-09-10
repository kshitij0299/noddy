# Changelog (Noddy redesign)

## [Unreleased] — Phase 1: Contracts (proposed) — 2026-09-07

- Added `10-design-system-contract.md` (tokens/values, type roles, spacing, elevation, states, icons/logos, hierarchy, diff guardrail).
- Added `11-typography-font-rendering-contract.md` (UI/content separation, scoping + guard test, mono numerics).
- Added `12-responsive-contract.md` (T1/T2/T3 tiers, short-height, overflow bans, focus/keyboard rules).
- Added `13-brand-and-versioning-contract.md` (naming map, `app_config.json` source of truth, first Noddy version `2.11.0-noddy.0`, `.gs2` open/save rules, attribution).
- `.pen` files scoped out per user confirmation. No product code changed.

## [Unreleased] — Phase 2: Shared Noddy foundation — 2026-09-07

- 2A (tokens/type/states): OKLCH blocks added to `colors.css` (legacy ramps kept), `colors.js` mirror, font imports + scoped UI font + type roles + mono numerics + global states in `resets.css`, new `test/css-typography-guard.test.js` (6 tests).
- 2B (shared controls): restyled `fancy-button`, `input-number` (mono), `option-chooser/toggle`, `tabs` (roving tabindex, `tabindex:1` removed), `dialogs` (modal trap + focus return, ARIA roles), `info-bubble`, `fancy-slider`, `progress-indicator`; icon-only buttons labelled; `font-preview`/`glyph-tile` internals untouched.
- 2C (shell/brand/versioning): responsive tiers T1/T2/T3 + short-height rules, `min-width:1000px` lock removed, overlay drawer + focus management, re-anchored overlays; `noddy-icon.svg`/`noddy-logo-big.svg` added, title/manifest/favicon wired, version `2.11.0-noddy.0` + `ci:versions` check, save filename `Noddy Project`, fork lines in README/about.
- Verified: lint 0 err/2 warn (pre-existing), 618/618 tests pass, production build passes.
- Deferred: favicon `.ico` regen (no rasterizer), toolbar condense (needs Phase 3.5), notation flip-to-trigger JS, `data-font-content` stamping on preview roots, per-surface 450px card remediation (Phase 3.4), stale brand links until Noddy URLs supplied.
- Review fix-ups applied: `glyph-tile` added to guard banned elements; README description Noddy-framed; panel drawer default-closed (no auto-open); right-area `overflow-x:auto`.

## [Unreleased] — Phase 3.5 edit-canvas chrome — 2026-09-11

- Rethemed rail/toolbar/zoom/context chrome (peach selected tool, mono readout, labelled groups); canvas pixels, tools, events, view math untouched.
- User fixes folded in: focus-ring breathing room (no more clipping), welcome tab-strip pins, paint-only pill hovers (global blue hover neutralized).
- Verifier caught T3 zoom-cluster clipping (repositioned) + readout width (6em); glyph T3 framing confirmed pre-existing view behavior, untouched.
- Lint 0 err, 618/618 pass, build exit 0.

## [Unreleased] — Phase 3.4 inspector panels — 2026-09-11

- Full pass: shared baselines, Layers drift fix, guide touch targets, danger marking, empty states, tooltips, Undo/Redo copy. Verifier GO (attrs/layers/quality/kerning/T2/T3/short/console all pass; 2 coverage notes, no product defects).
- Lint 0 err, 618/618 pass, build exit 0.

## [Unreleased] — Phase 3.3 components/ligatures/kerning/preview — 2026-09-09

- Rebuilt components/ligatures/kerning/live-preview pages + first-run empty states (Noddy copy, token retheme, tidy cards, danger-marked deletes, dialog width fixes).
- Verifier NO-GO triaged to one real bug: transparent PAGE nav dropdown (ghost text) → opaque token surface fix in `nav.css` only (navigator.js logic untouched); eyeballed by orchestrator. Other flags evaporated (brief error, already-correct).
- Lint 0 err, 618/618 pass, build exit 0. Note: stray `browser-agent/` dir is another session's work — left alone per coordination guardrails.
- Overview polish (user-reported): preview canvas painted 42px past its box forcing a permanent scrollbar — fixed with a plain wrapper (component now measures content width); all right-area boxes share edges (473/1409); grid scroller is hover-reveal thin. Lint 0 err, 618/618 pass.
- Panel-column scrollers (user-reported, approved): permanent track narrowed white cards vs peach header — hover-reveal thin on both panel columns. Lint 0 err, 618/618 pass.
- Nav header width (user-reported): 4px focus breathing room inset the orange header 8px vs cards — compensated with negative margins, edges measured identical (460/460) via CDP rects.

## [Unreleased] — Phase 3.2 settings/actions/help/about — 2026-09-09

- Rebuilt settings (Project/Font/App), global actions, help, about with Noddy copy + token retheme; destructive deletes danger-marked; help links intact; empty states muted pattern.
- Verifier round found 2 majors, both evaporated on re-check (danger already on instance; "4th tab" was a brief error — baseline has 3); copy/spacing/button fixes applied (D4/D5/D6); T3 nav confirmed reachable via Panel drawer.
- Lint 0 err, 618/618 pass, build exit 0. Deferred: per-page first-run placeholders (need 3.3 files).

## [Unreleased] — Phase 3.1 welcome/overview/browse — 2026-09-09

- Rebuilt welcome (Noddy hero card + pill tabs + peach buttons), overview (Noddy copy, tidy info/grid), character click-through. Load/Restore/Examples all usable; 40px overflow fixed via page-scope type cap.
- §3b borrow log (all rebuilt fresh, no pasted code): (1) two-card welcome feel, (2) pill-tab + peach-button treatment — both from user screenshots; (3) Noddy hero art (in-repo); (4) read-only `git show feat/ui-overhaul:src/app/open_project.js + app-pages.css` (visual reference only; diff grep clean of banned markers).
- User-reported polish fixed same round: equal-height cards (stretch, 450px all tabs), identical pill radius selected/unselected + no unselected stroke, paint-only hovers (global button:hover neutralized in welcome scope).
- Verification: builder self-screenshots + independent verifier GO (8 shots, console empty) + orchestrator eyeball on tiebreak. Lint 0 err, 618/618 pass, build exit 0.
- Deferred minors: T3 hero empty zone; Load help-line wording; D2 transient; vertical menu flip.
- Fix round (user-reported): pill hover reduced to text tint only (white-rect hover removed); overview Project info left-aligned to page rhythm; fill buttons (Edit-info, Contribute, welcome CTA, file-chooser). Verified via browser loop + orchestrator eyeball. Lint 0 err, 618/618 pass.

## [Unreleased] — Phase 3 left-side system (reordered before 3.1, user-approved) — 2026-09-09

- Root-caused the dropdown explosion: Chrome 150 throws when custom-element constructors call `setAttribute` during `createElement` upgrades → dead elements with no shadow DOM → light-DOM options rendered as text. Fixed by moving host-attribute writes to `connectedCallback` (5 controls); console errors 44 → 0.
- Rebuilt panel system as one unit: fluid cards, minmax grids, Contract-1 paper/peach retheme, plain/icon button system, links, focus rings (`panels.css`); control fixes (chooser/input/toggle/button/tile/slider/info-bubble); tier CSS fixes; nav token retheme.
- Browser loop is live: `scripts/browser/drive.mjs` (naked Chrome, zero deps) + `docs/redesign/14-browser-loop.md`; verifier rubric `docs/redesign/skills/NODDY-UX-RUBRIC.md` (distilled from user-supplied `skills/UX-Audit-Rethink.md`; full strategy scoring skipped as non-actionable mid-redesign); `viewportOnly` shot mode added after a capture artifact caused a false NO-GO.
- Verification: builder self-screenshots + independent verifier survey (15 panels, T1/T2/T3, short height, console empty) → GO after round-2 tiebreak (seen with orchestrator's own eyes: dropdown floats correctly).
- Deferred: layer-row subtitle legacy colors; nav-button ellipsis tooltips (navigator.js off-limits); D2 zoom-readout transient (self-healing); vertical menu flip near viewport bottom.
- Spinner fix (user-picked Option A): `input-number` halves equalized (`1fr/1px/1fr`), 24px min-height overflow removed, chevrons flex-centered, hover-border hack deleted. Verified via browser loop (before/after deck in Obsidian `Noddy/assets/spinner-redesign.md`). Lint 0 err, 618/618 pass. Also removed stray `browser-agent/` junk an agent installed against instructions (unreferenced).

## [Unreleased] — Borrow-smart rule + Phase 2.1 hotfix — 2026-09-07

- `AGENTS.md` §3b (user-approved): targeted surface-only borrowing from old branches under 6 infection-proof guarantees (reference-only, per-item allowlist, no skeleton, rebuilt-not-pasted, independent infection check, logged). Wholesale copy/layout reuse stays banned.
- User-reported Phase 2 issues accepted as hotfix scope: attributes-sidebar control overlap, Panel toggle missing on pages without `.top-bar__menus`, Load-dialog giant-text containment. Welcome/Load/Restore redesign + inside-app theming scheduled for Phase 3.1+ (pre-existing breakage, verified untouched by Phase 2 diff).
- Phase 2.1 hotfix integrated (6 files, +88/−10): input/chooser cell containment (`min-width:0`), chooser-menu viewport clamping, Panel toggle fallback mounts + eager wiring for all shells, Load-dialog type cap + in-flow tabs + in-region scroll. Verified: lint 0 err, 618/618 pass. Independent review: PASS, LOW risk, zero old-branch markers (§3b infection check clean). Deferred (reviewer-optional): drawer-wiring teardown helper for jsdom isolation, `maxHeight>=0` clamp completeness.

## [Unreleased] — Phase 0: Discovery and baseline — 2026-09-07

- Created branch `noddy/phase0-discovery` fresh from stable `main` @ `b84c54db`. Prior redesign branches untouched/off-limits.
- Added `AGENTS.md` (rules, protected areas, gates, verification).
- Added `docs/redesign/00-charter.md` through `08-verification-matrix.md` (this log).
- Ran 4 read-only audits: architecture, domain workflows, UX/responsive, brand/versioning. No product code changed.
- Baseline: `npm run lint` 0 errors / 2 warnings; `npx vitest run` 30 files / 612 pass; `npm run build` passes.
- No `.gs2`/serialization/protected-area changes.
