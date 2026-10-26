/**
 * The Chaos tab (PR C): algorithmic effects that run without AI.
 *
 *   tools    a compact radio row of the registered tools (Slash cut, Glitch bands, Warp,
 *            Grid snap, Pixel Life); arrows move and choose
 *   tool     the chosen tool's block (its mount()): preview strip of the target glyphs,
 *            its knobs (Chaos, Seed, its own params, Break rules in Wild mode), results
 *   footer   Target chip · Re-roll · Apply
 *
 * Preview runs the engine on the font's glyphs (debounced, nothing written). Apply lands each
 * glyph as a Draft through apply_chaos + submit_glyph: one undo step per glyph. Results get
 * Keep / Re-roll / Undo per glyph, and Keep all / Undo all.
 */
import { getModeSettings, getTarget, onControlsChange } from '../../agent-controls.js';
import { CHAOS_OPS, defaultParams } from '../../chaos/engine.js';
import { randomSeed } from '../../chaos/rng.js';
import { charOf, keepGlyphs, revertGlyphs } from '../../run/review.js';
import { createTargetChip } from '../agent-composer-chips.js';
import { cardButton, el, icon, srOnly } from '../cards/card-shell.js';
import { makeGlyphSVG } from '../cards/glyph-art.js';
import { listChaosTools, registerChaosTool } from '../agent-panel-tabs.js';
import { PREVIEW_LIMIT, applyChaos, fontNote, previewChaos } from './chaos-runner.js';
import './chaos-tab.css';

const PREVIEW_DEBOUNCE = 250;
const PREVIEW_HEIGHT = 96;
const RESULT_HEIGHT = 32;

let uid = 0;
const nextId = (prefix) => `${prefix}-${++uid}`;

/**
 * Per-tool knobs, kept while the panel lives (switching tools keeps each tool's settings).
 * @type {Map<String, {params: Object, seed: Number, chaos: Number, breakRules: Boolean}>}
 */
const settingsByTool = new Map();

function settingsFor(op) {
	if (!settingsByTool.has(op.id))
		settingsByTool.set(op.id, {
			params: defaultParams(op),
			seed: randomSeed(),
			chaos: 50,
			breakRules: false,
		});
	return settingsByTool.get(op.id);
}

/** Test helper. */
export function resetChaosTabForTests() {
	settingsByTool.clear();
}

/** Registers the five tools with the panel's Chaos tab (once; safe to call again). */
export function registerChaosTools() {
	const present = new Set(listChaosTools().map((tool) => tool.id));
	for (const op of CHAOS_OPS.filter((item) => !present.has(item.id)))
		registerChaosTool({
			id: op.id,
			label: op.label,
			icon: op.icon,
			mount: (container, context) => mountChaosTool(container, op, context),
		});
}

// ---- Small controls ----

function sliderRow({ label, min, max, step = 1, value, unit = '', onInput }) {
	const id = nextId('chaos-knob');
	const row = el('div', 'chaos-knob');
	const head = el('div', 'chaos-knob__head');
	const name = /** @type {HTMLLabelElement} */ (el('label', 'chaos-knob__label text-label', label));
	name.htmlFor = id;
	const output = el('output', 'chaos-knob__value text-mono-small');
	output.setAttribute('for', id);
	head.append(name, output);
	const input = /** @type {HTMLInputElement} */ (el('input', 'chaos-knob__slider'));
	input.type = 'range';
	input.id = id;
	input.min = String(min);
	input.max = String(max);
	input.step = String(step);
	const show = (v) => {
		input.value = String(v);
		output.textContent = unit === '% em' ? `${v}% em` : `${v}${unit}`;
		input.setAttribute('aria-valuetext', output.textContent);
	};
	show(value);
	input.addEventListener('input', () => {
		show(Number(input.value));
		onInput(Number(input.value));
	});
	row.append(head, input);
	return { root: row, input, set: show };
}

