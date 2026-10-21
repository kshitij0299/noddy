import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentProjectEditor } from '../../app/main.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ITEM_CHANGED_TOPIC } from '../../project_editor/item_changed.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import {
	SPECIMEN_SIZE,
	SpecimenCard,
	WATERFALL_STEPS,
	ghostBoxForChar,
	getSpecimenMetrics,
	layoutSpecimenLine,
	makeSpacingString,
} from './specimen_card.js';

if (!customElements.get('specimen-card')) customElements.define('specimen-card', SpecimenCard);

/** Adds a rectangle outline to a glyph so it renders as a real letter. */
function drawRect(project, id, { x = 50, y = 0, w = 400, h = 1400, advance = 500 } = {}) {
	const glyph = project.getItem(id, true);
	glyph.addOneShape({
		name: 'rect',
		pathPoints: [
			{ p: { coord: { x, y } } },
			{ p: { coord: { x, y: y + h } } },
			{ p: { coord: { x: x + w, y: y + h } } },
			{ p: { coord: { x: x + w, y } } },
		],
	});
	glyph.advanceWidth = advance;
	return glyph;
}

function makeEditor() {
	const editor = new ProjectEditor();
	editor.project = new GlyphrStudioProject({});
	setCurrentProjectEditor(editor);
	return editor;
}

function mountCard(attributes = {}) {
	const card = /** @type {SpecimenCard} */ (document.createElement('specimen-card'));
	Object.entries(attributes).forEach(([key, value]) => card.setAttribute(key, value));
	document.body.appendChild(card);
	return card;
}

describe('Specimen card: ghost classification', () => {
	const metrics = getSpecimenMetrics(new GlyphrStudioProject({}));

	it('uses cap height for uppercase and figures', () => {
		expect(ghostBoxForChar('H', metrics)).toMatchObject({ kind: 'cap', yMin: 0, yMax: metrics.capHeight });
		expect(ghostBoxForChar('7', metrics)).toMatchObject({ kind: 'cap', yMin: 0, yMax: metrics.capHeight });
	});

	it('uses cap height for ascending lowercase and x-height for the rest', () => {
		expect(ghostBoxForChar('b', metrics)).toMatchObject({ kind: 'cap', yMax: metrics.capHeight });
		expect(ghostBoxForChar('a', metrics)).toMatchObject({ kind: 'x', yMin: 0, yMax: metrics.xHeight });
		expect(ghostBoxForChar('m', metrics).kind).toBe('x');
	});

	it('drops descenders below the baseline', () => {
		const g = ghostBoxForChar('g', metrics);
		expect(g.kind).toBe('descender');
		expect(g.yMin).toBe(metrics.descent);
		expect(g.yMin).toBeLessThan(0);
		expect(g.yMax).toBe(metrics.xHeight);
	});

	it('gives ghosts a 0.55 em width', () => {
		expect(ghostBoxForChar('H', metrics).width).toBe(Math.round(metrics.upm * 0.55));
	});

	it('builds a spacing string around the first letter', () => {
		expect(makeSpacingString('Hamburg')).toBe('HHHHHOHOO');
		expect(makeSpacingString('amburg')).toBe('nnannoaoo');
	});
});

