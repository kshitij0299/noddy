# Noddy UX and brand inventory (branch `codex/native-agent-plan`)

Paths are relative to `/Users/kshitij/Documents/cursor shit/font agent/noddy-agent-plan` unless marked as vault notes. The vault is `/Users/kshitij/Documents/Obsidian Vault/Noddy`.

## 1. Pages, views and panels

**App shell**
- Top bar (`src/app/menu.js:32-73`) holds:
  - the logo: the Glyphr SVG wordmark is hidden and replaced by the text "Noddy" through CSS (`src/app/app.css:53-60`)
  - three menus: **File** (save, save a copy, export OTF/TTF/WOFF/WOFF2/SVG), **Projects** (switch between two projects, cross-project actions) and **Help**
  - a feedback email link
  - the **Agent** toggle (`menu.js:70`)
- There is no router. Every page or panel change clears the whole wrapper and rebuilds it (`src/project_editor/navigator.js:112-114`).
- Navigation is three stacked dropdown buttons in the left column: **PAGE / EDITING / PANEL** (`src/pages/characters.js:37-47`, dropdown builder at `navigator.js:247-317`).

**Pages** (table of contents at `navigator.js:33-90`, grouped as "Design glyphs / Refine / Settings & more")

| View | What it does |
|---|---|
| Welcome / Open project (`src/app/open_project.js:35-91`) | Left: hero logo, version, GPL blurb (still links to glyphrstudio.com). Right: tabs **New** (default) / **Load** / **Restore** (auto-saves) / **Examples** (Oblegg, Simple v2). Drag-and-drop works anywhere. New tab = project name + "Create a new font from scratch", plus "Start from scratch with an agent" (`:167-195`). |
| Overview (`src/pages/overview.js`) | Left cards: Project info (name, family, style, glyph count, UPM, ascent, descent) with "Edit project and font info", a Welcome card (Glyphr blog/tutorial links) and a Contribute card. Right: 64px preview of fixed text "Aa Bb Cc Xx Yy Zz" (`:56`), then a tile grid of all items. |
| Characters (`src/pages/characters.js`) | Main editor: panel column, tool rail, `edit-canvas`, zoom area. Panels (`navigator.js:375-385`): Attributes, Layers, Context characters, Transforms, History, Guides, Character info, Quality checks. **Only one panel shows at a time.** |
| Ligatures / Components | Same editor with 6 panels. Empty state, then a "Create a new ligature" dialog that also accepts comma lists (`src/pages/ligatures.js:386-411`). |
| Kerning (`src/pages/kerning.js`) | Class-based kern groups only: Create / Find letter pair / Delete dialogs, a kern tool, and 2 panels (Attributes, History). |
| Live preview (`src/pages/live_preview.js`) | Options panel plus a renderer (canvas, or a real OTF/TTF build). Can also pop out as a separate window from the canvas toolbar (`src/edit_canvas/tools/tools.js:240`). |
| Global actions | Filter plus 13 batch cards: Move, Scale H/V, Resize, Skew, Side bearings, Flatten, Round, Remove, Monospace, All caps, Diacritics ×2 (`src/pages/global_actions.js:117-132`). |
| Settings (`src/pages/settings.js:41-43`) | Tabs: **Project** (character ranges: enable, hide, add from Unicode), **Font** (UPM, ascent, descent, cap height, x-height, names), **App** (autosave, preview text, chooser page size). |
| Import & export | Listed in the contents but has no page (`pageMaker: false`). Export lives only in the File menu. |
| Help, About, Cross-project actions | Content pages. |

**Edit tools** (`tools.js:42-47`): New rectangle, New oval, New path (pen), Add path point, Path edit, Resize. View tools: fill/outline toggle, pan, 1:1, fit em, zoom in/out, live-preview pop-out.

