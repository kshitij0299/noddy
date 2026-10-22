# Agent providers and local relay

The first implementation connects a user's API key directly to **OpenAI**, **OpenCode Zen** or **Anthropic**. The browser owns the live font, native tools and permissions. A local Node relay owns provider credentials during each request and invokes one model step. It cannot edit a project, execute code, browse, load local files or register new tools.

This uses Vercel AI SDK `ToolLoopAgent` with no server-side tool execution handlers. One step returns typed calls to the existing browser session. The browser validates and executes those calls, then sends the results for the next step. Using the SDK avoids maintaining several incompatible model wire protocols in application code; it does not replace Noddy's command/permission layer. The OpenCode application/daemon SDK is unnecessary for this narrow font agent.

## Running

Node **22 or later** is required by the installed AI SDK. Use the lockfile (`npm ci`) for reproducible installs.

- Development: `npm run dev`. The Vite `agentRelayPlugin()` attaches `/api/agent/step` on the same origin as the editor.
- Production locally: `npm run build`, then `npm run agent:serve`. Open `http://127.0.0.1:5189/app/`. Override the local port with `NODDY_AGENT_PORT`.
- A static `dist/` deployment alone cannot run the relay. Deploying a public hosted version needs an authenticated HTTPS server with per-user credentials, quotas and request isolation. This loopback server deliberately rejects nonlocal connections; changing its bind address is not a public deployment solution.

The production host needs `server/agent/`, `src/agent/tool-definitions.js`, `src/agent/provider-config.js`, production dependencies and the built `dist/` directory. No model request happens on startup or when the user merely opens connection settings.

## Connections

The user picks a provider from one dropdown (OpenAI, OpenCode Zen, Anthropic), then enters a model ID and key. Choosing a provider fills the Model field with that provider's suggested model (Anthropic: `claude-sonnet-5-5`); the field stays editable and nothing is connected until "Check connection" succeeds. API format defaults to **Automatic**, with an explicit override in Advanced. A saved/selected configuration is not proof the credentials work; only an actual request establishes that. Model IDs are editable because availability changes. No quota is assumed, and failed requests are not retried automatically.

| Provider     | API formats                                     | Fixed provider destination     |
| ------------ | ----------------------------------------------- | ------------------------------ |
| OpenAI       | Responses, Chat Completions                     | `https://api.openai.com/v1`    |
| OpenCode Zen | Responses, Chat Completions, Anthropic Messages | `https://opencode.ai/zen/v1`   |
| Anthropic    | Messages                                        | `https://api.anthropic.com/v1` |

Zen's model families do **not** all use Chat Completions. Its [official endpoint table](https://opencode.ai/docs/zen/#endpoints), checked 3 October 2026, assigns GPT/Muse/Grok to Responses, Claude to Messages, and Kimi/GLM/DeepSeek/MiniMax to Chat Completions. Automatic routing follows these documented families. In particular, `muse-spark-1.3-contributor-free` uses **Responses**. Qwen uses exact model mappings: `qwen3.8-max` uses Chat Completions, while the listed Flash/older Max/Plus variants use Messages. Unknown Zen models require an explicit Advanced format choice; the app does not guess or probe endpoints. OpenAI Automatic uses Responses. Explicit supported choices are preserved, even when they differ from the mapping.

Both the browser's help text and the relay use the pure `resolveProviderProtocol(provider, model, protocol='auto')` function in `src/agent/provider-config.js`. The relay resolves `auto` independently before creating a provider or sending a key. This resolves the format, not the model's availability or access rights. Mapping changes need documentation evidence and regression tests. Use the raw provider model ID, without OpenCode's `opencode/` configuration prefix.

