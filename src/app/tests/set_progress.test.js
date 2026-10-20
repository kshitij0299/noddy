import { afterEach, describe, expect, it } from 'vitest';
import {
	LATIN_KERNEL_CODEPOINTS,
	LATIN_KERNEL_SIZE,
	countDrawnKernelGlyphs,
	getSetProgress,
	kernelGlyphID,
	setSetProgressSource,
} from '../set_progress.js';

const drawn = { shapes: [{}] };
const empty = { shapes: [] };

afterEach(() => setSetProgressSource());

describe('Set progress (GF Latin Kernel)', () => {
	it('the set has 116 unique code points: ASCII printable plus the 21 extras', () => {
		expect(LATIN_KERNEL_SIZE).toBe(116);
		expect(new Set(LATIN_KERNEL_CODEPOINTS).size).toBe(116);
		expect(LATIN_KERNEL_CODEPOINTS[0]).toBe(0x20);
		expect(LATIN_KERNEL_CODEPOINTS).toContain(0x7e);
		expect(LATIN_KERNEL_CODEPOINTS).not.toContain(0x7f);
		expect(LATIN_KERNEL_CODEPOINTS).toContain(0x20ac);
		expect(LATIN_KERNEL_CODEPOINTS).toContain(0x2212);
	});

	it('glyph IDs use upper-case hex like charToHex', () => {
		expect(kernelGlyphID(0x41)).toBe('glyph-0x41');
		expect(kernelGlyphID(0x20ac)).toBe('glyph-0x20AC');
	});

	it('counts only Kernel glyphs that have outlines', () => {
		const project = {
			glyphs: {
				'glyph-0x41': drawn,
				'glyph-0x42': empty,
				'glyph-0x20AC': drawn,
				'glyph-0xE9': drawn, // é is outside the set
			},
		};
		expect(countDrawnKernelGlyphs(project)).toBe(2);
		expect(getSetProgress(project)).toEqual({ done: 2, total: 116, fraction: 2 / 116 });
		expect(getSetProgress({})).toEqual({ done: 0, total: 116, fraction: 0 });
	});

	it('the M2.5 status store can replace the count source and it is clamped', () => {
		setSetProgressSource(() => 500);
		expect(getSetProgress({}).done).toBe(116);
		setSetProgressSource(() => 7);
		expect(getSetProgress({}).done).toBe(7);
		setSetProgressSource();
		expect(getSetProgress({}).done).toBe(0);
	});
});
