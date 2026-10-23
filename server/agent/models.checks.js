// Live model list (M4, #76): provider model endpoints + the models.dev catalog.
// Every outbound request goes through a mocked transport; no real network is used.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { once } from 'node:events';
import { createAgentMiddleware, publicModelsError } from './relay.js';
import {
	CATALOG_URL,
	MODEL_LIST_URLS,
	OPENROUTER_URLS,
	createCatalogGet,
	createModelListGet,
	modelListRequest,
	openRouterRequest,
} from './providers.js';
import {
	CATALOG_PROVIDERS,
	catalogFromSnapshot,
	createCatalogSource,
	isClearlyNotChat,
	lookupEntry,
	normalizeCatalog,
	normalizeEntry,
} from './model-catalog.js';
import { MODEL_SNAPSHOT } from './model-snapshot.js';
import {
	listProviderModels,
	normalizeOpenRouterModel,
	parseModelIds,
	parseOpenRouterModels,
	readFreeRequests,
} from './models.js';
import { sanitizeDetail } from './errors.js';
import { assessModel, listSupported } from '../../src/agent/model-requirements.js';
import { LIMITS, validateModelsRequest } from './validation.js';

const KEY = 'sk-test-key-not-real-0123456789';
const json = (body, init = {}) =>
	new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'Content-Type': 'application/json' },
		...init,
	});

// A small stand-in for https://models.dev/api.json: three tracked providers plus one that is ignored.
const catalogDocument = () => ({
	openai: {
		id: 'openai',
		models: {
			'gpt-5': {
				id: 'gpt-5',
				tool_call: true,
				modalities: { input: ['text', 'image'], output: ['text'] },
				cost: { input: 1.25, output: 10, cache_read: 0.125 },
				limit: { context: 400000, output: 128000 },
				release_date: '2025-08-07',
			},
			'gpt-3.5-turbo': {
				tool_call: false,
				modalities: { input: ['text'] },
				cost: { input: 0.5, output: 1.5 },
				limit: { context: 16385 },
				status: 'deprecated',
				release_date: '2023-03-01',
			},
			'text-embedding-3-small': {
				tool_call: false,
				type: 'embedding',
				modalities: { input: ['text'] },
				cost: { input: 0.02, output: 0 },
			},
			'gpt-realtime': {
				tool_call: true,
				type: 'realtime',
				modalities: { input: ['text', 'audio'] },
				cost: { input: 4, output: 16 },
			},
			'gpt-free-tier': {
				tool_call: true,
				modalities: { input: ['text'] },
				cost: { input: 0, output: 0 },
			},
		},
	},
	anthropic: {
		id: 'anthropic',
		models: {
			'claude-sonnet-5-5': {
				tool_call: true,
				modalities: { input: ['text', 'image', 'pdf'] },
				cost: { input: 3, output: 15 },
				release_date: '2026-03',
			},
			'claude-haiku-4-5': {
				tool_call: true,
				modalities: { input: ['text', 'image'] },
				cost: { input: 1, output: 5 },
				release_date: '2025-10-15',
			},
		},
	},
	opencode: {
		id: 'opencode',
		models: {
			'big-pickle': {
				tool_call: true,
				modalities: { input: ['text'] },
				cost: { input: 0, output: 0, cache_read: 0 },
			},
			'no-cost-listed': { tool_call: true, modalities: { input: ['text', 'image'] } },
		},
	},
	'some-other-provider': { id: 'x', models: { 'not-ours': { tool_call: true } } },
});

const listBodies = {
	openai: () => ({
		object: 'list',
		data: [
			{ id: 'gpt-5', object: 'model' },
			{ id: 'gpt-5-2025-08-07' },
			{ id: 'gpt-3.5-turbo' },
			{ id: 'text-embedding-3-small' },
			{ id: 'whisper-1' },
			{ id: 'gpt-free-tier' },
			{ id: 'brand-new-model' },
			{ id: 'gpt-5' },
			{ id: 'not a valid id!' },
			{ id: 42 },
			null,
		],
	}),
	'opencode-zen': () => ({
		object: 'list',
		data: [{ id: 'big-pickle' }, { id: 'no-cost-listed' }, { id: 'test' }],
	}),
	anthropic: () => ({
		data: [
			{ id: 'claude-sonnet-5-5', display_name: 'Claude Sonnet 5.5', type: 'model' },
			{ id: 'claude-haiku-4-5-20251001', type: 'model' },
		],
		has_more: false,
	}),
	openrouterKey: () => ({
		data: {
			label: 'sk-or-v1-abc...xyz',
			limit: null,
			usage: 0.12,
			is_free_tier: true,
			free_model_daily_requests: { used: 8, limit: 50, remaining: 42 },
		},
	}),
	openrouter: () => ({ data: openRouterModels() }),
};

/** A few real-looking OpenRouter models (https://openrouter.ai/api/v1/models, 23 Oct 2026). */
const openRouterModel = (id, extra = {}) => ({
	id,
	created: 1792622765,
	architecture: { input_modalities: ['text'], output_modalities: ['text'] },
	pricing: { prompt: '0.000003', completion: '0.000015' },
	supported_parameters: ['max_tokens', 'tools', 'temperature'],
	context_length: 262144,
	expiration_date: null,
	...extra,
});
function openRouterModels() {
	return [
		openRouterModel('recursive/flint-v1.0:free', { pricing: { prompt: '0', completion: '0' } }),
		openRouterModel('anthropic/claude-sonnet-5.5', {
			architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
		}),
		openRouterModel('some/safety-guard:free', {
			pricing: { prompt: '0', completion: '0' },
			supported_parameters: ['max_tokens'],
		}),
		openRouterModel('google/lyria-music', {
			pricing: { prompt: '0', completion: '0' },
			architecture: { input_modalities: ['text'], output_modalities: ['audio'] },
			supported_parameters: ['tools'],
		}),
		openRouterModel('openrouter/auto-beta', { pricing: { prompt: '-1', completion: '-1' } }),
		openRouterModel('~anthropic/claude-sonnet-latest'),
		openRouterModel('poolside/laguna-s-2.1:free', {
			pricing: { prompt: '0', completion: '0' },
			expiration_date: '2026-10-31',
		}),
		openRouterModel('no-params/model', { supported_parameters: undefined }),
	];
}

/**
 * A fetch-like mock for every outbound GET the relay makes. Records each call.
 * `handlers` may override the provider lists or the catalog.
 */
function mockTransport({
	lists = listBodies,
	catalog = catalogDocument,
	listStatus = 200,
	listError = (status) => json({ error: { message: `echo ${KEY}` } }, { status }),
} = {}) {
	const calls = [];
	const transport = async (url, init = {}) => {
		const headers = new Headers(init.headers);
		calls.push({ url: String(url), init, headers });
		if (String(url) === CATALOG_URL) {
			const result = typeof catalog === 'function' ? catalog(init) : catalog;
			return result instanceof Response ? result : json(result);
		}
		const openRouterUrl = Object.entries(OPENROUTER_URLS).find(
			([, value]) => value === String(url)
		);
		const provider = openRouterUrl
			? 'openrouter'
			: Object.keys(MODEL_LIST_URLS).find((name) => MODEL_LIST_URLS[name] === String(url));
		assert.ok(provider, `unexpected outbound URL ${url}`);
		if (listStatus !== 200) return listError(listStatus);
		// OpenRouter's key check answers on its own URL; its lists answer with the models.
		if (openRouterUrl?.[0] === 'key') {
			const body = lists.openrouterKey();
			return body instanceof Response ? body : json(body);
		}
		const body = lists[provider]();
		return body instanceof Response ? body : json(body);
	};
	return Object.assign(transport, { calls });
}

