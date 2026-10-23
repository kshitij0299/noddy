# Team workflow: orchestrator + developer + UI + QA agents

## Roles

| Role | Model (default) | Owns | Must not |
|---|---|---|---|
| **Orchestrator** | Fable 5.1 | Picks the next issue in [BUILD-PLAN.md](BUILD-PLAN.md) order, writes the issue, spawns agents, merges PRs into `dev`, keeps the morning report | Write large code itself; merge anything into `main` |
| **UI/UX agent** (`.claude/agents/ui-designer.md`) | Fable 5.1 | For **(D)** issues, a short UX note in the issue (states, edge cases, keyboard, responsive, copy) checked against the Figma screens; updates Figma or `figma/CHANGES.md` | Change product decisions in PRODUCT.md |
| **Developer agent** (`.claude/agents/developer.md`) | Opus 5.5 | Implements one issue on its feature branch with tests; opens the PR | Touch protected areas without the (P) process; widen scope |
| **QA agent** (`.claude/agents/qa.md`) | Opus 5.5 | Checks out the PR, runs every check, tests the behaviour and UX edge cases, **does the design review for UI PRs**, posts one verdict comment (PASS / FAIL with repro) | Fix code in the same PR (it reports; the developer fixes) |
| **Chores** (spawned ad hoc) | Sonnet 5.5 | Issues and labels, morning-report updates, doc fixes, test-only QA, merge-and-retest checks | Anything under `src/app`, `src/pages`, `src/panels`, `src/controls`, agent UI, CSS, `index.html`, Figma or screenshots |

All agents run at medium effort. Agents talk to each other per [CAVEMAN.md](CAVEMAN.md); everything saved to GitHub stays in full sentences.

**Skills:** shared skills live in `.claude/skills/`. Every UI task loads **`design-taste-frontend`** (TASTE, anti-generic art direction and the look-and-fix loop), **`refactoring-ui`** (spacing, type, colour and shadow scales; `references/diagnose.md` for fixing existing UI) and, for layout tiers, **`responsive-design`**. Each of the three ends with a "Noddy addendum": Figma and PRODUCT.md win, tokens only, and AGENTS.md §1 still bans the old-branch grids and overflow hacks. Developer: also `test-driven-development`, `frontend-ui-engineering`, `debugging-and-error-recovery`. QA: `code-review-and-quality`. `browser-testing-with-devtools` assumes a DevTools MCP we lack; use the Playwright helper in ENVIRONMENT.md. For protected-area PRs the orchestrator may add a `code-reviewer` agent pass on top of QA.

**Concurrency:** at most two agents at a time. Cloud and local sessions draw from the same usage pool; parallel agents are what spend it.

**Environment facts** for cloud agents (ports, screenshot helper, proxy, GitHub via MCP) live in [ENVIRONMENT.md](ENVIRONMENT.md).

**PR size (owner decision after the M1–M4 run, see [UI-RESET.md](UI-RESET.md)):** **one PR per milestone.** The run's 21 PRs cost six QA FAIL rounds; each round re-ran `npm ci`, the suite, the build and a browser matrix. Only a protected-area change (AGENTS.md §3) gets its own PR. Commits inside the PR stay small and logical so the diff is readable.

**Browser check before the PR (developer):** nearly every QA FAIL was a real-browser problem jsdom cannot show: hover and focus styling beaten by the legacy `button` reset, Tab order trapped by the canvas, layout overlaps, zoom resetting. Before opening a PR the developer runs the app, checks hover, focus, keyboard (Tab, Enter, Esc, arrows) and layout at 1440 and 1024, and puts the screenshots in the PR body. A PR without them is not ready for QA.

**QA rounds are capped at two.** QA posts one consolidated list per round (blocking first). After the fixes, the re-QA checks only the listed items plus lint, tests and build; it does not repeat the full browser matrix. If the second round still fails, the orchestrator folds the remaining items into the next milestone's issue instead of running a third round.

**Model fallback:**
- If Opus is rate-limited or usage is running out, spawn the agents on Fable 5.1 instead and note it in the PR.
- If the main session hits its limit, it stops cleanly: it pushes everything and writes the morning report first.

## Git conventions

- **Branches:** `main` (stable, untouched) ← `dev` (integration). Feature branches cut from `dev`:
  - `feat/<milestone>-<slug>`, e.g. `feat/m2-glyph-grid`
  - `fix/<slug>`
  - `refactor/<slug>`
  - `docs/<slug>`
  - `test/<slug>`
- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/) with a scope, e.g.:
  - `feat(grid): add GlyphTile status marks`
  - `fix(history): record numeric inspector edits`
  - `test(agent): cover ripple undo`
  - `docs(agentic): …`

  Commits are small and each one builds. The body says *why*. Claude-authored commits end with the `Co-Authored-By` line.
