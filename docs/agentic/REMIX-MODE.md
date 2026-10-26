# Remix mode

PR D of [plans/AGENT-TOOLS-PANEL-REMIX.md](plans/AGENT-TOOLS-PANEL-REMIX.md), from
[research/remix-mode.md](research/remix-mode.md). In **Remix** and **Wild** the agent carries the
attitude of the user's mark (a graffiti slash on A) across the target glyphs with a different move
on each one, through each glyph's own anatomy: it deals itself a few move cards, plays them, looks,
takes one back, and lands the glyph as a Draft with a seed. **Exact** stays the faithful copy it was.
The built-in model and Claude Code over MCP use the same tools and the same loop text.

## What the user sees

- **Mode chip:** Exact / Remix / Wild and the Chaos slider (PR B). In Remix and Wild a
  **Telephone** switch sits under Chaos: "Each glyph riffs on the last".
- **Receipts:** a glyph from a Remix take shows its seed ("seed 4821"). Its Retry becomes
  **Re-roll**: the agent does that glyph again with a new seed, starting from before its Draft, so
  takes never stack. Keep and Undo work as before (Undo goes back to the glyph before any Remix).
- The same seed gives the same cards and the same outlines, so a take can be reproduced.

Nothing else is new in the UI.

## The loop

Both agents get it: the built-in agent in its instructions (`server/agent/agent.js`
`modeInstructions`), a local agent in `get_context.remixLoop` (only in Remix and Wild). The text is
`REMIX_LOOP` in `src/agent/tool-definitions.js`.

1. **Read the reference:** `render_glyphs` / `read_glyphs` the glyph the user styled, then
   `describe_mark` the paths of the user's mark.
