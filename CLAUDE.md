# Noddy: instructions for Claude

Noddy is a fork of Glyphr Studio 2 (GPL-3.0) being turned into an agentic font editor.

## Owner rules (binding; they used to live only in session memory)
- Subagents NEVER use the Claude browser pane (`mcp__Claude_Browser__*`): it's the owner's live workspace. Headless Playwright only, on your own port.
- The owner's dev server is port 5300 from this folder. Never use 5187 or 5300 for tests; never kill a server you didn't start without asking.
- Save the owner's open project to `tmp/projects/` (and tell them) before any dev-server restart or `git pull`: a pull reloads the page and closes the project (bug 43); browser Restore is not durable (bug 53).
- Never read or print `.env.local` (it's ignored via `.git/info/exclude`). On the dev server, typing `env` as the OpenRouter key uses it.
- Cost discipline in `docs/agentic/WORKFLOW.md` is binding: one PR per issue → QA → squash-merge into `dev`; code/design subagents on Opus, read-only QA on Sonnet, effort medium set explicitly; no Fable; one heavy run at a time.
- Log every bug you hit in `docs/agentic/SMOKE-TEST-BUGS.md` and give real ones a GitHub issue.
- Remix taste: add marks in the owner's reference style; reshape only a little; no mirror/kick/warps on pixel fonts.
- Driving Noddy yourself over MCP: `plans/LOCAL-AGENT-MCP.md`. Glyph jobs die with the MCP session (#98), so keep ONE session open for a whole run (the local helper `tmp/noddy-mcp/driver.mjs` does this; `tmp/` is git-ignored).
- Explain things to the owner simply and briefly.

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
