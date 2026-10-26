# Parked: M8 Ripple and M9 Export (how to restart them)

**Status (2026-10-26):** both parked by the owner. M1–M7 are done (cloud runs, Oct 20–22). The
local session of Oct 23–26 added the local agent (Claude Code over MCP), the agent tools fix, panel
controls, the Chaos tools tab and Remix mode (PRs #84–#93; see the top of `MORNING-REPORT.md`).

**Owner's way of working now:** build and test features by hand first (with Claude in the chat and
over MCP), log what breaks in `SMOKE-TEST-BUGS.md`, and only then decide whether M8/M9 are still
needed and in what shape. Agents must not start M8 or M9 on their own.

| Milestone | Issues | Spec | What it is |
|---|---|---|---|
| M8 Ripple | [#30](https://github.com/kshitij0299/noddy/issues/30)–[#33](https://github.com/kshitij0299/noddy/issues/33) | `RIPPLE-SPEC.md` (read §8 first), `BUILD-PLAN.md` | Edit one glyph by hand; Noddy notices, describes the change, and offers to ripple it to related glyphs as Drafts with one undo. |
| M9 Export | [#34](https://github.com/kshitij0299/noddy/issues/34) | `BUILD-PLAN.md` "M9 Export" (Flow 08) | Preflight sheet before export: coverage, checks, "Keep N & export OTF", "Export with drafts". |

## Trigger prompts (paste into a new chat)

**Plan M8 (no code yet):**
```
Continue Noddy. Follow CLAUDE.md's session-start checklist. Then re-plan M8 Ripple: read
docs/agentic/plans/RESUME-M8-M9.md and RIPPLE-SPEC.md (§8 lists what already exists). Update the
spec and issues #30–#33 so Ripple is built on copy_paths / boolean_paths / the outline gate / glyph
jobs / the mode chip / Chaos, list what is genuinely new, flag the protected parts, and propose the
PR breakdown. Ask me the open questions in RIPPLE-SPEC §7 before anything is built. WORKFLOW.md is
binding (cost discipline, Opus medium for code, Sonnet medium for QA, one heavy run at a time,
lean briefs, subagents never use the built-in browser, never read .env.local, my dev server is on
5300, never 5187).
```

**Build M9 Export:**
```
Continue Noddy. Follow CLAUDE.md's session-start checklist. Then build M9 Export (#34) per
docs/agentic/plans/RESUME-M8-M9.md and BUILD-PLAN.md: check the spec against the current app
first (Draft/Keep states, the outline gate, Chaos/Remix drafts), tell me what changed, wait for my
OK, then one PR → QA → merge. Same rules as WORKFLOW.md (cost discipline, Opus medium for code,
Sonnet medium for QA, lean briefs, subagents never use the built-in browser, never read
.env.local, my dev server is on 5300, never 5187).
```
