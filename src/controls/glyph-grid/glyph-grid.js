import { getCurrentProjectEditor } from '../../app/main.js';
import { makeElement } from '../../common/dom.js';
import {
	latinKernelAll,
	latinKernelLettersAndFigures,
} from '../../project_editor/charset_latin_kernel.js';
import { GLYPH_STATUS_TOPIC } from '../../project_editor/glyph-status.js';
import { ITEM_CHANGED_TOPIC, createDebouncedRedraw } from '../../project_editor/item_changed.js';
import { openFocusMode } from '../../pages/focus_mode.js';
import {
	RETRY_GLYPHS_EVENT,
	keepGlyphs,
	preDraftOf,
	revertGlyph,
} from '../../agent/run/review.js';
import { SEGMENTED_PILL } from '../segmented-pill/segmented-pill.js';
import { getPicks, onControlsChange, setPicks, togglePick } from '../../agent/agent-controls.js';
import './glyph-grid.css';
import { GlyphGridTile } from './glyph-tile.js';
import { LEGEND_ORDER, STATUS_LABELS, makeStatusMark } from './status-mark.js';

/**
 * <glyph-grid>: the Letters & figures shelf (issue #14, flow-02/05/07).
 *
 *   header   "Letters & figures" (Heading, ROND 60) + segmented pill "62 · All 116"
 *            + legend (one mark + count per status with count > 0)
 *   tiles    one <glyph-grid-tile> per GF Latin Kernel entry, 13 columns
 *
 * Data flow: tiles are dumb; the grid re-renders a tile by glyph ID with a
 * freshly fetched glyph and status whenever `itemChanged {id}` or
 * `glyphStatusChanged {id}` fires (coalesced per frame). When the project
 * object itself was swapped (whole-project undo / redo), every tile is
 * re-rendered, because the old glyph objects are stale.
 *
 * Keyboard (roving tabindex, listbox semantics): arrows move the selection
 * in reading order and wrap at row ends, Home / End jump, Enter / Space opens
 * the glyph through `openGlyph(id)`. Picking for the agent's Target (PR B): Cmd/Ctrl-click
 * or Shift+Enter / Shift+Space toggles one glyph, Shift-click adds the range from the last
 * pick; a plain click opens the glyph and clears the picks. Key events handled here never reach the
 * document-level canvas shortcuts (ARCHITECTURE.md §4 "Keyboard").
 */

/** Views of the character set; `label` is the pill text. */
export const GRID_VIEWS = Object.freeze({
	default: { id: 'default', entries: latinKernelLettersAndFigures },
	all: { id: 'all', entries: latinKernelAll },
});

/** Column count used when the layout cannot be measured (jsdom, hidden grid). */
export const DEFAULT_COLUMNS = 13;

const REFRESH_ALL = '*';
const REFRESH_LEGEND = '*legend';

let instanceCounter = 0;

/**
 * Opens a glyph for editing in focus mode ([M3], issues #16–#18). Nothing
 * else in the grid knows how a glyph is opened.
 * @param {String} id - glyph ID, e.g. 'glyph-0x61'
 * @param {Object=} editor - ProjectEditor (defaults to the current one)
 * @param {Object=} options
 * @param {String=} options.origin - 'grid' | 'specimen' (where focus returns on close)
 * @param {Array<String>=} options.order - prev/next order (the grid's visible IDs)
 * @param {String=} options.view - the grid view at open
 */
export function openGlyph(id, editor = getCurrentProjectEditor(), options = {}) {
	if (!id || !editor) return;
	openFocusMode(id, { editor, ...options });
}

export class GlyphGrid extends HTMLElement {
	/**
	 * @param {Object} options
	 * @param {Object=} options.editor - ProjectEditor; defaults to the current one on connect
	 * @param {String=} options.view - 'default' (62) or 'all' (116)
	 */
	constructor({ editor, view = 'default' } = {}) {
		super();
		this._editor = editor || null;
		this._instance = ++instanceCounter;
		this.view = GRID_VIEWS[view] ? view : 'default';
		/** @type {Map<String, GlyphGridTile>} */
		this.tiles = new Map();
		this.selectedID = '';
		this._project = null;
		this._subscriberID = '';
		this._redraw = createDebouncedRedraw((id) => this._applyRefresh(id));
		this.openGlyph = (id) =>
			openGlyph(id, this.editor, { origin: 'grid', order: this.visibleIDs, view: this.view });
		this._built = false;
	}

	get editor() {
		if (!this._editor) this._editor = getCurrentProjectEditor();
		return this._editor;
	}

	get project() {
		return this.editor.project;
	}

	/** Entries currently shown. */
	get entries() {
		return GRID_VIEWS[this.view].entries();
	}

	/** Glyph IDs currently shown, in reading order. */
	get visibleIDs() {
		return this.entries.map((entry) => entry.glyphID);
	}