const allowedOutbound = new Set([
	...Object.values(MODEL_LIST_URLS),
	...Object.values(OPENROUTER_URLS),
	CATALOG_URL,
]);
const assertOnlyAllowlisted = (calls) => {
	for (const call of calls) {
		assert.ok(allowedOutbound.has(call.url), `outbound ${call.url} is not allowlisted`);
		assert.equal(call.init.redirect, 'error', 'redirects must be an error');
		assert.equal(call.init.method, 'GET');
		assert.equal(call.init.body, undefined);
	}
};

/** A transport that never answers until it is aborted. */
const hangingTransport = () =>
	Object.assign(
		(url, init = {}) =>
			new Promise((resolve, reject) => {
				init.signal?.addEventListener('abort', () => reject(init.signal.reason), { once: true });
			}),
		{ calls: [] }
	);

// ---- Allowlist and request shape -------------------------------------------------------------

test('model-list URLs are fixed literals and each provider uses its own credential shape', () => {
	assert.deepEqual(MODEL_LIST_URLS, {
		openai: 'https://api.openai.com/v1/models',
		// Zen moved from /zen/v1 to /inference (its docs, checked 2026-10-23).
		'opencode-zen': 'https://opencode.ai/inference/v1/models',
		anthropic: 'https://api.anthropic.com/v1/models?limit=1000',
		openrouter: 'https://openrouter.ai/api/v1/models/user',
	});
	assert.deepEqual(OPENROUTER_URLS, {
		key: 'https://openrouter.ai/api/v1/key',
		user: 'https://openrouter.ai/api/v1/models/user',
		all: 'https://openrouter.ai/api/v1/models',
	});
	assert.equal(CATALOG_URL, 'https://models.dev/api.json');
	for (const which of ['key', 'user', 'all']) {
		const { url, headers } = openRouterRequest(which, KEY);
		assert.equal(url, OPENROUTER_URLS[which]);
		assert.equal(headers.Authorization, `Bearer ${KEY}`);
		assert.equal(headers['x-api-key'], undefined);
	}
	assert.throws(() => openRouterRequest('credits', KEY), /destination rejected/);
	for (const provider of ['openai', 'opencode-zen', 'openrouter']) {
		const { url, headers } = modelListRequest(provider, KEY);
		assert.equal(url, MODEL_LIST_URLS[provider]);
		assert.equal(headers.Authorization, `Bearer ${KEY}`);
		assert.equal(headers['x-api-key'], undefined);
	}
	const anthropic = modelListRequest('anthropic', KEY);
	assert.equal(anthropic.headers['x-api-key'], KEY);
	assert.equal(anthropic.headers['anthropic-version'], '2023-06-01');
	assert.equal(anthropic.headers.Authorization, undefined);
	assert.throws(() => modelListRequest('anthropic-eu', KEY), /destination rejected/);
	assert.throws(() => modelListRequest('constructor', KEY), /destination rejected/);
});

test('guarded GETs accept only their exact URLs and never a body, other method or redirect', async () => {
	const sent = [];
	const transport = async (url, init) => {
		sent.push({ url: String(url), init });
		return json({});
	};
	const lists = createModelListGet(transport);
	const catalog = createCatalogGet(transport);
	await lists(MODEL_LIST_URLS.openai, { headers: { Authorization: 'Bearer x' } });
	await catalog(CATALOG_URL, { headers: { Authorization: `Bearer ${KEY}`, 'x-api-key': KEY } });
	assert.deepEqual(
		sent.map((call) => [call.url, call.init.redirect, call.init.method]),
		[
			[MODEL_LIST_URLS.openai, 'error', 'GET'],
			[CATALOG_URL, 'error', 'GET'],
		]
	);
	// The catalog request carries no credential headers, whatever the caller passes.
	assert.deepEqual(Object.keys(sent[1].init.headers), ['Accept']);
	for (const attempt of [
		() => lists('https://api.openai.com/v1/models/gpt-5'),
		() => lists('https://evil.example/v1/models'),
		() => lists('http://api.openai.com/v1/models'),
		() => lists(CATALOG_URL),
		() => catalog(MODEL_LIST_URLS.openai),
		() => catalog('https://models.dev/api.json?x=1'),
		() => lists(MODEL_LIST_URLS.openai, { method: 'POST' }),
		() => lists(MODEL_LIST_URLS.openai, { method: 'GET', body: '{}' }),
	]) {
		assert.throws(attempt, /destination rejected/);
	}
	assert.equal(sent.length, 2);
});

test('request validation accepts only provider and key; there is no URL, header or option field', () => {
	assert.deepEqual(validateModelsRequest({ provider: 'anthropic', apiKey: KEY }), {
		provider: 'anthropic',
		apiKey: KEY,
	});
	for (const bad of [
		null,
		[],
		'x',
		{},
		{ provider: 'openai' },
		{ apiKey: KEY },
		{ provider: 'openai', apiKey: KEY, baseURL: 'https://evil.example' },
		{ provider: 'openai', apiKey: KEY, url: 'https://evil.example/v1/models' },
		{ provider: 'openai', apiKey: KEY, headers: {} },
		{ provider: 'openai', apiKey: KEY, model: 'gpt-5' },
		{ provider: 'gemini', apiKey: KEY },
		{ provider: 'constructor', apiKey: KEY },
		{ provider: 7, apiKey: KEY },
		{ provider: 'openai', apiKey: '' },
		{ provider: 'openai', apiKey: 'bad key\nvalue' },
		{ provider: 'openai', apiKey: 'k'.repeat(513) },
		{ provider: 'openai', apiKey: 5 },
	]) {
		assert.throws(() => validateModelsRequest(bad), { code: 'INVALID_REQUEST' });
	}
});

// ---- Catalog normalization -------------------------------------------------------------------

test('catalog entries become Free / Paid / Tools / Vision facts, unknown stays null', () => {
	assert.deepEqual(
		normalizeEntry({
			tool_call: true,
			modalities: { input: ['text', 'image'], output: ['text'] },
			cost: { input: 3, output: 15, cache_read: 0.3 },
			limit: { context: 200000, output: 64000 },
			release_date: '2025-09-29',
		}),
		{
			tools: true,
			vision: true,
			price: { input: 3, output: 15 },
			released: '2025-09-29',
			context: 200000,
			text: true,
			deprecated: false,
		}
	);
	// Free is "both costs are 0": the price is kept as 0 / 0.
	assert.deepEqual(normalizeEntry({ tool_call: true, cost: { input: 0, output: 0 } }).price, {
		input: 0,
		output: 0,
	});
	// Missing facts are unknown, not false.
	assert.deepEqual(normalizeEntry({}), {
		tools: null,
		vision: null,
		price: null,
		released: null,
		context: null,
		text: null,
		deprecated: false,
	});
	// The app's requirements (src/agent/model-requirements.js) need these three facts.
	assert.equal(normalizeEntry({ limit: { context: 31999 } }).context, 31999);
	assert.equal(normalizeEntry({ limit: { context: '200k' } }).context, null);
	assert.equal(normalizeEntry({ limit: { context: -5 } }).context, null);
	assert.equal(normalizeEntry({ limit: { context: 2.5 } }).context, null);
	assert.equal(normalizeEntry({ limit: null }).context, null);
	assert.equal(normalizeEntry({ modalities: { output: ['image'] } }).text, false);
	assert.equal(normalizeEntry({ modalities: { output: ['text', 'audio'] } }).text, true);
	assert.equal(normalizeEntry({ modalities: { input: ['text'] } }).text, null);
	assert.equal(normalizeEntry({ status: 'deprecated' }).deprecated, true);
	assert.equal(normalizeEntry({ status: 'beta' }).deprecated, false);
	// Half a price is no price.
	assert.equal(normalizeEntry({ cost: { input: 1 } }).price, null);
	assert.equal(normalizeEntry({ cost: { input: -1, output: 1 } }).price, null);
	assert.equal(normalizeEntry({ cost: { input: '1', output: 1 } }).price, null);
	assert.equal(normalizeEntry({ cost: { input: Infinity, output: 1 } }).price, null);
	assert.equal(normalizeEntry({ modalities: { input: ['text'] } }).vision, false);
	assert.equal(normalizeEntry({ release_date: 'yesterday' }).released, null);
	// Embedding, image and realtime models are not chat models whatever tool_call says.
	for (const type of ['embedding', 'image', 'realtime']) {
		assert.equal(normalizeEntry({ type, tool_call: true }).tools, false);
	}
	assert.equal(normalizeEntry(null), null);
	assert.equal(normalizeEntry('x'), null);
});

