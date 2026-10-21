import { afterEach, describe, expect, it } from 'vitest';
import {
	LATIN_KERNEL_SIZE,
	countDrawnKernelGlyphs,
	getSetProgress,
	setSetProgressSource,
} from '../set_progress.js';

const drawn = { advanceWidth: 600, shapes: [{}] };
const empty = { advanceWidth: 600, shapes: [] };

afterEach(() => setSetProgressSource());

describe('Set progress (GF Latin Kernel)', () => {
	it('the set has 116 characters', () => {
		expect(LATIN_KERNEL_SIZE).toBe(116);
	});

	it('counts only Kernel glyphs that have outlines (spaces: an advance width)', () => {
		const project = {
			glyphs: {
				'glyph-0x41': drawn,
				'glyph-0x42': empty,
				'glyph-0x20AC': drawn,
				'glyph-0x20': { advanceWidth: 250, shapes: [] }, // space counts by width
				'glyph-0xE9': drawn, // é is outside the set
			},
		};
		expect(countDrawnKernelGlyphs(project)).toBe(3);
		expect(getSetProgress(project)).toEqual({ done: 3, total: 116, fraction: 3 / 116 });
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
