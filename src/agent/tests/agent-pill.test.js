import { describe, expect, it, vi } from 'vitest';
import { createAgentPill, derivePillPhase, pillView } from '../ui/agent-pill.js';

describe('pill state → copy (#20)', () => {
	it('idle asks the agent (phone: "Agent"), no ring', () => {
		expect(pillView({ phase: 'idle' })).toMatchObject({ text: 'Ask the agent', ring: false });
		expect(pillView({ phase: 'idle', compact: true }).text).toBe('Agent');
	});

	it('running drafts a glyph with a count and a ring', () => {
		const view = pillView({ phase: 'running', glyph: 'g', done: 10, total: 62 });
		expect(view).toMatchObject({ text: 'Drafting g · 10/62', ring: true });
		expect(view.progress).toBeCloseTo(10 / 62);
		expect(pillView({ phase: 'running', glyph: 'a' })).toMatchObject({
			text: 'Drafting a',
			progress: null,
		});
	});

	it('needs you shows a dot and the review count, no ring', () => {
		expect(pillView({ phase: 'needs-you', review: 4 })).toMatchObject({
			text: '4 glyphs to review',
			dot: true,
			ring: false,
		});
		expect(pillView({ phase: 'needs-you', review: 1 }).text).toBe('1 glyph to review');
	});

	it('paused and failed carry an icon, not colour alone', () => {
		expect(pillView({ phase: 'paused', done: 10, total: 62 })).toMatchObject({
			text: 'Paused · 10/62',
			icon: 'pause',
		});
		expect(pillView({ phase: 'failed', done: 10, total: 62 })).toMatchObject({
			text: 'Stopped · 10/62',
			icon: 'error',
		});
	});

	it('a live run wins over paused, failed and review', () => {
		expect(derivePillPhase({ running: true, paused: true, review: 3 })).toBe('running');
		expect(derivePillPhase({ paused: true, failed: true })).toBe('paused');
		expect(derivePillPhase({ failed: true, review: 2 })).toBe('failed');
		expect(derivePillPhase({ review: 2 })).toBe('needs-you');
		expect(derivePillPhase({})).toBe('idle');
	});

	it('renders one button that expands', () => {
		const onExpand = vi.fn();
		const pill = createAgentPill({ onExpand });
		pill.render({ phase: 'needs-you', review: 4 });
		expect(pill.root.querySelector('.agent-pill__dot')).not.toBeNull();
		expect(pill.root.getAttribute('aria-label')).toContain('4 glyphs to review');
		pill.root.click();
		expect(onExpand).toHaveBeenCalledTimes(1);
	});
});