test('only openai, anthropic and opencode are kept; a broken document is rejected', () => {
	const catalog = normalizeCatalog(catalogDocument());
	assert.deepEqual(Object.keys(catalog), Object.keys(CATALOG_PROVIDERS));
	assert.equal(catalog['opencode-zen'].get('big-pickle').price.input, 0);
	assert.equal(catalog.openai.has('not-ours'), false);
	for (const bad of [
		null,
		[],
		'<html>',
		{},
		{ openai: { models: {} }, anthropic: { models: {} }, opencode: { models: {} } },
		{ ...catalogDocument(), anthropic: undefined },
		{ ...catalogDocument(), openai: { models: [] } },
		{ ...catalogDocument(), opencode: { models: { 'bad id': { tool_call: true } } } },
	]) {
		assert.throws(() => normalizeCatalog(bad), /Malformed model catalog/);
	}
});

test('dated and -latest IDs share their plain model facts; non-chat IDs are recognised', () => {
	const models = normalizeCatalog(catalogDocument()).anthropic;
	assert.equal(lookupEntry(models, 'claude-haiku-4-5').price.input, 1);
	assert.equal(lookupEntry(models, 'claude-haiku-4-5-20251001').price.input, 1);
	assert.equal(lookupEntry(models, 'claude-haiku-4-5-2025-10-01').price.input, 1);
	assert.equal(lookupEntry(models, 'claude-haiku-4-5-latest').price.input, 1);
	assert.equal(lookupEntry(models, 'claude-haiku-9'), undefined);
	assert.equal(lookupEntry(models, 'constructor'), undefined);
	for (const id of [
		'text-embedding-3-large',
		'whisper-1',
		'tts-1-hd',
		'gpt-4o-mini-tts',
		'dall-e-3',
		'omni-moderation-latest',
		'gpt-4o-transcribe',
		'gpt-image-1',
		'gpt-4o-realtime-preview',
		'davinci-002',
	]) {
		assert.equal(isClearlyNotChat(id), true, id);
	}
	for (const id of ['gpt-5', 'claude-sonnet-5-5', 'big-pickle', 'brand-new-model', 'o3-mini']) {
		assert.equal(isClearlyNotChat(id), false, id);
	}
});

test('the bundled snapshot covers exactly the three providers and loads like a live catalog', () => {
	const catalog = catalogFromSnapshot(MODEL_SNAPSHOT);
	assert.deepEqual(Object.keys(MODEL_SNAPSHOT.providers), Object.keys(CATALOG_PROVIDERS));
	for (const provider of Object.keys(CATALOG_PROVIDERS)) {
		assert.ok(catalog[provider].size > 5, `${provider} has entries`);
		for (const [id, entry] of catalog[provider]) {
			assert.match(id, /^[a-zA-Z0-9][a-zA-Z0-9_.:/-]{0,159}$/);
			assert.deepEqual(Object.keys(entry).sort(), [
				'context',
				'deprecated',
				'price',
				'released',
				'text',
				'tools',
				'vision',
			]);
			assert.equal(typeof entry.deprecated, 'boolean');
			assert.ok(entry.context === null || Number.isInteger(entry.context));
			assert.ok(entry.tools === null || typeof entry.tools === 'boolean');
			if (entry.price) assert.ok(entry.price.input >= 0 && entry.price.output >= 0);
		}
	}
	// Small enough to bundle: only three providers, a handful of fields each.
	assert.ok(JSON.stringify(MODEL_SNAPSHOT).length < 120_000);
	assert.match(MODEL_SNAPSHOT.generated, /^\d{4}-\d{2}-\d{2}$/);
	assert.equal(MODEL_SNAPSHOT.source, CATALOG_URL);
});

// ---- Catalog source: cache, fallback, malformed data, timeout --------------------------------

test('catalog source fetches once, serves the cache for six hours, then refreshes', async () => {
	let time = 1_000_000;
	const transport = mockTransport();
	const source = createCatalogSource({ transport, now: () => time });
	const first = await source.get();
	assert.equal(first.source, 'live');
	assert.equal(first.catalog.openai.get('gpt-5').price.output, 10);
	time += 5 * 60 * 60 * 1000;
	assert.equal((await source.get()).source, 'cache');
	assert.equal(transport.calls.length, 1);
	time += 61 * 60 * 1000;
	assert.equal((await source.get()).source, 'live');
	assert.equal(transport.calls.length, 2);
	assertOnlyAllowlisted(transport.calls);
	// models.dev is public data: nothing identifying is sent.
	for (const call of transport.calls) {
		assert.deepEqual([...call.headers.keys()], ['accept']);
	}
});

test('concurrent requests share one catalog fetch', async () => {
	const transport = mockTransport();
	const source = createCatalogSource({ transport });
	const results = await Promise.all([source.get(), source.get(), source.get()]);
	assert.equal(transport.calls.length, 1);
	assert.deepEqual(
		results.map((result) => result.source),
		['live', 'live', 'live']
	);
});

test('unreachable, non-200, malformed or oversized catalog data falls back to the snapshot', async () => {
	const cases = {
		'network error': () => {
			throw new TypeError('fetch failed');
		},
		'HTTP 503': () => new Response('down', { status: 503 }),
		'HTML instead of JSON': () => new Response('<html>blocked</html>', { status: 200 }),
		'JSON of the wrong shape': () => json([1, 2, 3]),
		'tracked provider missing': () => json({ openai: { models: { a: {} } } }),
		'all models unreadable': () =>
			json({
				openai: { models: { 'bad id': 1 } },
				anthropic: { models: {} },
				opencode: { models: {} },
			}),
	};
	for (const [name, catalog] of Object.entries(cases)) {
		const transport = mockTransport({ catalog });
		const source = createCatalogSource({ transport });
		const result = await source.get();
		assert.equal(result.source, 'snapshot', name);
		assert.ok(result.catalog.openai.size > 5, `${name}: snapshot data present`);
	}
	// Larger than the allowed size, streamed: refused before it is parsed.
	const huge = createCatalogSource({
		transport: mockTransport({ catalog: () => json(catalogDocument()) }),
		maxBytes: 200,
	});
	assert.equal((await huge.get()).source, 'snapshot');
	const declared = createCatalogSource({
		transport: mockTransport({
			catalog: () =>
				new Response('{}', { headers: { 'content-length': String(25 * 1024 * 1024) } }),
		}),
	});
	assert.equal((await declared.get()).source, 'snapshot');
});

test('a hung models.dev times out and the snapshot answers', async () => {
	const transport = hangingTransport();
	const source = createCatalogSource({ transport, timeoutMs: 40 });
	const started = Date.now();
	const result = await source.get();
	assert.equal(result.source, 'snapshot');
	assert.ok(Date.now() - started < 2000);
});

test('after a failure the relay does not hammer models.dev; a stale cache beats the snapshot', async () => {
	let time = 0;
	let healthy = true;
	const transport = mockTransport({
		catalog: () => (healthy ? json(catalogDocument()) : new Response('', { status: 500 })),
	});
	const source = createCatalogSource({ transport, now: () => time });
	assert.equal((await source.get()).source, 'live');
	healthy = false;
	time += 7 * 60 * 60 * 1000; // past the 6 h TTL
	const stale = await source.get();
	assert.equal(stale.source, 'cache', 'stale live data is better than the snapshot');
	assert.equal(stale.catalog.openai.get('gpt-5').tools, true);
	const callsAfterFailure = transport.calls.length;
	time += 30 * 1000;
	assert.equal((await source.get()).source, 'cache');
	assert.equal(transport.calls.length, callsAfterFailure, 'no retry inside the backoff window');
	time += 61 * 1000;
	healthy = true;
	assert.equal((await source.get()).source, 'live');

	// With no cache at all the snapshot answers and the backoff applies too.
	const down = mockTransport({ catalog: () => new Response('', { status: 500 }) });
	const cold = createCatalogSource({ transport: down, now: () => time });
	assert.equal((await cold.get()).source, 'snapshot');
	assert.equal((await cold.get()).source, 'snapshot');
	assert.equal(down.calls.length, 1);
});

