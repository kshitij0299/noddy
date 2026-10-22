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
	createCatalogGet,
	createModelListGet,
	modelListRequest,
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
import { listProviderModels, parseModelIds } from './models.js';
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
				release_date: '2025-08-07',
			},
			'gpt-3.5-turbo': {
				tool_call: false,
				modalities: { input: ['text'] },
				cost: { input: 0.5, output: 1.5 },
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
};

/**
 * A fetch-like mock for every outbound GET the relay makes. Records each call.
 * `handlers` may override the provider lists or the catalog.
 */
function mockTransport({ lists = listBodies, catalog = catalogDocument, listStatus = 200 } = {}) {
	const calls = [];
	const transport = async (url, init = {}) => {
		const headers = new Headers(init.headers);
		calls.push({ url: String(url), init, headers });
		if (String(url) === CATALOG_URL) {
			const result = typeof catalog === 'function' ? catalog(init) : catalog;
			return result instanceof Response ? result : json(result);
		}
		const provider = Object.keys(MODEL_LIST_URLS).find(
			(name) => MODEL_LIST_URLS[name] === String(url)
		);
		assert.ok(provider, `unexpected outbound URL ${url}`);
		if (listStatus !== 200) {
			return json({ error: { message: `echo ${KEY}` } }, { status: listStatus });
		}
		const body = lists[provider]();
		return body instanceof Response ? body : json(body);
	};
	return Object.assign(transport, { calls });
}

const allowedOutbound = new Set([...Object.values(MODEL_LIST_URLS), CATALOG_URL]);
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
		'opencode-zen': 'https://opencode.ai/zen/v1/models',
		anthropic: 'https://api.anthropic.com/v1/models?limit=1000',
	});
	assert.equal(CATALOG_URL, 'https://models.dev/api.json');
	for (const provider of ['openai', 'opencode-zen']) {
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
			modalities: { input: ['text', 'image'] },
			cost: { input: 3, output: 15, cache_read: 0.3 },
			release_date: '2025-09-29',
		}),
		{ tools: true, vision: true, price: { input: 3, output: 15 }, released: '2025-09-29' }
	);
	// Free is "both costs are 0": the price is kept as 0 / 0.
	assert.deepEqual(normalizeEntry({ tool_call: true, cost: { input: 0, output: 0 } }).price, {
		input: 0,
		output: 0,
	});
	// Missing facts are unknown, not false.
	assert.deepEqual(normalizeEntry({}), { tools: null, vision: null, price: null, released: null });
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
			assert.deepEqual(Object.keys(entry).sort(), ['price', 'released', 'tools', 'vision']);
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
		parseModelIds({ data: Array.from({ length: 900 }, (_, i) => ({ id: `m-${i}` })) }).length,
		500
	);
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
				'id',
				'price',
				'released',
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

test('provider failures are sanitized: no upstream text, key or headers come back', async () => {
	const expected = {
		401: ['PROVIDER_AUTH', 401],
		403: ['PROVIDER_AUTH', 401],
		429: ['PROVIDER_LIMIT', 429],
		404: ['PROVIDER_REQUEST', 422],
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
			assert.equal(JSON.parse(text).error.code, code);
			assert.equal(text.includes(KEY), false);
			assert.equal(text.includes('echo'), false);
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
		assert.deepEqual(Object.keys(config.providers), ['openai', 'opencode-zen', 'anthropic']);
		assert.equal(
			(await fetch(origin + '/api/agent/nope', { headers: { Origin: origin } })).status,
			404
		);
	});
});
