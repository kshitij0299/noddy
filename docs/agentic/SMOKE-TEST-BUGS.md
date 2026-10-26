# Owner smoke test: bugs found (2026-10-23)

First real-key run of the agent (OpenRouter, free models) on localhost:5300.
The owner's rule: **an end user must never have to do any of this by hand.** Free-model
availability changes daily, so anything below that depends on "which models work" must be
checked live by the app, not hard-coded.

Status: open unless marked. PR A (agent tools fix) fixed 8, 9, 22, 23, 25, 26, 27 and the
"compact tools" part of 17 (copy_paths, boolean_paths, transform pivots). PR B (agent panel
controls) fixed 1, 13, 14, 16, 20 and 30. Existing issues are linked where they match.

## Connection and models

1. **No model switcher once a chat has started.** **Fixed in PR B (the model chip in the composer opens the model list; switching keeps the chat).** "Change" exists only on the empty state and
   inside some error bubbles. Every AI app shows the current model in the composer and lets you
   switch anytime. Wanted: a model chip in the composer that opens the existing model list;
   switching keeps the chat.
2. **The model list offers free models this key cannot use.** Tested through the relay:
   - works: `nvidia/nemotron-3-ultra-550b-a55b:free`, `nvidia/nemotron-3.5-super-vl:free`,
     `poolside/laguna-s-2.1:free`, `openrouter/free`
   - 403 PROVIDER_FORBIDDEN: `thinkingmachines/inkling:free`, `inkling-small:free`
   - 404 PROVIDER_MODEL: `nvidia/nemotron-3-super-120b-a12b:free`
   - 400 PROVIDER_REQUEST: `cohere/north-mini-code:free`
   - 429 PROVIDER_LIMIT: `google/gemma-4-31b-it:free`, `gemma-4-26b-a4b-it:free`
   The user finds out only after picking one, one at a time. Wanted: the app probes free models in
   the background (cheap "Reply OK" check, cached for a short time), hides or greys out the ones
   that fail for this key, and puts known-good ones first.
3. **No automatic fallback when a free model is rate-limited (429) or times out.** The user has to
   pick another model by hand. Wanted: offer, or with consent do, a one-click switch to the next
   working free model; keep the chat.
4. **`openrouter/free` is a random router.** It can switch models between steps of one turn, and
   weaker ones break tool calls. Wanted: a warning label, never the default or recommended pick.
5. **Misleading error text: "200 · OpenRouter isn't responding".** Seen on Nemotron Ultra on a
   real step after the "Reply OK" check passed. Status 200 with "not responding" makes no sense to
   a user. Likely a timeout or empty response mislabelled. Wanted: correct cause and status, and
   the fallback from item 3.
6. **The key is asked again for every new project and every reload** ("Reconnect to OpenRouter").
   Memory-only is a deliberate security choice, but the friction is high. Wanted: an opt-in
   "remember on this device" (encrypted or OS keychain in the hosted build), and keeping the
   connection when switching projects in the same tab.
7. **Dev only (done on branch `agent/dev-env-key`, not merged):** typing `env` as the key uses
   `OPENROUTER_API_KEY` from `.env.local` on the dev server, free models only. Not for hosted users.

13. **"Use this model" sat on "Testing…" for about 60 s** **Fixed in PR B (Cancel while testing; the test gives up after 45 s and says so). Why the in-app check is slower was not investigated.** (Nemotron 3.5 Super VL) with no
    progress, time estimate or cancel. The same check took a few seconds through the relay directly.
    Wanted: a cancel button, a timeout with a clear message, and investigate why the in-app check is
    slower than a direct relay call.
