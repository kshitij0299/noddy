import { makeElement } from '../common/dom.js';
import { layoutSpecimenLine } from '../controls/specimen-card/specimen_card.js';

// --------------------------------------------------------------
// Focus mode: context strip (issue #18, flow-06 "nnann ooaoo")
// --------------------------------------------------------------
/*
	A bg/subtle pill under the canvas that shows the glyph being edited
	between spacing controls, drawn from the PROJECT's outlines (the
	specimen card's layout helper), never from a UI font. The current glyph
	is peach; missing neighbours are dashed ghosts. Not interactive.
*/

/**
 * The character an item ID stands for, e.g. 'glyph-0x61' → 'a'.
 * @param {String} id
 * @returns {String} the character, or '' when the ID is not a glyph
 */
export function charForGlyphID(id) {
	const match = /^glyph-0x([0-9a-f]+)$/i.exec(id || '');
	if (!match) return '';
	try {
		return String.fromCodePoint(parseInt(match[1], 16));
	} catch {
		return '';
	}
}

/**
 * Context string for a character (UX note #18):
 *   lowercase `nn?nn oo?oo`, caps `HH?HH OO?OO`, figures `00?00 11?11`,
 *   anything else (punctuation, symbols) `n?n o?o`.
 * @param {String} char
 * @returns {String}
 */
export function contextStringFor(char) {
	if (!char) return '';
	if (/\p{Ll}/u.test(char)) return `nn${char}nn oo${char}oo`;
	if (/\p{Lu}/u.test(char)) return `HH${char}HH OO${char}OO`;
	if (/\p{Nd}/u.test(char)) return `00${char}00 11${char}11`;
	return `n${char}n o${char}o`;
}

/**
 * @param {String} value
 * @returns {String} value safe inside a double-quoted attribute
 */
function escapeAttr(value) {
	return String(value)
		.replaceAll('&', '&amp;')
		.replaceAll('"', '&quot;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;');
}

/**
 * Builds the strip's SVG for one glyph ID.
 * @param {String} id - current glyph ID
 * @param {Object} project - GlyphrStudioProject
 * @returns {SVGElement | null}
 */
export function makeContextStripSVG(id, project) {
	const char = charForGlyphID(id);
	const text = contextStringFor(char);
	if (!text || !project) return null;
	const { items, width, metrics } = layoutSpecimenLine(text, project);
	const totalVertical = metrics.ascent - metrics.descent;

	const parts = items.map((item) => {
		if (item.type === 'space') return '';
		const current = item.id === id ? ' is-current' : '';
		if (item.type === 'glyph') {
			return `<path class="focus-strip__ink${current}" data-item-id="${escapeAttr(item.id)}" transform="translate(${item.x} 0)" d="${escapeAttr(item.pathData)}" />`;
		}
		const b = item.box;
		return `<rect class="focus-strip__ghost${current}" data-item-id="${escapeAttr(item.id || '')}" x="${b.x}" y="${b.yMin}" width="${b.width}" height="${b.yMax - b.yMin}" />`;
	});

	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('class', 'focus-strip__svg');
	svg.setAttribute('viewBox', `0 ${-metrics.ascent} ${Math.max(width, 1)} ${totalVertical}`);
	svg.setAttribute('data-font-content', '');
	svg.setAttribute('aria-hidden', 'true');
	svg.setAttribute('focusable', 'false');
	svg.innerHTML = `<g transform="scale(1 -1)">${parts.join('')}</g>`;
	return svg;
}

/**
 * The strip element. Call `render(id, project)` to (re)draw it.
 * @returns {HTMLElement & {render: Function}}
 */
export function makeContextStrip() {
	const strip = /** @type {HTMLElement & {render: Function}} */ (
		makeElement({ tag: 'div', className: 'focus-strip', attributes: { role: 'img' } })
	);
	strip.render = (id, project) => {
		const char = charForGlyphID(id);
		strip.setAttribute('aria-label', char ? `${char} in context` : 'Glyph in context');
		const svg = makeContextStripSVG(id, project);
		strip.replaceChildren(...(svg ? [svg] : []));
		strip.hidden = !svg;
	};
	return strip;
}
