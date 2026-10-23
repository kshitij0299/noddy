/**
 * Shared ARIA listbox for the connect card (M4, #76, #82).
 *
 * The engine behind the live model list (agent-model-list.js). It has two modes:
 *
 * - List: focus stays on the list and `aria-activedescendant` names the active row.
 *   Up/Down/Home/End/PageUp/PageDown move; Enter or Space selects; typing jumps to the
 *   next row whose text starts with what was typed.
 * - Combobox (`input`): focus stays in a search field that filters the list
 *   (https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/).
 *   Up/Down/PageUp/PageDown move the active row; Home/End and typing stay in the field;
 *   the list is not a tab stop.
 *
 * In both, Enter on the row that is already selected *confirms* (`onConfirm`), so a user who
 * accepts the pre-selected model can press Enter twice. Esc is handed to `onEscape` when
 * given; otherwise the list puts the active row back on the selected row and only consumes
 * Esc when there was something to cancel. Choosing only *asks* (`onSelect`): the owner of the
 * list draws it again with the new selection, so a failed check never leaves a wrong row marked.
 *
 * Rows can be grouped (`entry.group`): consecutive rows with the same group ID sit in one
 * `role="group"` with a heading, which the caller builds. Headings and captions are not options.
 *
 * A press on a row also gives the list focus, and that focus must not scroll: the
 * list would jump to the selected row between mouse-down and mouse-up, the row
 * under the pointer would move away and the click would be lost. Only keyboard
 * focus scrolls the active row into view.
 *
 * The caller builds each row's content; this module owns role, id, aria-selected
 * and behaviour. Nothing here parses HTML.
 */
import { el } from './cards/card-shell.js';

let listboxCount = 0;
const TYPE_AHEAD_MS = 700;
const PAGE = 8;

/**
 * @typedef {Object} ListboxGroup
 * @property {String} id  rows with the same ID, one after another, share a group
 * @property {HTMLElement} head  the visible heading; it names the group
 * @property {HTMLElement} [caption]  a note under the heading (not an option)
 * @property {String} [className]  class of the group wrapper
 *
 * @typedef {Object} ListboxEntry
 * @property {String|null} id  what `render`'s selected ID is matched against; `null` for an action row
 * @property {HTMLElement} node  the row; the listbox adds its role, id and aria-selected
 * @property {String} text  lower-case text that type-ahead matches
 * @property {Boolean} [disabled]  shown, never chosen
 * @property {Boolean} [action]  asks for something else (like "Use “x” as a model ID") and is never selected
 * @property {ListboxGroup} [group]
 * @property {unknown} [data]  the caller's own value, handed back with the entry
 */

/**
 * @param {Object} options
 * @param {String} [options.className]  class of the list element
 * @param {String} [options.labelledBy]  ID of the visible label
 * @param {(entry: ListboxEntry) => void} [options.onSelect]  a usable row was chosen
 * @param {(entry: ListboxEntry) => void} [options.onAction]  an action row was chosen
 * @param {(entry: ListboxEntry) => void} [options.onConfirm]  Enter on the row that is already selected
 * @param {(event: KeyboardEvent) => Boolean} [options.onEscape]  return true when Esc was handled
 * @param {HTMLInputElement} [options.input]  combobox mode: the search field that drives the list
 */
