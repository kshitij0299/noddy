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
