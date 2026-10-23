import { describe, expect, it, vi } from 'vitest';
import {
	CONNECTION_STORAGE_KEY,
	PRESELECT_SKIP_DAYS,
	RELAY_OFF_COPY,
	SEARCH_THRESHOLD,
	captionFor,
	checkKeyText,
	checkTypedModel,
	countLine,
	describeError,
	describeRunError,
	filterModels,
	forget,
	freeCaption,
	groupModels,
	noSupportedNote,
	normalizeKey,
	preselect,
	readRemembered,
	remember,
} from '../connect-flow.js';

const NOW = Date.parse('2026-10-23T12:00:00Z');
const free = { input: 0, output: 0 };
const model = (id, overrides = {}) => ({
	id,
	tools: true,
	vision: false,
	price: { input: 3, output: 15 },
	released: '2026-01-01',
	context: 200_000,
	text: true,
	deprecated: false,
	...overrides,
});

/** An in-memory Storage that records every write. */
function memoryStorage(initial = {}) {
	const data = new Map(Object.entries(initial));
	return {
		data,
		getItem: (key) => (data.has(key) ? data.get(key) : null),
		setItem: vi.fn((key, value) => data.set(key, String(value))),
		removeItem: vi.fn((key) => data.delete(key)),
	};
}

describe('remembering the provider and model, never the key (#82)', () => {
	it('stores exactly provider, model and tier', () => {
		const storage = memoryStorage();
		remember(
			{ provider: 'openrouter', model: 'google/gemma-4-26b-a4b-it:free', tier: 'free' },
			storage
		);
		expect(JSON.parse(storage.data.get(CONNECTION_STORAGE_KEY))).toEqual({
			provider: 'openrouter',
			model: 'google/gemma-4-26b-a4b-it:free',
			tier: 'free',
		});
		expect(readRemembered(storage)).toEqual({
			provider: 'openrouter',
			model: 'google/gemma-4-26b-a4b-it:free',
			tier: 'free',
		});
	});

	it('rebuilds the object field by field, so a key that slips into the argument is never stored', () => {
		const storage = memoryStorage();
		remember(
			{ provider: 'openai', model: 'gpt-5', tier: 'paid', apiKey: 'sk-never-stored-secret' },
			storage
		);
		const written = storage.setItem.mock.calls.map(([, value]) => value).join('');
		expect(written).not.toContain('sk-never-stored-secret');
		expect(written).not.toContain('apiKey');
		expect(Object.keys(JSON.parse(written)).sort()).toEqual(['model', 'provider', 'tier']);
	});

	it('leaves the tier out when the price is not known', () => {
		const storage = memoryStorage();
		remember({ provider: 'anthropic', model: 'claude-sonnet-5-5' }, storage);
		expect(JSON.parse(storage.data.get(CONNECTION_STORAGE_KEY))).toEqual({
			provider: 'anthropic',
			model: 'claude-sonnet-5-5',
		});
		remember({ provider: 'anthropic', model: 'claude-sonnet-5-5', tier: 'gold' }, storage);
		expect(JSON.parse(storage.data.get(CONNECTION_STORAGE_KEY))).not.toHaveProperty('tier');
	});

	it('ignores anything unknown, malformed or hostile', () => {
		const read = (value) => readRemembered(memoryStorage({ [CONNECTION_STORAGE_KEY]: value }));
		expect(read(undefined)).toBe(null);
		expect(read('not json')).toBe(null);
		expect(read('null')).toBe(null);
		expect(read('"string"')).toBe(null);
		expect(read(JSON.stringify({ provider: 'evilcorp', model: 'gpt-5' }))).toBe(null);
		expect(read(JSON.stringify({ provider: '__proto__', model: 'gpt-5' }))).toBe(null);
		expect(read(JSON.stringify({ provider: 'openai', model: '<img onerror=x>' }))).toBe(null);
		expect(read(JSON.stringify({ provider: 'openai', model: 42 }))).toBe(null);
		expect(read(JSON.stringify({ provider: 'openai', model: 'a'.repeat(200) }))).toBe(null);
		expect(read(JSON.stringify({ provider: 'openai', model: 'gpt-5', tier: 'weird' }))).toEqual({
			provider: 'openai',
			model: 'gpt-5',
		});
	});

	it('does not store an unknown provider or an invalid ID', () => {
		const storage = memoryStorage();
		remember({ provider: 'evilcorp', model: 'gpt-5' }, storage);
		remember({ provider: 'openai', model: 'bad id with spaces' }, storage);
		expect(storage.setItem).not.toHaveBeenCalled();
	});

	it('works without storage: blocked, throwing or absent storage never breaks the flow', () => {
		const throwing = {
			getItem: () => {
				throw new Error('blocked');
			},
			setItem: () => {
				throw new Error('blocked');
			},
			removeItem: () => {
				throw new Error('blocked');
			},
		};
		expect(readRemembered(throwing)).toBe(null);
		expect(() => remember({ provider: 'openai', model: 'gpt-5' }, throwing)).not.toThrow();
		expect(() => forget(throwing)).not.toThrow();
		expect(readRemembered(null)).toBe(null);
		expect(() => remember({ provider: 'openai', model: 'gpt-5' }, null)).not.toThrow();
	});

	it('forget removes it', () => {
		const storage = memoryStorage();
		remember({ provider: 'openai', model: 'gpt-5' }, storage);
		forget(storage);
		expect(readRemembered(storage)).toBe(null);
	});
});

