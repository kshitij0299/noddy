# Noddy agentic editor: Figma spec (v2, minimal visual direction)

Owner feedback on the HTML prototype (20 Oct 2026):
- It was too text-heavy.
- Start from the **pre-Codex Noddy visual language** (`noddy/main` @ f2bb1bc9): rounded Google Sans Flex, the text styles chosen before Codex.
- Make it a **minimal, visual** agentic font editor: the font is shown nicely in one part of the screen, and the agent is a **floating window that can be minimized**.
- Work in Figma, tokenized, so the owner can edit it.
- Interaction rules carried over from the brief:
  - Latin Kernel (116), with the default view showing letters and figures only
  - agent letters stay Draft until Keep
  - simple sans
  - Esc and minimizing never stop a run

Figma file: `XQHz0qOrTAmZhWw7h71a2S`.
- **Everything goes on the existing page "claude". Make no new pages** (owner's request). Organize the page with Figma **Sections**:
  - **Design system** (left area): a polished documentation board with these sub-sections:
    - *Overview*: cover with the Noddy wordmark, a one-line principle and the version
    - *Color*: primitive ramps, plus semantic Light/Dark swatches showing token names and hex
    - *Typography*: each text style rendered with its name, font and size/line/tracking; show the ROND 60 rounded display
    - *Spacing & radius*
    - *Effects*
    - *Iconography*: the Material Symbols in use
    - *Logos*
    - *Glyphs*: the 116 glyph components in a tidy grid
    - *Components*: every component with its variants, in labelled, tidy component sets
  - **Flow** (to the right of the design system, clearly separated): the 8 numbered screens, left to right.
- Wherever this spec says page "Foundations", "Glyphs" or "Components", read it as the matching sub-section on page "claude".
- **Do not touch** the page "Agent feature · two additions", the variable collection "Noddy agent proposal" or the "Agent proposal/*" text styles. That is Codex's rejected work; leave it alone.

## 1. Visual language (from pre-Codex `src/common/resets.css` and `colors.css`)

### Type: Google Sans Flex, with `variationSettings` set in Figma `fontName`

| Style | Font | Size / line | Tracking | Notes |
|---|---|---|---|---|
| Display | Flex Bold, wght 700, **ROND 60** | 36 / 1.15 | -2.5% | h1 |
| Title | Flex Bold, wght 700, **ROND 60** | 24 / 1.25 | -2.5% | h2 |
| Heading | Flex Bold, wght 700, **ROND 60** | 20 / 1.3 | -2.5% | h3 |
| Subheading | Flex SemiBold 600, ROND 0 | 16 / 1.4 | -2.5% | h4 |
| Body | Flex Regular 400 | 14 / 1.6 | 0 | |
| Body small | Flex Regular 400 | 13 / 1.5 | 0 | |
| Label | Flex Medium 500 | 13 / 1.5 | +1% | sentence case |
| Meta | Flex SemiBold 600 | 11 / 1.2 | +6% | UPPERCASE, eyebrows only |
| Mono | Google Sans Code Medium 500 | 13 / 1.4 | 0 | numbers, codepoints, metrics |
| Mono small | Google Sans Code Medium 500 | 11 / 1.3 | 0 | glyph labels in tiles |

- Icons: **Material Symbols Rounded** Regular as ligature text (FILL 0, wght 400). 20px in UI, 24px on the tool pill. Names: `ink_pen`, `arrow_selector_tool`, `add_circle`, `crop_square`, `circle`, `pan_tool`, `undo`, `redo`, `close`, `remove`, `open_in_full`, `close_fullscreen`, `send`/`arrow_upward`, `attach_file`, `check`, `check_circle`, `edit`, `error`, `pause`, `stop`, `download`, `dark_mode`, `tune`, `auto_awesome` (avoid sparkle clichés: use the Noddy mark for the agent instead), `chevron_left`, `chevron_right`, `expand_more`, `image`, `grid_view`, `text_fields`.
- Check exact style names with `listAvailableFontsAsync` first. Figma has Google Sans Flex Thin…Black (+ Italic), Google Sans Code Light…ExtraBold, and Material Symbols Rounded Thin…Bold.
- UI type never renders font content. Glyphs and specimens use the glyph vectors.

### Color: OKLCH tokens converted to hex

**Primitives** (one mode, scopes `[]`):
- peach/50 #FFF4EA · peach/100 #FFE6CF · peach/200 #FFCFA3 · **peach/300 #FFAD6C** (brand primary) · peach/400 #E69654 · peach/600 #BD712D · peach/800 #904700
- warm/0 #FFFFFF · warm/25 #FEFAF8 · warm/50 #F7F2F0 · warm/75 #F5F0EE · warm/100 #EBE7E4 · warm/200 #E6DED9 · warm/300 #D4C6BE · warm/500 #8E7970 · warm/600 #A6968E · warm/700 #615149 · warm/900 #3C1D0F · warm/925 #2A211E · warm/950 #261D1A · warm/975 #1A1412 · warm/990 #FDF7F4
- green/500 #62BB78 · green/50 #DCF7E1 · blue/500 #5FA5DE · blue/50 #DFF1FF · amber/500 #EBBD57 · amber/50 #FFF0CC · red/500 #E53E3E · red/400 #FF5A5A · red/50 #FFE7E4

**Color** (modes Light / Dark; aliases to primitives; set scopes):

| Token | Light | Dark |
|---|---|---|
| bg/canvas (app background) | warm/50 | warm/975 |
| bg/surface | warm/0 | warm/950 |
| bg/surface-raised (floating window) | warm/0 | warm/925 |
| bg/subtle (hover, wells) | warm/75 | warm/925 |
| bg/accent | peach/300 | peach/300 |
| bg/accent-subtle (selected) | peach/50 | #3A2A20 (add primitive peach/950) |
| text/primary | warm/900 | warm/990 |
| text/secondary | warm/500 | warm/600 |
| text/on-accent | warm/900 | warm/900 |
| border/default | warm/200 | warm/950 |
| border/strong | warm/300 | warm/700 |
| focus/ring | peach/300 | peach/300 |
| glyph/ink | warm/900 | warm/990 |
| glyph/ghost (missing glyph outline) | warm/300 | warm/700 |
| glyph/guide (metric lines) | blue/500 at ~50% via its own primitive #9CC7EC | #2D4A63 |
| status/draft | peach/400 | peach/300 |
| status/kept | green/500 | green/500 |
| status/yours | blue/500 | blue/500 |
| status/failed | red/500 | red/400 |
| status/*-subtle | the 50s | dark tints |

- **Space** (one mode, scope GAP plus padding): space/1 4 · 2 8 · 3 12 · 4 16 · 5 20 · 6 24 · 8 32 · 10 40 · 12 48.
- **Radius** (scope CORNER_RADIUS): radius/sm 4 · radius/md 8 (≈0.45rem) · radius/lg 12 · radius/xl 20 (floating window, specimen card) · radius/full 999 (pills).
- **Effects:**
  - shadow/xs: 0 4 10 0 #000 3%
  - shadow/sm: 0 4 10 0 #000 6% + 0 1 2 -1 #000 6%
  - shadow/md: 0 4 10 0 #000 6% + 0 2 4 -1 #000 6%
  - shadow/float: 0 16 40 -8 #3C1D0F 18% + 0 2 6 0 #3C1D0F 6% (agent window)
- Every variable gets WEB code syntax `var(--…)` named after the token, e.g. `var(--color-bg-surface)`.

### Shapes and feel
- The friendly feel comes from rounded corners and pill tabs. The pre-Codex welcome tabs are peach pills. Primary buttons are peach fill with dark brown text.
- The focus ring is 2px peach with a 2px offset.
- Hovers change paint only.
- Generous whitespace. Minimal chrome, few borders (1px border/default where needed), soft shadows only on floating things.

## 2. Logo assets (scratchpad `figma/` folder)
- `noddy-icon-0.png`: 861×861 cursor-hand mark (peach with brown outline). Header mark at 28px, agent avatar at 24px.
- `noddy-logo-big-0.png`: 1394×586 cartoon wordmark "Noddy". Welcome hero at about 280px wide.
- Upload with the `upload_assets` tool (POST raw bytes with Content-Type image/png). Then build components "Logo/Mark" and "Logo/Wordmark" whose fill is that image.

## 3. Glyph assets
`figma/glyphs-inter.json` = `{meta:{upm:2048, ascender:1984, descender:-495, xHeight:1117, capHeight:1489}, glyphs:{char:{cp,name,adv,d}}}`
- 116 GF Latin Kernel characters.
- Outlines are y-up font units: flip with `y' = ascender - y`. Path data uses M/L/Q/Z.
- Use `figma.createNodeFromSvg('<svg width=W height=H viewBox="0 descender… ">…')`, or build the SVG string with `transform="matrix(1 0 0 -1 0 ascender)"`. Name the components `Glyph/<name>` (e.g. `Glyph/A`, `Glyph/a`, `Glyph/zero`).
- **Component size:** em box with 1 unit = 0.05 px, so the height is (1984+495)×0.05 ≈ 124 px and the width is adv×0.05. The baseline sits at 99.2 px from the top. Each component's vector fill is bound to `color/glyph/ink`.
- Also make `Glyph/ghost`: a dashed rounded rectangle in glyph/ghost, 1100 units wide, for missing characters.
- **Scaling:** scale instances to size with `instance.rescale(factor)`.

## 4. Layout: desktop frame 1440×900

- **Top bar** (56px, bg/canvas, no border):
  - left: Logo/Mark 28 + font name "Bakery Sans" (Subheading) + a small set progress ring "48/116" (Mono small)
  - right: icon buttons (undo, redo, theme) and Export (secondary button)
- **Specimen card** (the hero: the font shown nicely):
  - full width with 24px margins, about 340px tall, bg/surface, radius/xl, no heavy border
  - shows the font LIVE in large glyph instances (about 140–180px), e.g. "Hamburg" or "Aa Bb Cc" lines; missing glyphs as Glyph/ghost
  - a small mode pill top-left (icons, not words: `text_fields` Text · `view_week` Spacing · `format_size` Waterfall) and a size control top-right
- **Glyph shelf** (below the specimen):
  - header row: "Letters & figures" Heading (ROND 60) with a segmented pill "62 · All 116"
  - status legend as dots (only in screens where it helps)
  - tile grid: tiles 72×84, radius/md, bg/surface; glyph centered; a tiny Mono-small char label bottom-left; a status mark top-right
  - **Status marks are shapes, not colour alone:**
    - Empty: tile shows Glyph/ghost faint
    - Queued: small hollow ring
    - Drafting: peach dashed ring
    - Draft: peach filled dot + dashed tile border
    - Kept: green `check_circle`
    - Yours: blue `edit` dot
    - Failed: red `error`
- **Agent window** (floating, bottom-right, 16px from the edges):
  - **Expanded:** 380×540, radius/xl, bg/surface-raised, shadow/float
    - header 48: Logo/Mark 24 + "Agent" Label + model chip ("GPT-5" Mono small) + minimize (`remove`) + close
    - body: messages (agent bubbles left on bg/subtle, user bubbles right on bg/accent-subtle), compact cards for plans and approvals
    - composer pinned bottom: rounded input with attach (`attach_file`) and a round peach send button
  - **Minimized:** a pill 300×52, radius/full, shadow/float. Contains the mark, a status line in Label ("Drafting b · 23/62"), a mini progress bar or ring, and `open_in_full`. Pill states: Idle ("Ask the agent"), Running (progress), Needs you (peach dot + "4 glyphs to review"), Paused.
  - Minimizing never stops work.
- **Glyph editor (focus mode):** opens over the workspace when a tile or specimen letter is clicked.
  - large canvas (bg/surface) with the glyph at about 420px, metric guides (ascender, cap, x-height, baseline, descender) with tiny Mono labels, and side-bearing lines
  - floating vertical **tool pill** on the left (radius/full, shadow/sm): select (`arrow_selector_tool`), pen (`ink_pen`, active = peach), add point, rectangle, oval, hand
  - floating **inspector card** on the right (radius/lg): advance / left / right in Mono fields; for drafts, Keep (primary) and Revert
  - top-left: back chevron + "A" + "Latin capital A" (Label, text/secondary) + prev/next
  - bottom: a context strip of the glyph in words ("nnAnn HHAHH") at about 48px
  - agent minimized pill bottom-right
  - Esc closes the editor
- **Welcome / New font:** minimal and centered.
  - Logo/Wordmark, then a name field ("Bakery Sans")
  - a set chip ("Latin Kernel · 116"), then three big start cards with icons: Start with agent (Logo/Mark), Draw myself (`ink_pen`), From a font file (`upload_file`)
  - Each card has one short line. No paragraphs.

## 5. Components (on page "Components", tokens bound everywhere)

| Component | Variants / details |
|---|---|
| Button | Variant=Primary/Secondary/Ghost × Size=Md/Sm × State=Default/Hover/Disabled. Primary = bg/accent + text/on-accent; Secondary = bg/surface + border; radius/full; text property "Label"; optional leading icon (boolean + instance swap) |
| IconButton | Size=Md(36)/Sm(28) × State=Default/Hover/Active; holds a Material Symbols text icon (text property "Icon") |
| SegmentedPill | 2–3 segments; selected segment = bg/accent; text props |
| Chip | Neutral/Accent/Status; Mono or Label text |
| StatusMark | Status=Queued/Drafting/Draft/Kept/Yours/Failed (16px) |
| GlyphTile | Status=Empty/Queued/Drafting/Draft/Kept/Yours/Failed × Selected=false/true; contains a Glyph instance (INSTANCE_SWAP property "Glyph"), char label text prop, StatusMark |
| ToolPill | vertical stack of tool buttons; Active tool variant |
| AgentWindow | State=Expanded/Minimized; the minimized pill has Status=Idle/Running/NeedsYou/Paused |
| AgentMessage | From=Agent/User; plus Card types: Plan, Approval (glyph row + Approve / Tweak / Edit by hand), Receipt ("b · 2 contours · ok") |
| Composer | Empty/Typing |
| TopBar, SpecimenCard, InspectorCard, MetricField (Mono value + label) | |

## 6. Flow screens (page "claude", left to right, 1440×900 each, 120px apart, each titled above with Meta + Title text)
1. **New font**: welcome as described.
2. **Brief**: an empty workspace. The specimen shows ghost boxes for "Hamburg"; the shelf is all Empty tiles. The agent window is expanded with "What are we drawing?", 3 suggestion chips ("Friendly rounded sans", "Clean geometric", "Add a sketch"), and a composer holding a typed brief with an attached image chip.
3. **Plan**: the agent shows one compact Plan card: spec chips (x-height 1117 · cap 1489 · stems 180) as Mono chips, the drawing order as a row of small glyph groups ("n o H O" → a–z → A–Z → 0–9), a spend cap ("up to $1.20"), and Start / Adjust. Short.
4. **Approve the style**: n o H O are drafted (Draft tiles). The specimen shows "noHO" big. The agent shows an Approval card with the four glyphs: Approve · Tweak · Edit by hand. This is the emotional peak, so make it beautiful.
5. **Drafting**: the agent is minimized to a pill ("Drafting g · 23/62", progress). The specimen shows "Hamburg" with some letters real and some ghosts. Tiles are in a mix of states (Kept, Draft, Drafting, Queued). The run keeps going while minimized.
6. **Edit by hand**: the glyph editor on "g" or "a" with the pen tool active, a partially drawn contour showing anchor points and handles (peach), the inspector, the context strip and the minimized agent pill.
7. **Review**: lowercase is all Draft. The agent is expanded showing receipts plus "Keep all a–z". One tile is Failed with a retry. "Keep" turns tiles to Kept.
8. **Export**: a calm modal or sheet. Coverage ring 116/116 · checks list with icons · Export OTF (primary) · Export draft anyway.

Also on "Components": a board "Agent window states" (Expanded, Minimized Idle, Running, NeedsYou, Paused) and "Glyph tile states".

**Minimal-text rule:**
- No paragraphs anywhere. Labels of 1–4 words; agent messages of 1–2 short lines.
- Use glyphs, icons, numbers and shape instead of words. The font itself is the hero.
