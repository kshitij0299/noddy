# Type design knowledge for Noddy's "what did you do to my *a*?" feature

## 1. Anatomy words, kept plain (for how the agent talks)

| Term | Plain one-liner the agent can say |
|---|---|
| stem | The main straight upright stroke (l, the right side of a) |
| bowl | A curved stroke wrapped around a space (o, the belly of a, b/d/p/q) |
| counter | The hole inside a letter: closed in o and d, open in c and u |
| aperture | The mouth of an open counter (c, e, a, s) |
| terminal | Any stroke end. It can be a flat cut, a ball, a teardrop or a hook |
| ball terminal | A round blob at a stroke end, like the top hook of many a's |
| tail | A stroke that trails off at the bottom (Q, the flick at the foot of a, t, u, and the j/y descender) |
| ear | The little flag on g's top right |
| spur | A tiny nub or point sticking off a stroke (top of a's stem, G's corner) |
| shoulder / arch | The curved hump coming off a stem (n, h, m). It is upside down in u |
| crotch / junction | Where two strokes meet (n's stem and shoulder, a's bowl and stem) |
| crossbar | A horizontal stroke across a letter (e, f, t, A, H) |
| arm | A stroke that is free at one end (E, F, T, the upper stroke of k) |
| leg | A downward stroke that is free at the bottom (R, K, k) |
| apex / vertex | The pointy top (A) or pointy bottom (V, v, w) |
| spine | The main S-curve of S and s |
| serif / foot | Small caps or feet at the ends of strokes |
| dot / tittle | The dot on i and j |
| ascender / descender | The part above the x-height (b d f h k l) or below the baseline (g j p q y) |
| overshoot | Round and pointy parts poke slightly past the guide lines so they look the same height as flat parts |
| contrast | How much stroke thickness changes between thick and thin parts |
| ink trap | A small notch cut into a tight joint |

## 2. Kinship map for GF Latin Kernel (A–Z, a–z, 0–9)

Propagation tiers:
- **T1:** copy the change and adapt it lightly.
- **T2:** adapt it heavily.
- **Echo:** caps and figures. Only offer these with consent.

A designer's general order is: n and o, then h m u r l i j and c e b d p q, then a s g, then v w y x k z, then f t, then the caps (from H, O and A), then the figures. Sources: [TypeType L10](https://typetype.org/blog/universitty-lesson-10-designing-basic-lowercase-characters/), [TypeType L8](https://typetype.org/blog/universitty-lesson-8-designing-basic-latin-characters-uppercase-characters/), [Briem: diagonal](https://help.fontlab.com/fontlab/8/tutorials/briem/4-0-modules/briem-4-04-diagonal), [Briem: numerals](https://help.fontlab.com/fontlab/8/tutorials/briem/4-0-modules/briem-4-07-numerals/).

