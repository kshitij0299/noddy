import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	badgesFor,
	daysUntilExpiry,
	expiryNote,
	isFree,
	isPaid,
	priceSpoken,
	priceText,
	readFreeRequests,
	readModelList,
	tierOf,
} from '../model-list.js';
import { createModelList } from '../ui/agent-model-list.js';

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

describe('model facts (#76, #82)', () => {
	it('Free means both costs are 0, Paid means a known price that is not both 0', () => {
		expect(isFree(model('a', { price: free }))).toBe(true);
		expect(isPaid(model('a', { price: free }))).toBe(false);
		expect(isFree(model('a', { price: { input: 0, output: 2 } }))).toBe(false);
		expect(isPaid(model('a', { price: { input: 0, output: 2 } }))).toBe(true);
		expect(isFree(model('a', { price: null }))).toBe(false);
		expect(isPaid(model('a', { price: null }))).toBe(false);
	});

	it('the tier is what the Connected row and the memory use: free, paid, or nothing', () => {
		expect(tierOf(model('a', { price: free }))).toBe('free');
		expect(tierOf(model('a'))).toBe('paid');
		expect(tierOf(model('a', { price: null }))).toBe(undefined);
		expect(tierOf(model('router', { price: null, varies: true }))).toBe(undefined);
	});

	it('badges are an icon plus a text label: Free or Paid, Tools, Vision', () => {
		const kinds = (m) => badgesFor(m).map((badge) => badge.kind);
		expect(kinds(model('a', { price: free, vision: true }))).toEqual(['free', 'tools', 'vision']);
		expect(kinds(model('a'))).toEqual(['paid', 'tools']);
		expect(kinds(model('a', { price: null, tools: null }))).toEqual([]);
		for (const badge of badgesFor(model('a', { vision: true, price: free }))) {
			expect(badge.label.length).toBeGreaterThan(0);
			expect(badge.icon.length).toBeGreaterThan(0);
		}
	});

	it('formats a Paid price as input / output and spells it out for screen readers', () => {
		expect(priceText(model('a'))).toBe('$3 / $15');
		expect(priceText(model('a', { price: { input: 0.25, output: 1.25 } }))).toBe('$0.25 / $1.25');
		expect(priceText(model('a', { price: { input: 0.0001, output: 0.0004 } }))).toBe(
			'$0.0001 / $0.0004'
		);
		expect(priceSpoken(model('a'))).toBe('Input $3, output $15 per million tokens');
		expect(priceText(model('a', { price: free }))).toBe('');
		expect(priceText(model('a', { price: null }))).toBe('');
		expect(priceSpoken(model('a', { price: null }))).toBe('');
	});

	it('counts the days until an end date and words the note for the next 30 days', () => {
		const ends = (expires) => model('a', { expires });
		expect(daysUntilExpiry(model('a'), NOW)).toBe(null);
		expect(daysUntilExpiry(ends('2026-10-31'), NOW)).toBe(8);
		expect(daysUntilExpiry(ends('2026-10-22'), NOW)).toBeLessThan(0);
		expect(daysUntilExpiry(ends('nonsense'), NOW)).toBe(null);
		expect(expiryNote(ends('2026-10-31'), NOW)).toBe('Ends 31 Oct');
		expect(expiryNote(ends('2026-11-22'), NOW)).toBe('Ends 22 Nov');
		expect(expiryNote(ends('2026-12-31'), NOW)).toBe('');
		expect(expiryNote(model('a'), NOW)).toBe('');
	});
});

