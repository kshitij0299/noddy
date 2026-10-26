// --------------------------------------------------------------
// Remix mode: describe_mark (PR D). Pure: no DOM, no editor.
// --------------------------------------------------------------
/*
	Measures a mark the user drew (a slash, a spike, a blob) relative to the rest of its glyph,
	so an agent can re-express the same attitude on another glyph's anatomy instead of pasting
	the same points. Everything is measured on rasters, so it is honest about what it is:
	- the mark's own shape: centre, main direction (the principal axis of its ink, degrees off
	  horizontal, counter-clockwise), length along that axis and width across it;
	- where it sits on the letter (0–1 of the letter's bounds);
	- what its axis crosses, end to end: ink (a stem or bar), a counter (an enclosed hole) or
	  the outside, and how far its ends overshoot the letter;
	- how it combines: "cut" when the glyph has no ink where the mark overlaps the letter (drawn
	  the opposite way, the graffiti slash), "solid" when it fills there.
*/
import { boundsOf, inkTester, rasterize } from '../chaos/geometry.js';

const RESOLUTION = 64;
const SAMPLES = 64;
const round = (value, digits = 0) => {
	const f = 10 ** digits;
	return Math.round(value * f) / f;
};

/** Ink cells of the contours as points (cell centres, font units). */
function inkCells(contours, box) {
	const { cols, rows, cells } = rasterize(contours, box, RESOLUTION, RESOLUTION);
	const cw = box.width / cols;
	const ch = box.height / rows;
	const points = [];
	for (let row = 0; row < rows; row++)
		for (let col = 0; col < cols; col++)
			if (cells[row * cols + col])
				points.push({ x: box.xMin + (col + 0.5) * cw, y: box.yMin + (row + 0.5) * ch });
	return points;
}

/** A test for "inside an enclosed counter of these contours". */
function counterTester(contours, box) {
	const { cols, rows, cells } = rasterize(contours, box, RESOLUTION, RESOLUTION);
	// Flood the empty cells from the border: whatever empty is left is a counter.
	const outside = new Uint8Array(cells.length);
	const stack = [];
	for (let col = 0; col < cols; col++) stack.push(col, (rows - 1) * cols + col);
	for (let row = 0; row < rows; row++) stack.push(row * cols, row * cols + cols - 1);
	while (stack.length) {
		const index = stack.pop();
		if (cells[index] || outside[index]) continue;
		outside[index] = 1;
		const col = index % cols;
		const row = (index - col) / cols;
		if (col > 0) stack.push(index - 1);
		if (col < cols - 1) stack.push(index + 1);
		if (row > 0) stack.push(index - cols);
		if (row < rows - 1) stack.push(index + cols);
	}
	return (x, y) => {
		const col = Math.floor(((x - box.xMin) / box.width) * cols);
		const row = Math.floor(((y - box.yMin) / box.height) * rows);
		// A counter cell within one cell counts: the raster and the exact ink test disagree by
		// a cell at the counter's edge.
		for (let dr = -1; dr <= 1; dr++)
			for (let dc = -1; dc <= 1; dc++) {
				const c = col + dc;
				const r = row + dr;
				if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
				const index = r * cols + c;
				if (!cells[index] && !outside[index]) return true;
			}
		return false;
	};
}

/**
 * @param {Array<Object>} mark - the mark's contours
 * @param {Array<Object>} rest - the glyph's other contours (the letter)
 * @param {{upm: Number}} metrics
 */