// ---- Listing models --------------------------------------------------------------------------

test('parseModelIds keeps well-formed unique IDs and rejects unreadable lists', () => {
	assert.deepEqual(parseModelIds(listBodies.openai()), [
		'gpt-5',
		'gpt-5-2025-08-07',
		'gpt-3.5-turbo',
		'text-embedding-3-small',
		'whisper-1',
		'gpt-free-tier',
		'brand-new-model',
	]);
	assert.deepEqual(parseModelIds({ data: [] }), []);
	assert.equal(
		parseModelIds({ data: Array.from({ length: 1500 }, (_, i) => ({ id: `m-${i}` })) }).length,
		1000
	);
	// A leading ~ is OpenRouter's "latest" alias.
	assert.deepEqual(
		parseModelIds({ data: [{ id: '~anthropic/claude-sonnet-latest' }, { id: '~' }] }),
		['~anthropic/claude-sonnet-latest', '~']
	);
	assert.deepEqual(parseModelIds({ data: [{ id: '/x' }, { id: '.x' }, { id: '-x' }] }), []);
	for (const bad of [null, [], 'x', {}, { data: 'x' }, { data: {} }]) {
		assert.throws(() => parseModelIds(bad), { code: 'PROVIDER_UNAVAILABLE' });
	}
});

for (const provider of ['openai', 'opencode-zen', 'anthropic']) {
	test(`${provider}: lists the key's models from the fixed URL and enriches them from the catalog`, async () => {
		const transport = mockTransport();
		const result = await listProviderModels(
			{ provider, apiKey: KEY },
			{ transport, catalog: createCatalogSource({ transport }) }
		);
		const lists = transport.calls.filter((call) => call.url !== CATALOG_URL);
		assert.equal(lists.length, 1, 'exactly one provider call');
		assert.equal(lists[0].url, MODEL_LIST_URLS[provider]);
		if (provider === 'anthropic') {
			assert.equal(lists[0].headers.get('x-api-key'), KEY);
			assert.equal(lists[0].headers.get('anthropic-version'), '2023-06-01');
			assert.equal(lists[0].headers.get('authorization'), null);
		} else {
			assert.equal(lists[0].headers.get('authorization'), `Bearer ${KEY}`);
			assert.equal(lists[0].headers.get('x-api-key'), null);
		}
		// The key goes to the provider only: never to models.dev, never in a URL.
		const catalogCalls = transport.calls.filter((call) => call.url === CATALOG_URL);
		assert.equal(catalogCalls.length, 1);
		assert.equal(JSON.stringify([...catalogCalls[0].headers]).includes(KEY), false);
		assert.equal(
			transport.calls.some((call) => call.url.includes(KEY)),
			false
		);
		assertOnlyAllowlisted(transport.calls);
		assert.equal(JSON.stringify(result).includes(KEY), false);
		assert.equal(result.provider, provider);
		assert.equal(result.catalog, 'live');
		const byId = Object.fromEntries(result.models.map((model) => [model.id, model]));
		assert.equal(new Set(result.models.map((model) => model.id)).size, result.models.length);

		if (provider === 'openai') {
			assert.deepEqual(byId['gpt-5'], {
				id: 'gpt-5',
				tools: true,
				vision: true,
				price: { input: 1.25, output: 10 },
				released: '2025-08-07',
				context: 400000,
				text: true,
				deprecated: false,
			});
			// A dated snapshot shares its plain model's facts.
			assert.equal(byId['gpt-5-2025-08-07'].price.output, 10);
			assert.equal(byId['gpt-3.5-turbo'].tools, false);
			assert.equal(byId['text-embedding-3-small'].tools, false);
			assert.deepEqual(byId['gpt-free-tier'].price, { input: 0, output: 0 });
			// Not in the catalog: no price, tools unknown (allowed), vision unknown.
			assert.deepEqual(byId['brand-new-model'], {
				id: 'brand-new-model',
				tools: null,
				vision: null,
				price: null,
				released: null,
				context: null,
				text: null,
				deprecated: false,
			});
			// Not in the catalog but plainly not a chat model.
			assert.equal(byId['whisper-1'].tools, false);
			assert.equal(byId['not a valid id!'], undefined);
		}
		if (provider === 'opencode-zen') {
			assert.deepEqual(byId['big-pickle'].price, { input: 0, output: 0 });
			assert.equal(byId['big-pickle'].tools, true);
			assert.equal(byId['no-cost-listed'].price, null, 'no cost listed → no price badge');
			assert.equal(byId['no-cost-listed'].vision, true);
			assert.equal(byId.test.tools, null);
		}
		if (provider === 'anthropic') {
			assert.equal(byId['claude-sonnet-5-5'].vision, true);
			assert.deepEqual(byId['claude-haiku-4-5-20251001'].price, { input: 1, output: 5 });
		}
	});
}

test('with models.dev unreachable the list still returns, enriched from the snapshot', async () => {
	const transport = mockTransport({
		catalog: () => {
			throw new TypeError('fetch failed');
		},
		lists: {
			...listBodies,
			openai: () => ({ data: [{ id: 'gpt-5' }, { id: 'brand-new-model' }] }),
		},
	});
	const result = await listProviderModels(
		{ provider: 'openai', apiKey: KEY },
		{ transport, catalog: createCatalogSource({ transport }) }
	);
	assert.equal(result.catalog, 'snapshot');
	const gpt5 = result.models.find((model) => model.id === 'gpt-5');
	assert.equal(gpt5.tools, true);
	assert.ok(gpt5.price.input > 0);
	assert.equal(result.models.find((model) => model.id === 'brand-new-model').tools, null);
});

// ---- The HTTP route --------------------------------------------------------------------------

async function withRelay(options, run) {
	const relay = createServer(createAgentMiddleware(options));
	relay.listen(0, '127.0.0.1');
	await once(relay, 'listening');
	const origin = `http://127.0.0.1:${relay.address().port}`;
	const post = (
		body = { provider: 'openai', apiKey: KEY },
		headers = {},
		path = '/api/agent/models'
	) =>
		fetch(origin + path, {
			method: 'POST',
			headers: { Origin: origin, 'Content-Type': 'application/json', ...headers },
			body: typeof body === 'string' ? body : JSON.stringify(body),
		});
	try {
		await run({ origin, post });
	} finally {
		relay.closeAllConnections?.();
		await new Promise((resolve) => relay.close(resolve));
	}
}

test('POST /api/agent/models returns the live list through the local HTTP relay for all providers', async () => {
	const transport = mockTransport();
	await withRelay({ transport }, async ({ post }) => {
		for (const provider of ['openai', 'opencode-zen', 'anthropic']) {
			const response = await post({ provider, apiKey: KEY });
			assert.equal(response.status, 200);
			assert.equal(response.headers.get('cache-control'), 'no-store');
			assert.equal(response.headers.get('access-control-allow-origin'), null);
			assert.match(response.headers.get('content-type'), /application\/json/);
			const text = await response.text();
			assert.equal(text.includes(KEY), false, 'the key is never returned');
			const body = JSON.parse(text);
			assert.equal(body.provider, provider);
			assert.ok(body.models.length > 0);
			assert.deepEqual(Object.keys(body.models[0]).sort(), [
				'context',
				'deprecated',
				'id',
				'price',
				'released',
				'text',
				'tools',
				'vision',
			]);
		}
		assertOnlyAllowlisted(transport.calls);
		// The catalog was fetched once for three lists (6 h cache), the key went to provider hosts only.
		assert.equal(transport.calls.filter((call) => call.url === CATALOG_URL).length, 1);
		assert.equal(transport.calls.length, 4);
	});
});