describe('relay answer reader (#76, #82)', () => {
	it('keeps well-formed models, drops malformed ones and never trusts types', () => {
		const body = {
			provider: 'openrouter',
			models: [
				{
					id: 'good/one:free',
					tools: true,
					vision: true,
					price: { input: 0, output: 0 },
					released: '2026-10-21',
					context: 262_144,
					text: true,
					deprecated: false,
					expires: '2026-12-31',
					varies: false,
				},
				{ id: 'dup', tools: 'yes' },
				{ id: 'dup', tools: true },
				{ id: '~anthropic/claude-sonnet-latest', tools: true, varies: true, price: null },
				{ id: 'bad id with spaces', tools: true },
				{ id: '<img src=x onerror=1>', tools: true },
				{ id: 42 },
				null,
				'string',
				{ id: 'neg', tools: true, price: { input: -1, output: 5 }, context: -4, text: 'maybe' },
				{ id: 'weird-expiry', expires: 'tomorrow', context: 2.5, deprecated: 'true' },
			],
		};
		const list = readModelList(body);
		expect(list.map((item) => item.id)).toEqual([
			'good/one:free',
			'dup',
			'~anthropic/claude-sonnet-latest',
			'neg',
			'weird-expiry',
		]);
		expect(list[0]).toEqual({
			id: 'good/one:free',
			tools: true,
			vision: true,
			price: free,
			released: '2026-10-21',
			context: 262_144,
			text: true,
			deprecated: false,
			expires: '2026-12-31',
		});
		// The first "dup" wins; a string where a boolean belongs becomes unknown.
		expect(list[1].tools).toBe(null);
		expect(list[2].varies).toBe(true);
		// Unreadable values are "not known", never a guess.
		expect(list[3]).toMatchObject({ price: null, context: null, text: null });
		expect(list[4]).toMatchObject({ context: null, deprecated: false });
		expect(list[4]).not.toHaveProperty('expires');
	});

	it('returns an empty list for anything that is not a list, and caps it like the relay', () => {
		expect(readModelList(null)).toEqual([]);
		expect(readModelList({})).toEqual([]);
		expect(readModelList({ models: 'x' })).toEqual([]);
		const many = { models: Array.from({ length: 1200 }, (_, i) => ({ id: `m-${i}` })) };
		expect(readModelList(many)).toHaveLength(1000);
	});

	it('reads the free-request counters as numbers and nothing else', () => {
		expect(readFreeRequests({ freeRequests: { remaining: 38, limit: 50 } })).toEqual({
			remaining: 38,
			limit: 50,
		});
		expect(readFreeRequests({ freeRequests: { remaining: 60, limit: 50 } })).toBe(null);
		expect(readFreeRequests({ freeRequests: { remaining: '38', limit: 50 } })).toBe(null);
		expect(readFreeRequests({ freeRequests: { remaining: -1, limit: 50 } })).toBe(null);
		expect(readFreeRequests({})).toBe(null);
		expect(readFreeRequests(null)).toBe(null);
	});
});