- **Issues:** one per BUILD-PLAN bullet.
  - Title: `[M2] Letters & figures grid`.
  - Body: goal, Figma reference (screen name, node ID), acceptance criteria as a checklist, out of scope.
  - Labels: `milestone:M2`, `type:feature|fix|chore`, `area:ui|agent|engine`, `design` for (D), `protected-area` for (P), `qa:pass` / `qa:fail`.
- **PRs:** one issue per PR, `Closes #N`. Body template:
  - Summary
  - Figma reference
  - Screenshots (before/after where UI)
  - Tests run with their results
  - UX edge cases covered
  - Protected areas touched (if any) and why
  - Risks and how to revert
- **Merge:** squash-merge into `dev` **only after** the QA agent posts PASS and CI checks pass. Keep the branch for history and delete it after merge. Tag the `dev` HEAD after each finished milestone (`m1-done`, `m2-done`, …) so any milestone can be rolled back.
- Never force-push `main` or `dev`. Never rewrite published history. Revert with `git revert` in a PR.

## Protected areas (AGENTS.md §3) during the autonomous run

- Changes to `src/project_data/`, `src/formats_io/`, `src/edit_canvas/events*`, `src/project_editor/history.js`, serialization, undo/redo, keyboard shortcuts or canvas interaction go in their **own PR**.
- Label it `protected-area`, explain why in the PR, and include focused regression tests.
- **Merge rule:** the owner authorized continuous building on `dev` overnight. A protected-area PR may merge into `dev` only when QA passes and the full suite passes. It must be listed first in the morning report so the owner can review it or revert it.
- **Serialization or `.gs2` format changes are never merged without the owner.** Keep that PR open and build around it.

## Approval gates

AGENTS.md §5 requires a hard stop after each milestone. For this autonomous run the owner replaced that gate:
- Write each milestone's verification packet as the PR description, plus a milestone summary comment on the milestone's last PR.
- Continue to the next milestone without waiting.
- The owner reviews everything in the morning from `docs/agentic/MORNING-REPORT.md` and the PR list.

## Cost discipline (binding, owner 2026-10-23)

Most cost comes from browser-heavy QA, fix rounds, cold starts and mid-run restarts. Pick the lightest tier that proves the change.

**QA tiers.** The orchestrator labels each PR `qa:tier-1`, `qa:tier-2` or `qa:tier-3` when it opens the issue.

| Tier | When | QA does |
|---|---|---|
| **1. Light** | CSS, copy, docs, small UI fix (one component, no logic) | lint plus the test files for the touched area. One screenshot at 1440 (light) of the changed state. No width/theme matrix. |
| **2. Standard** | New UI behaviour or logic in one area | Full lint, vitest and build. A browser walk of the happy path plus the edge cases named in the issue: 1440 light and dark, plus one narrow width. Up to 4 screenshots. |
| **3. Full** | Protected areas, agent tools, relay, multi-screen features | Everything in tier 2, plus keyboard-only pass, 1024 and 390 widths, the relay checks, and mutation checks (break the fix on purpose and confirm tests fail). |

**Rules for every run:**
- **Mutation testing only in tier 3.**
- **Screenshots:** take only the ones listed for the tier. Prefer DOM/text reads (`read_page`, `get_page_text`, computed styles) over images.
- **Batch small fixes.** Collect tier-1 items (copy, spacing, small CSS) and ship them as one PR, not one PR each.
- **Requirements up front.** The orchestrator collects the full brief before starting a run. If the owner adds requirements mid-run, queue them for a follow-up PR unless they invalidate the work in progress. Don't restart runs for additions.
- **Warm setup.** Reuse one QA worktree per PR. Run `npm ci` once per worktree and reuse it for re-checks. Run the full suite once per round, plus targeted test files while iterating.
- **One heavy run at a time on the owner's laptop.** Run parallel workflows only when they are light (tier 1), because parallel vitest/browser runs overload the machine and cause timeouts.
- **Read less** (see [CAVEMAN.md](CAVEMAN.md)): read only the doc sections and files the issue touches.
- **Long chats:** when the orchestrating chat gets long, start a fresh session. `CLAUDE.md` and `MORNING-REPORT.md` carry the context.

## UX quality bar (UI agent and QA)

- Match Figma: tokens, ROND 60 headings, outlined icons, spacing (24px gutter, 4px grid).
- **Every control has a reason.** No duplicate or dead buttons.
- Paint-only hovers, no layout shift, equal sibling heights, focus rings never clipped, status never shown by colour alone.
- Edge cases from [DESIGN-BRIEF.md](DESIGN-BRIEF.md) "Prototype plan" and [RIPPLE-SPEC.md](RIPPLE-SPEC.md) §3. Keyboard paths: Esc closes the editor and never stops a run.

## Morning report

Keep `docs/agentic/MORNING-REPORT.md` updated after every merge:
- What merged (PR links)
- What is open and why
- Protected-area PRs to review
- Known bugs
- How to run and see the result
- What's next