**Character set:** a new project defaults to the Unicode **Basic Latin** block (U+0020–U+007F) (`src/project_data/glyphr_studio_project.js:170-171`). Its 95 printable characters are commonly called "printable ASCII": 26 capitals, 26 lowercase, 10 figures, and space plus 32 punctuation/symbol characters. That is the technical name for the set you asked about.

## 2. Creating a font from scratch today

1. On the Welcome page, the New tab: type a name and click "Create a new font from scratch" (`open_project.js:603`). You land on Overview.
2. Click the **A** tile. That opens Characters with the Attributes panel. The glyph is created silently the first time it is opened (`src/project_editor/project_editor.js:251-258`).
3. Draw with Pen (H/W), Path edit (B/P), Add point (U/E), Rectangle (M/R) or Oval (O/Q). Set the advance width and side bearings in the Attributes card, which has an auto-fit option.
4. Go to the next character by one of:
   - the EDITING dropdown, which opens an 80%-width tile overlay (`navigator.js:271-277`)
   - Ctrl+. or Ctrl+/
   - the prev/next card in Attributes
5. Repeat about 95 times.
6. Check your work by switching to the Live preview page or popping out a window. The Context characters panel shows neighbouring letters on the canvas.
7. Set x-height and cap height under Settings → Font. Kern under Kerning → "Create a new kern group" dialog.
8. Use File → Export OTF, and Ctrl+S to download a `.gs2` file. Autosave goes to browser storage only.

**Where it hurts**
- Nearly 100 separate visits to glyphs, and every navigation rebuilds the whole page, so layout flickers and jumps.
- One panel at a time, chosen from a dropdown.
- The preview lives somewhere else (another page or a pop-out window). There are no spacing strings or proof text beside the canvas.
- Font metrics are buried in Settings.
- Nothing shows progress: no "done / empty / needs review" per glyph.
- No reference-image or tracing layer.
- Kerning means filling in dialogs.
- Quality checks are only four point-proximity checkboxes (`src/panels/quality_checks.js:31-36`).
- Fonts with 9,000+ glyphs load slowly. The vault calls this the "DotGothic case".

## 3. The current agent window

**Ways in**
- The header **Agent** toggle (`src/agent/agent-window.js:431-441`).
- The welcome page's "Start from scratch with an agent" reveals a composer. On submit it creates the project, selects `glyph-0x41`, goes to Characters, then opens the window and sends automatically (`open_project.js:171-180`).

**Layout**
- A floating panel attached to the page body, initially right 20px / top 64px, 380×560, user-resizable (`src/agent/agent-window.css:14-33`). It sits on top of the canvas.
- Header: drag handle ⠿ (arrow keys move it 20px), "Agent", "Connect model" (shows the model name once connected), and × (hides the window and stops the run).
- Context line under the header: "Current glyph only · {project} · glyph-0x41". It shows the raw ID, not the character (`:174`).

**States**
- Hidden
- Empty: "Edit the current glyph: change spacing, move selected paths, or draw a simple outline…" (`:145`)
- Not connected: the connect form opens, the button reads "Connect and send", and the draft is kept (`:259-265`)
- Connection form: provider (OpenAI / OpenCode Zen), free-text model ID, API key, and an Advanced protocol choice (Automatic / Responses / Chat Completions / Anthropic Messages)
- Running: Send turns into Stop and other controls are disabled
- Tool rows: "Using set spacing…", then "✓ set spacing" or an error
- Error, finished
- Limit reached: 8 tool calls, 120 seconds, 12k characters (`src/agent/agent-controller.js:49-50, 133`)
- Opening an attached font as a project
- Footer: "Undo last agent edit" and "Clear chat". Attachments show as chips; a font chip says "metadata only" and has "Open as project".

**Limits**
- One selected glyph per request. Sending from Overview is blocked.
- Only 5 tools (`src/agent/tool-definitions.js`): get_context, read_glyphs (up to 8), set_spacing, transform_paths (translate only), add_paths (up to 16 contours of up to 128 points).
- Missing: editing or deleting existing points, scale/rotate, metrics, kerning, components, any font-wide action, export.
- **The agent cannot see what it draws.** There is no render or proof tool; it only gets numbers back.
- No plan or queue across glyphs, no before/after, no accept or reject step.
- Chat and API key are lost on reload. Messages are plain text, not markdown.

