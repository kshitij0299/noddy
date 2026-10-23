/**
 * The Model block of the connect flow's third step (M4, #76, #82): a label row, a search field
 * when the list is long, the models as an ARIA listbox, and one quiet line under it.
 *
 * - Only models that meet the app's requirements are listed (`model-requirements.js`): nothing
 *   is greyed out. Free · n comes first, then Paid · n. A heading shows only when both groups
 *   have rows. The quiet line says "Showing 42 models that work with Noddy's tools" and offers
 *   "Use a model ID" for a model the list does not have.
 * - A row shows only what differs from its group: the model ID (it wraps, never truncated: the
 *   end of an ID carries the variant), then Vision, the price of a Paid model or "Price varies",
 *   and "Ends 31 Oct" when it ends within 30 days. Free, Paid and Tools stay in each option's
 *   accessible name.
 * - The search field is a combobox over the list (focus stays in the field, the active row is
 *   `aria-activedescendant`), and filters across both groups as you type.
 * - No match: a message and, when the text is a valid model ID, one action row that uses it.
 *
 * Choosing only *asks* (`onSelect`, `onConfirm`, `onUseTyped`): the card owns the state and draws
 * this again. Every string is set as text; nothing here parses HTML.
 */
import { badgesFor, expiryNote, priceSpoken, priceText } from '../model-list.js';
import { SEARCH_THRESHOLD, countLine, freeCaption, groupModels } from '../connect-flow.js';
import { MODEL_ID_PATTERN } from '../provider-config.js';
import { el, icon, srOnly } from './cards/card-shell.js';
import { createListbox } from './agent-listbox.js';

let listCount = 0;

/**
 * @param {Object} [options]
 * @param {(model: import('../model-list.js').ListedModel) => void} [options.onSelect]  a usable model was chosen
 * @param {(model: import('../model-list.js').ListedModel) => void} [options.onConfirm]  Enter on the model already selected
 * @param {(id: string) => void} [options.onUseTyped]  "Use “…” as a model ID" was chosen
 * @param {() => void} [options.onUseId]  "Use a model ID" was pressed
 * @param {(text: string) => void} [options.onSearch]  the search text changed
 */
