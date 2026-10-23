import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { resolveProviderProtocol } from '../../src/agent/provider-config.js';

// Provider configuration is code, never a browser-supplied destination URL.
export { PROVIDERS } from '../../src/agent/provider-config.js';

// The exact POST URL for every provider/format pair the relay can send. A key is only
// ever sent to its own provider's host, and the guarded fetch below refuses anything else.
// OpenCode Zen has one endpoint per protocol (its docs, "Endpoints", checked 2026-10-23),
// not one base URL: the old `https://opencode.ai/zen/v1/...` Messages route refuses a Bearer
// token ("Missing API key"), the `/inference/anthropic/v1/messages` route reads it.
export const PROVIDER_ENDPOINTS = Object.freeze({
	openai: Object.freeze({
		responses: 'https://api.openai.com/v1/responses',
		chat: 'https://api.openai.com/v1/chat/completions',
	}),
	'opencode-zen': Object.freeze({
		responses: 'https://opencode.ai/inference/openai/v1/responses',
		chat: 'https://opencode.ai/inference/openai/v1/chat/completions',
		messages: 'https://opencode.ai/inference/anthropic/v1/messages',
	}),
	anthropic: Object.freeze({ messages: 'https://api.anthropic.com/v1/messages' }),
	openrouter: Object.freeze({ chat: 'https://openrouter.ai/api/v1/chat/completions' }),
});

// Anthropic's Messages API version; also required by its model-list endpoint.
export const ANTHROPIC_VERSION = '2023-06-01';

// Sent to OpenRouter so the owner's dashboard shows the app. No HTTP-Referer is sent.
export const OPENROUTER_APP_TITLE = 'Noddy';

// Outbound GET allowlist for the key check and the live model list (M4, #76, #82). Each URL
// is a fixed literal, never built from browser or model input, so a key can only reach the
// host of the provider it belongs to. Anthropic pages 20 models by default; 1000 is its
// maximum, so one request returns the whole list. Zen's `/inference/v1/models` is public
// without a key but answers 401 for a bad one, so listing it also checks the key.
export const MODEL_LIST_URLS = Object.freeze({
	openai: 'https://api.openai.com/v1/models',
	'opencode-zen': 'https://opencode.ai/inference/v1/models',
	anthropic: 'https://api.anthropic.com/v1/models?limit=1000',
	// The models this account may use (its provider and privacy settings applied).
	openrouter: 'https://openrouter.ai/api/v1/models/user',
});

// OpenRouter's `/models` answers 200 even for a bad key, so the key is checked on `/key`
// (401 "User not found." for a bad one) before any list is read. The full catalog is the
// fallback when `/models/user` cannot be used.
export const OPENROUTER_URLS = Object.freeze({
	key: 'https://openrouter.ai/api/v1/key',
	user: MODEL_LIST_URLS.openrouter,
	all: 'https://openrouter.ai/api/v1/models',
});

// Open model database (the one OpenCode uses): prices, tool and vision support.
// It receives no credentials of any kind.
export const CATALOG_URL = 'https://models.dev/api.json';

/**
 * The credential headers for one provider (the step route uses the same shapes):
 * Anthropic takes `x-api-key`, the rest a Bearer token.
 * @param {string} provider
 * @param {string} apiKey
 * @returns {Record<string,string>}
 */
function credentialHeaders(provider, apiKey) {
	return provider === 'anthropic'
		? { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }
		: { Authorization: `Bearer ${apiKey}` };
}

/**
 * The credentialed GET for one provider's model list.
 * @param {string} provider
 * @param {string} apiKey
 * @returns {{url:string, headers:Record<string,string>}}
 */
export function modelListRequest(provider, apiKey) {
	if (!Object.hasOwn(MODEL_LIST_URLS, provider)) throw new Error('Provider destination rejected');
	return {
		url: MODEL_LIST_URLS[provider],
		headers: { Accept: 'application/json', ...credentialHeaders(provider, apiKey) },
	};
}

/**
 * The credentialed GET for one of OpenRouter's three read URLs.
 * @param {'key'|'user'|'all'} which
 * @param {string} apiKey
 * @returns {{url:string, headers:Record<string,string>}}
 */
export function openRouterRequest(which, apiKey) {
	if (!Object.hasOwn(OPENROUTER_URLS, which)) throw new Error('Provider destination rejected');
	return {
		url: OPENROUTER_URLS[which],
		headers: { Accept: 'application/json', ...credentialHeaders('openrouter', apiKey) },
	};
}

/**
 * A GET-only fetch for an exact URL allowlist. Redirects are an error, so a
 * changed upstream cannot forward a key, and no body or method override passes.
 * @param {Iterable<string>} allowed
 * @param {typeof fetch} [transport]
 */
function guardedGet(allowed, transport = globalThis.fetch) {
	const urls = new Set(allowed);
	return (url, init = {}) => {
		if (!urls.has(String(url)) || (init.method ?? 'GET') !== 'GET' || init.body !== undefined) {
			throw new Error('Provider destination rejected');
		}
		return transport(url, { ...init, method: 'GET', redirect: 'error' });
	};
}

/** GET for the provider key-check and model-list URLs only (they carry the user's key). */
export const createModelListGet = (transport) =>
	guardedGet([...Object.values(MODEL_LIST_URLS), ...Object.values(OPENROUTER_URLS)], transport);

/** GET for the models.dev catalog only; strips every header but Accept so no credential can ride along. */
export function createCatalogGet(transport) {
	const get = guardedGet([CATALOG_URL], transport);
	return (url, init = {}) =>
		get(url, { signal: init.signal, headers: { Accept: 'application/json' } });
}

/** @param {{provider:string, protocol:string, model:string, apiKey:string}} settings */
export function createProviderModel(settings, transport = globalThis.fetch) {
	const { provider, model, apiKey } = settings;
	const protocol = resolveProviderProtocol(provider, model, settings.protocol);
	const endpoint = PROVIDER_ENDPOINTS[provider]?.[protocol];
	if (!endpoint) throw new Error('Provider destination rejected');
	// The SDK adapters append the path themselves: .../chat/completions, .../responses, .../messages.
	const baseURL = endpoint.slice(0, endpoint.lastIndexOf(protocol === 'chat' ? '/chat/' : '/'));
	// Block redirects too: a changed upstream must not redirect a supplied API key.
	const guardedFetch = (url, init) => {
		if (String(url) !== endpoint || init?.method !== 'POST') {
			throw new Error('Provider destination rejected');
		}
		return transport(url, { ...init, redirect: 'error' });
	};
	if (protocol === 'messages') {
		// Anthropic authenticates with x-api-key; Zen's Messages route takes a Bearer token.
		const credentials = provider === 'anthropic' ? { apiKey } : { authToken: apiKey };
		return createAnthropic({ baseURL, ...credentials, fetch: guardedFetch })(model);
	}
	if (provider === 'openrouter') {
		return createOpenAICompatible({
			name: 'openrouter',
			baseURL,
			apiKey,
			headers: { 'X-Title': OPENROUTER_APP_TITLE },
			fetch: guardedFetch,
		})(model);
	}
	if (provider === 'opencode-zen' && protocol === 'chat') {
		return createOpenAICompatible({ name: 'opencode-zen', baseURL, apiKey, fetch: guardedFetch })(
			model
		);
	}
	const openai = createOpenAI({ baseURL, apiKey, fetch: guardedFetch });
	return protocol === 'responses' ? openai.responses(model) : openai.chat(model);
}
