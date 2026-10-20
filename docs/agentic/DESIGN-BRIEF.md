# Noddy, the agentic font editor: design brief

Status: draft for owner review. Written 20 October 2026. Nothing has been built from this yet.
Raw research is in [research/](research/): engine audit, current UX and brand, character sets, prior art, edge cases, three concepts, the judge's synthesis, and the completeness critique.

## The goal

Turn Noddy into a font editor where an AI agent does most of the drawing. It does this by calling Noddy's own native operations, not by clicking the screen. The user watches the whole font change live and can open any letter and edit it by hand with the pen tool. v1 is limited to an English character set so the agent's workload stays bounded.

## The biggest risk, stated first

Frontier language models are bad at drawing letters blind. In Meta's VecGlypher benchmark (CVPR 2026), Claude Sonnet 4.5 drew a recognisable glyph 46.7% of the time and GPT-5 44%. Smaller models scored close to 0. Every product that does well here does two things:

1. **Render and check.** The agent sees an image of what it drew and fixes it.
2. **Build from structure, not from nothing.** Derive letters from approved ones (n → h, m, u; o → c, e; mirrored brackets), use parametric stems and bowls, or start from an existing open-licence font.

So **milestone M0 is a drawing spike**. Using the agent that exists today, have two real models draw n, o, H and O, and record quality, time and cost. If what comes out is unusable, the design changes to "agent refines and propagates what you or a base font started", before anything big is built.

## Character set

- **The name for "English letters plus keyboard symbols"** is **Basic Latin**: the Unicode block U+0020–007E, also called printable ASCII. It has 95 characters. Noddy already defines it (`src/lib/unicode/unicode_blocks_0_bmp.js:3`).
- **The industry tier for "English plus essential typography"** is Google's **GF Latin Kernel**: **116 characters**, plus `.notdef`. It is Basic Latin plus curly quotes, en/em dash, ellipsis, bullet, middle dot, × ÷ −, ¢ £ ¥ €, © ® ™ °, and NBSP. It has no accented letters. The list was checked against `googlefonts/glyphsets` `GF_Latin_Kernel.nam`.
- **Next tier (v2):** GF Latin Core, which covers Western European languages. Accents would be built from components.
- **Engine catch:** export only includes glyphs inside enabled character ranges. Kernel's 21 non-ASCII characters are spread over five other Unicode blocks, so the set has to be stored as single-codepoint custom ranges, plus a round-trip export test.

**Drawing order the agent follows** (⛳ = it stops for your approval):
0. Spec: metrics, overshoot, stem widths ⛳
1. Control glyphs **n o H O** ⛳ (approve the style)
2. Lowercase, in families: h m u l i j r → b d p q c e → a g s f t → v w y x k z, then a spacing proof
3. Capitals: I L E F T → C G D Q → B P R J U S → V A W X Y K N M Z
4. Figures (tabular), then punctuation, brackets (the closing forms are mirrors), math, symbols
5. space, NBSP, `.notdef`, then a global spacing pass. v1 only reports kerning pairs; it doesn't set them.

## Recommended direction: "Galley"

Three concepts were generated and scored (details in `research/concepts.md`, scores in `research/synthesis.md`):

| Concept | Idea | Score |
|---|---|---|
| **A · Galley** (specimen-first) | The font in use plus the full set grid is the main surface. Clicking a letter opens the editor. | **23/25** |
| B · Bench (studio-first) | A classic 3-pane pro editor (Glyphs/Cursor) with the agent docked | 20 |
| C · Runbook (plan-first) | The agent's plan is the main surface | 17: drifts toward the "AI swarm" feel |

The base is **Galley**. Its editor and Connect card come from B, and its plan-as-checklist from C, collapsed to one line by default.

### Layout (designed at 1280×800)
- **Header:** Noddy · project · Set chip ("Latin Kernel · 61/116") · Run chip, which keeps a fixed slot so the header never shifts · Export.
- **Spec line:** UPM · x-height · cap · ascender/descender · overshoot · stems. Click a value to edit it. Agent proposals open in a popover anchored to the value, never inline. UPM is read-only in v1.
- **Proof band:** the live font set in type. Presets are All sets · Spacing · Text · Waterfall. A Follow line shows the active glyph in context (`nnbnn oobo HbH`). A Space row shows LSB · advance · RSB, editable.
- **Set grid:** groups with counters ("a–z 18/26"). Fixed cells, each with one short status word plus an icon. Missing glyphs are dashed ghosts that keep their width.
- **Agent pane, docked right:** model row, a one-line run card, the plan (collapsed), receipts grouped by glyph, and a composer that shows what will be sent.
- **Glyph editor:** opens in the grid's exact box, so nothing reflows. It uses the existing edit canvas, the tool rail and a slim, collapsible inspector. While it is open, the proof band shrinks to the one-line Follow line (a fixed-height swap). Clicking a letter in the proof switches the editor to that glyph. Empty glyphs open with the Pen selected.
- **760–1099px:** the agent pane becomes a drawer. **Under 760px:** monitor mode. The pen is disabled there and the screen says why.

