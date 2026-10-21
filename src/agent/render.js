// --------------------------------------------------------------
// Agent render: PNG images of glyphs for vision models (M6 #25)
// --------------------------------------------------------------
/*
	Read-only. Draws through the existing drawGlyph path
	(src/display_canvas/draw_paths.js) on a detached canvas that is never
	attached to the document, with an explicit view so the editor's view is
	never read or changed.

	drawGlyph has a side effect: when a component instance has a bad link it
	splices that instance out of the glyph it was given (draw_paths.js:39-45).
	We never hand it a project glyph. Each glyph is drawn from a detached copy
	(new Glyph(glyph.save())), so a splice only touches the copy.
*/

import { designTokens } from '../common/colors.js';
import { drawGlyph } from '../display_canvas/draw_paths.js';
import { Glyph } from '../project_data/glyph.js';

export const RENDER_MAX_SIDE = 1024;
export const RENDER_MIN_SIDE = 64;
export const RENDER_DEFAULT_HEIGHT = 384;

const colors = {
	background: designTokens.light.background,
	ink: designTokens.light.foreground,
	guide: designTokens.light.border,
	baseline: designTokens.light.mutedForeground,
	advance: designTokens.light.primary,
	missing: designTokens.light.destructive,
};

const copy = (value) => JSON.parse(JSON.stringify(value));

/** Default canvas factory: a plain canvas element, never attached. */
function defaultCanvas(width, height) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return canvas;
}

/**
 * Detached copy of a project glyph, safe to hand to drawGlyph.
 * @param {Object} project
 * @param {Object} glyph
 */
function detachedCopy(project, glyph) {
	const clone = new Glyph(copy(glyph.save(true)));
	clone.parent = project;
	return clone;
}

/**
 * Font metrics used for layout and guides.
 * @param {Object} project
 */
export function fontMetrics(project) {
	const font = project.settings.font;
	return {
		upm: font.upm,
		ascent: font.ascent,
		descent: font.descent,
		capHeight: font.capHeight,
		xHeight: font.xHeight,
		overshoot: font.overshoot,
	};
}

/**
 * Renders a row of items to one PNG.
 * @param {Object} arg
 * @param {Object} arg.project - GlyphrStudioProject
 * @param {Array<{glyphId: String, glyph: Object | null}>} arg.items - glyph null = missing
 * @param {Number=} arg.height - requested image height in px (64..1024)
 * @param {Boolean=} arg.guides - draw metric guides and advance edges
 * @param {Number=} arg.gap - font units between items (0 for running text)
 * @param {Function=} arg.makeCanvas - (width, height) => canvas, for tests
 * @returns {{image: String, width: Number, height: Number, scale: Number,
 *   layout: Array<{glyphId: String, x: Number, width: Number, missing: Boolean}>}}
 */
export function renderRow({
	project,
	items,
	height = RENDER_DEFAULT_HEIGHT,
	guides = true,
	gap = 0,
	makeCanvas = defaultCanvas,
}) {
	const metrics = fontMetrics(project);
	const missingAdvance = Math.round(metrics.upm * 0.5);
	const advances = items.map(({ glyph }) =>
		glyph ? Math.max(0, glyph.advanceWidth || 0) : missingAdvance
	);
	let top = Math.max(metrics.ascent, metrics.capHeight, metrics.xHeight);
	let bottom = Math.min(metrics.descent, 0);
	let left = 0;
	let right = advances.reduce((sum, value) => sum + value, 0) + gap * Math.max(0, items.length - 1);
	items.forEach(({ glyph }, index) => {
		if (!glyph?.shapes?.length) return;
		const origin = advances.slice(0, index).reduce((sum, value) => sum + value + gap, 0);
		const maxes = glyph.maxes;
		top = Math.max(top, maxes.yMax);
		bottom = Math.min(bottom, maxes.yMin);
		left = Math.min(left, origin + maxes.xMin);
		right = Math.max(right, origin + maxes.xMax);
	});
	const padUnits = metrics.upm * 0.08;
	const spanY = top - bottom + padUnits * 2;
	const spanX = Math.max(right - left, metrics.upm * 0.25) + padUnits * 2;
	const wantHeight = clamp(Math.round(height), RENDER_MIN_SIDE, RENDER_MAX_SIDE);
	const scale = Math.min(wantHeight / spanY, RENDER_MAX_SIDE / spanX);
	const pxHeight = clamp(Math.ceil(spanY * scale), RENDER_MIN_SIDE, RENDER_MAX_SIDE);
	const pxWidth = clamp(Math.ceil(spanX * scale), RENDER_MIN_SIDE, RENDER_MAX_SIDE);
	const originX = (padUnits - left) * scale;
	const baselineY = (top + padUnits) * scale;

	const canvas = makeCanvas(pxWidth, pxHeight);
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = colors.background;
	ctx.fillRect(0, 0, pxWidth, pxHeight);

	if (guides) {
		ctx.lineWidth = 1;
		for (const [value, color] of [
			[metrics.ascent, colors.guide],
			[metrics.capHeight, colors.guide],
			[metrics.xHeight, colors.guide],
			[metrics.descent, colors.guide],
			[0, colors.baseline],
		]) {
			const y = Math.round(baselineY - value * scale) + 0.5;
			ctx.strokeStyle = color;
			ctx.beginPath();
			ctx.moveTo(0, y);
			ctx.lineTo(pxWidth, y);
			ctx.stroke();
		}
	}

	const layout = [];
	let cursor = 0;
	items.forEach(({ glyphId, glyph }, index) => {
		const x = originX + cursor * scale;
		const advancePx = advances[index] * scale;
		if (glyph) {
			if (glyph.shapes?.length) {
				drawGlyph(
					detachedCopy(project, glyph),
					ctx,
					{ dx: x, dy: baselineY, dz: scale },
					1,
					colors.ink
				);
			}
		} else {
			// Missing glyph: a dashed box, never a fallback font.
			ctx.save();
			ctx.strokeStyle = colors.missing;
			ctx.setLineDash?.([4, 4]);
			ctx.strokeRect(
				x + advancePx * 0.1,
				baselineY - metrics.capHeight * scale,
				advancePx * 0.8,
				metrics.capHeight * scale
			);
			ctx.restore();
		}
		if (guides) {
			ctx.strokeStyle = colors.advance;
			ctx.beginPath();
			for (const edge of [x, x + advancePx]) {
				ctx.moveTo(Math.round(edge) + 0.5, baselineY - metrics.ascent * scale);
				ctx.lineTo(Math.round(edge) + 0.5, baselineY - metrics.descent * scale);
			}
			ctx.stroke();
		}
		layout.push({
			glyphId,
			x: Math.round(x),
			width: Math.round(advancePx),
			missing: !glyph,
		});
		cursor += advances[index] + gap;
	});

	return {
		image: canvas.toDataURL('image/png'),
		width: pxWidth,
		height: pxHeight,
		scale: round3(scale),
		layout,
	};
}

function clamp(value, min, max) {
	return Math.min(max, Math.max(min, value));
}

function round3(value) {
	return Math.round(value * 1000) / 1000;
}
