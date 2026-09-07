# 03 — Design-System Inputs (Phase 0 — NOT the Phase 1 contract)

> Phase 0 snapshot of the safe visual subset. The binding Phase 1 design-system contract comes later and needs approval before product code.

Source: `Noddy — Visual Vibes (Safe — Colors, Fonts, Logos).md` (2026-09-01). Copy tokens/type/marks only — never layout.

## Palette (OKLCH, `src/common/colors.css:47` pattern)

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--background` | `oklch(1 0 0)` | `oklch(0.1979 0.0107 39.2759)` | Page paper |
| `--foreground` | `oklch(0.2707 0.054 44.1725)` | `oklch(0.9799 0.0076 48.6561)` | Body (warm, not black) |
| `--primary` ★ | `oklch(0.8141 0.1261 58.1544)` same both | same | Every accent (CTA/ring/active) — does not shift in dark |
| `--primary-foreground` | `oklch(0.2707 0.054 44.1725)` | — | On-peach text |
| `--secondary` | `oklch(0.9584 0.006 43.3348)` | `oklch(0.2404 0.0153 39.2562)` | Subtle surfaces |
| `--muted` | `oklch(0.9702 0 0)` | `oklch(0.2572 0.015 39.2662)` | Disabled/track |
| `--muted-foreground` | `oklch(0.5931 0.0295 44.5478)` | `oklch(0.6848 0.0223 48.3765)` | Secondary text/labels |
| `--border` | `oklch(0.9055 0.0111 54.4854)` | `oklch(0.2404 0.0153 39.2562)` | Dividers/cards |
| `--ring` | peach | peach | Focus ring |
| `--destructive` | `oklch(0.6137 0.2039 25.5645)` | `oklch(0.6884 0.2009 24.0561)` | Danger only |
| `--radius` | `0.45rem` | — | Cards/controls |
| `--tracking-tight` | `calc(var(--tracking-normal) - 0.025em)` | — | Display |

Shadows `--shadow-xs/sm/md` (subtle `hsl(0 0% 0% / 0.03–0.06)`). Neutrals hue 39–48° (warm paper), peach 58.15°. Do NOT copy legacy `hsl()` ramps (`--royal-*` etc.) or `--gray/blue-l*` aliases except for compat.

## Typography roles

- `--font-sans`: `Google Sans Flex` variable (opsz 6..144, wght 1..1000, ROND 0..100) — UI/body.
- `--font-serif` (display): same Flex file at `ROND 60`, 700 — h1–h3 only (≈ Arvo Bold cap-height).
- `--font-mono`: `Google Sans Code` 400..700, tabular-nums, no ligatures — code/pre/`.number`/`input[type=number]`/metrics.
- Icons: `Material Symbols Rounded` (opsz 24, wght 400, FILL 0) — e.g. `ink_pen`.
- Scale (roles, sentence case; only `label--meta` uppercase): h1 `clamp(2rem,1.75rem+0.8vw,2.25rem)`/700/1.15/tight/ROND60; h2 1.5rem/700/1.25; h3 1.25rem/700/1.30; h4 1rem/600/1.40/sans; body 0.875–0.9375rem/400/1.60; label 0.8125rem/500/1.50/0.01em; label--meta 0.6875rem/600/1.20/0.06em uppercase; code 0.8125–0.875em/500/1.60 mono.
- Load via Google Fonts `@import` (Flex + Code + Symbols) + preconnect; keep `FiraGo` `@font-face` only as offline fallback.
- Hard rule for Phase 1 contract: UI type for app text only; glyph/preview/export/SVG/canvas surfaces render project/font data; global CSS must never override preview/glyph rendering.

## Logos / marks

Vault `assets/noddy-graphics/` (17 files). Keep: `noddy-logo-big.svg` (hero, PNG-wrapped — retrace later), `noddy-icon.svg` (favicon 975²), `noddy-icon-bg.svg` (bg variant), `logo-icon-two-color.svg` (only true vector, `#004b70` + `#9df` — reference for themeable retrace). Archive (not active): Glyphr wordmarks horizontal/vertical/small. Note: PNG-wrapped SVGs ignore `fill: var(--primary)` (filter/drop-shadow only).

## Explicitly NOT safe (do not copy)

Prior-branch layout: `272px 44px 1fr` + 12px gap + dot-grid/glow wrappers + 900px drawer transforms; `84px/108px 1fr` card grid + doubleInput fallbacks + `@container`; discord-rail `72px` + pill/tooltips + 900/560 breakpoints; `overflow-x: clip`, `scrollbar-gutter: stable`, `contain: layout` patches; triple-stop dark gradient inline. Guardrail: if a diff touches `grid-template-columns`, 900/560 breakpoints, drawer `translateX/is-open`, or `inset:-40px` glows — stop.

## Open questions for Phase 1 contract

Token names/location, light/dark strategy, focus-ring token, state definitions (hover/selected/disabled/loading/empty/error), spacing/elevation scales, icon usage rules, page hierarchy + component principles, logo placement/favicon/manifest, attribution footer.