function switchRow({ label, checked, onChange }) {
	const row = el('div', 'chaos-knob chaos-knob--inline');
	const button = /** @type {HTMLButtonElement} */ (el('button', 'chaos-switch'));
	button.type = 'button';
	button.setAttribute('role', 'switch');
	const id = nextId('chaos-switch');
	const name = el('span', 'chaos-knob__label text-label', label);
	name.id = id;
	button.setAttribute('aria-labelledby', id);
	button.append(el('span', 'chaos-switch__thumb'));
	const set = (on) => button.setAttribute('aria-checked', String(on));
	set(checked);
	button.addEventListener('click', () => {
		const on = button.getAttribute('aria-checked') !== 'true';
		set(on);
		onChange(on);
	});
	row.append(name, button);
	return { root: row, button, set };
}

/** A segmented radio group (roving focus, arrows choose). */
function segmentedRow({ label, options, value, onChange }) {
	const row = el('div', 'chaos-knob');
	const id = nextId('chaos-seg');
	const name = el('span', 'chaos-knob__label text-label', label);
	name.id = id;
	const group = el('div', 'chaos-segmented');
	group.setAttribute('role', 'radiogroup');
	group.setAttribute('aria-labelledby', id);
	const buttons = options.map((option) => {
		const button = /** @type {HTMLButtonElement} */ (
			el('button', 'chaos-segmented__option text-label', option.label)
		);
		button.type = 'button';
		button.setAttribute('role', 'radio');
		button.dataset.value = option.value;
		button.addEventListener('click', () => choose(option.value));
		return button;
	});
	group.append(...buttons);
	function choose(next, focus = false) {
		for (const button of buttons) {
			const on = button.dataset.value === next;
			button.setAttribute('aria-checked', String(on));
			button.tabIndex = on ? 0 : -1;
			if (on && focus) button.focus();
		}
		if (next !== value) {
			value = next;
			onChange(next);
		}
	}
	group.addEventListener('keydown', (event) => {
		const at = buttons.indexOf(/** @type {any} */ (document.activeElement));
		if (at < 0) return;
		const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
		if (!step) return;
		event.preventDefault();
		event.stopPropagation();
		choose(buttons[(at + step + buttons.length) % buttons.length].dataset.value, true);
	});
	choose(value);
	row.append(name, group);
	return { root: row };
}

function glyphArt(project, glyph, height, char) {
	const cell = el('span', 'chaos-art');
	cell.setAttribute('data-font-content', '');
	cell.style.height = `${height}px`;
	if (glyph?.shapes?.length) cell.append(makeGlyphSVG(project, glyph, height));
	else {
		const ghost = el('span', 'chaos-art__ghost');
		ghost.style.height = `${Math.round(height * 0.6)}px`;
		ghost.style.width = `${Math.round(height * 0.4)}px`;
		cell.append(ghost);
	}
	cell.setAttribute('aria-hidden', 'true');
	cell.dataset.char = char;
	return cell;
}

// ---- One tool ----

/**
 * Draws one tool into its block. Returns dispose.
 * @param {HTMLElement} container
 * @param {Object} op - an engine op
 * @param {{getEditor: () => any, shared?: {chaosDrafts: Set<String>}}} context
 */
