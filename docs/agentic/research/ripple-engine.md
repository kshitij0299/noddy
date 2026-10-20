# Engine feasibility: "What did you do to my a?"

Paths are relative to `noddy-agent-plan/src/`. I only read files.

## 1. Capturing BEFORE and AFTER

**What exists**
- Manual tools change the live glyph in place. `history.addState` runs after the change and stores a post-change copy, `new Glyph(item.save())` (`project_editor/history.js:39-47, 330-357`). `queue[0]` is the current state, so the BEFORE of the last gesture is `queue[1]` when it has the same `itemID`.
- `history.initialProject` is the **live project object**, not a copy (`project_editor/project_editor.js:193-198`). Undo reads it (`history.js:179`), and `agent/native-tools.js:198` already works around it. Don't use it as a baseline.
- Navigation sometimes writes a "Navigated to X" snapshot of the newly opened glyph (`pages/overview.js:50`, `project_editor/navigator.js:262`, conditionally at `:362-368`, `panels/card_glyph.js:185/203`, `edit_canvas/events_keyboard.js:183/193`). It is useful, but not guaranteed.
- Inspector edits write **no history** (`panels/cards.js:164-219`; the INSPECTOR-UNDO fix is still pending).
- There are no revisions. Autosave keeps one localStorage slot per project (`app/app.js:293-310`). `hasChangedThisSession` (`project_data/glyph_element.js:37`) is also set by agent commits (`native-tools.js:213`), so it can't tell the user's edits from the agent's.

**Proposed `EditTracker` (host module)**
- **Baseline:** `baseline[id] = glyph.save()` plus the history head. Take it on `whichGlyphIsSelected` (`project_editor.js:480`, subscribed at `pages/characters.js:110-121`), or when the new editor opens.
- **Dirty mark:** one hook at the publish choke point where `glyphChanged` already runs (`project_editor/pub_sub.js:128-150`). Fall back to a JSON fingerprint, because some handlers skip `publish` (`native-tools.js:49-50`).
- **Settle points** that can fire a manual-edit-finished event:
  - End of a gesture:
    - `tools/path_edit.js:376-379`
    - `tools/resize.js:307`
    - `tools/new_basic_path.js:133`
    - the pen's mouseup at `tools/new_path.js:146-150`
  - Pen path done:
    - closing by clicking the first point (`new_path.js:70-87`)
    - the "Done creating path" button (`:185-203`)
    - switching tools (`tools/tools.js:302`)
  - Inspector change (`cards.js:164`).
  - Glyph switch or editor Close.
  - About 2 s idle, with no tool `.dragging` and `tool_addPath.newPath === false`.
- Compute the diff cheaply on settle. **Call the model only on Close or on a "What did I do?" press.**
- **Rebase the baseline** after an agent commit (`native-tools.js:212`) and after undo or redo (`history.js:247/308`), because those replace the glyph object.

## 2. Geometry available for diffing

| Available | Where |
|---|---|
| Points, handles, `use` flags, type (corner/flat/symmetric) | `project_data/path_point.js:53-63, 242, 483, 538` |
| Segments: cubic, line vs curve, length, point at t, t from a point | `project_data/segment.js:132, 140, 201, 406, 466` |
| Bounds per path and per glyph; overlap test | `project_data/path.js:266, 1353`; `project_data/glyph.js:942-981`; `project_data/maxes.js:265, 288` |
| Winding | `path.js:962`. Paths with more than 2 points use **on-curve points only**, so it is approximate (`:1036-1043`) |
| Self-intersections; segment-vs-segment hits | `PolySegment.findIntersections` `project_data/poly_segment.js:222`; `findSegmentIntersections` `:566` |
| Closest point on the outline | `path.js:1287` (brute force) |
| Vector booleans (unite, subtract, intersect, exclude) | `project_editor/boolean_combine.js:11` (only the first loop of each path, `:59`) |
| Raster hit-test precedent | `isShapeHere` `edit_canvas/tools/tools.js:443-490` |
| Signed area | Private and on-curve only (`project_data/poly_segment_offset.js:89`) |

