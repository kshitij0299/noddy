# Noddy UX Verifier Rubric (focused — use this, not the full skill, per finding)

Source skill (depth reference only): `docs/redesign/skills/UX-Audit-Rethink.md`.
Binding product rules (override the skill on conflict): `AGENTS.md`, contracts `10/11/12/13`.
Tooling: `scripts/browser/drive.mjs` + `docs/redesign/14-browser-loop.md`.

## What to check on every screenshot (heuristics, adapted)

1. **State visibility** — selected tab/panel/dropdown/tool always obvious at a glance.
2. **No overlap/cutoff** — every control fully inside its card; nothing collides or clips.
3. **Alignment** — labels/inputs/buttons share baselines and grid edges within a card.
4. **Sane text** — no one-word-per-line wrapping, no giant/shrunken type vs neighbors.
5. **Dropdowns** — open as floating menus above content, select + close on choice/Escape/outside-click.
6. **Feedback** — hover/selected/disabled/loading/error states visible and distinct.
7. **Consistency** — same control looks/behaves the same on every panel.
8. **No console errors** — harness `console` step must come back empty (a red console = FAIL).

## Accessibility quick checks (WCAG-flavored)

- Keyboard-only: Tab reaches everything in sane order, focus ring always visible.
- Icon-only buttons have accessible names (spot-check via attributes, not pixels).
- Text contrast: body/labels on their backgrounds must read effortlessly (pairs from Contract 1 §5; muted/destructive light values are near-miss — restrict to secondary/large text).
- Touch targets ≥24px on new/changed controls.

## Noddy contract compliance (spot-check, guard test covers the rest)

- Tokens/type roles per Contract 1; UI font never on glyph/preview surfaces (Contract 2).
- Tiers per Contract 3: T1 ≥1100, T2 760–1099 drawer, T3 <760 sheet, short <620 scrolls.
- No banned patterns (AGENTS.md §1/§3b): old-branch grids, breakpoints, drawer hacks, overflow masks, glow/dot-grid.

## Screenshots per round (minimum)

Desktop 1600×1000: overview, characters+attributes, layers, transforms, guides, history, char-info, quality, live-preview options, kerning attrs, ligatures/components attrs; dropdown OPEN + CLOSED on attributes; narrow 700×900: characters + live-preview; short 1600×620: characters. Console capture on characters page.

## Report format (compact — no image dumps)

Per item: PASS/FAIL + one line. Per defect: page/panel, what's wrong, what it should be, screenshot path, severity (blocker/major/minor). End with overall GO / NO-GO + round count. Never commit screenshots (they live in /tmp).