describe('the pasted key (#82)', () => {
	it('trims whitespace and one pair of surrounding quotes, and nothing inside', () => {
		expect(normalizeKey('  sk-or-v1-abc  ')).toBe('sk-or-v1-abc');
		expect(normalizeKey('\n"sk-or-v1-abc"\n')).toBe('sk-or-v1-abc');
		expect(normalizeKey("'sk-or-v1-abc'")).toBe('sk-or-v1-abc');
		expect(normalizeKey('`sk-or-v1-abc`')).toBe('sk-or-v1-abc');
		// Never turned into a different key: inner characters and unbalanced quotes stay.
		expect(normalizeKey('sk-or-"v1"-abc')).toBe('sk-or-"v1"-abc');
		expect(normalizeKey('"sk-or-v1-abc')).toBe('"sk-or-v1-abc');
		expect(normalizeKey('sk-or-v1 abc')).toBe('sk-or-v1 abc');
		expect(normalizeKey('')).toBe('');
		expect(normalizeKey(undefined)).toBe('');
	});
});

describe('key text the relay would refuse (QA #83 item 4)', () => {
	it('drops a leading "Bearer " or "Authorization: Bearer " copied from a curl example', () => {
		expect(normalizeKey('Bearer sk-or-v1-abc')).toBe('sk-or-v1-abc');
		expect(normalizeKey('  authorization: bearer sk-or-v1-abc ')).toBe('sk-or-v1-abc');
		expect(normalizeKey('"Bearer sk-or-v1-abc"')).toBe('sk-or-v1-abc');
		// "Bearer" without a space after it may be part of a key: left alone.
		expect(normalizeKey('Bearersk-abc')).toBe('Bearersk-abc');
	});

	it('names a space, a non-ASCII character, an empty field and a too-long text before anything is sent', () => {
		expect(checkKeyText('  sk-or-v1-abc ')).toEqual({ ok: true, key: 'sk-or-v1-abc' });
		expect(checkKeyText('')).toMatchObject({ ok: false, reason: 'empty' });
		expect(checkKeyText('sk-or v1')).toMatchObject({ ok: false, reason: 'space' });
		expect(checkKeyText('sk-or-v1-ключ')).toMatchObject({ ok: false, reason: 'characters' });
		expect(checkKeyText('a'.repeat(513))).toMatchObject({ ok: false, reason: 'long' });
		expect(checkKeyText('a'.repeat(512))).toMatchObject({ ok: true });
		for (const value of ['sk-or v1', 'sk-or-v1-ключ', 'a'.repeat(513)]) {
			const result = checkKeyText(value);
			expect(result.ok).toBe(false);
			if (!result.ok) expect(result.text).toContain('Nothing was sent.');
		}
	});

	it('relay-local codes are reported as the relay, never as the provider', () => {
		for (const code of ['INVALID_REQUEST', 'TOO_LARGE', 'INVALID_ORIGIN']) {
			const view = describeError(
				{ code, status: 400, message: 'Enter a valid provider API key.' },
				{ provider: 'openrouter', key: 'sk-or-v1-secret' }
			);
			expect(view.kind).toBe('relay');
			expect(view.text).not.toMatch(/OpenRouter|openrouter\.ai/);
			expect(view.details).toContainEqual(['From', 'Noddy relay, on this computer']);
			expect(JSON.stringify(view)).not.toContain('sk-or-v1-secret');
		}
	});
});

