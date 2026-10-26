# Ripple: feature spec (v1, revised)

## 1. Concept

**Mess with one letter. Watch the rest catch it.**

You change one glyph by hand, for example pulling the foot of *a* into a curly tail. Noddy says what you did in type words and offers to ripple it to the letters that end the same way. Ghosts appear on their tiles, you ripple, then keep what you like.

**Why it's fun:** a weird edit counts as a style choice, not a mistake. The agent reacts like a friend who knows type, and the change lands across the grid as a wave. It stays a real tool: measured diff, per-font anatomy, Drafts until Keep, one shared undo.

**A ripple is a one-time copy, not a live link.** Editing *a* later does not change the letters it rippled to.

**Visual language:**
- Before: grey ghost (`glyph/ghost`)
- Added ink: peach (`bg/accent`)
- Removed ink: red hatch (`status/failed`)
- Regions: numbered badges ① ②
- Proposals: dashed peach outlines

---

## 2. Flow: Draw → Notice → Read → Pick → Ripple → Keep

1. **Draw.** The user edits *a* in editor focus mode, either by drawing a new contour or by dragging points. The agent stays silent.
2. **Notice (host only, no model call).**
   - The baseline is taken when *a* opens. The edit settles on editor Close or a switch to another glyph.
   - It fires when a contour of at least 0.2% em² is added or removed, or when at least 1% em² of ink changes.
   - Overshoot and stem tweaks (5–15 units) stay silent, and so do whole-glyph moves, scales and skews.
   - A peach **pip** appears on *a*'s tile and the pill shows *Noticed · a*. It is never modal. Undoing back to the baseline removes the pip.
   - **Several glyphs edited:** one pip each; pill *Noticed · a n o*. Matching recipes merge into one card ("Same tail on *a* and *n*", both sources). Others stack, newest first.
   - **Agent busy:** the pip appears; the pill stays on the current task until it ends.
3. **Read.** Clicking the pip or pill opens the **Ripple card**.
   - **DiffGlyph:** *a* drawn large with the ghost, the peach ink and numbered regions.
   - **Measured chips** appear instantly: `Baseline` `Right stem` `+2.1% ink`. Hovering a chip highlights its region. Chips never claim anatomy.
   - **Caption:** one model call reads the renders and the diff facts. The anatomy word appears only here: "Your *a* grew a curly tail off its foot."
   - **Confidence:** *Pretty sure* only when `label_parts` confirmed the part; otherwise *Best guess*.
   - **Tone:** playful for each new kind of edit, then plain for repeats ("Same tail, on *n* this time.").
   - **Not quite:** 2–3 alternative readings plus **Point at it** (circle the part). Either one rewrites the reading.
4. **Pick.** **Ripple it** lights up the kin and puts a live ghost on every selected tile. There is no separate preview step.
   - **Kin follows the stroke's role.** A curl on *a*'s foot is an **exit stroke**, so it goes only on a letter's last stroke: the right stem of *d u*, the foot of *i l t*, the rightmost stem of *n h m*. Never *n*'s left foot or *m*'s middle feet.
   - **Chip names come from what `label_parts` found in this font:** `Plain foot · d u i l` (on), `Hooked foot · t` (off: two tails), `Last stem · h n m` (off). `Caps & figures` shows only if they have the part, never pre-selected.
   - Click a tile to toggle it. The count updates live ("4 letters").
   - **Yours** tiles are locked and never pre-selected. Clicking one asks about that glyph only: "Include your *m*?"
   - **Strength:** **Subtle · Same · Wild**. It only scales.
     - **Subtle** is about 60%.
     - **Same** is 100%, adapted to each letter: thickness fits the target's stem width, height stays relative to the baseline, and spacing follows the rule below.
     - **Wild** goes up to 150%, capped. It never reaches further into the descender than the source did, and counters stay open.
   - **Specimen:** mixes rippled and unrippled letters so you can check consistency ("handle mutual build"). Hold **Space** to see Before.
   - **Loading:** selected tiles shimmer while the dry run computes.
   - **Tiers:** Solid has no mark. **Probably** is a half dot, used when the part came from a heuristic, the edit wasn't named, or there is no vision.
5. **Ripple.** **Ripple 4** writes one history entry, *Ripple a → d u i l*. Drafts land outward from *a* with a 60 ms stagger. Failures go into a collapsed **Skipped** list with a reason each. If every target fails, nothing is written.
6. **Keep.**
   - **Keep all** or **Revert all** on the card. Keep or Revert per tile on hover, or in the inspector.
   - **Undo:** there is one history, newest first. The ripple, each Keep and each Revert are separate entries. Right after a ripple the card reads "⌘Z undoes all 3."
   - Kept tiles go back to their pre-ripple look, so Yours stays Yours. The card collapses to *a → d u l · kept 3*.
   - Hand-editing a Draft makes it Yours.

**Spacing rule.** Targets copy the source's choice: if *a* was widened to clear its tail, each target widens by the same margin; if *a*'s tail overhangs, targets overhang by the same share. `check_outlines` then tests pairs (*ad ut lt il*). A collision turns the tile amber ("touches *t* in *lt*") without skipping it.

