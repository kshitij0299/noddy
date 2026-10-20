# Edge cases: native agentic font editor (Noddy v1)

Each item reads: **scenario.** why it matters → UX handling, with the code or doc it rests on. Paths are relative to `noddy-agent-plan/`.

## 0. Scope and character set
- **P0 · What the v1 set is called.** The standard name is **Basic Latin**, the Unicode block U+0020–U+007E, also called "printable ASCII". It has 95 characters: space, A–Z, a–z, 0–9 and 32 punctuation/symbols. Export also needs `.notdef`. The app's own block table runs to 0x7F (`src/lib/unicode/unicode_blocks_0_bmp.js:3`), which includes DEL, a control character. → Define the set as 0x20–0x7E plus `.notdef`. The glyph grid shows exactly 96 cells. The next tiers are Google's GF Latin Kernel and GF Latin Core (https://github.com/googlefonts/glyphsets). Both are P2, because accented letters need components.
- **P1 · Agent asked for something outside the set** ("do é", "add Greek"). This makes the work unbounded. → A tool-level `OUT_OF_SET` rejection. The agent replies in one line with what it can't do and offers a greyed-out "Add set" control.
- **P1 · Space glyph.** It has no outline. Setting a left bearing on it throws `EMPTY_GLYPH` (`src/agent/native-tools.js:457-461`). → The space cell shows a width bar, not a blank. The agent sets only the advance width. Its status is "Done (empty by design)".

## 1. Onboarding and connection
- **P0 · No API key.** → An empty "Connect model" state inside the agent panel. The canvas and manual tools stay fully usable. The draft prompt is kept (`docs/agent/README.md:14`).
- **P0 · Wrong key, or no access to the model.** `connect()` never checks credentials (`src/agent/agent-controller.js:80-108`, `README.md:10`). The first Send fails with one message that covers both cases (`server/agent/relay.js:89-94`), after the user has already written a long brief. → An explicit "Check connection" button that discloses it makes a tiny billed call. Show the error inline in the connect sheet. Keep the draft.
- **P0 · Model can't call tools.** This collapses into a generic 422: "check model ID, API format and image support" (`relay.js:102-107`). Worse, a model may print pseudo-JSON as text. The controller then treats the run as complete (`agent-controller.js:190-193`) while the text claims edits were made. → A capability probe. Every turn ends with a receipt built from native results ("0 edits applied" / "A: +2 paths, RSB 60"), shown regardless of what the model says.
- **P0 · Image attached to a model without vision.** It fails with the same 422. → A warning on the attachment chip ("this model may not read images"). On failure, offer "Send without image".
- **P1 · Unknown Zen model.** Automatic mode returns `PROTOCOL_REQUIRED`, and Gemini/Jev are refused (`src/agent/provider-config.js:75-84`). → A curated list of known-good models, plus a "Custom ID" option under Advanced that shows which protocol it resolved to.
- **P1 · Free vs paid models.** Free Zen models (`provider-config.js:27-34`) are rate-limited, weaker at geometry and can disappear (`docs/agent/PROVIDERS.md:19`). → Free/Paid badges. Recommend a paid model for set builds. Link the provider's data terms.
- **P1 · Key lost on reload.** By design the key lives in memory only (`PROVIDERS.md:32`). → A reconnect banner that keeps the provider and model and asks only for the key. Never store it in localStorage.

## 2. Cost, limits and long runs
- **P0 · Limits are sized for one glyph.** Each Send allows 8 tool calls and 120 s (`agent-controller.js:49-50`). The relay allows 90 s per step and 4,096 output tokens (`server/agent/validation.js:9-12`). A 95-glyph set needs hundreds of calls. → A run is a **queue of per-glyph jobs**, each with its own step and time budget. Progress reads "41/95".
- **P0 · The local relay throttles its own runs.** It allows 2 concurrent requests and 30 starts per minute (`relay.js:147`), so a fast run gets 429s from itself. → A pacer in the queue. The UI says "Waiting 12 s", not "Error".
- **P0 · No spend visibility.** Token usage is returned (`server/agent/agent.js:121-124`) but never shown, and spend accounting is deferred (`PROVIDERS.md:77`). → A pre-run estimate (glyphs × typical tokens), a live token meter, and a budget cap that **pauses** the run instead of killing it.
- **P1 · Complex glyphs exceed the output limit** (@ & % $ g 8). This throws a `length` error (`agent-controller.js:184-187`). → Split the glyph's contours across several calls. Mark that glyph "Needs retry"; don't fail the whole run.
- **P1 · Provider rate or credit limit hit mid-run** (`relay.js:96-100`). There are no automatic retries (`agent.js:70`). → Auto-pause with the reason shown and a Resume button. Never retry in a loop that keeps billing.
- **P1 · Attachments are re-sent with every request** (`agent-controller.js:149,166`). Over 95 jobs, images multiply the cost. → Attach an image only to the jobs it maps to.
- **P2 · Laptop sleeps or the tab is backgrounded.** The run loop lives in the browser. → Say "Runs while this tab is open". On wake, mark the in-flight job as interrupted and resume it.

## 3. Agent and user editing at the same time
- **P0 · Both editing the same glyph.** A commit swaps `project.glyphs[id]` for a new object (`native-tools.js:211-213`). If the user has the mouse down or a pen path open, they are still holding the old object, so their stroke is silently lost. If they had already moved something, the agent gets `STALE_REVISION` instead. → **Ownership rule:** a glyph open with an active pointer or tool belongs to the user, and the agent never commits to it. The editor shows a banner, "Agent is drafting this — Take over / Watch". Take over cancels and rolls back that job. The glyph is re-queued only if the user asks.
- **P0 · User edits a different glyph, or just clicks.** The revision fingerprints the whole project save plus the selection and page (`native-tools.js:51-61`). Any click anywhere makes the agent stale. Writes also require the glyph to stay selected (`native-tools.js:68-70, 125-130`). In effect the user can't browse during a run. → Revisions per glyph. The agent targets glyphs by ID and never moves the user's selection or view.
- **P1 · Agent loops on stale reads.** This wastes tokens. → After 2 stale results on one glyph, skip it and re-queue it.
- **P1 · Locked geometry** (`LOCKED_GEOMETRY`, `native-tools.js:447-450`). → Treat locks as user intent. Add a per-glyph "Hold from agent" toggle in the grid. The agent skips held glyphs and says so.
- **P1 · User deletes a glyph, or changes UPM or vertical metrics, mid-run.** → Pause and re-plan: "30 drafts use the old x-height — Rescale / Keep."

## 4. Undo and redo
- **P0 · Numeric inspector edits create no history entry** (`src/panels/cards.js:166`, `docs/agent/INSPECTOR-UNDO-PROPOSAL.md`). Cmd+Z then removes the agent edit before it. → Apply that proposal before shipping mixed manual and agent editing.
- **P0 · Cmd+Z during a run undoes the agent's latest change.** The agent then sees the change and redoes it, so the two fight. The panel's Undo is blocked while a run is active (`agent-controller.js:117`); native undo is not. → Treat that undo as a **rejection**: pause that glyph's job and ask before retrying it.
- **P0 · Undo across glyphs navigates instead of undoing** ("Navigated without undo-ing", `src/project_editor/history.js:146-161`). After a run, Cmd+Z ping-pongs between glyphs. → Named checkpoints in History: "Revert agent run" and "Revert this glyph to before the run".
- **P1 · An agent commit wipes the user's redo stack** (`history.js:43,68`). → Keep redo per glyph, or warn first.
- **P1 · Memory growth.** Each agent edit stores 2 whole-project snapshots (`native-tools.js:208-225, 294-303`). → Merge each glyph job into one history entry.
- **P1 · Inline Undo only works on the latest edit** (`native-tools.js:262`). → Hide the button when it doesn't apply, instead of showing an error.

## 5. Stop, pause, resume and partial completion
- **P0 · Stop mid-glyph leaves half a letter** (for example B with only its outer contour), because every `add_paths` call commits on its own. → Draft each glyph in a candidate and commit once, atomically, or mark it "Incomplete" with a Revert option.
- **P0 · Hiding the window stops the run** (`src/agent/agent-window.js:398-399`, `README.md:16`). This contradicts "watch the font". The original plan specified "Stop or Keep running" (`docs/agent/PLAN.md:12`). → Separate Hide from Stop, and show a run indicator in the app header.
- **P1 · Pause vs Stop.** Pause finishes the current atomic job, then holds. Stop aborts and rolls back the in-flight job (`native-tools.js:158,210,226`). → Two buttons with distinct labels.
- **P1 · Partial set.** → Each grid cell shows one status: Empty / Queued / Drafting / Drafted / Needs review / Approved / Edited by you / Failed (reason) / Held. Add filters and "Continue remaining 54".
- **P1 · The chat keeps only the last 3 text turns** (`agent-controller.js:255-259`), so a resumed run forgets earlier decisions. → A persistent **Font Spec** and run manifest, not chat memory.

## 6. Consistency across glyphs
- **P0 · The agent only gets unitsPerEm** (`native-tools.js:71`). The project already holds x-height, cap height, ascent and descent (`src/project_data/glyphr_studio_project.js:94-98`). → A Font Spec panel: vertical metrics, stem widths, overshoot, monospace or proportional, contrast. Both the agent and the user can edit it, and it draws guides on the canvas.
- **P0 · The agent can't see what it drew.** It works from coordinates only. → A native `render_glyph`/proof tool that returns a raster to vision models. This is a raster of the glyph, not a screenshot of the UI.
- **P0 · Reads are capped at 8 glyphs and 512 points** (`native-tools.js:115-121`, `src/agent/tool-definitions.js:25`). → A native measurement tool that reports, for the whole set in one call, bounds against guides, stems at a given y and overshoot. Results feed a consistency report, and outliers are flagged in the grid.
- **P1 · Overshoot flagged as an error.** Round letters are meant to exceed the baseline and x-height slightly. → The spec defines an overshoot tolerance and the checker respects it.
- **P1 · Building in the wrong order.** → Draw the control glyphs first (H O n o, then a e s). Add an "Approve style to continue" gate before the agent propagates the style.
- **P1 · Style drifts late in the run.** → Check each new glyph against the approved controls.
- **P2 · Stems that measure equal can look unequal** (round vs straight). → Report only; don't auto-fix.

## 7. Broken outlines
- **P0 · Validation only checks bounds** (`native-tools.js:488-511`). The existing quality checks are proximity flags that are off by default (`src/project_editor/quality_checks.js:4-9`). → A native outline check after every write. It looks for degenerate or zero-area contours, self-intersections, wrong winding (via `src/project_data/path.js:172`), overlaps, stray specks, duplicate points, too many points (for example, warn above 150 per glyph), extents outside the metrics and non-integer coordinates. The agent must pass it before a glyph counts as "Drafted". The user sees the same badges, but they don't block manual work.
- **P0 · There is no delete or replace tool** (`README.md:47`). A "redraw" stacks new contours on top of old ones. → `replace_paths`/`delete_paths` tools with the same revision rules, showing before and after.
- **P1 · Every point the agent adds is a corner point** (`native-tools.js:478`). When the user drags a handle with the pen tool, smooth curves kink. → Make points smooth or symmetric when their handles are colinear.
- **P1 · Wrong winding fills counters** (the "o" becomes a blob). → Fill preview plus a one-click "Fix direction".
- **P2 · Missing extrema points.** → Flag them.

## 8. Spacing, kerning and components
- **P1 · Spacing.** → Space against control glyphs and use proof strings (`nnonoHHOHO`). In monospace mode, enforce equal advance widths.
- **P1 · No kerning tool.** Kern groups apply the first match, so overlapping groups conflict silently (`docs/agent/SOURCE-AUDIT.md`, kern_group/text_block rows). → No kerning in v1. Proofs show the pairs that need it (AV To LT).
- **P1 · Components are blocked.** Glyphs that contain components, or are used by others, are rejected (`native-tools.js:145-155, 426-436`). Basic Latin needs none, but an imported font may use them. → A grid tag "Uses component — manual only", plus a "Decompose" option.

## 9. Requests and references
- **P0 · Ambiguous prompts** ("make it friendlier"). → The agent proposes a spec change (rounder terminals, x-height +4%) and previews it on 3–4 sample glyphs. Then a scope picker: Drafted only / All / Include approved. Approved and user-edited glyphs are excluded by default.
- **P1 · "Make 10,000 characters" or "add Arabic".** → State the set limit and the count. Make no partial attempt.
- **P1 · "Make it bold" or "italic".** Weight and italic metadata don't change outlines (`SOURCE-AUDIT.md`). → Explain this, and offer an outline redraw job with a cost estimate.
- **P1 · Importing a huge font** (DotGothic16 has 9,000+ glyphs; see the QoL 001 note in the Obsidian vault). "Open as project" imports everything (`src/agent/font-attachment.js:33`). Every tool call serializes the whole project (`native-tools.js:52`), and projects over 8 MB fail with `PROJECT_TOO_LARGE` (`native-tools.js:137`). → An import picker that defaults to "Basic Latin only (95)".
- **P1 · Licences.** Modified OFL fonts have renaming rules (https://openfontlicense.org/), and tracing a commercial font is a separate risk. → A licence notice on import. The user decides.
- **P1 · Reference images.** Photos may be shot at an angle, hold many letters, or leave case unclear. Limits are 4 MB and 4 files (`src/agent/attachments.js:3-9`). → Ask which characters are in the image. Show the image as a canvas underlay for both the user and the agent. Crop to one character, and send each image only to its mapped jobs.
- **P2 · Prompt injection through imported glyph or path names and font metadata** (`native-tools.js:382,395`, `attachments.js:200`). → Truncate names. Keep the tool scope narrow.

## 10. Autosave, crashes, tabs and offline
- **P0 · Autosave on every commit is synchronous and writes the whole project** (`history.js:107-114`, `src/app/app.js:293-309`). When storage fills up, autosave turns itself off with a single toast (`app.js:268-272`), so crash protection is lost silently mid-run. → A persistent "Not autosaving" status. Autosave once per job during runs. Move to IndexedDB.
- **P0 · Reload or crash mid-run.** The key, chat and plan are gone. The leave-page warning (`app.js:346-353`) doesn't know about runs. → Warn when a run is active. Persist a non-secret run manifest per project ID. On reopen: "Interrupted at 41/95 — Resume / Keep drafts / Discard drafts".
- **P1 · Switching projects aborts the run with `PROJECT_CHANGED` and clears the chat** (`native-tools.js:40-42`, `agent-controller.js:143-148, 213-214`). → Pause the run, bound to its project, and show a header chip saying which project is running.
- **P1 · Same project open in two tabs.** Autosave shares one localStorage key, so the last writer wins (`app.js:240-267`). → Detect it with BroadcastChannel and make the second tab read-only.
- **P1 · Every connection problem shows the same "Cannot reach the agent relay" error** (`agent-controller.js:29`). → Distinguish offline, relay not running (static deploys can't run it, `README.md:7`) and provider down. Manual editing continues; the run pauses.

## 11. Export
- **P0 · Exporting an incomplete set.** → A preflight check: list missing characters, `.notdef`, space advance, failed or unreviewed glyphs, outline-check failures, and vertical metrics that cover every extent (to avoid clipping). "Export draft anyway" is allowed. Export stays the user's action.
- **P1 · The export module holds shared state** (`src/formats_io/otf/font_export.js:19-20`). → Block export while a job is committing.
- **P1 · OTF and TTF handle components and overlaps differently** (`SOURCE-AUDIT.md`, export row). → Load the exported file back into the proof view.

## 12. Privacy and trust
- **P0 · What leaves the machine.** Prompts, images, glyph coordinates, the project name and font metadata go to the provider (`PROVIDERS.md:32`). An unreleased typeface is valuable IP. → A first-run disclosure, and per request "Sending 3 outlines + 1 image to OpenAI". Sending the project name is optional.
- **P1 · Free or "contributor" tiers may have different data terms.** → Label them explicitly and link the terms.

## 13. Accessibility and small screens
- **P1 · Screen reader overload.** The whole conversation is a polite live region (`agent-window.js:139`), so a long run floods it. → Announce one summary per finished glyph, and errors assertively.
- **P1 · Changes are visual only.** → Text status in each grid cell, so colour isn't the only cue. Respect reduced motion for change highlights. Keyboard navigation in the grid, with Enter opening the glyph editor. The agent never takes focus.
- **P1 · Clipped focus rings** (raised in past feedback). → No `overflow:hidden` on containers that hold focusable controls.
- **P1 · Narrow screens.** The app has a 1000px minimum width and fixed 450px panels (`docs/redesign/07-risk-register.md` R6). → Full editor at 1024px and up. Below that, a monitor mode: grid, progress, Stop and Approve. Pen editing is disabled there with the reason stated, and the agent panel docks as a bottom sheet so nothing jumps.