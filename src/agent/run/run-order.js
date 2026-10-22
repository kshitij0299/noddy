// --------------------------------------------------------------
// Run queue order (M7 #28; DESIGN-BRIEF.md "Drawing order")
// --------------------------------------------------------------
/*
	controls n o H O (the style gate) → lowercase families
	h m u l i j r → b d p q c e → a g s f t → v w y x k z → capitals
	I L E F T → C G D Q → B P R J U S → V A W X Y K N M Z → figures → rest
	(punctuation, symbols, spaces in the set's own order).
*/
import {
	codePointToGlyphID,
	latinKernelLettersAndFigures,
	latinKernelRest,
} from '../../project_editor/charset_latin_kernel.js';

export const CONTROL_CHARS = Object.freeze(['n', 'o', 'H', 'O']);
export const LOWERCASE_FAMILIES = Object.freeze(['hmulijr', 'bdpqce', 'agsft', 'vwyxkz']);
export const CAPITAL_FAMILIES = Object.freeze(['ILEFT', 'CGDQ', 'BPRJUS', 'VAWXYKNMZ']);
export const FIGURES = '0123456789';

/**
 * The run's review groups: one receipt (and one "Keep all") per group.
 * `label` is the chip text in the plan card.
 */
export const RUN_GROUPS = Object.freeze([
	{ id: 'controls', label: 'noHO' },
	{ id: 'lowercase', label: 'a–z' },
	{ id: 'capitals', label: 'A–Z' },
	{ id: 'figures', label: '0–9' },
	{ id: 'rest', label: 'Rest' },
]);

/** @param {String} char */
export function glyphIdOfChar(char) {
	return codePointToGlyphID(char.codePointAt(0));
}

/**
 * Every glyph of a run scope in drawing order, with its review group.
 * @param {'letters' | 'all'} [scope] - letters & figures (62) or all 116
 * @returns {Array<{id: String, char: String, group: String}>}
 */
export function runOrder(scope = 'letters') {
	const seen = new Set();
	const out = [];
	const push = (char, group) => {
		const id = glyphIdOfChar(char);
		if (!id || seen.has(id)) return;
		seen.add(id);
		out.push({ id, char, group });
	};
	CONTROL_CHARS.forEach((char) => push(char, 'controls'));
	LOWERCASE_FAMILIES.join('').split('').forEach((char) => push(char, 'lowercase'));
	CAPITAL_FAMILIES.join('').split('').forEach((char) => push(char, 'capitals'));
	FIGURES.split('').forEach((char) => push(char, 'figures'));
	// Anything in letters & figures the families missed (none today) still runs.
	latinKernelLettersAndFigures().forEach((entry) => {
		const group = /[a-z]/.test(entry.char)
			? 'lowercase'
			: /[A-Z]/.test(entry.char)
			? 'capitals'
			: 'figures';
		push(entry.char, group);
	});
	if (scope === 'all') latinKernelRest().forEach((entry) => push(entry.char, 'rest'));
	return out;
}

/**
 * Sorts glyph IDs into run order (unknown IDs last, in their given order).
 * @param {Array<String>} ids
 * @returns {Array<String>}
 */
export function sortByRunOrder(ids) {
	const rank = new Map(runOrder('all').map((entry, index) => [entry.id, index]));
	return [...ids].sort((a, b) => (rank.get(a) ?? Infinity) - (rank.get(b) ?? Infinity));
}

/**
 * Review group of a glyph ID ('controls', 'lowercase', …).
 * @param {String} id
 * @returns {String}
 */
export function runGroupOf(id) {
	return runOrder('all').find((entry) => entry.id === id)?.group || 'rest';
}
