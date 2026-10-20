**Verdict:** The structure is sound: geometry first, then Drafts, one checkpoint, and honest skips. But v1 promises a ripple the engine can only deliver for one way of drawing. The flow also has about twice as many controls as it needs.

**1. Over-promises**
- **The hero demo only works if the tail is drawn as a new contour.** Most people will drag a's existing foot outward. The spec answers that with "I can't copy point drags yet", so the headline demo fails on the most common edit. *Fix:* treat the ink a point drag adds as a shape. Cut it out with exclude, then unite it onto each target. Do the same with `cut_ink` for removed ink. Keep "can't copy" only for edits that move ink without adding or removing it, such as thinning or bending.
- **The chips claim anatomy the engine can't verify.** The engine rates naming the exact part as research, yet `Curly tail` `Stem foot` plus "Pretty sure" sounds certain. *Fix:* chips state only what was measured ("baseline · right stem"). The anatomy word lives in the caption, and it is marked *Pretty sure* only when `label_parts` confirmed the part.
- **"3 ways" has nothing to vary.** A snapped shapelet can only change size, angle or mirror. Cut VariationStrip from v1, or name its three axes.
- **Wild means two things.** It is both "150%" and "AI redraw". Strength should only scale. AI redraw becomes a separate per-tile action with a badge ("Redraw this one").
- **"Same, adapted per letter" never says what adapts.** Name it: fit to stem width, keep height relative to the baseline, adjust sidebearings.
- **Slant for the whole font is a different feature.** It needs an italic angle, optical corrections and about 117 Drafts. Move it to v2, or label it honestly as "Oblique, no corrections".

**2. Type-design errors**
- **Spacing is missing.** A curly tail widens the right sidebearing and runs into the next letter. Transfer must re-space each target, and `check_outlines` must check pairs such as *ad*, *ut* and *lt*.
- **The kin logic is wrong.** A curl on a's foot is an *exit stroke*, so it belongs only on a letter's last stroke: the right stem of d and u, the ends of i, l and t, and the rightmost stem of n, h and m. It never goes on n's left foot or m's middle feet. An "All feet" chip invites exactly that mistake. *Fix:* recipe `side` should mean "exit stroke".
- **"Hooked feet · t l" assumes a humanist font.** In a geometric sans, l is a plain stem and t would end up with two tails. Chip labels must come from what `label_parts` found in this font.
- **The specimen can't show consistency.** "adult dual" contains only rippled letters, so there is nothing to compare against. Mix in letters that weren't rippled, for example "handle mutual".
- **Wild at 150% breaks the rule that lowercase stays calmer.** Cap it by the space available: no intrusion into the descender zone, and counters stay open.
- **The notice threshold (3 units, 0.2% em²) is too low.** Overshoot and stem tweaks of 5–15 units are routine refinement and would trigger pips constantly. Show a notice only when there is something to offer.

**3. Missing states**
- The user edits a, n and o before opening anything. Is that one card per glyph, or one merged card when the recipe matches?
- The user undoes back to the baseline. The pip should disappear.
- A notice fires while the agent is busy with another task in the panel.
- The preview dry run is computing. Tiles need a loading state.
- Every target gets skipped at apply.
- ⌘Z after a per-tile Revert undoes the Revert, not the ripple, which contradicts the spec. Is Keep itself undoable?
- The source is edited after Keep. Say plainly that a ripple is a one-time copy, not a live link; Illustrator Global Edit users will expect a link.
- Quiet mode has no way back. Add On / Quiet / Off in the panel.
- **Tool budget:** the flow needs about 9 tool calls plus `vary_ripple` per tile, against a limit of 8 per request. Run stages 1 and 3–5 as a host pipeline, and let the model only read and write the caption.

**4. Steps and buttons to cut**
- **Merge R5 and R6.** Show the ghost on a tile the moment it is selected. Drafts can already be reverted, so a separate preview step asks for confirmation twice. The flow becomes: Read → Pick (live ghosts + strength) → **Ripple 4** → Keep.
- **Drop these:**
  - Shift-click, because a click already toggles.
  - The 7-item part picker, because Point at it plus the alternative chips cover it.
  - **Keep it a one-off**, because ignoring the card already means that.
  - The 24px before→after thumbnail in the pill, because it is too small to read.
  - Green Kept tiles. A kept glyph should just look normal.
- **Tiles carry too many marks.** One tile can show up to eight (pip, ring, ghost, tier, Draft, lock, amber, green). The peach Draft dot also clashes with the peach Notice pip. *Rule:*
  - At most two marks per tile.
  - Mark only tiers that are not Solid.
  - A Draft gets a dashed border and nothing else.
- **Copy:** "Before ripple saved" is engineering talk. Use "⌘Z undoes all 4".

**5. Where it turns into an AI toy**
- **"No idea what that is, but I'm into it" followed by a Wild ripple** spreads something nobody has defined. Split the two cases:
  - It couldn't *name* the edit but found an anchor: ripple normally at *Probably*.
  - It found no anchor: one-off only.
- **"Sprinkle 2 more"** has the agent decorating letters nobody asked about. Make the user pick the tiles, or cut it.
- **Captions get grating.** Joke only on the first reading, and use a plain one-liner after that.

**6. Open questions: my recommendations**
1. **Notice timing:** only on leaving the glyph or Close. A 2 s idle trigger counts as chatter, and in focus mode the tile isn't visible anyway.
2. **Wild:** v1 only exaggerates the snap-on. AI redraw comes later as a per-tile action.
3. **Hand-edited Drafts:** yes, hand-editing a Draft makes it Yours.
4. **Point drags:** "caption only" is not acceptable. Use the ink-delta fix from section 1.