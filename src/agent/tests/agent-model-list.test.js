import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	NO_FORMAT_REASON,
	NO_TOOLS_REASON,
	annotateModels,
	badgesFor,
	hasKnownFormat,
	isFree,
	isPaid,
	isSelectable,
	priceSpoken,
	priceText,
	readModelList,
	reasonFor,
	sortModels,
} from '../model-list.js';
import { createModelList } from '../ui/agent-model-list.js';

const model = (id, overrides = {}) => ({
	id,
	tools: true,
	vision: false,
	price: { input: 3, output: 15 },
	released: '2025-01-01',
	...overrides,
});

describe('model badges (#76)', () => {
	it('Free means both costs are 0, Paid means a known price that is not both 0', () => {
		expect(isFree(model('a', { price: { input: 0, output: 0 } }))).toBe(true);
		expect(isPaid(model('a', { price: { input: 0, output: 0 } }))).toBe(false);
		expect(isFree(model('a', { price: { input: 0, output: 2 } }))).toBe(false);
		expect(isPaid(model('a', { price: { input: 0, output: 2 } }))).toBe(true);
		// No price known: neither badge.
		expect(isFree(model('a', { price: null }))).toBe(false);
		expect(isPaid(model('a', { price: null }))).toBe(false);
	});

	it('shows Free / Paid, Tools and Vision, each with an icon and a text label', () => {
		const kinds = (m) => badgesFor(m).map((badge) => badge.kind);
		expect(kinds(model('a', { price: { input: 0, output: 0 }, vision: true }))).toEqual([
			'free',
			'tools',
			'vision',
		]);
		expect(kinds(model('a'))).toEqual(['paid', 'tools']);
		for (const badge of badgesFor(model('a', { vision: true, price: { input: 0, output: 0 } }))) {
			expect(badge.label.length).toBeGreaterThan(0);
			expect(badge.icon.length).toBeGreaterThan(0);
		}
	});

	it('an unknown model has no price badge and Tools "?" but is still allowed', () => {
		const unknown = { id: 'new-model', tools: null, vision: null, price: null, released: null };
		expect(isSelectable(unknown)).toBe(true);
		const badges = badgesFor(unknown);
		expect(badges.map((badge) => badge.kind)).toEqual(['tools-unknown']);
		expect(badges[0].label).toBe('Tools ?');
		expect(badges[0].spoken).toBe('Tool support unknown');
		expect(priceText(unknown)).toBe('');
	});

	it('a model that cannot use tools is not selectable, gives its reason and has no Tools badge', () => {
		const blocked = model('gpt-3.5-turbo', { tools: false });
		expect(isSelectable(blocked)).toBe(false);
		// It still says what it is (Paid / Free, Vision), just not "Tools": the reason covers that.
		expect(badgesFor(blocked).map((badge) => badge.kind)).toEqual(['paid']);
		expect(
			badgesFor(
				model('free-blocked', { tools: false, price: { input: 0, output: 0 }, vision: true })
			).map((badge) => badge.kind)
		).toEqual(['free', 'vision']);
		expect(badgesFor(model('unpriced', { tools: false, price: null, vision: null }))).toEqual([]);
		expect(reasonFor(blocked)).toBe(NO_TOOLS_REASON);
		expect(NO_TOOLS_REASON).toBe("Can't use tools — the agent needs them");
		expect(reasonFor(model('ok'))).toBe('');
	});

	it('formats a Paid price as input / output and spells it out for screen readers', () => {
		expect(priceText(model('a'))).toBe('$3 / $15');
		expect(priceText(model('a', { price: { input: 1.25, output: 10 } }))).toBe('$1.25 / $10');
		expect(priceText(model('a', { price: { input: 0.025, output: 0.2 } }))).toBe('$0.025 / $0.2');
		expect(priceText(model('a', { price: { input: 0, output: 0 } }))).toBe('');
		expect(priceSpoken(model('a'))).toBe('Input $3, output $15 per million tokens');
	});
});

