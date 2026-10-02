# Native agent — implementation verification

3 October 2026 · integration branch `codex/native-agent-plan` · based on existing `noddy/main` at `f2bb1bc9`. Application checkpoint: `dd014dde`; inspector repair proposal: `237f94db`. No push, merge to main, or new clone.

**Status:** core agent implementation is integrated and checked. One existing manual-inspector undo defect has a concrete repair pending explicit approval. Live account/model verification and the full manual editor matrix are not complete; this is not an unconditional release sign-off.

## Objective and result

Add an agent to the existing app: right-side visibility toggle, movable/resizable window, welcome prompt input and files. Connect API-key models and execute only fixed, scoped native commands. The canvas, inspector and normal project workflow remain the editing interface.

Before: no executable native agent, provider relay or chat attachments. After: five native tools, OpenAI/Zen connection with automatic protocol routing, bounded execution/Stop/Undo, and shared image/OTF/TTF composers. Fonts attach as metadata references and open as separate projects only on explicit action. Runtime scope is one selected character, not a whole-font redesign.

## Workers and integration

| Worker | Precise scope |
| --- | --- |
| `agent_native_tools` | Native registry, validation, captured scope/revisions, mutation/history adapter and domain regressions; independently reviewed UI |
| `agent_providers` | AI SDK adapters, fixed relay endpoints, protocol resolver, local production host, transport tests and provider documentation |
| `agent_window` | Shared composers, window/controller, files, additive welcome/header integration and DOM tests |
| `native_tool_audit` | Read-only independent native/provider/UI follow-up and structural review |
| Orchestrator | Reviewed/cherry-picked scoped commits, ran combined checks and real browser verification, recorded docs/evidence |

Each implementation worker used its existing isolated branch/worktree. No source was sent to OpenCode workers; no credentials were read from unrelated files or captured from the user's browser.

## Changed files by area

- Native: `src/agent/tool-definitions.js`, `native-tools.js`, `native-tools.test.js`.
- UI/runtime: `src/agent/agent-window.js`, `agent-window.css`, `agent-composer.js`, `agent-controller.js`, `attachments.js`, `font-attachment.js`; their five test files under `src/agent/tests/`.
- App integration: `src/app/menu.js`, `open_project.js`, `app.css`, `src/vite.config.js`.
- Providers: `src/agent/provider-config.js`; `server/agent/{agent,providers,relay,serve,tool-schema,validation,vite-plugin}.js`, `relay.checks.js`, `tsconfig.json`; `package.json`, lockfile.
- Documentation/evidence: root README, `docs/agent/`, redesign changelog/matrix, Figma construction/state records under `design/figma/native-agent-plan/`. `.gitignore` also excludes a node_modules symlink as well as a directory.

**Protected files touched: none.** No changes under `project_data`, `formats_io`, `edit_canvas`, or `project_editor`; no GS2 schema or compatibility changes. The adapter intentionally uses native history and geometry and is covered by real-domain regressions. The separate proposed inspector change modifies undo behavior and has not been applied. GPL/upstream attribution and version `2.11.0-noddy.0` are preserved. Generated tracked `dist/` and build-date changes were restored after testing.

## Automated verification

| Check | Result |
| --- | --- |
| Baseline | 618 tests / 31 files passed before implementation |
| Full integrated Vitest | **687 tests / 37 files passed** |
| Native focused coverage | 26 tests using actual ProjectEditor, Glyph, Project and History |
| UI/controller/file coverage | 43 tests, including real TTF and no-A icon-font conversion |
| Relay | **22 tests passed** with actual installed SDK adapters and mocked transports |
| Relay scoped typecheck | Passed |
| Lint | 0 errors; 2 unchanged warnings in `common/colors.js:190` and `project_editor/boolean_combine.js:61` |
| Version check / diff whitespace | Passed |
| Production build | Passed; existing font-flux `node:zlib` externalization and >3000 kB bundle warnings |

Coverage includes stale revisions, locks, scope, dependent glyph rejection, duplicate calls, cancellation, rollback, exact settings/snapshot isolation, transient export flags, inspector rebinding, attachment limits/signatures, draft races, project closure, HTML-safe rendering, credential redaction, timeouts, local request guards, and exact Muse Contributor Free routing. Local relay tests first failed under socket-denying sandbox restrictions and passed with loopback socket access; this was an environment failure. Existing four dependency advisories were unchanged by the SDK additions; see PROVIDERS.md.