**What's missing**
- **Point correspondence.** Identity is by index only, and `pointID` is random and never saved (`path.js:906-911`). Inserts, deletes and merges shift indices (`path.js:1203, 1271-1275`; `project_editor/multiselect.js:246`). New code needs an ordered nearest-neighbour alignment of points.
- **Path matching.** The pen appends new paths at the end (`glyph.js:446`), so match by index and then check with bounds IoU.
- **Part segmentation** (stem, bowl, terminal, spur), a **skeleton or medial axis**, and **stem measurement**. None of these exist. Stems are only metadata.

## 3. Rendering before and after for a vision model

- `drawGlyph(glyph, ctx, view, alpha, fill)` works on any 2D context when you pass `view={dx,dy,dz}` (`display_canvas/draw_paths.js:22-59`; the converters take a view, `edit_canvas/edit_canvas.js:538-577`). Caveats:
  - Its default `view` has the wrong shape (`{x,y,z}`), so always pass one.
  - It deletes component instances whose link is broken (`:39-45`). That is harmless on a detached copy.
  - `drawGlyphOutlineMode` reads the editor's selection (`:74`). Use `drawShape` (`:105`) to draw outlines.
- No helper uses OffscreenCanvas, `toDataURL` or `convertToBlob` yet. For chat cards, SVG is enough: `glyph.svgPathData` (`glyph.js:899`) plus the `makeItemThumbnail` transform (`project_data/glyphr_studio_project.js:542`).
- **Highlight recipe:**
  1. Render BEFORE and AFTER masks with the same view.
  2. Compare them pixel by pixel to get added and removed ink.
  3. Tint them: added in peach, removed with a red hatch.
  4. Take the bounding box and convert it to font units with `cXsX` and `cYsY`.
  5. Label the zone against `settings.font` (baseline, x-height, descender) and against the glyph's own box ("bottom-right, below the baseline").
- **In the editor:** draw a 25% onion-skin of the BEFORE inside `redrawGlyphEdit` (`edit_canvas.js:190-270`). Ring moved points with `drawPointHighlight` (`edit_canvas/draw_edit_affordances.js:862`).
- **Plumbing gaps:**
  - Tool outputs are JSON only (`agent/agent-controller.js:217-222`). Images reach the model only as parts of the user message (`agent/attachments.js:190-196`).
  - `execute` is synchronous (`native-tools.js:92`), but the controller already awaits it (`agent-controller.js:203`), so an async render is fine.

## 4. Proposed native tools

Schema note: every property is required (`agent/tool-definitions.js:6-11`), so "optional" arguments must accept `null`.

| Tool | Args → returns | Engine |
|---|---|---|
| `get_glyph_edit` | `{glyphId, since:"open"\|"last_gesture"\|"checkpoint"}` → metric deltas (advance width, side bearings, bounds); `paths[{index, status: added/removed/changed, pointsMoved[{i,dx,dy}], pointsAdded/Removed, typeChanges, windingFlip, boundsDelta}]`; `ink{addedArea, removedArea, regions[{bbox, zone}]}`; `flags[new_contour, below_baseline, new_overlap, self_intersection, hole_filled…]`; before/after SVG | EditTracker baseline; §2 functions; raster XOR. Read-only. |
| `render_compare` | `{glyphIds≤6, before, mode:"overlay"\|"side_by_side"\|"in_text", text\|null, highlight}` → PNG of at most 1024px, plus a legend | `drawGlyph`, `TextBlock` (`display_canvas/text_block.js:15`; needs injected draw callbacks), canvas. Read-only. |
| `find_related_glyphs` | `{glyphId, part:enum\|null, region:bbox\|null}` → ranked `[{glyphId, char, reason, anchor, owner, status, eligible, whyNot}]` | A new static anatomy table for Latin Kernel (stem-foot: a d u; descender: g j p q y; bowl: b d o p q; …). Case and diacritic maps `lib/unicode/unicode_mappings.js:31,122,320`. Optionally rank by raster patch similarity. |
| `apply_edit_like` (transplant) | `{sourceGlyphId, since, region\|null, targets≤12, mode:"add_shapes"\|"add_ink"\|"cut_ink"\|"warp_points", anchor:"auto"\|enum, strength 0–2, expectedRevision}` → per target `{drafted\|skipped(reason)\|failed, checks}` | Copy into a candidate (`native-tools.js:146`); `addOneShape` `glyph.js:446`; scale and position `path.js:519/602`; flip `path.js:1102`; `combinePaths` subtract and unite; find the anchor with `findClosestPointOnCurve` |
| `check_outlines` | `{glyphIds}` → issues | `findWinding`, `findIntersections`, pairwise segment hits, bounds vs metrics, `checkForNaN` `path.js:1391`, `assertGeometry` `native-tools.js:488` |

