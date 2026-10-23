# Agent providers and local relay

The first implementation connects a user's API key directly to **OpenRouter**, **OpenCode Zen**, **OpenAI** or **Anthropic**. The browser owns the live font, native tools and permissions. A local Node relay owns provider credentials during each request and invokes one model step. It cannot edit a project, execute code, browse, load local files or register new tools.

This uses Vercel AI SDK `ToolLoopAgent` with no server-side tool execution handlers. One step returns typed calls to the existing browser session. The browser validates and executes those calls, then sends the results for the next step. Using the SDK avoids maintaining several incompatible model wire protocols in application code; it does not replace Noddy's command/permission layer. The OpenCode application/daemon SDK is unnecessary for this narrow font agent.

## Running

Node **22 or later** is required by the installed AI SDK. Use the lockfile (`npm ci`) for reproducible installs.

- Development: `npm run dev`. The Vite `agentRelayPlugin()` attaches `/api/agent/step` on the same origin as the editor.
- Production locally: `npm run build`, then `npm run agent:serve`. Open `http://127.0.0.1:5189/app/`. Override the local port with `NODDY_AGENT_PORT`.
- A static `dist/` deployment alone cannot run the relay. Deploying a public hosted version needs an authenticated HTTPS server with per-user credentials, quotas and request isolation. This loopback server deliberately rejects nonlocal connections; changing its bind address is not a public deployment solution.

The production host needs `server/agent/`, `src/agent/tool-definitions.js`, `src/agent/provider-config.js`, production dependencies and the built `dist/` directory. No model request happens on startup or when the user merely opens connection settings.

## Connections

