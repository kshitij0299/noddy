/**
 * The key's live model list (M4, #76), drawn as an ARIA listbox inside the
 * connect card.
 *
 * Each row is a model ID with Free / Paid / Tools / Vision badges (icon plus
 * text, never colour alone). A model that cannot use tools stays in the list so
 * its reason can be read, but it is dimmed, `aria-disabled` and never selectable.
 * The last row, "Custom…", asks the card for a free-text model ID.
 *
 * The listbox behaviour (keys, type-ahead, focus, busy) is the shared one in
 * agent-listbox.js, which also drives the Provider and Model dropdowns
 * (agent-dropdown.js, #78); this file only builds the rows. Choosing only
 * *asks* (`onSelect`): the card draws the list again with the new selection once
 * the model is really in use.
 *
 * Every string is set as text; nothing here parses HTML.
 */
import { badgesFor, isSelectable, priceSpoken, priceText, reasonFor } from '../model-list.js';
import { el, icon, srOnly } from './cards/card-shell.js';
import { createListbox } from './agent-listbox.js';

let listCount = 0;

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
	const box = createListbox({
		className: 'agent-models__list',
		labelledBy: labelNode.id,
		onSelect: (entry) =>
			onSelect(/** @type {import('../model-list.js').ListedModel} */ (entry.data)),
		onAction: () => onCustom(),
	});
	root.append(labelRow, box.list);

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

	/** @param {import('../model-list.js').ListedModel} model */
	function buildRow(model) {
		const node = el('div', 'agent-model');
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
		// Line 2: what the model is (badges). A model that cannot be chosen says why first.
		const meta = el('span', 'agent-model__meta text-body-small');
		if (!isSelectable(model)) {
			node.setAttribute('aria-disabled', 'true');
			node.classList.add('is-disabled');
			meta.append(el('span', 'agent-model__reason', reasonFor(model)));
		}
		buildBadges(model, meta);
		body.append(meta);
		node.append(icon('check', 'agent-model__mark'), body);
		return {
			id: model.id,
			node,
			text: model.id.toLowerCase(),
			disabled: !isSelectable(model),
			data: model,
		};
	}

	function buildCustomRow() {
		const node = el('div', 'agent-model agent-model--custom');
		node.dataset.custom = 'true';
		const body = el('span', 'agent-model__body');
		body.append(el('span', 'agent-model__id text-label', 'Custom…'));
		node.append(icon('edit', 'agent-model__mark agent-model__mark--custom'), body);
		return { id: null, node, text: 'custom…', action: true };
	}

	return {
		root,
		list: box.list,
		/**
		 * Draw the rows in the order given (the card sorts), then "Custom…".
		 * @param {import('../model-list.js').ListedModel[]} models
		 * @param {String} [selected]  ID of the model in use
		 */
		render(models, selected = '') {
			box.render([...models.map(buildRow), buildCustomRow()], selected);
		},
		/** Forget the rows (the card drops the list when its provider changes). */
		clear: box.clear,
		setBusy: box.setBusy,
		focus() {
			box.focus();
		},
		get activeId() {
			return box.activeId;
		},
		get selectedId() {
			return box.selectedId;
		},
	};
}
