import { afterEach, describe, expect, it, vi } from 'vitest';
import { GLYPH_STATUSES } from '../../project_editor/glyph-status.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import {
	REVIEW_STATUSES,
	isReviewFilterOn,
	needsReview,
	onReviewFilterChange,
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

	it('reviewIDs counts the 116-glyph set by default, in set order', () => {
		const editor = new ProjectEditor();
		editor.glyphStatus.set('glyph-0x21', 'draft', 'agent'); // "!"
		editor.glyphStatus.set('glyph-0x61', 'draft', 'agent'); // "a"
		editor.glyphStatus.set('glyph-0x62', 'kept', 'user');
		editor.glyphStatus.set('glyph-0x63', 'failed', 'agent');
		editor.glyphStatus.set('glyph-0xE9', 'draft', 'agent'); // outside the set
		expect(reviewIDs(editor)).toEqual(['glyph-0x61', 'glyph-0x21']);
		expect(reviewIDs(editor, ['glyph-0xE9', 'glyph-0x62'])).toEqual(['glyph-0xE9']);
		expect(reviewIDs(null)).toEqual([]);
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