export function createListbox({
	className = '',
	labelledBy = '',
	onSelect = () => {},
	onAction = () => {},
	onConfirm = () => {},
	onEscape,
	input,
} = {}) {
	const uid = `agent-listbox-${++listboxCount}`;
	const list = el('div', className);
	list.id = uid;
	list.setAttribute('role', 'listbox');
	if (labelledBy) list.setAttribute('aria-labelledby', labelledBy);
	// The element that has focus and names the active row.
	const owner = input ?? list;
	if (input) {
		list.tabIndex = -1;
		input.setAttribute('role', 'combobox');
		input.setAttribute('aria-autocomplete', 'list');
		input.setAttribute('aria-expanded', 'true');
		input.setAttribute('aria-controls', uid);
		input.autocomplete = 'off';
	} else {
		list.tabIndex = 0;
	}

	/** @type {Array<{node: HTMLElement, entry: ListboxEntry}>} */
	let rows = [];
	let active = -1;
	let selectedId = '';
	let busy = false;
	let typed = '';
	let typedTimer = 0;
	/** A mouse press that is about to focus the list (see the focus handler). */
	let pressFocus = false;

	function selectedIndex() {
		return rows.findIndex((row) => row.entry.id !== null && row.entry.id === selectedId);
	}

	function markActive(index) {
		active = Math.max(0, Math.min(rows.length - 1, index));
		rows.forEach((row, i) => row.node.classList.toggle('is-active', i === active));
	}

	function setActive(index, { scroll = true } = {}) {
		if (!rows.length) return;
		markActive(index);
		owner.setAttribute('aria-activedescendant', rows[active].node.id);
		if (scroll) rows[active].node.scrollIntoView?.({ block: 'nearest' });
	}

	/** @param {Boolean} [confirm]  Enter: the row already selected is accepted */
	function activate(index, confirm = false) {
		const row = rows[index];
		if (!row || busy) return;
		setActive(index);
		if (row.entry.action) return onAction(row.entry);
		// A row that cannot be chosen is shown, never chosen.
		if (row.entry.disabled) return;
		if (row.entry.id === selectedId) {
			if (confirm) onConfirm(row.entry);
			return;
		}
		onSelect(row.entry);
	}

	function typeAhead(char) {
		clearTimeout(typedTimer);
		typed += char.toLowerCase();
		typedTimer = setTimeout(() => (typed = ''), TYPE_AHEAD_MS);
		// One letter typed again and again cycles through its matches.
		const needle = [...typed].every((c) => c === typed[0]) ? typed[0] : typed;
		const start = needle.length === 1 ? active + 1 : Math.max(active, 0);
		for (let i = 0; i < rows.length; i++) {
			const index = (start + i) % rows.length;
			if (rows[index].entry.text.startsWith(needle)) return setActive(index);
		}
	}

	owner.addEventListener('keydown', (event) => {
		if (busy || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
		switch (event.key) {
			case 'ArrowDown':
				setActive(active + 1);
				break;
			case 'ArrowUp':
				setActive(active - 1);
				break;
			case 'PageDown':
				setActive(active + PAGE);
				break;
			case 'PageUp':
				setActive(active - PAGE);
				break;
			case 'Home':
				// In the search field Home and End move the caret.
				if (input) return;
				setActive(0);
				break;
			case 'End':
				if (input) return;
				setActive(rows.length - 1);
				break;
			case 'Enter':
				activate(active, true);
				break;
			case ' ':
				if (input) return;
				activate(active);
				break;
			case 'Escape': {
				if (onEscape) {
					if (!onEscape(event)) return;
					event.stopPropagation();
					break;
				}
				// Only consume Esc when there is something to cancel; otherwise the panel gets it.
				const target = selectedIndex();
				if (!typed && (target < 0 || target === active)) return;
				typed = '';
				setActive(target < 0 ? 0 : target);
				event.stopPropagation();
				break;
			}
			default:
				if (input || event.key.length !== 1) return;
				typeAhead(event.key);
		}
		event.preventDefault();
	});

	list.addEventListener('click', (event) => {
		const node = /** @type {HTMLElement} */ (event.target).closest?.('[role="option"]');
		const index = rows.findIndex((row) => row.node === node);
		if (index >= 0) activate(index);
	});

	// Mouse-down comes right before the focus it causes. Remember that this focus is a
	// press, so the handler below leaves the scroll position alone for the click.
	list.addEventListener('mousedown', (event) => {
		// A combobox keeps focus in its search field: a click on a row must not take it.
		if (input) return event.preventDefault();
		pressFocus = document.activeElement !== list;
	});
	list.addEventListener('click', () => {
		pressFocus = false;
	});
	list.addEventListener('blur', () => {
		pressFocus = false;
	});

	list.addEventListener('focus', () => {
		if (!rows.length) return;
		const scroll = !pressFocus;
		pressFocus = false;
		setActive(active < 0 ? Math.max(selectedIndex(), 0) : active, { scroll });
	});

	return {
		list,
		/**
		 * Draw the rows in the order given.
		 * @param {ListboxEntry[]} entries
		 * @param {String} [selected]  ID of the row in use
		 */
		render(entries, selected = '') {
			selectedId = selected;
			const scrollTop = list.scrollTop;
			rows = entries.map((entry, index) => {
				const { node } = entry;
				node.id = `${uid}-option-${index}`;
				node.setAttribute('role', 'option');
				if (entry.id !== null) node.dataset.id = entry.id;
				return { node, entry };
			});
			// Consecutive rows of one group share a role="group" wrapper that its heading names.
			/** @type {HTMLElement[]} */
			const nodes = [];
			/** @type {HTMLElement|null} */
			let wrapper = null;
			let wrapperId = '';
			rows.forEach((row) => {
				const group = row.entry.group;
				if (!group) {
					wrapper = null;
					wrapperId = '';
					nodes.push(row.node);
					return;
				}
				if (!wrapper || wrapperId !== group.id) {
					wrapper = el('div', group.className ?? '');
					wrapperId = group.id;
					group.head.id = `${uid}-group-${nodes.length}`;
					wrapper.setAttribute('role', 'group');
					wrapper.setAttribute('aria-labelledby', group.head.id);
					wrapper.append(group.head);
					if (group.caption) wrapper.append(group.caption);
					nodes.push(wrapper);
				}
				wrapper.append(row.node);
			});
			list.replaceChildren(...nodes);
			rows.forEach((row) =>
				row.node.setAttribute(
					'aria-selected',
					String(row.entry.id !== null && row.entry.id === selectedId)
				)
			);
			markActive(Math.max(selectedIndex(), 0));
			// Drawing again never moves the list under the pointer.
			list.scrollTop = scrollTop;
			// The focused owner keeps announcing its active row; otherwise the focus handler does.
			if (rows.length && (input || document.activeElement === list)) {
				owner.setAttribute('aria-activedescendant', rows[active].node.id);
			} else {
				owner.removeAttribute('aria-activedescendant');
			}
		},
		/** Forget the rows. */
		clear() {
			rows = [];
			active = -1;
			selectedId = '';
			typed = '';
			list.replaceChildren();
			owner.removeAttribute('aria-activedescendant');
		},
		/** While a check runs the list ignores input and says so. */
		setBusy(value) {
			busy = !!value;
			// aria-busy takes "true", not an empty attribute.
			if (busy) list.setAttribute('aria-busy', 'true');
			else list.removeAttribute('aria-busy');
			list.classList.toggle('is-busy', busy);
		},
		/** @param {FocusOptions} [options] */
		focus(options) {
			owner.focus(options);
		},
		/** Make a row (by model ID) the active one, e.g. after filtering. */
		activateById(id, options) {
			const index = rows.findIndex((row) => row.entry.id === id);
			if (index >= 0) setActive(index, options);
		},
		/** Make the first usable row the active one (the top of a fresh search result). */
		activateFirst(options) {
			const index = rows.findIndex((row) => !row.entry.disabled);
			setActive(index >= 0 ? index : 0, options);
		},
		/** ID of the active row, or '' for none or an action row. */
		get activeId() {
			return rows[active]?.entry.id ?? '';
		},
		get selectedId() {
			return selectedId;
		},
	};
}
