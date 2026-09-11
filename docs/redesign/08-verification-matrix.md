# 08 — Verification Matrix (regression)

CURRENT STATE (2026-09-11): branch `noddy/phase3-leftside`, tag `noddy/completion-baseline` — all rows below verified to the extent headless automation allows; drag/file-picker/keyboard rows need a human with a mouse (list in the completion packet). New sessions: read `15-session-handoff.md` first.

Baseline: `noddy/phase0-discovery` @ `b84c54db` — lint 0 err/2 warn, 612/612 pass, build passes.
Phase 2: `noddy/phase2-foundation` (integrates 2A tokens/type/states, 2B controls, 2C shell/brand/versioning) — lint 0 err/2 warn (same pre-existing), **618/618 pass** (612 + 6 new CSS-typography-guard tests), build passes, `ci:versions` passes (`2.11.0-noddy.0`). No protected-area logic changed; static checks green. Browser/manual + responsive-tier interaction checks are USER checks (see Phase 2 packet checklist).
Phase 3 left-side (`noddy/phase3-leftside`, reordered before 3.1): panel-system rebuild + dead-element fix, browser-loop verified (15-panel survey, T1/T2/T3, short height, console empty) — lint 0 err/2 warn, 618/618 pass, build passes.
Phase 3.1 (`noddy/phase3-leftside` cont.): welcome/overview/browse rebuild + user polish (equal cards, pill radius, paint-only hovers) — independent verifier GO (8 shots, console empty), lint 0 err/2 warn, 618/618 pass, build exit 0.
Phase 3.2 (same branch): settings/actions/help/about rebuild — verifier NO-GO round triaged (both majors evaporated: danger already present, 3-tab brief error), fixes applied + re-verified, lint 0 err/2 warn, 618/618 pass, build exit 0.
Phase 3.3 (same branch): components/ligatures/kerning/preview + first-run states — verifier caught transparent nav dropdown (fixed in nav.css, eyeballed by orchestrator), lint 0 err/2 warn, 618/618 pass, build exit 0.
Phase 3.4 (same branch): inspector panels full pass — verifier GO (attrs/layers/quality/kerning/T2/T3/short/console), lint 0 err/2 warn, 618/618 pass, build exit 0.
Phase 3.5 (same branch): canvas chrome retheme + user focus/hover/tab fixes + T3 zoom fixes — verifier GO after 1 fix round (glyph T3 framing confirmed pre-existing, untouched), lint 0 err/2 warn, 618/618 pass, build exit 0.
Completion (`noddy/phase3-leftside` tagged baseline): full matrix via browser loop (nav/pages/panels/tiers/preview/branding PASS, console empty; drag/file-picker/keyboard → manual list), contracts/branding/GPL audit PASS + 4 copy nits, lint 0 err/2 warn, 618/618 pass, build exit 0.

| # | Check | How | Phase 0 status |
|---|-------|-----|----------------|
| V1 | Open sample project | Open-project → sample (e.g. Oblegg/modegg) loads, no console errors | BASELINE — not yet smoke-tested post-change (no changes) |
| V2 | Create/edit glyph | New glyph + draw/edit path, attributes update | BASELINE |
| V3 | Select/move/modify points | Marquee + single select, nudge, drag handles | BASELINE |
| V4 | Undo/redo | Ctrl+Z/Y + History panel jump, incl. whole-project ops | BASELINE |
| V5 | Save/reload | Save `.gs2`, reload, `latestVersion` sane, no data loss | BASELINE |
| V6 | Page/panel nav | L1/L2/L3 + panels per page, no stale/blank panels | BASELINE |
| V7 | Components | Insert instance, resolve links, usedIn consistent | BASELINE |
| V8 | Ligatures | Create/edit, preview merge | BASELINE |
| V9 | Kerning | Edit group value, preview offset | BASELINE |
| V10 | Live preview | Page + panel + pop-out render, kern/ligature applied | BASELINE |
| V11 | SVG import/export | SVG font export + outline paste/DnD | BASELINE |
| V12 | OTF import/export | Import OTF/TTF/WOFF, export OTF/TTF/WOFF(/2), round-trip geometry | Covered by `test/roundtrip.test.js` (22 tests pass) |
| V13 | Project import/export | `.gs2` save/load + v1 `.txt` import + version gates (future rejected, <1.13.2 rejected) | BASELINE |
| V14 | UI-font vs project-font separation | App text in Noddy UI type; glyph/preview/export render project data; no global override of `display-canvas`/`font-preview`/`edit-canvas` glyph surfaces | BASELINE (rule defined, Phase 1 contract pending) |
| V15 | Responsive: wide desktop | ≥1280px: no clip, canvas usable | BASELINE (known: works ≥1000px) |
| V16 | Responsive: narrow | Contract width (TBD Phase 1): panel overlay/reflow, no hidden clip | BASELINE (known: clips <1000px today) |
| V17 | Responsive: short height | Contract height (TBD): panels/dialogs scroll, controls reachable | BASELINE |
| V18 | Keyboard/tab order | Shortcuts (Ctrl+S/Z/E/G, Space, arrows, tool keys) + visible focus, sane tab order, no `tabindex>0` | BASELINE (gaps noted in 05) |
| V19 | Branding/versioning | Noddy name/icons/metadata/version badge correct; GPL/attribution intact; `.gs2` compat preserved | BASELINE (no rename yet) |

Record per milestone: date, branch, lint/test/build, reviewer, manual browser checks, screenshots, pass/fail per row. (Phase 0 rows are BASELINE inputs; execution re-runs deferred to the Phase 1 packet.)
