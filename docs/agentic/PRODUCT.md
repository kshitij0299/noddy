# Noddy: the agentic font editor (product decisions)

These are the owner's decisions so far (owner: a designer, Figma power user; not a coder). If a decision is not written here or in the linked specs, ask in the PR. Do not invent product direction.

## What Noddy is

- A browser font editor, forked from Glyphr Studio 2, being turned into an **agentic font editor**.
- An AI agent does much of the drawing by calling **native editor operations**. It never uses computer use or clicks the screen.
- The user watches the font change live and can open any letter and edit it by hand with the pen tool.
- **The font is the hero.** The UI is minimal and visual, never text-heavy.

## Non-negotiable product decisions

| Topic | Decision |
|---|---|
| Visual language | The **pre-Codex Noddy look** (`noddy/main` @ f2bb1bc9): Google Sans Flex, headings Bold with **ROND 60** (rounded), peach/brown OKLCH tokens, pill tabs, soft shadows only on floating things. Icons are **Material Symbols Rounded, outlined (FILL 0)**. The owner explicitly decided to keep outlined. |
| Codex UI | The Codex floating agent window and welcome composer are **rejected UI**. Keep the plumbing (`src/agent/native-tools.js`, `tool-definitions.js`, controller, `server/agent/*` relay) and replace the UI. |
| Layout | Desktop 1440×900 reference: a top bar, then a **specimen card** (240px tall) plus a **Letters & figures grid** in the left column, and the **agent as a full-height right panel** (from just under the top bar to 24px above the bottom, about 384px wide). When minimized, the agent becomes a **pill** bottom-right and the left column goes full width. The agent window is **never** a small website-chatbot box. |
| Buttons | **Every control must have a reason to exist.** The agent panel has **only a minimize** button (no close). Modals may close. |
| Character set | **GF Latin Kernel**: 116 characters plus `.notdef`. The default views show **letters and figures (62)**; punctuation, symbols and spaces are behind the "All 116" switch. |
| Agent output | Everything the agent draws is a **Draft until the user presses Keep** (Keep all per group). Glyphs the user edited by hand are **Yours**, and the agent must not touch them without explicit consent. |
| Statuses | Empty · Queued · Drafting · Draft · Kept · Yours · Failed. Show them as shape plus colour, never colour alone. |
| Runs | The agent stops for approval after the spec and after the control glyphs **n o H O** ("Approve the style"). Small asks ("fix the g") get no plan and no gate, only a receipt. Esc, minimize and hide **never stop** a run. Pause finishes the current glyph; Stop asks inline. |
| Undo | One shared history. During a run, Cmd+Z undoes only the user's own last change. Agent work is reverted from its cell or receipt. |
| First font style | A simple sans. |
| Models | API-key models (OpenAI, OpenCode Zen, …) through the existing relay. Keys live in memory only. |
| Fun | It should feel playful and friendly, never like an "AI toy". Copy is short and plain. |

## Feature: Ripple (spread my edit)

The user changes one letter by hand, for example by giving `a` a curly tail. The agent notices what changed, names it in plain words, suggests related letters (`d u i l` …), and drafts the same idea on them with a Subtle / Same / Wild strength setting. The drafts can be kept or reverted, and one undo reverses the whole ripple. Full spec: [RIPPLE-SPEC.md](RIPPLE-SPEC.md). Research: [research/ripple-*.md](research/).

## Sources of truth, in priority order

1. The owner's words in issues and PRs.
2. This file.
3. The Figma file (see [FIGMA.md](FIGMA.md)), page "claude": Design system, Flow (8 screens) and Feature · Ripple (8 screens).
4. [FIGMA-SPEC.md](FIGMA-SPEC.md) (tokens and type roles), [DESIGN-BRIEF.md](DESIGN-BRIEF.md) (interaction model and edge cases), [RIPPLE-SPEC.md](RIPPLE-SPEC.md).
5. [ARCHITECTURE.md](ARCHITECTURE.md) for the code.

Where documents disagree, the Figma screens plus this file win. Example: the brief's older "editor opens in the grid's box" idea and the HTML prototype are superseded by the Figma screens.
