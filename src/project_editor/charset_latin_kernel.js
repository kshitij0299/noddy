import { decToHex } from '../common/character_ids.js';
import { getUnicodeName } from '../lib/unicode/unicode_names.js';
import { CharacterRange } from '../project_data/character_range.js';

/**
 * GF Latin Kernel: Noddy's working character set.
 *
 * Google Fonts' minimum set ("ASCII + necessary punctuation and symbols for
 * English"). 116 encoded characters: the 95 printable Basic Latin characters
 * plus 21 characters from five other Unicode blocks. Every font also needs an
 * unencoded `.notdef` glyph, which the OTF exporter creates automatically when
 * the project has no `glyph-0x0`.
 *
 * Source of truth: googlefonts/glyphsets `data/results/nam/GF_Latin_Kernel.nam`.
 * This module is pure (no DOM, no app singletons) and does not change how the
 * project stores characters: `applyLatinKernelToProject` only adds
 * `CharacterRange` entries through the existing project API, which already
 * round-trip in `.gs2` files and drive the OTF export list.
 */

export const LATIN_KERNEL_SOURCE = Object.freeze({
	id: 'GF_Latin_Kernel',
	label: 'Latin Kernel (English)',
	url: 'https://github.com/googlefonts/glyphsets/blob/main/data/results/nam/GF_Latin_Kernel.nam',
});

/** Display order of the groups, uppercase first. */
export const LATIN_KERNEL_GROUPS = Object.freeze([
	'uppercase',
	'lowercase',
	'figures',
	'punctuation',
	'symbols',
	'spaces',
]);

/** Groups shown by default ("letters & figures", 62). */
export const LATIN_KERNEL_DEFAULT_GROUPS = Object.freeze(['uppercase', 'lowercase', 'figures']);

/** The unencoded glyph every font needs at index 0. */
export const LATIN_KERNEL_NOTDEF = Object.freeze({
	name: '.notdef',
	glyphID: 'glyph-0x0',
	codePoint: null,
	group: 'unencoded',
});

/** Codes of the Basic Latin block the set covers (every printable ASCII). */
export const BASIC_LATIN_PRINTABLE = Object.freeze({ begin: 0x20, end: 0x7e });

// Curated order per group. Letters and figures are in alphabetical / numeric
// order, punctuation and symbols in a drawing-friendly order (base marks first,
// then the forms derived from them).
const GROUP_CHARS = {
	uppercase: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
	lowercase: 'abcdefghijklmnopqrstuvwxyz',
	figures: '0123456789',
	punctuation: '.,:;!?\'"‘’“”-–—…·•()[]{}/\\_',
	symbols: '#$%&*+<=>@^|~`×÷−¢£¥€©®™°',
	spaces: '  ',
};

/**
 * @typedef {Object} LatinKernelEntry
 * @property {Number} codePoint - Unicode code point (e.g. 65)
 * @property {String} hex - project hex ID (e.g. '0x41')
 * @property {String} glyphID - project item ID (e.g. 'glyph-0x41')
 * @property {String} char - the character itself
 * @property {String} group - one of LATIN_KERNEL_GROUPS
 * @property {Number} index - position in the ordered set (0-based)
 */

/** @type {LatinKernelEntry[]} */
const ENTRIES = [];
/** @type {Map<Number, LatinKernelEntry>} */
const BY_CODE_POINT = new Map();

LATIN_KERNEL_GROUPS.forEach((group) => {
	for (const char of GROUP_CHARS[group]) {
		const codePoint = char.codePointAt(0);
		const hex = decToHex(codePoint);
		const entry = Object.freeze({
			codePoint,
			hex,
			glyphID: `glyph-${hex}`,
			char,
			group,
			index: ENTRIES.length,
		});
		ENTRIES.push(entry);
		BY_CODE_POINT.set(codePoint, entry);
	}
});
Object.freeze(ENTRIES);

// --------------------------------------------------------------
// ID conversion
// --------------------------------------------------------------

/**
 * Converts a code point into a project glyph ID.
 * @param {Number} codePoint - e.g. 65
 * @returns {String | false} - e.g. 'glyph-0x41'
 */
export function codePointToGlyphID(codePoint) {
	const hex = decToHex(codePoint);
	return hex ? `glyph-${hex}` : false;
}

/**
 * Converts a project glyph ID into a code point.
 * @param {String} glyphID - e.g. 'glyph-0x41'
 * @returns {Number | false} - e.g. 65
 */
