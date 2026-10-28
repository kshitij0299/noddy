# Plan: launch Noddy (open source, local with Claude Code, and hosted)

Owner request (2026-10-28). Noddy works really well when Claude Code drives it (the Slash Gothic run,
2026-10-26: all 62 glyphs remixed live over MCP). Launch it two ways, from one landing page:

1. **Run it with Claude Code** (free, local): a **Copy prompt** button. The user pastes the prompt
   into Claude Code and everything happens: clone, install, start Noddy, open it in their browser,
   connect Claude Code as the agent. No manual token copying.
2. **Use it online** (hosted by the owner, the owner pays): a link to the hosted app. It must have
   all the goodness of the Claude Code run, powered by the owner's Anthropic API key, with hard
   spending limits and a login.

**Scope (owner, 2026-10-28): make Noddy ready to go public and ready to go live. The owner decides
later where and how to host;** so build hosting-agnostic (a Dockerfile plus plain env vars that run
on any Node host), document the steps, and stop before choosing a provider or deploying.

This file is the brief for a cloud agent. Each milestone has a GitHub issue (milestone "Launch v0.1").
Follow `CLAUDE.md`, `AGENTS.md` and `docs/agentic/WORKFLOW.md` (one PR per issue into `dev`, QA tiers,
cost discipline). Bugs go in `docs/agentic/SMOKE-TEST-BUGS.md` with an issue.

## Owner decisions

| Decision | Answer |
|---|---|
| Repo visibility | **Public** (it's a GPL-3.0 fork of Glyphr Studio 2; open source). Flip only after the secret scan in L3 is clean. |
| Models online | **Sonnet for everyone; Opus only for the owner.** Haiku allowed for cheap sub-steps. |
| Login online | **Owner decides at go-live.** Build both: a shared password (signed cookie, works anywhere) and support for an access proxy in front (e.g. Cloudflare Access email invites) via a trusted identity header. |
| Spending cap | **Owner sets at go-live.** Build the caps as env settings (suggested start: $20/month Console cap, Noddy daily caps below). |
| Host | **Owner decides at go-live.** Ship a Dockerfile + env docs that run on any Node host (Fly.io, Render, a VPS); nothing provider-specific. |

## The core idea: one Noddy playbook

The run was good because of the rules the driving agent followed, not only the tools: stay in the
owner's reference-mark family, look at every glyph, regret one move, keep one session open, save to
disk. Write those rules **once** and feed both paths from the same source:

- Local: the MCP server's `instructions` (today an inline string in `server/agent/local-agent.js`
  `createMcpServer`) plus a Claude Code skill shipped in the repo.
- Hosted: the built-in agent's system prompt / `REMIX_LOOP` (`src/agent/tool-definitions.js`).

Then any improvement lands in both. Remix taste to encode (from the owner): add marks in the
reference's style; reshape only a little (about one glyph in three); never wave/bulge/twist on pixel
fonts; mirror and kick looked bad; thin stems need the reference mark copied, not a nick.

## Milestones (do them in this order)

### L1. Foundations (both paths need these)
Existing issues: **#98** jobs survive MCP reconnects, **#107** reload keeps the open project and the
dev server saves to `tmp/projects/` on disk, **#111** no 8-render cap on long runs, **#108** Remix deck
fixes and the "add only" option, **#112** `/mcp` tool list refreshes without a restart.
Done when a 26-glyph Remix run survives a reconnect and a reload without losing a draft.

### L2. The Noddy playbook (one source of truth)
- `src/agent/playbook.md` (or `.js` exporting text): the rules above, the Remix loop, the save rules,
  short. Imported by the MCP server's `instructions` and by the built-in agent's prompt.
- A Claude Code skill in the repo (`.claude/skills/noddy/SKILL.md`) for cloned users: how to start
  Noddy, connect, run a Remix, save. Keep it in sync with the playbook (a test checks shared lines).
