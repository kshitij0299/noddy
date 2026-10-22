import { createOpenAI } from '@ai-sdk/openai';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { createAnthropic } from '@ai-sdk/anthropic';
import { resolveProviderProtocol } from '../../src/agent/provider-config.js';

// Provider configuration is code, never a browser-supplied destination URL.
export { PROVIDERS } from '../../src/agent/provider-config.js';

// One fixed destination per provider; a key is only ever sent to its own host.
const ENDPOINTS = Object.freeze({
	openai: 'https://api.openai.com/v1',
	'opencode-zen': 'https://opencode.ai/zen/v1',
	anthropic: 'https://api.anthropic.com/v1',
});

// Anthropic's Messages API version; also required by its model-list endpoint.
export const ANTHROPIC_VERSION = '2023-06-01';

// Outbound GET allowlist for the live model list (M4, #76). Each URL is a fixed
// literal, never built from browser or model input, so a key can only reach the
// host of the provider it belongs to. Anthropic pages 20 models by default;
// 1000 is its maximum, so one request returns the whole list.
export const MODEL_LIST_URLS = Object.freeze({
	openai: 'https://api.openai.com/v1/models',
	'opencode-zen': 'https://opencode.ai/zen/v1/models',
	anthropic: 'https://api.anthropic.com/v1/models?limit=1000',
});

// Open model database (the one OpenCode uses): prices, tool and vision support.
// It receives no credentials of any kind.
export const CATALOG_URL = 'https://models.dev/api.json';

/**
 * The credentialed GET for one provider's model list.
 * @param {string} provider
 * @param {string} apiKey
 * @returns {{url:string, headers:Record<string,string>}}
 */
export function modelListRequest(provider, apiKey) {
	if (!Object.hasOwn(MODEL_LIST_URLS, provider)) throw new Error('Provider destination rejected');
	// Same credential shapes as the step route: Anthropic uses x-api-key, the rest Bearer.
	const credentials =
		provider === 'anthropic'
			? { 'x-api-key': apiKey, 'anthropic-version': ANTHROPIC_VERSION }
			: { Authorization: `Bearer ${apiKey}` };
	return {
		url: MODEL_LIST_URLS[provider],
		headers: { Accept: 'application/json', ...credentials },
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

/** GET for the three provider model-list URLs only (carries the user's key). */
export const createModelListGet = (transport) =>
	guardedGet(Object.values(MODEL_LIST_URLS), transport);

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
	const baseURL = ENDPOINTS[provider];
	const endpoint = `${baseURL}/${protocol === 'chat' ? 'chat/completions' : protocol}`;
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
	if (provider === 'opencode-zen' && protocol === 'chat') {
		return createOpenAICompatible({ name: 'opencode-zen', baseURL, apiKey, fetch: guardedFetch })(
			model
		);
	}
	const openai = createOpenAI({ baseURL, apiKey, fetch: guardedFetch });
	return protocol === 'responses' ? openai.responses(model) : openai.chat(model);
}
