/**
 * Live model list (M4, #76): the models a provider key can use, enriched with
 * price, tool and vision data from the catalog.
 *
 * One credentialed GET goes to the provider's fixed model-list URL (see
 * `MODEL_LIST_URLS`), with redirects blocked. The key is never logged, stored,
 * cached or returned; the only thing cached anywhere is the credential-free
 * models.dev catalog. Provider text is never relayed: only well-formed model IDs
 * and catalog fields reach the browser.
 */
import { createModelListGet, modelListRequest } from './providers.js';
import { isClearlyNotChat, lookupEntry, readJsonCapped } from './model-catalog.js';
import { MODEL_ID_PATTERN, RelayError, record } from './validation.js';

export const MAX_LISTED_MODELS = 500;
const LIST_MAX_BYTES = 4 * 1024 * 1024;

/**
 * Model IDs from a provider's list response. OpenAI, OpenCode Zen and Anthropic
 * all answer `{data: [{id, ...}]}`. IDs the step route would refuse are dropped.
 * @param {unknown} json
 * @returns {string[]}
 */
export function parseModelIds(json) {
	if (!record(json) || !Array.isArray(json.data)) {
		throw new RelayError(
			'PROVIDER_UNAVAILABLE',
			'The provider returned a model list Noddy cannot read.',
			502
		);
	}
	const seen = new Set();
	const ids = [];
	for (const item of json.data) {
		const id = record(item) ? item.id : undefined;
		if (typeof id !== 'string' || !MODEL_ID_PATTERN.test(id) || seen.has(id)) continue;
		seen.add(id);
		ids.push(id);
		if (ids.length >= MAX_LISTED_MODELS) break;
	}
	return ids;
}

/**
 * @param {{provider:string, apiKey:string}} request validated by `validateModelsRequest`
 * @param {Object} options
 * @param {typeof fetch} [options.transport] fetch-like; tests inject a mock
 * @param {{get: () => Promise<{catalog: Record<string, Map<string, import('./model-catalog.js').CatalogEntry>>, source: string}>}} options.catalog
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{provider:string, catalog:string, models: Array<{id:string, tools:boolean|null, vision:boolean|null, price:{input:number,output:number}|null, released:string|null}>}>}
 */
export async function listProviderModels({ provider, apiKey }, { transport, catalog, signal }) {
	const get = createModelListGet(transport);
	const { url, headers } = modelListRequest(provider, apiKey);

	const [ids, resolved] = await Promise.all([
		(async () => {
			const response = await get(url, { headers, signal });
			if (!response.ok) {
				await response.body?.cancel?.().catch(() => {});
				// Only the status travels (publicError maps it); the body may echo the key.
				throw Object.assign(new Error('Provider model list failed'), {
					statusCode: response.status,
				});
			}
			return parseModelIds(await readJsonCapped(response, LIST_MAX_BYTES));
		})(),
		catalog.get(),
	]);

	const known = resolved.catalog[provider];
	const models = ids.map((id) => {
		const entry = known && lookupEntry(known, id);
		if (entry) return { id, ...entry };
		// Not in the catalog: price and vision unknown; tools unknown unless the ID is plainly
		// not a chat model (embedding, speech, image).
		return {
			id,
			tools: isClearlyNotChat(id) ? false : null,
			vision: null,
			price: null,
			released: null,
		};
	});
	return { provider, catalog: resolved.source, models };
}
