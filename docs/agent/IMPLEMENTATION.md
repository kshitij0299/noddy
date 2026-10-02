# Agent implementation log

## Scope authorized on 2 October 2026

Implement the native agent feature in the existing application. Put an Agent visibility toggle at the right of the application header. Keep a small, movable floating window. On the welcome screen, Start from scratch with an agent reveals a prompt composer before creating a project. Both composers accept images and OTF/TTF attachments.

The first functional milestone connects a user-supplied provider key/model to fixed native tools, executes edits through Noddy, and supports cancellation and existing history. Implement bounded geometry operations where the existing model supports them safely. Font-wide autonomous generation remains a later expansion, not an implicit permission to change all glyphs.

## Git protocol

- Integration checkout: `noddy-agent-plan`, branch `codex/native-agent-plan`, based on `noddy/main` at `f2bb1bc9`.
- Planning baseline committed as `da9d73f3` before implementation began.
- Native commands: `noddy-agent-tools`, branch `codex/agent-native-tools`.
- Provider SDK/relay: `noddy-agent-providers`, branch `codex/agent-providers`.
- Window/composers/runner: `noddy-agent-window`, branch `codex/agent-window`.
- Each worker owns a disjoint file scope and commits there. The orchestrator reviews and cherry-picks completed commits, resolves integration issues, runs combined verification, and records evidence. Never merge an unreviewed worker tree or commit generated build output/secrets.
- The existing original checkout and unrelated worktrees are preserved. No force push, reset, rebase of shared branches, or edits on main. Keep the integrated milestone reviewable before expanding scope.

Managed worktree creation was attempted, but the app reported that the parent chat directory is not a Git repository. These sibling worktrees were therefore created using Git in the known existing repository.

## Ownership and interfaces

| Worker | Ownership | Boundary |
| --- | --- | --- |
| Native tools | `src/agent/native-tools*`, `tool-definitions.js`, native helpers/tests | Captured editor/glyph, strict arguments, revision/scope checks, native mutation, undo, refresh |
| Providers | `server/agent/`, package dependencies/scripts, provider documentation | Fixed provider endpoints, SDK model step, bounded requests, cancellation, secret handling |
| Window | Agent UI/controller/attachments/tests and narrow app entry integration | Right-side toggle, welcome composer, conversation, files, provider connection, tool loop |
| Orchestrator | Integration, repository documentation, verification and review | Stable contracts, commits, regressions and user-facing result |

The provider layer does not execute font mutations. The browser executes only the checked-in native tools. A model response cannot introduce a tool or gain broader scope. One bounded model step returns calls; the client validates and executes them, reports results, and resumes if needed. No coding-agent shell or computer-control tools are included.

## Provider decision

Use Vercel AI SDK for protocol adapters with a same-origin local relay. The editor remains vanilla JavaScript. Support OpenAI and OpenCode Zen directly with explicit protocol/model settings; provider credentials are supplied by the user for the current session. Do not read credentials from unrelated configuration or reuse the orchestrator's accounts.

OpenCode Zen documents Responses, Chat Completions and Messages endpoints for different model families. Treat protocol as explicit configuration rather than assuming every model uses Chat Completions. See [Zen endpoint documentation](https://opencode.ai/docs/zen/) and [AI SDK providers](https://ai-sdk.dev/docs/foundations/providers-and-models).

Keys must not enter project files, browser persistence, logs, error text or model messages. Use fixed upstream origins, bounded bodies, origin/host checks and timeouts. A static-only deployment cannot securely provide the relay; document the local/hosted runtime requirement rather than silently falling back to an exposed key in a bundle.

## Attachments

Images are explicit chat input and sent when the user submits the message. Fonts are read locally into bounded metadata/context first; attaching one does not replace the working project. Show removable chips, file/total-size limits and clear type/parse errors. Validate content signatures and offsets, not just extensions. Stop drop/paste propagation inside the composer so the existing canvas importer cannot also consume the same file. Preserve submitted attachment context for follow-up messages.

## Verification baseline

Before application edits: lint passed with zero errors and two existing warnings (`colors.js` unused eslint-enable and `boolean_combine.js` unused catch variable). Baseline tests: 31 files, 618 tests passed. Baseline production build passed with existing font-flux-js node:zlib externalization and bundle-size warnings. The first symlink-based test attempt failed in dependency setup; an APFS-cloned local node_modules resolved it. Build-generated tracked dist and version-date changes were restored after checking them.

Provider tests use controlled mock responses. A live provider call requires a key deliberately supplied through the new connection UI; passing transport tests is not evidence that a real account/model was exercised.

## Integrated checkpoint — 3 October 2026

Provider, native and UI worker commits were reviewed and cherry-picked separately. Shared automatic routing now sends Muse Spark Contributor Free to Zen's Responses endpoint; unknown formats require an explicit choice. Requests without a selected character keep their draft and do not contact a provider. Browser verification exposed an existing manual numeric-inspector history gap, independently reproduced with the real control; its exact repair is documented and awaits explicit approval before changing undo behavior. See [MILESTONE-1.md](MILESTONE-1.md) for evidence and the current completion boundary.