## Independent review

Review identified and resolved snapshot aliasing across manual edits, lost transient export flags, inspector closures targeting restored-away objects, unintended blank A on icon-font import, and canvas shortcuts escaping agent controls. The independent reviewer rechecked the snapshot sidecars/observer and the final protocol/draft fixes with no remaining actionable findings in those diffs. Structural scan found no banned old-branch layouts or copied implementations. No global font CSS overrides were added.

Browser verification subsequently exposed a separate existing shared numeric-inspector history gap. The native worker reproduced it with the actual custom input. A [reviewable patch and regression](INSPECTOR-UNDO-PROPOSAL.md) are ready; modifying shared undo behavior requires explicit approval under AGENTS.md §3.

## Browser evidence

Tests used an isolated local fixture at **5190**, with a dummy key and replies explicitly labelled “Local fixture”. Normal preview **5187** uses the real relay. The earlier fixture-on-preview incident and correction are recorded in PAUSED.md; its “Local fixture rejected” result was not a response from Zen/Muse.

Verified directly:

- Welcome action reveals the prompt/Attach input before creation; submitting carries the draft to the existing editor/window.
- TTF file picker produces a removable metadata chip without importing the font.
- Zen Muse configuration resolves visibly to Responses.
- Local fixture performs get-context → read → add-paths, producing editable outlines on canvas; another run changes advance to 720 and RSB to 130 in the native inspector.
- Inline Undo restores prior spacing, native Redo restores 720, and a subsequent manual RSB change updates the live glyph. Its following Undo exposes the documented existing inspector-history defect.
- Right-side toggle hides/shows the window. Composer remains reachable at 1440×900, 760×520 and 390×620; viewport override reset afterward. Existing Panel menu wrapping at the intermediate width was observed and is outside this additive window change.
- Production host at 5189 serves the built app; welcome composer and existing Oblegg sample loading work. Sending from its overview keeps the typed draft and shows the selected-character guidance before connection/provider traffic.

Screenshots: [desktop native edit](evidence/native-edit-desktop.png), [narrow](evidence/agent-narrow.png), [short](evidence/agent-short.png), [production welcome](evidence/welcome-production.png), [production overview guard](evidence/overview-guard-production.png). Fixture screenshots demonstrate native integration, not model quality or live Muse access. Temporary test tabs/servers were closed; the normal development preview remains on 5187.

## Limitations and remaining checks

- **Approval needed:** apply and reverify the numeric-inspector undo proposal. Until fixed, a typed numeric manual edit can be skipped by native Undo, removing a preceding agent operation instead.
- No real provider key/model call was made. Real credential validity, quota, tool capability, vision support and generated outline quality remain unverified.
- Full manual regression matrix remains partial: pointer/handle dragging, save/reload via download/upload, every legacy page, component/ligature/kerning workflow and native file-picker import/export permutations were not all repeated. Existing automated roundtrip/composite/typography coverage passed in the complete suite. New font-import, attachment, keyboard and history paths have targeted automated regressions; do not equate those to all manual matrix rows.
- Current-glyph tools only. No whole-font editing, existing point rewriting, component mutation or autonomous export. Font reference metadata is not its outline data; explicit opening is needed.
- Relay is local-only. Public hosting, persistent encrypted credentials, cost accounting and additional provider protocols require separate work.

## User verification

1. Review the inspector undo proposal and approve or defer that exact change.
2. Save current work, reload the normal preview, select a character, connect OpenCode Zen with `muse-spark-1.3-contributor-free` and Automatic protocol. Verify the UI says Responses and try a small spacing request.
3. Try an image reference and an OTF/TTF attachment; check that attaching does not replace your project and Open as project preserves the old project.
4. Verify Stop, window movement/resize, toggle, native undo/redo and ordinary canvas editing in your normal workflow.

AGENTS.md §5 requires a verification packet and a stop before starting the next milestone. No broader tool scope or redesign begins without approval.

Awaiting approval.
