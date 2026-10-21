# UI reset (2026-10-21): one page, the agent does the rest

_Read this before starting M5 or any later milestone. It records what the owner found after the M1–M4 cloud run, what changed, and the rules that follow from it. PR: `feat/ui-reset` into `dev`._

## Why

The owner opened the M1–M4 build locally and found the UI had drifted from the product: a page menu exposing the old Glyphr Studio pages, controls floating over the rendered font, a context strip that highlighted the wrong letters, mismatched control heights, a duplicate "Panel" button, and a legacy blue scrollbar. Underneath was a philosophy problem: the build was becoming "Glyphr Studio with an agent on top". Noddy is the opposite: **a very simple editor where you click one thing to edit it, and ask the agent for everything else.**

## The decisions (binding, mirrored in [PRODUCT.md](PRODUCT.md))

1. **One page.** The user sees the **Workspace** (specimen card + Letters & figures grid) and, inside it, the **focus editor** for one letter. Nothing else.
2. **The agent owns the rest.** Kerning, ligatures, components, font metrics, project settings, global actions, live preview: these are agent tools (M6+), never pages the user visits. Never navigate the user to an old page from agent UI or from a card.
3. **The old pages are hidden, not deleted.** Overview, Characters (the old page; focus mode on it stays), Ligatures, Components, Kerning, Live preview, Global actions, Settings, Help and About remain in the code because agent tools and tests use them. They are reachable only with `?legacy` in the URL or in dev mode: `src/app/legacy_pages.js` + the guard at the top of `Navigator.navigate()` (`src/project_editor/navigator.js`). Anything that still sets `nav.page = 'Overview'` (importers in `formats_io/`, legacy cards) lands on the Workspace.
4. **Chrome never covers the font.** Controls sit in their own rows. Only the tool pill and the inspector float, and only in focus mode.
5. **One control per job.** The minimized agent pill restores the panel, so the compact-tier top-bar "Panel" button is gone. No page menu. The agent panel still has only a minimize button.
6. **Every chrome colour comes from the tokens** in `src/common/colors.css`, scrollbars included.

## What changed, file by file