	// --------------------------------------------------------------
	// Lifecycle
	// --------------------------------------------------------------

	connectedCallback() {
		if (!this._built) {
			this._build();
			this._built = true;
		}
		this._subscribe();
		this._offPicks?.();
		this._offPicks = onControlsChange((event) => {
			if (event.detail?.reason === 'picks') this._applyPicks();
		});
		this.refreshAll();
		this._applyPicks();
	}

	disconnectedCallback() {
		this._unsubscribe();
		this._offPicks?.();
		this._offPicks = null;
		this._redraw.cancel();
	}

	/** Paints the agent Target picks on the tiles. */
	_applyPicks() {
		const picks = new Set(getPicks());
		this.tiles.forEach((tile, id) => (tile.picked = picks.has(id)));
	}

	/**
	 * Toggles a pick (Cmd/Ctrl) or adds the range from the last pick (Shift).
	 * @param {String} id
	 * @param {Boolean} range
	 */
	pick(id, range = false) {
		const picks = getPicks();
		const anchor = picks.at(-1);
		if (range && anchor && anchor !== id) {
			const ids = this.visibleIDs;
			const from = ids.indexOf(anchor);
			const to = ids.indexOf(id);
			if (from >= 0 && to >= 0) {
				const span = ids.slice(Math.min(from, to), Math.max(from, to) + 1);
				// The clicked end goes last, so the next Shift-click ranges from it.
				setPicks([...picks, ...span.filter((item) => item !== id), id]);
				return;
			}
		}
		togglePick(id);
	}

	_build() {
		this.classList.add('glyph-grid');

		const heading = makeElement({ tag: 'h3', className: 'glyph-grid__heading text-heading' });
		heading.textContent = 'Letters & figures';
		const headingID = `glyph-grid-heading-${this._instance}`;
		heading.id = headingID;

		const defaultCount = GRID_VIEWS.default.entries().length;
		const allCount = GRID_VIEWS.all.entries().length;
		this.switchEl = makeElement({
			tag: 'div',
			className: `${SEGMENTED_PILL.track} glyph-grid__switch`,
			attributes: { role: 'group', 'aria-label': 'Which characters to show' },
		});
		this.segmentDefault = this._makeSegment('default', `${defaultCount}`, 'Letters and figures');
		this.segmentAll = this._makeSegment('all', `All ${allCount}`, 'All characters');
		this.switchEl.append(this.segmentDefault, this.segmentAll);

		this.legendEl = makeElement({
			tag: 'ul',
			className: 'glyph-grid__legend',
			attributes: { 'aria-label': 'Status counts' },
		});

		const header = makeElement({ tag: 'div', className: 'glyph-grid__header' });
		header.append(heading, this.switchEl, this.legendEl);

		this.tilesEl = makeElement({
			tag: 'div',
			className: 'glyph-grid__tiles',
			attributes: { role: 'listbox', 'aria-labelledby': headingID },
		});
		this.tilesEl.addEventListener('keydown', (event) => this._onKeyDown(event));
		this.tilesEl.addEventListener('keyup', (event) => this._guardKeyEvent(event));
		this.tilesEl.addEventListener('click', (event) => this._onClick(event));
		this.tilesEl.addEventListener('focusin', (event) => this._onFocusIn(event));

		this.append(header, this.tilesEl);
		this._buildTiles();
	}

	_makeSegment(viewID, label, title) {
		const button = makeElement({
			tag: 'button',
			className: `${SEGMENTED_PILL.segment} glyph-grid__segment text-label`,
			content: label,
			title,
			attributes: { type: 'button', 'data-view': viewID, 'aria-pressed': 'false' },
		});
		button.addEventListener('click', () => this.setView(viewID));
		return button;
	}

	/** (Re)creates the tiles for the current view; keeps tiles that stay visible. */
	_buildTiles() {
		const entries = this.entries;
		const keep = new Set(entries.map((entry) => entry.glyphID));
		this.tiles.forEach((tile, id) => {
			if (!keep.has(id)) {
				tile.remove();
				this.tiles.delete(id);
			}
		});
		const fragment = document.createDocumentFragment();
		entries.forEach((entry) => {
			let tile = this.tiles.get(entry.glyphID);
			if (!tile) {
				tile = new GlyphGridTile({ entry });
				this.tiles.set(entry.glyphID, tile);
			}
			fragment.appendChild(tile);
		});
		this.tilesEl.replaceChildren(fragment);
		this.segmentDefault.setAttribute('aria-pressed', this.view === 'default' ? 'true' : 'false');
		this.segmentAll.setAttribute('aria-pressed', this.view === 'all' ? 'true' : 'false');
		this.setAttribute('data-view', this.view);

		if (!this.tiles.has(this.selectedID)) {
			const editorID = this.editor?.selectedGlyphID;
			this.selectedID = this.tiles.has(editorID) ? editorID : entries[0]?.glyphID || '';
		}
		this._applySelection();
	}