- An eval: a scripted Remix run on a fixture font (headless, MCP client from
  `@modelcontextprotocol/sdk`, like `tmp/noddy-mcp/driver.mjs` did) asserting: every take submits,
  no TOO_SIMILAR loops, the reference card appears in every hand, tool replies stay in budget.

### L3. Local path: "Run it with Claude Code" in one paste
Starting point (2026-10-28): the repo already has a `/noddy` Claude Code command
(`.claude/commands/noddy.md`) that starts the dev server, fetches the pairing token from
`/api/agent/bridge`, registers the MCP server and opens the browser; the user then turns on Local
agent once and runs `/mcp` reconnect. L3 removes those two manual steps and makes it work from a
fresh clone.
Goal: a user pastes one prompt into Claude Code (anywhere on their machine) and ends up with Noddy
open in their browser and Claude Code connected.
- **One command:** `npm run noddy` (new script): `npm ci` if needed, pick a free port (default
  5300), start the dev server, write a **stable per-install token** to `.noddy/token` (git-ignored;
  today the token changes every start, which forces re-pairing), register the MCP server for
  Claude Code (project-scoped `.mcp.json` committed with the header read from an env var, or
  `claude mcp add` with the token; verify which Claude Code picks up without a restart), and open
  the browser at a URL that turns the Local agent on and pairs the tab automatically (loopback only;
  keep the Host/Origin checks of `assertLocalRequest`).
- **Works without a restart too:** a running Claude Code session may not see a newly added MCP
  server until `/mcp` reconnect or a new session. Ship a fallback CLI that needs no MCP
  registration: `npm run noddy:tool -- <tool> '<json>'` talking to a small background daemon that
  keeps ONE MCP session open (productize `tmp/noddy-mcp/driver.mjs`: persistent session, revision
  chaining, renders saved as PNG paths, a `/save` route that writes the open project to
  `tmp/projects/`). The skill tells Claude to use MCP tools if present, else the CLI.
- **The copy prompt** (shown on the landing page and in the README), roughly:
  > Set up Noddy for me: clone https://github.com/kshitij0299/noddy, run `npm run noddy`, open it
  > in my browser, connect yourself as Noddy's agent, then ask me what font to make.
  Test it end to end on a clean machine/user account: macOS first, then Linux; Windows best effort.
- **Split `CLAUDE.md`:** today it holds the owner's personal rules (port 5300, the owner's
  Downloads, cost rules). Cloned users get a clean `CLAUDE.md` (what Noddy is, how to run it, the
  playbook skill). Move owner/contributor rules to `docs/agentic/CONTRIBUTING-AGENTS.md` and link it.
- **Go public:** run a secret scan over the whole git history (gitleaks or trufflehog) and check that
  `.env.local`, keys and tokens were never committed; decide which internal docs stay (default: keep
  `docs/agentic`, it's the build log); README with screenshots, licence (GPL-3.0, Glyphr Studio 2
  credit, NOTICE), and the Slash Gothic sample (owner to approve shipping it; it's an OFL derivative
  of DotGothic16, renamed, with its licence). **The visibility flip is the owner's click**, after the
  scan report.

### L4. Hosted mode: "Use it online" with all the goodness
The relay today refuses anything that isn't loopback (`assertLocalRequest`) and expects each user to
bring a key. Add a **hosted mode** (env `NODDY_HOSTED=1`), protected area: tier-3 QA.
- **Server-side key:** `ANTHROPIC_API_KEY` from the host's secrets; never sent to the browser.
  The connect card and key step are skipped; the model chip lists only allowed models.
- **Who can use it:** Cloudflare Access in front (email invites) by default; also support a shared
  password (signed cookie) for hosts without Cloudflare. Identify the user (Access email header or
  the password session) for per-user caps.
