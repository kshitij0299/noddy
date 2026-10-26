/**
 * The composer's chips (PR B): Model, Mode and Target, in the composer's tool row next to the
 * paperclip. Each is a small pill button that opens its popover (agent-popover.js) above the
 * composer.
 *
 *   Model   the connected model, short, with a Free / Paid mark; opens the model list
 *           (wired in agent-panel.js, which owns the connect card). With a local agent on it
 *           reads "<client> · connected" and opens nothing.
 *   Mode    Exact / Remix / Wild as a radio group; Remix and Wild show a Chaos slider (0–100)
 *           and the Telephone switch (PR D: each glyph starts from the last glyph's moves).
 *   Target  This glyph / Selected glyphs / Whole set as a radio group with counts; a scope with
 *           nothing in it is disabled and says how to fill it.
 *
 * Mode, chaos and target live in ../agent-controls.js (per project, this tab), which is also
 * what get_context reports.
 */
import {
	MODES,
	MODE_HINTS,
	MODE_LABELS,
	SCOPES,
	SCOPE_LABELS,
	getModeSettings,
	getTarget,
	onControlsChange,
	scopeOptions,
	setChaos,
	setMode,
	setScope,
	setTelephone,
} from '../agent-controls.js';
import { charOf } from '../run/review.js';
import { el, icon, srOnly } from './cards/card-shell.js';
import { createPopover } from './agent-popover.js';

/**
 * A chip button: optional leading icon, a label, optional trailing node.
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
	button.append(label);
	return { button, label };
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

/**
 * The Mode chip and its menu (Exact / Remix / Wild, Chaos in Remix and Wild).
 * @param {{getEditor: () => any}} options
 */
export function createModeChip({ getEditor }) {
	const { button, label } = chipButton('agent-chip-button--mode');
	button.setAttribute('aria-label', 'Mode');
	const popover = createPopover({
		anchor: button,
		label: 'Mode',
		className: 'agent-popover--mode',
		onOpen: () => draw(),
		focus: () => group.focus(),
	});
	const group = createRadioGroup({
		label: 'Mode',
		onChoose: (value) => setMode(getEditor(), value),
		onDone: () => popover.close(),
	});

	const chaosRow = el('div', 'agent-chaos');
	const chaosId = `agent-chaos-${Math.random().toString(36).slice(2, 8)}`;
	const chaosLabel = /** @type {HTMLLabelElement} */ (
		el('label', 'agent-chaos__label text-label', 'Chaos')
	);
	chaosLabel.htmlFor = chaosId;
	const chaosValue = el('output', 'agent-chaos__value text-mono-small');
	chaosValue.setAttribute('for', chaosId);
	const slider = /** @type {HTMLInputElement} */ (el('input', 'agent-chaos__slider'));
	slider.type = 'range';
	slider.id = chaosId;
	slider.min = '0';
	slider.max = '100';
	slider.step = '5';
	slider.addEventListener('input', () => setChaos(getEditor(), slider.value));
	// Arrows belong to the slider here, not the radio group.
	slider.addEventListener('keydown', (event) => {
		if (event.key !== 'Escape' && event.key !== 'Tab') event.stopPropagation();
	});
	const chaosHead = el('div', 'agent-chaos__head');
	chaosHead.append(chaosLabel, chaosValue);
	chaosRow.append(chaosHead, slider);

	// Telephone (Remix and Wild): each glyph starts from the previous glyph's moves plus one
	// mutation, so the set drifts like a story.
	const telephoneRow = el('div', 'agent-telephone');
	const telephoneId = `agent-telephone-${Math.random().toString(36).slice(2, 8)}`;
	const telephoneText = el('span', 'agent-telephone__text');
	const telephoneLabel = el('span', 'text-label', 'Telephone');
	telephoneLabel.id = telephoneId;
	const telephoneHint = el(
		'span',
		'agent-telephone__hint text-body-small',
		'Each glyph riffs on the last one'
	);
	telephoneHint.id = `${telephoneId}-hint`;
	telephoneText.append(telephoneLabel, telephoneHint);
	const telephone = /** @type {HTMLButtonElement} */ (el('button', 'agent-switch'));
	telephone.type = 'button';
	telephone.setAttribute('role', 'switch');
	telephone.setAttribute('aria-labelledby', telephoneId);
	telephone.setAttribute('aria-describedby', telephoneHint.id);
	telephone.append(el('span', 'agent-switch__thumb'));
	telephone.addEventListener('click', () =>
		setTelephone(getEditor(), telephone.getAttribute('aria-checked') !== 'true')
	);
	telephoneRow.append(telephoneText, telephone);
	popover.body.append(group.root, chaosRow, telephoneRow);

	function draw() {
		const { mode, chaos, telephone: telephoneOn } = getModeSettings(getEditor());
		group.render(
			MODES.map((value) => ({ value, title: MODE_LABELS[value], hint: MODE_HINTS[value] })),
			mode
		);
		chaosRow.hidden = mode === 'exact';
		telephoneRow.hidden = mode === 'exact';
		telephone.setAttribute('aria-checked', String(telephoneOn));
		slider.value = String(chaos);
		slider.setAttribute('aria-valuetext', `${chaos} of 100`);
		chaosValue.textContent = String(chaos);
	}

	function render() {
		const { mode, chaos, telephone: telephoneOn } = getModeSettings(getEditor());
		label.textContent = mode === 'exact' ? MODE_LABELS[mode] : `${MODE_LABELS[mode]} ${chaos}`;
		button.setAttribute(
			'aria-label',
			mode === 'exact'
				? `Mode: Exact`
				: `Mode: ${MODE_LABELS[mode]}, chaos ${chaos}${telephoneOn ? ', Telephone on' : ''}`
		);
		button.dataset.mode = mode;
		if (popover.isOpen) draw();
	}

	const off = onControlsChange(render);
	render();
	return { button, popover, render, dispose: off };
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

/**
 * The Model chip (its popover is wired by the panel, which owns the connect card).
 */
export function createModelChip() {
	const { button, label } = chipButton('agent-panel__model');
	const badge = el('span', 'agent-chip-button__badge');
	button.append(badge);
	/**
	 * @param {{label: String, tier?: 'free'|'paid', local?: Boolean}} view
	 */
	function render({ label: text, tier, local = false }) {
		label.textContent = text;
		badge.replaceChildren();
		badge.hidden = !tier || local;
		if (tier && !local) {
			badge.dataset.badge = tier;
			badge.append(
				icon(tier === 'free' ? 'money_off' : 'paid', 'agent-chip-button__badge-icon'),
				srOnly(tier === 'free' ? ', Free' : ', Paid')
			);
		}
		button.toggleAttribute('data-local', local);
		button.setAttribute(
			'aria-label',
			local ? text : `Model: ${text}${tier ? (tier === 'free' ? ', Free' : ', Paid') : ''}`
		);
		button.title = local ? 'Turn off Local agent to use a model' : text;
	}
	render({ label: 'No model' });
	return { button, label, render };
}