The agent panel connects in three steps, one decision each, always a way back (issue #82):

1. **Provider.** OpenRouter (recommended, "Many free models"), OpenCode Zen, OpenAI, Anthropic. Choosing one goes straight on. The name, hint, key page, billing page and usual key prefix of each live in `PROVIDERS` in `src/agent/provider-config.js`, which the relay shares.
2. **API key.** One password field with show/hide and a "Get a key" link to the provider's key page. **Check key** posts to `/api/agent/models`, which checks the key and returns the models it can use in one request. Nothing is billed.
3. **Model.** The key's models that work with Noddy's tools, Free first (see [Live model list](#live-model-list)). **Use this model** sends **one tiny message with the agent's tools** (`POST /api/agent/step` with `purpose: "check"`); only a pass connects. That message is what proves the model itself works: OpenCode's free-tier refusal, OpenRouter's 404 for a model blocked by privacy settings and a 402 for no credits show up here, not on step 2.

The card then collapses to one Connected row (the provider with its Free or Paid badge, the model ID, Change). Only the provider and model are remembered, in `localStorage` under `noddy.agent.connection`; after a reload the card asks for the key again and tests the remembered model. Nothing is connected until a test message succeeds. A saved selection is not proof the credentials work.

| Provider     | API formats                                     | Fixed provider destinations                                                                                                                                    |
| ------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| OpenRouter   | Chat Completions                                | `https://openrouter.ai/api/v1/chat/completions`                                                                                                                |
| OpenCode Zen | Responses, Chat Completions, Anthropic Messages | `https://opencode.ai/inference/openai/v1/responses`, `…/inference/openai/v1/chat/completions`, `…/inference/anthropic/v1/messages` (one endpoint per protocol) |
| OpenAI       | Responses, Chat Completions                     | `https://api.openai.com/v1/responses`, `…/chat/completions`                                                                                                    |
| Anthropic    | Messages                                        | `https://api.anthropic.com/v1/messages`                                                                                                                        |

The relay refuses any other URL, and the guarded fetch treats a redirect as an error, so a key can only reach its own provider's host. The model ID is always the raw provider ID, without OpenCode's `opencode/` configuration prefix.

**OpenRouter** is OpenAI-compatible Chat Completions with tool calling through `@ai-sdk/openai-compatible`, with the fixed URL above, a Bearer key and one optional header, `X-Title: Noddy`. No `HTTP-Referer` is sent. Its tool schemas get the same trimmed wire schema as OpenAI's, because OpenRouter forwards them to whichever upstream serves the model. Model IDs may start with `~` (OpenRouter's "latest" aliases, `~anthropic/claude-sonnet-latest`). Free-model limits (OpenRouter's [limits page](https://openrouter.ai/docs/api-reference/limits)): 20 requests a minute, and 50 a day until $10 of credits have ever been bought, then 1,000 a day; the card says so under the Free heading and shows the live counter from `/key` when it has one.

**OpenCode Zen** has no single base URL. Its [endpoint table](https://opencode.ai/docs/zen/#endpoints), checked 23 October 2026, gives one URL per protocol under `https://opencode.ai/inference/`: Responses for GPT, Muse and Grok; Anthropic Messages for Claude and the Qwen Flash, Plus and older Max variants; Chat Completions for Qwen 3.8 Max, DeepSeek, MiniMax, GLM, Kimi, Mistral, `big-pickle` and every free model; Google Gemini and Jev (System One) use routes Noddy does not speak yet. Automatic routing in `resolveProviderProtocol(provider, model, protocol='auto')` follows that table: exact IDs for Qwen and `big-pickle`, then families (`gpt-`, `muse-`, `grok-`, `claude-*`, `kimi-`, `glm-`, `deepseek-`, `minimax-`, `mistral-`) and the `-free` suffix (Chat Completions, except `jev-`). A model of an unknown family is not offered in the list and is refused with `PROTOCOL_REQUIRED` before any upstream call; the app does not guess or probe endpoints. `server/agent/zen-routing.fixture.js` holds the documented table and the live list of 23 October, and a check resolves every ID in it. Mapping changes need documentation evidence and a fixture row.

Why a real Zen connection can fail (live probes, 23 October 2026, no real key; the fixes are in this PR):

- The relay used to send to the legacy `https://opencode.ai/zen/v1/…`. Its Messages route answers a Bearer token with `401 Missing API key.`; the current `/inference/anthropic/v1/messages` route reads it. Every Zen Claude and Qwen Flash/Plus model was affected.
- Six documented models were routed wrongly and greyed out as "format unknown": the four free models `beam-free`, `flint-40b-free`, `exo-free` and `nemotron-3.5-super-vl-free`, `mistral-large-4` (Chat Completions) and `muse-wonder-1.0` (Responses).
- Free models answer **`403 FreeTierError`** ("OpenCode's free tier can only be used from within OpenCode") to a request without a valid key, and the old card turned every 403 into "Key not accepted". It is now its own message. Whether a valid key lifts the restriction **could not be verified without a real key**; the free models are still listed first (they are free), and after that refusal the card moves the selection to the first Paid model. Noddy does not imitate OpenCode's client headers to get around it.
- `GET /inference/v1/models` is public (200 without a key) and answers 401 for a bad key, so listing the models also checks a Zen key.

**Anthropic** uses its own Messages API only, so Automatic always resolves to **Messages** whatever the model ID, and an explicit Responses or Chat Completions choice is refused with `UNSUPPORTED_PROTOCOL` before any key leaves the relay. The relay sends the key as the `x-api-key` header with `anthropic-version: 2023-06-01`; it is never sent as a Bearer token or to any other host. (OpenCode Zen's Messages route keeps its own Bearer token.) A model's tool support comes from the model list, not from a guess.

Gemini's Google protocol and Jev's System One protocol are not implemented. A model must support function tools; attached pictures additionally require vision support.

Keys live in the browser's current session and the relay's request memory only. They are not read from OpenCode configuration, logged, stored in `localStorage`, written to disk, bundled into JavaScript or saved in `.gs2`. Reloading/clearing the session discards them. Native tool arguments and system instructions never contain the key. The relay disables SDK telemetry and warning payload logging, writes nothing to a log (a check spies on the console and streams), strips raw response headers/errors, and requests `store:false` for OpenAI-compatible Responses. This does not override a provider's independent retention policy; consult its policy before sending private font data. Changing provider/model should start a fresh transcript so opaque provider continuation data is not replayed across providers.

## Live model list

**Route.** `POST /api/agent/models` with exactly `{provider, apiKey}`. It is the **key check and the list in one request**: every provider answers 401 for a bad key, except OpenRouter, whose `/models` and `/models/user` answer 200 even for a bad key, so its key is checked first on `GET /api/v1/key` and only then are models listed. There is no URL, header, model or option field; unknown fields are refused with `INVALID_REQUEST` before anything is sent upstream. It has the step route's local Host/Origin/`Sec-Fetch-Site` guards, an uncompressed JSON body capped at 2 KiB, its own concurrency (2) and rate (30 per minute) limits so listing never uses up the step route's, and a 15-second timeout that aborts the upstream call (a disconnected browser aborts it too). It returns `{provider, catalog, models, freeRequests?}`. `catalog` is `live`, `cache` or `snapshot` (models.dev) or `provider` (OpenRouter's own list). Each model is `{id, tools, vision, price, released, context, text, deprecated}`; OpenRouter models also carry `expires` and `varies`. `null` always means "not known".

**Fixed destinations.** Each URL is a literal in the relay's allowlist (`MODEL_LIST_URLS`, `OPENROUTER_URLS`, `CATALOG_URL` in `server/agent/providers.js`); the fetch used for them refuses any other URL, any method but GET and any body, and treats a redirect as an error, so a key cannot be forwarded elsewhere.

| Provider     | URL                                                                                              | Credential                                      |
| ------------ | ------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| OpenRouter   | `https://openrouter.ai/api/v1/key` (the check), then `…/models/user`, falling back to `…/models` | `Authorization: Bearer`                         |
| OpenCode Zen | `https://opencode.ai/inference/v1/models`                                                        | `Authorization: Bearer`                         |
| OpenAI       | `https://api.openai.com/v1/models`                                                               | `Authorization: Bearer`                         |
| Anthropic    | `https://api.anthropic.com/v1/models?limit=1000`                                                 | `x-api-key` and `anthropic-version: 2023-06-01` |

`/models/user` lists the models this account may use, with its provider and privacy settings applied. `/key` also carries `free_model_daily_requests`; only its numbers (`remaining`, `limit`) are passed on, never its label or any other field. Only IDs the step route would accept are listed (at most 1,000).

**Catalog.** Price, tool, vision, context and text-output data for OpenAI, Anthropic and Zen come from the open [models.dev](https://models.dev) database that OpenCode also uses (`https://models.dev/api.json`; it receives no credentials). The relay fetches it server-side, keeps the three tracked providers (`openai`, `anthropic`, and `opencode` for Zen) in memory for 6 hours, shares one fetch between concurrent requests and, if models.dev is unreachable, slow (8 s), not 200, larger than 24 MB or not the shape expected, serves the stale cache or else the bundled snapshot `server/agent/model-snapshot.js`. After a failure it does not retry for a minute. A catalog problem never fails the model list; the response's `catalog` field says what was used. Regenerate the snapshot with `npm run models:snapshot` (add `-- --input api.json` to use a saved copy). OpenRouter models come from OpenRouter itself, never from models.dev: `tools` from `supported_parameters`, `vision` from `architecture.input_modalities`, `context` from `context_length`, `text` from `output_modalities`, `released` from `created`, `expires` from `expiration_date`, and the price per million tokens from the per-token string times 1e6 (a negative price, `-1`, means the price varies: a router, neither Free nor Paid).

### What a model needs to appear in the list

`src/agent/model-requirements.js` is the one place that decides which models the card offers. Raising a requirement later is one edit there; the list, its count line and its tests follow.

| Requirement              | Rule                                                                                                        |
| ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| **Required**: tools      | Tool / function calling (OpenRouter `supported_parameters` has `tools`; models.dev `tool_call`).            |
| **Required**: text       | The model writes text (not image, music or embedding models). Unknown counts as passing.                    |
| **Required**: context    | At least 32,000 tokens, **when known**. Unknown counts as passing.                                          |
| **Required**: current    | Not marked deprecated by the catalog and not past its end date.                                             |
| **Required**: API format | An API format Noddy speaks (some Zen families, Gemini and Jev, have none yet).                              |
| **Recommended**: Vision  | Image input, for reference images and for the agent checking its own renders. A badge, and it sorts higher. |
| **Unknown**              | The catalog has no data on tool support: hidden by default, reachable through the "Model ID" field.         |

A model that fails a requirement is **not shown**; nothing is greyed out. Embedding, speech, image-only, moderation and realtime models fail the tools or text requirement. The order is **Free and supported first, then Paid and supported**; inside each group models with Vision come first, then the larger context window, then the name. One quiet line under the list says "Showing 42 models that work with Noddy's tools." and, next to it, offers "Use a model ID" for a model that is not listed; there is no show-all toggle. A key with no supported model says so in the Model ID field and suggests OpenRouter, which has free models that use tools.

| Badge  | Meaning                                                                              |
| ------ | ------------------------------------------------------------------------------------ |
| Free   | `cost.input` and `cost.output` are both 0 (OpenRouter: both prices `"0"`)            |
| Paid   | a price is known and not both 0 (shown as input / output dollars per million tokens) |
| Tools  | tool calling (every listed model has it; it stays in each option's accessible name)  |
| Vision | the model accepts images                                                             |

A dated ID (`…-20251001`) or `-latest` alias uses its plain model's catalog entry. Catalog entries typed `embedding`, `image` or `realtime`, and unknown IDs that are plainly not chat models (embedding, whisper, tts, dall-e, moderation, transcribe, realtime, image), count as unable to use tools.

**What the card does with it.** The list is a listbox in two groups (**Free · n**, **Paid · n**; a heading only when both have rows). The model to start on is the first one in the first group, skipping a model that ends within 14 days. A search field (a combobox over the list) appears over 12 models and filters across both groups; with no match it offers the text as a model ID. Keyboard: Tab to the search field (or the list), Up/Down/Home/End/Page keys move, Enter chooses, **Enter on the model already chosen confirms** it (so accepting the start is Enter, Enter), Esc clears the search and never leaves the card or minimizes the panel. The card never calls a provider or models.dev itself; it posts to the relay.

**Keys and cache.** The key is never stored, logged, cached or put in a URL. The card keeps a copy in memory only while a model can still be changed; it is dropped, with the list, when the provider is changed, on disconnect, when the panel is disposed and on `clearKey()`. The browser holds the list in memory for the session only; the relay caches nothing per key.

## Errors

The relay never relays raw provider text by default: it may echo a prompt, an image, a key or headers. A failure is `{error:{code, message, status, hint?, detail?}}`:

- `code`: `PROVIDER_AUTH` (401), `PROVIDER_CREDITS` (402), `PROVIDER_FORBIDDEN` (403), `PROVIDER_MODEL` (404, HTTP 422), `PROVIDER_LIMIT` (429), `PROVIDER_REQUEST` (other 4xx, HTTP 422), `PROVIDER_UNAVAILABLE` (5xx, 408, HTTP 502), `CANCELLED`, plus the relay's own (`INVALID_REQUEST`, `UNSUPPORTED_PROTOCOL`, `PROTOCOL_REQUIRED`, `BUSY`, …).
- `status`: the provider's own HTTP status.
- `hint`: one fixed word derived from the provider's text, never the text itself: `free-tier-only` (OpenCode's free tier, 403), `data-policy` (OpenRouter's privacy settings block a free model, 404; the exact wording is matched loosely and **needs a real-key check**), `no-tools` (the model does not take tools).
- `detail`: the provider's `error.message` only, cleaned (the key and any `sk-…` / `Bearer …` text removed, markup and control characters removed, one line, 200 characters at most, plain text). It is returned **only for connect checks**: the models route, and the step route when the browser sends `purpose: "check"`. A run never gets it.

The card turns these into `{status} · {what happened} — {what to do}` with a closed-by-default **Details** disclosure (status, host, the cleaned message). The same words appear in the thread when a run fails, with "Change model" (which starts a new chat) and, for a refused key, "Re-enter key".

## Browser contract

`POST /api/agent/step`, `Content-Type: application/json`, exact same-origin `Origin`:

```json
{
	"provider": "openai",
	"protocol": "auto",
	"model": "a-model-id-entered-by-the-user",
	"apiKey": "the-user-supplied-key",
	"purpose": "check",
	"context": { "projectName": "My Font", "glyphId": "glyph-0x6E", "unitsPerEm": 2048 },
	"messages": [{ "role": "user", "content": "Add 20 units to the right bearing." }]
}
```

`purpose` is optional and may only be `"check"`: the connect flow's one tiny test message sets it, which lets the relay return a cleaned provider message in a failure (see [Errors](#errors)). A run never sends it, and it is never forwarded to the provider.

The response is `{text,messages,toolCalls,finishReason,usage}`. Each call is `{toolCallId,toolName,input}`. Append returned `messages` verbatim to the model transcript (including opaque reasoning continuation data), execute the native call, then append:

```json
{
	"role": "tool",
	"content": [
		{
			"type": "tool-result",
			"toolCallId": "the-returned-call-id",
			"toolName": "the-returned-tool-name",
			"output": { "type": "json", "value": { "ok": true } }
		}
	]
}
```

`value` must be the **actual native result**, including any error. Never fabricate a success. A request must resolve all previous calls, with matching names and unique IDs. The relay rejects client-supplied system messages, tool definitions, arbitrary URLs/provider options and unknown tools. Tool definitions and argument validation are imported from the same checked-in module used by native execution. Credentials and connection choices are not tool inputs.

Context accepts `projectId`, `projectName`, `glyphId`, `revision`, `selection`, `writable` and `unitsPerEm`. Context is descriptive, untrusted prompt data; it grants no write authority. The browser's captured native session enforces authority and revisions.

Errors are `{error:{code,message,status,hint?,detail?}}` with an appropriate HTTP status (see [Errors](#errors)). Error messages distinguish authentication, access, credits, rate limits, a missing model, protocol/image incompatibility, invalid input and cancellation without returning raw upstream text. The UI should render all text as text, never trusted HTML.

An unknown Zen model in Automatic mode returns `PROTOCOL_REQUIRED` with directions to Advanced before any upstream call. Unsupported provider formats return `UNSUPPORTED_PROTOCOL`. Neither error echoes the supplied model/key values. `protocol` may be omitted to use Automatic; clients may explicitly send `responses`, `chat` or `messages` when supported by the provider.

## Attachments and limits

Images use an AI SDK user content part: `{type:"image",image:"data:image/png;base64,…",mediaType:"image/png"}`. PNG, JPEG and WebP are accepted with byte-signature checks. Remote image URLs, SVG and provider file references are rejected. OTF/TTF files stay local: the chat attachment parser supplies a bounded reference summary, not the binary or a filesystem path. Attaching a font does not silently replace the current project.

Relay limits: 8 MiB serialized request; 4 MiB per image; 4 images per transcript; 96 messages; 160,000 text/serialized-tool/continuation characters; 160,000 bytes per tool JSON value; 8 proposed tool calls per step; 4,096 maximum output tokens; one model step per HTTP request; 90 seconds per request; two simultaneous requests; 30 starts per minute. The browser applies its smaller cumulative image budget and a bounded multi-step run. Input ceilings constrain resource use, not exact dollar spending; model prices vary. Full-spend accounting is deferred.

Stop aborts the fetch and propagates to the provider. A disconnected browser also aborts generation. Completed browser edits remain in normal history; the relay never replays a write. Timeout/limit/provider failures have no automatic billed retries. Provider redirects are rejected, preventing a redirect from forwarding the supplied key elsewhere. No CORS access is enabled, and both Host and Origin are checked against the loopback listener to prevent cross-site requests and DNS rebinding.

## Verification and extension

Run `npm run typecheck:agent-relay` and `npm run test:agent-relay`. Tests use the real `ToolLoopAgent` and actual installed provider adapters with mocked transports for every provider/format combination (OpenRouter and each Zen protocol included). `server/agent/models.checks.js` covers the key check and model list with mocked upstreams for all four providers and models.dev (live, cached, concurrent, unreachable, malformed, oversized and hung catalog data falling back to the snapshot; OpenRouter's `/key` 200 and 401, `/models/user` fallback, tools, free, vision, context, `-1` price, expiry, `~` IDs and over 500 models; allowlist and redirect refusal; key redaction; the key never reaching a log; guards, limits and timeout of `POST /api/agent/models`), and pushes OpenRouter's `supported_parameters` and models.dev's `tool_call` through the model requirements end to end. `server/agent/relay.checks.js` covers a step with tools, the error envelope for 400, 401, 402, 403 (OpenCode's free tier), 404 (gone, privacy settings, no tools), 429 and 502, `detail` redaction and its absence without `purpose: "check"`, and each Zen protocol's endpoint and credential. The browser side is covered by `src/agent/tests/model-requirements.test.js` (the requirements and the ordering), `connect-flow.test.js` (memory, key trimming, grouping, search, pre-selection, every error's copy), `connect-api.test.js`, `agent-listbox.test.js`, `agent-model-list.test.js`, `agent-connect-card.test.js` (every step, forward and back, cancel while checking, reload memory, keyboard), `connect-form-grid.test.js` (the form grid, read from the stylesheet) and the connect cases in `agent-panel.test.js`. No real key/model call is used in automated tests. **Live credential and model compatibility remains a user-key smoke test**: with a real key, paste an OpenRouter key, use the pre-selected free model, send "hi"; reload and see only the key asked for; then try OpenCode Zen with a paid model and a free model.

The exact Muse Contributor Free regression runs through the real Responses adapter with a mocked upstream and verifies endpoint, model ID, tools, key isolation and no fallback/retry. OpenAI's [documented strict schema subset](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas) does not list `uniqueItems`. The installed SDK sends `strict:false` unless explicitly requested. For compatibility, the relay omits only that keyword from advertised direct-OpenAI/Responses schemas; the unchanged canonical validator still rejects duplicate targets before any browser edit. Tests cover both wire omission and duplicate rejection. This is not a claim of live-provider schema acceptance.

To add a provider, add it to `PROVIDERS` in `src/agent/provider-config.js`, give it a fixed endpoint in `providers.js` and a verified SDK adapter, add protocol serialization/credential/error tests and add the corresponding UI choice. Do not add a browser-supplied `baseURL` or a general-purpose proxy.

The 2 October dependency audit reports four pre-existing, unchanged findings: Vitest/browser/mocker 4.1.10 (moderate), and brace-expansion 5.0.9 (high). The installed SDK/provider adapters have no reported advisory in that audit. Those existing development/lint dependency findings require a separate targeted upgrade; no broad dependency update was folded into this feature.
