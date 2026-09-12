# 16 — GitHub Repo Plan (decided 2026-09-11, user-approved)

## Decision

- New **private** repo `kshitij0299/noddy` (fresh product identity, NOT a GitHub fork object).
- `noddy/phase3-leftside` pushes to the new repo's **`main`** (fresh default branch).
- Tag `noddy/completion-baseline` pushed too (certified rewind point).
- Agent side-branches: NOT pushed (all merged into mainline; future agents mint fresh ones; local branches remain as backup).
- Full history travels (GPL attribution trail intact — approach A spirit per `Glyphr Studio Fork Conventions.md`).

## Pre-push items (done)

- Root `NOTICE` file (upstream credit + change summary) — required by the conventions checklist.
- `package.json` name `glyphr-studio-2` → `noddy` (verified: name referenced nowhere in build/test/vite configs).

## Deliberate deviations from the Obsidian convention docs (user-approved)

1. Version stays `2.11.0-noddy.0`, NOT reset to `0.1.0` — anything below `2.10.3` makes Noddy refuse existing user projects (open-gate rejects "future" files). Revisit only with a migration story.
2. A few intentional "Glyphr Studio" mentions remain (file-compat messaging, attribution links) — passed brand audit as deliberate.
3. `localStorage` key stays `GlyphrStudio` (no migration yet); internals (`GlyphrStudioApp`, etc.) untouched per rename tiers.

## Remotes after push

- New repo: `noddy` remote locally (to add).
- Old clone keeps `origin` (kshitij0299/Glyphr-Studio-2 fork) + `upstream` (glyphr-studio/Glyphr-Studio-2) for receiving upstream fixes.
- Contributors to the new repo: `git remote add upstream https://github.com/glyphr-studio/Glyphr-Studio-2.git`.
