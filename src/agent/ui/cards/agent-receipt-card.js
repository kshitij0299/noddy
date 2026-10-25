/**
 * <agent-receipt-card>: what a run actually changed (Figma flow-07, 71:442).
 * The strip draws the touched glyphs from outlines; a failed glyph is a ghost
 * with an `error` badge. The summary is built from `glyphs` only, so a model
 * that claimed edits which never landed shows "0 edits applied".
 *
 * data = { cardId, glyphs: [{ char: 'a', status: 'new'|'changed'|'failed'|'kept'|'yours'|'reverted'|'working' }], project? }
 * 'new' / 'changed' rows are Drafts waiting for review (they count in
 * "Keep N"); 'kept' rows were already kept or reverted elsewhere (a tile, the
 * inspector), so the panel re-renders the card with live statuses and the
 * label count always matches what Keep will keep.
 * Below the card: Keep N (primary), Undo N and Retry k (secondary), per the UX note.
 * actions: 'keep' -> detail.glyphIds (applied) | 'undo' -> detail.glyphIds (applied)
 *          | 'retry' -> detail.glyphIds (failed)
 * Per glyph (PR B): with more than one glyph, each glyph in the strip is a button (one tab
 * stop, Left / Right move); pressing it shows that glyph's Keep / Retry / Undo row in the card.
 * One-glyph receipts carry the same three below the card. Per-glyph actions are 'keep-one',
 * 'retry-one' and 'undo-one' with detail.glyphIds = [that glyph]. Retry on a Draft asks the
 * agent for another take; on a Failed glyph it retries the job.
 */
import { AgentCard, cardButton, chip, el } from './card-shell.js';
import { glyphIdForChar, makeGlyphArt } from './glyph-art.js';

/**
 * Counts and Mono summary for a receipt.
 * @param {Array<{char: String, status: String}>} glyphs - receipt rows
 * @returns {{added: Number, changed: Number, failed: Number, applied: Number, summary: String}}
 */
export function summarizeReceipt(glyphs = []) {
	const rows = Array.isArray(glyphs) ? glyphs : [];
	const added = rows.filter((g) => g.status === 'new').length;
	const changed = rows.filter((g) => g.status === 'changed').length;
	const failed = rows.filter((g) => g.status === 'failed').length;
	const kept = rows.filter((g) => g.status === 'kept').length;
	const working = rows.filter((g) => g.status === 'working').length;
	const yours = rows.filter((g) => g.status === 'yours').length;
	const reverted = rows.filter((g) => g.status === 'reverted').length;
	const applied = added + changed;
	const parts = [];
	if (added) parts.push(`${added} new`);
	if (changed) parts.push(`${changed} changed`);
	if (kept) parts.push(`${kept} kept`);
	if (yours) parts.push(`${yours} Yours`);
	if (reverted) parts.push(`${reverted} reverted`);
	if (working) parts.push(`${working} drafting`);
	if (!applied && !kept && !working && !yours && !reverted) parts.push('0 edits applied');
	if (failed) parts.push(`${failed} failed`);
	return {
		added,
		changed,
		failed,
		kept,
		yours,
		reverted,
		working,
		applied,
		summary: parts.join(' · '),
	};
}

/** A row's status in words, for the glyph buttons and the per-glyph row. */
const STATUS_WORDS = Object.freeze({
	new: 'new draft',
	changed: 'draft',
	failed: 'failed',
	kept: 'kept',
	yours: 'Yours',
	reverted: 'undone',
	working: 'drafting',
});

export class AgentReceiptCard extends AgentCard {
	constructor() {
		super();
		/** The glyph whose own Keep / Retry / Undo row is open. */
		/** @type {String|null} */
		this.picked = null;
	}

	build(data) {
		const rows = Array.isArray(data.glyphs) ? data.glyphs : [];
		this.rows = rows;
		const counts = summarizeReceipt(rows);
		this.counts = counts;

		const nodes = [];
		const single = rows.length === 1;
		if (!rows.some((row) => row.char === this.picked)) this.picked = null;
		if (rows.length) {
			const strip = el('div', 'agent-glyph-strip');
			strip.setAttribute('aria-label', `Changed glyphs ${rows.map((g) => g.char).join('')}`);
			const arts = rows.map((row) =>
				makeGlyphArt({
					char: row.char,
					project: data.project,
					height: 40,
					failed: row.status === 'failed',
				})
			);
			if (single) strip.append(...arts);
			else {
				// Each glyph opens its own Keep / Retry / Undo row (one tab stop, arrows move).
				strip.setAttribute('role', 'toolbar');
				const buttons = arts.map((art, index) => {
					const row = rows[index];
					const button = el('button', 'agent-glyph-pick');
					button.type = 'button';
					button.dataset.char = row.char;
					button.setAttribute('aria-pressed', String(row.char === this.picked));
					button.setAttribute(
						'aria-label',
						`${row.char}, ${STATUS_WORDS[row.status] || row.status}`
					);
					art.removeAttribute('role');
					art.removeAttribute('aria-label');
					button.append(art);
					button.tabIndex = -1;
					button.addEventListener('click', () => this.pick(row.char));
					return button;
				});
				const stop = buttons.find((b) => b.dataset.char === this.picked) || buttons[0];
				stop.tabIndex = 0;
				strip.addEventListener('keydown', (event) => {
					const at = buttons.indexOf(/** @type {any} */ (document.activeElement));
					if (at < 0) return;
					let next = -1;
					if (event.key === 'ArrowRight') next = Math.min(buttons.length - 1, at + 1);
					else if (event.key === 'ArrowLeft') next = Math.max(0, at - 1);
					else if (event.key === 'Home') next = 0;
					else if (event.key === 'End') next = buttons.length - 1;
					if (next < 0) return;
					event.preventDefault();
					buttons.forEach((b, i) => (b.tabIndex = i === next ? 0 : -1));
					buttons[next].focus();
				});
				strip.append(...buttons);
			}
			nodes.push(strip);
			const picked = rows.find((row) => row.char === this.picked);
			if (picked) nodes.push(this.glyphActions(picked));
		}
		const summaryRow = el('div', 'agent-card__row agent-receipt__summary');
		const reviewed = counts.applied || counts.kept || counts.yours || counts.reverted;
		summaryRow.append(chip(counts.summary, { iconName: reviewed ? undefined : 'info' }));
		nodes.push(summaryRow);
		return nodes;
	}