	// --------------------------------------------------------------
	// Views ("62" / "All 116")
	// --------------------------------------------------------------

	/**
	 * @param {String} viewID - 'default' | 'all'
	 */
	setView(viewID) {
		if (!GRID_VIEWS[viewID] || viewID === this.view) return;
		this.view = viewID;
		this._buildTiles();
		this.refreshAll();
	}

	// --------------------------------------------------------------
	// Rendering
	// --------------------------------------------------------------

	/** Re-renders every tile from the current project and the legend. */
	refreshAll() {
		if (!this._built) return;
		const project = this.project;
		this._project = project;
		this.tiles.forEach((tile, id) => tile.render(this._tileState(id, project)));
		this.refreshLegend();
	}

	/**
	 * Re-renders one tile by glyph ID (no-op for IDs outside the view).
	 * @param {String} id
	 */
	refreshTile(id) {
		const tile = this.tiles.get(id);
		if (!tile) return;
		tile.render(this._tileState(id, this.project));
	}

	/** What a tile needs to render: project, status, whether Revert is possible. */
	_tileState(id, project) {
		const store = this.editor.glyphStatus;
		const record = store ? store.get(id) : { status: 'empty' };
		const status = record.status;
		return {
			project,
			status,
			canRevert: status === 'draft' && !!preDraftOf(this.editor, id),
			reason: status === 'failed' ? record.reason || '' : '',
		};
	}

	/** Rebuilds the legend from live counts over the visible IDs. */
	refreshLegend() {
		if (!this._built) return;
		const store = this.editor.glyphStatus;
		const counts = store ? store.counts(this.visibleIDs) : {};
		const items = [];
		LEGEND_ORDER.forEach((status) => {
			const count = counts[status] || 0;
			if (count <= 0) return;
			const label = STATUS_LABELS[status];
			const item = makeElement({
				tag: 'li',
				className: 'glyph-grid__legend-item',
				title: `${count} ${label}`,
				attributes: { 'data-status': status, 'aria-label': `${count} ${label}` },
			});
			item.append(
				makeStatusMark(status),
				makeElement({
					tag: 'span',
					className: 'glyph-grid__legend-count text-mono',
					content: `${count}`,
				})
			);
			items.push(item);
		});
		this.legendEl.replaceChildren(...items);
		// A legend only helps when there is a mix to compare: a project where
		// every tile is Empty (or every tile Kept) shows no legend (flow-02).
		this.legendEl.hidden = items.length < 2;
	}

	/** Flushes pending (debounced) refreshes now. Used by tests. */
	flushRedraws() {
		this._redraw.flush();
	}

	_scheduleRefresh(id) {
		// A swapped project object (whole-project undo / redo) makes every
		// tile's last-rendered glyph stale: refresh all of them.
		if (this._project && this._project !== this.project) this._redraw.schedule(REFRESH_ALL);
		else if (id) this._redraw.schedule(id);
		this._redraw.schedule(REFRESH_LEGEND);
	}

	_applyRefresh(id) {
		if (!this.isConnected) return;
		if (id === REFRESH_ALL) this.refreshAll();
		else if (id === REFRESH_LEGEND) this.refreshLegend();
		else this.refreshTile(id);
	}

	// --------------------------------------------------------------
	// Subscriptions
	// --------------------------------------------------------------

	_subscribe() {
		const editor = this.editor;
		if (!editor?.subscribe) return;
		this._unsubscribe();
		const subscriberID = `glyph-grid-${this._instance}`;
		this._subscriberID = subscriberID;
		// Both topics feed one per-frame debouncer (this._redraw), so a burst
		// of edits and status changes repaints each tile once.
		const onChange = (data) => {
			if (data?.id) this._scheduleRefresh(data.id);
		};
		editor.subscribe({ topic: ITEM_CHANGED_TOPIC, subscriberID, callback: onChange });
		editor.subscribe({ topic: GLYPH_STATUS_TOPIC, subscriberID, callback: onChange });
		// Undo / redo publish 'currentItem' after a whole-project restore. On a
		// page without a selected item (the workspace) that carries no id, so
		// itemChanged stays silent; the project swap itself is the signal.
		editor.subscribe({
			topic: 'currentItem',
			subscriberID,
			callback: () => {
				if (this._project && this._project !== this.project) this._scheduleRefresh('');
			},
		});
	}

	_unsubscribe() {
		const editor = this._editor;
		if (!editor?.subscribers || !this._subscriberID) return;
		[ITEM_CHANGED_TOPIC, GLYPH_STATUS_TOPIC, 'currentItem'].forEach((topic) => {
			if (editor.subscribers[topic]) delete editor.subscribers[topic][this._subscriberID];
		});
	}

