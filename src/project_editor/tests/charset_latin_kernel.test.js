import { describe, expect, it } from 'vitest';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import {
	applyLatinKernelToProject,
	BASIC_LATIN_PRINTABLE,
	codePointToGlyphID,
	glyphIDToCodePoint,
	isInLatinKernel,
	LATIN_KERNEL_DEFAULT_GROUPS,
	LATIN_KERNEL_GROUPS,
	LATIN_KERNEL_NOTDEF,
	latinKernelAll,
	latinKernelBeyondBasicLatin,
	latinKernelCoverage,
	latinKernelEntry,
	latinKernelGlyphs,
	latinKernelGroup,
	latinKernelGroupOf,
	latinKernelLettersAndFigures,
	latinKernelRangeName,
	latinKernelRest,
	latinKernelUncoveredCodePoints,
	toCodePoint,
} from '../charset_latin_kernel.js';

// Reference: googlefonts/glyphsets data/results/nam/GF_Latin_Kernel.nam
// (116 code points, sorted). Fetched 2026-10-20.
const GF_LATIN_KERNEL_NAM = [
	...Array.from({ length: 0x7e - 0x20 + 1 }, (_, i) => 0x20 + i),
	0x00a0, 0x00a2, 0x00a3, 0x00a5, 0x00a9, 0x00ae, 0x00b0, 0x00b7, 0x00d7, 0x00f7,
	0x2013, 0x2014, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2026, 0x20ac, 0x2122, 0x2212,
];

function makeProject(characterRanges = []) {
	return new GlyphrStudioProject({
		settings: {
			project: { name: 'Kernel test', characterRanges },
			app: { guides: { custom: [] }, livePreviews: [] },
			font: { family: 'Kernel test' },
		},
	});
}

describe('GF Latin Kernel: list', () => {
	it('matches the GF_Latin_Kernel.nam reference exactly (116 code points)', () => {
		expect(GF_LATIN_KERNEL_NAM.length).toBe(116);
		const ours = latinKernelAll()
			.map((entry) => entry.codePoint)
			.sort((a, b) => a - b);
		expect(ours).toEqual(GF_LATIN_KERNEL_NAM);
	});

	it('has no duplicates and consecutive indexes', () => {
		const all = latinKernelAll();
		expect(new Set(all.map((e) => e.codePoint)).size).toBe(116);
		all.forEach((entry, i) => expect(entry.index).toBe(i));
	});

	it('is ordered by group: uppercase, lowercase, figures, punctuation, symbols, spaces', () => {
		const groupsInOrder = [];
		latinKernelAll().forEach((entry) => {
			if (groupsInOrder.at(-1) !== entry.group) groupsInOrder.push(entry.group);
		});
		expect(groupsInOrder).toEqual([...LATIN_KERNEL_GROUPS]);
	});

	it('has the documented group sizes', () => {
		expect(latinKernelGroup('uppercase').map((e) => e.char).join('')).toBe(
			'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
		);
		expect(latinKernelGroup('lowercase').map((e) => e.char).join('')).toBe(
			'abcdefghijklmnopqrstuvwxyz'
		);
		expect(latinKernelGroup('figures').map((e) => e.char).join('')).toBe('0123456789');
		expect(latinKernelGroup('punctuation').length).toBe(27);
		expect(latinKernelGroup('symbols').length).toBe(25);
		expect(latinKernelGroup('spaces').map((e) => e.codePoint)).toEqual([0x20, 0xa0]);
	});

	it('letters & figures = 62, the rest = 54, together = all', () => {
		const letters = latinKernelLettersAndFigures();
		const rest = latinKernelRest();
		expect(letters.length).toBe(62);
		expect(rest.length).toBe(54);
		expect([...letters, ...rest].map((e) => e.codePoint)).toEqual(
			latinKernelAll().map((e) => e.codePoint)
		);
		letters.forEach((e) => expect(LATIN_KERNEL_DEFAULT_GROUPS).toContain(e.group));
	});

	it('21 characters live outside Basic Latin', () => {
		const beyond = latinKernelBeyondBasicLatin();
		expect(beyond.length).toBe(21);
		beyond.forEach((e) => expect(e.codePoint).toBeGreaterThan(BASIC_LATIN_PRINTABLE.end));
	});

	it('glyph list adds .notdef first (117)', () => {
		const glyphs = latinKernelGlyphs();
		expect(glyphs.length).toBe(117);
		expect(glyphs[0]).toBe(LATIN_KERNEL_NOTDEF);
		expect(glyphs[0].name).toBe('.notdef');
		expect(glyphs[0].glyphID).toBe('glyph-0x0');
	});

	it('entries are frozen and carry project IDs', () => {
		const a = latinKernelEntry('A');
		expect(a).toMatchObject({ codePoint: 65, hex: '0x41', glyphID: 'glyph-0x41', char: 'A' });
		expect(Object.isFrozen(a)).toBe(true);
	});
});