**Safety rules**
- The agent writes **only Drafts**. Keep and Revert belong to the host.
- An owner and status sidecar holds whether a glyph is "Yours" (`Glyph.save()` only saves fixed fields, `glyph.js:101-134`). "Yours" glyphs are skipped unless the UI's "Include Yours" toggle issues a consent token. The model can't set that token.
- Skip these and report why:
  - the glyph open in the editor
  - any glyph while the user is mid-gesture
  - glyphs with components or dependents (`native-tools.js:150-155, 426-436`)
  - locked geometry (`:438`)
  - glyphs outside the set
- Cap targets per call. There are 8 tool calls per request (`agent-controller.js:49`) and 64 per session (`native-tools.js:108`).
- Diff JSON contains path names the user typed. Treat it as data, never as instructions.

**Drafts and one checkpoint**
- Generalise `commit()` (`native-tools.js:180-257`) into `commitBatch(candidates, "Before ripple: a → d u")`. It writes one `addWholeProjectChangePreState` (`history.js:56`) with `captureHistorySnapshot` (`native-tools.js:293`), swaps all the glyphs, then writes one `PostState` (`history.js:75`). **One Cmd+Z then undoes the whole ripple.**
- Per-glyph Revert is a new history entry that restores that glyph's pre-ripple JSON. It is not an undo.
- Grid tiles need an `itemChanged{id}` signal.
- Each checkpoint is a full copy of the project (there is an 8 MB guard, `native-tools.js:137`), which is fine for 117 glyphs.

**Other fonts:** several projects can already be open at once (`app/app.js:57`), and the cross-project copy scales by UPM (`app/cross_project_actions/action_copy_shapes.js:300-352`). But an agent session is pinned to one editor (`native-tools.js:25-43`), so this is v2.

## 5. Feasibility

| Step | Verdict |
|---|---|
| Baseline on open, dirty hook, settle on Close | Easy |
| Numeric diff when the point topology is unchanged | Easy |
| Diff when points are inserted or deleted (alignment) | Medium |
| Raster XOR, regions and zone labels | Easy |
| `render_compare` PNG | Easy |
| Images in tool results | Medium (controller change) |
| A fun caption of what changed (vision model plus diff JSON) | Easy |
| Naming the exact part ("stem foot spur") | Research (no segmentation) |
| `find_related_glyphs` from a static table | Easy |
| `find_related_glyphs` with geometric ranking | Medium |
| Transplant `add_shapes` (the user drew a new contour) | Medium (anchor plus scale) |
| Transplant `add_ink` / `cut_ink` with booleans | Medium (first-loop limit, holes, winding) |
| Transplant `warp_points` (dragged existing points) | Research (no correspondence) |
| `commitBatch`, Drafts, owner sidecar, "Before ripple" | Medium (protected code: history and commit) |
| Cross-font ripple | Medium to research |

**Smallest v1**
1. EditTracker: baseline on open; diff on Close or on "What did I do?".
2. `get_glyph_edit` (numbers plus ink regions) and `render_compare` (an overlay PNG with a highlight box). The model writes a playful caption.
3. `find_related_glyphs` from the static Latin Kernel anatomy table.
4. `apply_edit_like` supporting only **`add_shapes`** (and `cut_ink` if booleans test clean). Contours are mapped by bounding-box anchor and scale, then run through `check_outlines`.
5. Results land as Drafts in one "Before ripple" checkpoint. "Yours" glyphs are skipped.
6. Point-drag edits get the caption, plus "I can't copy point drags yet — try drawing it as a shape". There's no ripple for them.