---

## 3. Edge states

| Case | Behaviour | Copy |
|---|---|---|
| Refinement, whole-glyph move/scale/skew | Silent | none |
| Not named, but anchored | Normal ripple, capped at *Probably* | "Not sure what to call it. It hangs off the foot, though." |
| No anchor (a blob, a face on *o*) | Reading only | "One of a kind. Staying that way." |
| Anchored, but no kin | Reading only. Offers Caps & figures if they share the part | "Nothing else ends like that." |
| Ambiguous | Best guess, alternatives, Point at it | "Curly tail? Hook? Swash?" |
| Bend or thinning | Reading only | "Noted. I can't copy bends yet." |
| No vision model | Caption from measurements. No legibility check, top tier *Probably* | `Read from measurements` |
| Stops reading as its letter | Allowed, shown amber | "Your *r* now reads like a *v*." |
| Target fails a check | Skipped. Broken geometry is never shown | "*i*: outline crossed itself" |
| Every target fails | Nothing written | "Couldn't ripple any of these. Try Subtle?" |
| *a* edited during Pick | Ghosts fade | "*a* changed · Refresh" |
| Target edited during Pick, or open during Ripple | Left out. Commit stays atomic | none |
| Target is an older ripple's Draft | Allowed. Revert returns it to that Draft. A lineage chip shows the chain | "*a* → *d* → …" |
| *a* edited after Keep | A fresh notice | "Rippled letters don't follow *a*. Ripple again?" |
| 3 notices ignored | Goes Quiet (pips only) and says so once | "I'll stay quiet. Switch back in the panel menu." |

**v2:** Save as Move for other projects (parts are re-detected there, capped at *Probably*), whole-font Oblique, copying bends (`warp_points`), and **Redraw this one** (AI redraw for one tile, badged *Wild guess*).

---

## 4. Figma screens

**Layout:**
- top bar
- left column: specimen card (240 tall), then the **Letters & figures** grid
- right side: the agent panel, or the pill when minimized
- panel header: the mark, `tune` (Notices menu) and minimize, which is its only window control

**Components:**
- **RippleCard:** Reading / Ambiguous / Pick / Applied / Logged
- **DiffGlyph**
- **MeasureChip**
- **KinChip:** On / Off / Has locked
- **TierMark:** Probably
- **NoticesMenu:** On / Quiet / Off
- **GlyphTile** gains InRipple (solid peach ring), Proposed (a ghost as content), Loading, Locked and Amber. **Draft is a dashed border only.**

**Tile rule:** at most one border and one corner badge per tile. Badge priority is Lock, then Amber, then Probably, then the Notice pip. The ghost counts as content, not as a mark.

| # | Screen | On screen | Interactions | Copy |
|---|---|---|---|---|
| R1 | **Draw** | Editor on *a*. The foot's end point is dragged into a curl, with peach nodes and handles and a 25% onion-skin. Pill Idle | None from the agent | none |
| R2 | **Noticed** | Workspace. Pip on *a*. Pill *Noticed · a*, with no thumbnail. Variant: *Noticed · a n o* | Click the pip or the pill. Ignoring is fine | "Noticed · *a*" |
| R3 | **What I see** | RippleCard Reading: 200px DiffGlyph (ghost, peach tail, ①), the measured chips, the caption and the confidence word | Hover a chip. **Ripple it** (primary), **Not quite** (ghost) | "Your *a* grew a curly tail off its foot." · "Pretty sure" |
| R4 | **Not quite** | Alternative chips. Point at it active, showing the user's circle | Pick an alternative, or circle a region | "Curly tail? Hook? Swash?" |
| R5 | **Pick** | *d u i l* ringed, with ghost tails; *i* still shimmering. *t h n* available, *m* locked. KinChips, Strength **Same**, specimen with ghosts, **Ripple 4** | Click to toggle. Strength redraws the ghosts. Hold Space. A locked tile asks inline | "4 letters" · "Include your *m*?" |
| R6 | **Drafts landed** | Wave mid-animation. *d u l* dashed, *l* amber. **Skipped 1**. Keep all / Revert all. Pill *Needs you · 3 to review*. Inset: the inspector on the *u* Draft with chips `Solid` and `Re-spaced +18` | Hover a tile for Keep / Revert. Expand Skipped | "Rippled 3 · ⌘Z undoes all 3" · "touches *t* in *lt*" |
| R7 | **Kept** | Tiles back to normal. The log line. An undo tooltip. The `tune` popover open | ⌘Z undoes Keep all. Change the notice mode | "*a* → *d u l* · kept 3" |
| R8 | **Edge board** | A small card per §3 row, plus busy-agent and merged-card | ≤1 action per card | as in §3 |

---

## 5. Host pipeline and native tools

**Rules for every tool:**
- Native, with no computer use. Optional arguments accept `null`.
- The agent writes **Drafts only**. Keep and Revert belong to the UI.

**Budget:** the UI flow is a host pipeline. Each card costs one model call with the edit facts attached, making one tool call (`save_edit_reading`). From chat ("put this tail on the caps too") it takes at most four calls, under the limit of 8.

