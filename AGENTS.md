# AGENTS.md — Noddy Redesign Operating Rules

> Source of truth for every agent (human or subagent) working on the Noddy fork.
> Noddy is an independent fork/product derived from Glyphr Studio 2 (GPL-3.0-or-later).
> Branch baseline for Phase 0: `noddy/phase0-discovery`, cut fresh from stable `main` @ `b84c54db`.
> Prior redesign branches (`feat/ui-redesign-2`, `feat/ui-overhaul`) are OFF-LIMITS: do not inspect, merge, copy from, or revive them.

## 1. Product identity

- User-facing name is **Noddy**. Independent fork/product with its own versioning.
- Preserve all GPL, copyright, third-party-library, and upstream attribution notices.
- Visual direction comes ONLY from:
  `Noddy — Visual Vibes (Safe — Colors, Fonts, Logos).md` (palette, typography, iconography, logos, personality).
- Safe to copy from that doc: OKLCH color tokens, `--radius`, shadows/tracking, font imports + type scale, logos in `assets/noddy-graphics/`.
- NEVER copy layout/structure from prior branches: grids (`272px 44px 1fr`, `84px/108px 1fr`, discord-rail `72px`), `900px/560px` breakpoints, drawer transforms, `overflow-x: clip`, `scrollbar-gutter`, `contain: layout`, dot-grid/glow wrappers. If a diff touches those, stop.
- Brand assets: `/Users/kshitij/Documents/Obsidian Vault/Noddy/assets/noddy-graphics/` (17 files, incl. `noddy-logo-big.svg`, `noddy-icon.svg`, `noddy-icon-bg.svg`, `logo-icon-two-color.svg` as only true vector). Optional extras: `/Users/kshitij/Documents/cursor shit/font agent/design files/` (`.pen` files, `icon.svg`).

## 2. What must never break

Preserve exactly: editing behavior, project compatibility, import/export, editor performance, keyboard controls, undo/redo, selection, canvas behavior, data integrity.

- Do NOT mechanically rename internal classes, data structures, or file schemas for branding.
- Do NOT change `.gs2` compatibility, file extensions, serialization, or import/export contracts without a specific proposal + explicit user approval.

## 3. Protected areas — hands off without approval gate

```
src/project_data/
src/formats_io/
src/edit_canvas/events*
src/project_editor/history.js
project-file serialization and compatibility
import/export behavior
undo/redo
keyboard shortcuts
canvas geometry, selection, pointer interaction, pan/zoom behavior
```

A UI/redesign agent may NOT modify a protected area unless ALL hold:

1. A domain-focused agent explains why the change is necessary.
2. Focused regression tests are added or strengthened.
3. The change is explicitly highlighted in the verification packet.
4. The user explicitly approves it.

Maintain separation: `src/project_data/` is pure domain (no DOM). UI lives in `src/app/`, `src/pages/`, `src/panels/`, `src/controls/`, `src/project_editor/` (app state). Prefer scoped UI/layout/CSS/control/page/panel/presentation work over broad refactors or dependency changes.

## 4. Orchestration rules

- Orchestrator only integrates. Implementation agents get narrow, non-overlapping scopes.
- Each implementation agent works in an isolated branch/worktree. Never commit directly to `noddy/*` integration branch from an agent.
- One feature area per milestone (Phase 3 order is fixed — see `docs/redesign/00-charter.md`).
- Read-only audits must not write files, start servers, or run mutating builds.

## 5. Approval gates — hard stop

After EVERY milestone, create a verification packet and STOP. Do not begin the next milestone until the user replies "approved", "continue", or equivalent.

Every verification packet must include:

- milestone objective
- subagents used and their precise scopes
- changed files, grouped by feature area
- protected files touched, if any, with justification
- concise before/after summary
- lint, focused-test, full-relevant-test, and production-build results
- independent review findings from an agent that did not author the implementation
- browser/manual checks performed
- visual evidence or screenshot paths when available
- known risks, regressions, and deferred work
- concise checklist for the user to verify
- final line: "Awaiting approval."

## 6. Verification expectations (every milestone)

- `npm run lint` → 0 errors (warnings listed).
- `npx vitest run` → all pass (Phase 0 baseline: 30 files / 612 tests).
- `npm run build` → production build passes.
- Regression matrix smoke-tested (`docs/redesign/08-verification-matrix.md`): open sample, create/edit glyph, select/move points, undo/redo, save/reload, page/panel nav, components/ligatures/kerning/live-preview, SVG/OTF/project import/export, UI-font vs project-font separation.
- Responsive checks per `docs/redesign/05-responsive-contract.md`: wide desktop, narrow viewport, short height, keyboard focus/tab order, pointer/touch where applicable, long text + large numerics, no clipping/overflow/unreadable contrast, no accidental override of glyph/font-preview rendering.
- Typography check: global CSS must never override font previews or glyph-rendering surfaces (`display-canvas`, `font-preview`, `edit-canvas` glyph content, exported-font previews, SVG/canvas output render project/font data only).
- Independent reviewer (did not author implementation) assesses protected-domain risk.
- Update `docs/redesign/08-verification-matrix.md` + `docs/redesign/CHANGELOG.md`.

## 7. Phase discipline

- Phase 0 (current): discovery + baseline only. No redesign product code.
- Phase 1: four contracts for approval before product code (design-system, typography/font-rendering, responsive, brand/versioning).
- Phase 2: shared foundation only (tokens, typography roles, states, shared controls, shell/nav, logos/metadata/approved versioning). No protected editor behavior changes.
- Phase 3+: one approved feature area at a time, in order:
  1. Overview, project opening, character browsing
  2. Settings, global actions, help, onboarding
  3. Components, ligatures, kerning, live preview
  4. Inspector panels and editing-side controls
  5. Edit-canvas chrome, toolbars, contextual controls, affordances

## 8. Completion bar

Do not claim completion unless: lint + relevant tests + production build pass; regression matrix smoke-tested; responsive + typography contracts validated; independent reviewer assessed protected-domain risk; Noddy branding/versioning documented + verified; GPL/upstream attribution intact.
