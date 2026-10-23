// Shared by the browser and relay; no credentials, network or SDK dependencies.
//
// `PROVIDERS` is also the connect flow's copy source (M4, #82): the order is the
// order of the provider step (the recommended one first), `hint` is the one line
// under each name, and the URLs are the provider's own key and billing pages.
export const PROVIDERS = Object.freeze({
	openrouter: Object.freeze({
		label: 'OpenRouter',
		protocols: Object.freeze(['chat']),
		hint: 'Many free models',
		recommended: true,
		keyUrl: 'https://openrouter.ai/settings/keys',
		billingUrl: 'https://openrouter.ai/settings/credits',
		host: 'openrouter.ai',
		keyPrefix: 'sk-or-',
	}),
	'opencode-zen': Object.freeze({
		label: 'OpenCode Zen',
		protocols: Object.freeze(['responses', 'chat', 'messages']),
		hint: 'Models tested for coding agents',
		recommended: false,
		keyUrl: 'https://opencode.ai/console',
		billingUrl: 'https://opencode.ai/console',
		host: 'opencode.ai',
		keyPrefix: 'sk-',
	}),
	openai: Object.freeze({
		label: 'OpenAI',
		protocols: Object.freeze(['responses', 'chat']),
		hint: 'GPT models, paid',
		recommended: false,
		keyUrl: 'https://platform.openai.com/api-keys',
		billingUrl: 'https://platform.openai.com/settings/organization/billing/overview',
		host: 'api.openai.com',
		keyPrefix: 'sk-',
	}),
	// Anthropic's own API speaks only Messages; there is no Advanced format choice.
	anthropic: Object.freeze({
		label: 'Anthropic',
		protocols: Object.freeze(['messages']),
		hint: 'Claude models, paid',
		recommended: false,
		keyUrl: 'https://platform.claude.com/settings/keys',
		billingUrl: 'https://platform.claude.com/settings/billing',
		host: 'api.anthropic.com',
		keyPrefix: 'sk-ant-',
	}),
});

// What the relay accepts as a model ID. The model list only offers IDs that pass,
// and the connect card checks a typed ID against it before spending a call.
// A leading `~` is OpenRouter's "latest" alias (`~anthropic/claude-sonnet-latest`).
export const MODEL_ID_PATTERN = /^[a-zA-Z0-9~][a-zA-Z0-9_.:/-]{0,159}$/;

export const PROTOCOL_LABELS = Object.freeze({
	auto: 'Automatic',
	responses: 'Responses',
	chat: 'Chat Completions',
	messages: 'Messages',
});

// Source: https://opencode.ai/docs/zen/ (endpoint table), checked 2026-10-23.
// Qwen intentionally uses exact IDs: its variants use different wire formats.
const ZEN_MODEL_PROTOCOLS = Object.freeze({
	'qwen3.8-max': 'chat',
	'qwen3.8-flash': 'messages',
	'qwen3.7-max': 'messages',
	'qwen3.7-plus': 'messages',
	'qwen3.6-plus': 'messages',
	'qwen3.5-plus': 'messages',
	'big-pickle': 'chat',
	'space-bunny-free': 'chat',
	'longcat-2.5-preview-free': 'chat',
	'mimo-v2.6-flash-free': 'chat',
	'mimo-v2.5-free': 'chat',
	'ling-3.1-flash-free': 'chat',
	'ling-3.0-flash-fin-free': 'chat',
	'nemotron-3-ultra-free': 'chat',
	'nemotron-3.5-lightning-free': 'chat',
});

export class ProviderProtocolError extends Error {
	constructor(code, message) {
		super(message);
		this.name = 'ProviderProtocolError';
		this.code = code;
	}
}

/**
 * Resolve the API format only; this does not validate access/model availability,
 * normalize the model ID or change an explicit user choice. Unknown Zen formats
 * require an explicit Advanced choice instead of assuming Chat Completions.
 * @param {string} provider
 * @param {string} model
 * @param {string} [protocol]
 * @returns {'responses'|'chat'|'messages'}
 */
export function resolveProviderProtocol(provider, model, protocol = 'auto') {
	if (!Object.hasOwn(PROVIDERS, provider)) {
		throw new ProviderProtocolError(
			'UNSUPPORTED_PROVIDER',
			'Choose OpenRouter, OpenCode Zen, OpenAI or Anthropic.'
		);
	}
	if (protocol !== 'auto') {
		if (!PROVIDERS[provider].protocols.includes(protocol)) {
			throw new ProviderProtocolError(
				'UNSUPPORTED_PROTOCOL',
				'Choose an API format supported by the selected provider.'
			);
		}
		return /** @type {'responses'|'chat'|'messages'} */ (protocol);
	}
	if (provider === 'openai') return 'responses';
	if (provider === 'anthropic') return 'messages';
	// OpenRouter is Chat Completions for every model it lists.
	if (provider === 'openrouter') return 'chat';
	if (typeof model !== 'string' || !model.trim()) {
		throw new ProviderProtocolError('MODEL_REQUIRED', 'Enter a model ID to choose its API format.');
	}
	if (Object.hasOwn(ZEN_MODEL_PROTOCOLS, model)) return ZEN_MODEL_PROTOCOLS[model];
	// Gemini (Google route) and Jev (System One route) are not implemented. Jev's free
	// model ends in -free too, so this runs before the -free rule.
	if (/^(gemini-|jev-)/.test(model)) {
		throw new ProviderProtocolError(
			'UNSUPPORTED_PROTOCOL',
			'This Zen model uses an API format Noddy does not support yet. Choose a model using Responses, Chat Completions or Messages.'
		);
	}
	if (/^(gpt-\d|muse-|grok-(?:\d|build-\d))/.test(model)) return 'responses';
	if (/^claude-(?:opus|sonnet|haiku|fable)-\d/.test(model)) return 'messages';
	// Every documented free model (beam-free, flint-40b-free, exo-free, ...) and Mistral are
	// Chat Completions.
	if (/^(deepseek-v\d|minimax-m\d|glm-\d|kimi-k\d|mistral-)/.test(model) || model.endsWith('-free'))
		return 'chat';
	throw new ProviderProtocolError(
		'PROTOCOL_REQUIRED',
		'Automatic API format is not known for this Zen model. In Advanced, choose the format listed in OpenCode Zen’s endpoint table.'
	);
}
