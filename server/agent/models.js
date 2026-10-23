/**
 * Key check and live model list (M4, #76, #82): the models a provider key can use,
 * enriched with price, tool and vision data.
 *
 * One credentialed GET goes to the provider's fixed model-list URL (see
 * `MODEL_LIST_URLS`), with redirects blocked. That GET is also the key check: every provider
 * answers 401 for a bad key. OpenRouter's model list answers 200 even for a bad key, so its
 * key is checked on `/key` first. The key is never logged, stored, cached or returned; the
 * only thing cached anywhere is the credential-free models.dev catalog. Provider text is never
 * relayed from here: only well-formed model IDs and catalog fields reach the browser (a
 * failure carries the provider's status and, for `errors.js`, its message).
 */
import {
	OPENROUTER_URLS,
	createModelListGet,
	modelListRequest,
	openRouterRequest,
} from './providers.js';
import { ERROR_BODY_MAX_BYTES } from './errors.js';
import { isClearlyNotChat, lookupEntry, readJsonCapped, readTextCapped } from './model-catalog.js';
import { MODEL_ID_PATTERN, RelayError, record } from './validation.js';

export const MAX_LISTED_MODELS = 1000;
const LIST_MAX_BYTES = 4 * 1024 * 1024;
// OpenRouter's list is about 800 KB today (468 models); allow room to grow.
const OPENROUTER_LIST_MAX_BYTES = 8 * 1024 * 1024;
const KEY_MAX_BYTES = 64 * 1024;

const unreadable = () =>
	new RelayError(
		'PROVIDER_UNAVAILABLE',
		'The provider returned a model list Noddy cannot read.',
		502
	);

/**
 * Model IDs from a provider's list response. OpenAI, OpenCode Zen and Anthropic
 * all answer `{data: [{id, ...}]}`. IDs the step route would refuse are dropped.
 * @param {unknown} json
 * @returns {string[]}
 */