export function glyphIDToCodePoint(glyphID) {
	if (typeof glyphID !== 'string' || !glyphID.startsWith('glyph-')) return false;
	const value = parseInt(glyphID.substring('glyph-'.length), 16);
	return Number.isInteger(value) ? value : false;
}

/**
 * Accepts a code point (65), a hex ID ('0x41'), a glyph ID ('glyph-0x41') or
 * a single character ('A') and returns the code point, or false.
 * @param {Number | String} id
 * @returns {Number | false}
 */
export function toCodePoint(id) {
	if (typeof id === 'number') return Number.isInteger(id) ? id : false;
	if (typeof id !== 'string' || id.length === 0) return false;
	if (id.startsWith('glyph-')) return glyphIDToCodePoint(id);
	if (/^0x[0-9a-f]+$/i.test(id)) return parseInt(id, 16);
	if ([...id].length === 1) return id.codePointAt(0);
	return false;
}

// --------------------------------------------------------------
// Lists
// --------------------------------------------------------------

/**
 * Every encoded character of the set, in display order (116).
 * @returns {LatinKernelEntry[]}
 */
export function latinKernelAll() {
	return ENTRIES.slice();
}

/**
 * Letters and figures only: A–Z, a–z, 0–9 (62). This is the default view.
 * @returns {LatinKernelEntry[]}
 */
export function latinKernelLettersAndFigures() {
	return ENTRIES.filter((entry) => LATIN_KERNEL_DEFAULT_GROUPS.includes(entry.group));
}

/**
 * Everything behind the "All 116" switch: punctuation, symbols, spaces (54).
 * @returns {LatinKernelEntry[]}
 */
export function latinKernelRest() {
	return ENTRIES.filter((entry) => !LATIN_KERNEL_DEFAULT_GROUPS.includes(entry.group));
}

/**
 * Entries of one group, in order.
 * @param {String} group - one of LATIN_KERNEL_GROUPS
 * @returns {LatinKernelEntry[]}
 */
export function latinKernelGroup(group) {
	return ENTRIES.filter((entry) => entry.group === group);
}

/**
 * The full glyph list a font built from this set contains: `.notdef` first,
 * then the 116 encoded characters (117).
 * @returns {Array<LatinKernelEntry | typeof LATIN_KERNEL_NOTDEF>}
 */
export function latinKernelGlyphs() {
	return [LATIN_KERNEL_NOTDEF, ...ENTRIES];
}

/**
 * Code points of the set that are outside the Basic Latin block (21).
 * @returns {LatinKernelEntry[]}
 */
export function latinKernelBeyondBasicLatin() {
	return ENTRIES.filter((entry) => entry.codePoint > BASIC_LATIN_PRINTABLE.end);
}

// --------------------------------------------------------------
// Lookups
// --------------------------------------------------------------

/**
 * Looks up the entry for a code point, hex ID, glyph ID or character.
 * @param {Number | String} id
 * @returns {LatinKernelEntry | undefined}
 */
export function latinKernelEntry(id) {
	const codePoint = toCodePoint(id);
	return codePoint === false ? undefined : BY_CODE_POINT.get(codePoint);
}

/**
 * Membership check.
 * @param {Number | String} id - code point, hex ID, glyph ID or character
 * @returns {Boolean}
 */
export function isInLatinKernel(id) {
	return latinKernelEntry(id) !== undefined;
}

/**
 * Group of a set member, or null if it is not in the set.
 * `.notdef` ('glyph-0x0' / '.notdef') reports 'unencoded'.
 * @param {Number | String} id
 * @returns {String | null}
 */
export function latinKernelGroupOf(id) {
	if (id === LATIN_KERNEL_NOTDEF.name || id === LATIN_KERNEL_NOTDEF.glyphID) {
		return LATIN_KERNEL_NOTDEF.group;
	}
	return latinKernelEntry(id)?.group ?? null;
}

// --------------------------------------------------------------
// Project integration
// --------------------------------------------------------------

/**
 * Does a glyph object count as drawn for coverage purposes?
 * Spaces are empty by design, so an advance width is enough for them.
 * @param {Object} glyph - project Glyph
 * @param {LatinKernelEntry} entry
 * @returns {Boolean}
 */
function isGlyphDrawn(glyph, entry) {
	if (!glyph) return false;
	if (entry.group === 'spaces') return glyph.advanceWidth > 0;
	return Array.isArray(glyph.shapes) && glyph.shapes.length > 0;
}

