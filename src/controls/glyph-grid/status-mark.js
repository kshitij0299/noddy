import { makeElement } from '../../common/dom.js';

/**
 * StatusMark (Figma Components 50:78): one small mark per glyph status.
 * Every status has its own SHAPE, so it never relies on colour alone
 * (PRODUCT.md "Statuses"). The mark itself is aria-hidden; the host (tile or
 * legend item) carries the status word in its accessible name.
 *
 *   empty     ghost     faint dashed box (the tile also shows a ghost glyph)
 *   queued    ring      small hollow ring
 *   drafting  spinner   peach ring with a gap, spinning (static when motion is reduced)
 *   draft     dot       8px filled peach dot (plus a dashed tile border, see flow-05)
 *   kept      icon      green `check_circle`
 *   yours     icon      blue `edit`
 *   failed    icon      red `error`
 */

/** Status → shape. Exported so tests and the legend can assert on it. */
export const STATUS_SHAPES = Object.freeze({
	empty: 'ghost',
	queued: 'ring',
	drafting: 'spinner',
	draft: 'dot',
	kept: 'icon',
	yours: 'icon',
	failed: 'icon',
});

/** Material Symbols Rounded (outlined) ligature names for icon marks. */
export const STATUS_ICONS = Object.freeze({
	kept: 'check_circle',
	yours: 'edit',
	failed: 'error',
});

/** Short status words for accessible names and tooltips. */
export const STATUS_LABELS = Object.freeze({
	empty: 'Empty',
	queued: 'Queued',
	drafting: 'Drafting',
	draft: 'Draft',
	kept: 'Kept',
	yours: 'Yours',
	failed: 'Failed',
});

/** Legend order: finished work first, then work in flight, then the rest. */
export const LEGEND_ORDER = Object.freeze([
	'kept',
	'yours',
	'draft',
	'drafting',
	'queued',
	'failed',
	'empty',
]);

/**
 * Builds a 16×16 status mark.
 * @param {String} status - one of GLYPH_STATUSES
 * @returns {HTMLElement}
 */
export function makeStatusMark(status) {
	const shape = STATUS_SHAPES[status] || 'ghost';
	const mark = makeElement({
		tag: 'span',
		className: 'glyph-status-mark',
		attributes: { 'data-status': status, 'data-shape': shape, 'aria-hidden': 'true' },
	});
	if (shape === 'icon') {
		mark.appendChild(
			makeElement({
				tag: 'span',
				className: 'material-symbols-rounded glyph-status-mark__icon',
				content: STATUS_ICONS[status],
			})
		);
	} else {
		mark.appendChild(makeElement({ tag: 'span', className: 'glyph-status-mark__shape' }));
	}
	return mark;
}

/**
 * Replaces a mark's status in place (keeps the node, so nothing reflows).
 * @param {HTMLElement} mark - element made by makeStatusMark
 * @param {String} status
 */
export function updateStatusMark(mark, status) {
	if (mark.getAttribute('data-status') === status) return;
	const fresh = makeStatusMark(status);
	mark.setAttribute('data-status', status);
	mark.setAttribute('data-shape', fresh.getAttribute('data-shape'));
	mark.replaceChildren(...fresh.childNodes);
}
