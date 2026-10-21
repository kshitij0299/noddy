import { getCurrentProject, getCurrentProjectEditor } from '../../app/main.js';
import { charToHex } from '../../common/character_ids.js';
import { makeElement } from '../../common/dom.js';
import { subscribeToItemChanged } from '../../project_editor/item_changed.js';

// --------------------------------------------------------------
// Specimen card — the hero of the Workspace page
// --------------------------------------------------------------
/*
	<specimen-card> renders a sample string from the PROJECT's glyph
	outlines (SVG path data from Glyph.svgPathData), never from a UI font.
	Missing glyphs are drawn as dashed "ghost" boxes whose height follows
	the letter's class (cap / x-height / descender) and whose width is a
	plausible 0.55 em.

	Light DOM: the chrome (mode pill, size slider) uses the global Noddy
	tokens and text roles; the glyph surface is an inline <svg> that
	carries `data-font-content` so no UI typography ever reaches it.

	Modes:
		text      — the sample text (default "Hamburg")
		spacing   — a spacing string built from the sample ("nnannoaoo")
		waterfall — the sample at several sizes, stacked

	Redraws: subscribes to `itemChanged { id }` through the per-frame
	coalesced helper, so one burst of edits costs one redraw.
*/

export const SPECIMEN_MODES = Object.freeze([
	{ id: 'text', label: 'Text', icon: 'text_fields' },
	{ id: 'spacing', label: 'Spacing', icon: 'view_week' },
	{ id: 'waterfall', label: 'Waterfall', icon: 'format_size' },
]);

export const SPECIMEN_SIZE = Object.freeze({ min: 96, max: 240, step: 8, default: 160 });
export const SPECIMEN_DEFAULT_TEXT = 'Hamburg';
/** Ghost width as a fraction of the em (flow-02). */
export const GHOST_WIDTH_EM = 0.55;
/** Side bearing on each side of a ghost box, as a fraction of the em. */
export const GHOST_BEARING_EM = 0.04;
/** Sizes used by the Waterfall mode, as fractions of the slider size. */
export const WATERFALL_STEPS = Object.freeze([1, 0.72, 0.5, 0.34]);
/** Gap (px) between waterfall rows. */
const WATERFALL_GAP = 8;

const DESCENDERS = new Set(['g', 'j', 'p', 'q', 'y']);
const ASCENDERS = new Set(['b', 'd', 'f', 'h', 'k', 'l', 't']);

/**
 * Reads the vertical metrics a ghost box needs from a project.
 * @param {Object} project - GlyphrStudioProject
 * @returns {{upm: Number, ascent: Number, descent: Number, capHeight: Number, xHeight: Number}}
 */
export function getSpecimenMetrics(project) {
	const font = project?.settings?.font || {};
	const upm = parseInt(font.upm) || 2048;
	return {
		upm,
		ascent: parseInt(font.ascent) || Math.round(upm * 0.75),
		descent: -Math.abs(parseInt(font.descent) || Math.round(upm * 0.22)),
		capHeight: parseInt(font.capHeight) || Math.round(upm * 0.72),
		xHeight: parseInt(font.xHeight) || Math.round(upm * 0.54),
	};
}

/**
 * Classifies a character into a ghost box (font units, y up, baseline 0).
 * - uppercase, figures and ascending lowercase: baseline → cap height
 * - other lowercase and everything else: baseline → x-height
 * - descending lowercase (g j p q y): descent → x-height
 * @param {String} char - single character
 * @param {Object} metrics - from getSpecimenMetrics
 * @returns {{kind: String, yMin: Number, yMax: Number, width: Number}}
 */
export function ghostBoxForChar(char, metrics) {
	const width = Math.round(metrics.upm * GHOST_WIDTH_EM);
	if (DESCENDERS.has(char)) {
		return { kind: 'descender', yMin: metrics.descent, yMax: metrics.xHeight, width };
	}
	if (/\p{Lu}/u.test(char) || /\p{Nd}/u.test(char) || ASCENDERS.has(char)) {
		return { kind: 'cap', yMin: 0, yMax: metrics.capHeight, width };
	}
	return { kind: 'x', yMin: 0, yMax: metrics.xHeight, width };
}