describe('a router whose price varies (QA #83 note)', () => {
	it('is not pre-selected while anything else can be, and its caption says it can bill', () => {
		const router = model('openrouter/auto', { price: null, varies: true, vision: true });
		const paid = model('vendor/paid');
		const groups = groupModels([router, paid], { now: NOW });
		expect(preselect(groups, NOW)).toBe('vendor/paid');
		expect(preselect(groupModels([router], { now: NOW }), NOW)).toBe('openrouter/auto');
		expect(captionFor('openrouter', router)).toBe(
			"This model's price varies — it bills your OpenRouter account."
		);
	});
});

describe('the model list for the card (#82)', () => {
	const models = [
		model('anthropic/claude-sonnet-5-5'),
		model('google/gemma-4-26b-a4b-it:free', { price: free, vision: true, context: 262_144 }),
		model('liquid/lfm-2.5-2.6b:free', { price: free, context: 65_536 }),
		model('openai/gpt-3.5-turbo', { tools: false }),
		model('mystery/model', { tools: null, price: null }),
	];

	it('groups only supported models: Free first, then Paid; nothing is greyed out', () => {
		const groups = groupModels(models, { provider: 'openrouter', now: NOW });
		expect(groups.map((group) => [group.id, group.label])).toEqual([
			['free', 'Free'],
			['paid', 'Paid'],
		]);
		expect(groups[0].models.map((item) => item.id)).toEqual([
			'google/gemma-4-26b-a4b-it:free',
			'liquid/lfm-2.5-2.6b:free',
		]);
		expect(groups[1].models.map((item) => item.id)).toEqual(['anthropic/claude-sonnet-5-5']);
		const shown = groups.flatMap((group) => group.models.map((item) => item.id));
		expect(shown).not.toContain('openai/gpt-3.5-turbo');
		expect(shown).not.toContain('mystery/model');
	});

	it('leaves an empty group out', () => {
		expect(groupModels([model('a')], { now: NOW }).map((group) => group.id)).toEqual(['paid']);
		expect(
			groupModels([model('a', { price: free })], { now: NOW }).map((group) => group.id)
		).toEqual(['free']);
		expect(groupModels([model('a', { tools: false })], { now: NOW })).toEqual([]);
		expect(groupModels([], { now: NOW })).toEqual([]);
	});

	it('hides Zen models whose API format Noddy does not speak', () => {
		const zen = [model('beam-free', { price: free }), model('gemini-3.5-flash'), model('jev-1.13')];
		const groups = groupModels(zen, { provider: 'opencode-zen', now: NOW });
		expect(groups.flatMap((group) => group.models.map((item) => item.id))).toEqual(['beam-free']);
	});

	it('search filters across both groups; every word must appear in the ID', () => {
		const some = filterModels(models, 'GEMMA free');
		expect(some.map((item) => item.id)).toEqual(['google/gemma-4-26b-a4b-it:free']);
		expect(filterModels(models, '  ')).toBe(models);
		const groups = groupModels(models, { provider: 'openrouter', now: NOW, text: 'claude' });
		expect(groups.map((group) => group.id)).toEqual(['paid']);
		expect(groupModels(models, { now: NOW, text: 'zzz' })).toEqual([]);
	});

	it('searching never brings a hidden model back', () => {
		expect(groupModels(models, { now: NOW, text: 'mystery' })).toEqual([]);
		expect(groupModels(models, { now: NOW, text: 'gpt-3.5' })).toEqual([]);
	});

	it('the search field appears over 12 models', () => {
		expect(SEARCH_THRESHOLD).toBe(12);
	});

	it('pre-selects the first Free model, else the first Paid one', () => {
		const groups = groupModels(models, { provider: 'openrouter', now: NOW });
		expect(preselect(groups, NOW)).toBe('google/gemma-4-26b-a4b-it:free');
		const paidOnly = groupModels([model('b'), model('a')], { now: NOW });
		expect(preselect(paidOnly, NOW)).toBe('a');
		expect(preselect([], NOW)).toBe('');
	});

	it('never pre-selects a model that ends within two weeks', () => {
		expect(PRESELECT_SKIP_DAYS).toBe(14);
		const soon = model('soon:free', {
			price: free,
			vision: true,
			context: 1_000_000,
			expires: '2026-10-31',
		});
		const later = model('later:free', { price: free, context: 100_000, expires: '2026-12-31' });
		const groups = groupModels([soon, later], { provider: 'openrouter', now: NOW });
		// It is still listed (first, by the rule) ...
		expect(groups[0].models[0].id).toBe('soon:free');
		// ... but the start is the next one.
		expect(preselect(groups, NOW)).toBe('later:free');
		// With only an expiring model nothing is pre-selected: the user chooses it knowingly.
		expect(preselect(groupModels([soon], { now: NOW }), NOW)).toBe('');
	});

	it('a typed ID must pass the relay’s ID rules and name a format Noddy speaks', () => {
		expect(checkTypedModel('openrouter', ' vendor/model:free ')).toEqual({
			ok: true,
			id: 'vendor/model:free',
		});
		expect(checkTypedModel('openrouter', '~anthropic/claude-sonnet-latest')).toEqual({
			ok: true,
			id: '~anthropic/claude-sonnet-latest',
		});
		expect(checkTypedModel('openrouter', '')).toEqual({ ok: false, reason: 'empty' });
		expect(checkTypedModel('openrouter', 'has spaces')).toEqual({ ok: false, reason: 'invalid' });
		expect(checkTypedModel('openrouter', '<b>x</b>')).toEqual({ ok: false, reason: 'invalid' });
		expect(checkTypedModel('opencode-zen', 'gemini-3.5-flash')).toEqual({
			ok: false,
			reason: 'format',
		});
		expect(checkTypedModel('opencode-zen', 'kimi-k2.6').ok).toBe(true);
	});

	it('the quiet line says how many models work with Noddy’s tools', () => {
		expect(countLine(42, 42)).toBe('Showing 42 models that work with Noddy’s tools.');
		expect(countLine(1, 1)).toBe('Showing 1 model that works with Noddy’s tools.');
		expect(countLine(3, 42)).toBe('Showing 3 of 42 models that work with Noddy’s tools.');
	});

	it('a key with no supported model is explained, and another provider is suggested', () => {
		expect(noSupportedNote('openai', 12)).toBe(
			'None of this key’s 12 models work with Noddy’s tools. OpenRouter has free models that do. Or type a model ID.'
		);
		expect(noSupportedNote('openai', 1)).toContain('None of this key’s 1 model works');
		expect(noSupportedNote('anthropic', 0)).toBe(
			'This key lists no models. OpenRouter has free models that do. Or type a model ID.'
		);
		expect(noSupportedNote('openrouter', 0)).toBe(
			'OpenRouter lists no models that work with Noddy’s tools right now. Type a model ID to try one.'
		);
	});

	it('says what choosing a model means: Free may keep what you send, Paid bills the account', () => {
		expect(captionFor('openrouter', models[1])).toBe('Free models may keep what you send.');
		expect(captionFor('openai', model('gpt-5'))).toBe('Paid models bill your OpenAI account.');
		expect(captionFor('opencode-zen', model('x', { price: null }))).toBe('');
		expect(captionFor('openai', undefined)).toBe('');
	});

	it('the Free group note gives the OpenRouter limits, or the live counters', () => {
		expect(freeCaption('openrouter', null)).toBe('Free models: 20 requests a minute, 50 a day.');
		expect(freeCaption('openrouter', { remaining: 38, limit: 50 })).toBe(
			'38 of 50 free requests left today.'
		);
		expect(freeCaption('openai', null)).toBe('');
	});
});

