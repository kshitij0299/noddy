// Shared by the browser and relay; no credentials, network or SDK dependencies.
export const PROVIDERS = Object.freeze({
	openai: Object.freeze({ label: 'OpenAI', protocols: Object.freeze(['responses', 'chat']) }),
	'opencode-zen': Object.freeze({
		label: 'OpenCode Zen',
		protocols: Object.freeze(['responses', 'chat', 'messages']),
	}),
});

export const PROTOCOL_LABELS = Object.freeze({
	auto: 'Automatic',
	responses: 'Responses',
	chat: 'Chat Completions',
	messages: 'Messages',
});

// Source: https://opencode.ai/docs/zen/#endpoints, checked 2026-10-03.
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
		throw new ProviderProtocolError('UNSUPPORTED_PROVIDER', 'Choose OpenAI or OpenCode Zen.');
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
	if (typeof model !== 'string' || !model.trim()) {
		throw new ProviderProtocolError('MODEL_REQUIRED', 'Enter a model ID to choose its API format.');
	}
	if (Object.hasOwn(ZEN_MODEL_PROTOCOLS, model)) return ZEN_MODEL_PROTOCOLS[model];
	if (/^(gpt-\d|muse-spark-\d|grok-(?:\d|build-\d))/.test(model)) return 'responses';
	if (/^claude-(?:opus|sonnet|haiku|fable)-\d/.test(model)) return 'messages';
	if (/^(deepseek-v\d|minimax-m\d|glm-\d|kimi-k\d)/.test(model)) return 'chat';
	if (/^(gemini-|jev-)/.test(model)) {
		throw new ProviderProtocolError(
			'UNSUPPORTED_PROTOCOL',
			'This Zen model uses an API format Noddy does not support yet. Choose a model using Responses, Chat Completions or Messages.'
		);
	}
	throw new ProviderProtocolError(
		'PROTOCOL_REQUIRED',
		'Automatic API format is not known for this Zen model. In Advanced, choose the format listed in OpenCode Zen’s endpoint table.'
	);
}