| Area | Before | After | Files |
|---|---|---|---|
| Workspace shell | "PAGE / Workspace" dropdown listing all old pages | No page menu; the specimen card is the first element | `src/pages/workspace.js`, `workspace.css` |
| Navigation | Any `nav.page` was shown | `resolveVisiblePage()` guard: hidden pages → Workspace unless `?legacy` / dev mode; focus mode on Characters always allowed | `src/app/legacy_pages.js` (new), `src/project_editor/navigator.js` |
| Compact tier (≤1099px) | Top-bar "Panel" button duplicated the pill | Removed; pill, minimize, Esc and scrim remain | `src/panels/panels.js`, `src/app/top_bar.js`, `src/app/app.css` |
| Scrolling | Legacy blue-grey `::-webkit-scrollbar`; two nested scroll containers | Thin token-coloured thumb, transparent track, `scrollbar-color` for Firefox; `.workspace__page` is the one scroller (`#app__main-content` is `overflow: hidden` for the Workspace) | `src/common/resets.css`, `src/app/app.css` |
| Specimen card | Pill and slider absolutely positioned over the text; "Hamburg" at 160 px; fixed 240 px | Header row (`.specimen__bar`) above the stage; default text is the pangram at 72 px/em (two lines at 1440); Text mode wraps by words; card is min 240 px and grows to `min(560px, 50vh)`; past the cap the size steps down (8 px) until the wrapped text fits; re-wraps on width change | `src/controls/specimen-card/specimen_card.js`, `specimen-card.css` |
| Focus-mode context strip | Every copy of the edited letter was peach (editing H lit all five H's) | Only the middle slot of each group is peach (`contextSlotsFor`) | `src/pages/focus_context_strip.js` |
| Inspector fields | `<input-number>` with 32 px stepper arrows inside 36 px fields; Keep/Revert 32 px | `hide-arrows` attribute on the shared control (Figma flow-06 shows plain fields; ArrowUp/Down still step); arrows elsewhere stretch to the host height; Keep/Revert 36 px | `src/pages/focus_inspector.js`, `focus-mode.css`, `src/controls/input-number/input-number.css` |
| Strip vs pill | Could overlap at narrow widths | Strip max-width leaves room for the minimized pill | `src/pages/focus-mode.css` |

Tests: `src/project_editor/tests/navigator.test.js` (hidden-page guard), `src/pages/workspace.test.js`, `src/controls/specimen-card/specimen_card.test.js` (wrap, header row, pangram), `src/pages/focus_mode.test.js` (slots, `hide-arrows`, 36 px geometry), `src/app/tests/top_bar.test.js` (no toggle, no menus slot).

Screenshots: [screenshots/ui-reset/](screenshots/ui-reset/) (Workspace 1440, Workspace at max size, focus mode on H, 1024 minimized).

## Skills added for UI work

Vendored into `.claude/skills/` (MIT, licence files next to them), each with a **Noddy addendum** at the end (Figma + PRODUCT.md win, tokens only, AGENTS.md §1 bans stay):

- `design-taste-frontend` (TASTE v2.1, Leonxlnx/taste-skill): art direction, the tells of generated UI, the look-and-fix loop. Use its `references/app-screens.md` route; Noddy is an app screen, not a landing page.
- `refactoring-ui` (s0xDk/refactoring-ui-skill): constrained spacing/type/colour/shadow scales; `references/diagnose.md` when fixing existing UI.
- `responsive-design` (already vendored; the old ban is lifted): layout tiers 1440 / 1024 drawer / phone.

The developer, UI and QA role files (`.claude/agents/*.md`) and [WORKFLOW.md](WORKFLOW.md) say when to load them.

## PR and QA rules from here on (also in WORKFLOW.md)

The M1–M4 run opened 21 PRs; six failed QA at least once (the shell and focus mode three rounds each). Every round re-ran `npm ci`, the full suite, the build and a headless-browser matrix, and nearly every FAIL was something only a real browser shows: legacy `button` resets beating hover and focus styles, Tab order trapped by the canvas, layout overlaps, zoom resets. So:

1. **One PR per milestone.** Logical commits inside it. Only protected-area changes (AGENTS.md §3) get their own PR.
2. **The developer looks at the work in a browser before opening the PR**: hover, focus rings, keyboard (Tab, Enter, Esc, arrows), undo/redo and layout at 1440 and 1024, screenshots in the PR body.
3. **QA gets at most two rounds**, one consolidated list per round; the re-QA checks only the listed items plus lint, tests and build.

## What M5–M9 must respect

- **M5 Start screen:** every start ("Start with agent", "Draw myself", "From a font file") lands on the Workspace. No page menu, no Overview. The font-file import still sets `nav.page = 'Overview'` inside protected `formats_io/` code; the navigator guard already turns that into the Workspace, so do not touch the importer for this.
- **M6 Agent tools:** metrics, kerning, components and settings are read and written through tools. Do not surface the old pages as "advanced mode".
- **M7 Runs / M8 Ripple:** all review UI lives in the agent panel and the Workspace tiles (Keep / Revert / Retry), never on an old page.
- **M9 Export:** stays in the top bar's Export menu (the preflight sheet is a modal, which may have a close button).
- Specimen text is the pangram by default; an agent tool may set `specimen.text` later. Do not add a text input to the card unless the owner asks.
- New chrome: own row, tokens only, equal sibling heights, one control per job, nothing over rendered glyphs.

## Debugging the old pages

Open `http://localhost:53NN/?legacy` (or set `devMode: true` in `src/app/app_config.json`, which the build rewrites, so never commit it). The old pages then show their own nav button again. Without the flag, `editor.nav.page = 'Overview'; editor.navigate()` from the console lands on the Workspace.