describe('model order (#76)', () => {
	const sample = [
		model('old-tools', { released: '2023-01-01' }),
		model('no-tools', { tools: false, released: '2026-01-01' }),
		model('unknown-b', { tools: null, price: null, released: null }),
		model('newest', { released: '2026-06' }),
		model('undated'),
		model('rec-2', { released: '2020-01-01' }),
		model('rec-1', { released: '2019-01-01' }),
		model('unknown-a', { tools: null, price: null, released: '2025-05-05' }),
		model('mid', { released: '2025-03-01' }),
	];
	// undated gets no date to test it sorts after dated ones
	sample[4].released = null;

	it('lists recommended first, then tool-capable newest first, then unknown, then blocked', () => {
		const ordered = sortModels(sample, ['rec-1', 'rec-2']).map((m) => m.id);
		expect(ordered).toEqual([
			'rec-1',
			'rec-2',
			'newest',
			'mid',
			'old-tools',
			'undated',
			'unknown-a',
			'unknown-b',
			'no-tools',
		]);
	});

	it('does not reorder its input, and a blocked recommended model is not first', () => {
		const copy = [...sample];
		sortModels(sample, ['no-tools']);
		expect(sample).toEqual(copy);
		expect(sortModels(sample, ['no-tools']).at(-1).id).toBe('no-tools');
	});

	it('orders equal dates by ID, numbers naturally', () => {
		const ordered = sortModels([
			model('m-10', { released: 'x' }),
			model('m-2', { released: 'x' }),
			model('m-1', { released: 'x' }),
		]).map((m) => m.id);
		expect(ordered).toEqual(['m-1', 'm-2', 'm-10']);
	});
});

describe('relay answer reader (#76)', () => {
	it('keeps well-formed models, drops malformed ones and never trusts types', () => {
		const models = readModelList({
			models: [
				{
					id: 'a',
					tools: true,
					vision: false,
					price: { input: 1, output: 2 },
					released: '2025-01-01',
				},
				{ id: 'a' },
				{ id: '' },
				{ id: 7 },
				null,
				'x',
				{ id: 'b', tools: 'yes', vision: 1, price: { input: 'x', output: 1 }, released: 5 },
				{ id: 'c', price: { input: -1, output: 1 } },
				{ id: 'd'.repeat(161) },
				{ id: 'has space' },
				{ id: '<img src=x>' },
			],
		});
		expect(models).toEqual([
			{
				id: 'a',
				tools: true,
				vision: false,
				price: { input: 1, output: 2 },
				released: '2025-01-01',
			},
			{ id: 'b', tools: null, vision: null, price: null, released: null },
			{ id: 'c', tools: null, vision: null, price: null, released: null },
		]);
		for (const bad of [null, undefined, 'x', [], {}, { models: 'x' }, { models: {} }]) {
			expect(readModelList(bad)).toEqual([]);
		}
		expect(
			readModelList({ models: Array.from({ length: 900 }, (_, i) => ({ id: `m${i}` })) })
		).toHaveLength(500);
	});
});

describe('API-format check (#76)', () => {
	it('OpenAI and Anthropic always route; a Zen model of an unknown family does not', () => {
		expect(hasKnownFormat('openai', 'anything-at-all')).toBe(true);
		expect(hasKnownFormat('anthropic', 'claude-sonnet-5-5')).toBe(true);
		expect(hasKnownFormat('opencode-zen', 'big-pickle')).toBe(true);
		expect(hasKnownFormat('opencode-zen', 'gpt-6-astra')).toBe(true);
		expect(hasKnownFormat('opencode-zen', 'beam-free')).toBe(false);
		expect(hasKnownFormat('opencode-zen', 'jev-1.13-free')).toBe(false);
		expect(hasKnownFormat('opencode-zen', 'gemini-3-pro')).toBe(false);
	});

	it('annotates unroutable models as unsupported, greyed with their own reason', () => {
		const [ok, unsupported] = annotateModels('opencode-zen', [
			model('big-pickle'),
			model('beam-free'),
		]);
		expect(ok.unsupported).toBeUndefined();
		expect(unsupported.unsupported).toBe(true);
		expect(isSelectable(unsupported)).toBe(false);
		expect(reasonFor(unsupported)).toBe(NO_FORMAT_REASON);
		// A model Noddy cannot route to keeps the facts the catalog gives, and no "Tools ?".
		expect(badgesFor(unsupported).map((badge) => badge.kind)).toEqual(['paid', 'tools']);
		expect(
			badgesFor({ ...unsupported, tools: null, price: null }).map((badge) => badge.kind)
		).toEqual([]);
		// A model with no tool calling reports that reason first.
		expect(reasonFor({ ...unsupported, tools: false })).toBe(NO_TOOLS_REASON);
	});
});

