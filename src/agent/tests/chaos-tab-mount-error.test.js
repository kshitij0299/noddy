// Review of #137: if a tool fails partway through drawing, the sliders it already made (each its
// own React root) are unmounted before the error reaches the tab, which shows its fallback.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountChaosTool, resetChaosTabForTests } from '../ui/chaos/chaos-tab.js';

afterEach(() => {
	vi.restoreAllMocks();
	resetChaosTabForTests();
});

describe('Chaos tool mount failure', () => {
	it('unmounts the sliders already mounted, then rethrows', () => {
		const broken = {
			key: 'broken',
			type: 'int',
			min: 0,
			max: 10,
			default: 5,
			get label() {
				throw new Error('bad param');
			},
		};
		const op = {
			id: 'test-broken-tool',
			label: 'Broken',
			hint: '',
			params: [{ key: 'size', label: 'Size', type: 'int', min: 0, max: 10, default: 5 }, broken],
		};
		const created = [];
		const createElement = document.createElement.bind(document);
		vi.spyOn(document, 'createElement').mockImplementation((tag, options) => {
			const node = createElement(tag, options);
			created.push(node);
			return node;
		});
		const container = createElement('div');
		expect(() => mountChaosTool(container, op, { getEditor: () => null })).toThrow('bad param');
		// Chaos and Size were mounted before the broken param; both roots are empty again.
		const mounts = created.filter((node) => node.classList?.contains('nd-slider-mount'));
		expect(mounts).toHaveLength(2);
		for (const mount of mounts) expect(mount.childElementCount).toBe(0);
	});
});
