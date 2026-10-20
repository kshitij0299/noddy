# Proposal: carry glyph status inside `.gs2`

Status: **proposal for the owner**. Not implemented. It changes project-file serialization, a protected area (AGENTS.md §3), so it needs explicit owner approval and its own `protected-area` PR.

Related: issue #15 ([M2] Glyph status store). PR for #15 ships the store without any format change. Statuses live in `src/project_editor/glyph-status.js` and are mirrored to `localStorage` under `noddy.glyphStatus.<settings.project.id>`.

## Why

With localStorage only, status does not travel with the file. Draft, Kept, Yours and Failed are lost when a project is opened on another browser or device, after site data is cleared, or when a `.gs2` is shared. "Yours" is the agent lock (PRODUCT.md), and losing it silently means the agent could redraw glyphs the user drew by hand.

## Change

Add one optional top-level key to the saved project:

```json
{
  "settings": { "...": "unchanged" },
  "glyphs": {}, "ligatures": {}, "components": {}, "kerning": {},
  "noddy": {
    "formatVersion": 1,
    "glyphStatus": {
      "glyph-0x41": { "status": "yours", "owner": "user", "updatedAt": 1760995200000 },
      "glyph-0x42": { "status": "draft", "owner": "agent", "updatedAt": 1760995300000 }
    }
  }
}
```

- `GlyphrStudioProject` constructor: if `newProject.noddy?.glyphStatus` is an object, copy validated records into `this.noddy.glyphStatus`, with the same rules as the store's `reload()`: only persisted statuses (`draft`, `kept`, `yours`, `failed`), known owners, and `yours` only with owner `user`. Anything else is dropped.
- `GlyphrStudioProject.save()`: write `noddy` only when there is at least one record, so projects without status save byte-for-byte as today.
- `queued` and `drafting` are run-time only and never written.
- `GlyphStatusStore` reads from and writes to `project.noddy.glyphStatus` instead of localStorage. It keeps localStorage as a one-time migration source: on load, if the file has no `noddy` key and localStorage has records for this project ID, adopt them and mark the project unsaved.
- Item IDs are the existing glyph, ligature and component IDs, so no ID scheme changes.
- Nothing under `settings` changes. `merge(template, imported)` drops unknown keys and non-string values, so status must not go there.

## Compatibility

**Noddy opening old files (no `noddy` key).** The constructor sees no key, so every glyph falls back to the derived default (no outline means Empty, an outline means Kept). This is the same behaviour as today. Covered by a test that loads the existing sample projects and checks their `save()` output is unchanged.

**Old Glyphr Studio 2 (or an older Noddy) opening a new file.** `GlyphrStudioProject`'s constructor reads only `settings`, `glyphs`, `ligatures`, `components` and `kerning`, so the `noddy` key is ignored without an error. `importGlyphrProjectFromText` only checks the version and runs migrations on `settings`, so it does not touch the key. The project opens and edits normally. Status is lost if that app saves the file, because its `save()` writes only the fixed keys. That is acceptable: the result is the same as an old file.

**Version gating.** `settings.project.latestVersion` is unchanged. `noddy.formatVersion` lets a future Noddy migrate or reject a newer status layout without touching the Glyphr version path. A Noddy that sees an unknown higher `formatVersion` keeps the key as-is: it doesn't load the records and it writes them back unchanged.

**Export.** OTF and SVG export ignore status. Status is project metadata only.

**Undo.** Whole-project undo snapshots come from `project.save()`. Once status is in the file, a whole-project undo would also restore status, while per-item undo would not. Decide on purpose whether Keep and Revert are undoable (ARCHITECTURE.md §6) before shipping.

## Regression tests it would need

1. `test/roundtrip.test.js`: a project with draft, kept, yours and failed records survives `save()`, then JSON, then `importGlyphrProjectFromText`, with every status, owner and `updatedAt` intact.
2. Same file: `queued` and `drafting` records are not written.
3. Same file: each existing sample `.gs2` loads and re-saves with no `noddy` key, and output matches today's.
4. A file with a `noddy` key loads in the legacy path (`new GlyphrStudioProject(json)` before the change, simulated by deleting the hydration) without throwing, and glyphs, kerning and settings are unchanged.
5. Invalid records (unknown status, agent-owned `yours`, non-object `glyphStatus`, unknown higher `formatVersion`) are dropped or passed through, never thrown.
6. History: a whole-project undo after a status change behaves as the chosen undo policy says.
7. Migration: localStorage records are adopted once when the file has no `noddy` key, and are not adopted again after the file has one.
