import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
	POPOVER_GAP,
	POPOVER_MARGIN,
	POPOVER_MAX_HEIGHT,
	POPOVER_MIN_HEIGHT,
	createDropdown,
	placePopover,
} from '../ui/agent-dropdown.js';
import { createModelList } from '../ui/agent-model-list.js';

const ITEMS = [
	{ id: 'openai', label: 'OpenAI' },
	{ id: 'opencode-zen', label: 'OpenCode Zen' },
	{ id: 'anthropic', label: 'Anthropic' },
];

describe('placePopover (#78)', () => {
	const bounds = { top: 0, left: 0, right: 400, bottom: 800 };
	const anchor = { top: 100, bottom: 136, left: 20, right: 340 };

	it('opens below the button at its width when the content fits', () => {
		expect(placePopover({ anchor, contentHeight: 120, bounds })).toEqual({
			left: 20,
			top: 136 + POPOVER_GAP,
			width: 320,
			height: 120,
			placement: 'below',
		});
	});

	it('flips above when the content does not fit below and there is more room above', () => {
		const low = { top: 700, bottom: 736, left: 20, right: 340 };
		const spot = placePopover({ anchor: low, contentHeight: 200, bounds });
		expect(spot.placement).toBe('above');
		expect(spot.height).toBe(200);
		// It ends a gap above the button.
		expect(spot.top + spot.height).toBe(700 - POPOVER_GAP);
	});

	it('stays below when it does not fit anywhere and below has at least as much room', () => {
		const short = { top: 0, left: 0, right: 400, bottom: 300 };
		const spot = placePopover({ anchor, contentHeight: 400, bounds: short });
		expect(spot.placement).toBe('below');
		// Capped to the room below, minus the gap and the margin from the edge.
		expect(spot.height).toBe(300 - 136 - POPOVER_GAP - POPOVER_MARGIN);
		expect(spot.top + spot.height).toBeLessThanOrEqual(300 - POPOVER_MARGIN);
	});

	it('caps the height so the rest scrolls inside the list', () => {
		expect(placePopover({ anchor, contentHeight: 5000, bounds }).height).toBe(POPOVER_MAX_HEIGHT);
	});

	it('never squeezes below two rows, even in a tiny window', () => {
		const tiny = { top: 90, left: 0, right: 400, bottom: 150 };
		expect(placePopover({ anchor, contentHeight: 500, bounds: tiny }).height).toBe(
			POPOVER_MIN_HEIGHT
		);
		// Content smaller than the minimum stays its own size.
		expect(placePopover({ anchor, contentHeight: 40, bounds: tiny }).height).toBe(40);
	});

	it('slides sideways, without resizing, to stay inside the bounds', () => {
		const right = placePopover({
			anchor: { top: 100, bottom: 136, left: 380, right: 700 },
			contentHeight: 100,
			bounds,
		});
		expect(right.width).toBe(320);
		expect(right.left).toBe(400 - POPOVER_MARGIN - 320);
		const left = placePopover({
			anchor: { top: 100, bottom: 136, left: -50, right: 270 },
			contentHeight: 100,
			bounds,
		});
		expect(left.left).toBe(POPOVER_MARGIN);
		// A button wider than the bounds gives the popover the width that fits.
		const wide = placePopover({
			anchor: { top: 100, bottom: 136, left: 0, right: 500 },
			contentHeight: 100,
			bounds,
		});
		expect(wide.width).toBe(400 - 2 * POPOVER_MARGIN);
		expect(wide.left).toBe(POPOVER_MARGIN);
	});
});