	// --------------------------------------------------------------
	// Selection and keyboard
	// --------------------------------------------------------------

	/** Tiles in reading order. */
	get orderedTiles() {
		return this.entries.map((entry) => this.tiles.get(entry.glyphID)).filter(Boolean);
	}

	/**
	 * Columns in the current layout, measured from the first row. Falls back to
	 * the `columns` attribute or DEFAULT_COLUMNS when nothing is laid out.
	 * @returns {Number}
	 */
	get columns() {
		const tiles = this.orderedTiles;
		if (tiles.length > 1) {
			const firstTop = tiles[0].offsetTop;
			let count = 0;
			for (const tile of tiles) {
				if (tile.offsetTop !== firstTop) break;
				count++;
			}
			if (count > 0 && count < tiles.length) return count;
		}
		const attr = parseInt(this.getAttribute('columns') || '', 10);
		return attr > 0 ? attr : DEFAULT_COLUMNS;
	}

	/**
	 * Selects a tile (roving tabindex) and optionally moves focus to it.
	 * @param {String} id - glyph ID
	 * @param {Object=} options
	 * @param {Boolean=} options.focus
	 */
	select(id, { focus = false } = {}) {
		if (!this.tiles.has(id)) return;
		this.selectedID = id;
		this._applySelection();
		if (focus) this.tiles.get(id).focus();
	}

	_applySelection() {
		this.tiles.forEach((tile, id) => {
			const isSelected = id === this.selectedID;
			tile.selected = isSelected;
			tile.setAttribute('tabindex', isSelected ? '0' : '-1');
		});
	}

	_tileFromEvent(event) {
		const target = /** @type {Element} */ (event.target);
		return target?.closest ? target.closest('glyph-grid-tile') : null;
	}

	_onClick(event) {
		const tile = this._tileFromEvent(event);
		if (!tile) return;
		const actionButton = /** @type {Element} */ (event.target).closest?.('[data-tile-action]');
		if (actionButton) {
			event.stopPropagation();
			this.select(tile.glyphID, { focus: true });
			this.reviewAction(actionButton.getAttribute('data-tile-action'), tile.glyphID);
			return;
		}
		this.select(tile.glyphID, { focus: true });
		if (event.metaKey || event.ctrlKey || event.shiftKey) {
			this.pick(tile.glyphID, event.shiftKey && !event.metaKey && !event.ctrlKey);
			return;
		}
		setPicks([]);
		this.openGlyph(tile.glyphID);
	}

	/**
	 * A tile's review action (M7 #29). Keep and Revert are one history entry
	 * each; Retry is the agent's job, so it is announced for the agent panel.
	 * @param {'keep' | 'revert' | 'retry'} action
	 * @param {String} id
	 */
	reviewAction(action, id) {
		if (action === 'keep') keepGlyphs(this.editor, [id]);
		else if (action === 'revert') revertGlyph(this.editor, id);
		else if (action === 'retry')
			this.dispatchEvent(
				new CustomEvent(RETRY_GLYPHS_EVENT, { bubbles: true, composed: true, detail: { ids: [id] } })
			);
	}

	_onFocusIn(event) {
		const tile = this._tileFromEvent(event);
		if (tile && tile.glyphID !== this.selectedID) this.select(tile.glyphID);
	}

	/**
	 * Keys without Ctrl / Cmd stay inside the grid so Delete, tool keys and
	 * the like never reach the edit-canvas handlers. Global shortcuts
	 * (Ctrl+Z, Ctrl+S, …) still propagate.
	 */
	_guardKeyEvent(event) {
		if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
	}

	_onKeyDown(event) {
		this._guardKeyEvent(event);
		const tiles = this.orderedTiles;
		if (!tiles.length) return;
		const index = Math.max(
			tiles.findIndex((tile) => tile.glyphID === this.selectedID),
			0
		);
		const last = tiles.length - 1;
		const columns = this.columns;
		let next = -1;

		switch (event.key) {
			case 'ArrowRight':
				next = index >= last ? 0 : index + 1;
				break;
			case 'ArrowLeft':
				next = index <= 0 ? last : index - 1;
				break;
			case 'ArrowDown':
				next = index + columns <= last ? index + columns : -1;
				break;
			case 'ArrowUp':
				next = index - columns >= 0 ? index - columns : -1;
				break;
			case 'Home':
				next = 0;
				break;
			case 'End':
				next = last;
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				if (event.shiftKey) {
					this.pick(tiles[index].glyphID);
					return;
				}
				this.openGlyph(tiles[index].glyphID);
				return;
			default:
				return;
		}

		event.preventDefault();
		if (next >= 0) this.select(tiles[next].glyphID, { focus: true });
	}
}