describe('GF Latin Kernel: lookups and ID conversion', () => {
	it('converts code point <-> glyph ID', () => {
		expect(codePointToGlyphID(65)).toBe('glyph-0x41');
		expect(codePointToGlyphID(0x20ac)).toBe('glyph-0x20AC');
		expect(glyphIDToCodePoint('glyph-0x41')).toBe(65);
		expect(glyphIDToCodePoint('glyph-0x20AC')).toBe(0x20ac);
		expect(glyphIDToCodePoint('comp-0')).toBe(false);
		expect(glyphIDToCodePoint(42)).toBe(false);
	});

	it('accepts code points, hex IDs, glyph IDs and characters', () => {
		expect(toCodePoint(0x2212)).toBe(0x2212);
		expect(toCodePoint('0x2212')).toBe(0x2212);
		expect(toCodePoint('glyph-0x2212')).toBe(0x2212);
		expect(toCodePoint('−')).toBe(0x2212);
		expect(toCodePoint('')).toBe(false);
		expect(toCodePoint('AB')).toBe(false);
		expect(toCodePoint(1.5)).toBe(false);
	});

	it('membership', () => {
		expect(isInLatinKernel('A')).toBe(true);
		expect(isInLatinKernel(0xa0)).toBe(true);
		expect(isInLatinKernel('glyph-0x20AC')).toBe(true);
		expect(isInLatinKernel('é')).toBe(false); // Latin Core, not Kernel
		expect(isInLatinKernel(0x7f)).toBe(false); // DEL
		expect(isInLatinKernel(0xad)).toBe(false); // soft hyphen
		expect(isInLatinKernel('¡')).toBe(false);
	});

	it('group of a code point', () => {
		expect(latinKernelGroupOf('A')).toBe('uppercase');
		expect(latinKernelGroupOf('z')).toBe('lowercase');
		expect(latinKernelGroupOf('7')).toBe('figures');
		expect(latinKernelGroupOf('…')).toBe('punctuation');
		expect(latinKernelGroupOf('€')).toBe('symbols');
		expect(latinKernelGroupOf(0xa0)).toBe('spaces');
		expect(latinKernelGroupOf('glyph-0x0')).toBe('unencoded');
		expect(latinKernelGroupOf('.notdef')).toBe('unencoded');
		expect(latinKernelGroupOf('é')).toBe(null);
	});

	it('range names are readable', () => {
		expect(latinKernelRangeName(0x20ac)).toBe('Euro Sign');
		expect(latinKernelRangeName(0xa0)).toBe('Non-breaking Space');
	});
});

