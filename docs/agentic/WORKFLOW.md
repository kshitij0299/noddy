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

**PR size (from M3 on):** one PR per milestone feature when the pieces interact (M3 focus mode = #16–#18 together; M4 agent panel = #19–#21 together). Independent pieces stay separate.

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
