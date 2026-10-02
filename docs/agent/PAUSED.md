# Historical pause checkpoint — 2 October 2026

Resumed on 3 October at the user's request. This is the saved pause record, not the current status. See [MILESTONE-1.md](MILESTONE-1.md) for integrated fixes, verification and the pending inspector-undo approval.

User said “pause rn tho willl continue later”. Do not resume implementation or tests without a new request.

## Saved implementation

Integration branch `codex/native-agent-plan`, HEAD `77a10b8d`, in `noddy-agent-plan`. Original checkout, main and unrelated worktrees are preserved; nothing pushed. Three isolated implementation workers supplied scoped commits. Five native tools, OpenAI/Zen relay, right-side toggle, floating window, welcome composer and image/OTF/TTF attachments are committed. Latest fixes preserve session/export flags and inspector bindings after native undo/redo, avoid adding A to imported icon fonts, and prevent Agent keyboard input from reaching canvas handlers. No protected source files were modified.

## Important test-preview incident

The orchestrator mistakenly ran a local scripted model fixture on the user's existing preview port 5187. The user's screenshot with “Local fixture rejected” came from that fixture, NOT from Muse Spark or Zen. Their attempted request was made from the glyph overview, where the captured glyph was null; the fixture incorrectly attempted glyph tools anyway. No upstream model request was made by the fixture. The real Vite provider relay has now been restored on `http://127.0.0.1:5187/` (exec session 49526). The fixture was moved to 5190 and then stopped when the user paused. Never put test fixtures on the user's preview again.

Next resume: first verify Zen `muse-spark-1.3-contributor-free` uses the proper protocol (Responses, not the current Zen default Chat) and make model configuration clearer. Do not extract or log any key the user typed. A real model/account call has NOT been verified. Do not use credentials from root opencode.json or other unrelated configuration. The current tool scope is a selected character, not font-wide editing; communicate this clearly and avoid null-glyph tool errors from overview requests.

## Verification state

- Baseline 618 tests; integrated 672 tests / 37 files passed before the final two native tests and final UI fixes were integrated. Latest worker checks: native 26 tests; UI follow-up 11 tests. Rerun combined suite after resume.
- 18 relay tests passed using real SDK adapters with mocked upstream and local HTTP sockets. Scoped relay typecheck and version consistency passed. Running these requires local socket permission; the first sandbox run failed with EPERM, not an application failure.
- Lint passed with zero errors and two existing warnings in colors.js and boolean_combine.js, before latest fixes. Workers' latest scoped lint passes.
- Production build passed at current HEAD; existing font-flux node:zlib and bundle-size warnings remain.
- Build changed tracked dist assets and src/app/app_config.json. These generated changes are uncommitted and must be restored after any production-host smoke check. Do not indiscriminately clean other files. They are left in place at pause to avoid triggering another HMR reload while the user has a project open.
- Welcome reveal-before-create verified in an isolated Chrome tab. Full browser edit/undo/attachments verification remains incomplete. Scripted Chrome upload requires extension file-URL access; do not change that permission automatically. IAB Playwright targeting was inconsistent; native Chrome AX worked.
- Independent reviewer found native snapshot flags and inspector binding issues; implemented fixes are committed, but final independent re-review was interrupted at pause.

## Remaining work

1. Resume independent read-only review of 99fa0c55 and 77a10b8d.
2. Address/verify Muse provider protocol and selected-glyph UX, without exposing keys or secretly calling a paid provider.
3. Run combined lint/tests, relay checks and production smoke; use an isolated fixture port only.
4. Complete actual browser checks of native edit/undo/manual edit, file chips and explicit font opening, responsive/focus behavior, and relevant regression matrix. Save real screenshot evidence.
5. Add concise agent README/usage, distinguish five implemented tools from the proposed eleven-tool planning catalog, update redesign changelog/matrix and milestone verification packet. Existing uncommitted PLAN.md and Figma state.json changes are intentional.
6. Restore generated build outputs, commit reviewed documentation, and stop at the AGENTS.md milestone approval gate. Do not claim live-provider or full-browser verification until actually completed.

Worker branches/checkouts remain available: codex/agent-native-tools, codex/agent-providers, codex/agent-window. Independent review agent native_tool_audit was interrupted. No external OpenCode workers were used; source transfer was declined earlier.
