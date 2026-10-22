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
 * Below the card: Keep N (primary) and Retry k (secondary), per the UX note.
 * actions: 'keep' -> detail.glyphIds (applied) | 'retry' -> detail.glyphIds (failed)
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

export class AgentReceiptCard extends AgentCard {
	build(data) {
		const rows = Array.isArray(data.glyphs) ? data.glyphs : [];
		this.rows = rows;
		const counts = summarizeReceipt(rows);
		this.counts = counts;

		const nodes = [];
		if (rows.length) {
			const strip = el('div', 'agent-glyph-strip');
			strip.setAttribute('aria-label', `Changed glyphs ${rows.map((g) => g.char).join('')}`);
			rows.forEach((row) =>
				strip.append(
					makeGlyphArt({
						char: row.char,
						project: data.project,
						height: 40,
						failed: row.status === 'failed',
					})
				)
			);
			nodes.push(strip);
		}
		const summaryRow = el('div', 'agent-card__row agent-receipt__summary');
		const reviewed = counts.applied || counts.kept || counts.yours || counts.reverted;
		summaryRow.append(chip(counts.summary, { iconName: reviewed ? undefined : 'info' }));
		nodes.push(summaryRow);
		return nodes;
	}

	buildBelow() {
		const counts = this.counts;
		const actions = el('div', 'agent-receipt__actions');
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
		return actions.childElementCount ? [actions] : [];
	}

	extraFor(action) {
		const pick = (test) =>
			this.rows
				.filter(test)
				.map((g) => glyphIdForChar(g.char))
				.filter(Boolean);
		if (action === 'keep')
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