### Cell statuses
Empty · Queued · Drafting · Draft · Kept · Yours · Held · Failed. There is one primary word, an icon tag for extras (derived, uses component, outside set), and the reason in a tooltip. Colour never carries meaning alone.

### How you and the agent share the font
- The agent edits glyphs by ID. It never moves your selection, view or focus.
- **A glyph open in your editor is yours.** The agent skips it and comes back later.
- If you open a glyph the agent is drawing, you see "Agent is drafting g · Watch · Take over".
- **"Hand to agent"** gives an open glyph to the agent. The editor becomes read-only, with "Agent editing · Take back".
- A glyph counts as yours only if its outline actually changed. Spacing ownership is tracked separately from outline ownership.
- Each agent write is atomic per glyph, so the proof only ever shows whole letters.

### Undo
- There is one shared history. Each agent glyph job is one entry; each manual gesture or inspector edit is one entry (this needs the inspector-undo fix).
- **During a run, Cmd+Z undoes only your own last change.** Agent work is reverted from the glyph cell or its receipt.
- Named checkpoints: Before run · Spec approved · Controls approved · Before bolder.
- "Revert glyph" is a **new forward commit**, not time travel. Today's history stores whole-project snapshots, so jumping back would wipe later glyphs. Real per-glyph history is a separate protected milestone.
- **Pause** finishes the current glyph. **Stop** discards the unfinished draft. Esc and hiding the pane never stop a run.

### Small asks stay small
"Fix the g" has no plan and no gate. The agent does it and you get a receipt. Plans and gates only appear for whole-set work.

### Global changes ("make it bolder")
The agent explains that the weight setting is only metadata and the outlines have to be redrawn. It shows a proposal line rendered from uncommitted drafts and asks for a scope: drafts only, or kept glyphs too, or yours too (the last two are off by default). It saves a "Before bolder" checkpoint, then runs one job per glyph.

### Onboarding and trust
- A Connect card offers curated models with Tools / Vision / Free / Paid badges. The key stays in memory only.
- **Check connection** says it makes a tiny billed call, then probes tool calling.
- Before each send, a line shows what will leave your machine ("Will send: brief + 1 image + 4 outlines → OpenAI").
- Every turn ends with a receipt built from what Noddy actually changed. If the model claims edits that didn't happen, the receipt says "0 edits applied".
- Manual drawing works with no model connected.

### New font has three starts
**Start with agent** · **Draw myself** · **Start from a font file** (import an existing font, cut it down to the set, show a licence notice).

## Prototype plan

A clickable HTML prototype, not wired to the engine but measured against the running app:

- Uses Noddy's real tokens (`src/common/colors.css`), Google Sans Flex, Material Symbols Rounded and the 4px grid.
- Glyphs are real outlines (an OFL sans). Agent drafts are drawn deliberately rough until the M0 spike shows what real output looks like.
- A state menu jumps between states. It is shown at 1280×800, 1024×768 and phone width.

| # | Screen | Interactive bits |
|---|---|---|
| 1 | New font: name, set picker, three starts | pick set, continue |
| 2 | Empty galley + Connect card | model pick, key, Check connection (ok / wrong key / no tool calling) |
| 3 | **Draw by hand with no agent**: place points, drag handles, watch the proof update | working pen on a simple glyph |
| 4 | Brief + reference image | "Will send" line, vision warning |
| 5 | Plan + spec proposal | accept spec, strike/hold glyphs, "I'll draw this", Run |
| 6 | Control gate: n o H O drafted | Approve / Ask for changes / Edit by hand |
| 7 | Mid-run: cells change state, proof updates per glyph, receipts | Pause, Stop, hide pane (run continues) |
| 8 | Editor in place on a free glyph | tools, previous/next, click a proof letter to retarget, close → Yours |
| 9 | Take over / Hand to agent | Watch, Take over, Take back |
| 10 | "Fix the g": single ask, receipt only | — |
| 11 | "Make it bolder": proposal, scope, checkpoint | change scope, apply |
| 12 | Export preflight | open a missing glyph, export anyway |