**Known issues**
- A numeric value typed into the inspector does not create its own undo step. Undo then removes the previous *agent* edit instead. A fix is written but not applied, waiting for approval (`docs/agent/README.md`, `INSPECTOR-UNDO-PROPOSAL.md`).
- Escape anywhere in the window hides it and stops the run (`agent-window.js:371-373`). The plan's "Stop or Keep running" choice was never built (`docs/agent/PLAN.md`).
- No real provider or model call has been tested. The relay only accepts local connections.
- The window uses its own 12px radius, 13px type and a hard-coded shadow instead of the shared tokens.

## 4. Brand system

**Colour tokens** (`src/common/colors.css:8-57`; OKLCH values, hex approximated)

| Token | Light | Dark |
|---|---|---|
| `--background` / `--card` | #ffffff | #1a1412 |
| `--foreground` / `--primary-foreground` | #3c1d0f warm brown | #fdf7f4 |
| `--primary` / `--ring` (peach, **same in both themes**) | #ffad6c | #ffad6c |
| `--secondary` | #f5f0ee | #261d1a |
| `--muted` | #f5f5f5 | #2a211e |
| `--muted-foreground` | #8e7970 | #a6968e |
| `--border` | #e6ded9 | #261d1a |
| `--destructive` | #e53e3e | #ff5a5a |

- The manifest theme colour is #ffad6c.
- Legacy blue is still in use: `--accent-color: var(--blue-l70)` (`colors.css:190`) and the nav dropdown icons (`navigator.js:412`).

**Type**
- Google Sans Flex (variable) for the interface.
- Headings h1–h3 use the same font with rounding (ROND) 60 at weight 700 (h1 32→36, h2 24, h3 20).
- Google Sans Code with tabular figures for numbers and code.
- Material Symbols Rounded icons.
- Labels 13/500 in sentence case. Only "meta" labels are uppercase, 11/600.

**Shape and spacing**
- Radius: `--radius` 0.45rem (about 7px), `--radius-sm` ×0.6, `--radius-full` 999px.
- Shadows: xs, sm, md, all subtle.
- Spacing on a 4px grid.