export function mountChaosTool(container, op, { getEditor, shared = { chaosDrafts: new Set() } }) {
	const settings = settingsFor(op);
	const chaosDrafts = shared.chaosDrafts;
	let previewToken = 0;
	let timer;
	/** @type {AbortController | null} */
	let running = null;
	/** @type {Array<Object>} */
	let lastResults = [];
	container.classList.add('chaos-tool');

	const scroll = el('div', 'chaos-tool__scroll');
	const hint = el('p', 'chaos-tool__hint text-body-small', op.hint);

	// Preview strip
	const preview = el('div', 'chaos-preview');
	preview.setAttribute('role', 'group');
	preview.setAttribute('aria-label', `${op.label} preview`);
	const strip = el('div', 'chaos-preview__strip');
	const note = el('p', 'chaos-preview__note text-body-small');
	note.setAttribute('aria-live', 'polite');
	preview.append(strip, note);

	// Knobs
	const knobs = el('div', 'chaos-knobs');
	const chaosKnob = sliderRow({
		label: 'Chaos',
		min: 0,
		max: 100,
		step: 5,
		value: settings.chaos,
		onInput: (value) => {
			settings.chaos = value;
			schedulePreview();
		},
	});
	knobs.append(chaosKnob.root);
	for (const param of op.params) {
		if (param.type === 'int' || param.type === 'number') {
			knobs.append(
				sliderRow({
					label: param.label,
					min: param.min,
					max: param.max,
					step: param.step ?? 1,
					unit: param.unit || '',
					value: settings.params[param.key],
					onInput: (value) => {
						settings.params[param.key] = value;
						schedulePreview();
					},
				}).root
			);
		} else if (param.type === 'enum') {
			knobs.append(
				segmentedRow({
					label: param.label,
					options: param.options,
					value: settings.params[param.key],
					onChange: (value) => {
						settings.params[param.key] = value;
						schedulePreview();
					},
				}).root
			);
		} else if (param.type === 'boolean') {
			knobs.append(
				switchRow({
					label: param.label,
					checked: settings.params[param.key],
					onChange: (value) => {
						settings.params[param.key] = value;
						schedulePreview();
					},
				}).root
			);
		}
	}
	// Seed: type one to get a take back; Re-roll (footer) deals a new one.
	const seedRow = el('div', 'chaos-knob chaos-knob--inline');
	const seedId = nextId('chaos-seed');
	const seedLabel = /** @type {HTMLLabelElement} */ (
		el('label', 'chaos-knob__label text-label', 'Seed')
	);
	seedLabel.htmlFor = seedId;
	const seedInput = /** @type {HTMLInputElement} */ (el('input', 'chaos-seed text-mono-small'));
	seedInput.id = seedId;
	seedInput.type = 'text';
	seedInput.inputMode = 'numeric';
	seedInput.autocomplete = 'off';
	seedInput.spellcheck = false;
	seedInput.value = String(settings.seed);
	seedInput.addEventListener('input', () => {
		const digits = seedInput.value.replace(/\D/g, '').slice(0, 9);
		if (digits !== seedInput.value) seedInput.value = digits;
		if (!digits) return;
		settings.seed = Number(digits);
		schedulePreview();
	});
	seedRow.append(seedLabel, seedInput);
	knobs.append(seedRow);
	const breakRules = switchRow({
		label: 'Break rules',
		checked: settings.breakRules,
		onChange: (value) => {
			settings.breakRules = value;
			schedulePreview();
		},
	});
	breakRules.root.classList.add('chaos-knob--wild');
	knobs.append(breakRules.root);

	// Results
	const results = el('div', 'chaos-results');
	results.hidden = true;

	scroll.append(hint, preview, knobs, results);

	// Footer
	const footer = el('div', 'chaos-actions');
	const target = createTargetChip({ getEditor });
	const reroll = cardButton({
		label: 'Re-roll',
		action: 'reroll',
		iconName: 'casino',
		variant: 'secondary',
	});
	reroll.setAttribute('aria-label', 'Re-roll: new seed');
	const apply = cardButton({ label: 'Apply', action: 'apply', variant: 'primary' });
	footer.append(target.button, el('span', 'chaos-actions__spacer'), reroll, apply);
	container.append(scroll, footer, target.popover.root);

	const wild = () => getModeSettings(getEditor()).mode === 'wild';
	const ruleBreaking = () => wild() && settings.breakRules;

	function targetIds() {
		try {
			return getTarget(getEditor()).glyphIds;
		} catch {
			return [];
		}
	}

	function schedulePreview() {
		clearTimeout(timer);
		timer = setTimeout(runPreview, PREVIEW_DEBOUNCE);
	}

	async function runPreview() {
		const editor = getEditor();
		const token = ++previewToken;
		breakRules.root.hidden = !wild();
		const ids = targetIds().filter((id) => editor?.project?.glyphs[id]?.shapes?.length);
		const blocked = editor?.project ? fontNote(editor, op.id, ids) : 'Open a font first.';
		apply.disabled = Boolean(blocked) || !ids.length || Boolean(running);
		reroll.disabled = Boolean(blocked) || Boolean(running);
		if (blocked) {
			strip.replaceChildren();
			note.textContent = blocked;
			preview.dataset.state = 'blocked';
			return;
		}
		if (!ids.length) {
			strip.replaceChildren();
			note.textContent = 'The target has no drawn glyphs yet.';
			preview.dataset.state = 'empty';
			return;
		}
		preview.dataset.state = 'working';
		preview.setAttribute('aria-busy', 'true');
		// Placeholders first, so the strip keeps its size while takes come in.
		const cells = ids.slice(0, PREVIEW_LIMIT).map((id) => {
			const cell = el('figure', 'chaos-preview__cell');
			cell.dataset.state = 'working';
			cell.append(
				glyphArt(editor.project, editor.project.glyphs[id], PREVIEW_HEIGHT, charOf(id)),
				el('figcaption', 'chaos-preview__char text-label', charOf(id))
			);
			return cell;
		});
		strip.replaceChildren(...cells);
		note.textContent = 'Previewing…';
		let failed = 0;
		const items = await previewChaos(editor, {
			op: op.id,
			ids,
			seed: settings.seed,
			chaos: settings.chaos,
			params: settings.params,
			breakRules: ruleBreaking(),
			chaosDrafts,
			isStale: () => token !== previewToken,
			onGlyph: (item, index) => {
				const cell = cells[index];
				const ok = item.result?.ok;
				if (item.result && !ok) failed++;
				cell.dataset.state = ok ? 'ok' : item.result ? 'failed' : 'empty';
				cell.replaceChildren(
					glyphArt(editor.project, item.glyph, PREVIEW_HEIGHT, charOf(item.id)),
					el('figcaption', 'chaos-preview__char text-label', charOf(item.id))
				);
				if (item.result && !ok) {
					cell.title = item.result.error.message;
					cell.append(srOnly(`${charOf(item.id)}: ${item.result.error.message}`));
				} else if (item.result?.rerolled) {
					cell.title = `Guard re-rolled to seed ${item.result.seed}, chaos ${item.result.chaos}`;
				} else cell.removeAttribute('title');
			},
		});
		if (!items || token !== previewToken) return;
		preview.dataset.state = 'done';
		preview.removeAttribute('aria-busy');
		const more = ids.length - items.length;
		const parts = [];
		if (more > 0) parts.push(`+${more} more on Apply`);
		if (failed) parts.push(`${failed} failed the guard, try a lower chaos`);
		if (ruleBreaking()) parts.push('Rules off');
		note.textContent = parts.join(' · ');
	}

	// ---- Apply, results ----

	async function runApply(ids, { seed = settings.seed, scope } = {}) {
		const editor = getEditor();
		if (!editor?.project || running) return;
		running = new AbortController();
		apply.querySelector('.agent-card__button-label').textContent = 'Stop';
		apply.setAttribute('aria-label', 'Stop applying');
		reroll.disabled = true;
		results.hidden = false;
		const status =
			results.querySelector('.chaos-results__status') ||
			el('p', 'chaos-results__status text-body-small');
		status.setAttribute('aria-live', 'polite');
		if (!status.isConnected) results.prepend(status);
		status.textContent = `Applying 0 of ${ids.length}…`;
		let outcome = [];
		try {
			outcome = await applyChaos(getEditor, {
				op: op.id,
				ids,
				scope: scope ?? getTarget(editor).scope,
				seed,
				chaos: settings.chaos,
				params: { ...settings.params },
				breakRules: ruleBreaking(),
				chaosDrafts,
				signal: running.signal,
				onProgress: (done, total) => (status.textContent = `Applying ${done} of ${total}…`),
			});
		} finally {
			running = null;
			apply.querySelector('.agent-card__button-label').textContent = 'Apply';
			apply.removeAttribute('aria-label');
		}
		// Merge: a re-roll of one glyph replaces its row.
		const byId = new Map(lastResults.map((row) => [row.id, row]));
		for (const row of outcome) byId.set(row.id, row);
		lastResults = scope === 'reroll' ? [...byId.values()] : outcome;
		renderResults();
		runPreview();
	}

	function statusText(row, store) {
		if (!row.ok) return row.skipped ? `Skipped · ${skipReason(row.error)}` : 'Failed the guard';
		const status = store?.getStatus(row.id);
		if (status === 'kept') return 'Kept';
		if (status !== 'draft') return 'Undone';
		return `seed ${row.seed}`;
	}

	function statusTitle(row) {
		if (!row.ok) return row.error?.message || '';
		return row.rerolled
			? `Draft. The guard re-rolled it to seed ${row.seed}, chaos ${row.chaos}.`
			: `Draft, seed ${row.seed}, chaos ${row.chaos}`;
	}

	function renderResults() {
		const editor = getEditor();
		const store = editor?.glyphStatus;
		const status = el('p', 'chaos-results__status text-body-small');
		status.setAttribute('aria-live', 'polite');
		const landed = lastResults.filter((row) => row.ok).length;
		const handDrawn = lastResults.filter((row) => row.error?.code === 'LOCKED_YOURS').length;
		status.textContent = `${landed} of ${lastResults.length} landed as Drafts${
			handDrawn ? ` · skipped ${handDrawn} hand-drawn glyph${handDrawn === 1 ? '' : 's'}` : ''
		}`;
		const drafts = lastResults.filter((row) => row.ok && store?.getStatus(row.id) === 'draft');
		const head = el('div', 'chaos-results__head');
		const keepAll = cardButton({ label: 'Keep all', action: 'keep-all', variant: 'secondary' });
		const undoAll = cardButton({ label: 'Undo all', action: 'undo-all', variant: 'ghost' });
		keepAll.disabled = !drafts.length;
		undoAll.disabled = !drafts.length;
		keepAll.addEventListener('click', () => {
			keepGlyphs(
				getEditor(),
				drafts.map((row) => row.id)
			);
			renderResults();
		});
		undoAll.addEventListener('click', () => {
			revertGlyphs(
				getEditor(),
				drafts.map((row) => row.id)
			);
			drafts.forEach((row) => chaosDrafts.delete(row.id));
			renderResults();
			runPreview();
		});
		head.append(status, keepAll, undoAll);
		const list = el('ul', 'chaos-results__list');
		list.setAttribute('aria-label', 'Applied glyphs');
		for (const row of lastResults) {
			const item = el('li', 'chaos-result');
			item.dataset.state = row.ok
				? store?.getStatus(row.id) || 'draft'
				: row.skipped
				? 'skipped'
				: 'failed';
			const char = charOf(row.id);
			item.append(
				glyphArt(editor.project, editor.project.glyphs[row.id], RESULT_HEIGHT, char),
				el('span', 'chaos-result__char text-label', char)
			);
			const text = el('span', 'chaos-result__status text-mono-small', statusText(row, store));
			text.title = statusTitle(row);
			item.append(text);
			const isDraft = row.ok && store?.getStatus(row.id) === 'draft';
			const actions = el('span', 'chaos-result__actions');
			const keep = cardButton({ label: 'Keep', action: 'keep', variant: 'ghost' });
			const again = cardButton({ label: 'Re-roll', action: 'reroll-one', variant: 'ghost' });
			const undo = cardButton({ label: 'Undo', action: 'undo', variant: 'ghost' });
			keep.setAttribute('aria-label', `Keep ${char}`);
			again.setAttribute('aria-label', `Re-roll ${char}`);
			undo.setAttribute('aria-label', `Undo ${char}`);
			keep.disabled = !isDraft;
			undo.disabled = !isDraft;
			again.disabled = !(isDraft || (!row.ok && !row.skipped));
			keep.addEventListener('click', () => {
				keepGlyphs(getEditor(), [row.id]);
				renderResults();
			});
			undo.addEventListener('click', () => {
				revertGlyphs(getEditor(), [row.id]);
				chaosDrafts.delete(row.id);
				renderResults();
				runPreview();
			});
			again.addEventListener('click', () =>
				runApply([row.id], { seed: randomSeed(), scope: 'reroll' })
			);
			actions.append(keep, again, undo);
			item.append(actions);
			list.append(item);
		}
		results.replaceChildren(head, list);
		results.hidden = !lastResults.length;
	}

	apply.addEventListener('click', () => {
		if (running) {
			running.abort();
			return;
		}
		runApply(targetIds());
	});
	reroll.addEventListener('click', () => {
		settings.seed = randomSeed();
		seedInput.value = String(settings.seed);
		runPreview();
	});

	const offControls = onControlsChange(() => {
		target.render();
		schedulePreview();
	});
	runPreview();

	return () => {
		clearTimeout(timer);
		previewToken++;
		running?.abort();
		offControls();
		target.dispose();
		target.popover.close({ restoreFocus: false });
	};
}

