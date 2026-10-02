# Agent providers and local relay

The first implementation connects a user's API key directly to **OpenAI** or **OpenCode Zen**. The browser owns the live font, native tools and permissions. A local Node relay owns provider credentials during each request and invokes one model step. It cannot edit a project, execute code, browse, load local files or register new tools.

This uses Vercel AI SDK `ToolLoopAgent` with no server-side tool execution handlers. One step returns typed calls to the existing browser session. The browser validates and executes those calls, then sends the results for the next step. Using the SDK avoids maintaining three incompatible model wire protocols in application code; it does not replace Noddy's command/permission layer. The OpenCode application/daemon SDK is unnecessary for this narrow font agent.

## Running

Node **22 or later** is required by the installed AI SDK. Use the lockfile (`npm ci`) for reproducible installs.

- Development: `npm run dev`. The Vite `agentRelayPlugin()` attaches `/api/agent/step` on the same origin as the editor.
- Production locally: `npm run build`, then `npm run agent:serve`. Open `http://127.0.0.1:5189/app/`. Override the local port with `NODDY_AGENT_PORT`.
- A static `dist/` deployment alone cannot run the relay. Deploying a public hosted version needs an authenticated HTTPS server with per-user credentials, quotas and request isolation. This loopback server deliberately rejects nonlocal connections; changing its bind address is not a public deployment solution.

The production host needs `server/agent/`, `src/agent/tool-definitions.js`, production dependencies and the built `dist/` directory. No model request happens on startup or when the user merely opens connection settings.

## Connections

The user enters a provider, model ID, API format and key. A saved/selected configuration is not proof the credentials work; only an actual request establishes that. Model IDs are editable because availability changes. No default model is silently selected, no quota is assumed, and failed requests are not retried automatically.

| Provider     | API formats                                     | Fixed provider destination   |
| ------------ | ----------------------------------------------- | ---------------------------- |
| OpenAI       | Responses, Chat Completions                     | `https://api.openai.com/v1`  |
| OpenCode Zen | Responses, Chat Completions, Anthropic Messages | `https://opencode.ai/zen/v1` |

Zen's model families do **not** all use Chat Completions. Its [official endpoint table](https://opencode.ai/docs/zen/#endpoints), checked 2 October 2026, assigns GPT/Muse/Grok to Responses, Claude to Messages, and many Kimi/GLM/DeepSeek models to Chat Completions. Qwen variants use different formats. Choose the exact model's listed format. Gemini's Google protocol and Jev's System One protocol are not implemented in this milestone. A model must support function tools; attached pictures additionally require vision support. A provider error identifies these possible mismatches without disclosing raw provider diagnostics.

Keys live in the browser's current session and the relay's request memory only. They are not read from OpenCode configuration, logged, stored in localStorage, written to disk, bundled into JavaScript or saved in `.gs2`. Reloading/clearing the session discards them. Native tool arguments and system instructions never contain the key. The relay disables SDK telemetry and warning payload logging, strips raw response headers/errors, and requests `store:false` for OpenAI-compatible Responses. This does not override a provider's independent retention policy; consult its policy before sending private font data. Changing provider/model should start a fresh transcript so opaque provider continuation data is not replayed across providers.

## Browser contract

`POST /api/agent/step`, `Content-Type: application/json`, exact same-origin `Origin`:

```json
{
	"provider": "openai",
	"protocol": "responses",
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

## Attachments and limits

Images use an AI SDK user content part: `{type:"image",image:"data:image/png;base64,…",mediaType:"image/png"}`. PNG, JPEG and WebP are accepted with byte-signature checks. Remote image URLs, SVG and provider file references are rejected. OTF/TTF files stay local: the chat attachment parser supplies a bounded reference summary, not the binary or a filesystem path. Attaching a font does not silently replace the current project.

Relay limits: 8 MiB serialized request; 4 MiB per image; 4 images per transcript; 96 messages; 160,000 text/serialized-tool/continuation characters; 160,000 bytes per tool JSON value; 8 proposed tool calls per step; 4,096 maximum output tokens; one model step per HTTP request; 90 seconds per request; two simultaneous requests; 30 starts per minute. The browser applies its smaller cumulative image budget and a bounded multi-step run. Input ceilings constrain resource use, not exact dollar spending; model prices vary. Full-spend accounting is deferred.

Stop aborts the fetch and propagates to the provider. A disconnected browser also aborts generation. Completed browser edits remain in normal history; the relay never replays a write. Timeout/limit/provider failures have no automatic billed retries. Provider redirects are rejected, preventing a redirect from forwarding the supplied key elsewhere. No CORS access is enabled, and both Host and Origin are checked against the loopback listener to prevent cross-site requests and DNS rebinding.

## Verification and extension

Run `npm run typecheck:agent-relay` and `npm run test:agent-relay`. Tests use the real `ToolLoopAgent` and actual installed provider adapters with mocked transports for all five provider/format combinations. They verify images, tool definitions, opaque Responses continuation, native result replay, argument rejection, error redaction, no automatic retries, abort propagation and local HTTP guards. No real key/model call is used in automated tests. Live credential/model compatibility remains a user-key smoke test.

To add a provider, extend `providers.js` with a fixed endpoint and a verified SDK adapter, add protocol serialization/credential/error tests and add the corresponding UI choice. Do not add a browser-supplied `baseURL` or a general-purpose proxy.

The 2 October dependency audit reports four pre-existing, unchanged findings: Vitest/browser/mocker 4.1.10 (moderate), and brace-expansion 5.0.9 (high). The installed SDK/provider adapters have no reported advisory in that audit. Those existing development/lint dependency findings require a separate targeted upgrade; no broad dependency update was folded into this feature.
