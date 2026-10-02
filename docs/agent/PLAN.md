# Noddy: an agent inside the existing editor

Historical design proposal · 2 October 2026 · `noddy/main` at `f2bb1bc9`. Implementation followed on `codex/native-agent-plan`; see [current behavior and the five executable tools](README.md). This retains the broader proposal, not a claim that every planned capability shipped. The runtime schemas are in [tool-definitions.js](../../src/agent/tool-definitions.js); the JSON catalog below remains proposal-only.

The change is a **Start from scratch with an agent** button in the existing New tab, and one small **Agent** window in the editor. An Agent visibility toggle at the right of the application header opens that window for an existing project. The current canvas, inspector, tools, navigation, rendering and file flows remain the working interface.

## Interaction

- **Existing font:** open Agent, describe an edit, watch the current glyph and attributes update. The window shows brief tool activity and the result. Ordinary edits apply directly through validated native commands. No separate review screen.
- **New font:** the added button reveals an agent-style prompt composer with attachments. Submitting uses the current project-name field and existing project creation path, then opens the same Agent window. It asks what to draw and starts with a small set of glyphs. No second onboarding flow.
- **Context:** show current project and glyph/selection. Bind each request to those IDs when sent. Switching glyphs during a run must not silently retarget pending edits.
- **Control:** Send becomes Stop while running. The window is movable, resizable and non-modal. Its input owns typing shortcuts only while focused. Closing an active window offers Stop or Keep running; no invisible work by accident.
- **Undo:** each completed tool edit enters existing history. Inline Undo invokes that history only when the agent edit is still the latest entry. After intervening manual edits, use normal history rather than overwriting newer work. Stop cancels queued calls and rolls back an unfinished transaction; completed edits remain undoable.
- **Confirmation:** ask inline only for scope expansion, unexpected dependent-glyph effects, deletion/replacement, or file overwrite. Ordinary edits within the request need no approval. The host enforces the decision.

The [two Figma screens](https://www.figma.com/design/XQHz0qOrTAmZhWw7h71a2S/noddy?node-id=12-40) show the added welcome action and floating window. Existing editor chrome is reproduced as placement context, with some action icons represented by labels; those are not proposed UI changes. The outline is actual Oblegg data. The conversation is illustrative, not an implemented agent.

Images and OTF/TTF fonts can be attached in both composers. An attached font starts as a reference; an explicit Open as project action makes it the working font in a new project.

## Native execution

```text
Agent window → model tool call → fixed registry → command adapter
                                              ↓
                               validation / history / mutation
                                              ↓
                              existing canvas + inspector
```

Use one model session and a checked-in registry. The model requests named tools with typed arguments; it cannot execute JavaScript, use a shell/browser, mutate arbitrary properties, or register tools. Noddy's font model remains authoritative. Provider credentials belong in a server relay or desktop host, never in the browser bundle. Keep the provider adapter replaceable. MCP can later expose the same commands; it is unnecessary for the first in-app integration.

Example: “Give n 20 more units of space on the right.”

1. `read_glyphs` returns the bound glyph, revision, advance 1088, LSB 40, RSB 40 and relevant locks.
2. `set_spacing` sets RSB to 60 against that revision. The host validates, records history and calls the native setter. Advance becomes 1108 and the existing canvas and Attributes panel refresh. Return the actual changes.

This arithmetic was observed in the running app. It requires neither new geometry nor a new preview surface.

## Fixed tools

[tool-catalog.json](tool-catalog.json) is a versioned implementation contract, not executable tools. Ship only implemented entries. Use explicit IDs, enums, finite numbers, bounded batches and strict object schemas. Do not offer `set_property`, arbitrary code, or raw JSON patches. The host executes requests as described in [function calling documentation](https://developers.openai.com/api/docs/guides/function-calling/); [MCP's tools specification](https://modelcontextprotocol.io/specification/2025-06-18/server/tools) is relevant if external clients follow.

| Tools | Purpose | Delivery |
| --- | --- | --- |
| `get_context`, `read_glyphs` | Selection, metrics, geometry, locks, revision | First slice |
| `set_spacing` | Explicit bearing/advance changes | First slice |
| `transform_paths`, `edit_points` | Move, scale, rotate, skew, anchors/handles | Next |
| `create_glyph`, `add_paths` | Empty glyphs, basic shapes, bounded cubic paths | Next |
| `set_kerning`, `place_component` | Pair spacing and reusable components | Later |
| `set_font_properties` | Allowlisted naming/export metadata | Later |
| `inspect_font` | Structural checks and bounded proof output | Later |

The host supplies project scope, request identity, cancellation and permission state. The model cannot choose them. Path/point handles are revision-scoped because the current file format has no durable IDs for them. Read named other glyphs when needed; writes require authorized targets. Reads must never create missing glyphs.

## Reliability

Put a narrow adapter in `src/agent/commands/` around existing operations. Every write must:

1. Resolve explicit targets; verify revision, scope, bounds, locks and dependent components.
2. Deep-copy affected state for rollback. Current serialization retains some array references; verify isolation.
3. Execute a bounded command synchronously or under a short mutation lock. Failure restores the entire command.
4. Invalidate bounds/dependent caches, append correct history, send existing refresh notifications, and return measured before/after values.

People can edit while the model thinks. Recheck revision immediately before mutation; stale calls reread and recompute. Serialize writes per project. Bound tool steps, affected glyphs, geometry size, elapsed time and provider spend. Host-issued idempotency keys prevent duplicate edits on retries. Store conversation separately from `.gs2`; invalidate pending work on reload/project closure.

[SOURCE-AUDIT.md](SOURCE-AUDIT.md) documents the concrete traps: global-project coupling, selected-item history assumptions, locks bypassed by low-level operations, component cache dependencies, differing transform units, and export module state. LSB changes move outlines and advance together; RSB changes advance only. Weight/italic metadata does not thicken or slant outlines.

Treat imported metadata and SVG text as document content, never authority. Send only task-relevant font data to the model, excluding local paths, file handles, credentials and unrelated projects. Read compact metrics first; request geometry only when needed. The product uses one agent session, with no swarm.

## Delivery and acceptance

1. **Window and entry:** add the welcome button, Agent menu entry and non-modal window using existing styles. Check focus, dragging, resizing, narrow/short windows, and normal editing when closed. No global layout rewrite.
2. **One working edit:** context, read and spacing tools only. Demonstrate request → two calls → native changes → normal undo/redo. Test locks, stale revisions, duplicate calls, partial failures, Stop, provider errors, scope rejection and intervening manual edits. This is the useful first release.
3. **Geometry:** transforms and point edits, then glyph/path creation. Test y-up coordinates, degrees/radians, handles, locks, components and atomic rollback. New-font work begins with a few explicit glyphs, viewed and refined in the current canvas before expanding coverage.
4. **Broader font work:** kerning, components, metadata and validation after each operation is reliable. Save/export remains user-operated initially. Font-wide optical consistency is a later quality problem, not something a tool API solves by itself.

Required evidence for mutations: undo/redo on success/failure, snapshot isolation, explicit stable targets, atomic batches, cache/inspector refresh, retry safety, save/reload compatibility and relevant export round trips. Run normal editor regressions and performance checks. Full-font creation also needs coverage, contours, spacing, component validity and compilation; [fontTools](https://fonttools.readthedocs.io/en/latest/ttLib/index.html) and [FontBakery](https://github.com/fonttools/fontbakery) can supplement Noddy's limited checks.

No framework rewrite, GS2 schema change, autonomous publishing or new font-library UI is needed. Protected-domain implementation remains subject to this repository's approval/regression process. This proposal changes planning artifacts only.
