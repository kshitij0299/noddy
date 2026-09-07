# 07 — Risk Register (Phase 0)

| # | Risk | Area | Impact | Mitigation | Owner phase |
|---|------|------|--------|------------|-------------|
| R1 | Imperative full-rerender nav (`innerHTML` + string builders, no router) breaks when restyling shell | Architecture | High | Untangle `Navigator + makePanel + makeAppTopBar` in small scoped steps; keep nav logic intact; test page/panel nav each milestone | 2, 3.1 |
| R2 | Global CSS cascade (10 ordered globals + `*` reset + shadow-inline mix) — token rename breaks canvases/dialogs/nav at once | CSS | High | Phase 1 token contract; scoped rollout; preview-separation check every milestone | 1, 2 |
| R3 | EditCanvas god-object (577L + shared `eventHandlerData` + 7 tools coupled to ProjectEditor) | Editor | High | No editor-behavior changes in Phase 2; Phase 3.5 chrome-only; domain rationale + tests if touched | 3.5 |
| R4 | Fragile reactivity (string PubSub + `unsubscribeExcept` + whole-project history snapshots) → leaks/stale panels | State | High | Preserve subscribe/unsubscribe lifecycle; test undo/redo + panel refresh per milestone | All |
| R5 | IO/version fragility (dual versions, SemVer gates, FS-Access fallback, autosave quota) + copy must reflect FR*/FF*/SVG*/PF* codes | Compat | High | Single-source version contract; additive migrations only; test open/save/reload + import/export each milestone | 1, 2+ |
| R6 | Fixed 450px panels + `min-width:1000px` + root `overflow:hidden` → narrow clips; ad-hoc overflow patches hide real issues | Responsive | High | Phase 1 responsive contract first; ban `overflow-x:clip`/hard-width patches; validate wide/narrow/short each surface | 1, 2+ |
| R7 | Global UI font leaks into glyph/preview/export surfaces | Typography | High | Phase 1 font-rendering contract; scoping rule + per-milestone separation check | 1, 2+ |
| R8 | Mechanical rename of `Glyphr*` classes/keys/IDs breaks save/history/OTF round-trip | Branding | High | User-facing copy only; never rename schema/internal; CI version check | 1, 2 |
| R9 | PNG-wrapped logo SVGs not themeable (`fill` won't apply) | Brand | Med | Keep marks as-is in Phase 2; retrace to true vector later using `logo-icon-two-color.svg` | 2+ |
| R10 | A11y gaps (no ARIA, removed outlines, `tabindex:1`, small targets, contrast) | A11y | Med | Define focus/ARIA/target/contrast rules in contracts; keyboard/tab-order check per milestone | 1, 2+ |
| R11 | Absolute overlays anchored to px (`toast 520px`, `notation 900px`, zoom/done-path) overlap on short/narrow | Layout | Med | Viewport-relative anchoring in responsive contract | 1, 2 |
| R12 | Prior-branch layout revival (272/84/72px grids, 900/560 breakpoints, drawer/contain hacks) | Process | High | AGENTS.md off-limits rule + diff guardrail; reviewer checks each packet | All |
| R13 | Scope creep: broad refactors/dependency changes disguised as UI work | Process | Med | Prefer scoped UI/CSS/control/page/panel work; one feature area per milestone; isolated branches | All |
| R14 | Version drift (`app_config 2.10.3` vs `package 2.10`) + `initialVersion` overwrite | Versioning | Med | CI equality check; preserve `initialVersion`; Noddy semver decision in Phase 1 | 1 |

Logged 2026-09-07. Update per milestone.
