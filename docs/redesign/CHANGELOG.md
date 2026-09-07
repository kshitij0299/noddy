# Changelog (Noddy redesign)

## [Unreleased] — Phase 1: Contracts (proposed) — 2026-09-07

- Added `10-design-system-contract.md` (tokens/values, type roles, spacing, elevation, states, icons/logos, hierarchy, diff guardrail).
- Added `11-typography-font-rendering-contract.md` (UI/content separation, scoping + guard test, mono numerics).
- Added `12-responsive-contract.md` (T1/T2/T3 tiers, short-height, overflow bans, focus/keyboard rules).
- Added `13-brand-and-versioning-contract.md` (naming map, `app_config.json` source of truth, first Noddy version `2.11.0-noddy.0`, `.gs2` open/save rules, attribution).
- `.pen` files scoped out per user confirmation. No product code changed.

## [Unreleased] — Phase 0: Discovery and baseline — 2026-09-07

- Created branch `noddy/phase0-discovery` fresh from stable `main` @ `b84c54db`. Prior redesign branches untouched/off-limits.
- Added `AGENTS.md` (rules, protected areas, gates, verification).
- Added `docs/redesign/00-charter.md` through `08-verification-matrix.md` (this log).
- Ran 4 read-only audits: architecture, domain workflows, UX/responsive, brand/versioning. No product code changed.
- Baseline: `npm run lint` 0 errors / 2 warnings; `npx vitest run` 30 files / 612 pass; `npm run build` passes.
- No `.gs2`/serialization/protected-area changes.
