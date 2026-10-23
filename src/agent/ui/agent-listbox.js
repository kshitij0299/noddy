/**
 * Shared ARIA listbox for the connect card (M4, #76, #78).
 *
 * One engine behind both the inline live model list (agent-model-list.js) and
 * the dropdowns that replace the native Provider select and Model suggestions
 * (agent-dropdown.js), so the card has one listbox, one keyboard model and one
 * row look.
 *
 * Pattern: focus stays on the list and `aria-activedescendant` names the active
 * row. Up/Down/Home/End/PageUp/PageDown move; Enter or Space selects; typing
 * jumps to the next row whose text starts with what was typed; Esc is handed to
 * `onEscape` (the dropdown closes), and without one puts the active row back on
 * the selected row and otherwise lets the panel handle it. Choosing only *asks*
 * (`onSelect`): the owner of the list draws it again with the new selection once
 * the choice is really in use, so a failed check never leaves a wrong row marked.
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
 * @typedef {Object} ListboxEntry
 * @property {String|null} id  what `render`'s selected ID is matched against; `null` for an action row
 * @property {HTMLElement} node  the row; the listbox adds its role, id and aria-selected
 * @property {String} text  lower-case text that type-ahead matches
 * @property {Boolean} [disabled]  shown, never chosen
 * @property {Boolean} [action]  asks for something else (like "Custom…") and is never selected
 * @property {unknown} [data]  the caller's own value, handed back with the entry
 */

/**
 * @param {Object} options
 * @param {String} [options.className]  class of the list element
 * @param {String} [options.labelledBy]  ID of the visible label
 * @param {(entry: ListboxEntry) => void} [options.onSelect]  a usable row was chosen
 * @param {(entry: ListboxEntry) => void} [options.onAction]  an action row was chosen
 * @param {(event: KeyboardEvent) => Boolean} [options.onEscape]  return true when Esc was handled
 * @param {Boolean} [options.selectSame]  also report the row already selected (a dropdown closes on it)
 */
export function createListbox({
	className = '',
	labelledBy = '',
	onSelect = () => {},
	onAction = () => {},
	onEscape,
	selectSame = false,
} = {}) {
	const uid = `agent-listbox-${++listboxCount}`;
	const list = el('div', className);
	list.setAttribute('role', 'listbox');
	if (labelledBy) list.setAttribute('aria-labelledby', labelledBy);
	list.tabIndex = 0;

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
		list.setAttribute('aria-activedescendant', rows[active].node.id);
		if (scroll) rows[active].node.scrollIntoView?.({ block: 'nearest' });
	}

	function activate(index) {
		const row = rows[index];
		if (!row || busy) return;
		setActive(index);
		if (row.entry.action) return onAction(row.entry);
		// A row that cannot be chosen is shown, never chosen.
		if (row.entry.disabled) return;
		if (row.entry.id === selectedId && !selectSame) return;
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

	list.addEventListener('keydown', (event) => {
		if (busy || event.ctrlKey || event.metaKey || event.altKey) return;
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
				setActive(0);
				break;
			case 'End':
				setActive(rows.length - 1);
				break;
			case 'Enter':
			case ' ':
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
				if (event.key.length !== 1) return;
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
	list.addEventListener('mousedown', () => {
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
			list.replaceChildren(...rows.map((row) => row.node));
			rows.forEach((row) =>
				row.node.setAttribute(
					'aria-selected',
					String(row.entry.id !== null && row.entry.id === selectedId)
				)
			);
			markActive(Math.max(selectedIndex(), 0));
			// Drawing again never moves the list under the pointer.
			list.scrollTop = scrollTop;
			// A focused list keeps announcing its active row; otherwise the focus handler does.
			if (rows.length && document.activeElement === list) {
				list.setAttribute('aria-activedescendant', rows[active].node.id);
			} else {
				list.removeAttribute('aria-activedescendant');
			}
		},
		/** Forget the rows. */
		clear() {
			rows = [];
			active = -1;
			selectedId = '';
			typed = '';
			list.replaceChildren();
			list.removeAttribute('aria-activedescendant');
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
			list.focus(options);
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
