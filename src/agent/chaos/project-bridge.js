// --------------------------------------------------------------
// Chaos tools: reading a project's glyphs for the engine (PR C)
// --------------------------------------------------------------
/*
	Shared by apply_chaos (native-tools.js) and the Chaos tab preview, so both start from the
	same contours and the same pixel grid. Reads only; never changes the project.
*/
import { fromShapes } from './geometry.js';
import { detectCellGrid } from './pixel-grid.js';

/** A glyph's Paths as engine contours. Throws UNSUPPORTED_COMPONENT on component instances. */
export function glyphContours(glyph) {
	if (!glyph) return [];
	if (glyph.shapes.some((shape) => shape.objType !== 'Path'))
		throw Object.assign(
			new Error('Chaos tools do not work on glyphs with component instances yet.'),
			{ code: 'UNSUPPORTED_COMPONENT' }
		);
	return fromShapes(glyph.shapes);
}

// Glyphs that show a pixel font's grid most plainly.
export const GRID_REFERENCE = ['H', 'O', 'n', 'o', 'E', 'I', 'L', 'T'].map(
	(char) => `glyph-0x${char.codePointAt(0).toString(16).toUpperCase()}`
);

const plain = (glyph) =>
	glyph?.shapes?.length && glyph.shapes.every((shape) => shape.objType === 'Path');

/**
 * The font's cell grid for Pixel Life, read from a few plain glyphs (the targets when the font
 * has fewer than two of them), or null when the font is not drawn on a grid.
 * @param {Object} project
 * @param {Array<String>} [fallbackIds]
 */
export function projectCellGrid(project, fallbackIds = []) {
	let glyphs = GRID_REFERENCE.map((id) => project.glyphs[id]).filter(plain);
	if (glyphs.length < 2) glyphs = fallbackIds.map((id) => project.glyphs[id]).filter(plain);
	const font = project.settings.font;
	return detectCellGrid(glyphs.slice(0, 8).map(glyphContours), { upm: font.upm });
}