describe('Specimen card: layout and rendering', () => {
	let editor;

	beforeEach(() => {
		editor = makeEditor();
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('lays out an empty project as seven ghosts', () => {
		const { items } = layoutSpecimenLine('Hamburg', editor.project);
		expect(items).toHaveLength(7);
		expect(items.every((i) => i.type === 'ghost')).toBe(true);
		expect(items.map((i) => i.box.kind)).toEqual(['cap', 'x', 'x', 'cap', 'x', 'x', 'descender']);
		expect(items.at(-1).x).toBeGreaterThan(items[0].x);
	});

	it('renders a glyph with an outline from its project path data, never a UI font', () => {
		const glyph = drawRect(editor.project, 'glyph-0x48');
		const card = mountCard();
		const letter = card.querySelector('.specimen__letter[data-item-id="glyph-0x48"]');
		expect(letter).not.toBeNull();
		expect(letter.querySelector('path').getAttribute('d')).toBe(glyph.svgPathData);
		expect(card.querySelectorAll('.specimen__ghost')).toHaveLength(6);
		expect(card.querySelector('svg').hasAttribute('data-font-content')).toBe(true);
		expect(card.querySelector('.specimen__stage').textContent.trim()).toBe('');
	});

	it('renders ghosts with class heights from the font metrics', () => {
		const card = mountCard();
		const metrics = getSpecimenMetrics(editor.project);
		const boxes = [...card.querySelectorAll('.specimen__ghost')].map((g) => ({
			kind: g.getAttribute('data-ghost-kind'),
			h: Number(g.querySelector('rect').getAttribute('height')),
		}));
		expect(boxes[0]).toEqual({ kind: 'cap', h: metrics.capHeight });
		expect(boxes[1]).toEqual({ kind: 'x', h: metrics.xHeight });
		expect(boxes[6]).toEqual({ kind: 'descender', h: metrics.xHeight - metrics.descent });
	});

	it('switches modes from the pill and keeps the radio group accessible', () => {
		const card = mountCard();
		const radios = card.querySelectorAll('[role="radio"]');
		expect(radios).toHaveLength(3);
		expect([...radios].map((r) => r.getAttribute('aria-label'))).toEqual(['Text', 'Spacing', 'Waterfall']);
		expect(radios[0].getAttribute('aria-checked')).toBe('true');

		radios[1].click();
		expect(card.mode).toBe('spacing');
		expect(radios[1].getAttribute('aria-checked')).toBe('true');
		expect(radios[0].getAttribute('aria-checked')).toBe('false');
		expect(card.querySelectorAll('.specimen__ghost')).toHaveLength('nnannoaoo'.length);

		radios[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		expect(card.mode).toBe('waterfall');
		expect(card.querySelectorAll('svg.specimen__row')).toHaveLength(WATERFALL_STEPS.length);
		expect(card.querySelectorAll('svg.specimen__row')[0].getAttribute('data-row-size')).toBe('160');
	});

	it('changes the size from the slider, clamped to the range', () => {
		const card = mountCard();
		const slider = /** @type {HTMLInputElement} */ (card.querySelector('input[type="range"]'));
		expect(slider.getAttribute('aria-label')).toBe('Size');
		expect(card.size).toBe(SPECIMEN_SIZE.default);
		expect(card.querySelector('.specimen__size-value').textContent).toBe('160');

		slider.value = '200';
		slider.dispatchEvent(new Event('input'));
		expect(card.size).toBe(200);
		expect(card.querySelector('.specimen__size-value').textContent).toBe('200');
		expect(card.querySelector('svg.specimen__row').getAttribute('data-row-size')).toBe('200');

		card.size = 9999;
		expect(card.size).toBe(SPECIMEN_SIZE.max);
	});

	it('redraws once per burst when itemChanged is published', async () => {
		vi.useFakeTimers();
		const card = mountCard();
		const redraw = vi.spyOn(card, 'redraw');
		editor.publish(ITEM_CHANGED_TOPIC, { id: 'glyph-0x48' });
		editor.publish(ITEM_CHANGED_TOPIC, { id: 'glyph-0x48' });
		expect(redraw).not.toHaveBeenCalled();
		vi.runAllTimers();
		expect(redraw).toHaveBeenCalledTimes(1);
		vi.useRealTimers();
	});

	it('picks up an outline drawn after mount on the next redraw', () => {
		const card = mountCard();
		expect(card.querySelectorAll('.specimen__letter')).toHaveLength(0);
		drawRect(editor.project, 'glyph-0x61');
		card.redraw();
		expect(card.querySelectorAll('.specimen__letter')).toHaveLength(1);
		expect(card.querySelectorAll('.specimen__ghost')).toHaveLength(6);
	});

	it('marks a drafting glyph with a solid box and ring, and calls the open hook on click', () => {
		drawRect(editor.project, 'glyph-0x48');
		const card = mountCard();
		const open = vi.fn();
		card.onOpenLetter = open;
		card.querySelector('.specimen__letter').dispatchEvent(new MouseEvent('click', { bubbles: true }));
		expect(open).toHaveBeenCalledWith('glyph-0x48');

		card.setDrafting(['glyph-0x67']);
		const drafting = card.querySelector('.specimen__drafting');
		expect(drafting).not.toBeNull();
		expect(drafting.querySelector('.specimen__box--drafting')).not.toBeNull();
		expect(drafting.querySelector('.specimen__ring')).not.toBeNull();
	});

	it('unsubscribes when removed from the document', () => {
		const card = mountCard();
		expect(editor.subscribers[ITEM_CHANGED_TOPIC]['specimen-card']).toBeTypeOf('function');
		card.remove();
		expect(editor.subscribers[ITEM_CHANGED_TOPIC]['specimen-card']).toBeUndefined();
	});
});
