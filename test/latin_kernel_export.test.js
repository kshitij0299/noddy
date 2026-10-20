import { FontFlux } from 'font-flux-js';
import { describe, expect, it } from 'vitest';
import { setCurrentProjectEditor } from '../src/app/main.js';
import { ioFont_exportFont } from '../src/formats_io/otf/font_export.js';
import { ioFont_importFont } from '../src/formats_io/otf/font_import.js';
import {
	applyLatinKernelToProject,
	latinKernelAll,
	latinKernelCoverage,
} from '../src/project_editor/charset_latin_kernel.js';
import { importGlyphrProjectFromText } from '../src/project_editor/import_project.js';
import { ProjectEditor } from '../src/project_editor/project_editor.js';

/**
 * GF Latin Kernel export round trip.
 *
 * The set is applied to an empty project, one glyph per Kernel character is
 * drawn through the project API, and the project is exported as a font through
 * the existing exporter (nothing mocked) and read back. Every code point must
 * be present. The OTF export list only looks inside enabled character ranges,
 * so this also proves that the single-code-point ranges the set adds are
 * honoured by the exporter.
 */

function squareShape(x) {
	return {
		name: 'box',
		pathPoints: [
			{ p: { coord: { x, y: 0 } } },
			{ p: { coord: { x: x + 200, y: 0 } } },
			{ p: { coord: { x: x + 200, y: 500 } } },
			{ p: { coord: { x, y: 500 } } },
		],
	};
}

/** An empty v2 project with the default Basic Latin range and no glyphs. */
function makeEmptyProjectText() {
	return JSON.stringify({
		settings: {
			project: {
				name: 'Kernel Round Trip',
				latestVersion: '2.5.0',
				initialVersion: '2.5.0',
				id: 'g2_KERNEL',
				characterRanges: [{ name: 'Basic Latin', begin: '0x20', end: '0x7F' }],
			},
			font: { family: 'KernelTest', upm: 1000, ascent: 800, descent: -200 },
			app: { exportUneditedItems: true, exportLigatures: false, exportKerning: false },
		},
		glyphs: {},
		components: {},
		ligatures: {},
		kerning: {},
	});
}

/** Draws one glyph per Kernel character through the project API (like the editor or the agent would). */
function drawAllKernelGlyphs(project) {
	latinKernelAll().forEach((entry, i) => {
		const glyph = project.getItem(entry.glyphID, true);
		if (entry.group === 'spaces') {
			glyph.advanceWidth = 250;
		} else {
			glyph.addOneShape(squareShape(50 + (i % 5)));
			glyph.advanceWidth = 300;
		}
	});
}

async function exportAndReopen(project, suffix) {
	const editor = new ProjectEditor({ project });
	setCurrentProjectEditor(editor);
	const buffer = await ioFont_exportFont(suffix, true);
	return FontFlux.open(buffer);
}

function exportedCodePoints(font) {
	const set = new Set();
	font.glyphs.forEach((glyph) => {
		if (typeof glyph.unicode === 'number') set.add(glyph.unicode);
		(glyph.unicodes || []).forEach((u) => set.add(u));
	});
	return set;
}

const KERNEL_CODE_POINTS = latinKernelAll().map((e) => e.codePoint);

describe('GF Latin Kernel export round trip', () => {
	it('applying the set first keeps the project bounded: Basic Latin + 21 single ranges', () => {
		const project = importGlyphrProjectFromText(makeEmptyProjectText());
		expect(applyLatinKernelToProject(project).length).toBe(21);
		drawAllKernelGlyphs(project);

		const ranges = project.settings.project.characterRanges;
		expect(ranges.length).toBe(22);
		ranges.forEach((range) => expect(range.enabled).toBe(true));
		// Drawing did not pull in whole Unicode blocks (the 21 extras span five
		// of them, 683 cells in total); every cell listed is a Kernel character.
		const listed = ranges.flatMap((range) => range.getMemberIDs());
		expect(listed.length).toBe(95 + 21); // 95 printable Basic Latin + 21
		expect(latinKernelCoverage(project).drawn).toBe(116);
	});

	it('without the set, drawing the same glyphs pulls in five extra Unicode blocks', () => {
		const project = importGlyphrProjectFromText(makeEmptyProjectText());
		drawAllKernelGlyphs(project);
		const ranges = project.settings.project.characterRanges;
		expect(ranges.length).toBe(6);
		const listed = ranges.flatMap((range) => range.getMemberIDs());
		expect(listed.length).toBeGreaterThan(600);
	});

	it('every one of the 116 code points is in the exported OTF, plus .notdef', async () => {
		const project = importGlyphrProjectFromText(makeEmptyProjectText());
		applyLatinKernelToProject(project);
		drawAllKernelGlyphs(project);

		const font = await exportAndReopen(project, 'otf');
		const exported = exportedCodePoints(font);
		const missing = KERNEL_CODE_POINTS.filter((cp) => !exported.has(cp));
		expect(missing).toEqual([]);

		// .notdef is created by the exporter and sits at index 0
		expect(font.glyphs[0].name).toBe('.notdef');
		// 116 encoded + .notdef, nothing else
		expect(font.glyphs.length).toBe(117);
	});

	it('the exported font re-imports as a project with all 116 glyphs drawn', async () => {
		const project = importGlyphrProjectFromText(makeEmptyProjectText());
		applyLatinKernelToProject(project);
		drawAllKernelGlyphs(project);

		const font = await exportAndReopen(project, 'ttf');
		const reimported = await ioFont_importFont(font, true);
		expect(reimported).toBeTruthy();

		const coverage = latinKernelCoverage(reimported);
		expect(coverage.missing).toEqual([]);
		expect(coverage.drawn).toBe(116);
		// Geometry of a sample glyph survived
		const euro = reimported.glyphs['glyph-0x20AC'];
		expect(euro.shapes.length).toBe(1);
		expect(euro.advanceWidth).toBe(300);
	});
});
