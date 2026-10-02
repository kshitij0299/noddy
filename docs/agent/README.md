# Native agent

The floating Agent window edits the current character in the existing canvas and inspector through fixed commands. It has no shell, browser, computer-control, arbitrary-code or general filesystem tools.

## Run and connect

Use Node 22 or later. Install with `npm ci`, then run `npm run dev`. For the local production host, run `npm run build` followed by `npm run agent:serve` and open `http://127.0.0.1:5189/app/`. A static deployment runs the editor but cannot make agent requests. Public hosting requires an authenticated HTTPS relay; the included server accepts loopback connections only.

1. Open a font, select a character in **Characters**, and turn on **Agent** at the right of the header.
2. Choose **Connect model**, enter your provider, raw model ID and API key. Credentials are checked on the first message, not on configuration.
3. Leave the API protocol at **Automatic**. Zen's `muse-spark-1.3-contributor-free` uses **Responses** automatically. Advanced settings allow an explicit override. Unknown Zen families need the format in their provider's endpoint table.
4. Ask for a supported edit, such as “Set the right bearing to 60 units” or “Move path 0 up by 20 units.” The agent reads the native glyph before editing.

On the welcome screen, **Start from scratch with an agent** reveals a composer before creating a project. Submitting carries the prompt/files into the floating window. The new project initially selects A; choose other characters in the normal editor. Sending from the overview preserves your draft and asks you to select a character before contacting a model.

**Stop** cancels pending work; hiding the window also stops an active run. Completed edits remain. Each tool mutation is one native undo step. **Undo last agent edit** only works when that edit is still the latest unchanged entry; use normal history after intervening changes. Move the window by its header, or focus its move button and use arrows. Resize from the corner.

Known existing editor issue: manual numeric inspector edits do not currently create their own history entry. Undo after such a change can remove the preceding agent edit instead. The [narrow repair](INSPECTOR-UNDO-PROPOSAL.md) is prepared and awaiting the repository-required explicit approval; it has not been applied.

## Attachments

Both composers accept a file picker, drag/drop and pasted image files. Unsent chips are removable. Submitted references remain in follow-up requests until **Clear chat** or a project change.

| Files | What is sent on Send | Limits |
| --- | --- | --- |
| PNG, JPEG, WebP | Image content; requires a vision-capable model | 4 MiB combined, 40 megapixels, 16,384 pixels per side |
| OTF, TTF | Locally parsed names, units per em and glyph count | 10 MiB per font |

At most four files per chat. Signatures, font table bounds and image dimensions are checked. Collections, web fonts and SVG are not chat attachments in this version; existing editor imports remain available.

Font binaries stay local. Attaching a font does not import its outlines or replace the project. Its explicit **Open as project** action runs the existing converter into a separate editor; the previous project remains available in Projects. The model can then inspect selected glyphs through native tools. Font metadata alone does not expose all its outlines.

## Implemented tools

The executable contract is [tool-definitions.js](../../src/agent/tool-definitions.js), shared by the relay and browser validator. [tool-catalog.json](tool-catalog.json) is an earlier proposed future catalog; do not use its broader schemas for runtime calls.

| Tool | Behavior |
| --- | --- |
| `get_context` | Captured project, glyph, selection, units and revision |
| `read_glyphs` | Up to eight existing glyphs with bounded metrics, locks and optional outlines |
| `set_spacing` | Set left bearing, right bearing or advance width |
| `transform_paths` | Translate explicit path indices in font units |
| `add_paths` | Append bounded closed cubic contours, including to an empty selected glyph |

Writes require the current revision and are restricted to the character selected when Send was pressed. Manual changes or navigation cannot silently retarget calls. Locks are respected. Component-bearing and reused glyphs are rejected to avoid unexpected dependent changes. Reads never create glyphs.

Font-wide editing, individual existing point edits, path replacement/deletion, scaling/rotation, kerning, components and autonomous export are not implemented. Refine characters individually and review drawn outlines; normal save/export stays user-operated.

## Architecture and extension

The window/composer is additive vanilla JavaScript. `agent-controller.js` owns in-memory chat and a loop bounded to eight calls and 120 seconds. `native-tools.js` captures scope, validates arguments/revisions, edits a detached candidate, commits through existing history and refreshes the inspector. Failed commands roll back; duplicate call IDs do not replay edits. Private history sidecars preserve settings and export flags without changing GS2 serialization.

`server/agent/` uses AI SDK `ToolLoopAgent` for one provider step per request, with no server tool executors. Fixed URLs, request limits, local Host/Origin checks, timeouts and sanitized errors bound the relay. [PROVIDERS.md](PROVIDERS.md) covers formats, production packaging and transport tests.

Keys stay in tab/request memory, never project files, localStorage, source or logs. Disconnect/reload discards the connection. Clear chat clears references/conversation while retaining the configured connection. Prompts, images and native font summaries go to the selected provider on Send and are subject to its retention policy.

New tools need strict schemas and regressions for native history, manual edits, locks, stale revisions, rollback and bounds. New providers need fixed endpoints and mocked adapter tests. Do not add arbitrary property setters or model-supplied URLs.

## Verification

Run `npm run lint`, `npx vitest run`, `npm run test:agent-relay`, `npm run typecheck:agent-relay`, `npm run ci:versions` and `npm run build`.

Relay tests exercise actual SDK adapters with mocked upstream responses; they do not establish real account/key/model compatibility. Browser fixtures must use a separate port from the user's preview and identify their responses as local tests. See [MILESTONE-1.md](MILESTONE-1.md) for evidence and remaining limitations.
