# Chaos tools

The agent panel's second tab (PR C, owner decision 2026-10-24 in
[plans/AGENT-TOOLS-PANEL-REMIX.md](plans/AGENT-TOOLS-PANEL-REMIX.md)). Algorithmic effects that run
directly, with no AI: pick a tool, set its knobs, look at the preview, Apply. Every result lands as a
Draft with one undo step per glyph. The built-in agent and Claude Code (over MCP) call the same engine
through the `apply_chaos` tool, so Remix mode (PR D) and the tab share one engine.

## Using it

1. Open the panel's **Chaos** tab. Pick a tool from the row at the top (arrow keys move and choose).
2. Set the target with the **Target** chip in the footer: this glyph, the selected glyphs (Cmd/Ctrl-click
   them in the grid) or the whole set. The preview strip shows up to 8 target glyphs.
3. Turn the knobs. **Chaos** (0–100) scales every random range of the tool. **Seed** makes a take
   reproducible: the same seed, chaos and settings give the same outlines. **Re-roll** deals a new seed.
4. **Apply**. Each glyph lands as a Draft ("Chaos · A" in the undo history). The result list offers
   **Keep**, **Re-roll** (a new seed for that glyph, starting again from before its chaos Draft) and
   **Undo** per glyph, plus Keep all and Undo all. Applying again to a glyph the tab drafted starts from
   before that Draft, so takes never stack.

This glyph and Selected glyphs are your explicit choice, so they include the glyph open in the editor
and glyphs that are Yours. The whole set skips Yours and open glyphs.

## The five tools

| Tool | What it does | Params (defaults) |
|---|---|---|
| **Slash cut** (`slash-cut`) | 1–N sharp kite-shaped slashes, cut with **exclude**: where a slash overlaps the ink it cuts, outside the letter it stays solid (the owner's graffiti A). The first slash goes through the ink's centroid, more slashes through the stems, each with seeded jitter; each one is long enough to cross the letter at its angle, plus the overshoot. | count 1 (1–4), angle 35° (−80…80), width 7% em (2–20), overshoot 20% (0–80) |
| **Glitch bands** (`glitch-bands`) | Slices the letter into horizontal bands (edges jittered) and shifts some bands sideways by a seeded offset, then merges them. | bands 5 (2–12), max shift 8% em (1–30) |
| **Warp** (`warp`) | Arc, bulge, wave or twist envelope. Every segment is split into cubic pieces and each handle moves with the warp's local stretch (Jacobian), so curves stay smooth; folds are untangled with the nonzero fill. | warp wave (arc / bulge / wave / twist), strength 40% (−100…100) |
| **Grid snap** (`grid-snap`) | Snaps every on-curve point to the nearest node of a seeded lattice over the letter (rotated by multiples of the angle step), curves become straight, outlines that fold back are split at the repeated node and zero-area pieces dropped. | cols 7 (3–12), rows 9 (3–16), angle step 0° (0–45) |
| **Pixel Life** (`pixel-life`) | For dot and pixel fonts only. Finds the font's own cell grid from its outlines, rasterises the letter onto it, runs Game-of-Life-style generations (each cell follows the rule with a chance set by chaos) with stems protected, and rebuilds square contours. On a drawn font it is off, with a note saying so. | generations 2 (1–6), rule mould (mould B3/S1–8, life B3/S23, coral B3/S4–8, erode B/S2–8), protect stems on |

## The legibility guard

Every take goes through `src/agent/chaos/guard.js`:

1. **Legibility** (on by default): no counter may close up or break open (counted on a 64×64 raster),
   ink area must stay within ×0.5–1.8 of the original, each third of the letter (3×3 over its bounds)
   must keep at least 30% of its ink (a lost bar or stem), ink overlap (IoU) at least 0.35, bounds within
   ×0.65–1.7 per side, centre shift at most 0.22 em. An op can loosen a limit (`guard` on the op: Grid
   snap allows overlap 0.3, Pixel Life ink ×2).
2. **The outline gate** (always on): the result must pass `check_outlines` the way `submit_glyph` does
   (new TOO_FEW_POINTS, DUPLICATE_POINTS, SELF_INTERSECTION, SPECK or WINDING_SAME_AS_CONTAINER
   reject). Legibility runs first because it is cheap.

A rejected take is re-rolled: seed+1 up to 3 times, then the first seed at 60% and 30% of the chaos.
The result reports the seed and chaos that landed (feeding them back reproduces it in one take). If no
take passes, the glyph fails with the last reason ("try a lower chaos").

**Break rules** (a switch that only shows in Wild mode; `breakRules: true` in `apply_chaos`, honoured
only in Wild) turns the legibility rules off. The outline gate never turns off: a broken outline would
not land anyway.

## Agent access: `apply_chaos`

`apply_chaos { glyphIds (1–8), expectedRevision, op, seed?, chaos?, params?, breakRules?, base? }`
(`src/agent/tool-definitions.js`, executed in `native-tools.js`). For each glyph it begins the glyph
job if none is open (same locks as `begin_glyph`), runs the engine on the job's draft (or the font's
glyph, or with `base: 'before-draft'` the outline before its current Draft), and replaces the draft's
outlines. It returns per glyph `{ok, seed, chaos, rerolled, attempts, job}` or an error. The agent then
looks with `render_glyphs` and lands each glyph with `submit_glyph`. Absent `chaos` uses the panel's
chaos; absent `seed` deals one. MCP clients see it in `tools/list` like every other tool.