| Host stage | Does | Built on |
|---|---|---|
| 1. Notice | Baseline, settle, contour and XOR diff, thresholds | New EditTracker (reads history only), raster XOR, `findIntersections` |
| 2. `label_parts` | Zones, parts and stroke role (entry or exit). Finds which parts exist in this font and their shape | New Latin Kernel part table, per-font detection |
| 3. Recipe & kin | `{op, part, stroke, zone, magnitude, shapelet}`, plus kin with owner, status and why-not | Static kinship table, `unicode_mappings` |
| 4. Transfer | Ink delta (added for `add`, removed for `cut`) becomes a shapelet in the part's frame, fitted to the target, seam extended so the union welds | `path` scale/flip, `combinePaths`; `cut` only if the boolean self-test passes |
| 5. `check_outlines` | Spacing rule, validity (winding, self-intersection, NaN), locality, zone caps, counters, pairs, legibility (vision only) | Bounds vs metrics, `checkForNaN`, `drawGlyph`, `TextBlock` |
| 6. Commit | Drafts under one history entry. Yours glyphs need a UI consent token, which the model cannot mint | `commitBatch` (generalizes `commit()`) |

| Model tool | Does |
|---|---|
| `get_glyph_edit(glyph)` | EditDelta facts, part labels, overlay / side-by-side / in-words PNGs (≤1024px) with regions |
| `save_edit_reading(glyph, caption, anatomy_word, region_ids, alternatives)` | Rejects any region not in the diff. The host sets the confidence |
| `plan_ripple(source, targets, strength)` | Dry run of stages 3–5 with live ghosts. Returns tier, checks and skips per target. Writes nothing |
| `commit_ripple(plan_id)` | Stage 6 |

**Protected area:** `commitBatch` extends `src/project_editor/history.js`. It needs the AGENTS.md approval gate and undo/redo regression tests.

---

## 6. Decisions

All other critique points are applied as written.

- **"Notice only when there's something to offer": partly.** A clear new shape always earns a reading, even without kin: naming the weird thing is the owner's core ask. The 1% em² threshold silences refinements.
- **"Joke only on the first reading": partly.** Playful for each *new kind* of edit, plain for repeats. One joke per session drains the fun the owner wants.
- **Kept looks normal:** tiles return to their pre-ripple mark; no green state.
- **Draft = dashed border only:** this changes the base GlyphTile, so FIGMA-SPEC's Draft dot goes too.
- **Slant:** v2, not "Oblique, no corrections". **VariationStrip** and **Sprinkle:** cut.
- **Rejected:** none.

---

## 7. Confirm with the owner

1. **Adopted defaults:** notices only when you leave the glyph, Wild only scales, a hand-edited Draft becomes Yours, and point drags ripple through the ink delta.
2. **Draft dot:** dropping it also changes the generation flow.
3. **Exit strokes only:** v1 has no "every foot" option, even for a deliberately weird ripple.

---

## 8. Update 2026-10-26: build on what now exists (read before starting M8)

Since this spec was written, PRs #84–#92 added most of the transfer engine Ripple needs. Reuse it;
do not build a second one.

| Ripple stage / tool | Use now | Notes |
|---|---|---|
| 4. Transfer (shapelet, weld, cut) | `copy_paths`, `boolean_paths` (union / subtract / intersect / exclude, paper.js), `transform_paths` pivots | `exclude` is the owner's graffiti look (cut on ink, solid outside). Replaces `combinePaths` for welds/cuts. |
| 5. `check_outlines` | The upgraded gate: real containment, hints, pre-existing issues = warnings, copied contours = new | Already used by `submit_glyph`. |
| 6. Commit | Glyph jobs: one undo step per glyph, Draft status, receipts with Keep / Retry / Undo | `commitBatch` (one undo for the whole ripple) is still new and protected (history.js). |
| Strength: Subtle / Same / Wild | The panel's mode chip: Exact ≈ Same, Remix ≈ Subtle-to-Wild with per-glyph variation, Wild + chaos | Decide whether Ripple keeps its own strength picker or reads the mode chip. Recommendation: read the mode chip. |
| Kin / anatomy | `describe_mark` (measures a mark against stems, counters, terminals), Remix `draw_cards` | Still need the Latin Kernel part/kinship table (stage 2–3). |
| Talking about it | Agent tab (built-in model) or Claude Code over MCP (`wait_for_user_message` / `reply_to_user`) | "Put this tail on the caps too" already works by hand through the agent. |
| Batch effects | Chaos tab (`apply_chaos`) and its legibility guard | Ripple's Wild can call Chaos ops. |

Still to build for M8: EditTracker + Notice (pip, pill, thresholds), `get_glyph_edit` diff overlay,
the "What I see" card, the part/kinship table, `plan_ripple` / `commit_ripple` on top of the tools
above, and `commitBatch` (protected).

**Status: parked (owner, 2026-10-26).** The owner is building and testing features by hand first.
Start M8 only when the owner triggers it — see `plans/RESUME-M8-M9.md`.