14. **"Change model" inside an error bubble says "This starts a new chat."** **Fixed in PR B (it opens the model chip's list; the chat stays).** Switching models
    should keep the conversation.

## Agent runs

0. **Temporary fix on branch `agent/dev-env-key`:** relay timeout raised from 90 s to 5 min
   (`server/agent/validation.js`). Not yet re-tested on a real edit.

8. **"The model returned an invalid tool call. No edit was applied."** **Fixed in PR A (invalid calls go back to the model as tool errors with tool, reason and hint; one free repair; two retries, then the error names the tool and reason).** is a dead end. It does not
   say which tool or why, and the model gets no chance to fix its call. Wanted: name the tool and
   reason, send the validation error back to the model as the tool result, allow a bounded retry.
9. **8-tool-call cap per step** **Fixed in PR A (16 calls per step with the rest answered, 40 per request; parallel_tool_calls false for OpenRouter).** ([#73](https://github.com/kshitij0299/noddy/issues/73)). "Do it
   for all other chars" makes the model fire one call per glyph and the whole step is rejected.
   Also `parallelToolCalls: false` is sent to OpenAI only, not OpenRouter.
10. **"Same style as my A" for the whole set** ([#71](https://github.com/kshitij0299/noddy/issues/71))
    has no plan, progress or cancel. Style transfer across glyphs is beyond what free models do
    well through path tools; the agent should say so and offer a batch plan.

17. **Free models time out mid-run and the whole run dies.** "Graffiti style from A onto the next
    5 glyphs" on Nemotron 3.5 Super VL: it read and rendered A–F fine, then the edit step failed
    twice ("502 · OpenRouter isn't responding", then "Provider not responding") after the relay's
    90 s limit. Likely cause: rendered images + full outlines make each request large and the free
    model is slow to write long path data. Wanted: smaller per-step context (send only what the
    step needs), one glyph per step, automatic retry/resume, and a longer or streaming timeout.
    Reproduced on a fresh chat with `poolside/laguna-s-2.1:free` and a one-glyph ask ("apply A's
    style to B only"): read A and B, then "Provider not responding" at 90 s. So it is not the
    model or the request size; it is the edit step. Probable root cause: DotGothic16 is a pixel
    font, so every glyph is dozens of little squares; the model must write all of them back, and
    up to 4,096 output tokens at free-model speed (about 20–50 tokens/s) takes longer than 90 s.
    Wanted: stream the response so a slow-but-working model is not cut off, set the timeout by
    progress rather than wall clock, and give the model compact tools (e.g. "transform these
    contours", "copy contours from A") so it does not have to retype every point.
18. **The agent re-reads and re-renders the same glyphs after "continue"**, wasting steps and
    tokens. Wanted: keep what it already read in the conversation and go straight to editing.
19. **The agent panel covers the glyph being edited.** With A open at about 1440 px wide, the panel
    sits over the right half of the canvas, so you can't see the edit happen.

20. **No "New chat" button.** **Fixed in PR B (New chat in the panel header).** The only way to start fresh is "Change model", which is hidden
    inside an error bubble or the empty state.

21. **A page reload loses unsaved work with no warning and no backup.** A dev-server restart
    reloaded the page; the imported DotGothic16 project and the owner's hand edit on A were gone,
    and "Restore" only listed older projects. Wanted: autosave every project (including imported
    fonts) to the Restore list, and a "leave page?" guard while there are unsaved edits.

22. **With the 5-minute limit the agent got much further:** **Fixed in PR A (issues the glyph had before the job are warnings; copy_paths + boolean_paths make a real cut).** read A and B, described A's style
    correctly ("a diagonal tag path"), began a B job, drew it and checked outlines. Then
    `submit_glyph` refused it: "The draft has outline problems" (self-intersection, winding).
    The owner's own A tag crosses itself, so a faithful copy of the user's style can never pass the
    gate. Wanted: allow the user's intended overlaps (or let the user approve a draft with
    warnings), instead of a hard refusal.
23. **After the refusal the next call was "The model returned an invalid tool call"** **Fixed in PR A (see 8).** (bug 8) and
    the run stopped with "0 edits applied · 1 failed".
24. **The retry button says "Retry A" but the failed job was B.**

## Fonts and import

11. **The agent cannot load a Google Font by name** and the owner reports attaching a font does
    not work. The agent has no internet access by design. Wanted: "Add a Google Font" in the
    import flow (search by family name, fetched by the app from the official Google Fonts source,
    licence shown), and fix the font attachment path in the composer.
12. **Large fonts import slowly.** DotGothic16 (9,362 glyphs, 2 MB) took about 20 s, importing
    every glyph before cutting down to the 116-character set. Wanted: filter to the set first.

## Layout

15. **At about 800 px wide the agent panel covers the whole screen** and the font is not visible at
    all; it looks like an empty project. Wanted: the font stays reachable at narrow widths (agent
    as a drawer/sheet, or a toggle between font and agent).
16. **Fixed in PR B (a loaded font gets "What should we change?" with Make it bolder, Restyle from A, Fix spacing).** **The agent's empty state says "What are we drawing?" with "Clean simple sans / Geometric"
    chips even when a full font is already loaded.** Wanted: on a loaded font, suggest edits
    ("Make it bolder", "Restyle from A", "Fix spacing") instead of starting from scratch.

## How this was tested

- Font loaded: DotGothic16 Regular, from `github.com/google/fonts` (OFL), 116/116 characters.
- Models probed with one "Reply with OK." check each through `/api/agent/step`.

## Local agent (Claude Code over MCP), first live run (2026-10-24)

It worked: Claude connected over MCP, read A, drafted B with A's slash and submitted it as a
Draft. Found on the way:

25. **A page reload switches the local agent off without saying so.** **Fixed in PR A (sessionStorage keeps it on for the tab; a new token after a dev-server restart shows the new command).** The connect command still
    shows the same token, but the agent's calls fail until the user clicks the switch again.
26. **Optional tool fields are required.** **Fixed in PR A (absent nullable fields are null in the relay, the MCP endpoint and the tab; MCP lists them as optional).** `render_glyphs` without `height` and `guides` fails with
    "missing height"; agents must send `null`. Make optional fields truly optional.
27. **The outline gate's errors don't say how to fix them.** **Fixed in PR A (every gate issue carries a hint).** `WINDING_SAME_AS_CONTAINER` should say
    "reverse this contour's point order to cut out, or keep it outside the letter". The user's own
    A (a self-crossing slash) would also be rejected (bug 22); the agent had to split it into two
    triangles and reverse one.
28. ~~"Save project file" does nothing in the built-in browser~~ Not a bug: the Claude app shows a
    save prompt that the owner hadn't answered. Minor: the "Saved Noddy Project File" toast appears
    before the user has actually saved.
29. **Run log (C–F):** with the split slash (upper as drawn, lower reversed), C, D, E and F each
    passed the gate first try in one MCP session: 14 tool calls for 4 glyphs. The workaround is
    reusable, but an agent only finds it after reading the gate's codes (bug 27).
30. **Fixed in PR B (the composer sends to the local agent; MCP `wait_for_user_message` and `reply_to_user`).** **With "Claude Code · connected", the panel's chat box still goes to the built-in model**
    (or nowhere), so the owner can't talk to Claude from inside Noddy. Wanted (PR B): when a local
    agent is connected, the composer routes messages to it; add an MCP tool like
    `wait_for_user_message` (long-poll) that returns what the user typed in the panel, and show the
    agent's replies in the thread.

## Follow-ups from PR B QA (2026-10-26)

31. **Target "Whole set" still refuses to send until a glyph is open** in the built-in agent (#72).
32. **The connected card's "Change" button duplicates the new model chip.** Remove one.
33. **While a turn is pending, Enter with text does nothing and gives no feedback.** Queue it or say
    "wait for the current reply".
34. **Any same-origin tab holding the token can inject panel messages for the local agent.** Bind
    messages to the connected tab.
35. **The local agent gets attachment names only, not the files**, and the 20-message queue limit has
    no test. Long model names are cut off on the chip (needs a tooltip).

## Follow-ups from PR C QA (2026-10-26)

36. **Whole-set Chaos Apply is slow:** 8.8 s (Grid snap) to 16.3 s (Warp) on DotGothic16's 116
    glyphs; paper.js runs on the main thread in 100–340 ms tasks (the page yields and Stop works).
    Wanted: a progress count in the result list now, a Web Worker later.
37. **The faster self-intersection check misses rare grazing crossings** (2 of 400 random cases the
    old check caught). Sample more finely (e.g. 32 steps per cubic) or confirm near-misses exactly.
38. **Whole set skips an open glyph that is also Yours**; the docs don't say so. The preview strip's
    8th cell wraps onto its own row.

## Follow-ups from PR D QA (2026-10-26)

39. **The built-in agent can render only 8 images per message**, so a full A–Z Remix run stops short.
    Raise or reset the budget per glyph job, or let a run span several messages automatically.
40. **`TOO_SIMILAR` has no retry cap in code** (only the agent's instructions stop it) and never fired
    live; Re-roll on a receipt is a prompt to the agent, not a direct action.
41. **Remix cards can overshoot a glyph's side bearings**; `op_history` reverts only the last move.