describe('errors that explain and offer a fix (#82)', () => {
	const KEY = 'sk-or-v1-secretsecretsecret';

	it('401 · key not accepted, the field is refocused and the fix is a different key', () => {
		const view = describeError(
			{ code: 'PROVIDER_AUTH', status: 401, detail: 'User not found.' },
			{ provider: 'openrouter', key: KEY }
		);
		expect(view.text).toBe('401 · Key not accepted — check you copied the whole key.');
		expect(view.kind).toBe('auth');
		expect(view.focus).toBe('key');
		expect(view.reenterKey).toBe(true);
		expect(view.details).toEqual([
			['Status', '401'],
			['From', 'openrouter.ai'],
			['Message', '"User not found."'],
		]);
	});

	it('401 with a key that lacks the provider’s usual prefix says what a key looks like', () => {
		const view = describeError(
			{ code: 'PROVIDER_AUTH', status: 401 },
			{ provider: 'openrouter', key: 'abc123' }
		);
		expect(view.text).toBe(
			'401 · Key not accepted — check you copied the whole key. OpenRouter keys start with sk-or-.'
		);
		const anthropic = describeError(
			{ code: 'PROVIDER_AUTH', status: 401 },
			{ provider: 'anthropic', key: 'sk-wrong' }
		);
		expect(anthropic.text).toContain('Anthropic keys start with sk-ant-.');
	});

	it('never echoes the key, whatever the error says', () => {
		for (const code of [
			'PROVIDER_AUTH',
			'PROVIDER_CREDITS',
			'PROVIDER_FORBIDDEN',
			'PROVIDER_MODEL',
			'PROVIDER_REQUEST',
			'PROVIDER_LIMIT',
			'PROVIDER_UNAVAILABLE',
		]) {
			const view = describeError(
				{ code, status: 401, detail: 'rejected' },
				{ provider: 'openrouter', key: KEY }
			);
			expect(JSON.stringify(view)).not.toContain(KEY);
			expect(JSON.stringify(view)).not.toContain('secretsecret');
		}
	});

	it('402 · out of credits, with a link to add credits and the list kept open', () => {
		const view = describeError(
			{ code: 'PROVIDER_CREDITS', status: 402 },
			{ provider: 'openrouter' }
		);
		expect(view.text).toBe('402 · Out of credits — add credits, or pick a free model.');
		expect(view.links).toEqual([
			{ label: 'Add credits', href: 'https://openrouter.ai/settings/credits' },
		]);
		expect(view.focus).toBe('list');
		expect(view.reenterKey).toBe(false);
	});

	it('403 from OpenCode’s free tier is its own message, not "Key not accepted"', () => {
		const view = describeError(
			{ code: 'PROVIDER_FORBIDDEN', status: 403, hint: 'free-tier-only' },
			{ provider: 'opencode-zen' }
		);
		expect(view.kind).toBe('free-tier');
		expect(view.text).toBe(
			'403 · OpenCode only offers its free models inside OpenCode — pick a paid Zen model, or go back and use OpenRouter.'
		);
		expect(view.text).not.toMatch(/not accepted/i);
		expect(view.reenterKey).toBe(false);
	});

	it('403 for another reason says the key cannot use that model', () => {
		const view = describeError({ code: 'PROVIDER_FORBIDDEN', status: 403 }, { provider: 'openai' });
		expect(view.text).toBe("403 · This key can't use that model — pick another.");
	});

	it('404 · model not found; a data-policy 404 points at OpenRouter’s privacy settings; a tools 404 says so', () => {
		const plain = describeError(
			{ code: 'PROVIDER_MODEL', status: 404 },
			{ provider: 'openrouter' }
		);
		expect(plain.text).toBe('404 · Model not found — it may have been removed. Pick another.');
		const policy = describeError(
			{ code: 'PROVIDER_MODEL', status: 404, hint: 'data-policy' },
			{ provider: 'openrouter' }
		);
		expect(policy.text).toBe(
			'404 · Your OpenRouter privacy settings block this free model — allow free models there, or pick another.'
		);
		expect(policy.links).toEqual([
			{ label: 'Open settings', href: 'https://openrouter.ai/settings/privacy' },
		]);
		const tools = describeError(
			{ code: 'PROVIDER_MODEL', status: 404, hint: 'no-tools' },
			{ provider: 'openrouter' }
		);
		expect(tools.text).toBe("404 · This model can't use tools — pick another.");
	});

	it('400 and 422 · the provider rejected the test message', () => {
		const view = describeError(
			{ code: 'PROVIDER_REQUEST', status: 422 },
			{ provider: 'openrouter' }
		);
		expect(view.text).toBe('422 · OpenRouter rejected the test message — pick another model.');
		const tools = describeError(
			{ code: 'PROVIDER_REQUEST', status: 400, hint: 'no-tools' },
			{ provider: 'openrouter' }
		);
		expect(tools.kind).toBe('no-tools');
	});

	it('429 · rate limited', () => {
		const view = describeError({ code: 'PROVIDER_LIMIT', status: 429 }, { provider: 'openrouter' });
		expect(view.text).toBe('429 · Rate limited — try another free model or wait a minute.');
	});

	it('408 and 5xx · the provider is not responding, try again', () => {
		const view = describeError(
			{ code: 'PROVIDER_UNAVAILABLE', status: 502 },
			{ provider: 'opencode-zen' }
		);
		expect(view.text).toBe(
			"502 · OpenCode Zen isn't responding — try again, or pick another model."
		);
		const timeout = describeError({ code: 'CANCELLED', status: 408 }, { provider: 'openai' });
		expect(timeout.text).toBe("408 · OpenAI isn't responding — try again, or pick another model.");
	});

	it('the relay being off says so and that drawing by hand still works', () => {
		const view = describeError({ offline: true }, { provider: 'openrouter' });
		expect(view.text).toBe(RELAY_OFF_COPY);
		expect(RELAY_OFF_COPY).toBe('Noddy relay is off · drawing by hand still works');
		expect(view.details).toEqual([]);
	});

	it('uses the relay’s status over the code’s default, and falls back to the code’s', () => {
		expect(
			describeError({ code: 'PROVIDER_MODEL', status: 410 }, { provider: 'openai' }).text
		).toMatch(/^410 · /);
		expect(describeError({ code: 'PROVIDER_LIMIT' }, { provider: 'openai' }).text).toMatch(
			/^429 · /
		);
	});

	it('an unknown code still says something useful, with no status invented', () => {
		const view = describeError({ code: 'WHAT' }, { provider: 'openai' });
		expect(view.text).toBe("OpenAI isn't responding — try again, or pick another model.");
		expect(view.details).toEqual([['From', 'api.openai.com']]);
	});

	it('run errors in the thread say the same thing, and only provider errors get it', () => {
		const run = describeRunError({ code: 'PROVIDER_AUTH', status: 401 }, 'openrouter');
		expect(run?.text).toBe('401 · Key not accepted — check you copied the whole key.');
		expect(describeRunError({ code: 'RELAY_OFFLINE' }, 'openrouter')).toBe(null);
		expect(describeRunError({ code: 'NO_GLYPH' }, 'openrouter')).toBe(null);
		expect(describeRunError({}, 'openrouter')).toBe(null);
		expect(describeRunError(undefined, 'openrouter')).toBe(null);
	});
});
