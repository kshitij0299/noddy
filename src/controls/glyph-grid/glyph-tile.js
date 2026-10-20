import { makeElement } from '../../common/dom.js';
import { STATUS_LABELS, makeStatusMark, updateStatusMark } from './status-mark.js';

/**
 * GlyphTile (Figma Components 50:78, screens flow-02 / flow-05 / flow-07):
 * one Letters & figures tile. Light DOM so the Noddy tokens cascade.
 *
 * The tile is deliberately dumb: it holds a glyph ID and a label, and the
 * grid calls `render({ project, status })` whenever the glyph or its status
 * may have changed. It re-fetches the glyph BY ID from the project it is
 * given on every render and never keeps a glyph reference, because a
 * whole-project undo replaces the project object (ARCHITECTURE.md §6).
 *
 * Layout: fixed 84px height, art centred, Mono-small char label bottom-left,
 * status mark top-right. Hover is paint only; the selected ring is drawn
 * inset so it is never clipped at the grid edge.
 */

/** Height of the glyph art in CSS px (UX note: "glyph ~40px centred"). */
export const TILE_GLYPH_HEIGHT = 40;

/** Labels for characters that have no visible glyph of their own. */
const WHITESPACE_LABELS = {
	0x20: 'space',
	0xa0: 'nbsp',
	0x2007: 'figsp',
	0x202f: 'nnbsp',
};

export const FAILED_TOOLTIP = 'Failed · retry from the agent';

/**
 * Char label for a Latin Kernel entry.
 * @param {{char: String, codePoint: Number, hex: String}} entry
 * @returns {String}
 */
export function tileLabelFor(entry) {
	if (entry.char && entry.char.trim()) return entry.char;
	return WHITESPACE_LABELS[entry.codePoint] || entry.hex;
}

/**
 * Inline SVG of a glyph's outlines, scaled to `height` px and centred by the
 * grid's flex box. Rendered from project data only (never the UI font) and
 * marked `data-font-content` so global CSS stays away (Contract 2).
 * @param {Object} project - GlyphrStudioProject
 * @param {Object} glyph - Glyph with svgPathData
 * @param {Number} height - px
 * @returns {SVGElement}
 */
export function makeGlyphArt(project, glyph, height = TILE_GLYPH_HEIGHT) {
	const totalVertical = project.totalVertical || 1000;
	const ascent = parseInt(project.settings?.font?.ascent) || totalVertical;
	const advance = Math.max(glyph.advanceWidth || project.defaultAdvanceWidth || 500, 1);
	const width = Math.round((advance / totalVertical) * height * 100) / 100;

	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', `0 0 ${advance} ${totalVertical}`);
	svg.setAttribute('height', `${height}`);
	svg.setAttribute('width', `${width}`);
	svg.setAttribute('class', 'glyph-grid-tile__glyph');
	svg.setAttribute('data-font-content', '');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');

	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('transform', `translate(0 ${ascent}) scale(1 -1)`);
	path.setAttribute('d', glyph.svgPathData || 'M0,0Z');
	svg.appendChild(path);
	return svg;
}

export class GlyphGridTile extends HTMLElement {
	static get observedAttributes() {
		return ['selected'];
	}

	/**
	 * @param {Object} options
	 * @param {{glyphID: String, char: String, codePoint: Number, hex: String}} options.entry
	 */
	constructor({ entry } = {}) {
		super();
		this.entry = entry || { glyphID: '', char: '', codePoint: 0, hex: '' };
		this.glyphID = this.entry.glyphID;
		this.label = tileLabelFor(this.entry);
		this.status = 'empty';
		/** Whether the last render found outlines (false → ghost). */
		this.hasOutlines = false;

		this.art = makeElement({ tag: 'span', className: 'glyph-grid-tile__art' });
		// textContent, not innerHTML: labels include '<', '>' and '&'.
		this.labelEl = makeElement({ tag: 'span', className: 'glyph-grid-tile__label text-mono-small' });
		this.labelEl.textContent = this.label;
		this.mark = makeStatusMark('empty');
		this.mark.classList.add('glyph-grid-tile__mark');

		this.appendChild(this.art);
		this.appendChild(this.labelEl);
		this.appendChild(this.mark);
		this._staged = {
			role: 'option',
			tabindex: '-1',
			'data-glyph-id': this.glyphID,
		};
	}

	/** Host attributes are applied here (never in the constructor, see glyph_tile.js). */
	connectedCallback() {
		if (this._staged) {
			Object.entries(this._staged).forEach(([key, value]) => {
				if (!this.hasAttribute(key)) this.setAttribute(key, value);
			});
			this._staged = null;
		}
		this.syncAria();
	}

	attributeChangedCallback() {
		this.syncAria();
	}

	get selected() {
		return this.hasAttribute('selected');
	}

	set selected(value) {
		if (value) this.setAttribute('selected', '');
		else this.removeAttribute('selected');
	}

	/** Accessible name "a · Draft" (UX note "Copy"), selection, tooltip. */
	syncAria() {
		if (!this.isConnected) return;
		const statusLabel = STATUS_LABELS[this.status] || this.status;
		this.setAttribute('aria-label', `${this.label} · ${statusLabel}`);
		this.setAttribute('aria-selected', this.selected ? 'true' : 'false');
		if (this.status === 'failed') this.setAttribute('title', FAILED_TOOLTIP);
		else this.removeAttribute('title');
	}

	/**
	 * Re-fetches the glyph by ID from `project` and repaints art + status.
	 * @param {Object} args
	 * @param {Object} args.project - current GlyphrStudioProject
	 * @param {String} args.status - current status from the status store
	 */
	render({ project, status }) {
		const glyph = project?.getItem ? project.getItem(this.glyphID) : false;
		const hasOutlines = !!(glyph && glyph.shapes && glyph.shapes.length > 0);
		const pathData = hasOutlines ? glyph.svgPathData : '';

		// Repaint the art only when its source changed, so hovers and status
		// changes never rebuild the SVG.
		if (hasOutlines !== this.hasOutlines || pathData !== this._pathData) {
			this.hasOutlines = hasOutlines;
			this._pathData = pathData;
			if (hasOutlines) {
				this.art.replaceChildren(makeGlyphArt(project, glyph));
				this.removeAttribute('data-ghost');
			} else {
				this.art.replaceChildren(
					makeElement({ tag: 'span', className: 'glyph-grid-tile__ghost' })
				);
				this.setAttribute('data-ghost', '');
			}
		}

		if (status !== this.status) {
			this.status = status;
			this.setAttribute('data-status', status);
			updateStatusMark(this.mark, status);
		} else if (!this.hasAttribute('data-status')) {
			this.setAttribute('data-status', status);
		}
		this.syncAria();
	}
}
