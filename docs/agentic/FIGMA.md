# Figma map

**File:** https://www.figma.com/design/XQHz0qOrTAmZhWw7h71a2S/noddy (fileKey `XQHz0qOrTAmZhWw7h71a2S`)

**Work only on page "claude" (0:1).**
- **Never** modify the page "Agent feature · two additions" (3:2), the variable collection "Noddy agent proposal", or the "Agent proposal/*" text styles. That is rejected Codex work.

## What is where (page "claude")

| Area | Node | Notes |
|---|---|---|
| Section "Design system" | 50:2 | Boards: Overview, Color, Typography, Spacing & radius, Effects, Iconography, Logos, Glyphs (50:68, 117 glyph components), Components (50:78) |
| Section "Flow" | 71:402 | 01 New font 71:412 · 02 Brief 71:417 · 03 Plan 71:422 · 04 Approve the style 71:427 · 05 Drafting 71:432 · 06 Edit by hand 71:437 · 07 Review 71:442 · 08 Export 71:447 |
| Section "Feature · Ripple" | 136:2810 | R1 Draw 140:5264 · R2 Noticed 136:5057 · R3 What I see 136:2848 · R4 Not quite 136:4460 · R5 Pick 138:3915 · R6 Drafts landed 139:4368 · R7 Kept 139:5200 · R8 Edge board 142:5335 |

**Variables:**
- `Noddy/Primitives`
- `Noddy/Color` (Light/Dark)
- `Noddy/Space`
- `Noddy/Radius`

**Text styles:** `Noddy/*`
- Display, Title and Heading use ROND 60.
- Mono is Google Sans Code.
- Icon 16/20/24 are Material Symbols Rounded, FILL 0.
- Glyph ref uses Google Sans Code Medium Italic.

**Effect styles:** `Noddy/shadow-*`

**More detail:**
- Every ID: [figma/ledger.json](figma/ledger.json).
- Screens as PNG: [figma/screens/](figma/screens/).
- Glyph outline data (Inter, OFL) used for the mockups: [figma/glyphs-inter.json](figma/glyphs-inter.json).

## Code ↔ Figma token names

Every Figma variable has WEB code syntax `var(--color-<group>-<name>)`, `var(--space-N)` or `var(--radius-*)`. The CSS should use the same names so Dev Mode maps 1:1. The pre-Codex CSS tokens live in `src/common/colors.css` (OKLCH) and the type roles in `src/common/resets.css`.

**Known deviations from the pre-Codex values, made in Figma for contrast (the owner may revert):**
- `text/secondary` → warm/550 #75625A
- dark `bg/subtle`/`border/default` → new primitives

## Updating Figma during the build

- **If the Figma MCP tools are available** (`use_figma`, `get_screenshot`): keep the file in sync when the build changes the design.
  - Add or adjust components and screens on page "claude".
  - Follow the existing structure.
  - Never touch the protected Codex page or tokens.
  - Before writing, read the figma-use skill rules (one `use_figma` call at a time; bind tokens).
- **If the tools are not available:** append every design change to [figma/CHANGES.md](figma/CHANGES.md) with the screen or component name, so it can be synced later.
