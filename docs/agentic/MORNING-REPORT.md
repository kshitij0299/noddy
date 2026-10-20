# Morning report: overnight agentic build

_Updated by the orchestrator after every merge. Newest status at the top of each section._

## TL;DR

- Build in progress. See "Merged" below for what landed on `dev`.

## Protected-area PRs to review first

| PR | What | Status |
|---|---|---|
| [#4](https://github.com/kshitij0299/noddy/pull/4) | Test-only: fix SVG fixture filename case so `svg_outline.test.js` loads on Linux | open, awaiting QA |

## Merged into `dev`

| PR | Issue | What | QA |
|---|---|---|---|
| [#2](https://github.com/kshitij0299/noddy/pull/2) | [#1](https://github.com/kshitij0299/noddy/issues/1) | Lockfile pointed 38 packages at private Azure feeds, so `npm ci` failed everywhere else. Rewrote to the public npm registry. | Orchestrator-verified tooling chore |

## Open PRs and why

_None yet._

## Known bugs / caveats

- **Build churn:** `npm run build` rewrites the tracked `dist/` folder and `src/app/app_config.json`. Agents revert these after every build and never commit them.
- **Branch cleanup:** this cloud session can't delete remote branches, so merged feature branches stay on GitHub. Delete them from the GitHub UI if you like.
- **Labels** were auto-created by GitHub (grey, no descriptions). The names follow WORKFLOW.md.
- **`gh` CLI** isn't authenticated in the cloud session. Issues, PRs, comments and merges all go through the GitHub connector instead, under your account.

## How to run it

```bash
git switch dev && npm ci
npm run dev            # app (Vite)
npm run agent:serve    # local model relay for the agent
npm run lint && npx vitest run && npm run build
```

## What's next

- Milestones M1 → M9 in [BUILD-PLAN.md](BUILD-PLAN.md) order.