| part_id | control | T1 | T2 | Echo (ask) | Skip |
|---|---|---|---|---|---|
| shoulder | n | h, m (narrower arches) | r (partial arch), u (n turned 180°), a (top hook echoes it) | none | o c e s, diagonals |
| round_bowl | o | c, e (opened) | b d p q (bowl+stem join), g upper bowl, a lower bowl (smaller) | O C G Q D; 0 6 9 (0 usually narrower than O) | stem-only glyphs (l i) |
| stem | l | i j h k b d | n m r u p q a | I H E F L T; 1 4 | o c e s v w x z |
| stem_top_xheight (spur/serif) | n | m r u i j p | none | none | ascender tops |
| ascender_top | l | b d h k | f, t (t is shorter) | none | x-height letters |
| baseline_foot (serif/tail) | n | h m i l k r | u d a (right-stem foot), t (hooked foot) | H I K L M N T; 1 4 | round bottoms (o c e s, b's bowl), p q (stems go below the baseline) |
| curved_terminal (cut/ball/teardrop) | a | c r f s | j y g (descender ends), e, t | C G S J; 2 3 5 6 9 | stems, straight ends |
| descender | p | q | g j y (hooked) | Q tail, J | ascenders |
| crossbar | f | t (same height and length) | e (bar inside the bowl) | A H E F; 4 | everything else |
| diagonal | v | w y x | k z | A V W X Y K M N Z; 7 4 | rounds |
| vertex/apex | v | w y | none | A V W M N; 4 | none |
| spine | s | none | none | S; 2 3 5 8 (curve echo) | none |
| ear | g | none | r (arm end) | none | none |
| leg | k | none | x | R K | none |
| tittle | i | j | none | none | everything else |
| junction (crotch) | n | h m r | b d p q a u g k | A B D M N P R V W | o c e s l i (no joins) |

## 3. How designers actually spread a change

**Control glyphs come first.** Designers settle n and o, along with H and O (plus v/V or A for diagonals), before anything else. Every other letter is derived from them. Proofing happens in words such as "adhesion" and "hamburgefonstiv", never in isolated letters ([TypeDrawers](https://typedrawers.com/discussion/comment/12884/), [Briem: spacing](https://help.fontlab.com/fontlab/8/tutorials/briem/5-0-spacing/briem-5-04-lower-case/)).

**Aim for family resemblance, not clones.** Glyphs ships Smart Components because a plain copy rarely fits ([Glyphs: smart components](https://glyphsapp.com/learn/smart-components)):
- m's shoulders are narrowed.
- h's crotch is lowered.
- u is the same width as n or narrower, because its open top makes the counter look bigger.
- c is wider than its open shape alone would suggest.
- A single-story g has a narrower, higher bowl ([TypeType L10](https://typetype.org/blog/universitty-lesson-10-designing-basic-lowercase-characters/)).

**Parts come in categories, and that suggests a tool taxonomy for the agent.** Glyphs splits reusable parts into Corner components (serifs, ink traps), Cap components (terminals, spurs), Segment components and Brushes (stroke textures), and Smart components (shoulders) ([Glyphs Handbook](https://handbook.glyphsapp.com/reusing-shapes/), [Corner](https://handbook.glyphsapp.com/components/corner/)). Noddy could sort each edit into one of four types:
- **part-local:** a terminal, foot, junction or spur
- **part-shape:** a bowl or shoulder geometry
- **glyph-global:** slant or wobble
- **one-off:** a single feature that shouldn't spread

**Pitfalls when a part is copied blindly:**
1. **Overshoot.** Round and pointed shapes have to extend past the baseline and x-height to look aligned. Points need even more than rounds ([GF Knowledge: overshoot](https://github.com/google/fonts/tree/main/cc-by-sa/knowledge/glossary/terms), [Frere-Jones, Typeface Mechanics 001](https://frerejones.com/blog/typeface-mechanics-001), [reprint](https://stockholmstypografiskagille.se/typonyheter/typeface-mechanics-001/)). A rule of thumb is about 1.5–2% of the height, but it depends on the design ([TypeDrawers](https://typedrawers.com/discussion/comment/13034)). If a bowl becomes flat (squared), it should lose its overshoot. If a flat part becomes round, it should gain overshoot.
2. **Horizontals look heavier.** A horizontal and a vertical of the same measured thickness don't look equal: the horizontal reads heavier. Copied bars and arms need thinning ([Typeface Mechanics 002](https://stockholmstypografiskagille.se/typonyheter/typeface-mechanics-002/)).
3. **Joints thin out.** Where strokes meet, they should get a little thinner, or the joint looks blobby ([Ohno](https://ohnotype.co/blog/ohno-type-school-a)).
4. **Contrast and stress.** Rotating or mirroring a part moves its thin spots. In a high-contrast face, n turned upside down is not a correct u. Mirroring also reverses path direction, so contours have to be reversed afterwards. Glyphs' serif tutorial advises rotating 180° instead of mirroring ([Glyphs: serifs](https://glyphsapp.com/learn/serif-components)).
5. **Shared heights.** a's terminal cut sits at the same height as the cuts on c, e and s ([Briem](https://help.fontlab.com/fontlab/8/tutorials/briem/4-0-modules/briem-4-04-diagonal)). g's descender matches y's. Propagation should keep these alignments.
6. **Spacing.** A new part changes the glyph's width and sidebearings. n is the spacing reference: u shares n's left sidebearing and h shares n's right one. After propagating, re-space the glyph and check kerning for collisions (tails, loops).
7. **Case and scale.** Lowercase terminals should be smaller and calmer than uppercase ones ([TypeType L10](https://typetype.org/blog/universitty-lesson-10-designing-basic-lowercase-characters/)). An ink trap can't be deeper than the stroke is thick ([Tosche](https://tosche.net/blog/ink-traps-and-pals)).
8. **What not to copy.**
   - Identity parts (g's ear, Q's tail, R's leg), unless that part is the one the user edited.
   - Features that have no matching anatomy in the target, such as a stem foot on o.
   - A decorative feature on every glyph, which turns into noise.
   - Glyphs marked "Yours".

## 4. Ten weird and fun edits to *a*, and how each should transfer

| # | Edit on a | Transfer (in order) | How it adapts | Skip |
|---|---|---|---|---|
| 1 | **Curly tail** on the stem foot | d, u (same right foot), then t, l (hooked feet). Offer n h m i feet as "all feet?" | Scale the curl to the stroke width; widen the right sidebearing; keep the curl above the descender zone | o c e s (round bottoms), p q (stem continues below the baseline), caps/figures unless asked |
| 2 | **Spike** on the top terminal | c, r (arm end), f, s (top), then j y g ends; Echo: C G S J, 2 3 5 | Point the spike along each stroke's direction; it may poke past overshoot on purpose but stays consistent; smaller on lowercase | stems, flat stroke ends |
| 3 | **Square bowl** | d b p q, then g upper bowl, then o c e as squarish bowls; Echo: O C D G Q, 0 6 9 | Remove overshoot; thin the horizontals; keep the stem joins; keep c and e apertures open; ask "square the n/h/m shoulders too?" | s spine, diagonals |
| 4 | **Ink trap** at the bowl–stem joint | d b p q, g, u, then n h m r (shoulder crotch), k; Echo: A M N V W K | Depth no more than the stroke thickness; centred on diagonal joints; deeper in acute joints | o c e s l i (no inside joints); right-angle outside corners (T L) |
| 5 | **Extra loop** on the top hook (a twist that crosses itself) | c, r, f, g ear, then j y as looped descenders | Merge the overlapping outline before export; size the loop to the counter; add sidebearing or kerning so it doesn't collide | s, e (the loops crowd them), caps unless asked |
| 6 | **Stencil cut** through the bowl/stem | Every closed counter: o b d p q g e; Echo: A B D O P Q R 0 4 6 8 9; open glyphs optional | Each closed counter gets at least one gap so it would stay attached in a real stencil; put cuts in the same place across glyphs (e.g., the vertical axis); match the gap width | i, l, dots: decorative only, ask first |
| 7 | **Ball terminal** on the top hook | c, r, f, then j y g, s, t; Echo: C G J S, 2 3 5 6 9 (smaller or none on caps) | Ball size relative to stroke; same cut height as a, c, e, s; calmer on lowercase | stems, e's lower end (optional), 7 |
| 8 | **Slant** (the whole a leans) | Global: every glyph, as an oblique | Skew, don't rotate; round letters get a slight counter-correction; set the italic angle metadata; re-space | Nothing, but ask "just a, or slant the font?" |
| 9 | **Wobble** (hand-drawn jitter) | Global, as a texture/brush pass on all glyphs | Seeded random per glyph so copies aren't identical; amplitude relative to stroke; keep extremes on the baseline and x-height; don't close apertures | Tittles and tiny parts (lower amplitude) |
| 10 | **Blob/drip** off the bowl | One-off. Suggest 2–3 accent glyphs (o, d, e), each varied | Vary size; keep inside the descender space; re-check line spacing | g j p q y (descender already there), figures, wholesale propagation |

**Source caveats:**
- frerejones.com and printmag returned 403, so the Typeface Mechanics points come from reprints and summaries.
- Karen Cheng's *[Designing Type](https://yalebooks.yale.edu/9780300249927/designing-type)* and typography.guru were not read directly.
- The anatomy definitions draw on the [Monotype/Fontsmith A–Z](https://www.monotype.com/resources/z-typographic-terms) and the Google Fonts Knowledge glossary source ([GitHub, CC BY-SA](https://github.com/google/fonts/tree/main/cc-by-sa/knowledge/glossary/terms)).
- Two kinship links rest on single sources: "a's hook echoes the n shoulder" and "0 is narrower than O". Briem builds 0 from O.