export function createModelList({
	onSelect = () => {},
	onConfirm = () => {},
	onUseTyped = () => {},
	onUseId = () => {},
	onSearch = () => {},
} = {}) {
	const uid = `agent-models-${++listCount}`;
	const root = el('div', 'agent-models');

	// Label row: "Model" left, the price unit right (only while paid rows are visible).
	const labelRow = el('div', 'agent-field__label-row');
	const labelNode = el('span', 'agent-field__label text-label', 'Model');
	labelNode.id = `${uid}-label`;
	const unit = el('span', 'agent-models__unit text-mono-small', 'Price in / out per 1M tokens');
	labelRow.append(labelNode, unit);

	// Search: a combobox over the list. Icons sit inside the field box. It is built again
	// whenever the list flips between searchable and not, so no stale key handler survives.
	/** @type {HTMLInputElement} */
	let search;
	/** @type {HTMLButtonElement} */
	let clear;
	/** @type {HTMLElement} */
	let searchBox;
	function buildSearch() {
		searchBox = el('div', 'agent-field__box agent-models__search');
		search = /** @type {HTMLInputElement} */ (el('input', 'agent-field__input text-body'));
		search.type = 'text';
		search.spellcheck = false;
		search.maxLength = 160;
		clear = /** @type {HTMLButtonElement} */ (el('button', 'agent-field__icon-button'));
		clear.type = 'button';
		clear.setAttribute('aria-label', 'Clear search');
		clear.append(icon('close'));
		searchBox.append(icon('search', 'agent-field__lead-icon'), search, clear);
		search.addEventListener('input', () => {
			redraw();
			onSearch(search.value);
		});
		const cleared = () => {
			search.value = '';
			redraw();
			onSearch('');
		};
		clear.addEventListener('click', () => {
			cleared();
			search.focus();
		});
		// The Esc handler of the combobox needs the same clear.
		search.clearSearch = cleared;
	}
	buildSearch();

	// Polite count for screen readers ("12 models match").
	const live = el('div', 'agent-sr-only');
	live.setAttribute('role', 'status');
	live.setAttribute('aria-live', 'polite');

	// The quiet line under the list: how many models, and the way to a model that is not listed.
	const footer = el('p', 'agent-models__count text-body-small');
	const countText = el('span', '');
	const useId = /** @type {HTMLButtonElement} */ (
		el('button', 'agent-link-button', 'Use a model ID')
	);
	useId.type = 'button';
	useId.addEventListener('click', () => onUseId());
	footer.append(countText, ' ', useId);

	let searchable = false;
	/** @type {null | {models: import('../model-list.js').ListedModel[], provider: string, selected: string, counters: {remaining: number, limit: number}|null, now: number}} */
	let last = null;
	/** @type {ReturnType<typeof createListbox>} */
	let box;

	function newListbox() {
		return createListbox({
			className: 'agent-models__list',
			labelledBy: labelNode.id,
			input: searchable ? search : undefined,
			onSelect: (entry) =>
				onSelect(/** @type {import('../model-list.js').ListedModel} */ (entry.data)),
			onConfirm: (entry) =>
				onConfirm(/** @type {import('../model-list.js').ListedModel} */ (entry.data)),
			onAction: (entry) => onUseTyped(/** @type {string} */ (entry.data)),
			onEscape: (event) => {
				// Esc clears the search text; the panel never sees it (the card swallows Esc).
				if (event.target === search && search.value) {
					/** @type {any} */ (search).clearSearch();
					return true;
				}
				return false;
			},
		});
	}

	function badge(kind, text, iconName, spoken) {
		const node = el('span', `agent-badge agent-badge--${kind}`);
		node.dataset.badge = kind;
		const visible = el('span', 'agent-badge__label', text);
		if (spoken) {
			// "Tools ?" is not a sentence: read it as one.
			visible.setAttribute('aria-hidden', 'true');
			node.append(icon(iconName, 'agent-badge__icon'), visible, srOnly(spoken));
		} else {
			node.append(icon(iconName, 'agent-badge__icon'), visible);
		}
		return node;
	}

	/** @param {import('../model-list.js').ListedModel} model */
	function buildRow(model, now, group) {
		const node = el('div', 'agent-model');
		const body = el('span', 'agent-model__body');
		// Line 1: the ID, with the price of a Paid model (or "Price varies") on the right.
		const line = el('span', 'agent-model__line');
		line.append(el('span', 'agent-model__id text-mono', model.id));
		const spoken = [];
		if (group.id === 'free') spoken.push('Free');
		spoken.push('uses tools');
		const price = model.varies ? 'Price varies' : priceText(model);
		if (price) {
			const shown = el('span', 'agent-model__price text-mono-small', price);
			shown.setAttribute('aria-hidden', 'true');
			line.append(shown);
			spoken.push(model.varies ? 'price varies' : priceSpoken(model));
			if (!model.varies) spoken.unshift('Paid');
		}
		line.append(srOnly(`, ${spoken.join(', ')}`));
		body.append(line);

		// Line 2: only what differs from the group.
		const meta = el('span', 'agent-model__meta text-body-small');
		for (const item of badgesFor(model)) {
			if (item.kind === 'vision') meta.append(badge(item.kind, item.label, item.icon));
		}
		const ends = expiryNote(model, now);
		if (ends) meta.append(el('span', 'agent-model__ends', ends));
		if (meta.childElementCount) body.append(meta);
		node.append(icon('check', 'agent-model__mark'), body);
		return { id: model.id, node, text: model.id.toLowerCase(), data: model, group };
	}

	function buildHead(group, showHeading, counters, provider) {
		if (!showHeading) return null;
		const head = el(
			'div',
			'agent-models__group-head text-label',
			`${group.label} · ${group.models.length}`
		);
		let caption = null;
		const text = group.id === 'free' ? freeCaption(provider, counters) : '';
		if (text) caption = el('div', 'agent-models__group-caption text-body-small', text);
		return { head, caption };
	}

	function noMatchMessage(text) {
		return el('div', 'agent-models__none text-body-small', `No model matches “${text}”.`);
	}

	/** Draw the list for the current search text. */
	function redraw() {
		if (!last) return;
		const { models, provider, selected, counters, now } = last;
		const text = search.value.trim();
		const total = groupModels(models, { provider, now }).reduce(
			(sum, group) => sum + group.models.length,
			0
		);
		const groups = groupModels(models, { provider, now, text });
		const shown = groups.flatMap((group) => group.models);
		const showHeading = groups.length >= 2;

		/** @type {import('./agent-listbox.js').ListboxEntry[]} */
		const entries = [];
		for (const group of groups) {
			const parts = buildHead(group, showHeading, counters, provider);
			const listGroup = parts
				? {
						id: group.id,
						head: parts.head,
						caption: parts.caption ?? undefined,
						className: 'agent-models__group',
				  }
				: undefined;
			for (const model of group.models) {
				entries.push(buildRow(model, now, /** @type {any} */ (listGroup ?? { id: group.id })));
			}
		}
		// A group with no heading is not a group: its rows sit directly in the list.
		if (!showHeading) entries.forEach((entry) => delete entry.group);

		// No match: say so, and offer to use the text as a model ID when it could be one.
		let message = null;
		if (text && !shown.length) {
			message = noMatchMessage(text);
			if (MODEL_ID_PATTERN.test(text)) {
				const node = el('div', 'agent-model agent-model--action');
				node.append(
					icon('add', 'agent-model__mark'),
					el('span', 'agent-model__body text-body', `Use “${text}” as a model ID`)
				);
				entries.push({ id: null, node, text: '', action: true, data: text });
			}
		}

		unit.hidden = !shown.some((model) => !!priceText(model));
		const visibleSelected = shown.some((model) => model.id === selected);
		box.render(entries, visibleSelected ? selected : '');
		if (message) box.list.prepend(message);
		if (text && searchable) {
			// A fresh search lands on its best match: the selected row if it matches, else the first one.
			if (visibleSelected) box.activateById(selected, { scroll: false });
			else box.activateFirst({ scroll: false });
		}
		clear.hidden = !search.value;
		countText.textContent = countLine(shown.length, total);
		if (text) {
			live.textContent = shown.length
				? `${shown.length} ${shown.length === 1 ? 'model matches' : 'models match'}`
				: 'No models match';
		}
		return { shown: shown.length, total };
	}

	function mount() {
		searchBox.hidden = !searchable;
		root.replaceChildren(labelRow, ...(searchable ? [searchBox] : []), box.list, footer, live);
	}

	box = newListbox();
	mount();

	return {
		root,
		get list() {
			return box.list;
		},
		get search() {
			return search;
		},
		/**
		 * Draw the key's models.
		 * @param {Object} data
		 * @param {import('../model-list.js').ListedModel[]} data.models
		 * @param {string} data.provider
		 * @param {string} data.selected  the model that "Use this model" would use
		 * @param {{remaining: number, limit: number}|null} [data.counters]  OpenRouter free requests left
		 * @param {number} [data.now]
		 */
		render({ models, provider, selected, counters = null, now = Date.now() }) {
			const wasSearchable = searchable;
			const count = groupModels(models, { provider, now }).reduce(
				(sum, group) => sum + group.models.length,
				0
			);
			searchable = count > SEARCH_THRESHOLD;
			if (searchable !== wasSearchable || !box) {
				const text = search.value;
				buildSearch();
				if (searchable) search.value = text;
				box = newListbox();
				mount();
			}
			search.placeholder = `Search ${count} models`;
			search.setAttribute('aria-label', `Search ${count} models`);
			last = { models, provider, selected, counters, now };
			return redraw();
		},
		/** Change the selected model without touching the search. */
		select(selected) {
			if (last) {
				last.selected = selected;
				redraw();
			}
		},
		get searchable() {
			return searchable;
		},
		get searchText() {
			return search.value;
		},
		get activeId() {
			return box.activeId;
		},
		get selectedId() {
			return box.selectedId;
		},
		/** Stop answering input while a request runs. */
		setBusy(value) {
			box.setBusy(value);
			search.readOnly = !!value;
		},
		/** Focus the search field, or the list when there is no search. */
		focus() {
			box.focus();
		},
		/** Forget the rows and the search text. */
		clear() {
			last = null;
			search.value = '';
			box.clear();
		},
	};
}
