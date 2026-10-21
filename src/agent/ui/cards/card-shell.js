/**
 * Shared shell for the agent message cards (M4, issue #22).
 *
 * Every card is a presentational light-DOM custom element: it takes plain
 * data through `render(data)` (or the `data` setter), draws itself with the
 * Noddy tokens, and emits `agent-card-action` CustomEvents when one of its
 * buttons is pressed. No run logic lives here — the thread / controller
 * listens for the event and decides what to do.
 *
 * After a button fires the card stays in the thread with its buttons
 * disabled and a step line appended (UX note on #22).
 */

/** Event name every card dispatches. `detail` = { action, cardId, ...extra }. */
export const CARD_ACTION_EVENT = 'agent-card-action';

/**
 * Small DOM helper.
 * @param {String} tag - element tag
 * @param {String} [className] - class list
 * @param {String} [text] - textContent
 * @returns {HTMLElement}
 */
export function el(tag, className = '', text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

/**
 * Material Symbols Rounded icon (outlined). Decorative: the owning control
 * must carry its own text or aria-label.
 * @param {String} name - ligature name, e.g. 'check_circle'
 * @param {String} [className] - extra classes
 * @returns {HTMLElement}
 */
export function icon(name, className = '') {
	const node = el('span', `material-symbols-rounded agent-card__icon ${className}`.trim(), name);
	node.setAttribute('aria-hidden', 'true');
	return node;
}

/**
 * Screen-reader-only text (status is never colour or icon alone).
 * @param {String} text - hidden text
 * @returns {HTMLElement}
 */
export function srOnly(text) {
	return el('span', 'agent-sr-only', text);
}

/**
 * A real <button> for a card action.
 * @param {Object} options
 * @param {String} options.label - visible label
 * @param {String} options.action - action id put in the event detail
 * @param {String} [options.iconName] - leading icon
 * @param {'primary'|'secondary'|'ghost'} [options.variant]
 * @param {'md'|'lg'} [options.size] - 32px (md) or 36px (lg)
 * @returns {HTMLButtonElement}
 */
export function cardButton({ label, action, iconName, variant = 'ghost', size = 'md' }) {
	const node = el('button', `agent-card__button agent-card__button--${variant}`);
	if (size === 'lg') node.classList.add('agent-card__button--lg');
	node.type = 'button';
	node.dataset.action = action;
	if (iconName) node.append(icon(iconName));
	node.append(el('span', 'agent-card__button-label', label));
	return /** @type {HTMLButtonElement} */ (node);
}

/**
 * Chip: Mono text on a subtle background (spec values, order groups, summary).
 * @param {String} text - chip text
 * @param {Object} [options]
 * @param {Boolean} [options.selected] - accent background
 * @param {String} [options.iconName] - leading icon
 * @returns {HTMLElement}
 */
export function chip(text, { selected = false, iconName } = {}) {
	const node = el('span', 'agent-chip text-mono');
	if (selected) node.classList.add('agent-chip--selected');
	if (iconName) node.append(icon(iconName, 'agent-chip__icon'));
	node.append(el('span', '', text));
	return node;
}

/**
 * Header row: Label/Meta left, Mono small right.
 * @param {String} label - left text
 * @param {String} meta - right text (Mono small)
 * @param {'meta'|'label'} [labelRole] - text role of the left part
 * @returns {HTMLElement}
 */
export function cardHeader(label, meta, labelRole = 'label') {
	const node = el('header', 'agent-card__header');
	node.append(el('span', `agent-card__title text-${labelRole}`, label));
	if (meta) node.append(el('span', 'agent-card__meta text-mono-small', meta));
	return node;
}

/**
 * Base class. Subclasses implement `build(data)` returning the nodes that go
 * inside the 352px shell, and `stepCopyFor(action, extra)` for the step line
 * that appears once a button has fired.
 */
export class AgentCard extends HTMLElement {
	constructor() {
		super();
		/** @type {Object|null} */
		this._data = null;
		/** @type {String|null} action that already fired, if any */
		this.acted = null;
	}

	set data(value) {
		this.render(value);
	}

	get data() {
		return this._data;
	}

	connectedCallback() {
		if (this._data && !this.childElementCount) this.render(this._data);
	}

	/**
	 * Draw the card from plain data. Safe to call again; it resets the
	 * fired state.
	 * @param {Object} data - card data
	 */
	render(data = {}) {
		this._data = data;
		this.acted = null;
		this.removeAttribute('data-acted');
		const shell = el('div', 'agent-card');
		shell.append(...this.build(data));
		this.replaceChildren(shell, ...this.buildBelow(data));
		this.querySelectorAll('button[data-action]').forEach((button) => {
			button.addEventListener('click', () => {
				const action = /** @type {HTMLElement} */ (button).dataset.action;
				this.fire(action, this.extraFor(action));
			});
		});
	}

	/**
	 * Nodes inside the card shell. Subclasses receive `(data)`.
	 * @returns {Node[]}
	 */
	build() {
		return [];
	}

	/**
	 * Nodes rendered below the shell (e.g. the receipt's Keep / Retry row).
	 * Subclasses receive `(data)`.
	 * @returns {Node[]}
	 */
	buildBelow() {
		return [];
	}

	/**
	 * Extra event-detail fields for an action. Subclasses receive `(action)`.
	 * @returns {Object}
	 */
	extraFor() {
		return {};
	}

	/**
	 * Step-line copy shown after an action fired, or null for none.
	 * Subclasses receive `(action, extra)`.
	 * @returns {{tone: String, text: String}|null}
	 */
	stepCopyFor() {
		return null;
	}

	/**
	 * Fire an action: lock the card, append its step line, dispatch the event.
	 * A card fires once; later calls are ignored.
	 * @param {String} action - action id
	 * @param {Object} [extra] - extra event-detail fields
	 * @returns {Boolean} - whether the event was dispatched
	 */
	fire(action, extra = {}) {
		if (this.acted) return false;
		this.act(action, extra);
		this.dispatchEvent(
			new CustomEvent(CARD_ACTION_EVENT, {
				bubbles: true,
				composed: true,
				detail: { action, cardId: this._data?.cardId ?? null, ...extra },
			})
		);
		return true;
	}

	/**
	 * Lock the card after an action: buttons disabled, step line appended.
	 * Also usable by the thread when the action was taken elsewhere.
	 * @param {String} action - action id
	 * @param {Object} [extra] - extra detail
	 */
	act(action, extra = {}) {
		this.acted = action;
		this.setAttribute('data-acted', action);
		this.querySelectorAll('button').forEach((button) => {
			/** @type {HTMLButtonElement} */ (button).disabled = true;
		});
		const copy = this.stepCopyFor(action, extra);
		if (copy) {
			const line = /** @type {any} */ (document.createElement('agent-step-line'));
			if (typeof line.render === 'function') line.render(copy);
			else line.textContent = copy.text;
			this.append(line);
		}
	}
}