describe('model listbox (#76)', () => {
	let onSelect;
	let onCustom;
	let list;
	const MODELS = [
		model('gpt-5', { price: { input: 1.25, output: 10 }, vision: true }),
		model('gpt-5-mini', { price: { input: 0.25, output: 2 } }),
		model('free-one', { price: { input: 0, output: 0 } }),
		model('o3', { vision: true }),
		model('o4-mini'),
		model('brand-new', { tools: null, vision: null, price: null, released: null }),
		model('gpt-3.5-turbo', { tools: false }),
		model('beam-free', { unsupported: true }),
	];
	const options = () => [...list.root.querySelectorAll('[role="option"]')];
	const optionFor = (id) => list.root.querySelector(`[role="option"][data-id="${id}"]`);
	const listbox = () => list.root.querySelector('[role="listbox"]');
	const press = (key, init = {}) => {
		const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
		listbox().dispatchEvent(event);
		return event;
	};
	const activeId = () => listbox().querySelector('.is-active')?.dataset.id ?? 'custom';

	beforeEach(() => {
		vi.useFakeTimers();
		onSelect = vi.fn();
		onCustom = vi.fn();
		list = createModelList({ onSelect, onCustom });
		list.render(MODELS, 'gpt-5');
		document.body.append(list.root);
	});

	afterEach(() => {
		list.root.remove();
		vi.useRealTimers();
	});

	it('is a labelled listbox of options, ending with Custom…', () => {
		const box = listbox();
		expect(box.getAttribute('aria-labelledby')).toBeTruthy();
		expect(document.getElementById(box.getAttribute('aria-labelledby')).textContent).toBe('Model');
		expect(box.tabIndex).toBe(0);
		expect(options()).toHaveLength(MODELS.length + 1);
		expect(options().every((option) => option.id)).toBe(true);
		expect(new Set(options().map((option) => option.id)).size).toBe(options().length);
		expect(options().at(-1).textContent).toContain('Custom…');
		expect(options().at(-1).dataset.custom).toBe('true');
		// The unit of the prices is stated once, above the list.
		expect(list.root.textContent).toContain('Price in / out per 1M tokens');
	});

	it('marks the model in use with aria-selected, a check icon, and only that one', () => {
		const selected = options().filter((option) => option.getAttribute('aria-selected') === 'true');
		expect(selected.map((option) => option.dataset.id)).toEqual(['gpt-5']);
		expect(selected[0].querySelector('.agent-model__mark').textContent).toBe('check');
		list.render(MODELS, 'o3');
		expect(
			options()
				.filter((option) => option.getAttribute('aria-selected') === 'true')
				.map((option) => option.dataset.id)
		).toEqual(['o3']);
	});

	it('badges are an icon plus text, and a model never relies on colour alone', () => {
		const gpt5 = optionFor('gpt-5');
		const badges = [...gpt5.querySelectorAll('.agent-badge')];
		expect(badges.map((badge) => badge.dataset.badge)).toEqual(['paid', 'tools', 'vision']);
		for (const badge of badges) {
			expect(badge.querySelector('.material-symbols-rounded').getAttribute('aria-hidden')).toBe(
				'true'
			);
			expect(badge.querySelector('.agent-badge__label').textContent.length).toBeGreaterThan(0);
		}
		expect(badges.map((badge) => badge.querySelector('.agent-badge__label').textContent)).toEqual([
			'Paid',
			'Tools',
			'Vision',
		]);
		// The price sits on the ID line and is also spelled out for screen readers.
		expect(gpt5.querySelector('.agent-model__price').textContent).toBe('$1.25 / $10');
		expect(gpt5.textContent).toContain('Input $1.25, output $10 per million tokens');
		expect(
			[...optionFor('free-one').querySelectorAll('.agent-badge')].map(
				(badge) => badge.dataset.badge
			)
		).toEqual(['free', 'tools']);
		expect(optionFor('free-one').querySelector('.agent-model__price')).toBeNull();
	});

	it('an unknown model shows Tools "?" and no price badge, and is selectable', () => {
		const unknown = optionFor('brand-new');
		expect(unknown.getAttribute('aria-disabled')).toBeNull();
		expect([...unknown.querySelectorAll('.agent-badge')].map((b) => b.dataset.badge)).toEqual([
			'tools-unknown',
		]);
		expect(unknown.querySelector('.agent-model__price')).toBeNull();
		expect(unknown.textContent).toContain('Tools ?');
		expect(unknown.textContent).toContain('Tool support unknown');
		unknown.click();
		expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'brand-new' }));
	});

	it('greys out models that cannot be used, with a one-line reason, and never selects them', () => {
		const noTools = optionFor('gpt-3.5-turbo');
		expect(noTools.getAttribute('aria-disabled')).toBe('true');
		expect(noTools.classList.contains('is-disabled')).toBe(true);
		expect(noTools.textContent).toContain("Can't use tools — the agent needs them");
		// The reason comes first on its line; no Tools badge, and no price on the ID line.
		expect(noTools.querySelector('.agent-model__meta').firstElementChild.className).toBe(
			'agent-model__reason'
		);
		expect(noTools.querySelector('[data-badge="tools"]')).toBeNull();
		expect(noTools.querySelector('[data-badge="tools-unknown"]')).toBeNull();
		expect(noTools.querySelector('.agent-model__price')).toBeNull();
		const noFormat = optionFor('beam-free');
		expect(noFormat.getAttribute('aria-disabled')).toBe('true');
		expect(noFormat.textContent).toContain(NO_FORMAT_REASON);
		for (const option of [noTools, noFormat]) {
			option.click();
			expect(onSelect).not.toHaveBeenCalled();
		}
		// Neither by keyboard: they can be reached (so the reason can be read), not chosen.
		press('End');
		press('ArrowUp');
		expect(activeId()).toBe('beam-free');
		press('Enter');
		press(' ');
		expect(onSelect).not.toHaveBeenCalled();
		expect(onCustom).not.toHaveBeenCalled();
		// Usable rows do not carry aria-disabled.
		expect(optionFor('o3').getAttribute('aria-disabled')).toBeNull();
	});

	it('a greyed row still shows what the model is: Free or Paid, and Vision', () => {
		list.render(
			[
				model('gpt-5'),
				model('free-no-tools', { tools: false, price: { input: 0, output: 0 }, vision: true }),
				model('paid-no-tools', { tools: false }),
				model('beam-free', { unsupported: true, price: { input: 0, output: 0 } }),
			],
			'gpt-5'
		);
		const kinds = (id) =>
			[...optionFor(id).querySelectorAll('.agent-badge')].map((badge) => badge.dataset.badge);
		expect(kinds('free-no-tools')).toEqual(['free', 'vision']);
		expect(kinds('paid-no-tools')).toEqual(['paid']);
		// A model Noddy cannot route to says Free and Tools (the catalog knows both).
		expect(kinds('beam-free')).toEqual(['free', 'tools']);
		for (const id of ['free-no-tools', 'paid-no-tools', 'beam-free']) {
			expect(optionFor(id).getAttribute('aria-disabled')).toBe('true');
			// Badge text is part of the row's accessible name, after the reason.
			expect(optionFor(id).textContent).toMatch(/Free|Paid/);
		}
		optionFor('free-no-tools').click();
		expect(onSelect).not.toHaveBeenCalled();
	});

	it('focus puts the active row on the selected model and announces it', () => {
		listbox().focus();
		expect(document.activeElement).toBe(listbox());
		expect(listbox().getAttribute('aria-activedescendant')).toBe(optionFor('gpt-5').id);
		expect(activeId()).toBe('gpt-5');
	});

	describe('focus and scrolling', () => {
		const mouse = (type, target = listbox()) =>
			target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true }));
		let scrollIntoView;

		beforeEach(() => {
			// jsdom has no layout: a spy stands in for "the list scrolled".
			scrollIntoView = vi.fn();
			HTMLElement.prototype.scrollIntoView = scrollIntoView;
		});

		afterEach(() => {
			delete HTMLElement.prototype.scrollIntoView;
		});

		it('keyboard focus scrolls the active row into view', () => {
			listbox().focus();
			expect(scrollIntoView).toHaveBeenCalledTimes(1);
			expect(scrollIntoView.mock.contexts[0]).toBe(optionFor('gpt-5'));
			scrollIntoView.mockClear();
			listbox().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			expect(scrollIntoView).toHaveBeenCalledTimes(1);
		});

		it('the focus a mouse press causes does not scroll, so the row under the pointer stays put', () => {
			// Wheel-scrolled away from the selected row, list not focused, then a press on a row.
			mouse('mousedown', optionFor('o3'));
			listbox().focus();
			expect(scrollIntoView).not.toHaveBeenCalled();
			// The list is focused and announces its active row, without moving.
			expect(document.activeElement).toBe(listbox());
			expect(listbox().getAttribute('aria-activedescendant')).toBe(optionFor('gpt-5').id);
			// The click that follows still lands on the row and chooses it.
			optionFor('o3').click();
			expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'o3' }));
		});

		it('only that one focus is a press: the next keyboard focus scrolls again', () => {
			mouse('mousedown', optionFor('o3'));
			listbox().focus();
			optionFor('o3').click();
			listbox().blur();
			scrollIntoView.mockClear();
			listbox().focus();
			expect(scrollIntoView).toHaveBeenCalledTimes(1);
		});

		it('a press that never focuses the list does not leave the next Tab-in unscrolled', () => {
			mouse('mousedown', optionFor('o3'));
			mouse('click', optionFor('o3'));
			scrollIntoView.mockClear();
			listbox().focus();
			expect(scrollIntoView).toHaveBeenCalledTimes(1);
		});

		it('a press on an already focused list changes nothing for later focus', () => {
			listbox().focus();
			mouse('mousedown', optionFor('o3'));
			listbox().blur();
			scrollIntoView.mockClear();
			listbox().focus();
			expect(scrollIntoView).toHaveBeenCalledTimes(1);
		});

		it('drawing the rows again keeps the scroll position and the focused list keeps announcing', () => {
			let top = 0;
			Object.defineProperty(listbox(), 'scrollTop', {
				configurable: true,
				get: () => top,
				// A real list clamps to its content, which is gone for a moment in a redraw.
				set: (value) => (top = value),
			});
			// Replacing every row empties the box for a moment, which resets a real scroll offset.
			const replace = listbox().replaceChildren.bind(listbox());
			listbox().replaceChildren = (...nodes) => {
				top = 0;
				replace(...nodes);
			};
			top = 120;
			listbox().focus();
			scrollIntoView.mockClear();
			list.render(MODELS, 'o3');
			expect(top).toBe(120);
			expect(scrollIntoView).not.toHaveBeenCalled();
			expect(listbox().getAttribute('aria-activedescendant')).toBe(optionFor('o3').id);
			// Not focused: nothing is announced until the list gets focus.
			listbox().blur();
			list.render(MODELS, 'o3');
			expect(listbox().hasAttribute('aria-activedescendant')).toBe(false);
		});

		it('clear forgets the rows and the active descendant', () => {
			listbox().focus();
			list.clear();
			expect(options()).toHaveLength(0);
			expect(listbox().hasAttribute('aria-activedescendant')).toBe(false);
			expect(list.selectedId).toBe('');
			expect(list.activeId).toBe('');
			// Keys and focus on an empty list are harmless.
			listbox().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
			listbox().blur();
			listbox().focus();
		});
	});

	it('arrow keys, Home, End and Page keys move the active row and stay in range', () => {
		listbox().focus();
		expect(press('ArrowDown').defaultPrevented).toBe(true);
		expect(activeId()).toBe('gpt-5-mini');
		press('ArrowDown');
		expect(activeId()).toBe('free-one');
		press('ArrowUp');
		expect(activeId()).toBe('gpt-5-mini');
		press('End');
		expect(activeId()).toBe('custom');
		press('ArrowDown');
		expect(activeId()).toBe('custom');
		press('Home');
		expect(activeId()).toBe('gpt-5');
		press('ArrowUp');
		expect(activeId()).toBe('gpt-5');
		press('PageDown');
		expect(activeId()).toBe('custom');
		press('PageUp');
		expect(activeId()).toBe('gpt-5');
		expect(listbox().getAttribute('aria-activedescendant')).toBe(optionFor('gpt-5').id);
	});

	it('Enter and Space choose the active usable model; Enter on Custom… asks for a custom ID', () => {
		listbox().focus();
		// The model already in use is not "chosen" again.
		press('Enter');
		expect(onSelect).not.toHaveBeenCalled();
		press('ArrowDown');
		press('Enter');
		expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'gpt-5-mini' }));
		press('ArrowDown');
		press(' ');
		expect(onSelect).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'free-one' }));
		press('End');
		press('Enter');
		expect(onCustom).toHaveBeenCalledTimes(1);
		expect(onSelect).toHaveBeenCalledTimes(2);
	});

	it('a click chooses a usable model; selection is only shown once the owner confirms it', () => {
		optionFor('o3').click();
		expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'o3' }));
		expect(optionFor('o3').getAttribute('aria-selected')).toBe('false');
		expect(optionFor('gpt-5').getAttribute('aria-selected')).toBe('true');
		optionFor('gpt-5').click();
		expect(onSelect).toHaveBeenCalledTimes(1);
		options().at(-1).click();
		expect(onCustom).toHaveBeenCalledTimes(1);
	});

	it('typing jumps to the next ID that starts with the typed text', () => {
		listbox().focus();
		press('o');
		expect(activeId()).toBe('o3');
		press('o');
		expect(activeId()).toBe('o4-mini');
		press('o');
		expect(activeId()).toBe('o3');
		vi.advanceTimersByTime(800);
		press('f');
		press('r');
		expect(activeId()).toBe('free-one');
		vi.advanceTimersByTime(800);
		press('c');
		expect(activeId()).toBe('custom');
		// Typed text that matches nothing leaves the row where it is.
		vi.advanceTimersByTime(800);
		press('z');
		expect(activeId()).toBe('custom');
		// Ctrl/Meta shortcuts and Tab are not type-ahead and are not swallowed.
		expect(press('a', { ctrlKey: true }).defaultPrevented).toBe(false);
		expect(press('Tab').defaultPrevented).toBe(false);
	});

	it('Esc returns to the selected model and is consumed only when there is something to cancel', () => {
		const outer = vi.fn();
		document.body.addEventListener('keydown', outer);
		listbox().focus();
		press('ArrowDown');
		press('ArrowDown');
		expect(activeId()).toBe('free-one');
		const first = press('Escape');
		expect(activeId()).toBe('gpt-5');
		expect(first.defaultPrevented).toBe(true);
		expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
		// Already at rest: Esc is left for the panel.
		const second = press('Escape');
		expect(second.defaultPrevented).toBe(false);
		expect(outer).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
		document.body.removeEventListener('keydown', outer);
	});

	it('while busy the list ignores keys and clicks and says so', () => {
		list.setBusy(true);
		expect(listbox().getAttribute('aria-busy')).toBe('true');
		listbox().focus();
		press('ArrowDown');
		press('Enter');
		optionFor('o3').click();
		expect(onSelect).not.toHaveBeenCalled();
		expect(activeId()).toBe('gpt-5');
		list.setBusy(false);
		expect(listbox().hasAttribute('aria-busy')).toBe(false);
		optionFor('o3').click();
		expect(onSelect).toHaveBeenCalledTimes(1);
	});

	it('renders every string as text, never as markup', () => {
		const hostile = model('<img src=x onerror=alert(1)>');
		list.render([hostile], hostile.id);
		expect(listbox().querySelector('img')).toBeNull();
		expect(options()[0].textContent).toContain('<img src=x onerror=alert(1)>');
	});

	it('uses the order it is given (the card sorts) and puts Custom… last', () => {
		list.render([model('z-first'), model('a-second')], '');
		expect(options().map((option) => option.dataset.id ?? 'custom')).toEqual([
			'z-first',
			'a-second',
			'custom',
		]);
		// Nothing selected: the active row starts at the top.
		listbox().focus();
		expect(activeId()).toBe('z-first');
	});
});