2. **Per target glyph, one at a time:** `draw_cards` (starts the glyph's job, deals 2–3 cards) →
   play each card (its `play` is a ready `apply_chaos` input; add `expectedRevision`), or
   re-express the card's idea by hand with `transform_paths` / `copy_paths` / `boolean_paths` →
   `render_glyphs` to look.
3. **Regret one:** `op_history` with `revert: true` takes back the last move; give the reason.
4. **Submit:** `submit_glyph` with a note (seed, kept moves). `TOO_SIMILAR` means the take repeats a
   sibling's change: `draw_cards` again with seed + 1.

## Tools

| Tool | What it does |
|---|---|
| `describe_mark {glyphId, pathIndices}` | Read-only. Measures the mark against the rest of its glyph on rasters: angle (principal axis, degrees counter-clockwise), length and width (units and em), where it sits on the letter (0–1), what its axis crosses end to end (`ink` = a stem or bar, `counter` = an enclosed hole, `outside`), overshoot at each end, and how it combines (`cut`, `solid`, `apart`), plus a one-line summary. The mark becomes the run's reference. On the owner's A: "51°, 0.77 em long and 0.13 em wide, crossing 3 strokes and 2 counters, overshooting by up to 0.06 em, it cuts through the ink and stays solid outside." |
| `draw_cards {glyphId, expectedRevision, seed?, count?}` | Remix and Wild only (`MODE_EXACT` otherwise). Begins (or restarts) the glyph job; a re-roll of this run's Remix Draft starts from the outline before that Draft (`startedFrom: 'before-draft'`). Deals `count` cards (null: 2, or 3 from chaos 67 and in Wild) with `tabu`, the `reference` summary and, with Telephone, `telephone {from, mutation}`. |
| `op_history {glyphId, revert?, reason?}` | Lists the job's moves (every draft edit), oldest first, with the card each one played; `revert: true` takes back the last move still standing. In a card take the only move left is kept (`LAST_MOVE`): the regret drops one of several. |
| `apply_chaos` (PR C) | Plays cards. Its `op` enum also has the six deck moves below. |
| `submit_glyph` | In Remix and Wild: novelty pressure (below), and for a card take the result carries `remix {seed, cards, kept, regret}` and a `nudge` when nothing was regretted. |

## The deck (`src/agent/remix/deck.js`)

Twelve cards, each a real op with seeded settings: **SLASH**, **DOUBLE-SLASH** (`slash-cut`),
**GASH** (through the biggest counter), **KICK** (a spike off a terminal), **ROTATE-PIECE**,
**SHIFT-STROKE**, **SCALE-PART**, **MIRROR-PART**, **GLITCH-BAND**, **WAVE**, **TWIST**, **BULGE**
(arc or bulge). The six new moves live in `src/agent/chaos/ops/moves.js` (`deck: true`, so the Chaos
tab does not list them):

| Op | Move |
|---|---|
| `piece-rotate` | Cut the letter in two along a seeded line near its ink centre and lean one piece over (a shear along the cut, up to ±35°): the cut edge stays put, so the piece stays joined and counters stay closed. |
| `piece-shift` | Same cut; slide one piece along it (up to 15% em). |
| `piece-scale` | Same cut; scale one piece ×0.65–1.35 about the cut point. |
| `piece-mirror` | Same cut; reflect one piece across the line perpendicular to the cut through the middle of its cut edge. |
| `kick` | A kite spike off the ink's extreme point in a seeded direction (feet first), welded on. |
| `gash` | A kite slash through the biggest counter (or the ink centre), cut with exclude. |

- **Seeds.** A take's seed (`draw_cards`) seeds the deal (`rngFor(seed, glyph, 'deck')`), each
  card's settings and each card's own engine seed, so the same seed, glyph, chaos, mark and run
  history give the same cards and outlines.
- **Tabu.** No card is dealt that one of the 3 glyphs before this one in the run was dealt. A short
  deck brings the oldest glyph's cards back first (`tabuRelaxed`).
- **Chaos dial.** Chaos (0–100) scales every setting's range and the number of cards; Wild widens it
  (`c × 1.3 + 0.15`).
- **Style DNA, lightly.** With a reference mark, SLASH / DOUBLE-SLASH / GASH start from its angle
  and KICK and the slashes from its width, mutated by chaos.
- **Telephone.** The hand is the previous glyph's kept cards with their settings, plus exactly one
  mutation: tweak one setting, swap one card for a fresh one (not tabu, not in hand) or add one. A
  hand of one always grows, so the regret still leaves a move to pass on.
- **Legibility guard.** Every card plays through `apply_chaos`, so the PR C guard is on; Wild +
  `breakRules: true` (when the user asks) turns its legibility rules off, never the outline gate. A
  card the guard turns down returns `GUARD_REJECTED` with "skip it and play the next one".

## Novelty pressure (`src/agent/remix/similarity.js`)

Different letters never match pixel for pixel, so the check compares what each take **changed**:
the 64 × 64 raster of the take XOR the raster at the take's start, framed by the glyph's bounds
(padded 25%, so overshoot counts). Similarity is the overlap of two change masks (intersection over
union). In Remix and Wild `submit_glyph` rejects a take at 0.6 or more against any other glyph the
run landed (`TOO_SIMILAR`, with `details.sibling` and `similarity`); the job stays open. Measured:
the same cut pasted on two letters 0.83, a lean vs a lean 0.44, different moves under 0.16. It also
catches a hand-made copy-paste (copy_paths of the same slash), not only card takes. Exact never
checks.

## The run (`src/agent/remix/remix-run.js`)

Memory only, per editor, never in the project file: the order glyphs drew cards in (for tabu), each
glyph's last deal, each landed take (seed, cards, kept moves, regret, change mask) and the reference
mark. New chat clears it. `remixSeedFor(editor, id)` is what the receipt shows.

## Tests

- `src/agent/remix/tests/remix-pure.test.js`: deck determinism, tabu over 3 glyphs, chaos scaling,
  Style DNA, Telephone's one mutation, change masks, `describe_mark` on a fixture slash.
- `src/agent/tests/remix-tools.test.js`: `draw_cards` (seeds reproduce, tabu, re-roll from before
  the Draft, Undo back to the original), `op_history` revert and `LAST_MOVE`, the submit report,
  `TOO_SIMILAR`, Telephone, `describe_mark`, the loop in `get_context`, Exact unchanged.
- `src/agent/tests/remix-weak-model.test.js`: a scripted free model following the loop literally
  through the built-in controller and the real tools.
- `src/agent/chaos/tests/chaos-engine.test.js`: the six moves are deterministic, valid and pass the
  gate. `panel-controls.test.js` and `agent-cards.test.js`: the Telephone switch, seeds and Re-roll.
- `server/agent/relay.checks.js`: the loop and Telephone reach the built-in instructions; Exact never.

Later (not in v1): Breed, Drop, Weld, Pixel Life and Grid snap as cards, "Surprise me", locking a
glyph's seed, a regret of a move other than the last one.
