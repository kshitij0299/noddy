/**
 * Glyph art for the agent cards: project outlines rendered as inline SVG,
 * or a ghost box when the project has no outline for that character.
 * The art carries `data-font-content` and never uses the UI font
 * (ARCHITECTURE.md §7).
 */
import { getCurrentProject } from '../../../app/main.js';
import { charToHex } from '../../../common/character_ids.js';
import { el, icon, srOnly } from './card-shell.js';

/**
 * Glyph ID for a single character, e.g. 'n' -> 'glyph-0x6E'.
 * @param {String} char - one character
 * @returns {String|null}
 */
export function glyphIdForChar(char) {
	const hex = charToHex(char);
	return hex ? `glyph-${hex}` : null;
}

/**
 * Project to draw from: an explicit one, the current project when the data
 * says nothing, or none (`false` / `null`) for fixtures without a project.
 * @param {Object|false|null|undefined} project - data.project
 * @returns {Object|null}
 */
export function resolveProject(project) {
	if (project) return project;
	if (project === false || project === null) return null;
	try {
		return getCurrentProject() || null;
	} catch {
		return null;
	}
}

/**
 * Looks up a glyph with outlines for a character.
 * @param {Object|null} project - GlyphrStudioProject
 * @param {String} char - one character
 * @returns {Object|null} - glyph with shapes, or null
 */
export function findDrawnGlyph(project, char) {
	const id = glyphIdForChar(char);
	if (!project || !id || typeof project.getItem !== 'function') return null;
	const glyph = project.getItem(id);
	return glyph?.shapes?.length ? glyph : null;
}

/**
 * Inline SVG of one glyph scaled to a pixel height (ascent + descent tall).
 * @param {Object} project - GlyphrStudioProject (for metrics)
 * @param {Object} glyph - Glyph with svgPathData
 * @param {Number} height - pixel height of the em box
 * @returns {SVGElement}
 */
export function makeGlyphSVG(project, glyph, height) {
	const ascent = parseInt(project.settings.font.ascent);
	const totalVertical = project.totalVertical;
	const advance = glyph.advanceWidth || project.defaultAdvanceWidth;
	const width = Math.max(1, Math.round((advance * height) / totalVertical));
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('viewBox', `0 0 ${advance} ${totalVertical}`);
	svg.setAttribute('width', String(width));
	svg.setAttribute('height', String(height));
	svg.setAttribute('aria-hidden', 'true');
	svg.classList.add('agent-glyph-art__svg');
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	path.setAttribute('transform', `translate(0,${ascent}) scale(1,-1)`);
	path.setAttribute('d', glyph.svgPathData || 'M0,0Z');
	path.setAttribute('fill', 'currentColor');
	svg.append(path);
	return svg;
}

/**
 * One glyph cell: outline art or a ghost, optionally marked failed.
 * @param {Object} options
 * @param {String} options.char - the character
 * @param {Object|false|null} [options.project] - project to draw from
 * @param {Number} [options.height] - em-box height in px
 * @param {Boolean} [options.failed] - show as ghost with an error badge
 * @returns {HTMLElement}
 */
export function makeGlyphArt({ char, project, height = 40, failed = false }) {
	const cell = el('span', 'agent-glyph-art');
	cell.setAttribute('data-font-content', '');
	cell.setAttribute('role', 'img');
	cell.dataset.char = char;
	cell.style.height = `${height}px`;
	const resolved = resolveProject(project);
	const glyph = failed ? null : findDrawnGlyph(resolved, char);
	if (glyph) {
		cell.dataset.source = 'outline';
		cell.setAttribute('aria-label', char);
		cell.append(makeGlyphSVG(resolved, glyph, height));
	} else {
		cell.dataset.source = 'ghost';
		const tall = /[A-Z0-9]/.test(char) || /[bdfhklt]/.test(char);
		const ghost = el('span', 'agent-glyph-ghost');
		ghost.style.height = `${Math.round(height * (tall ? 0.62 : 0.46))}px`;
		ghost.style.width = `${Math.round(height * 0.4)}px`;
		ghost.setAttribute('aria-hidden', 'true');
		cell.append(ghost);
		cell.setAttribute('aria-label', failed ? `${char} failed` : `${char} missing`);
	}
	if (failed) {
		cell.classList.add('agent-glyph-art--failed');
		const badge = el('span', 'agent-glyph-art__badge');
		badge.append(icon('error', 'agent-glyph-art__badge-icon'), srOnly('failed'));
		cell.append(badge);
	}
	return cell;
}
