/**
 * Set progress for the top bar ring: how many of the GF Latin Kernel
 * characters (116, PRODUCT.md "Character set") the project has drawn.
 *
 * The set and the default "drawn" rule come from the character set model
 * (`src/project_editor/charset_latin_kernel.js`): a glyph counts when it has
 * an outline (spaces: a positive advance width).
 *
 * The count source is pluggable. The M2.5 status store replaces the outline
 * rule with `kept + yours` through `setSetProgressSource()`.
 */

import { latinKernelAll, latinKernelCoverage } from '../project_editor/charset_latin_kernel.js';

export const LATIN_KERNEL_SIZE = latinKernelAll().length; // 116

/**
 * Default source: Kernel glyphs that have outlines.
 * @param {Object} project - GlyphrStudioProject
 * @returns {Number}
 */
export function countDrawnKernelGlyphs(project) {
	return latinKernelCoverage(project).drawn;
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