/**
 * Builds the spacing string for a sample: the first letter of the sample
 * between n/o (lowercase) or H/O (uppercase) control characters.
 * @param {String} sample - sample text
 * @returns {String}
 */
export function makeSpacingString(sample = SPECIMEN_DEFAULT_TEXT) {
	const letter = [...sample].find((c) => /\p{L}/u.test(c)) || 'a';
	const upper = /\p{Lu}/u.test(letter);
	const [a, b] = upper ? ['H', 'O'] : ['n', 'o'];
	return `${a}${a}${letter}${a}${a}${b}${letter}${b}${b}`;
}

/**
 * Lays out one line of text in font units. Each item is either a glyph
 * (has outline data) or a ghost. Whitespace only advances.
 * @param {String} text - characters to lay out
 * @param {Object} project - GlyphrStudioProject
 * @param {Object} [options]
 * @param {Set<String>} [options.drafting] - item IDs currently being drafted
 * @returns {{items: Array, width: Number, metrics: Object}}
 */
export function layoutSpecimenLine(text, project, { drafting } = {}) {
	const metrics = getSpecimenMetrics(project);
	const items = [];
	let x = 0;
	for (const char of [...text]) {
		const hex = charToHex(char);
		const id = hex ? `glyph-${hex}` : false;
		const glyph = id ? project.getItem(id) : false;
		const isDrafting = !!(id && drafting?.has(id));

		if (/\s/u.test(char)) {
			const advance = glyph?.advanceWidth || Math.round(metrics.upm * 0.25);
			items.push({ type: 'space', char, id, x, advance });
			x += advance;
			continue;
		}

		if (glyph && glyph.shapes.length > 0 && !isDrafting) {
			const advance = glyph.advanceWidth || project.defaultAdvanceWidth;
			items.push({ type: 'glyph', char, id, x, advance, pathData: glyph.svgPathData, glyph });
			x += advance;
			continue;
		}

		const box = ghostBoxForChar(char, metrics);
		// A ghost advances its box plus a side bearing on each side, unless the
		// (empty) glyph already has a width of its own.
		const advance = glyph?.advanceWidth || box.width + 2 * Math.round(metrics.upm * GHOST_BEARING_EM);
		const offset = Math.max(0, Math.round((advance - box.width) / 2));
		items.push({
			type: isDrafting ? 'drafting' : 'ghost',
			char,
			id,
			x,
			advance,
			box: { ...box, x: x + offset },
		});
		x += advance;
	}
	return { items, width: x, metrics };
}

/**
 * @param {String} value - text for an attribute
 * @returns {String}
 */
