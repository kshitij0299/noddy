import { afterEach, describe, expect, it, vi } from 'vitest';
import { GLYPH_STATUSES } from '../../project_editor/glyph-status.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import {
	REVIEW_STATUSES,
	isReviewFilterOn,
	needsReview,
	onReviewFilterChange,
	reviewCount,
	reviewEntries,
	reviewIDs,
	setReviewFilter,
} from './review-filter.js';

describe('review-filter (#135)', () => {
	let off = () => {};
	afterEach(() => off());

	it('only agent Drafts are to review (the agent pill counts the same)', () => {
		expect(REVIEW_STATUSES).toEqual(['draft']);
		expect(GLYPH_STATUSES.filter(needsReview)).toEqual(['draft']);
	});

	it('reviewIDs is every draft in the project: the 116 set in set order, then by code point', () => {
		const editor = new ProjectEditor();
		editor.glyphStatus.set('glyph-0x203D', 'draft', 'agent'); // "‽", outside the set
		editor.glyphStatus.set('glyph-0x21', 'draft', 'agent'); // "!"
		editor.glyphStatus.set('glyph-0x61', 'draft', 'agent'); // "a"
		editor.glyphStatus.set('glyph-0x62', 'kept', 'user');
		editor.glyphStatus.set('glyph-0x63', 'failed', 'agent');
		editor.glyphStatus.set('glyph-0xE9', 'draft', 'agent'); // "é", outside the set
		expect(reviewIDs(editor)).toEqual(['glyph-0x61', 'glyph-0x21', 'glyph-0xE9', 'glyph-0x203D']);
		expect(reviewCount(editor)).toBe(4);
		expect(reviewIDs(null)).toEqual([]);
		expect(reviewCount(null)).toBe(0);
	});

	it('reviewEntries labels glyphs outside the set from their ID', () => {
		const editor = new ProjectEditor();
		editor.glyphStatus.set('glyph-0x61', 'draft', 'agent');
		editor.glyphStatus.set('glyph-0x203C', 'draft', 'agent');
		const [inSet, outside] = reviewEntries(editor);
		expect(inSet.group).toBe('lowercase');
		expect(outside).toEqual({
			glyphID: 'glyph-0x203C',
			char: '‼',
			codePoint: 0x203c,
			hex: '0x203C',
		});
	});

	it('the flag is per editor, in memory, and fires one event per real change', () => {
		const one = new ProjectEditor();
		const two = new ProjectEditor();
		const seen = vi.fn();
		off = onReviewFilterChange((event) => seen(event.detail));

		expect(setReviewFilter(one, true)).toBe(true);
		expect(setReviewFilter(one, true)).toBe(false);
		expect(isReviewFilterOn(one)).toBe(true);
		expect(isReviewFilterOn(two)).toBe(false);
		expect(setReviewFilter(one, false)).toBe(true);
		expect(seen.mock.calls).toEqual([[{ editor: one, on: true }], [{ editor: one, on: false }]]);
		expect(setReviewFilter(null, true)).toBe(false);
	});
});