test('the route keeps the step route’s local-only guards', async () => {
	const transport = mockTransport();
	await withRelay({ transport }, async ({ origin, post }) => {
		assert.equal((await post(undefined, { Origin: 'http://evil.example' })).status, 403);
		assert.equal((await post(undefined, { Origin: '' })).status, 403);
		assert.equal((await post(undefined, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
		assert.equal((await post(undefined, { 'Content-Type': 'text/plain' })).status, 415);
		assert.equal((await post(undefined, { 'Content-Encoding': 'gzip' })).status, 415);
		assert.equal((await post('{not json')).status, 400);
		assert.equal((await post(undefined, {}, '/api/agent/models?apiKey=secret')).status, 404);
		assert.equal((await post(undefined, {}, '/api/agent/models/')).status, 404);
		const get = await fetch(origin + '/api/agent/models', { headers: { Origin: origin } });
		assert.equal(get.status, 405);
		// DNS rebinding: a hostile Host header is refused.
		const hostile = await new Promise((resolve, reject) => {
			const req = httpRequest(
				origin + '/api/agent/models',
				{ method: 'POST', headers: { Host: 'evil.example', 'Content-Type': 'application/json' } },
				(res) => {
					res.resume();
					resolve(res.statusCode);
				}
			);
			req.on('error', reject);
			req.end(JSON.stringify({ provider: 'openai', apiKey: KEY }));
		});
		assert.equal(hostile, 403);
		// None of the rejected requests reached a provider.
		assert.equal(transport.calls.length, 0);
	});
});

test('body size is capped far below the 8 MB step limit', async () => {
	const transport = mockTransport();
	await withRelay({ transport }, async ({ post }) => {
		const response = await post({
			provider: 'openai',
			apiKey: KEY,
			padding: 'a'.repeat(LIMITS.modelsBodyBytes),
		});
		assert.equal(response.status, 413);
		assert.equal((await response.json()).error.code, 'TOO_LARGE');
		assert.equal(transport.calls.length, 0);
	});
});

test('browser-supplied URLs, headers, models and unknown providers never reach an upstream', async () => {
	const transport = mockTransport();
	await withRelay({ transport }, async ({ post }) => {
		for (const body of [
			{ provider: 'openai', apiKey: KEY, baseURL: 'https://evil.example/v1' },
			{ provider: 'openai', apiKey: KEY, url: 'https://evil.example/v1/models' },
			{ provider: 'openai', apiKey: KEY, headers: { 'x-evil': '1' } },
			{ provider: 'https://evil.example', apiKey: KEY },
			{ provider: 'openai\n', apiKey: KEY },
			{ provider: 'openai', apiKey: `${KEY}\nx-evil: 1` },
			{ provider: 'openai' },
		]) {
			const response = await post(body);
			assert.equal(response.status, 400);
			const text = await response.text();
			assert.equal(JSON.parse(text).error.code, 'INVALID_REQUEST');
			assert.equal(text.includes(KEY), false);
			assert.equal(text.includes('evil'), false);
		}
		assert.equal(transport.calls.length, 0);
	});
});

test('provider failures are sanitized: the key and headers never come back, only a cleaned message', async () => {
	const expected = {
		401: ['PROVIDER_AUTH', 401],
		402: ['PROVIDER_CREDITS', 402],
		403: ['PROVIDER_FORBIDDEN', 403],
		429: ['PROVIDER_LIMIT', 429],
		404: ['PROVIDER_MODEL', 422],
		422: ['PROVIDER_REQUEST', 422],
		500: ['PROVIDER_UNAVAILABLE', 502],
		503: ['PROVIDER_UNAVAILABLE', 502],
	};
	for (const [status, [code, http]] of Object.entries(expected)) {
		const transport = mockTransport({ listStatus: Number(status) });
		await withRelay({ transport }, async ({ post }) => {
			const response = await post();
			assert.equal(response.status, http, `upstream ${status}`);
			const text = await response.text();
			const { error } = JSON.parse(text);
			assert.equal(error.code, code);
			// The provider's own status travels in the envelope; the key never does.
			assert.equal(error.status, Number(status));
			assert.equal(text.includes(KEY), false);
			// The list route is a connect check, so the provider's message comes back, cleaned.
			assert.equal(error.detail, 'echo');
			assert.deepEqual(Object.keys(JSON.parse(text)), ['error']);
			assert.equal(
				transport.calls.filter((call) => call.url !== CATALOG_URL).length,
				1,
				'no retry'
			);
		});
	}
	// The 4xx wording is about the list, not about a model ID.
	assert.match(publicModelsError({ statusCode: 404 }).message, /list models/);
	assert.match(publicModelsError({ statusCode: 422 }).message, /list models/);
	assert.doesNotMatch(publicModelsError({ statusCode: 404 }).message, /model ID, API format/);
});

test('malformed provider data, network errors and refused redirects answer 502 without detail', async () => {
	const malformed = [
		() => new Response('<html>captive portal</html>', { status: 200 }),
		() => json({ data: 'nope' }),
		() => json(['a', 'b']),
		() => new Response('', { status: 200 }),
	];
	for (const make of malformed) {
		const transport = mockTransport({ lists: { openai: make } });
		await withRelay({ transport }, async ({ post }) => {
			const response = await post();
			assert.equal(response.status, 502);
			const text = await response.text();
			assert.equal(JSON.parse(text).error.code, 'PROVIDER_UNAVAILABLE');
			assert.equal(text.includes('captive'), false);
		});
	}
	// A transport that fails with a message containing the key (e.g. a redirect to a hostile URL).
	const failing = async (url, init) => {
		if (String(url) === CATALOG_URL) return json(catalogDocument());
		assert.equal(init.redirect, 'error');
		throw new TypeError(`redirect to https://evil.example/?k=${KEY}`);
	};
	await withRelay({ transport: failing }, async ({ post }) => {
		const response = await post();
		assert.equal(response.status, 502);
		const text = await response.text();
		assert.equal(JSON.parse(text).error.code, 'PROVIDER_UNAVAILABLE');
		assert.equal(text.includes(KEY), false);
		assert.equal(text.includes('evil'), false);
	});
	// An oversized provider answer is refused rather than buffered.
	const big = mockTransport({
		lists: {
			openai: () => new Response('{"data":[' + '{"id":"a"},'.repeat(500_000) + '{"id":"b"}]}'),
		},
	});
	await withRelay({ transport: big }, async ({ post }) => {
		assert.equal((await post()).status, 502);
	});
});

test('models.dev trouble never fails the list', async () => {
	const transport = mockTransport({ catalog: () => new Response('nope', { status: 500 }) });
	await withRelay({ transport }, async ({ post }) => {
		const response = await post();
		assert.equal(response.status, 200);
		const body = await response.json();
		assert.equal(body.catalog, 'snapshot');
		assert.ok(body.models.some((model) => model.id === 'gpt-5' && model.tools === true));
	});
});

test('a slow provider times out as CANCELLED and releases the relay', async () => {
	const transport = hangingTransport();
	await withRelay(
		{ transport, modelsTimeoutMs: 60, catalog: createCatalogSource({ transport, timeoutMs: 30 }) },
		async ({ post }) => {
			const started = Date.now();
			const response = await post();
			assert.equal(response.status, 408);
			assert.equal((await response.json()).error.code, 'CANCELLED');
			assert.ok(Date.now() - started < 3000);
		}
	);
});

test('a disconnected browser aborts the provider request', async () => {
	let upstreamSignal;
	let started;
	const ready = new Promise((resolve) => (started = resolve));
	const transport = (url, init) => {
		if (String(url) === CATALOG_URL) return Promise.resolve(json(catalogDocument()));
		upstreamSignal = init.signal;
		started();
		return new Promise((resolve, reject) =>
			init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true })
		);
	};
	await withRelay({ transport }, async ({ origin }) => {
		const client = new AbortController();
		const pending = fetch(origin + '/api/agent/models', {
			method: 'POST',
			headers: { Origin: origin, 'Content-Type': 'application/json' },
			body: JSON.stringify({ provider: 'openai', apiKey: KEY }),
			signal: client.signal,
		}).catch(() => 'aborted');
		await ready;
		client.abort();
		assert.equal(await pending, 'aborted');
		for (let i = 0; i < 50 && !upstreamSignal.aborted; i++)
			await new Promise((r) => setTimeout(r, 10));
		assert.equal(upstreamSignal.aborted, true);
	});
});

test('model lists have their own concurrency limit and do not use up the step route’s', async () => {
	const transport = hangingTransport();
	await withRelay(
		{
			transport,
			modelsTimeoutMs: 400,
			catalog: createCatalogSource({ transport, timeoutMs: 30 }),
			loadRegistry: async () => ({ definitions: [], validateToolInput: () => ({ valid: true }) }),
			generateStep: async () => ({ text: 'step ok', toolCalls: [], messages: [] }),
		},
		async ({ post }) => {
			const first = post();
			const second = post();
			await new Promise((resolve) => setTimeout(resolve, 80));
			const third = await post();
			assert.equal(third.status, 429);
			assert.equal((await third.json()).error.code, 'BUSY');
			// A step request is not blocked by two pending list requests.
			const step = await post(
				{ provider: 'openai', protocol: 'responses', model: 'gpt-5', apiKey: KEY, messages: [] },
				{},
				'/api/agent/step'
			);
			assert.equal(step.status, 200);
			assert.equal((await step.json()).text, 'step ok');
			for (const response of await Promise.all([first, second])) {
				assert.equal(response.status, 408);
			}
		}
	);
});

test('the config probe and step route are unchanged', async () => {
	await withRelay({ transport: mockTransport() }, async ({ origin }) => {
		const config = await (await fetch(origin + '/api/agent/config')).json();
		// The order is the connect flow's provider step: recommended first.
		assert.deepEqual(Object.keys(config.providers), [
			'openrouter',
			'opencode-zen',
			'openai',
			'anthropic',
		]);
		assert.equal(config.providers.openrouter.recommended, true);
		assert.equal(config.providers.openrouter.keyUrl, 'https://openrouter.ai/settings/keys');
		assert.equal(
			(await fetch(origin + '/api/agent/nope', { headers: { Origin: origin } })).status,
			404
		);
	});
});

// ---- OpenRouter: key check and its own model list (#82) -------------------------------------

const noCatalog = {
	get() {
		throw new Error('OpenRouter models come from OpenRouter, never from models.dev');
	},
};

test('OpenRouter models become Free / Tools / Vision / price facts straight from OpenRouter', () => {
	const models = parseOpenRouterModels({ data: openRouterModels() });
	const byId = Object.fromEntries(models.map((model) => [model.id, model]));
	// Free: both prices are the string "0". Tools come from supported_parameters.
	assert.deepEqual(byId['recursive/flint-v1.0:free'], {
		id: 'recursive/flint-v1.0:free',
		tools: true,
		vision: false,
		price: { input: 0, output: 0 },
		released: '2026-10-21',
		expires: null,
		varies: false,
		context: 262144,
		text: true,
		deprecated: false,
	});
	// Price per million tokens = per-token string times 1e6, without float dust.
	assert.deepEqual(byId['anthropic/claude-sonnet-5.5'].price, { input: 3, output: 15 });
	// Vision from input modalities.
	assert.equal(byId['anthropic/claude-sonnet-5.5'].vision, true);
	// A free model without the tools parameter is listed but cannot be used.
	assert.equal(byId['some/safety-guard:free'].tools, false);
	assert.deepEqual(byId['some/safety-guard:free'].price, { input: 0, output: 0 });
	// No text output (music) means unusable, whatever supported_parameters says.
	assert.equal(byId['google/lyria-music'].tools, false);
	// "-1" means the price varies: neither Free nor Paid, and no figure.
	assert.equal(byId['openrouter/auto-beta'].price, null);
	assert.equal(byId['openrouter/auto-beta'].varies, true);
	assert.equal(byId['anthropic/claude-sonnet-5.5'].varies, false);
	// "latest" aliases start with ~ and are kept.
	assert.equal(byId['~anthropic/claude-sonnet-latest'].tools, true);
	// expiration_date becomes expires; created becomes released.
	assert.equal(byId['poolside/laguna-s-2.1:free'].expires, '2026-10-31');
	// No supported_parameters at all: tool support is unknown, not "no".
	assert.equal(byId['no-params/model'].tools, null);
});

test('OpenRouter normalisation is defensive about unreadable fields', () => {
	assert.equal(normalizeOpenRouterModel(null), null);
	assert.equal(normalizeOpenRouterModel({ id: 'bad id!' }), null);
	assert.equal(normalizeOpenRouterModel({ id: 42 }), null);
	const odd = normalizeOpenRouterModel({
		id: 'x/odd',
		created: 'yesterday',
		pricing: { prompt: 'cheap', completion: null },
		architecture: 'text',
		supported_parameters: 'tools',
		expiration_date: 'soon',
	});
	assert.deepEqual(odd, {
		id: 'x/odd',
		tools: null,
		vision: null,
		price: null,
		released: null,
		expires: null,
		varies: false,
		context: null,
		text: null,
		deprecated: false,
	});
	// A :free id with no readable price still counts as free.
	assert.deepEqual(normalizeOpenRouterModel({ id: 'x/y:free' }).price, { input: 0, output: 0 });
	assert.throws(() => parseOpenRouterModels({ data: 'x' }), { code: 'PROVIDER_UNAVAILABLE' });
	assert.throws(() => parseOpenRouterModels(null), { code: 'PROVIDER_UNAVAILABLE' });
	// Duplicates collapse; over a thousand models are cut off.
	assert.equal(
		parseOpenRouterModels({ data: [{ id: 'a/b' }, { id: 'a/b' }, { id: 'c/d' }] }).length,
		2
	);
	assert.equal(
		parseOpenRouterModels({
			data: Array.from({ length: 1400 }, (_, index) => ({ id: `vendor/model-${index}` })),
		}).length,
		1000
	);
});

test('OpenRouter free request counters are numbers from /key and nothing else', () => {
	assert.deepEqual(
		readFreeRequests({
			data: { free_model_daily_requests: { used: 8, limit: 50, remaining: 42 } },
		}),
		{ remaining: 42, limit: 50 }
	);
	assert.deepEqual(
		readFreeRequests({ data: { free_model_daily_requests: { used: 8, limit: 50 } } }),
		{ remaining: 42, limit: 50 }
	);
	for (const bad of [
		null,
		{},
		{ data: {} },
		{ data: { free_model_daily_requests: { used: 'many', limit: 50 } } },
		{ data: { free_model_daily_requests: { used: 60, limit: 50 } } },
		{ data: { free_model_daily_requests: { remaining: -1, limit: 50 } } },
	]) {
		assert.equal(readFreeRequests(bad), null);
	}
});

test('OpenRouter: /key is checked first with the Bearer key, then the account list; models.dev is not used', async () => {
	const transport = mockTransport();
	const result = await listProviderModels(
		{ provider: 'openrouter', apiKey: KEY },
		{ transport, catalog: noCatalog }
	);
	assert.deepEqual(
		transport.calls.map((call) => call.url),
		[OPENROUTER_URLS.key, OPENROUTER_URLS.user]
	);
	for (const call of transport.calls) {
		assert.equal(call.headers.get('authorization'), `Bearer ${KEY}`);
		assert.equal(call.headers.get('x-api-key'), null);
		assert.equal(call.url.includes(KEY), false);
	}
	assertOnlyAllowlisted(transport.calls);
	assert.equal(result.provider, 'openrouter');
	assert.equal(result.models.length, openRouterModels().length);
	assert.deepEqual(result.freeRequests, { remaining: 42, limit: 50 });
	// Only numbers come from the key's answer: its label (a key fragment) is not passed on.
	assert.equal(JSON.stringify(result).includes('sk-or-v1'), false);
	assert.equal(JSON.stringify(result).includes(KEY), false);
});

test('OpenRouter: a bad key stops at /key (401) and no list is requested', async () => {
	const calls = [];
	const transport = async (url, init = {}) => {
		calls.push(String(url));
		return json({ error: { message: 'User not found.', code: 401 } }, { status: 401 });
	};
	await assert.rejects(
		listProviderModels({ provider: 'openrouter', apiKey: KEY }, { transport, catalog: noCatalog }),
		(error) => error.statusCode === 401 && /User not found/.test(error.responseBody)
	);
	assert.deepEqual(calls, [OPENROUTER_URLS.key]);
});

test('OpenRouter: /models/user failing, unreadable or empty falls back to /models; both failing is an error', async () => {
	for (const userAnswer of [
		() => json({ error: { message: 'nope' } }, { status: 500 }),
		() => new Response('<html>', { status: 200 }),
		() => json({ data: [] }),
		() => json({ data: 'x' }),
	]) {
		const calls = [];
		const transport = async (url) => {
			calls.push(String(url));
			if (String(url) === OPENROUTER_URLS.key) return json(listBodies.openrouterKey());
			if (String(url) === OPENROUTER_URLS.user) return userAnswer();
			return json({ data: [openRouterModel('vendor/only-in-all')] });
		};
		const result = await listProviderModels(
			{ provider: 'openrouter', apiKey: KEY },
			{ transport, catalog: noCatalog }
		);
		assert.deepEqual(calls, [OPENROUTER_URLS.key, OPENROUTER_URLS.user, OPENROUTER_URLS.all]);
		assert.deepEqual(
			result.models.map((model) => model.id),
			['vendor/only-in-all']
		);
	}
	const failing = async (url) =>
		String(url) === OPENROUTER_URLS.key
			? json(listBodies.openrouterKey())
			: json({ error: { message: 'down' } }, { status: 503 });
	await assert.rejects(
		listProviderModels(
			{ provider: 'openrouter', apiKey: KEY },
			{ transport: failing, catalog: noCatalog }
		),
		{ statusCode: 503 }
	);
});

test('OpenRouter: an unreadable /key body still counts as a good key', async () => {
	const transport = async (url) =>
		String(url) === OPENROUTER_URLS.key
			? new Response('ok', { status: 200 })
			: json({ data: [openRouterModel('vendor/model')] });
	const result = await listProviderModels(
		{ provider: 'openrouter', apiKey: KEY },
		{ transport, catalog: noCatalog }
	);
	assert.equal(result.models.length, 1);
	assert.equal('freeRequests' in result, false);
});

test('OpenRouter: a refused redirect or off-list URL never carries the key', async () => {
	const get = createModelListGet(async () => json({}));
	for (const attempt of [
		() => get('https://openrouter.ai/api/v1/credits'),
		() => get('https://openrouter.ai/api/v1/key?x=1'),
		() => get('http://openrouter.ai/api/v1/key'),
		() => get('https://evil.example/api/v1/key'),
		() => get(OPENROUTER_URLS.key, { method: 'POST' }),
		() => get(OPENROUTER_URLS.key, { body: '{}' }),
	]) {
		assert.throws(attempt, /destination rejected/);
	}
	const sent = [];
	const guarded = createModelListGet(async (url, init) => {
		sent.push(init);
		return json({});
	});
	await guarded(OPENROUTER_URLS.key, { headers: { Authorization: `Bearer ${KEY}` } });
	assert.equal(sent[0].redirect, 'error');
});

test('POST /api/agent/models for OpenRouter: key check, list, free counters and a 401 with the provider message', async () => {
	const transport = mockTransport();
	await withRelay({ transport }, async ({ post }) => {
		const response = await post({ provider: 'openrouter', apiKey: KEY });
		assert.equal(response.status, 200);
		const text = await response.text();
		assert.equal(text.includes(KEY), false);
		const body = JSON.parse(text);
		assert.equal(body.provider, 'openrouter');
		assert.deepEqual(body.freeRequests, { remaining: 42, limit: 50 });
		assert.ok(body.models.some((model) => model.id === '~anthropic/claude-sonnet-latest'));
		assertOnlyAllowlisted(transport.calls);
		assert.equal(
			transport.calls.some((call) => call.url === CATALOG_URL),
			false
		);
	});
	const rejecting = mockTransport({
		listStatus: 401,
		listError: () => json({ error: { message: 'User not found.', code: 401 } }, { status: 401 }),
	});
	await withRelay({ transport: rejecting }, async ({ post }) => {
		const response = await post({ provider: 'openrouter', apiKey: KEY });
		assert.equal(response.status, 401);
		assert.deepEqual((await response.json()).error, {
			code: 'PROVIDER_AUTH',
			message: 'The provider rejected this API key.',
			status: 401,
			detail: 'User not found.',
		});
		assert.deepEqual(
			rejecting.calls.map((call) => call.url),
			[OPENROUTER_URLS.key]
		);
	});
});

test('Zen list: public URL under /inference, Bearer key, 401 for a bad key', async () => {
	const transport = mockTransport();
	const result = await listProviderModels(
		{ provider: 'opencode-zen', apiKey: KEY },
		{ transport, catalog: createCatalogSource({ transport }) }
	);
	const list = transport.calls.find((call) => call.url !== CATALOG_URL);
	assert.equal(list.url, 'https://opencode.ai/inference/v1/models');
	assert.equal(list.headers.get('authorization'), `Bearer ${KEY}`);
	assert.ok(result.models.some((model) => model.id === 'big-pickle'));
	await withRelay(
		{
			transport: mockTransport({
				listStatus: 401,
				listError: () =>
					json({ error: { type: 'server_error', message: 'Invalid credential' } }, { status: 401 }),
			}),
		},
		async ({ post }) => {
			const response = await post({ provider: 'opencode-zen', apiKey: KEY });
			assert.equal(response.status, 401);
			const { error } = await response.json();
			assert.equal(error.code, 'PROVIDER_AUTH');
			assert.equal(error.detail, 'Invalid credential');
		}
	);
});

test('sanitizeDetail: one clean line without the key, bearer or sk- text, markup, control characters or long tokens', () => {
	const key = 'sk-or-v1-0123456789abcdef0123456789abcdef';
	assert.equal(sanitizeDetail(`Bad key ${key} given`, key), 'Bad key given');
	assert.equal(
		sanitizeDetail('Header Authorization: Bearer abc.def.ghi rejected'),
		'Header Authorization: rejected'
	);
	assert.equal(
		sanitizeDetail(
			'Incorrect API key provided: sk-proj-********abcd. Find yours at the dashboard.'
		),
		'Incorrect API key provided: Find yours at the dashboard.'
	);
	// A masked echo of the key is removed by its recognisable ends.
	assert.equal(
		sanitizeDetail('Key ABCDEFGH...uvwxyz is wrong', 'ABCDEFGH12345678uvwxyz'),
		'Key ... is wrong'
	);
	assert.equal(sanitizeDetail('<b>Oops</b>\n\tsecond\u0000 line here'), 'Oops second line here');
	assert.equal(sanitizeDetail('request id ' + 'a'.repeat(40) + ' failed'), 'request id failed');
	assert.equal(sanitizeDetail('x'.repeat(10) + ' ' + 'word '.repeat(80)).length, 200);
	assert.ok(sanitizeDetail('word '.repeat(80)).endsWith('…'));
	for (const empty of ['', '   ', key, 42, null, undefined, {}]) {
		assert.equal(sanitizeDetail(empty, key), undefined);
	}
});

// ---- The app's required capabilities over what the relay really sends (#82) ------------------
// src/agent/model-requirements.js decides which models the card lists. These checks feed it the
// relay's own output, so OpenRouter's supported_parameters and models.dev's tool_call are covered
// end to end, not just the browser half.

const NOW = Date.parse('2026-10-23T12:00:00Z');
const idsOf = (models) => models.map((model) => model.id);

test('requirements over an OpenRouter list: tools, text output, context window, end date, unknown', () => {
	const models = parseOpenRouterModels({
		data: [
			openRouterModel('ok/vision-free:free', {
				pricing: { prompt: '0', completion: '0' },
				architecture: { input_modalities: ['text', 'image'], output_modalities: ['text'] },
				context_length: 1_000_000,
			}),
			openRouterModel('ok/text-free:free', {
				pricing: { prompt: '0', completion: '0' },
				context_length: 262144,
			}),
			openRouterModel('ok/paid'),
			// supported_parameters without "tools": the agent cannot drive it.
			openRouterModel('no/tools:free', {
				pricing: { prompt: '0', completion: '0' },
				supported_parameters: ['max_tokens', 'temperature'],
			}),
			// Tools in the parameters, but it writes music, not text.
			openRouterModel('no/text-output', {
				architecture: { input_modalities: ['text'], output_modalities: ['audio'] },
			}),
			// Under 32k tokens of context.
			openRouterModel('no/small-context', { context_length: 16384 }),
			openRouterModel('edge/exactly-32k', { context_length: 32000 }),
			// Past its end date.
			openRouterModel('no/ended:free', {
				pricing: { prompt: '0', completion: '0' },
				expiration_date: '2026-10-22',
			}),
			// Ends soon: still listed.
			openRouterModel('ok/ends-soon:free', {
				pricing: { prompt: '0', completion: '0' },
				expiration_date: '2026-10-31',
			}),
			// No supported_parameters at all: tool support unknown, hidden.
			openRouterModel('unknown/no-params', { supported_parameters: undefined }),
			// A router with a varying price still uses tools.
			openRouterModel('openrouter/auto-beta', { pricing: { prompt: '-1', completion: '-1' } }),
			openRouterModel('~anthropic/claude-sonnet-latest'),
		],
	});
	const { free, paid } = listSupported(models, { provider: 'openrouter', now: NOW });
	// Vision first, then the larger context window (these two tie at 262144), then the name.
	assert.deepEqual(idsOf(free), ['ok/vision-free:free', 'ok/ends-soon:free', 'ok/text-free:free']);
	// Same rule as Free: Vision, then the larger context window, then the name.
	assert.deepEqual(idsOf(paid), [
		'~anthropic/claude-sonnet-latest',
		'ok/paid',
		'openrouter/auto-beta',
		'edge/exactly-32k',
	]);
	const status = (id) =>
		assessModel(
			models.find((model) => model.id === id),
			{ provider: 'openrouter', now: NOW }
		);
	assert.deepEqual(status('no/tools:free'), {
		status: 'unsupported',
		failed: ['no-tools'],
		recommended: { vision: false },
	});
	assert.deepEqual(status('no/text-output').failed, ['no-tools', 'no-text']);
	assert.deepEqual(status('no/small-context').failed, ['small-context']);
	assert.deepEqual(status('no/ended:free').failed, ['deprecated']);
	assert.equal(status('unknown/no-params').status, 'unknown');
	assert.equal(status('ok/vision-free:free').recommended.vision, true);
	assert.equal(status('openrouter/auto-beta').status, 'supported');
});

test('requirements over a models.dev backed list: tool_call decides, unknown models are hidden', async () => {
	const transport = mockTransport({
		catalog: () => {
			const doc = catalogDocument();
			doc.openai.models['small-context-model'] = {
				tool_call: true,
				modalities: { input: ['text'], output: ['text'] },
				cost: { input: 1, output: 2 },
				limit: { context: 8000 },
			};
			return doc;
		},
		lists: {
			...listBodies,
			openai: () => ({
				data: [
					{ id: 'gpt-5' },
					{ id: 'gpt-5-2025-08-07' },
					{ id: 'gpt-3.5-turbo' },
					{ id: 'text-embedding-3-small' },
					{ id: 'gpt-realtime' },
					{ id: 'gpt-free-tier' },
					{ id: 'small-context-model' },
					{ id: 'whisper-1' },
					{ id: 'brand-new-model' },
				],
			}),
		},
	});
	const result = await listProviderModels(
		{ provider: 'openai', apiKey: KEY },
		{ transport, catalog: createCatalogSource({ transport }) }
	);
	const { free, paid } = listSupported(result.models, { provider: 'openai', now: NOW });
	assert.deepEqual(idsOf(free), ['gpt-free-tier']);
	// gpt-5 (400k, vision) first; a dated ID shares its plain model's facts.
	assert.deepEqual(idsOf(paid), ['gpt-5', 'gpt-5-2025-08-07']);
	const hidden = (id) =>
		assessModel(
			result.models.find((model) => model.id === id),
			{ provider: 'openai', now: NOW }
		);
	assert.deepEqual(hidden('gpt-3.5-turbo').failed, ['deprecated', 'no-tools', 'small-context']);
	assert.deepEqual(hidden('text-embedding-3-small').failed, ['no-tools']);
	assert.deepEqual(hidden('gpt-realtime').failed, ['no-tools']);
	assert.deepEqual(hidden('small-context-model').failed, ['small-context']);
	assert.deepEqual(hidden('whisper-1').failed, ['no-tools']);
	// The catalog knows nothing about it: hidden, reachable only as a typed model ID.
	assert.equal(hidden('brand-new-model').status, 'unknown');
});

test('requirements over a Zen list: free first, formats Noddy cannot speak are not offered', async () => {
	const transport = mockTransport({
		lists: {
			...listBodies,
			'opencode-zen': () => ({
				data: [
					{ id: 'big-pickle' },
					{ id: 'kimi-k2.6' },
					{ id: 'no-cost-listed' },
					{ id: 'test' },
					{ id: 'gemini-3.5-flash' },
					{ id: 'jev-1.13-free' },
				],
			}),
		},
		catalog: () => {
			const doc = catalogDocument();
			doc.opencode.models['kimi-k2.6'] = {
				tool_call: true,
				modalities: { input: ['text'], output: ['text'] },
				cost: { input: 0.6, output: 2.5 },
				limit: { context: 262144 },
			};
			doc.opencode.models['gemini-3.5-flash'] = {
				tool_call: true,
				modalities: { input: ['text'], output: ['text'] },
				cost: { input: 1, output: 2 },
			};
			doc.opencode.models['jev-1.13-free'] = {
				tool_call: true,
				modalities: { input: ['text'], output: ['text'] },
				cost: { input: 0, output: 0 },
			};
			return doc;
		},
	});
	const result = await listProviderModels(
		{ provider: 'opencode-zen', apiKey: KEY },
		{ transport, catalog: createCatalogSource({ transport }) }
	);
	const { free, paid } = listSupported(result.models, { provider: 'opencode-zen', now: NOW });
	assert.deepEqual(idsOf(free), ['big-pickle']);
	assert.deepEqual(idsOf(paid), ['kimi-k2.6']);
	const why = (id) =>
		assessModel(
			result.models.find((model) => model.id === id),
			{
				provider: 'opencode-zen',
				now: NOW,
			}
		);
	// Gemini and Jev use API formats Noddy does not speak yet; an unknown family has none to route to.
	assert.deepEqual(why('gemini-3.5-flash').failed, ['unknown-format']);
	assert.deepEqual(why('jev-1.13-free').failed, ['unknown-format']);
	assert.deepEqual(why('no-cost-listed').failed, ['unknown-format']);
	// Zen's own junk entry ("test") belongs to no known family: nothing to route it to.
	assert.equal(why('test').status, 'unsupported');
});
