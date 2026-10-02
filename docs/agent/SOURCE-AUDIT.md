# Source audit for native agent tools

Inspected main commit `f2bb1bc9`, 2 October 2026. Read-only native Codex audit; no application execution or benchmark. Links below are repository-relative source anchors.

| Verified area | Evidence | Agent integration consequence |
| --- | --- | --- |
| Project settings and collections | [project defaults](../../src/project_data/glyphr_studio_project.js#L32), [font defaults](../../src/project_data/glyphr_studio_project.js#L88) | Read explicit collections; snapshot affected state for atomic native commands. |
| Global editor coupling | [project imports](../../src/project_data/glyphr_studio_project.js#L1), [constructor app version](../../src/project_data/glyphr_studio_project.js#L142), [getItem creation](../../src/project_data/glyphr_studio_project.js#L305) | Explicit context is prerequisite; do not expose getItem with creation enabled as a read tool. |
| Geometry versus metadata | [font export mapping](../../src/formats_io/otf/font_export.js#L187), [settings mutation](../../src/pages/settings.js#L99) | Weight and italic angle metadata are not outline generation. |
| Side bearings | [derived metrics](../../src/project_data/glyph.js#L299), [setters](../../src/project_data/glyph.js#L582) | LSB shifts outlines and advances; RSB only changes advance. |
| Position and transform semantics | [glyph positioning](../../src/project_data/glyph.js#L607), [skew](../../src/project_data/glyph.js#L804), [path positioning](../../src/project_data/path.js#L582), [rotation](../../src/project_data/path.js#L634) | Explicit bounds/origin and unit conversion; glyph skew skips component instances. |
| Path identity | [path serialization](../../src/project_data/path.js#L83), [point serialization](../../src/project_data/path_point.js#L53) | No durable path/point IDs; use revision-scoped handles without changing GS2. |
| Handle constraints | [point movement](../../src/project_data/path_point.js#L261) | Anchor movement translates handles; handle edits reconcile symmetric/flat types. |
| Locks | [path movement](../../src/project_data/path.js#L602), [point movement](../../src/project_data/path_point.js#L261) | Low-level moves do not enforce every lock; gate must enforce them. |
| Components | [transform fields](../../src/project_data/component_instance.js#L18), [resolution](../../src/project_data/component_instance.js#L133), [insertion](../../src/project_editor/cross_item_actions.js#L81), [cycle check](../../src/project_editor/cross_item_actions.js#L174) | Resize fields are deltas; maintain usedIn, detect cycles, include dependent glyphs. |
| Cross-item context | [resolved glyph parent](../../src/project_editor/cross_item_actions.js#L160) | Resolution still binds current project; do not swap globals to simulate command context. |
| Cache invalidation | [changed](../../src/project_data/glyph_element.js#L20), [glyphChanged](../../src/project_editor/cross_item_actions.js#L24) | Clear local/ancestor and cross-glyph caches; arbitrary writes bypass this. |
| Snapshot sharing | [save arrays](../../src/project_data/glyph.js#L112), [array setters](../../src/project_data/glyph.js#L506) | Deep-copy serialized structures before hydration and test alias isolation. |
| History | [paired whole-project history](../../src/project_editor/history.js#L56), [autosave/UI effects](../../src/project_editor/history.js#L94), [navigation during undo](../../src/project_editor/history.js#L146), [selected-item snapshot](../../src/project_editor/history.js#L330) | New transaction adapter needed; current history cannot be naively wrapped with begin/end. |
| Bulk actions | [iterator](../../src/pages/global_actions.js#L148) | DOM/timer dependence and partial-error continuation make this unsuitable as atomic executor. Verify pre/post history ordering before reusing any pattern. |
| Kerning | [model](../../src/project_data/kern_group.js#L18), [advance addition](../../src/display_canvas/text_block.js#L365), [first matching group](../../src/display_canvas/text_block.js#L449) | Negative tightens; overlapping groups need conflict checks. |
| Binary export | [formats](../../src/formats_io/otf/font_export.js#L25), [mutable module state](../../src/formats_io/otf/font_export.js#L19), [composite handling](../../src/formats_io/otf/font_export.js#L91) | Serialize compile work until reentrant; OTF flattens and TrueType preserves only eligible composites. |
| Import routing | [dispatcher](../../src/formats_io/validate_file_input.js#L64) | OTF/TTF/WOFF, SVG, TXT and GS2 recognized; WOFF2 export does not imply WOFF2 import. |
| Saving | [file IO](../../src/project_editor/file_io.js#L10) | Separate compile/prepare artifact from user-initiated save/download. |
| Current quality checks | [checks](../../src/project_editor/quality_checks.js#L1) | Proximity checks are not a complete structural/export validator. |
| UI entry points | [open project](../../src/app/open_project.js#L35), [characters](../../src/pages/characters.js#L25) | Add the welcome entry and panel without a framework rewrite. |
| Visual tokens | [colors and fonts](../../src/common/colors.css#L7) | Source palette and UI fonts govern the proposal. |

Oblegg’s n starts with advance 1088 and 40-unit left/right bearings. The revised screen sets only RSB to 60, giving advance 1108. This arithmetic was also observed through the running app’s native numeric control. The displayed agent conversation is a proposal.