	/**
	 * Show (or hide, when it is open) one glyph's action row.
	 * @param {String} char
	 */
	pick(char) {
		this.picked = this.picked === char ? null : char;
		this.render(this._data);
		const target = this.picked
			? this.querySelector('.agent-receipt__glyph-actions button')
			: this.querySelector(`.agent-glyph-pick[data-char="${CSS.escape(char)}"]`);
		/** @type {HTMLElement|null} */ (target)?.focus();
	}

	/** The picked glyph's own row: what it is now, and its Keep / Retry / Undo. */
	glyphActions(row) {
		const box = el('div', 'agent-card__row agent-receipt__glyph-actions');
		box.append(
			el(
				'span',
				'agent-receipt__glyph-label text-label',
				`${row.char} · ${STATUS_WORDS[row.status] || row.status}`
			)
		);
		const draft = row.status === 'new' || row.status === 'changed';
		if (draft)
			box.append(
				cardButton({ label: 'Keep', action: 'keep-one', iconName: 'check', variant: 'secondary' })
			);
		if (draft || row.status === 'failed')
			box.append(
				cardButton({ label: 'Retry', action: 'retry-one', iconName: 'refresh', variant: 'ghost' })
			);
		if (draft)
			box.append(
				cardButton({ label: 'Undo', action: 'undo-one', iconName: 'undo', variant: 'ghost' })
			);
		return box;
	}

	buildBelow() {
		const counts = this.counts;
		const actions = el('div', 'agent-receipt__actions');
		const rows = this.rows;
		if (rows.length === 1) {
			// One glyph: its own Keep / Retry / Undo, named by the glyph.
			const row = rows[0];
			const draft = row.status === 'new' || row.status === 'changed';
			if (draft)
				actions.append(
					cardButton({
						label: `Keep ${row.char}`,
						action: 'keep',
						iconName: 'check',
						variant: 'primary',
						size: 'lg',
					})
				);
			if (draft || row.status === 'failed')
				actions.append(
					cardButton({
						label: `Retry ${row.char}`,
						action: row.status === 'failed' ? 'retry' : 'retry-one',
						iconName: 'refresh',
						variant: 'secondary',
						size: 'lg',
					})
				);
			if (draft)
				actions.append(
					cardButton({
						label: 'Undo',
						action: 'undo',
						iconName: 'undo',
						variant: 'ghost',
						size: 'lg',
					})
				);
			return actions.childElementCount ? [actions] : [];
		}
		if (counts.applied) {
			actions.append(
				cardButton({
					label: `Keep ${counts.applied}`,
					action: 'keep',
					iconName: 'check',
					variant: 'primary',
					size: 'lg',
				})
			);
		}
		if (counts.failed) {
			const failedChars = this.rows.filter((g) => g.status === 'failed').map((g) => g.char);
			const label = counts.failed === 1 ? `Retry ${failedChars[0]}` : `Retry ${counts.failed}`;
			actions.append(
				cardButton({ label, action: 'retry', iconName: 'refresh', variant: 'secondary', size: 'lg' })
			);
		}
		if (counts.applied) {
			actions.append(
				cardButton({
					label: `Undo ${counts.applied}`,
					action: 'undo',
					iconName: 'undo',
					variant: 'ghost',
					size: 'lg',
				})
			);
		}
		return actions.childElementCount ? [actions] : [];
	}

	extraFor(action) {
		if (action.endsWith('-one')) {
			const char = this.rows.length === 1 ? this.rows[0].char : this.picked;
			const id = char ? glyphIdForChar(char) : null;
			return { glyphIds: id ? [id] : [] };
		}
		const pick = (test) =>
			this.rows
				.filter(test)
				.map((g) => glyphIdForChar(g.char))
				.filter(Boolean);
		if (action === 'keep' || action === 'undo')
			return { glyphIds: pick((g) => g.status === 'new' || g.status === 'changed') };
		if (action === 'retry') return { glyphIds: pick((g) => g.status === 'failed') };
		return {};
	}

	stepCopyFor(action) {
		const counts = this.counts;
		if (action === 'keep')
			return { tone: 'kept', text: `Kept ${counts.applied} ${counts.applied === 1 ? 'glyph' : 'glyphs'}` };
		if (action === 'retry') {
			const failedChars = this.rows.filter((g) => g.status === 'failed').map((g) => g.char);
			return { tone: 'info', text: `Retrying ${failedChars.join(' ')}` };
		}
		return null;
	}
}
