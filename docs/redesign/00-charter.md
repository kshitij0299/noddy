# 00 — Charter: Noddy Redesign

## Objective

Rebrand Glyphr Studio 2 as **Noddy** — an independent fork/product with its own versioning — and deliver a warm, precise, modern UI without breaking the mature font-editing core.

## Baseline

- Fork point: stable `main` @ `b84c54db`, fresh branch `noddy/phase0-discovery`.
- Prior redesign branches (`feat/ui-redesign-2`, `feat/ui-overhaul`) are off-limits.
- Visual direction sole source: `Noddy — Visual Vibes (Safe — Colors, Fonts, Logos).md` (2026-09-01).
- Phase 0 baseline (2026-09-07): `npm run lint` 0 errors / 2 warnings; `npx vitest run` 30 files / 612 pass; `npm run build` passes.

## Non-goals / constraints

- No change to editing behavior, `.gs2` compatibility, import/export contracts, performance, keyboard controls, undo/redo, selection, canvas geometry, data integrity — unless gated (see AGENTS.md §3).
- No mechanical rename of internal classes/schemas for branding.
- No `.gs2` extension/serialization changes without specific proposal + explicit approval.
- Preserve GPL, copyright, third-party, upstream attribution.
- Keep `src/project_data/` pure domain (no DOM).

## Phases + gates

| Phase | Scope | Gate |
|-------|-------|------|
| 0 Discovery (current) | Audits + planning docs + baseline; no product code | Verification packet → approval |
| 1 Contracts | 4 contracts: design-system, typography/font-rendering, responsive, brand/versioning | All 4 presented → approval |
| 2 Foundation | Tokens, type roles, states, shared controls, shell/nav, logos/metadata/approved versioning only | Packet → approval |
| 3+ Features (in order) | 1. Overview/open/browse · 2. Settings/actions/help/onboarding · 3. Components/ligatures/kerning/preview · 4. Inspector panels · 5. Edit-canvas chrome | Per-milestone packet → approval each |

After every milestone: stop. Wait for "approved"/"continue".

## Roles

- Orchestrator integrates only. Implementation agents: narrow non-overlapping scopes, isolated branch/worktree each. Independent reviewer per milestone (did not author implementation).

## Key docs

- `01-current-state.md` — architecture + baseline
- `02-critical-workflows.md` — must-stay-stable workflows
- `03-design-system.md` — Phase 0 inputs (not the Phase 1 contract)
- `04-component-inventory.md` — pages/panels/controls
- `05-responsive-contract.md` — Phase 0 inputs (not the Phase 1 contract)
- `06-brand-and-versioning-plan.md` — Phase 0 inputs (not the Phase 1 contract)
- `07-risk-register.md`
- `08-verification-matrix.md` — regression matrix
- `CHANGELOG.md`
