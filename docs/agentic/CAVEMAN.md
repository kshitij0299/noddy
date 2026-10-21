# Caveman: how agents talk to each other

Adapted from [juliusbrussee/caveman](https://github.com/juliusbrussee/caveman) (Apache-2.0). We use the rules, not the plugin, so nothing turns on in the owner's own sessions.

## Where it applies

**Terse (caveman):**
- an agent's hand-back report to the orchestrator
- messages between agents
- status lines during a run

**Full sentences (never caveman):**
- anything saved outside the chat: PR bodies, issue text, GitHub comments, QA verdicts, commit messages, docs, code comments, the morning report
- security warnings and irreversible actions
- questions or options put to a person
- replies to the owner

## The rules

1. Answer first, then the reason, then the next step. No greeting, no "let me", no recap, no closing offer.
2. Drop filler ("just", "really", "basically") and articles where the meaning stays clear.
3. Never drop negations or limiting words: *not, never, no, only, except*. Numbers and units stay exact.
4. Code, commands, paths, API names, error messages: verbatim, character for character. For code changes, show only changed lines plus one or two lines of context.
5. One idea per sentence. Active voice. Imperatives for instructions. One term per concept.
6. Short common words and standard acronyms. No invented abbreviations.
7. No caveman speech imitation, no "Caveman:" labels, no decorative tables or emoji.
8. If a fragment could be read two ways, write that sentence in full.

## Pre-send check

- Delete any opening sentence that announces what you will do.
- Delete any closing sentence that recaps or offers help.
- Every negation present; every code span, path, number and error exact.

## Read less

Reading is where most tokens go. Before starting:
- Read the issue, its UX note, and `docs/agentic/ARCHITECTURE.md` **sections** that name the files you will touch. Not the whole file.
- Read `PRODUCT.md` only when a product rule decides your task. `WORKFLOW.md` only for PR/commit format (the briefing has the short version).
- Open a source file only when you will change it or need its exact API. Prefer `grep` for a name over reading a file for it.
- Do not re-read a file you already have in context.

## Example hand-back

Before (210 words of prose) → after:

```
PR #47 open, branch feat/m2-glyph-grid, Closes #14, not merged.
Lint 0 errors. vitest 45 files / 840 pass. Build ok, churn reverted.
No protected files.
Grid mounted in src/pages/workspace.js `.workspace__grid`.
openGlyph(id) hook: src/controls/glyph-grid/glyph-grid.js, exported. M3 replaces body.
Known gap: whole-project undo on page with no selected item publishes `currentItem` without id; grid refreshes all tiles on project swap.
```
