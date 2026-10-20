**Noddy Figma review: 25 issues across the 8 flow screens and the design-system boards, ranked by priority**

Overall it reads as a serious, friendly tool rather than an AI toy. The rounded ROND 60 headings, the peach and brown palette and the minimal chrome all match the brief. Most of the problems are in flow logic and in floating elements that are 8px off the layout grid.

**P0**

1. **The Codex page may be missing.** `get_metadata` lists only the page "claude". The spec says "Agent feature · two additions" must stay untouched. **Fix:** check version history and restore the page if it was deleted or renamed.
2. **Screens 02–04: the brief contradicts the result.** The brief says "Friendly rounded sans, soft ends", but every drafted glyph is plain Inter. At the approval peak the agent looks like it ignored the user. **Fix:** change the brief text and chips to match a simple sans, e.g. "Clean simple sans, open curves". Update the user bubbles in 72:1138, 75:1375 and 76:2263 to match.
3. **Screen 07 (grid 76:1807) breaks the status model.**
   - The "a" tile was hand-edited in 06 but is still Draft. The Yours status never appears anywhere in the flow.
   - "Keep all a–z" also covers the failed k.
   - **Fix:** set the a tile to Yours (blue edit mark) and relabel the button "Keep 24" (all of a–z except k and a).

**P1**

4. **Floating window and pill are 8px off the grid.** They use 16px insets while the layout gutter is 24px, so they stick out 8px past the cards' right and bottom edges. The window also overlaps the specimen card by just 24px, which looks like an accident. This affects windows 72:740, 72:1138, 75:1375, 76:2263 and pills 75:1943, 81:2838. **Fix:** inset by 24px, and make the window 380×484 so its top lines up with the shelf header at y=392.
5. **The agent window body has 150–270px of empty space above the messages** on 02, 03, 04 and 07. **Fix:** item 4 reduces it. On 02, also centre Logo/Mark at 32px above "What are we drawing?" as an empty state.
6. **There is a ~408px empty area to the right of the shelf when the agent is minimized** (grids 75:1539, 76:2437). The legend also ends at x=1008. **Fix:** let the grid fill the width with 13 columns of about 101×112 tiles (glyph slot ×1.4), and right-align the legend to 1416. This also makes the font bigger.
7. **Drafting and Queued tiles look the same at 1x** (StatusMark 62:25; tile g on screen 05). Also, 51 identical Queued rings add noise. **Fix:**
   - Drafting: a solid 2px peach tile border plus an arc ring.
   - Queued: hide the ring on tiles and show it only in the legend.
8. **The screen 07 receipts are a text log.** Three near-identical Mono rows, and only for x, y, z. **Fix:** replace them with one strip of 26 mini glyphs (k in red) plus a single chip "25 ok · 1 failed".
9. **The screen 06 editor header (81:2716) has two identical `chevron_left` icons**, one for back and one for previous. **Fix:** make back a `close` icon at the far left (Esc), and put prev/next in a pill on either side of the glyph.
10. **The screen 08 export actions are unclear** (76:3034, 76:3002). The ring and the Glyphs row say 116/116 complete while 3 drafts remain. **Fix:** ring centre "113 kept" with a peach arc for the 3 drafts. Make the primary button "Keep 3 & export OTF" and the secondary "Export with drafts".
11. **`text/secondary` fails contrast.** warm/500 #8E7970 gives 4.1:1 on white and 3.7:1 on canvas, and it is used for 11–13px tile labels and metric labels. **Fix:** add a primitive warm/550 #75625A (5.2:1 on canvas) and point `text/secondary` (Light) at it.
12. **`bg/subtle` is invisible on `bg/canvas`** (#F5F0EE on #F7F2F0, about 1.02:1). The set chip on 01 (80:2693) and the shelf's segmented pill container disappear. **Fix:** use `bg/surface` for chips and pills on canvas, or set `bg/subtle` Light to warm/100.
13. **Two dark-mode token clashes:**
   - `bg/subtle` and `bg/surface-raised` are both warm/925, so agent bubbles vanish in the dark window.
   - `border/default` equals `bg/surface` (warm/950), so borders vanish.
   - **Fix:** add a primitive #352B27 for dark `bg/subtle` and #3A2E29 for dark `border/default`.
14. **Flow screens have no visible edges** (section 71:402). The frame background matches the section fill, so screen 01 just floats. **Fix:** set the section fill to warm/100 and give the frames shadow-sm.
15. **Overview cover hierarchy is upside down** (50:4 / 51:2). "Noddy design system" is smaller than the tagline, and the middle of the 2608px cover is empty. **Fix:** make the title Display, the wordmark about 440px wide, and bottom-align the stat cards with the tagline.
16. **Screen 03 (72:1138): the user bubble drops the sketch.png attachment** that was shown on 02. **Fix:** add an image chip above the bubble.

**P2**

17. **Specimen 75:1033 turns peach on screen 04 only**, which has no consistent meaning. Metric guides also mix grey and blue on 04 and on the 06 canvas (81:2774). **Fix:** keep the card white, and bind every guide to `glyph/guide`, with the baseline at 100%.
18. **Lowercase ghosts are cap-height** (Glyph/ghost 57:384), which breaks the shape of "Hamburg" on 02, 03 and 05. **Fix:** add Ghost variants for x-height and descender.
19. **Screen 03 plan row mixes chip styles.** "noHO" is a peach Label chip while the other steps are Mono neutral chips. **Fix:** make all four Mono chips and make only the first one Accent.
20. **The screen 04 peak is underpowered.** The copy "Style first. Happy?" reads like a toy, and the glyphs are about 60px. **Fix:** say "Style check", use 96px glyphs with draft dots, and make the buttons full width (Approve as primary).
21. **Screen 08 details** (76:3009, 76:2996):
   - The Drafts row uses a bare dot. **Fix:** use StatusMark Draft.
   - The agent pill is missing under the scrim. **Fix:** add the Idle pill.
   - The brown scrim looks muddy. **Fix:** use warm/975 at 24%.
22. **GlyphTile 62:146: Selected+Draft loses its dashed border**, so the shape cue is gone. **Fix:** keep the dashed border and add a 2px outer focus ring.
23. **Screen 01 start cards** (80:2700/2706/2713) show a "selected" border with no button to confirm it, and there is about 50px of dead space between icon and title. **Fix:** make the border a hover state, and set the cards to about 248×140 with the icon next to the text.
24. **Board counts are wrong.**
   - Typography (50:41) and Overview say 12 styles, but there are 13 (Noddy/Icon 16 is missing).
   - Color (50:14) says 23 semantic tokens, but there are 24 (`bg/accent-hover` is missing).
   - **Fix:** add the missing rows and update the counts.
25. **Effects well 52:162:** shadow-xs, sm and md look the same on `bg/subtle`. **Fix:** put the demo cards on `bg/canvas` and add one real example each (pill, inspector, window).

Screenshots are in `/private/tmp/claude-501/-Users-kshitij-Documents-cursor-shit-font-agent/cc9d2811-81a9-4259-a0ad-5786d9603f5b/scratchpad/review/`.