Anthropic uses its own Messages API only, so Automatic always resolves to **Messages** whatever the model ID, and an explicit Responses or Chat Completions choice is refused with `UNSUPPORTED_PROTOCOL` before any key leaves the relay. The relay sends the key as the `x-api-key` header with `anthropic-version: 2023-06-01`; it is never sent as a Bearer token or to any other host. (OpenCode Zen's Messages route keeps its own Bearer token.) The model ID is not validated against a list: Anthropic rejects an unknown one, and the card shows its existing "This model can't use tools · Pick another" outcome.

Gemini's Google protocol and Jev's System One protocol are not implemented in this milestone. A model must support function tools; attached pictures additionally require vision support. A provider error identifies these possible mismatches without disclosing raw provider diagnostics.

Keys live in the browser's current session and the relay's request memory only. They are not read from OpenCode configuration, logged, stored in localStorage, written to disk, bundled into JavaScript or saved in `.gs2`. Reloading/clearing the session discards them. Native tool arguments and system instructions never contain the key. The relay disables SDK telemetry and warning payload logging, strips raw response headers/errors, and requests `store:false` for OpenAI-compatible Responses. This does not override a provider's independent retention policy; consult its policy before sending private font data. Changing provider/model should start a fresh transcript so opaque provider continuation data is not replayed across providers.

## Browser contract

`POST /api/agent/step`, `Content-Type: application/json`, exact same-origin `Origin`:

```json
{
	"provider": "openai",
	"protocol": "auto",
	"model": "a-model-id-entered-by-the-user",
	"apiKey": "the-user-supplied-key",
	"context": { "projectName": "My Font", "glyphId": "glyph-0x6E", "unitsPerEm": 2048 },
	"messages": [{ "role": "user", "content": "Add 20 units to the right bearing." }]
}
```

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

Errors are `{error:{code,message}}` with an appropriate HTTP status. Error messages distinguish authentication/access, rate/credit limits, model/protocol/image incompatibility, invalid input and cancellation without returning raw upstream text. The UI should render all text as text, never trusted HTML.

An unknown Zen model in Automatic mode returns `PROTOCOL_REQUIRED` with directions to Advanced before any upstream call. Unsupported provider formats return `UNSUPPORTED_PROTOCOL`. Neither error echoes the supplied model/key values. `protocol` may be omitted to use Automatic; clients may explicitly send `responses`, `chat` or `messages` when supported by the provider.

## Attachments and limits

Images use an AI SDK user content part: `{type:"image",image:"data:image/png;base64,…",mediaType:"image/png"}`. PNG, JPEG and WebP are accepted with byte-signature checks. Remote image URLs, SVG and provider file references are rejected. OTF/TTF files stay local: the chat attachment parser supplies a bounded reference summary, not the binary or a filesystem path. Attaching a font does not silently replace the current project.

Relay limits: 8 MiB serialized request; 4 MiB per image; 4 images per transcript; 96 messages; 160,000 text/serialized-tool/continuation characters; 160,000 bytes per tool JSON value; 8 proposed tool calls per step; 4,096 maximum output tokens; one model step per HTTP request; 90 seconds per request; two simultaneous requests; 30 starts per minute. The browser applies its smaller cumulative image budget and a bounded multi-step run. Input ceilings constrain resource use, not exact dollar spending; model prices vary. Full-spend accounting is deferred.

Stop aborts the fetch and propagates to the provider. A disconnected browser also aborts generation. Completed browser edits remain in normal history; the relay never replays a write. Timeout/limit/provider failures have no automatic billed retries. Provider redirects are rejected, preventing a redirect from forwarding the supplied key elsewhere. No CORS access is enabled, and both Host and Origin are checked against the loopback listener to prevent cross-site requests and DNS rebinding.

## Verification and extension

Run `npm run typecheck:agent-relay` and `npm run test:agent-relay`. Tests use the real `ToolLoopAgent` and actual installed provider adapters with mocked transports for all six provider/format combinations. They verify images, tool definitions, opaque Responses continuation, native result replay, argument rejection, error redaction, no automatic retries, abort propagation and local HTTP guards. No real key/model call is used in automated tests. Live credential/model compatibility remains a user-key smoke test.

The exact Muse Contributor Free regression runs through the real Responses adapter with a mocked upstream and verifies endpoint, model ID, tools, key isolation and no fallback/retry. OpenAI's [documented strict schema subset](https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas) does not list `uniqueItems`. The installed SDK sends `strict:false` unless explicitly requested. For compatibility, the relay omits only that keyword from advertised direct-OpenAI/Responses schemas; the unchanged canonical validator still rejects duplicate targets before any browser edit. Tests cover both wire omission and duplicate rejection. This is not a claim of live-provider schema acceptance.

To add a provider, add it to `PROVIDERS` in `src/agent/provider-config.js`, give it a fixed endpoint in `providers.js` and a verified SDK adapter, add protocol serialization/credential/error tests and add the corresponding UI choice. Do not add a browser-supplied `baseURL` or a general-purpose proxy.

The 2 October dependency audit reports four pre-existing, unchanged findings: Vitest/browser/mocker 4.1.10 (moderate), and brace-expansion 5.0.9 (high). The installed SDK/provider adapters have no reported advisory in that audit. Those existing development/lint dependency findings require a separate targeted upgrade; no broad dependency update was folded into this feature.
