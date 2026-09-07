# 08 — Verification Matrix (regression)

Baseline: `noddy/phase0-discovery` @ `b84c54db` — lint 0 err/2 warn, 612/612 pass, build passes.
Phase 2: `noddy/phase2-foundation` (integrates 2A tokens/type/states, 2B controls, 2C shell/brand/versioning) — lint 0 err/2 warn (same pre-existing), **618/618 pass** (612 + 6 new CSS-typography-guard tests), build passes, `ci:versions` passes (`2.11.0-noddy.0`). No protected-area logic changed; static checks green. Browser/manual + responsive-tier interaction checks are USER checks (see Phase 2 packet checklist).

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
