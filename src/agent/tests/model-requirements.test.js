import { describe, expect, it } from 'vitest';
import {
	MODEL_REQUIREMENTS,
	REQUIREMENT_FAILURES,
	assessModel,
	countSupported,
	hasKnownFormat,
	isSupported,
	listSupported,
} from '../model-requirements.js';

const NOW = Date.parse('2026-10-23T12:00:00Z');

/** A model that meets every requirement; tests change one fact at a time. */
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

const free = { input: 0, output: 0 };

describe('the app’s required model capabilities (#82)', () => {
	it('live in one frozen place, so a feature can raise them', () => {
		expect(Object.isFrozen(MODEL_REQUIREMENTS)).toBe(true);
		expect(Object.isFrozen(MODEL_REQUIREMENTS.required)).toBe(true);
		expect(Object.isFrozen(MODEL_REQUIREMENTS.recommended)).toBe(true);
		expect(MODEL_REQUIREMENTS.required).toEqual({
			tools: true,
			textOutput: true,
			minContextTokens: 32_000,
			notDeprecated: true,
			knownApiFormat: true,
		});
		// Vision is recommended (a badge, sorts higher), never required.
		expect(MODEL_REQUIREMENTS.recommended).toEqual({ vision: true });
		expect(MODEL_REQUIREMENTS.required).not.toHaveProperty('vision');
		expect(REQUIREMENT_FAILURES).toEqual([
			'deprecated',
			'no-tools',
			'no-text',
			'small-context',
			'unknown-format',
		]);
	});

	it('a model with tools, text output and room to work is supported', () => {
		expect(assessModel(model('a'), { now: NOW })).toEqual({
			status: 'supported',
			failed: [],
			recommended: { vision: false },
		});
		expect(isSupported(model('a'), { now: NOW })).toBe(true);
	});

	it('tool calling is required: no tools is unsupported (OpenRouter supported_parameters, models.dev tool_call)', () => {
		const result = assessModel(model('a', { tools: false }), { now: NOW });
		expect(result.status).toBe('unsupported');
		expect(result.failed).toEqual(['no-tools']);
	});

	it('unknown tool support is hidden, never offered as if it worked', () => {
		const result = assessModel(model('new-model', { tools: null }), { now: NOW });
		expect(result.status).toBe('unknown');
		expect(result.failed).toEqual([]);
		expect(isSupported(model('new-model', { tools: null }), { now: NOW })).toBe(false);
		// A model the catalog knows nothing about at all.
		const bare = { id: 'mystery', tools: null, vision: null, price: null, released: null };
		expect(assessModel(bare, { now: NOW }).status).toBe('unknown');
		expect(listSupported([bare], { now: NOW })).toEqual({ free: [], paid: [] });
	});

	it('text output is required: image, music and embedding models are out', () => {
		expect(assessModel(model('a', { text: false }), { now: NOW }).failed).toEqual(['no-text']);
		// Not known is not a failure: tools being known means the catalog knows the model.
		expect(isSupported(model('a', { text: null }), { now: NOW })).toBe(true);
	});

	it('a context window under 32k is out, but only when it is known', () => {
		expect(assessModel(model('a', { context: 31_999 }), { now: NOW }).failed).toEqual([
			'small-context',
		]);
		expect(isSupported(model('a', { context: 32_000 }), { now: NOW })).toBe(true);
		expect(isSupported(model('a', { context: null }), { now: NOW })).toBe(true);
		expect(isSupported(model('a', { context: undefined }), { now: NOW })).toBe(true);
	});

	it('a deprecated model is out, and so is one past its end date', () => {
		expect(assessModel(model('a', { deprecated: true }), { now: NOW }).failed).toEqual([
			'deprecated',
		]);
		expect(isSupported(model('a', { expires: '2026-10-22' }), { now: NOW })).toBe(false);
		// The end date is the end of that UTC day; a model that still has time is listed.
		expect(isSupported(model('a', { expires: '2026-10-23' }), { now: NOW })).toBe(true);
		expect(isSupported(model('a', { expires: '2026-10-31' }), { now: NOW })).toBe(true);
	});

	it('a Zen model Noddy cannot route is out; OpenAI, Anthropic and OpenRouter always route', () => {
		expect(hasKnownFormat('opencode-zen', 'claude-sonnet-5-5')).toBe(true);
		expect(hasKnownFormat('opencode-zen', 'beam-free')).toBe(true);
		expect(hasKnownFormat('opencode-zen', 'gemini-3.5-flash')).toBe(false);
		expect(hasKnownFormat('opencode-zen', 'jev-1.13')).toBe(false);
		expect(hasKnownFormat('opencode-zen', 'some-new-family')).toBe(false);
		expect(hasKnownFormat('openrouter', 'anything/at-all:free')).toBe(true);
		expect(hasKnownFormat('openai', 'gpt-5')).toBe(true);
		expect(hasKnownFormat('anthropic', 'claude-sonnet-5-5')).toBe(true);
		const gemini = model('gemini-3.5-flash');
		expect(assessModel(gemini, { provider: 'opencode-zen', now: NOW }).failed).toEqual([
			'unknown-format',
		]);
		// Without a provider the format is not judged.
		expect(isSupported(gemini, { now: NOW })).toBe(true);
	});

	it('reports every failure, in the documented order', () => {
		const bad = model('a', { deprecated: true, tools: false, text: false, context: 8000 });
		expect(assessModel(bad, { now: NOW }).failed).toEqual([
			'deprecated',
			'no-tools',
			'no-text',
			'small-context',
		]);
	});

	it('Vision is recommended: reported, never required', () => {
		expect(assessModel(model('a', { vision: true }), { now: NOW }).recommended.vision).toBe(true);
		expect(assessModel(model('a', { vision: null }), { now: NOW }).recommended.vision).toBe(false);
		expect(isSupported(model('a', { vision: false }), { now: NOW })).toBe(true);
	});
});

