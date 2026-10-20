**Noddy Figma audit: file XQHz0qOrTAmZhWw7h71a2S, page "claude" (read-only, nothing changed)**

**No P0 findings.** These checks came back clean:
- **Variables.** Primitives has 37 variables with scopes `[]`. Color has 24 Light/Dark aliases, all matching the spec table. Space has 9 with scope GAP (which also covers padding). Radius has 5 with scope CORNER_RADIUS. Every variable has WEB code syntax `var(--…)`.
- **Text styles.** All 13 Noddy styles match the spec. Display, Title and Heading carry ROND 60 in the style and on every node that uses them, with 0 mismatches.
- **Effect styles.** All 4 match the spec values exactly.
- **Flow section.** 2863 nodes: 1440 fills and 456 strokes, all bound, 0 raw. All 704 text nodes use a Noddy style. No wrong fonts, all 9 effects use styles, 0 detached frames. All 1176 instances have their main component.
  - The 6 agent windows sit 16px from the bottom-right corner.
  - The 372 GlyphTiles show the right glyph for their Char label (0 mismatches).
  - TopBar progress, pill line, tile states and the export ring agree on every screen.
- **Design system section.** 0 raw paints. 991 of 995 text nodes styled. 13 component sets, none with variants stacked or overlapping. All 13 sets and all 155 standalone components have descriptions. All 114 drawn glyphs have their fill bound to `glyph/ink`.
- **Protected work.** Only two pages exist (claude, plus the Codex page), so no page was added.
  - Page "Agent feature · two additions" (3:2) has 318 nodes, all with ID prefix 3, 12 or 16; this project's nodes start at 48. It has no bindings to Noddy variables or styles and no instances of Noddy components.
  - Collection "Noddy agent proposal" still has 21 variables and its one Light mode, all from session 3. No node on "claude" binds to it or uses an "Agent proposal/*" style.
  - Property edits made in place can't be ruled out without version history.

### P1
1. **The export scrim uses a text token.** Scrim 76:2996's fill is bound to `text/primary`, whose scope is TEXT_FILL only. Fix: add Color variable `bg/scrim` (Light → warm/900, Dark → warm/975, scopes FRAME_FILL+SHAPE_FILL, `var(--color-bg-scrim)`) and rebind 76:2996.
2. **Progress tracks use a border token as a fill.** TopBar ring Track 63:159 (15 flow nodes, e.g. I72:402;63:159) and AgentWindow Progress bar 66:222 are filled with `border/default`, which is STROKE_COLOR only. In Dark mode `border/default` (warm/950) equals `bg/surface`, so the track disappears. Fix: add `bg/track` (Light → warm/200, Dark → warm/700, scopes FRAME_FILL+SHAPE_FILL) and rebind both.
3. **The SpecimenCard Knob stroke uses a fill-only token.** Knob 64:120's stroke is bound to `bg/accent` (6 flow instances). Fix: add `border/accent` → peach/300 with scope STROKE_COLOR, and rebind the stroke.
4. **`text/secondary` fails AA contrast** (owner decision, since it's a spec value). Light warm/500 #8E7970 gives 4.1:1 on white and 3.7:1 on the canvas, and it's used at 11–13px. Fix: add primitive warm/550 #76635A (5.1:1 on canvas) and re-alias Light to it.

### P2
5. **Dark-mode borders vanish.** `border/default` Dark (warm/950) is the same colour as `bg/surface` Dark, so 1px borders disappear on surfaces. Fix: re-alias Dark to a new warm/850 ≈ #3A2E29 (owner decision; spec value).
6. **Two more scope-only violations:** Badge 66:346's stroke uses `bg/surface-raised`, and the SpecimenCard guide frames (I75:1033;64:122;75:1073/1077/1081) are filled with `glyph/guide`. Fix: add STROKE_COLOR to `bg/surface-raised`, and add FRAME_FILL to `glyph/guide` (or turn the guides into RECTANGLEs).
7. **The "Yours" status never appears in the flow.** Across all screens: 0 Yours, against 32 Draft and 71 Kept. Fix: in screen 07's grid 76:1807, set the tile for "a" (hand-edited in screen 06) to Status=Yours.
8. **Dead hidden layers in the GlyphTile real variants:** the "Ghost" instances 62:63, 62:71, 62:79, 62:117, 62:125, 62:133. They're carried into 103 flow instances. Fix: delete them.
9. **Hidden "Dot" ellipses in the Chip Neutral/Accent variants:** 61:202, 61:207, 61:212, 61:217. Fix: delete them, or expose them as a boolean property "Dot".
10. **Space and Radius variables have no descriptions** (14 variables; Color and Primitives have them). Fix: add short usage descriptions.
11. **Name field 80:2690 has an unbound itemSpacing of 2.** Fix: set it to 0, or bind it to `space/1`.
12. **The welcome start cards are plain frames.** 80:2700, 80:2706 and 80:2713 are three identical frames, not instances. Fix: make a `StartCard` component (Icon, Label, Line text properties) and swap all three for instances. Doing the same for the Export sheet rows in 76:3009 is optional.
13. **AgentMessage's variant property is named `Type`, not the spec's `From=Agent/User` plus card types.** Fix: rename the property, or say so in the description of set 65:225.
14. **4 Typography specimen texts at 120px have no text style:** 52:4, 52:9, 52:14, 52:19. These are intentional documentation; keep them as an exemption. Their fonts and ROND values (60 vs 0) are correct.
15. **All 94 variants have empty descriptions.** The sets are documented, so this is optional: add descriptions to the variants where state semantics matter (GlyphTile, AgentWindow).
16. **The 13 component-set containers have a raw cornerRadius of 5** (Figma's default). Cosmetic; you can bind it to `radius/sm` or leave it.
17. **Effect-style shadow colours are raw** (#000, #3C1D0F). Optional: bind the shadow-float colours to warm/900.
18. **Status marks have low non-text contrast.** peach/400 and green/500 marks are about 2.4:1 on white. The shapes are distinct, so this is acceptable; check the marks at 16px.
19. **CSS variable names collide with the rejected Codex collection.** "Noddy agent proposal" (which we must not touch) defines `var(--space-2/3/4/6)`, the same names as Noddy/Space, and gives both `color/background` and `primitive/background` the same `var(--background)` name. Dev Mode code export will show duplicates. No change allowed there; the owner may want to delete that collection.
20. **The ledger is stale.** `componentProps.GlyphTile` still lists `Glyph#62:0`, the instance-swap property that was replaced by the slot `Glyph#79:0`. Fix: update `/private/tmp/claude-501/-Users-kshitij-Documents-cursor-shit-font-agent/cc9d2811-81a9-4259-a0ad-5786d9603f5b/scratchpad/figma/ledger.json`.