**Logos**
- `noddy-logo-big.svg`: hero, 420px; actually a PNG wrapped in SVG.
- `noddy-icon.svg`: favicon.
- `noddy-icon-bg.svg`.
- `logo-icon-two-color.svg`: the only true vector, but in the old Glyphr colours (#004b70 + #9df). Kept as the reference for redrawing the marks as vectors.
- Glyphr wordmarks are archived.
- Logos must never appear inside editing surfaces (`docs/redesign/10-design-system-contract.md` §6).

**Tone:** "warm, precise, yours"; "friendly font editor". Plain language, sentence case.

**Rules on record**
- **Borrow-smart, infection-proof** (`AGENTS.md` §3b): borrow surface only (button/card look, copy, spacing feel), never structure. Rebuild instead of pasting, approve each item individually, log it. Permanently banned: grids `272px 44px 1fr`, `84/108px 1fr`, the 72px rail, 900/560px breakpoints, drawer transforms, `overflow-x:clip`, `scrollbar-gutter`, `contain:layout`, dot-grid and glow wrappers.
- **Protected areas** (`AGENTS.md` §3): `project_data`, `formats_io`, canvas events, `history.js`, serialization, undo, shortcuts and pointer behaviour. Changing these needs a domain rationale, tests and your explicit approval.
- **Hover is paint-only**: tint, never a layout shift (`docs/redesign/CHANGELOG.md:37,65,68`).
- Buttons are either **fixed size or fill** the container width.
- **Equal-height cards**; the same pill radius whether selected or not.
- Focus rings get breathing room and are never clipped. Box edges line up, and the user measures them (`docs/redesign/15-session-handoff.md:34`; CHANGELOG nav 460/460 fix).
- Interface fonts must never override glyph or preview rendering (contract 11).
- Contrast meets WCAG AA. Touch targets at least 24px.
- Layout tiers: T1 ≥1100, T2 760–1099 (drawer), T3 <760 (sheet), short height <620 (`docs/redesign/12-responsive-contract.md`).
- One milestone at a time, then a verification packet and a stop until approval (`AGENTS.md` §5).

## 5. User's previously stated ideas and preferences

- Cursor analogy, "VS Code → Cursor | Glyphr Studio → Noddy". GPL means the core stays open source (vault: `Noddy — Starting From Glyphr Studio.md`).
- Agent build order: "I would not start with generation. I would start with inspection." Then read-only → guarded writes → generation. "If a command cannot undo, it does not ship." "Log every agent mutation…" (vault: `Noddy agent track and QoL track.md`).
- First quality-of-life item, the large-import picker: "loads all 9000 plus glyphs at once and the UI crawls. New behavior asks first." Above 2,000 glyphs, open a picker grouped by Unicode block with live counts, import in chunks with cancel, cancel makes zero changes, and one undo removes the import (same note).
- Open question left there: MCP first or CLI first.
- From `docs/agent/PLAN.md`: "one agent session, with no swarm"; "No separate review screen"; switching glyphs mid-run must not retarget edits; ask for confirmation only when scope expands or something is deleted or overwritten.
- From the session handoff profile: "Plain language, short packets, no jargon"; treat their screenshots as first-class evidence; tell them when to hard-refresh.
- Never use `Colors, Fonts & Usage (Live).md` as a template; it records "fucked responsive/layout hacks" (vault Visual Vibes note). `.pen` files were "user-confirmed useless" (`10-design-system-contract.md`).
- Input-number spinner: they picked Option A (equal halves). "Chunkier chevrons" was offered as a follow-up (vault: `assets/spinner-redesign.md`).

## 6. Top UX problems an agentic redesign should fix

1. **No font-level view.** The agent works on one glyph and has no plan or progress. Make the 95-character Basic Latin set the home screen, with a status per glyph (empty / drafted / needs review / approved / locked).
2. **The agent can't see.** It has no render or proof tool. The UI and the agent should share one live proof: all sets (capitals, lowercase, figures, punctuation) plus spacing strings such as HOHOH / nonon.
3. **The floating chat covers the work.** Esc or hide kills a run. It needs a docked pane like Cursor's, runs that keep going in the background, and a readable activity timeline instead of "✓ set spacing".
4. **No review of changes.** There is no before/after, no per-glyph accept or revert, undo covers only the latest edit, and the inspector undo bug is still open. Changes need to be marked as agent or manual, with history per glyph.
5. **Manual editing is a separate place.** Pen tools exist only on the Characters page. Clicking any glyph in the grid or proof should open the editor right there. The agent should pause or rebase on that glyph; stale-revision rejection already exists to support this.
6. **Navigation is heavy.** Three levels of dropdowns, one panel at a time, and a full page rebuild on every move (`navigator.js:112`) cause layout jumps.
7. **Font-wide settings are buried and the agent can't reach them.** Metrics and guidelines (x-height, cap height, overshoot) sit in Settings → Font, and no agent tool can change them.
8. **Connecting a model is clumsy.** Model ID is free text, the key is lost on reload, protocol jargon is shown, and the context line says `glyph-0x41` instead of the character.
9. **Leftover branding.** Glyphr links and labels remain (`menu.js:244, 284`, welcome blurb, Overview welcome card), along with legacy blue nav icons and agent-window styles that ignore the tokens.
10. **Kerning, quality checks and export are thin or hidden.** Kerning is class groups in dialogs, quality checks are four checkboxes, and export is a menu item. All three should be visible stages that both the agent and the user can run.