# Noddy: instructions for Claude

Noddy is a fork of Glyphr Studio 2 (GPL-3.0) being turned into an agentic font editor.

Read these before doing anything:
1. `AGENTS.md`: repo rules, protected areas, and what must never break.
2. `docs/agentic/README.md`: index of the product, design, build plan, team workflow and architecture docs.

Key rules:
- Work on feature branches off `dev` and open PRs into `dev`. Never commit to `main`.
- Follow `docs/agentic/WORKFLOW.md`: roles, git conventions, protected-area process and definition of done.
- Product decisions live in `docs/agentic/PRODUCT.md`. The design source is the Figma file (`docs/agentic/FIGMA.md`).
- Subagent roles are defined in `.claude/agents/`: `developer`, `ui-designer`, `qa`.
- Check commands: `npm run lint`, `npx vitest run`, `npm run build`, `npm run test:agent-relay`.
- Dev server: `npm run dev`. Never put test fixtures on the owner's preview port 5187.
