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

## [Unreleased] — Borrow-smart rule + Phase 2.1 hotfix — 2026-09-07

- `AGENTS.md` §3b (user-approved): targeted surface-only borrowing from old branches under 6 infection-proof guarantees (reference-only, per-item allowlist, no skeleton, rebuilt-not-pasted, independent infection check, logged). Wholesale copy/layout reuse stays banned.
- User-reported Phase 2 issues accepted as hotfix scope: attributes-sidebar control overlap, Panel toggle missing on pages without `.top-bar__menus`, Load-dialog giant-text containment. Welcome/Load/Restore redesign + inside-app theming scheduled for Phase 3.1+ (pre-existing breakage, verified untouched by Phase 2 diff).

## [Unreleased] — Phase 0: Discovery and baseline — 2026-09-07

- Created branch `noddy/phase0-discovery` fresh from stable `main` @ `b84c54db`. Prior redesign branches untouched/off-limits.
- Added `AGENTS.md` (rules, protected areas, gates, verification).
- Added `docs/redesign/00-charter.md` through `08-verification-matrix.md` (this log).
- Ran 4 read-only audits: architecture, domain workflows, UX/responsive, brand/versioning. No product code changed.
- Baseline: `npm run lint` 0 errors / 2 warnings; `npx vitest run` 30 files / 612 pass; `npm run build` passes.
- No `.gs2`/serialization/protected-area changes.
