The UI components are finished on page "claude" inside the Components board (50:78). There are 13 component sets with 94 variants, 2 single components (TopBar, SpecimenCard) and 34 icon components. Every set and component has a description and a labelled variant grid, nothing is stacked at 0,0, and the Components placeholder shimmer is off.

**What's on the board**, grouped by section (component ID in brackets):
- **Icons:** 34 `Icon/<name>` components (60:15–60:147). Each is Material Symbols ligature text in Icon 20; a screenshot confirmed the ligatures draw as icons.
- **Controls:**
  - Button (61:85): 18 variants; Label text, Leading icon boolean, Icon swap.
  - IconButton (61:113): 6 variants; Icon text.
  - SegmentedPill (61:187): 10 variants, Text and Icon types.
  - Chip (61:261): 12 variants.
- **Glyphs & tools:**
  - StatusMark (62:25): 6 variants.
  - GlyphTile (62:146): 14 variants; Glyph swap defaults to Glyph/a, plus Char text.
  - ToolPill (62:256): 6 variants, one per active tool, built from a private `_ToolButton` set (62:174).
- **Editor:** MetricField (63:83), InspectorCard (63:146), TopBar (63:153).
- **Workspace:** SpecimenCard (64:107), whose "Glyphs" slot holds "Hamburg" as glyph instances; Composer (64:164).
- **Agent:** AgentMessage (65:225), AgentWindow (66:359) with State × Status, 8 variants.
- **States:** the two showcase boards, "Agent window states" (67:258) and "Glyph tile states" (67:356).

**Checks:** the audit found no unbound solid paints and no text without a Noddy text style. Only Google Sans Flex, Google Sans Code and Material Symbols Rounded are in use. I fixed every defect the screenshots showed. Section 50:2 is resized to 2848×10818.

**Where I departed from the spec**
1. **Two new foundations:**
   - Text style `Noddy/Icon 16`, for the 16px status marks.
   - Color variable `bg/accent-hover`: peach/400 in Light, peach/200 in Dark. The Primary hover needed it because a semi-transparent overlay bound to a variable rendered as solid black. It isn't on the Color board yet.
2. **One text default per property:** a text property can't hold a different default per variant. So AgentMessage uses Message for Agent and Reply for User, and the minimized pill has one text property per status.
3. **GlyphTile:** only the Draft, Kept and Yours tiles contain the swappable glyph; the other statuses show Glyph/ghost. I kept the showcase tiles at 1× because scaling them up unlinked their text styles.

Ledger (all IDs, property keys and notes): `/private/tmp/claude-501/-Users-kshitij-Documents-cursor-shit-font-agent/cc9d2811-81a9-4259-a0ad-5786d9603f5b/scratchpad/figma/ledger.json`