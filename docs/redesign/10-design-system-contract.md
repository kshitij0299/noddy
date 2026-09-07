# Contract 1 — Noddy Design System (binding, Phase 1)

Status: PROPOSED — requires user approval before any product code. Implements the safe subset of `Noddy — Visual Vibes (Safe — Colors, Fonts, Logos).md`. `.pen` files are out of scope (user-confirmed useless).

## 1. Tokens (Phase 2 ADDS these blocks to `src/common/colors.css` `:root` + `.dark`/`[data-theme='dark']` — that file currently holds only legacy `hsl()` ramps)

**Decision: keep existing token NAMES (generic, not brand-specific); change VALUES only.** No `--noddy-*` renames — renames would churn every consumer for zero visual gain.

### Light (`:root`)

```css
--background: oklch(1 0 0);
--foreground: oklch(0.2707 0.054 44.1725);
--card: oklch(1 0 0);
--primary: oklch(0.8141 0.1261 58.1544);
--primary-foreground: oklch(0.2707 0.054 44.1725);
--secondary: oklch(0.9584 0.006 43.3348);
--muted: oklch(0.9702 0 0);
--muted-foreground: oklch(0.5931 0.0295 44.5478);
--border: oklch(0.9055 0.0111 54.4854);
--ring: oklch(0.8141 0.1261 58.1544);
--destructive: oklch(0.6137 0.2039 25.5645);
--radius: 0.45rem;
--tracking-tight: calc(var(--tracking-normal) - 0.025em);
--shadow-xs: 0px 4px 10px 0px hsl(0 0% 0% / 0.03);
--shadow-sm: 0px 4px 10px 0px hsl(0 0% 0% / 0.06), 0px 1px 2px -1px hsl(0 0% 0% / 0.06);
--shadow-md: 0px 4px 10px 0px hsl(0 0% 0% / 0.06), 0px 2px 4px -1px hsl(0 0% 0% / 0.06);
```

### Dark (`.dark`, `[data-theme='dark']`)

```css
--background: oklch(0.1979 0.0107 39.2759);
--foreground: oklch(0.9799 0.0076 48.6561);
--card: oklch(0.1979 0.0107 39.2759);
--secondary: oklch(0.2404 0.0153 39.2562);
--muted: oklch(0.2572 0.015 39.2662);
--muted-foreground: oklch(0.6848 0.0223 48.3765);
--border: oklch(0.2404 0.0153 39.2562);
--destructive: oklch(0.6884 0.2009 24.0561);
/* --primary, --ring, --radius, shadows: UNCHANGED from light (peach passes on both) */
```

Frozen (do not touch): legacy `hsl()` ramps (`--royal-*`, `--purple-*`, `--orange-*`, `--green-*`, `--gray/blue-l*`) stay for backward-compat; `src/common/colors.js` mirror values must be updated to match.

## 2. Type roles (values from Safe Vibes §2; scoping governed by Contract 2)

| Role | Spec |
|------|------|
| h1 display | Flex ROND 60, 700, `clamp(2rem,1.75rem+0.8vw,2.25rem)`, lh 1.15, tight |
| h2 / h3 | Flex ROND 60, 700, 1.5rem / 1.25rem, lh 1.25 / 1.30, tight |
| h4 section | Sans ROND 0, 600, 1rem, lh 1.40, tight |
| body/p | Sans, 400, 0.875–0.9375rem, lh 1.60 |
| label | Sans, 500, 0.8125rem, lh 1.50, 0.01em, sentence case |
| label--meta | Sans, 600, 0.6875rem, lh 1.20, 0.06em, UPPERCASE — super-titles only |
| code/mono/number | Google Sans Code, 500, tabular-nums, no ligatures |
| icons | Material Symbols Rounded (opsz 24, wght 400, FILL 0) |

Font loading: Google Fonts `@import` (Flex variable + Code + Symbols) + preconnect; keep `FiraGo` `@font-face` as offline fallback only.

## 3. Spacing (new work only — no refactoring of existing layouts to this scale)

Base 4px: `--space-1:4px`, `--space-2:8px`, `--space-3:12px`, `--space-4:16px`, `--space-6:24px`, `--space-8:32px`. New/changed surfaces use these; existing px values stay until their surface's milestone.

## 4. Elevation & radii

`--shadow-xs` (cards at rest), `--shadow-sm` (raised/hover, dropdowns), `--shadow-md` (modals, pop-outs). `--radius:0.45rem` default; `--radius-sm:calc(var(--radius)*0.6)` chips/inputs; `--radius-full:999px` pills/avatars. No glow/dot-grid wrappers (banned — prior-branch pattern).

## 5. States (every shared control/surface implements all applicable)

- focus: visible ring `2px solid var(--ring)` + offset 2px via `:focus-visible`; never `outline:0` without replacement (fixes current canvas/nav/tab gaps).
- hover: `--secondary` surface shift; no hover-only meaning (touch/keyboard parity).
- selected/active: `--primary` accent (nav pill, tabs, toggles) with `--primary-foreground` text.
- disabled: `--muted` surface + `--muted-foreground` text, `cursor:not-allowed`, `aria-disabled`.
- loading: skeleton shimmer in `--secondary`/`--muted` + `aria-busy`, no layout shift.
- empty: `--muted-foreground` illustration-adjacent copy + action (first-run placeholders).
- error: `--destructive` text/border + plain-language message + recovery action; error codes (FR*/FF*/SVG*/PF*) preserved verbatim for support.
- Contrast: text pairs must meet WCAG AA 4.5:1 (3:1 large text); current sub-AA usages (`0.64em` super-titles, `opacity:.4-.6` states) must be fixed on touched surfaces.

## 6. Icons & logos

- Icons: Symbols Rounded ligature names (`<span class="material-symbols-rounded">ink_pen</span>`); 20–24px UI, never icon-only without `title` + `aria-label`.
- Logos: hero `noddy-logo-big.svg` (open-project, ~420px, PNG-wrapped accepted for now); favicon `noddy-icon.svg`; PWA icon `noddy-icon.svg`; wordmark text fallback `Nodd<span>y</span>`; `logo-icon-two-color.svg` is the retrace reference — full vector retrace is deferred post-foundation, NOT in Phase 2.
- Placement: open-project hero, top-bar mark (small icon + wordmark), about page, manifest. Nowhere inside editing surfaces.

## 7. Page hierarchy & component principles

- Hierarchy preserved: L1 PAGE → L2 EDITING → L3 item; editor pages (panel + rail + canvas) vs content pages (nav + panel + reading area) keep their patterns — only styling changes in Phase 2.
- Reuse `fancy-button`, `input-number`, `option-chooser/toggle`, `tabs`, `dialogs`, `info-bubble`, `progress-indicator`; no new dependencies; no new global CSS files (extend existing load order); string-builder page/panel pattern stays (no framework migration).
- Diff guardrail (binding): any diff touching `grid-template-columns` structural values, 900/560 breakpoints, drawer `translateX/is-open`, `overflow-x:clip`, `scrollbar-gutter`, `contain:layout`, or glow/dot-grid wrappers is automatically out of scope — revert and re-scope.