export function parseModelIds(json) {
	if (!record(json) || !Array.isArray(json.data)) throw unreadable();
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

/** A failed provider response → an error `errors.js` can classify. The body never leaves the relay. */
async function failure(response) {
	const responseBody = await readTextCapped(response, ERROR_BODY_MAX_BYTES);
	return Object.assign(new Error('Provider request failed'), {
		statusCode: response.status,
		responseBody,
	});
}

/** @param {unknown} value */
const priceNumber = (value) => {
	if (typeof value === 'string' && value.trim() === '') return null;
	const number = typeof value === 'number' ? value : Number(value);
	return Number.isFinite(number) ? number : null;
};

/**
 * USD per token (OpenRouter's unit) → USD per million tokens, without float dust.
 * @param {number} perToken
 */
const perMillion = (perToken) => Number((perToken * 1e6).toPrecision(8));

/**
 * One OpenRouter model → the shape the card lists. Everything unreadable becomes null
 * (unknown), never a guess. Rules (issue #82):
 * - Free: both prices are 0 (an id ending `:free` with no readable price counts too).
 * - A negative price (`-1`) means "varies" (routers): not Free, not Paid, no figure.
 * - Tools: `supported_parameters` includes `tools`. A model with no `text` output (music,
 *   image) cannot be used at all, so it counts as unable to use tools.
 * - Vision: `architecture.input_modalities` includes `image`.
 * - Context: `context_length` in tokens; Text: `output_modalities` includes `text`.
 *   An end date in the past (`expiration_date`) is the browser's call, it has the clock.
 * @param {unknown} item
 * @returns {{id:string, tools:boolean|null, vision:boolean|null, price:{input:number,output:number}|null, released:string|null, expires:string|null, varies:boolean, context:number|null, text:boolean|null, deprecated:boolean}|null}
 */
export function normalizeOpenRouterModel(item) {
	if (!record(item)) return null;
	const id = item.id;
	if (typeof id !== 'string' || !MODEL_ID_PATTERN.test(id)) return null;
	const parameters = Array.isArray(item.supported_parameters) ? item.supported_parameters : null;
	const architecture = record(item.architecture) ? item.architecture : {};
	const inputs = Array.isArray(architecture.input_modalities)
		? architecture.input_modalities
		: null;
	const outputs = Array.isArray(architecture.output_modalities)
		? architecture.output_modalities
		: null;
	const pricing = record(item.pricing) ? item.pricing : {};
	const prompt = priceNumber(pricing.prompt);
	const completion = priceNumber(pricing.completion);

	let price = null;
	let varies = false;
	if (prompt !== null && completion !== null) {
		if (prompt < 0 || completion < 0) varies = true;
		else price = { input: perMillion(prompt), output: perMillion(completion) };
	} else if (id.endsWith(':free')) {
		price = { input: 0, output: 0 };
	}

	const created = typeof item.created === 'number' ? item.created : NaN;
	const released =
		Number.isFinite(created) && created > 0 && created < 4_102_444_800
			? new Date(created * 1000).toISOString().slice(0, 10)
			: null;
	const expires =
		typeof item.expiration_date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(item.expiration_date)
			? item.expiration_date.slice(0, 10)
			: null;

	const writesText = outputs ? outputs.includes('text') : null;
	const context = Number.isInteger(item.context_length) ? item.context_length : null;
	return {
		id,
		tools: writesText === false ? false : parameters ? parameters.includes('tools') : null,
		vision: inputs ? inputs.includes('image') : null,
		price,
		released,
		expires,
		varies,
		context: context !== null && context > 0 && context <= 100_000_000 ? context : null,
		text: writesText,
		deprecated: false,
	};
}

/**
 * OpenRouter's list (`/models` or `/models/user`) → listed models. IDs the step route would
 * refuse are dropped; the rest keep the provider's order.
 * @param {unknown} json
 */
export function parseOpenRouterModels(json) {
	if (!record(json) || !Array.isArray(json.data)) throw unreadable();
	const seen = new Set();
	const models = [];
	for (const item of json.data) {
		const model = normalizeOpenRouterModel(item);
		if (!model || seen.has(model.id)) continue;
		seen.add(model.id);
		models.push(model);
		if (models.length >= MAX_LISTED_MODELS) break;
	}
	return models;
}

/**
 * Free-model request counters from `/key` (`data.free_model_daily_requests`), or null.
 * Numbers only: nothing else from the key's answer is passed on.
 * @param {unknown} json
 * @returns {{remaining:number, limit:number}|null}
 */
export function readFreeRequests(json) {
	const counter = record(json) && record(json.data) ? json.data.free_model_daily_requests : null;
	if (!record(counter)) return null;
	const whole = (value) => Number.isInteger(value) && value >= 0 && value <= 1_000_000;
	if (!whole(counter.limit)) return null;
	const remaining = whole(counter.remaining)
		? counter.remaining
		: whole(counter.used)
		? counter.limit - counter.used
		: null;
	return remaining === null || remaining < 0 ? null : { remaining, limit: counter.limit };
}

/** Check the key on `/key`, then read the account's models (its own list first, the catalog as fallback). */
async function listOpenRouterModels({ apiKey }, { get, signal }) {
	const keyRequest = openRouterRequest('key', apiKey);
	const keyResponse = await get(keyRequest.url, { headers: keyRequest.headers, signal });
	if (!keyResponse.ok) throw await failure(keyResponse);
	let freeRequests = null;
	try {
		freeRequests = readFreeRequests(await readJsonCapped(keyResponse, KEY_MAX_BYTES));
	} catch {
		/* The key works; the counters are a bonus. */
	}

	let models = [];
	for (const which of /** @type {const} */ (['user', 'all'])) {
		try {
			const { url, headers } = openRouterRequest(which, apiKey);
			const response = await get(url, { headers, signal });
			if (!response.ok) {
				// The key is already verified: a refusal of the personal list falls back to the
				// full one, and only the full list failing is an error.
				const error = await failure(response);
				if (which === 'all') throw error;
				continue;
			}
			models = parseOpenRouterModels(await readJsonCapped(response, OPENROUTER_LIST_MAX_BYTES));
		} catch (error) {
			if (signal?.aborted || which === 'all') throw error;
			continue;
		}
		// An empty personal list (every model filtered out) is not an answer worth showing.
		if (models.length) break;
	}
	return {
		provider: 'openrouter',
		catalog: 'provider',
		models,
		...(freeRequests ? { freeRequests } : {}),
	};
}

/**
 * @param {{provider:string, apiKey:string}} request validated by `validateModelsRequest`
 * @param {Object} options
 * @param {typeof fetch} [options.transport] fetch-like; tests inject a mock
 * @param {{get: () => Promise<{catalog: Record<string, Map<string, import('./model-catalog.js').CatalogEntry>>, source: string}>}} options.catalog
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{provider:string, catalog:string, models: Array<{id:string, tools:boolean|null, vision:boolean|null, price:{input:number,output:number}|null, released:string|null, expires?:string|null, varies?:boolean, context?:number|null, text?:boolean|null, deprecated?:boolean}>, freeRequests?:{remaining:number, limit:number}}>}
 */
export async function listProviderModels({ provider, apiKey }, { transport, catalog, signal }) {
	const get = createModelListGet(transport);
	if (provider === 'openrouter') return listOpenRouterModels({ apiKey }, { get, signal });
	const { url, headers } = modelListRequest(provider, apiKey);

	const [ids, resolved] = await Promise.all([
		(async () => {
			const response = await get(url, { headers, signal });
			if (!response.ok) throw await failure(response);
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
			context: null,
			text: null,
			deprecated: false,
		};
	});
	return { provider, catalog: resolved.source, models };
}

export { OPENROUTER_URLS };