describe('listing order (#82)', () => {
	const ids = (models) => models.map((item) => item.id);

	it('Free and supported first, then Paid and supported; everything else is not listed', () => {
		const result = listSupported(
			[
				model('paid-a'),
				model('free-a', { price: free }),
				model('no-tools', { tools: false, price: free }),
				model('unknown', { tools: null, price: free }),
				model('paid-b'),
				model('old', { deprecated: true, price: free }),
			],
			{ now: NOW }
		);
		expect(ids(result.free)).toEqual(['free-a']);
		expect(ids(result.paid)).toEqual(['paid-a', 'paid-b']);
	});

	it('inside a group: Vision first, then the larger context window, then the name', () => {
		const { free: list } = listSupported(
			[
				model('zeta-text-big', { price: free, context: 1_000_000 }),
				model('beta-vision-small', { price: free, vision: true, context: 64_000 }),
				model('alpha-text-big', { price: free, context: 1_000_000 }),
				model('gamma-vision-big', { price: free, vision: true, context: 262_144 }),
				model('delta-text-unknown', { price: free, context: null }),
				model('epsilon-text-small', { price: free, context: 32_000 }),
			],
			{ now: NOW }
		);
		expect(ids(list)).toEqual([
			'gamma-vision-big',
			'beta-vision-small',
			'alpha-text-big',
			'zeta-text-big',
			'epsilon-text-small',
			'delta-text-unknown',
		]);
	});

	it('Paid models are ordered by the same rule, names compared with numbers in order', () => {
		const { paid } = listSupported(
			[
				model('gpt-10'),
				model('gpt-9'),
				model('claude-vision', { vision: true, context: 200_000 }),
				model('claude-vision-1m', { vision: true, context: 1_000_000 }),
			],
			{ now: NOW }
		);
		expect(ids(paid)).toEqual(['claude-vision-1m', 'claude-vision', 'gpt-9', 'gpt-10']);
	});

	it('a model priced 0 on one side only is Paid; an unknown price is Paid too', () => {
		const result = listSupported(
			[
				model('half', { price: { input: 0, output: 2 } }),
				model('no-price', { price: null }),
				model('varies', { price: null, varies: true }),
			],
			{ now: NOW }
		);
		expect(result.free).toEqual([]);
		expect(ids(result.paid).sort()).toEqual(['half', 'no-price', 'varies']);
	});

	it('returns new arrays and never mutates what it is given', () => {
		const input = [model('b'), model('a')];
		const copy = structuredClone(input);
		listSupported(input, { now: NOW });
		expect(input).toEqual(copy);
	});

	it('counts the supported models, the number in “Showing 42 models …”', () => {
		const input = [model('a'), model('b', { tools: false }), model('c', { tools: null })];
		expect(countSupported(input, { now: NOW })).toBe(1);
		expect(countSupported([], { now: NOW })).toBe(0);
	});
});
