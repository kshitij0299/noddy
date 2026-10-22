/**
 * The key's live model list (M4, #76), drawn as an ARIA listbox inside the
 * connect card.
 *
 * Each row is a model ID with Free / Paid / Tools / Vision badges (icon plus
 * text, never colour alone). A model that cannot use tools stays in the list so
 * its reason can be read, but it is dimmed, `aria-disabled` and never selectable.
 * The last row, "Custom…", asks the card for a free-text model ID.
 *
 * Listbox pattern: focus stays on the list and `aria-activedescendant` names the
 * active row. Up/Down/Home/End/PageUp/PageDown move; Enter or Space selects;
 * typing jumps to the next ID that starts with what was typed; Esc puts the
 * active row back on the selected model (and otherwise lets the panel handle
 * it). Choosing only *asks* (`onSelect`): the card draws the list again with the
 * new selection once the model is really in use, so a failed check never leaves
 * a wrong row marked.
 *
 * Every string is set as text; nothing here parses HTML.
 */
import { badgesFor, isSelectable, priceSpoken, priceText, reasonFor } from '../model-list.js';
import { el, icon, srOnly } from './cards/card-shell.js';

let listCount = 0;
const TYPE_AHEAD_MS = 700;
const PAGE = 8;

/**
 * @param {Object} [options]
 * @param {(model: import('../model-list.js').ListedModel) => void} [options.onSelect]
 *   a usable model was chosen (click, Enter or Space)
 * @param {() => void} [options.onCustom]  "Custom…" was chosen
 * @param {String} [options.label]  visible label of the list
 */
export function createModelList({
	onSelect = () => {},
	onCustom = () => {},
	label = 'Model',
} = {}) {
	const uid = `agent-models-${++listCount}`;
	const root = el('div', 'agent-models');
	const labelRow = el('div', 'agent-models__head');
	const labelNode = el('span', 'agent-models__label text-label', label);
	labelNode.id = `${uid}-label`;
	// Prices are shown bare ("$3 / $15"); this says what they mean, once.
	const unit = el('span', 'agent-models__unit text-mono-small', 'Price in / out per 1M tokens');
	labelRow.append(labelNode, unit);
	const list = el('div', 'agent-models__list');
	list.setAttribute('role', 'listbox');
	list.setAttribute('aria-labelledby', labelNode.id);
	list.tabIndex = 0;
	root.append(labelRow, list);

	/** @type {Array<{node: HTMLElement, model: import('../model-list.js').ListedModel | null, text: string}>} */
	let rows = [];
	let active = -1;
	let selectedId = '';
	let busy = false;
	let typed = '';
	let typedTimer = 0;

	function selectedIndex() {
		return rows.findIndex((row) => row.model && row.model.id === selectedId);
	}

	function markActive(index) {
		active = Math.max(0, Math.min(rows.length - 1, index));
		rows.forEach((row, i) => row.node.classList.toggle('is-active', i === active));
	}

	function setActive(index) {
		if (!rows.length) return;
		markActive(index);
		list.setAttribute('aria-activedescendant', rows[active].node.id);
		rows[active].node.scrollIntoView?.({ block: 'nearest' });
	}

	function buildBadges(model, meta) {
		for (const badge of badgesFor(model)) {
			const node = el('span', `agent-badge agent-badge--${badge.kind}`);
			node.dataset.badge = badge.kind;
			const visible = el('span', 'agent-badge__label', badge.label);
			if (badge.spoken) {
				// "Tools ?" is not a sentence: read it as one.
				visible.setAttribute('aria-hidden', 'true');
				node.append(icon(badge.icon, 'agent-badge__icon'), visible, srOnly(badge.spoken));
			} else {
				node.append(icon(badge.icon, 'agent-badge__icon'), visible);
			}
			meta.append(node);
		}
	}

	function buildRow(model, index) {
		const node = el('div', 'agent-model');
		node.id = `${uid}-option-${index}`;
		node.setAttribute('role', 'option');
		node.setAttribute('aria-selected', 'false');
		node.dataset.id = model.id;
		const body = el('span', 'agent-model__body');
		// Line 1: the ID, with the price of a Paid model on the right.
		const line = el('span', 'agent-model__line');
		line.append(el('span', 'agent-model__id text-mono', model.id));
		const price = priceText(model);
		if (price && isSelectable(model)) {
			const shown = el('span', 'agent-model__price text-mono-small', price);
			shown.setAttribute('aria-hidden', 'true');
			line.append(shown, srOnly(priceSpoken(model)));
		}
		body.append(line);
		// Line 2: badges, or the one-line reason the model cannot be chosen.
		const meta = el('span', 'agent-model__meta text-body-small');
		if (isSelectable(model)) {
			buildBadges(model, meta);
		} else {
			node.setAttribute('aria-disabled', 'true');
			node.classList.add('is-disabled');
			meta.append(el('span', 'agent-model__reason', reasonFor(model)));
		}
		body.append(meta);
		node.append(icon('check', 'agent-model__mark'), body);
		return { node, model, text: model.id.toLowerCase() };
	}

	function buildCustomRow(index) {
		const node = el('div', 'agent-model agent-model--custom');
		node.id = `${uid}-option-${index}`;
		node.setAttribute('role', 'option');
		node.setAttribute('aria-selected', 'false');
		node.dataset.custom = 'true';
		const body = el('span', 'agent-model__body');
		body.append(el('span', 'agent-model__id text-label', 'Custom…'));
		node.append(icon('edit', 'agent-model__mark agent-model__mark--custom'), body);
		return { node, model: null, text: 'custom…' };
	}

	function activate(index) {
		const row = rows[index];
		if (!row || busy) return;
		setActive(index);
		if (!row.model) return onCustom();
		// A model without tool calling is shown, never chosen.
		if (!isSelectable(row.model) || row.model.id === selectedId) return;
		onSelect(row.model);
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
			if (rows[index].text.startsWith(needle)) return setActive(index);
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

	list.addEventListener('focus', () => {
		if (rows.length) setActive(active < 0 ? Math.max(selectedIndex(), 0) : active);
	});

	return {
		root,
		list,
		/**
		 * Draw the rows in the order given (the card sorts), then "Custom…".
		 * @param {import('../model-list.js').ListedModel[]} models
		 * @param {String} [selected]  ID of the model in use
		 */
		render(models, selected = '') {
			selectedId = selected;
			rows = [...models.map(buildRow), buildCustomRow(models.length)];
			list.replaceChildren(...rows.map((row) => row.node));
			rows.forEach((row) =>
				row.node.setAttribute('aria-selected', String(!!row.model && row.model.id === selectedId))
			);
			// The active row is announced once the list has focus (see the focus handler).
			list.removeAttribute('aria-activedescendant');
			markActive(Math.max(selectedIndex(), 0));
		},
		/** While a check runs the list ignores input and says so. */
		setBusy(value) {
			busy = !!value;
			// aria-busy takes "true", not an empty attribute.
			if (busy) list.setAttribute('aria-busy', 'true');
			else list.removeAttribute('aria-busy');
			list.classList.toggle('is-busy', busy);
		},
		focus() {
			list.focus();
		},
		get activeId() {
			return rows[active]?.model?.id ?? '';
		},
		get selectedId() {
			return selectedId;
		},
	};
}