/**
 * Counts how much of the set a project has drawn.
 * @param {Object} project - GlyphrStudioProject
 * @returns {{total: Number, drawn: Number, missing: Number[], byGroup: Object}}
 */
export function latinKernelCoverage(project) {
	const glyphs = project?.glyphs || {};
	const byGroup = {};
	LATIN_KERNEL_GROUPS.forEach((group) => {
		byGroup[group] = { total: 0, drawn: 0 };
	});
	const missing = [];
	let drawn = 0;
	ENTRIES.forEach((entry) => {
		byGroup[entry.group].total++;
		if (isGlyphDrawn(glyphs[entry.glyphID], entry)) {
			drawn++;
			byGroup[entry.group].drawn++;
		} else {
			missing.push(entry.codePoint);
		}
	});
	return { total: ENTRIES.length, drawn, missing, byGroup };
}

/**
 * Is a code point covered by an enabled range of the project?
 * @param {Object} project - GlyphrStudioProject
 * @param {Number} codePoint
 * @returns {Boolean}
 */
function isCoveredByEnabledRange(project, codePoint) {
	const ranges = project?.settings?.project?.characterRanges || [];
	return ranges.some((range) => range.enabled && range.isWithinRange(codePoint));
}

/**
 * Code points of the set that no enabled range of the project covers.
 * @param {Object} project - GlyphrStudioProject
 * @returns {Number[]}
 */
export function latinKernelUncoveredCodePoints(project) {
	return ENTRIES.filter((entry) => !isCoveredByEnabledRange(project, entry.codePoint)).map(
		(entry) => entry.codePoint
	);
}

/**
 * Makes the project's character ranges cover the whole set, so the item
 * chooser lists every character and the OTF export (which only emits glyphs
 * inside enabled ranges) includes all of them.
 *
 * Only the existing `CharacterRange` API is used; nothing about the `.gs2`
 * format changes and projects that never call this are unaffected.
 *
 * - Basic Latin (U+0020–007E) is covered by the standard 'Basic Latin' block
 *   range (the same default a new project gets) unless `splitBasicLatin` is
 *   true, in which case every uncovered code point becomes its own range.
 * - The 21 characters outside Basic Latin always become single-code-point
 *   ranges, named after the character, because they are spread across five
 *   other Unicode blocks and adding whole blocks would bring in hundreds of
 *   unwanted cells.
 *
 * Idempotent: code points already covered by an enabled range are skipped.
 *
 * @param {Object} project - GlyphrStudioProject
 * @param {Object} [options]
 * @param {Boolean} [options.splitBasicLatin=false] - one range per ASCII code point too
 * @returns {CharacterRange[]} the ranges that were added
 */
export function applyLatinKernelToProject(project, { splitBasicLatin = false } = {}) {
	const ranges = project.settings.project.characterRanges;
	const added = [];

	const addRange = (begin, end, name) => {
		const range = new CharacterRange({ begin, end, name, enabled: true });
		ranges.push(range);
		project.updateCharacterRangeCount(range);
		added.push(range);
	};

	const uncovered = latinKernelUncoveredCodePoints(project);
	const uncoveredAscii = uncovered.filter((codePoint) => codePoint <= BASIC_LATIN_PRINTABLE.end);
	const uncoveredBeyond = uncovered.filter((codePoint) => codePoint > BASIC_LATIN_PRINTABLE.end);

	if (uncoveredAscii.length && !splitBasicLatin) {
		// Same block range a new project starts with (0x20–0x7F).
		addRange(0x20, 0x7f, 'Basic Latin');
	} else {
		uncoveredAscii.forEach((codePoint) => {
			addRange(codePoint, codePoint, latinKernelRangeName(codePoint));
		});
	}

	uncoveredBeyond.forEach((codePoint) => {
		addRange(codePoint, codePoint, latinKernelRangeName(codePoint));
	});

	return added;
}

/**
 * Name for a single-code-point range, e.g. 'Euro Sign'.
 * @param {Number} codePoint
 * @returns {String}
 */
export function latinKernelRangeName(codePoint) {
	const name = getUnicodeName(decToHex(codePoint));
	if (!name || name === '[name not found]') return `U+${codePoint.toString(16).toUpperCase()}`;
	return name
		.toLowerCase()
		.split(' ')
		.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
		.join(' ');
}
