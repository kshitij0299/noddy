import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createListbox } from '../ui/agent-listbox.js';

const row = (id, text = id) => {
	const node = document.createElement('div');
	node.textContent = text;
	return { id, node, text: text.toLowerCase(), data: { id } };
};

const ENTRIES = () => ['alpha', 'bravo', 'charlie', 'delta', 'echo'].map((id) => row(id));

describe('shared listbox (#76, #82)', () => {
	let box;
	let handlers;

	const options = () => [...box.list.querySelectorAll('[role="option"]')];
	const optionFor = (id) => box.list.querySelector(`[data-id="${id}"]`);
	const press = (key, init = {}, target = box.list) => {
		const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
		target.dispatchEvent(event);
		return event;
	};
	const activeId = () => box.list.querySelector('.is-active')?.dataset.id ?? '';

	beforeEach(() => {
		vi.useFakeTimers();
		handlers = {
			onSelect: vi.fn(),
			onAction: vi.fn(),
			onConfirm: vi.fn(),
		};
		box = createListbox({ className: 'test-list', ...handlers });
		box.render(ENTRIES(), 'bravo');
		document.body.append(box.list);
	});

	afterEach(() => {
		box.list.remove();
		vi.useRealTimers();
	});

	it('is a focusable listbox of options with unique IDs; the selected one is aria-selected', () => {
		expect(box.list.getAttribute('role')).toBe('listbox');
		expect(box.list.tabIndex).toBe(0);
		expect(options()).toHaveLength(5);
		expect(new Set(options().map((option) => option.id)).size).toBe(5);
		expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toEqual([
			optionFor('bravo'),
		]);
		expect(box.selectedId).toBe('bravo');
	});

	it('two listboxes never share an ID', () => {
		const other = createListbox();
		other.render(ENTRIES(), '');
		expect(other.list.id).not.toBe(box.list.id);
		expect(other.list.querySelector('[role="option"]').id).not.toBe(options()[0].id);
	});

	it('focus puts the active row on the selected row and announces it', () => {
		box.list.focus();
		expect(box.list.getAttribute('aria-activedescendant')).toBe(optionFor('bravo').id);
		expect(activeId()).toBe('bravo');
	});

	it('arrows, Home, End and the Page keys move the active row and stay in range', () => {
		box.list.focus();
		press('ArrowDown');
		expect(activeId()).toBe('charlie');
		press('ArrowUp');
		press('ArrowUp');
		press('ArrowUp');
		expect(activeId()).toBe('alpha');
		press('End');
		expect(activeId()).toBe('echo');
		press('ArrowDown');
		expect(activeId()).toBe('echo');
		press('Home');
		expect(activeId()).toBe('alpha');
		press('PageDown');
		expect(activeId()).toBe('echo');
		press('PageUp');
		expect(activeId()).toBe('alpha');
		expect(box.list.getAttribute('aria-activedescendant')).toBe(optionFor('alpha').id);
	});

	it('choosing only asks: Enter or Space on another row calls onSelect, and nothing is marked until the owner draws again', () => {
		box.list.focus();
		press('ArrowDown');
		press('Enter');
		expect(handlers.onSelect).toHaveBeenCalledTimes(1);
		expect(handlers.onSelect.mock.calls[0][0].data).toEqual({ id: 'charlie' });
		expect(optionFor('charlie').getAttribute('aria-selected')).toBe('false');
		press('ArrowDown');
		press(' ');
		expect(handlers.onSelect).toHaveBeenCalledTimes(2);
		box.render(ENTRIES(), 'delta');
		expect(optionFor('delta').getAttribute('aria-selected')).toBe('true');
		expect(optionFor('bravo').getAttribute('aria-selected')).toBe('false');
	});

	it('Enter on the row that is already selected confirms; Space on it does nothing', () => {
		box.list.focus();
		press('Enter');
		expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
		expect(handlers.onConfirm.mock.calls[0][0].data).toEqual({ id: 'bravo' });
		expect(handlers.onSelect).not.toHaveBeenCalled();
		press(' ');
		expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
	});

	it('a click chooses a row, or confirms the selected one', () => {
		optionFor('delta').click();
		expect(handlers.onSelect).toHaveBeenCalledTimes(1);
		optionFor('bravo').click();
		expect(handlers.onSelect).toHaveBeenCalledTimes(1);
		// A click is not Enter: it never confirms.
		expect(handlers.onConfirm).not.toHaveBeenCalled();
	});

	it('an action row asks for something else and is never selected', () => {
		const entries = [
			...ENTRIES(),
			{ ...row('x', 'Use “x” as a model ID'), id: null, action: true },
		];
		box.render(entries, 'bravo');
		box.list.focus();
		press('End');
		press('Enter');
		expect(handlers.onAction).toHaveBeenCalledTimes(1);
		expect(handlers.onSelect).not.toHaveBeenCalled();
		expect(options().filter((o) => o.getAttribute('aria-selected') === 'true')).toHaveLength(1);
	});

	it('a disabled row is shown and never chosen', () => {
		const entries = ENTRIES();
		entries[2].disabled = true;
		box.render(entries, 'bravo');
		optionFor('charlie').click();
		expect(handlers.onSelect).not.toHaveBeenCalled();
		// The keyboard can rest on it, and Enter still does not choose it.
		box.list.focus();
		press('Enter');
		expect(handlers.onSelect).not.toHaveBeenCalled();
		box.activateFirst();
		expect(activeId()).toBe('alpha');
	});

	it('typing jumps to the next ID that starts with what was typed, and the same letter cycles', () => {
		const entries = ['apple', 'avocado', 'banana', 'blueberry', 'cherry'].map((id) => row(id));
		box.render(entries, 'apple');
		box.list.focus();
		press('b');
		expect(activeId()).toBe('banana');
		press('l');
		expect(activeId()).toBe('blueberry');
		vi.advanceTimersByTime(800);
		press('a');
		expect(activeId()).toBe('apple');
		vi.advanceTimersByTime(800);
		press('a');
		expect(activeId()).toBe('avocado');
		press('Tab');
	});

	it('Esc returns to the selected row and is consumed only when there was something to cancel', () => {
		box.list.focus();
		const idle = press('Escape');
		expect(idle.defaultPrevented).toBe(false);
		press('ArrowDown');
		press('ArrowDown');
		const reached = vi.fn();
		document.body.addEventListener('keydown', reached);
		const cancel = press('Escape');
		expect(cancel.defaultPrevented).toBe(true);
		expect(reached).not.toHaveBeenCalled();
		expect(activeId()).toBe('bravo');
		document.body.removeEventListener('keydown', reached);
	});

	it('while busy the list ignores keys and clicks and says so', () => {
		box.list.focus();
		box.setBusy(true);
		expect(box.list.getAttribute('aria-busy')).toBe('true');
		press('ArrowDown');
		press('Enter');
		optionFor('delta').click();
		expect(activeId()).toBe('bravo');
		expect(handlers.onSelect).not.toHaveBeenCalled();
		expect(handlers.onConfirm).not.toHaveBeenCalled();
		box.setBusy(false);
		expect(box.list.hasAttribute('aria-busy')).toBe(false);
		optionFor('delta').click();
		expect(handlers.onSelect).toHaveBeenCalledTimes(1);
	});

	it('ignores keys with ctrl, meta or alt so shortcuts still work', () => {
		box.list.focus();
		press('ArrowDown', { ctrlKey: true });
		press('End', { metaKey: true });
		press('a', { altKey: true });
		expect(activeId()).toBe('bravo');
	});

	it('renders every string as text, never as markup', () => {
		const node = document.createElement('div');
		node.textContent = '<img src=x onerror=alert(1)>';
		box.render([{ id: 'evil', node, text: 'evil', data: {} }], '');
		expect(box.list.querySelector('img')).toBe(null);
		expect(box.list.textContent).toContain('<img src=x');
	});

	describe('groups', () => {
		const grouped = () => {
			const freeHead = document.createElement('div');
			freeHead.textContent = 'Free · 2';
			const paidHead = document.createElement('div');
			paidHead.textContent = 'Paid · 1';
			const free = { id: 'free', head: freeHead, className: 'g' };
			const paid = { id: 'paid', head: paidHead, className: 'g' };
			return [
				{ ...row('a'), group: free },
				{ ...row('b'), group: free },
				{ ...row('c'), group: paid },
			];
		};

		it('consecutive rows of one group sit in a labelled role="group"; headings are not options', () => {
			box.render(grouped(), 'a');
			const groups = [...box.list.querySelectorAll('[role="group"]')];
			expect(groups).toHaveLength(2);
			expect(document.getElementById(groups[0].getAttribute('aria-labelledby')).textContent).toBe(
				'Free · 2'
			);
			expect(groups[0].querySelectorAll('[role="option"]')).toHaveLength(2);
			expect(groups[1].querySelectorAll('[role="option"]')).toHaveLength(1);
			expect(options()).toHaveLength(3);
		});

		it('arrow keys cross the group boundary as if the list were flat', () => {
			box.render(grouped(), 'a');
			box.list.focus();
			press('ArrowDown');
			press('ArrowDown');
			expect(activeId()).toBe('c');
		});
	});

	describe('focus and scrolling', () => {
		const mouse = (type, target = box.list) =>
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
			box.list.focus();
			expect(scrollIntoView).toHaveBeenCalledTimes(1);
			expect(scrollIntoView.mock.contexts[0]).toBe(optionFor('bravo'));
			scrollIntoView.mockClear();
			press('ArrowDown');
			expect(scrollIntoView).toHaveBeenCalledTimes(1);
		});

		it('the focus a mouse press causes does not scroll, so the row under the pointer stays put', () => {
			mouse('mousedown', optionFor('delta'));
			box.list.focus();
			expect(scrollIntoView).not.toHaveBeenCalled();
			expect(document.activeElement).toBe(box.list);
			expect(box.list.getAttribute('aria-activedescendant')).toBe(optionFor('bravo').id);
			optionFor('delta').click();
			expect(handlers.onSelect).toHaveBeenCalledTimes(1);
		});

		it('only that one focus is a press: the next keyboard focus scrolls again', () => {
			mouse('mousedown', optionFor('delta'));
			box.list.focus();
			optionFor('delta').click();
			box.list.blur();
			scrollIntoView.mockClear();
			box.list.focus();
			expect(scrollIntoView).toHaveBeenCalledTimes(1);
		});

		it('drawing the rows again keeps the scroll position, and the focused list keeps announcing', () => {
			let top = 0;
			Object.defineProperty(box.list, 'scrollTop', {
				configurable: true,
				get: () => top,
				set: (value) => (top = value),
			});
			const replace = box.list.replaceChildren.bind(box.list);
			box.list.replaceChildren = (...nodes) => {
				top = 0;
				replace(...nodes);
			};
			top = 120;
			box.list.focus();
			scrollIntoView.mockClear();
			box.render(ENTRIES(), 'delta');
			expect(top).toBe(120);
			expect(scrollIntoView).not.toHaveBeenCalled();
			expect(box.list.getAttribute('aria-activedescendant')).toBe(optionFor('delta').id);
			box.list.blur();
			box.render(ENTRIES(), 'delta');
			expect(box.list.hasAttribute('aria-activedescendant')).toBe(false);
		});

		it('clear forgets the rows and the active descendant', () => {
			box.list.focus();
			box.clear();
			expect(options()).toHaveLength(0);
			expect(box.list.hasAttribute('aria-activedescendant')).toBe(false);
			expect(box.selectedId).toBe('');
			expect(box.activeId).toBe('');
			press('ArrowDown');
			box.list.blur();
			box.list.focus();
		});
	});

	describe('combobox mode: a search field drives the list (WAI-ARIA APG editable combobox with list autocomplete)', () => {
		let input;
		let combo;

		beforeEach(() => {
			input = document.createElement('input');
			document.body.append(input);
			combo = createListbox({ input, ...handlers });
			combo.render(ENTRIES(), 'bravo');
			document.body.append(combo.list);
		});

		afterEach(() => {
			input.remove();
			combo.list.remove();
		});

		const type = (key, init = {}) => {
			const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
			input.dispatchEvent(event);
			return event;
		};

		it('the field is the combobox and names the list and the active row; the list is not a tab stop', () => {
			expect(input.getAttribute('role')).toBe('combobox');
			expect(input.getAttribute('aria-controls')).toBe(combo.list.id);
			expect(input.getAttribute('aria-autocomplete')).toBe('list');
			expect(input.getAttribute('aria-expanded')).toBe('true');
			expect(combo.list.tabIndex).toBe(-1);
			expect(input.getAttribute('aria-activedescendant')).toBe(
				combo.list.querySelector('[data-id="bravo"]').id
			);
		});

		it('Up and Down move the active row while focus stays in the field', () => {
			input.focus();
			type('ArrowDown');
			expect(input.getAttribute('aria-activedescendant')).toBe(
				combo.list.querySelector('[data-id="charlie"]').id
			);
			expect(document.activeElement).toBe(input);
			type('PageDown');
			expect(combo.activeId).toBe('echo');
			type('ArrowUp');
			expect(combo.activeId).toBe('delta');
		});

		it('Home, End and typing stay in the field (they move the caret and edit the text)', () => {
			input.focus();
			const home = type('Home');
			const end = type('End');
			const letter = type('d');
			const space = type(' ');
			expect(home.defaultPrevented).toBe(false);
			expect(end.defaultPrevented).toBe(false);
			expect(letter.defaultPrevented).toBe(false);
			expect(space.defaultPrevented).toBe(false);
			expect(combo.activeId).toBe('bravo');
		});

		it('Enter chooses the active row, and on the selected one it confirms', () => {
			input.focus();
			type('ArrowDown');
			type('Enter');
			expect(handlers.onSelect).toHaveBeenCalledTimes(1);
			combo.render(ENTRIES(), 'charlie');
			type('Enter');
			expect(handlers.onConfirm).toHaveBeenCalledTimes(1);
		});

		it('a press on a row never takes focus from the field', () => {
			const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
			combo.list.querySelector('[data-id="delta"]').dispatchEvent(event);
			expect(event.defaultPrevented).toBe(true);
		});

		it('Esc goes to the owner first: handled means it stops here, otherwise it passes on', () => {
			const onEscape = vi.fn(() => true);
			const handled = createListbox({ input, onEscape });
			handled.render(ENTRIES(), 'bravo');
			const reached = vi.fn();
			document.body.addEventListener('keydown', reached);
			const event = type('Escape');
			expect(onEscape).toHaveBeenCalledTimes(1);
			expect(event.defaultPrevented).toBe(true);
			expect(reached).not.toHaveBeenCalled();
			onEscape.mockReturnValue(false);
			const passed = type('Escape');
			expect(passed.defaultPrevented).toBe(false);
			expect(reached).toHaveBeenCalledTimes(1);
			document.body.removeEventListener('keydown', reached);
		});

		it('activateFirst and activateById put the active row on a fresh search result', () => {
			combo.activateFirst({ scroll: false });
			expect(combo.activeId).toBe('alpha');
			combo.activateById('delta', { scroll: false });
			expect(combo.activeId).toBe('delta');
			expect(input.getAttribute('aria-activedescendant')).toBe(
				combo.list.querySelector('[data-id="delta"]').id
			);
		});
	});
});
