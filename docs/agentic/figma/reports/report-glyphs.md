I built 117 glyph components on page "claude" (the 116 characters plus `Glyph/ghost`). They sit in the Glyphs board (50:68) inside the Design system section. One screenshot of the finished board showed no clipped text, no overlaps, correct orientation and the right fonts. I touched nothing outside page "claude".

**Components**
- **Count:** the board returns 117 components. Every outline's fill is bound to `glyph/ink` (0 unbound).
- **Names:** each is `Glyph/<name>` (for example `Glyph/A`, `Glyph/zero`, `Glyph/period`). Each component's description holds the character, its codepoint and its advance.
- **Size:** each is the em box, advance × 0.05 wide by 123.95 tall, with the baseline at 99.2px. A check on `Glyph/A` gave x 2.6, y 24.75 and height 74.45, as expected.
- **Outline:** one vector per glyph, made with `createNodeFromSvg` (viewBox `0 0 adv 2479`, nonzero fill rule).
- **Spaces:** `Glyph/space` (57:374) and `Glyph/uni00A0` (57:379) are empty, 28.8px wide.
- **Ghost:** `Glyph/ghost` (57:384) is 55px wide. It holds a dashed 2px rectangle in `glyph/ghost`, running from baseline to cap height, with corners bound to `radius/md`.

**Board layout**
- **Groups:** Uppercase 55:2, Lowercase 55:7, Figures 55:12, Punctuation 55:17 (32), Symbols 55:22 (20), Spaces 55:28 and Ghost 55:33. Spaces and Ghost share the last row.
- **Grid:** 13 columns of 178×176 cells. Each cell has a `bg/subtle` background, a thin `glyph/guide` baseline line, and the glyph name in Noddy/Mono small. Group titles use Noddy/Subheading with a small count beside them.
- **Board:** the board now grows with its content (2631px tall) and the placeholder shimmer is off. I resized the section 50:2 to 2848×8223.

**Where I departed from the spec**
1. I flipped the y values in the path data before import instead of using the `matrix(1 0 0 -1 0 1984)` transform. The result is the same orientation, but the vectors aren't stored as mirrored layers.
2. The ghost isn't in the six groups you listed, so I gave it its own "Ghost" group.
3. The spaces' dashed outlines and the baseline lines belong to the board cells, not the components, so instances don't carry them.
4. `Glyph/j` sits 1.3px left of its box because the font data puts it there. It still shows fully because clipping is off.

Ledger (now includes a `glyphs` map of all 117 names to IDs): `/private/tmp/claude-501/-Users-kshitij-Documents-cursor-shit-font-agent/cc9d2811-81a9-4259-a0ad-5786d9603f5b/scratchpad/figma/ledger.json`

Generator scripts are in `/private/tmp/claude-501/-Users-kshitij-Documents-cursor-shit-font-agent/cc9d2811-81a9-4259-a0ad-5786d9603f5b/scratchpad/figma/scripts/`:
- gen-glyphs.js
- glyph-prelude.js
- merge-ledger.js