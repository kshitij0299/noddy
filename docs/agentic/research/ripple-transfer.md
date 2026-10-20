# Noddy: how to detect, describe and transfer a hand edit to a glyph

## Short version
For v1, use geometry to work out what changed and a vision-language model (VLM) to name it. VLMs alone are unreliable at fine geometry. GPT-4o and Gemini fail simple line and circle tests ([BlindTest](https://arxiv.org/html/2407.06581v4)). Zero-shot models score only about 17–22 CIDEr on Spot-the-Diff change captioning ([arXiv 2609.01136](https://arxiv.org/pdf/2609.01136)). Transfer works best when the edit is cut out as a reusable "shapelet" and snapped onto matching parts of other glyphs. Glyphs' corner and cap components already prove this approach ([cap](https://handbook.glyphsapp.com/components/cap/), [corner](https://glyphsapp.com/learn/reusing-shapes-corner-components)). Having an LLM redraw the glyph should be the last resort. Instruction-based SVG editing still breaks mostly on `<path>` numbers ([SVGEditBench V2](https://arxiv.org/pdf/2502.19453)).

Noddy already has the building blocks it needs:
- Boolean operations (unite, divide, subtract, exclude, intersect) in `/Users/kshitij/Documents/cursor shit/font agent/Glyphr-Studio-2/src/panels/actions.js`.
- Segment intersection (`findSegmentIntersections`) in `/Users/kshitij/Documents/cursor shit/font agent/Glyphr-Studio-2/src/project_data/poly_segment.js`.

---

## 1. Recommended pipeline

### Stage 0: Snapshot
- **Before** is the last committed state of the glyph. **After** is the state when the user finishes, for example when they leave the glyph or stop editing for about 1.5 s.
- Run everything below in the background. Geometry takes milliseconds; the VLM runs only after the edit settles.

### Stage 1: Detect (pure geometry, works today)
1. **Factor out global moves first.** Fit a similarity transform from Before to After. If what's left after that fit is close to zero, the user only moved, scaled or slanted the whole glyph. Report it that way, not as a "new tail".
2. **Find changed area.** Take the XOR of the filled shapes (Glyphr's *exclude*). Each connected piece is a changed region with an area, a bounding box and a sign (ink added or removed). Throw away slivers under a set area (around 0.1–0.3% of em², to be tuned) so accidental nudges don't count.
3. **Match contours.** Pair Before and After contours by centroid, area and winding, using Hungarian assignment. Contours with no partner are adds or deletes, such as a new dot or a filled counter, which means the topology changed.
4. **Find changed spans.** Resample each matched contour by arc length. For each sample, measure the distance to the other contour (one-sided Hausdorff). Runs above about 3 units at 1000 UPM are the *edited spans*. Use discrete Fréchet distance when order matters, for example to catch a twist or loop. Also record node-level changes: nodes added or removed, and handles that changed.
5. **Measure features.** Record changes in area, stem width (horizontal run at half the x-height), contour and hole counts, curvature extrema, overshoot, and width or sidebearings.
6. **Tie each change to a part.** Label each region with an anatomy part using a per-glyph part template. For the GF Latin Kernel letters and figures, this is a rule table built from vertical zones (baseline, x-height, ascender, descender) plus a medial-axis or stroke split. [StrokeStyles](https://research.gold.ac.uk/id/eprint/31944) shows that stroke and junction segmentation of glyph outlines works without training data. If no part matches, fall back to a zone description such as "bottom-right, at the baseline, on the stem".

**Output:** an `EditDelta` JSON listing regions, spans, part labels and metric changes. This is the ground truth that every later stage relies on.

### Stage 2: Describe (VLM, guided by Stage 1)
- **Render three images at about 512 px:** Before, After, and an overlay showing the Before ghost, the After shape and numbered XOR regions. Numbering the regions follows [Set-of-Mark prompting](https://arxiv.org/pdf/2310.11441), which improves a model's ability to point at specific areas.
- **Prompt** with the images, the `EditDelta` facts and a fixed vocabulary:
  - *Verbs:* added, removed, extended, shortened, curled, hooked, thickened, thinned, sharpened, rounded, notched, slanted, wobbled, swapped, melted.
  - *Parts:* stem, bowl, counter, arch or shoulder, terminal, serif, spur, foot, tail, ear, crossbar, descender, dot, apex.
- **Require two outputs:**
  - A structured **recipe**: `{op, part, side, zone, magnitude, region_ids}`.
  - A one-line **fun caption**, for example "Your *a* grew a pig tail on its foot."
- **Validation:** reject any answer that names a region ID not in the diff, or a part the labeler didn't find. If it fails twice, fall back to a template caption built from the recipe.

### Stage 3: Find targets
- **Kinship prior.** Use a hand-written table of which glyphs share which parts. Some examples:
  - foot at the baseline: a d i l m n u t
  - arch: n h m r
  - bowl: o b d p q a g e c
  - descender tail: g j p q y
  - terminals: a c e f j r s t y
  - figures in their own group
  
  Type-design practice backs the main lines of derivation: n leads to m, h, u, r and o leads to c, e, d, b, p, q ([FLOSS FontForge](https://archive.flossmanuals.net/fontforge/completing-the-lower-case)). Those same sources warn that parts can't simply be pasted from one letter to another.
- **Confirm the part exists in this font.** Run the part labeler on each candidate. A single-storey *a* has no top terminal, and a *g* may be single- or double-storey.
- **Score** each candidate as kinship prior × part-match quality × local shape similarity (curvature profile around the attachment point). Glyphs marked **Yours** are excluded unless the user opts in per glyph.

### Stage 4: Transfer (strategies in order of preference)
1. **Shapelet reuse, the cap/corner component model. Ship this in v1.**
   - Cut the edited span out as an open path between its two attachment nodes.
   - Store it in a local frame: origin at the attachment, x along the stroke tangent, scaled by stem width.
   - Re-attach it to the matching node or node pair on the target, as Glyphs caps do with `node1`/`node2` anchors and **Fit** to stroke width ([handbook](https://handbook.glyphsapp.com/components/cap/)).
   - Slant its outer segment to match the host angle, as Glyphs corner components do ([tutorial](https://glyphsapp.com/learn/reusing-shapes-corner-components)).
   - Plain percentage scaling distorts curves (Glyphs fixes this with intermediate layers). Scale only along the stem-width axis and leave curvature radii alone where you can.
   
   This is the best fit for terminals, serifs, spurs, feet, ink traps, notches and tails. FontLab's linked [Element References](https://help.fontlab.com/fontlab/7/manual/Elements/) are the same idea in another editor.
2. **Anchor-relative segment transplant. v1 for span replacements.**
   - Cut the target contour at the corresponding points.
   - Map the source span with an affine transform set by its endpoints, the stem-width ratio and the vertical-metric ratio (x-height or ascender).
   - Splice it in and repair G1 continuity by aligning handle directions.
   
   Use this for a squarer bowl, a flatter arch, or a longer descender.
3. **Parametric re-application. v1 for global-style edits.**
   - If the recipe is really a parameter change (stems +12%, corners rounded at radius r, slant, contrast, aperture, overshoot, wobble with a seed), apply it to each target as a fixed operation: offset, corner rounding, shear or noise.
   - Prototypo and Metafont-style systems are parametric throughout and split skeletons from expressive serifs ([TypeDrawers interview](https://typedrawers.com/discussion/comment/18832), [Metapolator](https://github.com/metapolator/metapolator)). Noddy is outline-based, so only parameters you can measure from outlines are reliable.
4. **LLM redraw. Last resort, always labeled as such.**
   - Send the target path, the source Before/After and the recipe, and ask for a new path.
   - Even models trained for this work have limits. [VecGlypher](https://arxiv.org/html/2602.21461) (CVPR 2026) beats GPT-5 and Claude Sonnet 4.5 at glyph generation. But it needs roughly 30B parameters to be stable, handles only 0–9, a–z, A–Z, and was never tested on *editing* a glyph.
   - General LLMs often produce invalid or unclosed SVG ([same paper](https://arxiv.org/html/2602.21461)).
   - Use raster comparison to accept or reject the result. A [diffvg](https://people.csail.mit.edu/tzumao/diffvg)-style optimization pass is optional later.

**Research only, not shippable as-is:**
- *Whole-font propagation:* [Campbell & Kautz's font manifold](https://discovery.ucl.ac.uk/id/eprint/1470588/) shows that editing one glyph can update the others. [Balashova et al.](https://diglib.eg.org/handle/10.1111/cgf13540) fit fonts to stroke templates and can add or remove stylistic elements across a font. [FlexyFont](https://diglib.eg.org/items/21ed60b7-23de-499c-8e1e-ac6e112d6242/full) builds glyphs from parts. All of these need dataset-wide correspondence and trained models.
- *Few-shot generators:* [DeepVecFont-v2](https://arxiv.org/pdf/2303.14585), [DualVector](https://arxiv.org/abs/2305.10462v1), [VecFontSDF](https://arxiv.org/pdf/2303.12675) and [XMP-Font](https://arxiv.org/pdf/2204.05084). They regenerate whole glyphs from style references; none applies a local edit. DeepVecFont-v2 struggles on long or complex paths, and VecFusion reports subtle path distortions from it.
- *Raster CJK component methods:* [Diff-Font](https://paperswithcode.com/paper/diff-font-diffusion-model-for-robust-one-shot), [LF-Font](https://arxiv.org/pdf/2009.11042) and MX-Font output images, not editable outlines.

### Stage 5: Render and check, then save as a Draft
- **Validity:** contours closed, no self-intersections (use `findSegmentIntersections`), correct winding, sensible node count, stays within ascender and descender.
- **Locality:** XOR between the target's Before and After outside the transplant area should be about zero.
- **Fidelity:** Hausdorff distance between the transplanted span and the normalized source shapelet.
- **Legibility:** a small-size render plus VLM OCR ("which character is this?"). VecGlypher uses this same OCR-style check as a metric.
- **Collisions:** counters stay open (the eye of *e*, the bowl of *a*) and nothing overlaps neighboring parts.

Results that pass are saved as a **Draft** with a confidence tier. Failures are dropped, and the user sees which glyphs were skipped and why.

---

## 2. What transfers well and what doesn't

| Edit type | Transfer quality | Why |
|---|---|---|
| Terminal, serif, spur, foot or ink-trap shape at a stroke end or corner | **Good** | Attaches at clear nodes; the cap/corner model is proven in shipping tools |
| Overall weight, slant, corner rounding, contrast | **Good** | A parameter change, applied the same way everywhere |
| Procedural "wobble" or roughen | **Good** (fun) | Reapply as a seeded filter, not by copying points |
| Arch or shoulder change (n → h, m, r) | **Medium** | *m* has two arches and *r* half of one, so attachment is ambiguous |
| Bowl shape (o → b, d, p, q, c, e) | **Medium** | The stem join and the *c*/*e* openings change the topology |
| Descender tail (g, j, p, q, y) | **Medium** | Direction and room differ from glyph to glyph |
| Topology changes (added hole, split contour, merged parts) | **Poor** | No part to attach to; needs a redraw |
| Whole-glyph distortion ("melted", a face drawn on the *o*) | **Poor / joke only** | Specific to one glyph; offer a "do something similar" redraw labeled *Wild* |
| Lowercase → caps or figures; to another font with a different structure (single vs double storey) | **Poor to medium** | Run part detection again; confidence capped at *Probably* |

**Confidence signals to show users.** Show one tier per glyph, with signal chips you can expand:
- **Part found** (yes / no / fallback zone)
- **Scale fit** (ratio of target to source stem width, flagged outside 0.7–1.4)
- **Clean geometry** (validity checks pass)
- **Still reads as the letter** (OCR result)
- **Method badge:** "Snapped on" (shapelet), "Spliced", "Dialed" (parametric) or "AI-redrawn"

Tiers, with plain wording:
- **Solid:** shapelet or parametric method, every check passes
- **Probably:** a transplant, or a single soft warning
- **Wild guess:** an LLM redraw, or a fallback zone was used

Only **Solid** glyphs are checked by default.

**Other fonts and projects.** Save the recipe and shapelet in normalized local frames (stem-width units, metric-relative) so they work in any project. Applying one to another font runs Stages 3–5 again. Transfer is good when the part structure matches and weak otherwise.

---

## 3. Failure modes and how the UX should show them

| Failure | Detection | UX |
|---|---|---|
| Accidental nudge read as an edit | Sliver filter; global-transform factoring | Stay quiet below the threshold; "Just moved it?" chip for global transforms |
| Wrong or hallucinated description | Region-ID and part validation | The caption names parts with chips that highlight the numbered region on hover. A **"Not quite"** button opens a part picker, and the correction rewrites the recipe |
| Part missing on a target | Part labeler | Shown in a collapsed "Skipped (no foot on *o*)" list, never forced |
| Scale mismatch (hairline vs. heavy stem) | Scale-fit ratio | Amber chip; a per-glyph size slider in the Draft |
| Counter closes or parts collide | Collision check | Red outline on the Draft thumbnail; the glyph starts unchecked |
| Glyph no longer reads as its letter | OCR mismatch | "Your *r* now reads like a *v*." Allowed, since the app is meant to be fun, but flagged |
| Broken geometry | Validity check | Rejected automatically; the user never sees it |
| Over-application | Batch scoring | Preview grid with per-glyph toggles and a "Try 3 first" option |
| **Yours** glyphs | Ownership flag | Shown with a lock; opt in per glyph, never in bulk |
| LLM redraw drifts elsewhere | Locality XOR | Diff overlay on the Draft; *Wild* badge |
| Undo confusion | — | The whole batch is one entry in the shared undo history, with per-glyph Discard inside the Draft. Nothing changes the font until the user Keeps it |
| Latency or cost | — | The geometry caption appears instantly ("Changed: foot of stem"), and the playful VLM caption fades in afterwards |

**Overall:** geometric diff, part labels and shapelet transfer can be built today with Glyphr's existing tools plus a hand-written part and kinship table. A VLM adds naming and the fun caption on top. Learned whole-font propagation is still research.