# Noddy: instructions for Claude

Noddy is a fork of Glyphr Studio 2 (GPL-3.0) being turned into an agentic font editor.

## Starting a session (do this first, every time)
1. Check that you are on branch `dev`. On the owner's laptop, work in `font agent/noddy` (the only clone, cleaned up 2026-10-27; remotes `noddy` = this repo, `upstream` = glyphr-studio/Glyphr-Studio-2). Old phase and Codex branches are archived on GitHub (`archive/*` branches, tag `archive/pre-cleanup-2026-10-27`). The owner's dev server: `npx vite serve ./src/ --port 5300 --strictPort` from this folder.
2. Ask the owner before pulling, then run `git pull --ff-only` on `dev` (cloud sessions push there too).
3. Read `docs/agentic/MORNING-REPORT.md` and tell the owner in a few lines: what's done, what's open, and the next item you suggest.
4. Wait for the owner to confirm the next item before starting work.

Exception: an autonomous run that the owner started with an explicit brief (such as a cloud build session) skips steps 2–4 and follows its brief.

Read these before doing anything:
1. `AGENTS.md`: repo rules, protected areas, and what must never break.
2. `docs/agentic/README.md`: index of the product, design, build plan, team workflow and architecture docs.

Usage budget: `docs/agentic/BUDGET.md` is binding — read it first and stop when it says.

Key rules:
- Work on feature branches off `dev` and open PRs into `dev`. Never commit to `main`.
- Follow `docs/agentic/WORKFLOW.md`: roles, git conventions, protected-area process and definition of done.
- Product decisions live in `docs/agentic/PRODUCT.md`. The design source is the Figma file (`docs/agentic/FIGMA.md`).
- Subagent roles are defined in `.claude/agents/`: `developer`, `ui-designer`, `qa`.
- Check commands: `npm run lint`, `npx vitest run`, `npm run build`, `npm run test:agent-relay`.
- Dev server: `npm run dev`. Never put test fixtures on the owner's preview port 5187.