export function describeMark(mark, rest, metrics) {
	const upm = metrics.upm || 1000;
	const em = (value) => round(value / upm, 3);
	const markBox = boundsOf(mark);
	if (!markBox) return null;
	const cells = inkCells(mark, markBox);
	if (!cells.length) return null;
	// Principal axis of the mark's ink.
	const cx = cells.reduce((sum, p) => sum + p.x, 0) / cells.length;
	const cy = cells.reduce((sum, p) => sum + p.y, 0) / cells.length;
	let sxx = 0;
	let syy = 0;
	let sxy = 0;
	for (const p of cells) {
		sxx += (p.x - cx) ** 2;
		syy += (p.y - cy) ** 2;
		sxy += (p.x - cx) * (p.y - cy);
	}
	const theta = 0.5 * Math.atan2(2 * sxy, sxx - syy);
	const ux = Math.cos(theta);
	const uy = Math.sin(theta);
	let alongMin = Infinity;
	let alongMax = -Infinity;
	let acrossMin = Infinity;
	let acrossMax = -Infinity;
	for (const p of cells) {
		const along = (p.x - cx) * ux + (p.y - cy) * uy;
		const across = -(p.x - cx) * uy + (p.y - cy) * ux;
		alongMin = Math.min(alongMin, along);
		alongMax = Math.max(alongMax, along);
		acrossMin = Math.min(acrossMin, across);
		acrossMax = Math.max(acrossMax, across);
	}
	const cell = Math.max(markBox.width, markBox.height) / RESOLUTION;
	const length = alongMax - alongMin + cell;
	const width = acrossMax - acrossMin + cell;
	let angle = (theta * 180) / Math.PI;
	if (angle > 90) angle -= 180;
	if (angle <= -90) angle += 180;

	const letterBox = boundsOf(rest);
	const result = {
		angle: round(angle),
		length: round(length),
		width: round(width),
		lengthEm: em(length),
		widthEm: em(width),
		centre: { x: round(cx), y: round(cy) },
		letter: null,
		crossings: [],
		overshoot: null,
		combines: null,
	};
	if (!letterBox) {
		result.summary = summary(result);
		return result;
	}
	result.letter = {
		x: round((cx - letterBox.xMin) / (letterBox.width || 1), 2),
		y: round((cy - letterBox.yMin) / (letterBox.height || 1), 2),
	};
	// Walk the axis end to end: what is under it?
	const inRest = inkTester(rest);
	const inMark = inkTester(mark);
	const inAll = inkTester([...rest, ...mark]);
	const pad = Math.max(letterBox.width, letterBox.height) * 0.1;
	const frame = {
		xMin: letterBox.xMin - pad,
		xMax: letterBox.xMax + pad,
		yMin: letterBox.yMin - pad,
		yMax: letterBox.yMax + pad,
	};
	frame.width = frame.xMax - frame.xMin;
	frame.height = frame.yMax - frame.yMin;
	const inCounter = counterTester(rest, frame);
	const runs = [];
	for (let step = 0; step < SAMPLES; step++) {
		const t = (step + 0.5) / SAMPLES;
		const along = alongMin + t * (alongMax - alongMin);
		const x = cx + ux * along;
		const y = cy + uy * along;
		const over = inRest(x, y) ? 'ink' : inCounter(x, y) ? 'counter' : 'outside';
		const last = runs.at(-1);
		if (last && last.over === over) last.to = round(t, 2);
		else runs.push({ over, from: round(step / SAMPLES, 2), to: round(t, 2) });
	}
	result.crossings = runs;
	result.strokesCrossed = runs.filter((run) => run.over === 'ink').length;
	result.countersCrossed = runs.filter((run) => run.over === 'counter').length;
	// Overshoot: how far each end of the axis lies outside the letter's bounds.
	const beyond = (x, y) =>
		Math.max(
			0,
			letterBox.xMin - x,
			x - letterBox.xMax,
			letterBox.yMin - y,
			y - letterBox.yMax
		);
	const endA = { x: cx + ux * alongMin, y: cy + uy * alongMin };
	const endB = { x: cx + ux * alongMax, y: cy + uy * alongMax };
	result.overshoot = { startEm: em(beyond(endA.x, endA.y)), endEm: em(beyond(endB.x, endB.y)) };
	// How it combines where it overlaps the letter's ink.
	let overlap = 0;
	let filled = 0;
	for (const p of cells) {
		if (!inMark(p.x, p.y) || !inRest(p.x, p.y)) continue;
		overlap++;
		if (inAll(p.x, p.y)) filled++;
	}
	result.combines = overlap ? (filled / overlap < 0.5 ? 'cut' : 'solid') : 'apart';
	result.summary = summary(result);
	return result;
}

function summary(m) {
	const parts = [
		`A mark at ${m.angle}° (counter-clockwise from horizontal), ${m.lengthEm} em long and ${m.widthEm} em wide`,
	];
	if (m.letter) {
		parts.push(
			`centred at ${Math.round(m.letter.x * 100)}% across and ${Math.round(
				m.letter.y * 100
			)}% up the letter`
		);
		parts.push(
			`crossing ${m.strokesCrossed} stroke${m.strokesCrossed === 1 ? '' : 's'} and ${
				m.countersCrossed
			} counter${m.countersCrossed === 1 ? '' : 's'}`
		);
		const over = Math.max(m.overshoot.startEm, m.overshoot.endEm);
		if (over > 0.005) parts.push(`overshooting the letter by up to ${over} em`);
		if (m.combines === 'cut') parts.push('it cuts through the ink and stays solid outside');
		else if (m.combines === 'solid') parts.push('it sits on the ink as solid fill');
		else parts.push('it does not touch the letter');
	}
	return `${parts.join(', ')}.`;
}
