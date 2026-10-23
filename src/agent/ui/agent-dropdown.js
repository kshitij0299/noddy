/**
 * Noddy's own dropdown (M4, #78): a labelled button that opens an in-page
 * listbox. It replaces the native Provider <select> and Model <datalist> of the
 * connect card, whose popups the operating system draws (inside the Claude
 * desktop app's embedded browser they land outside the page, on top of the app).
 *
 * Pattern: the "collapsible dropdown listbox". The button has
 * `aria-haspopup="listbox"`, `aria-expanded` and `aria-controls`, and is named by
 * its visible label plus its value. Opening moves focus into the list, which is
 * the same listbox as the live model list (agent-listbox.js, same rows and
 * fills). Enter, Space, Arrow Down or Arrow Up open it. Choosing a row, Esc or
 * Tab close it and put focus back on the button (Esc is consumed, so it never
 * minimizes the panel); a click outside, a scroll or a resize close it too.
 *
 * Placement: the list is the popover. Where the browser has the Popover API it
 * is shown in the top layer, so no panel or scroller can clip it; otherwise it is
 * `position: fixed`. Either way it takes no room in the card, so opening never
 * shifts the layout. `placePopover` puts it under the button at the button's
 * width, flips it above when there is no room below, keeps it inside the panel
 * and the viewport, and caps its height so the rest scrolls inside the list.
 *
 * Every string is set as text; nothing here parses HTML.
 */
import { el, icon } from './cards/card-shell.js';
import { createListbox } from './agent-listbox.js';

let dropdownCount = 0;

/** Space between the button and the popover, and the edge it keeps from the bounds. */
export const POPOVER_GAP = 4;
export const POPOVER_MARGIN = 8;
/** Tallest the popover grows before it scrolls, and the least it is squeezed to (two rows). */
export const POPOVER_MAX_HEIGHT = 320;
export const POPOVER_MIN_HEIGHT = 72;

/**
 * @typedef {{top: number, left: number, right: number, bottom: number}} Box
 */

/**
 * Where the popover goes. Pure: sizes in, numbers out.
 *
 * It opens below the button when its content fits there. It flips above only
 * when the content does not fit below and there is more room above. Its height
 * is the content's, capped at `maxHeight` and at the room on the chosen side
 * (never less than `minHeight`, so a tiny window still shows a couple of rows).
 * It is as wide as the button and slides sideways, never resizing, to stay
 * inside `bounds`.
 *
 * @param {Object} options
 * @param {Box} options.anchor  the button, in viewport coordinates
 * @param {number} options.contentHeight  height of all rows, borders included
 * @param {Box} options.bounds  the area it must stay in (panel and viewport)
 * @param {number} [options.gap]
 * @param {number} [options.margin]
 * @param {number} [options.maxHeight]
 * @param {number} [options.minHeight]
 * @returns {{left: number, top: number, width: number, height: number, placement: 'below'|'above'}}
 */
export function placePopover({
	anchor,
	contentHeight,
	bounds,
	gap = POPOVER_GAP,
	margin = POPOVER_MARGIN,
	maxHeight = POPOVER_MAX_HEIGHT,
	minHeight = POPOVER_MIN_HEIGHT,
}) {
	const wanted = Math.min(contentHeight, maxHeight);
	const below = bounds.bottom - anchor.bottom - gap - margin;
	const above = anchor.top - bounds.top - gap - margin;
	const placement = wanted <= below || below >= above ? 'below' : 'above';
	const room = placement === 'below' ? below : above;
	const height = Math.min(wanted, Math.max(room, minHeight));
	const width = anchor.right - anchor.left;
	const widest = Math.max(bounds.right - bounds.left - 2 * margin, 0);
	const left = Math.max(
		bounds.left + margin,
		Math.min(anchor.left, bounds.right - margin - Math.min(width, widest))
	);
	return {
		left,
		top: placement === 'below' ? anchor.bottom + gap : anchor.top - gap - height,
		width: Math.min(width, widest),
		height,
		placement,
	};
}

/**
 * The area a popover may use: the agent panel the button sits in, cut to the
 * viewport. Outside a panel (or without layout) it is the viewport.
 * @param {Element} node
 * @returns {Box}
 */