describe('GF Latin Kernel: applying to a project', () => {
	it('a new project only covers Basic Latin', () => {
		const project = makeProject();
		const uncovered = latinKernelUncoveredCodePoints(project);
		expect(uncovered.length).toBe(21);
		expect(uncovered).toEqual(latinKernelBeyondBasicLatin().map((e) => e.codePoint));
	});

	it('adds 21 single-code-point ranges to a new project and covers everything', () => {
		const project = makeProject();
		const before = project.settings.project.characterRanges.length;
		const added = applyLatinKernelToProject(project);

		expect(added.length).toBe(21);
		expect(project.settings.project.characterRanges.length).toBe(before + 21);
		added.forEach((range) => {
			expect(range.begin).toBe(range.end);
			expect(range.enabled).toBe(true);
			expect(range.isValid).toBe(true);
			expect(range.getMemberIDs().length).toBe(1);
		});
		expect(latinKernelUncoveredCodePoints(project)).toEqual([]);
		expect(added.find((r) => r.begin === 0x20ac).name).toBe('Euro Sign');
	});

	it('is idempotent', () => {
		const project = makeProject();
		applyLatinKernelToProject(project);
		const count = project.settings.project.characterRanges.length;
		expect(applyLatinKernelToProject(project)).toEqual([]);
		expect(project.settings.project.characterRanges.length).toBe(count);
	});

	it('adds the Basic Latin block when a project has no ranges at all', () => {
		const project = makeProject();
		project.settings.project.characterRanges.length = 0;
		const added = applyLatinKernelToProject(project);
		expect(added.length).toBe(22);
		expect(added[0]).toMatchObject({ begin: 0x20, end: 0x7f, name: 'Basic Latin' });
		expect(latinKernelUncoveredCodePoints(project)).toEqual([]);
	});

	it('can store every code point as its own range', () => {
		const project = makeProject();
		project.settings.project.characterRanges.length = 0;
		const added = applyLatinKernelToProject(project, { splitBasicLatin: true });
		expect(added.length).toBe(116);
		added.forEach((range) => expect(range.begin).toBe(range.end));
		expect(added.map((r) => r.begin).sort((a, b) => a - b)).toEqual(GF_LATIN_KERNEL_NAM);
	});

	it('ignores disabled ranges when deciding coverage', () => {
		const project = makeProject();
		project.settings.project.characterRanges.forEach((range) => (range.enabled = false));
		const added = applyLatinKernelToProject(project);
		expect(added.length).toBe(22);
		expect(latinKernelUncoveredCodePoints(project)).toEqual([]);
	});

	it('added ranges survive save() exactly like any other range', () => {
		const project = makeProject();
		applyLatinKernelToProject(project);
		const saved = project.save();
		const euro = saved.settings.project.characterRanges.find((r) => r.begin === '0x20AC');
		expect(euro).toEqual({ name: 'Euro Sign', begin: '0x20AC', end: '0x20AC' });
		// and load back
		const reloaded = new GlyphrStudioProject(saved);
		expect(latinKernelUncoveredCodePoints(reloaded)).toEqual([]);
	});

	it('coverage counts drawn glyphs per group', () => {
		const project = makeProject();
		let coverage = latinKernelCoverage(project);
		expect(coverage.total).toBe(116);
		expect(coverage.drawn).toBe(0);
		expect(coverage.missing.length).toBe(116);

		const capA = project.getItem('glyph-0x41', true);
		capA.addOneShape({
			name: 'box',
			pathPoints: [
				{ p: { coord: { x: 0, y: 0 } } },
				{ p: { coord: { x: 100, y: 0 } } },
				{ p: { coord: { x: 100, y: 100 } } },
			],
		});
		// an empty glyph object does not count as drawn...
		project.getItem('glyph-0x42', true);
		// ...except for spaces, which only need a width
		const space = project.getItem('glyph-0x20', true);
		space.advanceWidth = 250;

		coverage = latinKernelCoverage(project);
		expect(coverage.drawn).toBe(2);
		expect(coverage.byGroup.uppercase).toEqual({ total: 26, drawn: 1 });
		expect(coverage.byGroup.spaces).toEqual({ total: 2, drawn: 1 });
		expect(coverage.missing).toContain(0x42);
		expect(coverage.missing).not.toContain(0x41);
	});
});