Edge-case states for the state menu: out-of-set request, budget cap paused, provider rate limit, interrupted run (resume / keep / discard), relay offline vs provider down, "0 edits applied" receipt, outline check failed, image sent to a model without vision, key lost after reload, Not autosaving, two tabs open, Outside-set group, space width bar, uses-component tag, drawer and monitor mode, keyboard focus on an edge cell.

## Native agent tools to add (summary)

- **P0:**
  - extend `get_context`
  - `get_font_spec` / `propose_font_spec`
  - `get_set_status`
  - `create_glyph`
  - `begin_glyph` / `submit_glyph` (atomic per glyph)
  - `replace_paths` / `delete_paths`
  - extend `transform_paths` (scale, rotate, skew, flip)
  - `add_svg_path`
  - `render_glyphs` / `render_text`, so the agent can see its work
  - `check_outlines`
- **P1:**
  - `measure_set`
  - `edit_points`
  - `derive_glyph`
  - `boolean_paths`
  - `compile_check`
  - multi-glyph `set_spacing`
  - `update_plan` / `write_glyph_note`
- **P2:**
  - `offset_paths`
  - `report_kerning_pairs`
- **v2:** components and kerning writes.
- **Never given to the agent:** changing the set, deleting glyphs, checkpoints, gates, export.

Engine mappings with file:line references are in `research/synthesis.md` §5 and `research/engine.md`.

## Roadmap after the prototype is approved

Each milestone is one focused session or PR and ends with a verification packet. ⚠ means it touches protected engine code and needs explicit sign-off (AGENTS.md §3).

| # | Milestone | Done when |
|---|---|---|
| M0 | **Drawing spike** (can run alongside the prototype) | two real models attempt n o H O; quality, time and cost recorded |
| M1 | Groundwork ⚠: inspector-undo fix, autosave status, leave-page warning, Hide/Esc don't stop runs | tests pass |
| M2 | Real model proven: curated models, Check connection, receipts from real results, clear errors | a real provider edits a glyph end to end |
| M3 | Character sets: verified Kernel list as custom ranges, grid groups and counters, ghosts, Set picker | export round-trip includes all 116 |
| M4 | Live everywhere: `itemChanged{id}`, tiles re-fetch, proof band and Follow line | proof updates within 150ms of any edit |
| M5 | Galley shell (redesign track): header, spec line, docked pane, responsive tiers | layout measured at 3 sizes, no jumps |
| M6 | Editor in place ⚠: canvas hosted in the grid box, keyboard scoping, slim inspector | pen works in place, focus is never clipped |
| M7 | Agent eyes (read-only): spec, set status, render, measure, outline check, compile check | the agent can see and judge its own glyph |
| M8 | Atomic glyph writes ⚠ + ownership + Take over + mutation log | the agent draws n and o, and you take over o mid-draft cleanly |
| M9 | Shape tools: points, derive, boolean, multi-glyph spacing | derive h from n works |
| M10 | Runs: plan, queue, pacing, Pause/Stop, cost meter and cap, gates, reference images | a full lowercase run with a gate |
| M11 | Review and checkpoints ⚠: Keep/Revert, before/after onion skin, named checkpoints | revert a run without losing your glyphs |
| M12 | Resilience: resume an interrupted run, two-tab guard | reload mid-run recovers |
| M13 | Export preflight | an exported font opens in the proof |

### Git workflow
- `main` stays stable.
- The current agent work (`codex/native-agent-plan`) gets pushed to GitHub as the base for this track.
- Each milestone gets its own branch and pull request. You review the screenshots or prototype, then it merges.
- The old phase worktrees (`noddy-a` … `noddy-n`) are already merged and can be removed to cut the clutter. Only with your OK.

## Owner decisions (20 Oct 2026)

1. **Set: Latin Kernel (116).** Default views show only **letters and figures**. Punctuation and symbols live behind a filter or group switch, so the first screen stays simple. This is progressive disclosure. The prototype must follow UX laws and heuristics (Hick's law, progressive disclosure, Jakob's law, recognition over recall, error prevention, and so on) at the flow level, not only in the visuals.
2. **Agent letters stay "Draft" until you press Keep**, with Keep all per group.
3. **First target: a simple sans.**

## Still open

- Where the agent stops: only at the spec and the control glyphs, or also after lowercase and after capitals? And what spend cap per font?
- Should outside agents (Claude Code / OpenCode over MCP) also be able to drive Noddy, or only the built-in agent pane? (The vault raises "MCP first or CLI first".)
- Start order: prototype and drawing test.
