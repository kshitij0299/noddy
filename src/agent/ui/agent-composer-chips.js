/**
 * The Target chip (PR B) as the Tools tab still uses it: a pill button with a trailing chevron
 * that opens a radio-group popover (agent-popover.js): This glyph / Selected glyphs / Whole set,
 * with counts; a scope with nothing in it is disabled and says how to fill it.
 *
 * The agent composer's Model, Mode and Target moved to the ui-sdk composer in #126
 * (composer/agent-composer.jsx). The Tools tab layout is the next issue; until then this stays.
 * Target lives in ../agent-controls.js, which is also what get_context reports.
 */
import {
	SCOPES,
	SCOPE_LABELS,
	getTarget,
	onControlsChange,
	scopeOptions,
	setScope,
} from '../agent-controls.js';
import { charOf } from '../run/review.js';
import { el, icon } from './cards/card-shell.js';
import { createPopover } from './agent-popover.js';

/**
 * A chip button: optional leading icon, a label, then a chevron (it opens a menu).
 * @param {String} className
 * @param {String} [iconName]
 */
export function chipButton(className, iconName) {
	const button = /** @type {HTMLButtonElement} */ (
		el('button', `agent-chip-button text-label ${className}`.trim())
	);
	button.type = 'button';
	if (iconName) button.append(icon(iconName, 'agent-chip-button__icon'));
	const label = el('span', 'agent-chip-button__label');
	const chevron = icon('expand_more', 'agent-chip-button__chevron');
	button.append(label, chevron);
	return { button, label, chevron };
}

/**
 * A radio group with roving focus: arrows move and choose (skipping disabled rows), Enter or
 * Space chooses, as in the WAI-ARIA radio group pattern.
 * @param {Object} options
 * @param {String} options.label
 * @param {(value: String) => void} options.onChoose
 * @param {() => void} [options.onDone] - Enter on a row (closes the popover)
 */
function createRadioGroup({ label, onChoose, onDone = () => {} }) {
	const root = el('div', 'agent-radio-group');
	root.setAttribute('role', 'radiogroup');
	root.setAttribute('aria-label', label);
	/** @type {HTMLElement[]} */
	let rows = [];

	const enabled = () => rows.filter((row) => row.getAttribute('aria-disabled') !== 'true');

	root.addEventListener('keydown', (event) => {
		const list = enabled();
		const at = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
		if (at < 0) return;
		let next = -1;
		if (event.key === 'ArrowDown' || event.key === 'ArrowRight') next = (at + 1) % list.length;
		else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft')
			next = (at - 1 + list.length) % list.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = list.length - 1;
		else if (event.key === ' ' || event.key === 'Enter') {
			event.preventDefault();
			onChoose(list[at].dataset.value);
			if (event.key === 'Enter') onDone();
			return;
		}
		if (next < 0) return;
		event.preventDefault();
		const value = list[next].dataset.value;
		onChoose(value);
		// Choosing redraws the rows: focus the new one.
		/** @type {HTMLElement|null} */ (root.querySelector(`[data-value="${value}"]`))?.focus();
	});

	return {
		root,
		/**
		 * @param {Array<{value: String, title: String, meta?: String, hint?: String, disabled?: Boolean}>} options
		 * @param {String} selected
		 */
		render(options, selected) {
			const focusedValue = root.contains(document.activeElement)
				? /** @type {HTMLElement} */ (document.activeElement).dataset.value
				: null;
			rows = options.map((option) => {
				const row = el('div', 'agent-radio');
				row.dataset.value = option.value;
				row.setAttribute('role', 'radio');
				const on = option.value === selected;
				row.setAttribute('aria-checked', String(on));
				if (option.disabled) row.setAttribute('aria-disabled', 'true');
				row.tabIndex = on && !option.disabled ? 0 : -1;
				const mark = icon(
					on ? 'radio_button_checked' : 'radio_button_unchecked',
					'agent-radio__mark'
				);
				const text = el('span', 'agent-radio__text');
				const head = el('span', 'agent-radio__title text-label');
				head.append(el('span', '', option.title));
				if (option.meta) head.append(el('span', 'agent-radio__meta text-mono-small', option.meta));
				text.append(head);
				if (option.hint) text.append(el('span', 'agent-radio__hint text-body-small', option.hint));
				row.append(mark, text);
				row.addEventListener('click', () => {
					if (option.disabled) return;
					onChoose(option.value);
					onDone();
				});
				return row;
			});
			// Nothing checked is reachable (a disabled current): the first enabled row is the stop.
			if (!rows.some((row) => row.tabIndex === 0)) {
				const first = enabled()[0];
				if (first) first.tabIndex = 0;
			}
			root.replaceChildren(...rows);
			if (focusedValue) rows.find((row) => row.dataset.value === focusedValue)?.focus();
		},
		focus() {
			(rows.find((row) => row.tabIndex === 0) || enabled()[0])?.focus();
		},
	};
}

/** 'A', '3 glyphs', 'Whole set' */
function targetShort(target) {
	if (target.scope === 'glyph') return charOf(target.glyphIds[0]) || 'This glyph';
	if (target.scope === 'selected') return `${target.glyphIds.length} glyphs`;
	return 'Whole set';
}

/**
 * The Target chip and its menu.
 * @param {{getEditor: () => any}} options
 */
export function createTargetChip({ getEditor }) {
	const { button, label } = chipButton('agent-chip-button--target');
	const popover = createPopover({
		anchor: button,
		label: 'Target',
		className: 'agent-popover--target',
		onOpen: () => draw(),
		focus: () => group.focus(),
	});
	const group = createRadioGroup({
		label: 'Target',
		onChoose: (value) => setScope(getEditor(), value),
		onDone: () => popover.close(),
	});
	popover.body.append(group.root);

	function draw() {
		const editor = getEditor();
		const options = scopeOptions(editor);
		const target = getTarget(editor);
		group.render(
			SCOPES.map((scope) => {
				const ids = options[scope];
				const meta =
					scope === 'glyph'
						? ids.length
							? charOf(ids[0])
							: ''
						: ids.length
						? String(ids.length)
						: '';
				const hint = !ids.length
					? scope === 'glyph'
						? 'Open a glyph, or Cmd-click one in the grid'
						: 'Cmd-click or Shift-click glyphs in the grid'
					: '';
				return { value: scope, title: SCOPE_LABELS[scope], meta, hint, disabled: !ids.length };
			}),
			target.scope
		);
	}

	function render() {
		const target = getTarget(getEditor());
		label.textContent = targetShort(target);
		button.dataset.scope = target.scope;
		const spoken =
			target.scope === 'glyph'
				? `This glyph, ${targetShort(target)}`
				: target.scope === 'selected'
				? `${target.glyphIds.length} selected glyphs`
				: `Whole set, ${target.glyphIds.length} glyphs`;
		button.setAttribute('aria-label', `Target: ${spoken}`);
		if (popover.isOpen) draw();
	}

	const off = onControlsChange(render);
	render();
	return { button, popover, render, dispose: off };
}
