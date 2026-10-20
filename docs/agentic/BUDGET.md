# Usage budget for the overnight run (binding, set by the owner)

- Use **one 5-hour window only**: stop starting new work by **2026-10-21 02:15 UTC** and wrap up (push, MORNING-REPORT.md) by 02:30 UTC.
- **Weekly · all models:** started at 18%. Target ≤ 40%, **hard stop at 50%**.
- **Weekly · Fable:** started at 0%. **Hard stop at 40%**.
- Extra (paid) usage must **not** be used. If usage cannot be read, assume you are near the limit after ~4 hours and wrap up.

How to stay lean:
- Medium effort everywhere. Orchestrator writes no big code and reads only what it needs.
- Prefer Fable for subagents; use Opus only for hard implementation (history/undo, native tools, canvas).
- Small PRs. One combined QA+UX review per PR unless it's a big UI screen. No repeated full-suite runs beyond what the definition of done needs.
- Scope: M1–M4 first; stop there if the budget is tight. Don't start a milestone you can't finish within the window.
