/**
 * A small popover for the composer chips (PR B): the model list, the mode menu, the target menu.
 *
 * It floats above the composer inside the panel (one at a time), never over the font. The chip
 * that opens it is its anchor: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`.
 * Esc closes it and puts focus back on the chip (the panel never sees that Esc, so it does not
 * minimize). A click outside, or Tab past its last control, closes it too.
 */
import { el } from './cards/card-shell.js';

let popoverCount = 0;
/** @type {Set<ReturnType<typeof createPopover>>} */
const openPopovers = new Set();

/**
 * @param {Object} options
 * @param {HTMLElement} options.anchor - the chip button
 * @param {String} options.label - the dialog's accessible name
 * @param {String} [options.className]
 * @param {'auto'|'wide'} [options.width] - wide: the panel's content width (the model list)
 * @param {() => void} [options.onOpen] - draw the content
 * @param {() => void} [options.onClose]
 * @param {() => void} [options.focus] - where focus goes on open (default: the first control)
 */
export function createPopover({
	anchor,
	label,
	className = '',
	width = 'auto',
	onOpen = () => {},
	onClose = () => {},
	focus,
}) {
	const id = `agent-popover-${++popoverCount}`;
	const root = el('div', `agent-popover agent-popover--${width} ${className}`.trim());
	root.id = id;
	root.setAttribute('role', 'dialog');
	root.setAttribute('aria-label', label);
	root.hidden = true;
	const body = el('div', 'agent-popover__body');
	root.append(body);

	anchor.setAttribute('aria-haspopup', 'dialog');
	anchor.setAttribute('aria-expanded', 'false');
	anchor.setAttribute('aria-controls', id);

	let isOpen = false;

	function place() {
		const host = /** @type {HTMLElement|null} */ (root.offsetParent || root.parentElement);
		if (!host) return;
		const hostBox = host.getBoundingClientRect();
		const chipBox = anchor.getBoundingClientRect();
		// Above the whole composer, so what is typed stays in view.
		const floor = (anchor.closest('.agent-composer') || anchor).getBoundingClientRect();
		const gap = 8;
		root.style.bottom = `${Math.max(0, hostBox.bottom - floor.top + gap)}px`;
		// The tallest it can be: up to the header (48px + padding), never off the panel.
		const room = Math.max(160, floor.top - hostBox.top - 72);
		root.style.setProperty('--popover-max', `${Math.round(room)}px`);
		if (width === 'wide') return;
		const inset = 16;
		const left = chipBox.left - hostBox.left;
		const maxLeft = hostBox.width - root.offsetWidth - inset;
		root.style.left = `${Math.max(inset, Math.min(left, maxLeft))}px`;
	}

	function focusables() {
		return /** @type {HTMLElement[]} */ (
			[...root.querySelectorAll('button, input, [tabindex="0"], [role="radio"]')].filter(
				(node) => !(/** @type {any} */ (node).disabled) && !node.closest('[hidden]')
			)
		);
	}

	function open() {
		if (isOpen) return;
		for (const other of [...openPopovers]) other.close({ restoreFocus: false });
		isOpen = true;
		openPopovers.add(api);
		onOpen();
		root.hidden = false;
		anchor.setAttribute('aria-expanded', 'true');
		place();
		if (focus) focus();
		else focusables()[0]?.focus();
		document.addEventListener('pointerdown', onOutside, true);
	}

	/** @param {{restoreFocus?: Boolean}} [options] */
	function close({ restoreFocus = true } = {}) {
		if (!isOpen) return;
		isOpen = false;
		openPopovers.delete(api);
		const hadFocus = root.contains(document.activeElement);
		root.hidden = true;
		anchor.setAttribute('aria-expanded', 'false');
		document.removeEventListener('pointerdown', onOutside, true);
		onClose();
		if (restoreFocus && hadFocus) anchor.focus();
	}

	function onOutside(event) {
		const target = /** @type {Node} */ (event.target);
		if (root.contains(target) || anchor.contains(target)) return;
		close({ restoreFocus: false });
	}

	root.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape' || event.ctrlKey || event.metaKey || event.altKey) return;
		// Inner controls (the model search) may use Esc first.
		if (event.defaultPrevented) return;
		event.preventDefault();
		event.stopPropagation();
		close();
	});
	// Tab out of the popover (not into the chip) closes it.
	root.addEventListener('focusout', (event) => {
		const next = /** @type {Node|null} */ (event.relatedTarget);
		if (!isOpen || !next || root.contains(next) || next === anchor) return;
		close({ restoreFocus: false });
	});

	anchor.addEventListener('click', () => (isOpen ? close() : open()));
	anchor.addEventListener('keydown', (event) => {
		if (event.key === 'ArrowUp' && !isOpen) {
			event.preventDefault();
			open();
		} else if (event.key === 'Escape' && isOpen) {
			event.preventDefault();
			event.stopPropagation();
			close();
		}
	});

	const api = {
		root,
		body,
		open,
		close,
		place,
		get isOpen() {
			return isOpen;
		},
	};
	return api;
}

/** Closes every open composer popover (the panel minimizing, a new chat). */
export function closeAllPopovers() {
	for (const popover of [...openPopovers]) popover.close({ restoreFocus: false });
}