describe('createDropdown (#78)', () => {
	let onChange;
	let dd;
	const key = (target, k, init = {}) => {
		const event = new KeyboardEvent('keydown', {
			key: k,
			bubbles: true,
			cancelable: true,
			...init,
		});
		target.dispatchEvent(event);
		return event;
	};
	const press = (k, init) => key(dd.list, k, init);
	const options = () => [...dd.list.querySelectorAll('[role="option"]')];
	const optionFor = (id) => dd.list.querySelector(`[role="option"][data-id="${id}"]`);
	const activeId = () => dd.list.querySelector('.is-active')?.dataset.id;
	const outside = () => document.getElementById('outside');

	beforeEach(() => {
		vi.useFakeTimers();
		onChange = vi.fn();
		dd = createDropdown({ label: 'Provider', items: ITEMS, value: 'openai', onChange });
		document.body.innerHTML = '<input id="outside" aria-label="Elsewhere">';
		document.body.append(dd.root);
	});

	afterEach(() => {
		dd.close({ restoreFocus: false });
		document.body.innerHTML = '';
		vi.useRealTimers();
	});

	it('is a labelled button that shows its value and names a collapsed listbox', () => {
		const { button } = dd;
		expect(button.type).toBe('button');
		expect(button.getAttribute('aria-haspopup')).toBe('listbox');
		expect(button.getAttribute('aria-expanded')).toBe('false');
		expect(button.getAttribute('aria-controls')).toBe(dd.list.id);
		expect(button.labels[0]).toBe(dd.label);
		expect(dd.label.textContent).toBe('Provider');
		expect(button.getAttribute('aria-labelledby')).toBe(`${dd.label.id} ${button.id}`);
		expect(button.querySelector('.agent-dropdown__value').textContent).toBe('OpenAI');
		// The chevron is an outlined Material Symbol and decoration only.
		const chevron = button.querySelector('.material-symbols-rounded');
		expect(chevron.textContent).toBe('expand_more');
		expect(chevron.getAttribute('aria-hidden')).toBe('true');
		// Closed, the list is not in the page at all.
		expect(dd.list.isConnected).toBe(false);
		expect(dd.root.querySelector('[role="listbox"]')).toBeNull();
		expect(dd.isOpen).toBe(false);
	});

	it('opens on click: aria-expanded, focus in the listbox, the selected option active', () => {
		dd.button.click();
		expect(dd.isOpen).toBe(true);
		expect(dd.button.getAttribute('aria-expanded')).toBe('true');
		expect(dd.list.isConnected).toBe(true);
		expect(dd.list.hidden).toBe(false);
		expect(dd.list.getAttribute('role')).toBe('listbox');
		expect(dd.list.getAttribute('aria-labelledby')).toBe(dd.label.id);
		expect(options().map((option) => option.getAttribute('role'))).toEqual([
			'option',
			'option',
			'option',
		]);
		expect(document.activeElement).toBe(dd.list);
		expect(activeId()).toBe('openai');
		expect(dd.list.getAttribute('aria-activedescendant')).toBe(optionFor('openai').id);
		expect(optionFor('openai').getAttribute('aria-selected')).toBe('true');
		expect(optionFor('anthropic').getAttribute('aria-selected')).toBe('false');
		// Clicking the button again closes it.
		dd.button.click();
		expect(dd.isOpen).toBe(false);
		expect(dd.button.getAttribute('aria-expanded')).toBe('false');
		expect(dd.list.isConnected).toBe(false);
	});

	it('opens with Arrow Down or Arrow Up on the button and keeps the key from the panel', () => {
		const outer = vi.fn();
		document.body.addEventListener('keydown', outer);
		dd.button.focus();
		const down = key(dd.button, 'ArrowDown');
		expect(dd.isOpen).toBe(true);
		expect(down.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(dd.list);
		dd.close();
		key(dd.button, 'ArrowUp');
		expect(dd.isOpen).toBe(true);
		expect(outer).not.toHaveBeenCalled();
		document.body.removeEventListener('keydown', outer);
	});

	it('moves with the arrows, Home, End and type-ahead, and selects with Enter or Space', () => {
		dd.button.click();
		press('ArrowDown');
		expect(activeId()).toBe('opencode-zen');
		press('ArrowDown');
		expect(activeId()).toBe('anthropic');
		press('ArrowDown');
		expect(activeId()).toBe('anthropic');
		press('Home');
		expect(activeId()).toBe('openai');
		press('End');
		expect(activeId()).toBe('anthropic');
		press('ArrowUp');
		expect(activeId()).toBe('opencode-zen');
		expect(dd.list.getAttribute('aria-activedescendant')).toBe(optionFor('opencode-zen').id);
		// Type-ahead by the label's first letters.
		press('a');
		expect(activeId()).toBe('anthropic');
		vi.advanceTimersByTime(800);
		press('o');
		press('p');
		press('e');
		press('n');
		press('a');
		expect(activeId()).toBe('openai');
		// Enter chooses the active option, closes, and puts focus back on the button.
		vi.advanceTimersByTime(800);
		press('End');
		const enter = press('Enter');
		expect(enter.defaultPrevented).toBe(true);
		expect(onChange).toHaveBeenCalledTimes(1);
		expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'anthropic' }));
		expect(dd.value).toBe('anthropic');
		expect(dd.button.querySelector('.agent-dropdown__value').textContent).toBe('Anthropic');
		expect(dd.isOpen).toBe(false);
		expect(document.activeElement).toBe(dd.button);
		// Space chooses too; the list reopens on the chosen option.
		dd.button.click();
		expect(activeId()).toBe('anthropic');
		press('Home');
		press(' ');
		expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'openai' }));
		expect(dd.value).toBe('openai');
	});

	it('a click on an option chooses it and closes', () => {
		dd.button.click();
		optionFor('opencode-zen').click();
		expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ id: 'opencode-zen' }));
		expect(dd.value).toBe('opencode-zen');
		expect(dd.isOpen).toBe(false);
		expect(document.activeElement).toBe(dd.button);
	});

	it('choosing what is already chosen closes without a change', () => {
		dd.button.click();
		optionFor('openai').click();
		expect(onChange).not.toHaveBeenCalled();
		expect(dd.isOpen).toBe(false);
		expect(document.activeElement).toBe(dd.button);
	});

	it('Esc closes, returns focus to the button, changes nothing and does not reach the panel', () => {
		const outer = vi.fn();
		document.body.addEventListener('keydown', outer);
		dd.button.click();
		press('ArrowDown');
		const esc = press('Escape');
		expect(esc.defaultPrevented).toBe(true);
		expect(dd.isOpen).toBe(false);
		expect(dd.value).toBe('openai');
		expect(onChange).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(dd.button);
		expect(outer).not.toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
		// With the list closed Esc is not ours: the panel still gets it.
		key(dd.button, 'Escape');
		expect(outer).toHaveBeenCalledWith(expect.objectContaining({ key: 'Escape' }));
		document.body.removeEventListener('keydown', outer);
	});

	it('Tab closes onto the button, so focus moves on from there', () => {
		dd.button.click();
		const tab = press('Tab');
		expect(tab.defaultPrevented).toBe(false);
		expect(dd.isOpen).toBe(false);
		expect(document.activeElement).toBe(dd.button);
	});

	it('a press outside closes it and leaves focus alone; a press inside does not', () => {
		dd.button.click();
		dd.button.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		optionFor('anthropic').dispatchEvent(new Event('pointerdown', { bubbles: true }));
		dd.label.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(dd.isOpen).toBe(true);
		const away = outside();
		away.dispatchEvent(new Event('pointerdown', { bubbles: true }));
		expect(dd.isOpen).toBe(false);
		expect(onChange).not.toHaveBeenCalled();
		// It did not pull focus back onto the button.
		expect(document.activeElement).not.toBe(dd.button);
		// The listeners are gone once closed.
		dd.button.click();
		expect(dd.isOpen).toBe(true);
	});

	it('closes when focus moves to another control, but not within itself', () => {
		dd.button.click();
		dd.button.focus();
		expect(dd.isOpen).toBe(true);
		outside().focus();
		expect(dd.isOpen).toBe(false);
		expect(document.activeElement).toBe(outside());
	});

	it('closes when the window resizes or something else scrolls, not when the list scrolls', () => {
		dd.button.click();
		dd.list.dispatchEvent(new Event('scroll'));
		expect(dd.isOpen).toBe(true);
		document.body.dispatchEvent(new Event('scroll'));
		expect(dd.isOpen).toBe(false);
		// Focus is not lost to the page when it closes that way.
		expect(document.activeElement).toBe(dd.button);
		dd.button.click();
		window.dispatchEvent(new Event('resize'));
		expect(dd.isOpen).toBe(false);
		expect(document.activeElement).toBe(dd.button);
	});

	it('a disabled dropdown cannot open, and one that is open closes', () => {
		dd.button.click();
		dd.setDisabled(true);
		expect(dd.isOpen).toBe(false);
		expect(dd.button.disabled).toBe(true);
		dd.open();
		expect(dd.isOpen).toBe(false);
		dd.setDisabled(false);
		expect(dd.button.disabled).toBe(false);
		dd.open();
		expect(dd.isOpen).toBe(true);
	});

	it('setItems swaps the options, keeps the choice if it is still there, else takes the first', () => {
		dd.setItems([
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' },
		]);
		expect(dd.value).toBe('a');
		expect(dd.button.querySelector('.agent-dropdown__value').textContent).toBe('A');
		dd.setItems(
			[
				{ id: 'b', label: 'B' },
				{ id: 'a', label: 'A' },
			],
			'b'
		);
		expect(dd.value).toBe('b');
		dd.setItems([
			{ id: 'a', label: 'A' },
			{ id: 'b', label: 'B' },
		]);
		expect(dd.value).toBe('b');
		// setValue shows an item as chosen without announcing a change.
		dd.setValue('a');
		expect(dd.value).toBe('a');
		dd.setValue('missing');
		expect(dd.value).toBe('a');
		expect(onChange).not.toHaveBeenCalled();
	});

	it('an item with its own mark keeps it, like the model list’s Custom… row', () => {
		dd.setItems([...ITEMS, { id: 'custom', label: 'Custom…', icon: 'edit' }], 'openai');
		dd.open();
		const row = optionFor('custom');
		expect(row.classList.contains('agent-model--custom')).toBe(true);
		expect(row.querySelector('.agent-model__mark').textContent).toBe('edit');
		expect(optionFor('openai').querySelector('.agent-model__mark').textContent).toBe('check');
	});

	it('renders every string as text, never as markup', () => {
		dd.setItems([{ id: 'x', label: '<img src=x onerror=alert(1)>' }], 'x');
		dd.open();
		expect(dd.list.querySelector('img')).toBeNull();
		expect(options()[0].textContent).toContain('<img src=x onerror=alert(1)>');
		expect(dd.button.querySelector('img')).toBeNull();
	});

	it('two dropdowns never share an ID', () => {
		const other = createDropdown({ label: 'Model', items: ITEMS, value: 'openai' });
		document.body.append(other.root);
		const ids = [
			dd.label.id,
			dd.button.id,
			dd.list.id,
			other.label.id,
			other.button.id,
			other.list.id,
		];
		expect(new Set(ids).size).toBe(6);
		dd.open();
		other.open();
		const optionIds = [...document.querySelectorAll('[role="option"]')].map((option) => option.id);
		expect(new Set(optionIds).size).toBe(optionIds.length);
		other.close({ restoreFocus: false });
	});

	it('uses the model list’s listbox and row look, so the card has one component', () => {
		const modelList = createModelList({});
		modelList.render(
			[{ id: 'gpt-5', tools: true, vision: false, price: null, released: null }],
			'gpt-5'
		);
		dd.open();
		const shared = ['agent-models__list'];
		for (const list of [modelList.list, dd.list]) {
			shared.forEach((name) => expect(list.classList.contains(name)).toBe(true));
			expect(list.getAttribute('role')).toBe('listbox');
			expect(list.tabIndex).toBe(0);
			const row = list.querySelector('[role="option"]');
			expect(row.classList.contains('agent-model')).toBe(true);
			expect(row.querySelector('.agent-model__mark').textContent).toBe('check');
			expect(row.querySelector('.agent-model__id')).not.toBeNull();
		}
		// Only the dropdown's list floats.
		expect(dd.list.classList.contains('agent-dropdown__list')).toBe(true);
		expect(modelList.list.classList.contains('agent-dropdown__list')).toBe(false);
	});

	describe('popover', () => {
		const rect = (top, left, width, height) => ({
			top,
			left,
			width,
			height,
			right: left + width,
			bottom: top + height,
		});
		const content = (height) =>
			Object.defineProperty(dd.list, 'scrollHeight', { configurable: true, value: height });
		let innerHeight;

		beforeEach(() => {
			innerHeight = window.innerHeight;
			window.innerHeight = 800;
			window.innerWidth = 1024;
		});

		afterEach(() => {
			window.innerHeight = innerHeight;
			delete HTMLElement.prototype.showPopover;
			delete HTMLElement.prototype.hidePopover;
		});

		it('sits under the button at its width, next to it in the field', () => {
			dd.button.getBoundingClientRect = () => rect(100, 60, 280, 36);
			content(120);
			dd.open();
			expect(dd.list.dataset.placement).toBe('below');
			expect(dd.list.style.left).toBe('60px');
			expect(dd.list.style.top).toBe(`${136 + POPOVER_GAP}px`);
			expect(dd.list.style.width).toBe('280px');
			expect(dd.list.style.maxHeight).toBe('120px');
			// It is the list that floats, a sibling of the button inside the field, not a spacer.
			expect(dd.button.nextElementSibling).toBe(dd.list);
		});

		it('flips above the button when there is no room below', () => {
			dd.button.getBoundingClientRect = () => rect(740, 60, 280, 36);
			content(200);
			dd.open();
			expect(dd.list.dataset.placement).toBe('above');
			expect(dd.list.style.top).toBe(`${740 - POPOVER_GAP - 200}px`);
			expect(dd.list.style.maxHeight).toBe('200px');
		});

		it('keeps inside the agent panel, not just the window, and scrolls inside when short of room', () => {
			const panel = document.createElement('div');
			panel.className = 'agent-panel';
			panel.getBoundingClientRect = () => rect(0, 600, 400, 300);
			document.body.append(panel);
			panel.append(dd.root);
			dd.button.getBoundingClientRect = () => rect(100, 580, 280, 36);
			content(500);
			dd.open();
			// Panel is x 600-1000, y 0-300: slid in from 580, and limited to the room below it.
			expect(dd.list.style.left).toBe(`${600 + POPOVER_MARGIN}px`);
			expect(dd.list.dataset.placement).toBe('below');
			expect(parseFloat(dd.list.style.maxHeight)).toBe(300 - 136 - POPOVER_GAP - POPOVER_MARGIN);
		});

		it('is shown in the top layer where the browser has the Popover API', () => {
			const show = vi.fn();
			const hide = vi.fn();
			HTMLElement.prototype.showPopover = show;
			HTMLElement.prototype.hidePopover = hide;
			expect(dd.list.getAttribute('popover')).toBe('manual');
			dd.open();
			expect(show).toHaveBeenCalledTimes(1);
			expect(show.mock.contexts[0]).toBe(dd.list);
			expect(hide).not.toHaveBeenCalled();
			dd.close();
			expect(hide).toHaveBeenCalledTimes(1);
			expect(dd.list.isConnected).toBe(false);
			// A browser that refuses (already showing, say) cannot break it.
			show.mockImplementation(() => {
				throw new Error('InvalidStateError');
			});
			dd.open();
			expect(dd.isOpen).toBe(true);
		});

		it('works without the Popover API (fixed fallback)', () => {
			expect(typeof HTMLElement.prototype.showPopover).not.toBe('function');
			dd.open();
			expect(dd.isOpen).toBe(true);
			expect(dd.list.hidden).toBe(false);
			dd.close();
			expect(dd.list.hidden).toBe(true);
		});
	});
});
