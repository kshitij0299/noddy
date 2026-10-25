# Plan: agent tools fix → agent panel controls → Remix mode

Owner-approved direction (2026-10-24). Three PRs, run one at a time (WORKFLOW.md cost
discipline). Sources: `SMOKE-TEST-BUGS.md` (bugs 1–29), `research/remix-mode.md`, and the first live
Claude-over-MCP run (A's slash copied to B–F).

## Owner decision (2026-10-24): the panel gets two tabs

The agent panel stops being only an agent window. It gets **two tabs**:

1. **Agent**: the chat (built-in model or a connected local agent), with the composer controls in
   PR B.
2. **Chaos tools**: algorithmic effects that run directly, no AI needed: pick a tool (slash cut,
   glitch bands, warp, drips, grid snap, Pixel Life, shatter…; see `research/remix-mode.md`), set
   its knobs (chaos, seed, angle…), apply to the target glyphs, re-roll. Each tool is tuned to
   Noddy's use case (outlines stay valid, letters stay readable, results land as Drafts with one
   undo). The agent can call the same tools, so Remix mode and the Chaos tab share one engine.

**Own PR (owner, 2026-10-24):** the Chaos tools tab is a separate PR (PR C below). PR B only adds the
tab shell (Agent | Chaos) so PR C can drop in. Order: A tools fix → B panel controls → C Chaos
tools tab → D Remix mode.

## PR A: agent tools fix (tier 3: agent tools + relay)

Goal: a strong agent (Claude over MCP) and a weak one (free OpenRouter model) can both make real
edits without fighting the tools.

1. **Booleans and copies.** New tools: `copy_paths` (copy contours from another glyph into the job,
   with an optional transform) and `boolean_paths` (union / subtract / intersect / exclude between
   contours in the job, result as clean outlines). This turns "slash on top of the letter" into a
   real cut that passes the gate. Dependency: **paper.js** (MIT; booleans on Béziers, keeps curves),
   loaded lazily only when a boolean runs. Exact pin, at least two weeks old.
2. **Transforms that agents can use.** `transform_paths` takes rotate (degrees), scale, skew, move,
   mirror, around a named pivot (centre, baseline-centre, a point). Check the existing tool and
   extend rather than duplicate.
3. **Gate with sense.** Self-intersection and winding problems that already existed before the job
   are warnings, not rejections (the owner's own A must never block a job). Every gate code comes
   with a fix hint ("reverse this contour's points to cut out", "union these two").
4. **Optional means optional.** Missing nullable fields are treated as null (bug 26), in the relay
   and in the tab.
5. **See the draft.** Render and check tools look at the job's draft, not the committed glyph (#68).
6. **Built-in agent recovers.** Tool errors go back to the model as tool results with the hint;
   `repairToolCall` (AI SDK) fixes malformed calls once; bounded retries. Name the tool and reason
   in any error the user sees (bug 8). Raise or restructure the 8-call cap (#73);
   `parallelToolCalls: false` for OpenRouter too.
7. **Local agent polish.** Render limit per MCP session raised and the agent told clearly when a
   session restarts and drafts were dropped; the "connected" chip clears on Stop/close; a reload
   keeps Local agent on for that tab (bug 25); error text never says "Send" to an external agent.
8. **Tests:** unit tests for each new tool and the gate rules; relay checks; one live MCP run that
   cuts A's slash into B as a real boolean and lands a clean Draft.

## PR B: agent panel controls (tier 2/3: UI)

Every control earns its place; no new screens; no full-width slabs (owner's UI rules).

- **Model chip** in the composer row: current model; click to switch anytime and keep the chat
  (bugs 1, 14). Shows "Claude Code · connected" when the local agent is on.
- **Mode chip:** Exact / Remix / Wild. A small chaos dial appears only in Remix/Wild.
- **Target chip:** this glyph / selected glyphs / whole set, set from the grid selection.
- **Talk to the local agent from the panel** (bug 30): when Claude Code is connected, the composer
  sends to it (MCP `wait_for_user_message` long-poll + a reply tool), replies appear in the thread.
- **New chat** in the panel header (bug 20), next to the Local agent switch.
- **Per-glyph results** in the thread with Keep / Re-roll / Undo on each.
- Empty state on a loaded font suggests edits, not "What are we drawing?" (bug 16).
- Mode, chaos and target reach the built-in agent's instructions and the MCP `get_context`, so
  Claude Code behaves the same.
- Browser check at 1440 and 1024, keyboard and focus, screenshots in the PR.

## PR C: Chaos tools tab (tier 2/3)

- The second tab of the panel: a list of algorithmic tools, each with a few knobs (chaos 0–100,
  seed, plus its own e.g. angle/width/count), a live preview on the target glyphs, Apply (Drafts,
  one undo) and Re-roll.
- First tools, picked from `research/remix-mode.md` for cheap + strong: slash cut, glitch bands,
  warp (arc / bulge / wave / twist), grid snap, Pixel Life (dot fonts). Each is a seedable op on
  outlines using PR A's engine, tuned so outlines stay valid and letters stay readable
  (legibility guard).
- The same ops are exposed as agent tools, so Remix mode (PR D) and the Chaos tab share one engine.

## PR D: Remix mode v1 (tier 2)

From `research/remix-mode.md`, cheapest and most "cracked" first:

- **Seeds:** every glyph result has a seed; Re-roll changes it; results reproduce.
- **Card deck:** per glyph the agent draws 2–3 seeded move cards (rotate a piece, mirror, shift,
  scale a part, slash, kick), no repeats within 3 glyphs, and must undo one move after looking.
- **Telephone:** each glyph starts from the previous glyph's move log plus one mutation; reject
  results that look too close to siblings.
- **Chaos dial** scales the ranges; **legibility guard** on by default (reverts moves that break
  the letter), with a "break rules" option in Wild.
- Live test: Remix A–Z on DotGothic16 with Claude connected.

Later candidates: Style DNA, Breed, Drop, Pixel Life, Weld, Grid snap.

## Process

Developer on Opus 5.5 at medium effort, QA on Sonnet 5.5 at medium, effort set explicitly, own
worktree and port (never 5300 or 5187), one PR at a time, squash-merge into `dev` after QA PASS.
Mark bugs fixed in SMOKE-TEST-BUGS.md as they land.