- **Spending limits, three layers:** (1) the Anthropic Console workspace cap (owner sets it, $20/mo
  default), (2) Noddy daily budgets per user and in total, in tokens and dollars, checked before each
  request, with a friendly "Out of credits for today" in the panel, (3) per-request limits: max
  output tokens, max tool calls per run, max images per run, max run length.
- **Models:** Sonnet for everyone; Opus only for the owner's identity; Haiku for cheap sub-steps.
  Use **prompt caching** for the tool definitions and the playbook.
- **Same goodness as Claude Code: run the hosted agent with the Claude Agent SDK.** Recommended
  design: keep the tools exactly where they run today (in the user's tab, behind the same bridge the
  local MCP path uses) and replace the human's Claude Code with a server-side agent built on the
  **Claude Agent SDK** (the harness Claude Code itself uses), connected to that bridge as an MCP
  client, with the L2 playbook as its instructions. Then hosted and local share tools, playbook and
  agent harness; only the model and the caps differ. Compare it with the browser built-in loop on the
  L2 eval and pick the better one; the fallback is the built-in agent with the L2 playbook, renders and looks at
  every glyph, regrets a move, runs whole-set jobs across messages (L1 #111), and keeps going without
  the user re-prompting. Compare against the local run on the same fixture (the L2 eval) before
  launch.
- **Usage log:** per user per day (tokens, cost, runs), no prompt contents with secrets. A tiny owner
  view or a log file is enough.
- **UI changes (hosted only):** no Local agent switch; no provider/key setup; a small credits meter;
  "Out of credits" state; **Save project file** made obvious (browser Restore isn't durable, bug 53);
  a footer link to "Run it yourself with Claude Code".
- **Deploy-ready, not deployed:** a Dockerfile serving the `vite build` output plus the relay, a
  health check, an `.env.example` listing every setting (key, login mode, caps, allowed models,
  owner identity), and `docs/HOSTING.md` with step-by-step go-live for any Node host. A local
  `docker run` with a mocked provider must pass the L4 checks. **The owner picks the host, creates
  accounts, sets secrets and caps, and deploys.**

### L5. Landing page
- Two big choices: **Use it online** (to the login, then the app) and **Run it with Claude Code**
  (a **Copy prompt** button with the L3 prompt, plus a link to the README).
- Show the Slash Gothic remix as the hero example (owner approves the assets); credit Glyphr Studio;
  link the GitHub repo.
- Design first (Figma file in `docs/agentic/FIGMA.md` or a Pencil/HTML mock) for owner approval, in
  Noddy's tokens (peach/brown, ROND 60 headings, outlined icons; `noddy-ui-feedback`: every control
  earns its place). Then build as a small static page (separate from the app bundle), deployed with
  the hosted app or on its own.

### L6. Release and launch
- Issue hygiene first (#115). Release `dev` → `main` (#116), tag `v0.1.0`, release notes.
- Hosted build verified locally in Docker behind the login with caps (a deliberately tiny cap test:
  the panel shows "Out of credits"); going live on a host is the owner's step.
- The copy prompt verified on a clean account. Landing page live. Owner flips the repo public.

## What a cloud agent can and can't do

- Can: code, tests, headless browser checks, docs, PRs into `dev`, MCP evals against a local dev
  server it starts itself (any port except 5187), mocked Anthropic responses for hosted-mode tests.
- Can't / must ask the owner: flip the repo public, create hosting or Cloudflare accounts, set
  secrets or spending caps, spend real API credits beyond a tiny smoke test, deploy, buy anything.
- Never: read or print `.env.local`; commit secrets; use the owner's browser.

## Not on GitHub (owner's laptop only)

`tmp/` is git-ignored: the owner's fonts (`tmp/projects/*.gs2`) and the original MCP helper
(`tmp/noddy-mcp/driver.mjs`, the persistent-session idea L3 productizes; its design is described
above, so the cloud agent doesn't need the file). Slash Gothic files for the landing page: the owner
supplies them when L5 starts.