## Code map

| File | Role |
|---|---|
| `src/agent/chaos/engine.js` | Op registry (`CHAOS_OPS`), param resolution, `runChaos` (seeded attempts, guard, re-roll plan) |
| `src/agent/chaos/ops/*.js` | One file per op |
| `src/agent/chaos/rng.js` | FNV-1a hash + mulberry32 per (seed, glyph, op) |
| `src/agent/chaos/geometry.js` | Contours ↔ Glyphr shapes, flatten, area, nonzero raster, orientation by depth, cleanup |
| `src/agent/chaos/guard.js` | The guard above |
| `src/agent/chaos/pixel-grid.js` | Cell-grid detection and square-contour tracing (Pixel Life) |
| `src/agent/chaos/project-bridge.js` | A project's glyphs as contours, the font's cell grid |
| `src/agent/path-boolean.js` | `booleanPointContours`: paper.js booleans, loaded lazily on first use |
| `src/agent/ui/chaos/chaos-runner.js` | Preview (engine only) and Apply (`apply_chaos` + `submit_glyph` in one session) |
| `src/agent/ui/chaos/chaos-tab.js`, `chaos-tab.css` | The tab: tool row, the tool's block, results, footer |

Tests: `src/agent/chaos/tests/chaos-engine.test.js` (ops, guard, grid), `src/agent/tests/chaos-tools.test.js`
(`apply_chaos`, Apply, preview), `src/agent/tests/chaos-tab.test.js` (the tab UI).

## Adding a tool

1. Write `src/agent/chaos/ops/<id>.js` exporting
   `{ id, label, icon, hint, params: [{ key, label, type: 'int'|'number'|'enum'|'boolean', min, max, step, unit, options, default }], run }`.
   `run(contours, { rng, chaos (0–1), params, box, metrics, grid, boolean })` returns contours. Draw every
   random number from `rng` (never `Math.random`) so seeds reproduce; let `chaos` scale the ranges; use
   `boolean(operation, subject, clip)` for unions and cuts. Optional: `guard` (limit overrides),
   `needsGrid` and `unavailable({ grid })` (a note when the op cannot run on this font).
2. Add it to `CHAOS_OPS` in `engine.js` and its id to `CHAOS_OP_NAMES` in `tool-definitions.js` (a test
   keeps them equal). New param keys go into `chaosParams` there (nullable, widest range).
3. Mention it in the `apply_chaos` description and this file. The tab picks it up automatically (icon
   from Material Symbols Rounded, outlined).
4. Add it to the `describe.each` table in `chaos-engine.test.js`: deterministic, valid, gate passes.

No new dependencies without a reason: paper.js is already there (lazy). Anything new must be permissive,
pinned exactly, at least two weeks old and lazy-loaded.
