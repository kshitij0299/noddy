# Remix / Wild mode: research (2026-10-24)

The owner wants an agent that is "cracked, a bit stupid, creative, vibe-driven" (rotate things,
try, look, keep what works) behind a mode toggle, instead of copy-pasting the same mark onto every
glyph. First live run (Claude over MCP) copied the owner's graffiti slash from A onto B–F exactly;
it looked good but that is "Exact" mode.

Two passes: a conventional op list (Sonnet, from memory, URLs unverified) and a divergent pass
(Opus, web-checked).

## Shortlist (Opus, ranked by wow × fits a font editor × buildable)

| # | Idea | What the user sees | How | Effort | New tools |
|---|---|---|---|---|---|
| 1 | **Breed** | 4 wild A's; tap one, get 4 children of it | seeded op lists from parent genes + mutation; lineage stored ([Picbreeder](https://arxiv.org/pdf/1704.05143)) | M | `spawn_variants`, `pick_variant`, `lineage` |
| 2 | **Style DNA** | the slash becomes a gash through O's counter, a kick off L's foot: same attitude, never the same shape | measure the mark relative to glyph anatomy, re-express on each glyph's stems/terminals with mutation ([Alphabet Synthesis Machine](https://en.wikipedia.org/wiki/Alphabet_Synthesis_Machine)) | M | `measure_mark`, `glyph_anatomy` |
| 3 | **Card deck + tabu + regret** | agent narrates "drew ROTATE-ONE-PIECE, MIRROR-SERIF… regret the mirror" | seeded 2–3 cards per glyph, no card reused within 3 glyphs, must undo one move after looking | S | `draw_cards`, `op_history` |
| 4 | **Drop** | A shatters on its cut, pieces tumble and pile on the baseline | pieces → matter.js bodies, simulate, freeze, write transforms back ([tutorial](https://dev.to/thormeier/throwing-around-text-kinetic-typography-part-2-it-defies-gravity-itself-thanks-to-matterjs-239e)) | M | `physics_settle` |
| 5 | **Pixel Life** | DotGothic16's dots breed and die; mould and bridges grow | Game of Life on the font's own dot grid, stems protected ([Matveev](https://worldbranddesign.com/?p=396758)) | S | `cellular_step` |
| 6 | **Telephone** | A→Z reads like a story: the slash slowly becomes a lightning bolt | each glyph = previous glyph's op log + one mutation; reject near-duplicates | S | `apply_op_log`, `image_similarity` |
| 7 | **Weld** | the slash melts into the A like hot plastic | SDF smooth-min blend, traced back to Béziers ([Quilez smin](https://iquilezles.org/articles/smin/)) | M | `sdf_blend` |
| 8 | **Grid snap** | letters look like a 1967 machine dreamed them | snap to a per-glyph rotated 5×7 lattice, 45° steps ([Crouwel](https://en.wikipedia.org/wiki/New_Alphabet)) | S | `snap_to_lattice` |

Shared rail: `legibility_check` (counter areas, stem intact, "does this read as X?" from the
render) reverts failed moves. A "break rules" toggle turns it off.

## More raw ideas (Opus)

Misread ("this A is an upside-down V, fix it"), Squint (render at 12 px, redraw what it saw),
Wrong hand (whole-contour moves only), Mood ring (a word sets op ranges), Lineage tree, Novelty
pressure (render too close to siblings → reject), Tape strips, Melting wax, Magnets, Explosion,
Cloth, Wildstyle arrows at terminals, Throw-up bubble, Ransom note, Dada cut-and-reglue,
Swiss-punk crop, Audio-driven cut angles, Datamosh (swap point indices between glyphs),
Shader bake, Latent blend. Warning: AI "telephone" drifts toward ~12 clichés
([study](https://www.diyphotography.net/study-ai-image-generators-shrink-creativity-to-just-12-default-styles/)),
so novelty pressure matters.

## Conventional op library (Sonnet; URLs from memory, verify before use)

Build first: slash cut (boolean with a rotated quad), glitch bands, noise displacement,
drips (capsule + union), warp envelopes (arc/bulge/wave/twist). Then Voronoi shatter,
offset/inline, stipple, flow-field hatching, long shadow, stencil bridges, rough.js-style sketch.

Geometry libraries (permissive): paper.js (MIT; booleans, flatten, simplify/refit),
polygon-clipping (MIT, small), Clipper2 (Boost; offsets, Minkowski), simplex-noise (MIT),
d3-delaunay (ISC; Voronoi), fit-curve / bezier-js (MIT). Avoid potrace-js (GPL is fine for Noddy
legally but prefer permissive).

Seed and chaos: every op uses `rng = mulberry32(hash(seed, glyph, op))` so results reproduce and a
single glyph can be re-rolled; one `chaos` 0–1 scales every op's ranges (e.g. slash count
1 + round(chaos·3), noise amp chaos·0.04 em, band shift chaos·0.15 em). On a failed check: seed+1
up to 3 times, then lower chaos.

## How the toggle should feel

1. Exact / Remix / Wild. Remix stays inside the user's gene ranges; Wild widens them and allows
   misreads.
2. One chaos dial (0–100) scales mutation ranges and cards drawn.
3. Each glyph shows its seed: click to re-roll that glyph, long-press to lock it.
4. "Surprise me" re-rolls every unlocked glyph and picks a strategy not used yet.
5. Legibility guard on by default, with a small "break rules" toggle.

## Prerequisite

The tools fix (SMOKE-TEST-BUGS.md): transform and copy contours, booleans, clear gate errors, a
gate that allows the user's intended overlaps, optional fields truly optional.
