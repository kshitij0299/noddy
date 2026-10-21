/**
 * <agent-approval-card>: the style gate (Figma flow-04, 71:427).
 * The control glyphs n o H O are drawn from the project's outlines; a glyph
 * without outlines shows as a ghost.
 *
 * data = { cardId, glyphs: 'noHO' | ['n','o','H','O'], project? }
 * actions: 'approve' | 'tweak' | 'edit-by-hand'
 *   approve      -> detail.glyphIds
 *   tweak        -> detail.prefill ('Tweak: ' for the composer)
 *   edit-by-hand -> detail.glyphId, detail.char (first control glyph)
 */
import { AgentCard, cardButton, cardHeader, el } from './card-shell.js';
import { glyphIdForChar, makeGlyphArt } from './glyph-art.js';

export const DEFAULT_CONTROL_GLYPHS = ['n', 'o', 'H', 'O'];

/**
 * @param {String|String[]|undefined} glyphs - data.glyphs
 * @returns {String[]}
 */
function toChars(glyphs) {
	if (Array.isArray(glyphs)) return glyphs.filter((c) => typeof c === 'string' && c);
	if (typeof glyphs === 'string' && glyphs) return Array.from(glyphs.replaceAll(' ', ''));
	return DEFAULT_CONTROL_GLYPHS.slice();
}

export class AgentApprovalCard extends AgentCard {
	build(data) {
		const chars = toChars(data.glyphs);
		this.chars = chars;
		const count = chars.length;

		const well = el('div', 'agent-glyph-well');
		well.setAttribute('aria-label', `Control glyphs ${chars.join(' ')}`);
		chars.forEach((char) =>
			well.append(makeGlyphArt({ char, project: data.project, height: 90 }))
		);

		const actions = el('div', 'agent-card__actions');
		actions.append(
			cardButton({ label: 'Approve', action: 'approve', iconName: 'check', variant: 'primary' }),
			cardButton({ label: 'Tweak', action: 'tweak', variant: 'secondary' }),
			cardButton({ label: 'Edit by hand', action: 'edit-by-hand', variant: 'ghost' })
		);

		return [
			cardHeader('Style check', `${count} ${count === 1 ? 'glyph' : 'glyphs'}`),
			well,
			actions,
		];
	}

	extraFor(action) {
		const chars = this.chars || [];
		if (action === 'approve') return { glyphIds: chars.map(glyphIdForChar).filter(Boolean) };
		if (action === 'tweak') return { prefill: 'Tweak: ' };
		if (action === 'edit-by-hand') {
			const char = chars[0] ?? null;
			return { char, glyphId: char ? glyphIdForChar(char) : null };
		}
		return {};
	}

	stepCopyFor(action, extra) {
		const spaced = (this.chars || []).join(' ');
		if (action === 'approve') return { tone: 'kept', text: `Style approved · ${spaced}` };
		if (action === 'tweak') return { tone: 'yours', text: 'Tweaking the style' };
		if (action === 'edit-by-hand')
			return { tone: 'yours', text: extra.char ? `Editing ${extra.char} by hand` : 'Editing by hand' };
		return null;
	}
}