describe('model list block (#76, #82)', () => {
	let handlers;
	let list;

	const SMALL = [
		model('gpt-5', { price: { input: 1.25, output: 10 }, vision: true, context: 400_000 }),
		model('gpt-5-mini', { price: { input: 0.25, output: 2 } }),
		model('free-one:free', { price: free, vision: true }),
		model('o3', { vision: true }),
		model('no-tools', { tools: false }),
		model('mystery', { tools: null, price: null }),
		model('tiny-context', { context: 8000 }),
		model('retired', { deprecated: true }),
		model('image-maker', { text: false }),
	];
	const MANY = Array.from({ length: 20 }, (_, i) =>
		model(`vendor/model-${String(i).padStart(2, '0')}`, { price: i < 5 ? free : undefined })
	);
	const render = (models = SMALL, extra = {}) =>
		list.render({ models, provider: 'openrouter', selected: '', now: NOW, ...extra });
	const options = () => [...list.root.querySelectorAll('[role="option"]')];
	const optionFor = (id) => options().find((option) => option.dataset.id === id) ?? null;
	const ids = () => options().map((option) => option.dataset.id ?? 'action');
	const listbox = () => list.root.querySelector('[role="listbox"]');
	const search = () => list.root.querySelector('input');
	const key = (target, name, init = {}) => {
		const event = new KeyboardEvent('keydown', {
			key: name,
			bubbles: true,
			cancelable: true,
			...init,
		});
		target.dispatchEvent(event);
		return event;
	};
	const typeInto = (value) => {
		search().value = value;
		search().dispatchEvent(new Event('input', { bubbles: true }));
	};

	beforeEach(() => {
		vi.useFakeTimers();
		handlers = {
			onSelect: vi.fn(),
			onConfirm: vi.fn(),
			onUseTyped: vi.fn(),
			onUseId: vi.fn(),
			onSearch: vi.fn(),
		};
		list = createModelList(handlers);
		document.body.append(list.root);
	});

	afterEach(() => {
		list.root.remove();
		vi.useRealTimers();
	});

	it('lists only models that work with Noddy’s tools: nothing greyed, nothing unknown', () => {
		render();
		expect(ids()).toEqual(['free-one:free', 'gpt-5', 'o3', 'gpt-5-mini']);
		for (const hidden of ['no-tools', 'mystery', 'tiny-context', 'retired', 'image-maker']) {
			expect(optionFor(hidden)).toBe(null);
		}
		expect(list.root.querySelector('[aria-disabled]')).toBe(null);
		expect(list.root.textContent).not.toContain("Can't use");
	});

	it('Free comes first with its own heading, then Paid; headings only when both have rows', () => {
		render();
		const headings = [...list.root.querySelectorAll('.agent-models__group-head')].map(
			(node) => node.textContent
		);
		expect(headings).toEqual(['Free · 1', 'Paid · 3']);
		const groups = [...list.root.querySelectorAll('[role="group"]')];
		expect(groups).toHaveLength(2);
		expect(document.getElementById(groups[0].getAttribute('aria-labelledby')).textContent).toBe(
			'Free · 1'
		);
		render([model('only-paid'), model('also-paid')]);
		expect(list.root.querySelector('.agent-models__group-head')).toBe(null);
		expect(list.root.querySelector('[role="group"]')).toBe(null);
		expect(ids()).toEqual(['also-paid', 'only-paid']);
	});

	it('inside a group the order is Vision first, then context window, then name', () => {
		render([
			model('c', { vision: false, context: 500_000 }),
			model('b', { vision: true, context: 100_000 }),
			model('a', { vision: true, context: 400_000 }),
		]);
		expect(ids()).toEqual(['a', 'b', 'c']);
	});

	it('shows one quiet line under the list with the count, and no toggle for the hidden models', () => {
		render();
		expect(list.root.querySelector('.agent-models__count').textContent).toContain(
			'Showing 4 models that work with Noddy’s tools.'
		);
		const buttons = [...list.root.querySelectorAll('button')].map((button) => button.textContent);
		expect(buttons).toEqual(['Use a model ID']);
		expect(list.root.textContent).not.toMatch(/show all|unsupported|hidden/i);
	});

	it('"Use a model ID" asks the card for the model ID field', () => {
		render();
		[...list.root.querySelectorAll('button')]
			.find((b) => b.textContent === 'Use a model ID')
			.click();
		expect(handlers.onUseId).toHaveBeenCalledTimes(1);
	});

	it('a row shows only what differs from its group: the ID, Vision, a Paid price, an end date', () => {
		render([
			model('with-all', { vision: true, expires: '2026-10-31', price: { input: 3, output: 15 } }),
			model('free-router:free', { price: free }),
		]);
		const paid = optionFor('with-all');
		expect(paid.querySelector('.agent-model__id').textContent).toBe('with-all');
		expect(paid.querySelector('.agent-model__price').textContent).toBe('$3 / $15');
		expect(paid.querySelector('.agent-badge--vision .agent-badge__label').textContent).toBe(
			'Vision'
		);
		expect(paid.querySelector('.agent-model__ends').textContent).toBe('Ends 31 Oct');
		const plain = optionFor('free-router:free');
		expect(plain.querySelector('.agent-model__price')).toBe(null);
		expect(plain.querySelector('.agent-model__meta')).toBe(null);
		expect(plain.querySelector('.agent-badge')).toBe(null);
	});

	it('each option’s accessible name carries Free or Paid, Tools and the price', () => {
		render();
		expect(optionFor('free-one:free').textContent).toContain('Free, uses tools');
		expect(optionFor('gpt-5').textContent).toContain('Paid, uses tools');
		expect(optionFor('gpt-5').textContent).toContain('Input $1.25, output $10 per million tokens');
	});

	it('a router with a varying price says so and never shows a figure', () => {
		render([
			model('openrouter/auto', { price: null, varies: true }),
			model('x:free', { price: free }),
		]);
		const router = optionFor('openrouter/auto');
		expect(router.querySelector('.agent-model__price').textContent).toBe('Price varies');
		expect(router.textContent).toContain('price varies');
		expect(router.textContent).not.toContain('Paid, ');
	});

	it('the price unit is stated once above the list, only while a paid row is shown', () => {
		render();
		const unit = list.root.querySelector('.agent-models__unit');
		expect(unit.hidden).toBe(false);
		expect(unit.textContent).toBe('Price in / out per 1M tokens');
		render([model('x:free', { price: free })]);
		expect(unit.hidden).toBe(true);
	});

	it('marks the model in use with aria-selected and a check, and only that one', () => {
		render(SMALL, { selected: 'o3' });
		expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toEqual([
			optionFor('o3'),
		]);
		expect(list.selectedId).toBe('o3');
		list.select('gpt-5');
		expect(optionFor('gpt-5').getAttribute('aria-selected')).toBe('true');
		expect(optionFor('o3').getAttribute('aria-selected')).toBe('false');
	});

	it('choosing only asks: a click calls onSelect and Enter on the selected row calls onConfirm', () => {
		render(SMALL, { selected: 'o3' });
		optionFor('gpt-5').click();
		expect(handlers.onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'gpt-5' }));
		expect(optionFor('gpt-5').getAttribute('aria-selected')).toBe('false');
		// The card did not accept it; drawing again puts the keyboard back on the model in use.
		render(SMALL, { selected: 'o3' });
		listbox().focus();
		key(listbox(), 'Enter');
		expect(handlers.onConfirm).toHaveBeenCalledWith(expect.objectContaining({ id: 'o3' }));
	});

	it('the Free group of OpenRouter states the limits, or the live counters', () => {
		render();
		expect(list.root.querySelector('.agent-models__group-caption').textContent).toBe(
			'Free models: 20 requests a minute, 50 a day.'
		);
		render(SMALL, { counters: { remaining: 38, limit: 50 } });
		expect(list.root.querySelector('.agent-models__group-caption').textContent).toBe(
			'38 of 50 free requests left today.'
		);
		render(SMALL, { provider: 'openai' });
		expect(list.root.querySelector('.agent-models__group-caption')).toBe(null);
	});

	it('the group captions are not options', () => {
		render();
		expect(options().every((option) => option.dataset.id)).toBe(true);
	});

	it('hides Zen models Noddy cannot route, without a grey row', () => {
		render([model('beam-free', { price: free }), model('gemini-3.5-flash'), model('jev-1.13')], {
			provider: 'opencode-zen',
		});
		expect(ids()).toEqual(['beam-free']);
	});

	describe('search', () => {
		it('appears only when more than 12 models are listed, counted after the requirements', () => {
			render(SMALL);
			expect(list.searchable).toBe(false);
			expect(search()).toBe(null);
			render(MANY);
			expect(list.searchable).toBe(true);
			expect(search()).not.toBe(null);
			// 13 listed models plus hidden ones: the hidden do not count.
			const thirteen = [
				...Array.from({ length: 13 }, (_, i) => model(`ok-${i}`)),
				...Array.from({ length: 10 }, (_, i) => model(`hidden-${i}`, { tools: false })),
			];
			render(thirteen);
			expect(list.searchable).toBe(true);
			render([...thirteen.slice(0, 12), ...thirteen.slice(13)]);
			expect(list.searchable).toBe(false);
		});

		it('is a combobox over the list with a label and a count of the models it searches', () => {
			render(MANY);
			expect(search().getAttribute('role')).toBe('combobox');
			expect(search().getAttribute('aria-controls')).toBe(listbox().id);
			expect(search().getAttribute('aria-label')).toBe('Search 20 models');
			expect(search().placeholder).toBe('Search 20 models');
			expect(listbox().tabIndex).toBe(-1);
		});

		it('filters live across both groups and updates the count line and a polite live region', () => {
			render(MANY);
			typeInto('model-1');
			expect(ids()).toEqual([
				'vendor/model-10',
				'vendor/model-11',
				'vendor/model-12',
				'vendor/model-13',
				'vendor/model-14',
				'vendor/model-15',
				'vendor/model-16',
				'vendor/model-17',
				'vendor/model-18',
				'vendor/model-19',
			]);
			expect(list.root.querySelector('.agent-models__count').textContent).toContain(
				'Showing 10 of 20 models that work with Noddy’s tools.'
			);
			expect(list.root.querySelector('[role="status"]').textContent).toBe('10 models match');
			expect(handlers.onSearch).toHaveBeenLastCalledWith('model-1');
			typeInto('model-00');
			expect(list.root.querySelector('[role="status"]').textContent).toBe('1 model matches');
			// Both groups are searched: model-00 is Free, model-19 is Paid.
			typeInto('model-0');
			expect(ids()).toContain('vendor/model-00');
			typeInto('model-19');
			expect(ids()).toEqual(['vendor/model-19']);
		});

		it('landing on the first match: the active row follows the search, focus stays in the field', () => {
			render(MANY, { selected: 'vendor/model-00' });
			search().focus();
			typeInto('model-17');
			expect(document.activeElement).toBe(search());
			expect(search().getAttribute('aria-activedescendant')).toBe(optionFor('vendor/model-17').id);
		});

		it('Down and Up move the active row, Enter chooses it', () => {
			render(MANY, { selected: 'vendor/model-00' });
			search().focus();
			key(search(), 'ArrowDown');
			key(search(), 'Enter');
			expect(handlers.onSelect).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'vendor/model-01' })
			);
		});

		it('Enter on the already selected row confirms, so accepting the start is two keys', () => {
			render(MANY, { selected: 'vendor/model-00' });
			search().focus();
			key(search(), 'Enter');
			expect(handlers.onConfirm).toHaveBeenCalledWith(
				expect.objectContaining({ id: 'vendor/model-00' })
			);
		});

		it('Esc clears the text first; with no text it passes on', () => {
			render(MANY);
			search().focus();
			typeInto('model-1');
			const cleared = key(search(), 'Escape');
			expect(cleared.defaultPrevented).toBe(true);
			expect(search().value).toBe('');
			expect(options()).toHaveLength(20);
			expect(handlers.onSearch).toHaveBeenLastCalledWith('');
			const passed = key(search(), 'Escape');
			expect(passed.defaultPrevented).toBe(false);
		});

		it('the clear button empties the search and keeps focus in the field', () => {
			render(MANY);
			typeInto('zz');
			const clear = list.root.querySelector('button[aria-label="Clear search"]');
			expect(clear.hidden).toBe(false);
			clear.click();
			expect(search().value).toBe('');
			expect(document.activeElement).toBe(search());
			expect(clear.hidden).toBe(true);
		});

		it('no match: says so, and offers the text as a model ID when it could be one', () => {
			render(MANY);
			typeInto('brand-new/model');
			expect(list.root.querySelector('.agent-models__none').textContent).toBe(
				'No model matches “brand-new/model”.'
			);
			const action = options();
			expect(action).toHaveLength(1);
			expect(action[0].textContent).toContain('Use “brand-new/model” as a model ID');
			expect(list.root.querySelector('[role="status"]').textContent).toBe('No models match');
			action[0].click();
			expect(handlers.onUseTyped).toHaveBeenCalledWith('brand-new/model');
			expect(handlers.onSelect).not.toHaveBeenCalled();
		});

		it('no match with text that cannot be a model ID offers no action', () => {
			render(MANY);
			typeInto('two words');
			expect(list.root.querySelector('.agent-models__none')).not.toBe(null);
			expect(options()).toHaveLength(0);
		});

		it('a model hidden by the requirements is reachable only as a model ID', () => {
			render([...MANY, model('hidden/unknown', { tools: null })]);
			typeInto('hidden/unknown');
			expect(optionFor('hidden/unknown')).toBe(null);
			expect(options()[0].textContent).toContain('Use “hidden/unknown” as a model ID');
		});
	});

	describe('busy and text-only', () => {
		it('while busy it ignores input and the search is read-only', () => {
			render(MANY);
			list.setBusy(true);
			expect(search().readOnly).toBe(true);
			expect(listbox().getAttribute('aria-busy')).toBe('true');
			optionFor('vendor/model-03').click();
			expect(handlers.onSelect).not.toHaveBeenCalled();
			list.setBusy(false);
			expect(search().readOnly).toBe(false);
		});

		it('renders every ID as text, never as markup', () => {
			const evil = model('<img src=x onerror=alert(1)>/model');
			render([evil]);
			// Not a valid ID for the relay, but a list must still never parse it.
			expect(list.root.querySelector('img')).toBe(null);
			expect(list.root.textContent).toContain('<img src=x onerror=alert(1)>/model');
		});

		it('clear forgets the rows and the search text', () => {
			render(MANY);
			typeInto('model');
			list.clear();
			expect(options()).toHaveLength(0);
			expect(list.searchText).toBe('');
		});
	});
});