function skipReason(error = {}) {
	if (error.code === 'LOCKED_YOURS') return 'hand-drawn';
	if (error.code === 'LOCKED_OPEN') return 'open in the editor';
	if (error.code === 'EMPTY_GLYPH') return 'nothing drawn';
	if (error.code === 'DEPENDENT_GLYPHS') return 'used by other glyphs';
	return error.message || 'skipped';
}

// ---- The tab: tool list + the chosen tool ----

/**
 * @param {{getEditor: () => any}} options
 * @returns {{root: HTMLElement, render: (tools: Array<Object>) => void, dispose: () => void,
 *   select: (id: String) => void, readonly current: String}}
 */
export function createChaosTab({ getEditor }) {
	const root = el('div', 'chaos-tab');
	const tools = el('div', 'chaos-tab__tools');
	tools.setAttribute('role', 'radiogroup');
	tools.setAttribute('aria-label', 'Chaos tools');
	const body = el('section', 'chaos-tab__tool agent-chaos-tool');
	root.append(tools, body);
	const shared = { chaosDrafts: new Set() };
	let list = [];
	let current = '';
	let dispose = null;
	/** @type {Array<HTMLButtonElement>} */
	let buttons = [];

	tools.addEventListener('keydown', (event) => {
		const at = buttons.indexOf(/** @type {any} */ (document.activeElement));
		if (at < 0) return;
		let next = -1;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (at + 1) % buttons.length;
		else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
			next = (at - 1 + buttons.length) % buttons.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = buttons.length - 1;
		if (next < 0) return;
		event.preventDefault();
		event.stopPropagation();
		select(buttons[next].dataset.tool, { focus: true });
	});

	function mountCurrent() {
		dispose?.();
		dispose = null;
		body.replaceChildren();
		body.className = 'chaos-tab__tool agent-chaos-tool';
		const tool = list.find((item) => item.id === current);
		if (!tool) return;
		body.dataset.tool = tool.id;
		body.setAttribute('aria-label', tool.label);
		try {
			const result = tool.mount(body, { getEditor, shared });
			if (typeof result === 'function') dispose = result;
		} catch {
			body.replaceChildren(
				el('p', 'chaos-tool__hint text-body-small', 'This tool could not load.')
			);
		}
	}

	function select(id, { focus = false } = {}) {
		if (!list.some((tool) => tool.id === id)) return;
		const changed = id !== current;
		current = id;
		for (const button of buttons) {
			const on = button.dataset.tool === id;
			button.setAttribute('aria-checked', String(on));
			button.tabIndex = on ? 0 : -1;
			if (on && focus) button.focus();
		}
		if (changed) mountCurrent();
	}

	function render(next) {
		list = next;
		buttons = list.map((tool) => {
			const button = /** @type {HTMLButtonElement} */ (el('button', 'chaos-tab__pick text-label'));
			button.type = 'button';
			button.setAttribute('role', 'radio');
			button.dataset.tool = tool.id;
			if (tool.icon) button.append(icon(tool.icon, 'chaos-tab__pick-icon'));
			button.append(el('span', 'chaos-tab__pick-label', tool.label));
			button.addEventListener('click', () => select(tool.id));
			return button;
		});
		tools.replaceChildren(...buttons);
		const keep = list.some((tool) => tool.id === current) ? current : list[0]?.id || '';
		current = '';
		if (keep) select(keep);
		else mountCurrent();
	}

	return {
		root,
		render,
		select,
		get current() {
			return current;
		},
		dispose() {
			dispose?.();
			dispose = null;
		},
	};
}