function boundsFor(node) {
	const view = { top: 0, left: 0, right: window.innerWidth, bottom: window.innerHeight };
	const panel = node.closest?.('.agent-panel')?.getBoundingClientRect();
	if (!panel || !(panel.width > 0 && panel.height > 0)) return view;
	return {
		top: Math.max(view.top, panel.top),
		left: Math.max(view.left, panel.left),
		right: Math.min(view.right, panel.right),
		bottom: Math.min(view.bottom, panel.bottom),
	};
}

/**
 * @typedef {Object} DropdownItem
 * @property {String} id
 * @property {String} label  shown in the row and, once chosen, on the button
 * @property {String} [icon]  a mark that stays in the row (e.g. 'edit' for "Custom…")
 */

/**
 * @param {Object} options
 * @param {String} options.label  the visible label
 * @param {DropdownItem[]} [options.items]
 * @param {String} [options.value]  ID of the chosen item
 * @param {Boolean} [options.mono]  set the value and rows in Mono (model IDs)
 * @param {(item: DropdownItem) => void} [options.onChange]  a different item was chosen
 */
export function createDropdown({
	label,
	items = [],
	value = '',
	mono = false,
	onChange = () => {},
}) {
	const uid = `agent-dropdown-${++dropdownCount}`;
	const textRole = mono ? 'text-mono' : 'text-body';
	const root = el('div', 'agent-dropdown');

	const labelNode = /** @type {HTMLLabelElement} */ (
		el('label', 'agent-connect__label text-label', label)
	);
	labelNode.id = `${uid}-label`;
	const field = el('div', 'agent-dropdown__field');

	const button = /** @type {HTMLButtonElement} */ (el('button', `agent-dropdown__button`));
	button.type = 'button';
	button.id = `${uid}-button`;
	labelNode.htmlFor = button.id;
	// Name = the visible label, then the value ("Provider OpenAI").
	button.setAttribute('aria-labelledby', `${labelNode.id} ${button.id}`);
	button.setAttribute('aria-haspopup', 'listbox');
	button.setAttribute('aria-expanded', 'false');
	const valueNode = el('span', `agent-dropdown__value ${textRole}`);
	button.append(valueNode, icon('expand_more', 'agent-dropdown__chevron'));

	const box = createListbox({
		className: 'agent-models__list agent-dropdown__list',
		labelledBy: labelNode.id,
		selectSame: true,
		onSelect: (entry) => choose(/** @type {DropdownItem} */ (entry.data)),
		onEscape: () => {
			close();
			return true;
		},
	});
	const list = box.list;
	list.id = `${uid}-list`;
	list.hidden = true;
	list.setAttribute('popover', 'manual');
	button.setAttribute('aria-controls', list.id);
	// The list is in the card only while it is open: a closed dropdown leaves no hidden
	// listbox behind (a collapsed `aria-controls` may name an element that is not there yet).
	field.append(button);
	root.append(labelNode, field);

	/** @type {DropdownItem[]} */
	let current = [];
	let chosen = '';
	let open = false;
	let disabled = false;

	function draw() {
		const item = current.find((entry) => entry.id === chosen);
		valueNode.textContent = item ? item.label : '';
		box.render(
			current.map((entry) => {
				// A row with its own mark ("Custom…") looks like the model list's Custom… row.
				const node = el(
					'div',
					`agent-model agent-dropdown__option${entry.icon ? ' agent-model--custom' : ''}`
				);
				const mark = icon(entry.icon || 'check', 'agent-model__mark');
				if (entry.icon) mark.classList.add('agent-model__mark--custom');
				const body = el('span', 'agent-model__body');
				body.append(
					el('span', `agent-model__id ${entry.icon ? 'text-label' : textRole}`, entry.label)
				);
				node.append(mark, body);
				return { id: entry.id, node, text: entry.label.toLowerCase(), data: entry };
			}),
			chosen
		);
	}

	function place() {
		const anchor = button.getBoundingClientRect();
		// Rows wrap at the width they will have, so measure at the button's width.
		list.style.width = `${anchor.width}px`;
		list.style.maxHeight = 'none';
		const contentHeight = list.scrollHeight + (list.offsetHeight - list.clientHeight);
		const spot = placePopover({ anchor, contentHeight, bounds: boundsFor(button) });
		Object.assign(list.style, {
			left: `${spot.left}px`,
			top: `${spot.top}px`,
			width: `${spot.width}px`,
			maxHeight: `${spot.height}px`,
		});
		list.dataset.placement = spot.placement;
	}

	function showList() {
		field.append(list);
		list.hidden = false;
		// The top layer, where there is one. `hidden` and the class keep the fallback working.
		if (typeof list.showPopover === 'function' && list.isConnected) {
			try {
				list.showPopover();
			} catch {
				// Already showing, or not allowed here: the fixed fallback still works.
			}
		}
	}

	function hideList() {
		if (typeof list.hidePopover === 'function' && list.isConnected) {
			try {
				list.hidePopover();
			} catch {
				// Not showing.
			}
		}
		list.hidden = true;
		list.remove();
	}

	// ---- Closing from outside ----
	/** A press anywhere else closes the list and leaves focus where the press puts it. */
	const onPointerDown = (event) => {
		if (!root.contains(/** @type {Node} */ (event.target))) close({ restoreFocus: false });
	};
	// Anything outside scrolling or the window resizing would leave the list adrift.
	const onScroll = (event) => {
		if (!list.contains(/** @type {Node} */ (event.target))) close();
	};
	const onResize = () => close();
	// Focus moved to another control (not just away): the list is no longer wanted.
	const onFocusOut = (event) => {
		const next = /** @type {Node | null} */ (event.relatedTarget);
		if (next && !root.contains(next)) close({ restoreFocus: false });
	};

	function openList() {
		if (open || disabled || !current.length) return;
		open = true;
		showList();
		place();
		button.setAttribute('aria-expanded', 'true');
		document.addEventListener('pointerdown', onPointerDown, true);
		document.addEventListener('scroll', onScroll, true);
		window.addEventListener('resize', onResize);
		// The popover is placed in the viewport already, so focusing it cannot scroll the page.
		box.focus({ preventScroll: true });
	}

	/** @param {{restoreFocus?: boolean}} [options] */
	function close({ restoreFocus = true } = {}) {
		if (!open) return;
		open = false;
		document.removeEventListener('pointerdown', onPointerDown, true);
		document.removeEventListener('scroll', onScroll, true);
		window.removeEventListener('resize', onResize);
		button.setAttribute('aria-expanded', 'false');
		// Focus leaves before the list goes, or it would fall to the page.
		if (restoreFocus && root.contains(document.activeElement)) button.focus();
		hideList();
	}

	function choose(item) {
		const changed = item.id !== chosen;
		chosen = item.id;
		draw();
		close();
		if (changed) onChange(item);
	}

	button.addEventListener('click', () => (open ? close() : openList()));
	button.addEventListener('keydown', (event) => {
		if (event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
			event.preventDefault();
			event.stopPropagation();
			openList();
		} else if (event.key === 'Escape' && open) {
			event.preventDefault();
			event.stopPropagation();
			close();
		}
	});
	// Tab leaves the open list: close it onto the button, so Tab carries on from there.
	list.addEventListener('keydown', (event) => {
		if (event.key === 'Tab') close();
	});
	root.addEventListener('focusout', onFocusOut);

	/**
	 * @param {DropdownItem[]} next
	 * @param {String} [selected]  defaults to the current choice, else the first item
	 */
	function setItems(next, selected) {
		close({ restoreFocus: false });
		current = next.map((item) => ({ ...item }));
		chosen = current.some((item) => item.id === (selected ?? chosen))
			? selected ?? chosen
			: current[0]?.id ?? '';
		draw();
	}

	setItems(items, value);

	return {
		root,
		label: labelNode,
		button,
		/** The listbox, which is also the popover. */
		list,
		get value() {
			return chosen;
		},
		/** @returns {DropdownItem | undefined} */
		get item() {
			return current.find((entry) => entry.id === chosen);
		},
		get isOpen() {
			return open;
		},
		setItems,
		/** Show another item as chosen without calling `onChange`. */
		setValue(id) {
			if (!current.some((entry) => entry.id === id)) return;
			chosen = id;
			draw();
		},
		open: openList,
		close,
		focus() {
			button.focus();
		},
		/** A disabled dropdown cannot open; one that is open closes. */
		setDisabled(value) {
			disabled = !!value;
			if (disabled) close({ restoreFocus: false });
			button.disabled = disabled;
		},
	};
}
