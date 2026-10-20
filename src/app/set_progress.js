/**
 * Set progress for the top bar ring: how many of the GF Latin Kernel
 * characters (116, PRODUCT.md "Character set") the project has drawn.
 *
 * The count source is pluggable. Until the M2.5 status store exists, a glyph
 * counts as drawn when it has at least one outline. The status store replaces
 * that with `kept + yours` through `setSetProgressSource()`.
 */

/** ASCII printable U+0020–U+007E (95) plus the 21 GF Latin Kernel extras. */
const KERNEL_EXTRAS = [
	0xa0, // nbsp
	0xa2, 0xa3, 0xa5, 0x20ac, // ¢ £ ¥ €
	0xa9, 0xae, 0x2122, 0xb0, // © ® ™ °
	0xd7, 0xf7, 0x2212, // × ÷ −
	0xb7, 0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, // · – — ‘ ’ “ ” • …
];

/** @type {Number[]} ordered code points of GF Latin Kernel */
export const LATIN_KERNEL_CODEPOINTS = Object.freeze([
	...Array.from({ length: 0x7f - 0x20 }, (_, i) => 0x20 + i),
	...KERNEL_EXTRAS,
]);

export const LATIN_KERNEL_SIZE = LATIN_KERNEL_CODEPOINTS.length; // 116

/**
 * Project glyph ID for a code point, matching `charToHex` (upper-case hex).
 * @param {Number} codePoint - Unicode code point
 * @returns {String}
 */
export function kernelGlyphID(codePoint) {
	return `glyph-0x${codePoint.toString(16).toUpperCase()}`;
}

/**
 * Default source: Kernel glyphs that have at least one outline.
 * @param {Object} project - GlyphrStudioProject
 * @returns {Number}
 */
export function countDrawnKernelGlyphs(project) {
	const glyphs = project?.glyphs || {};
	let drawn = 0;
	for (const codePoint of LATIN_KERNEL_CODEPOINTS) {
		const glyph = glyphs[kernelGlyphID(codePoint)];
		if (glyph && Array.isArray(glyph.shapes) && glyph.shapes.length > 0) drawn++;
	}
	return drawn;
}

/** @type {(project: Object) => Number} */
let progressSource = countDrawnKernelGlyphs;

/**
 * Hook for the M2.5 status store: replace how "drawn" is counted
 * (e.g. glyphs whose status is Kept or Yours). Pass nothing to restore the
 * outline-based default.
 * @param {(project: Object) => Number =} source - counts drawn glyphs for a project
 */
export function setSetProgressSource(source) {
	progressSource = typeof source === 'function' ? source : countDrawnKernelGlyphs;
}

/**
 * Progress of the current set.
 * @param {Object} project - GlyphrStudioProject
 * @returns {{done: Number, total: Number, fraction: Number}}
 */
export function getSetProgress(project) {
	const total = LATIN_KERNEL_SIZE;
	const done = Math.max(0, Math.min(total, progressSource(project) || 0));
	return { done, total, fraction: total ? done / total : 0 };
}
