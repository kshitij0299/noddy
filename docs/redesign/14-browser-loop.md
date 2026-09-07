# 14 — Browser test loop (tester agents)

Short contract for agents that verify UI work with the harness in
`scripts/browser/drive.mjs` (full usage there).

## How to run a check

1. Write a steps file to `/tmp` (never into the repo), e.g.
   `/tmp/noddy-check-<topic>/steps.json`.
2. Run `node scripts/browser/drive.mjs run <steps file>` from the repo root.
   The dev server under test is already running; the driver picks its own
   CDP port and never touches 5174, 5175, or 9222.
3. Read the one-JSON-line-per-step stdout. Any `ok:false` line (exit
   non-zero) is a harness or app failure — investigate before re-running.

## Reporting

- Report **PASS** or **FAIL** per checked viewport/behavior, with the
  `/tmp` screenshot paths that prove it.
- On FAIL, add a **defect list**: what broke, the step index + error line,
  and the screenshot/console-dump paths. Keep it factual and terse.
- Screenshots and console dumps live under `/tmp` (e.g.
  `/tmp/noddy-<topic>/`) and are **never committed** to the repo.

## Limits

- The driver does screenshots plus simple click/type/wait loops only —
  no auth flows, file pickers, or multi-tab scenarios.
- Treat screenshots as evidence, not fixtures: do not check them in,
  do not diff them in CI, delete or leave them in `/tmp`.