function escapeAttr(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

export class SpecimenCard extends HTMLElement {
	static get observedAttributes() {
		return ['text', 'mode', 'size'];
	}

	constructor() {
		super();
		this._mode = 'text';
		this._size = SPECIMEN_SIZE.default;
		this._text = SPECIMEN_DEFAULT_TEXT;
		this._drafting = new Set();
		this._unsubscribe = false;
		this._resizeObserver = false;
		this._built = false;
		/**
		 * Hook for [M3] focus mode: called with the glyph's item ID when a
		 * rendered letter is activated. Replace once focus mode lands.
		 * @type {Function}
		 */
		this.onOpenLetter = () => {};
	}

	// ---------------------------------------------------------------
	// Public state
	// ---------------------------------------------------------------

	get mode() {
		return this._mode;
	}

	set mode(value) {
		if (!SPECIMEN_MODES.some((m) => m.id === value)) return;
		if (this._mode === value) return;
		this._mode = value;
		this.updateModePill();
		this.redraw();
	}

	get size() {
		return this._size;
	}

	set size(value) {
		let next = Math.round(Number(value));
		if (Number.isNaN(next)) return;
		next = Math.min(SPECIMEN_SIZE.max, Math.max(SPECIMEN_SIZE.min, next));
		if (next === this._size) return;
		this._size = next;
		this.updateSizeControl();
		this.redraw();
	}

	get text() {
		return this._text;
	}

	set text(value) {
		const next = String(value ?? '').length ? String(value) : SPECIMEN_DEFAULT_TEXT;
		if (next === this._text) return;
		this._text = next;
		this.redraw();
	}

	/**
	 * Item IDs that are currently being drafted (solid peach box + ring).
	 * @param {Iterable<String>} ids
	 */
	setDrafting(ids = []) {
		this._drafting = new Set(ids);
		this.redraw();
	}

	/**
	 * The text rendered in the current mode.
	 * @returns {String}
	 */
	get sampleForMode() {
		return this._mode === 'spacing' ? makeSpacingString(this._text) : this._text;
	}

	// ---------------------------------------------------------------
	// Lifecycle
	// ---------------------------------------------------------------

	attributeChangedCallback(name, oldValue, newValue) {
		if (oldValue === newValue) return;
		if (name === 'text') this.text = newValue;
		if (name === 'mode') this.mode = newValue;
		if (name === 'size') this.size = newValue;
	}

	connectedCallback() {
		if (!this._built) this.build();
		this.redraw();
		this.subscribe();
		if (typeof ResizeObserver === 'function' && !this._resizeObserver) {
			this._resizeObserver = new ResizeObserver(() => this.fit());
			this._resizeObserver.observe(this);
		}
	}

	disconnectedCallback() {
		if (this._unsubscribe) this._unsubscribe();
		this._unsubscribe = false;
		if (this._resizeObserver) this._resizeObserver.disconnect();
		this._resizeObserver = false;
	}

	subscribe() {
		if (this._unsubscribe) return;
		let editor;
		try {
			editor = getCurrentProjectEditor();
		} catch {
			editor = false;
		}
		if (!editor?.subscribe) return;
		this._unsubscribe = subscribeToItemChanged(editor, {
			subscriberID: 'specimen-card',
			callback: () => this.redraw(),
		});
	}

	build() {
		this._built = true;
		this.classList.add('specimen-card');
		this.innerHTML = '';

		// Mode pill (radio group, icons only, accessible labels)
		this.pill = makeElement({
			tag: 'div',
			className: 'specimen__mode-pill',
			attributes: { role: 'radiogroup', 'aria-label': 'Mode' },
		});
		SPECIMEN_MODES.forEach((m) => {
			const button = makeElement({
				tag: 'button',
				className: 'specimen__mode',
				attributes: {
					type: 'button',
					role: 'radio',
					'aria-label': m.label,
					title: m.label,
					'data-mode': m.id,
				},
				innerHTML: `<span class="material-symbols-rounded" aria-hidden="true">${m.icon}</span>`,
			});
			button.addEventListener('click', () => {
				this.mode = m.id;
				button.focus();
			});
			button.addEventListener('keydown', (event) => this.handlePillKey(event, m.id));
			this.pill.appendChild(button);
		});

		// Size slider
		this.sizeBox = makeElement({ tag: 'label', className: 'specimen__size' });
		this.slider = makeElement({
			tag: 'input',
			className: 'specimen__size-slider',
			attributes: {
				type: 'range',
				min: SPECIMEN_SIZE.min,
				max: SPECIMEN_SIZE.max,
				step: SPECIMEN_SIZE.step,
				value: this._size,
				'aria-label': 'Size',
			},
		});
		this.slider.addEventListener('input', () => {
			this.size = /** @type {HTMLInputElement} */ (this.slider).value;
		});
		this.sizeValue = makeElement({
			tag: 'output',
			className: 'specimen__size-value text-mono-small',
			attributes: { 'aria-live': 'off' },
			innerHTML: String(this._size),
		});
		this.sizeBox.appendChild(this.slider);
		this.sizeBox.appendChild(this.sizeValue);

		// Glyph surface
		this.stage = makeElement({
			tag: 'div',
			className: 'specimen__stage',
			attributes: { 'data-font-content': '' },
		});

		this.appendChild(this.pill);
		this.appendChild(this.sizeBox);
		this.appendChild(this.stage);
		this.updateModePill();
	}

	/**
	 * Arrow keys move between (and select) modes; Space / Enter select.
	 * @param {KeyboardEvent} event
	 * @param {String} modeID
	 */
	handlePillKey(event, modeID) {
		const index = SPECIMEN_MODES.findIndex((m) => m.id === modeID);
		let next = -1;
		if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			next = (index + 1) % SPECIMEN_MODES.length;
		} else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			next = (index - 1 + SPECIMEN_MODES.length) % SPECIMEN_MODES.length;
		} else if (event.key === ' ' || event.key === 'Enter') {
			next = index;
		}
		if (next < 0) return;
		event.preventDefault();
		this.mode = SPECIMEN_MODES[next].id;
		this.pill.querySelectorAll('.specimen__mode')[next].focus();
	}

	updateModePill() {
		if (!this.pill) return;
		this.pill.querySelectorAll('.specimen__mode').forEach((button) => {
			const checked = button.getAttribute('data-mode') === this._mode;
			button.setAttribute('aria-checked', checked ? 'true' : 'false');
			button.setAttribute('tabindex', checked ? '0' : '-1');
		});
	}

	updateSizeControl() {
		if (!this.slider) return;
		/** @type {HTMLInputElement} */ (this.slider).value = String(this._size);
		this.sizeValue.innerHTML = String(this._size);
	}

	// ---------------------------------------------------------------
	// Drawing
	// ---------------------------------------------------------------

	/**
	 * Re-reads the project and rebuilds the SVG rows. Keeps the previous
	 * frame when there is no project to draw from.
	 */
	redraw() {
		if (!this._built || !this.stage) return;
		let project;
		try {
			project = getCurrentProject();
		} catch {
			project = false;
		}
		if (!project) return;

		const sample = this.sampleForMode;
		const steps = this._mode === 'waterfall' ? WATERFALL_STEPS : [1];
		const rows = steps.map((step) => {
			const line = layoutSpecimenLine(sample, project, { drafting: this._drafting });
			return { line, size: this._size * step };
		});

		this.stage.innerHTML = '';
		this.stage.setAttribute('data-mode', this._mode);
		this._rows = rows.map((row) => {
			const svg = this.makeRowSVG(row.line);
			svg.setAttribute('data-row-size', String(row.size));
			this.stage.appendChild(svg);
			return { ...row, svg };
		});
		this.fit();
	}

	/**
	 * Builds one SVG row. Coordinates are font units; the inner group flips
	 * y so path data from the project can be used unchanged.
	 * @param {{items: Array, width: Number, metrics: Object}} line
	 * @returns {SVGElement}
	 */
	makeRowSVG(line) {
		const { items, width, metrics } = line;
		const totalVertical = metrics.ascent - metrics.descent;
		const parts = items.map((item) => {
			if (item.type === 'space') return '';
			const label = escapeAttr(item.char);
			if (item.type === 'glyph') {
				return `
				<g class="specimen__letter" data-item-id="${escapeAttr(item.id)}" role="button" tabindex="0" aria-label="${label}">
					<rect class="specimen__hit" x="${item.x}" y="${metrics.descent}" width="${item.advance}" height="${totalVertical}" rx="${metrics.upm * 0.04}" />
					<path class="specimen__ink" transform="translate(${item.x} 0)" d="${escapeAttr(item.pathData)}" />
				</g>`;
			}
			const b = item.box;
			const kind = item.type === 'drafting' ? 'drafting' : `ghost ghost--${b.kind}`;
			return `
				<g class="specimen__${item.type}" data-ghost-kind="${b.kind}" data-char="${label}" aria-hidden="true">
					<rect class="specimen__box specimen__box--${kind.split(' ')[0]}" x="${b.x}" y="${b.yMin}" width="${b.width}" height="${b.yMax - b.yMin}" />
					${item.type === 'drafting' ? `<circle class="specimen__ring" cx="${b.x + b.width / 2}" cy="${(b.yMin + b.yMax) / 2}" r="${metrics.upm * 0.05}" />` : ''}
				</g>`;
		});

		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('class', 'specimen__row');
		svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
		svg.setAttribute('viewBox', `0 ${-metrics.ascent} ${Math.max(width, 1)} ${totalVertical}`);
		svg.setAttribute('data-width-units', String(width));
		svg.setAttribute('data-height-units', String(totalVertical));
		svg.setAttribute('data-font-content', '');
		svg.setAttribute('focusable', 'false');
		svg.innerHTML = `<g class="specimen__line" transform="scale(1 -1)">${parts.join('')}</g>`;

		svg.querySelectorAll('.specimen__letter').forEach((letter) => {
			const open = () => this.onOpenLetter(letter.getAttribute('data-item-id'));
			letter.addEventListener('click', open);
			letter.addEventListener('keydown', (event) => {
				if (event.key === 'Enter' || event.key === ' ') {
					event.preventDefault();
					open();
				}
			});
		});
		return svg;
	}

	/**
	 * The box the sample may occupy: the stage minus its padding. Unknown
	 * (not laid out, e.g. jsdom) means unconstrained.
	 * @returns {{availableWidth: Number, availableHeight: Number}}
	 */
	availableBox() {
		if (!this.stage.clientWidth || !this.stage.clientHeight) {
			return { availableWidth: Infinity, availableHeight: Infinity };
		}
		const style = getComputedStyle(this.stage);
		const px = (value) => parseFloat(value) || 0;
		return {
			availableWidth: this.stage.clientWidth - px(style.paddingLeft) - px(style.paddingRight),
			availableHeight: this.stage.clientHeight - px(style.paddingTop) - px(style.paddingBottom),
		};
	}

	/**
	 * Sizes every row so the glyphs are `size` px per em, scaled down (never
	 * scrolled) when the text would be wider than the card or the rows
	 * taller than the stage.
	 */
	fit() {
		if (!this._rows || !this.stage) return;
		const { availableWidth, availableHeight } = this.availableBox();
		const rowGap = this._rows.length > 1 ? WATERFALL_GAP : 0;

		let scale = 1;
		let totalHeight = 0;
		this._rows.forEach((row) => {
			const { width, metrics } = row.line;
			const pxPerUnit = row.size / metrics.upm;
			if (width * pxPerUnit > availableWidth) {
				scale = Math.min(scale, availableWidth / (width * pxPerUnit));
			}
			totalHeight += (metrics.ascent - metrics.descent) * pxPerUnit;
		});
		totalHeight += rowGap * (this._rows.length - 1);
		if (totalHeight > availableHeight) scale = Math.min(scale, availableHeight / totalHeight);

		this._rows.forEach((row) => {
			const { width, metrics } = row.line;
			const pxPerUnit = (row.size / metrics.upm) * scale;
			row.svg.setAttribute('width', (Math.max(width, 1) * pxPerUnit).toFixed(2));
			row.svg.setAttribute('height', ((metrics.ascent - metrics.descent) * pxPerUnit).toFixed(2));
			// Ghost corners and the drafting ring are specified in screen px
			const unitsPerPx = pxPerUnit > 0 ? 1 / pxPerUnit : 0;
			row.svg.querySelectorAll('.specimen__box').forEach((box) => {
				box.setAttribute('rx', (4 * unitsPerPx).toFixed(2));
			});
			row.svg.querySelectorAll('.specimen__ring').forEach((ring) => {
				ring.setAttribute('r', (8 * unitsPerPx).toFixed(2));
			});
		});
		this.setAttribute('data-fit-scale', scale.toFixed(3));
	}
}
