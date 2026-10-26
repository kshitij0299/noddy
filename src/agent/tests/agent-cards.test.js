import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { Glyph } from '../../project_data/glyph.js';
import { CARD_ACTION_EVENT, summarizeReceipt } from '../ui/cards/index.js';

/**
 * Project with outlines for the given chars only.
 * @param {String} chars - e.g. 'noH'
 * @returns {GlyphrStudioProject}
 */
function projectWith(chars) {
	const project = new GlyphrStudioProject();
	for (const char of chars) {
		const id = `glyph-0x${char.codePointAt(0).toString(16).toUpperCase()}`;
		project.glyphs[id] = new Glyph({
			id,
			parent: project,
			advanceWidth: 500,
			shapes: [
				{
					pathPoints: [
						{ p: { coord: { x: 50, y: 0 } } },
						{ p: { coord: { x: 50, y: 500 } } },
						{ p: { coord: { x: 450, y: 500 } } },
						{ p: { coord: { x: 450, y: 0 } } },
					],
				},
			],
		});
	}
	return project;
}

/**
 * @param {String} tag - element name
 * @param {Object} data - card data
 * @returns {any}
 */
function mount(tag, data) {
	const card = /** @type {any} */ (document.createElement(tag));
	card.render(data);
	document.body.append(card);
	return card;
}

/**
 * @param {HTMLElement} card - mounted card
 * @returns {{events: Object[], buttons: HTMLButtonElement[]}}
 */
function wire(card) {
	const events = [];
	card.addEventListener(CARD_ACTION_EVENT, (event) => events.push(event.detail));
	return { events, buttons: Array.from(card.querySelectorAll('button')) };
}

afterEach(() => {
	document.body.replaceChildren();
});

describe('agent card shell', () => {
	it('renders the shared shell, disables after an action and appends a step line', () => {
		const card = mount('agent-plan-card', { cardId: 'plan-1', spendCap: 'up to $1.20' });
		expect(card.querySelector('.agent-card')).not.toBeNull();
		const { events, buttons } = wire(card);
		buttons[0].click();
		expect(events).toHaveLength(1);
		expect(card.getAttribute('data-acted')).toBe('start');
		expect(buttons.every((b) => b.disabled)).toBe(true);
		expect(card.querySelector('agent-step-line')).not.toBeNull();
		// A second press is a no-op: the card fires once.
		buttons[1].click();
		card.fire('adjust');
		expect(events).toHaveLength(1);
	});

	it('buttons are real <button type=button>s in reading order and keyboard reachable', () => {
		const card = mount('agent-approval-card', { cardId: 'ok', project: false });
		const { events, buttons } = wire(card);
		expect(buttons.map((b) => b.textContent.trim())).toEqual([
			'checkApprove',
			'Tweak',
			'Edit by hand',
		]);
		for (const button of buttons) {
			expect(button.type).toBe('button');
			expect(button.tabIndex).toBe(0);
			expect(button.disabled).toBe(false);
		}
		buttons[1].focus();
		expect(document.activeElement).toBe(buttons[1]);
		// Enter / Space on a native button dispatch click; the card then locks
		// and keeps keyboard focus instead of dropping it to <body>.
		buttons[1].click();
		expect(events.map((e) => e.action)).toEqual(['tweak']);
		expect(buttons[1].disabled).toBe(true);
		expect(document.activeElement).toBe(card);
		expect(card.tabIndex).toBe(-1);
	});

	it('pointer activation without focus inside the card does not steal focus', () => {
		const outside = document.createElement('button');
		document.body.append(outside);
		outside.focus();
		const card = mount('agent-plan-card', { cardId: 'p' });
		card.fire('start');
		expect(document.activeElement).toBe(outside);
	});

	it('the data setter renders and re-rendering unlocks the card', () => {
		const card = /** @type {any} */ (document.createElement('agent-plan-card'));
		card.data = { cardId: 'p' };
		document.body.append(card);
		card.querySelector('button').click();
		expect(card.acted).toBe('start');
		card.render({ cardId: 'p2' });
		expect(card.acted).toBeNull();
		expect(card.querySelector('button').disabled).toBe(false);
		expect(card.querySelector('agent-step-line')).toBeNull();
	});
});

describe('<agent-plan-card>', () => {
	const data = {
		cardId: 'plan-1',
		spendCap: 'up to $1.20',
		specs: [
			{ label: 'x-height', value: 1117 },
			{ label: 'cap', value: 1489 },
			{ label: 'stems', value: 180 },
		],
		order: [{ label: 'noHO', selected: true }, { label: 'a–z' }, { label: 'A–Z' }, { label: '0–9' }],
	};

	it('renders spec chips, the order row and the spend cap from data', () => {
		const card = mount('agent-plan-card', data);
		expect(card.querySelector('.agent-card__title').textContent).toBe('Plan');
		expect(card.querySelector('.agent-card__meta').textContent).toBe('up to $1.20');
		const specs = Array.from(card.querySelectorAll('.agent-plan__specs .agent-chip')).map((c) =>
			c.textContent.trim()
		);
		expect(specs).toEqual(['x-height 1117', 'cap 1489', 'stems 180']);
		const order = Array.from(card.querySelectorAll('.agent-plan__order .agent-chip'));
		expect(order.map((c) => c.textContent.trim())).toEqual(['noHO', 'a–z', 'A–Z', '0–9']);
		expect(order[0].classList.contains('agent-chip--selected')).toBe(true);
		expect(card.querySelectorAll('.agent-plan__chevron')).toHaveLength(3);
		expect(card.querySelector('.agent-card__button--primary').textContent).toBe('Start');
		expect(card.querySelector('[data-action="adjust"]').textContent).toContain('Adjust');
	});

	it('Start and Adjust emit agent-card-action with the card id', () => {
		const card = mount('agent-plan-card', data);
		const { events } = wire(card);
		card.querySelector('[data-action="start"]').click();
		expect(events[0]).toEqual({
			action: 'start',
			cardId: 'plan-1',
			first: 'noHO',
			spendCap: 'up to $1.20',
		});
		expect(card.querySelector('agent-step-line').textContent).toContain(
			'Plan started · noHO first, up to $1.20'
		);
		const other = mount('agent-plan-card', data);
		const wired = wire(other);
		other.querySelector('[data-action="adjust"]').click();
		expect(wired.events[0]).toEqual({ action: 'adjust', cardId: 'plan-1' });
	});
});

describe('<agent-approval-card>', () => {
	it('renders n o H O from project outlines and ghosts when missing', () => {
		const card = mount('agent-approval-card', { cardId: 'style', project: projectWith('noH') });
		expect(card.querySelector('.agent-card__meta').textContent).toBe('4 glyphs');
		const cells = Array.from(card.querySelectorAll('.agent-glyph-well .agent-glyph-art'));
		expect(cells.map((c) => c.dataset.char)).toEqual(['n', 'o', 'H', 'O']);
		expect(cells.map((c) => c.dataset.source)).toEqual(['outline', 'outline', 'outline', 'ghost']);
		expect(cells[0].querySelector('svg path').getAttribute('d')).toMatch(/^M/);
		expect(cells[0].hasAttribute('data-font-content')).toBe(true);
		expect(cells[3].querySelector('.agent-glyph-ghost')).not.toBeNull();
		expect(cells[3].getAttribute('aria-label')).toBe('O missing');
	});

	it('renders without a project (all ghosts) and accepts a string of glyphs', () => {
		const card = mount('agent-approval-card', { cardId: 'style', glyphs: 'ab', project: false });
		expect(card.querySelector('.agent-card__meta').textContent).toBe('2 glyphs');
		const cells = Array.from(card.querySelectorAll('.agent-glyph-art'));
		expect(cells.map((c) => c.dataset.source)).toEqual(['ghost', 'ghost']);
		const one = mount('agent-approval-card', { glyphs: ['n'], project: false });
		expect(one.querySelector('.agent-card__meta').textContent).toBe('1 glyph');
	});

	it('Approve / Tweak / Edit by hand emit the right payloads', () => {
		const make = () => mount('agent-approval-card', { cardId: 'style', project: false });
		let card = make();
		let { events } = wire(card);
		card.querySelector('[data-action="approve"]').click();
		expect(events[0]).toEqual({
			action: 'approve',
			cardId: 'style',
			glyphIds: ['glyph-0x6E', 'glyph-0x6F', 'glyph-0x48', 'glyph-0x4F'],
		});
		expect(card.querySelector('agent-step-line').textContent).toContain('Style approved · n o H O');

		card = make();
		({ events } = wire(card));
		card.querySelector('[data-action="tweak"]').click();
		expect(events[0]).toEqual({ action: 'tweak', cardId: 'style', prefill: 'Tweak: ' });

		card = make();
		({ events } = wire(card));
		card.querySelector('[data-action="edit-by-hand"]').click();
		expect(events[0]).toEqual({
			action: 'edit-by-hand',
			cardId: 'style',
			char: 'n',
			glyphId: 'glyph-0x6E',
		});
	});
});

describe('<agent-receipt-card>', () => {
	const rows = (chars, failed = '') =>
		Array.from(chars).map((char) => ({
			char,
			status: failed.includes(char) ? 'failed' : 'new',
		}));

	it('summarises counts and pluralises', () => {
		expect(summarizeReceipt(rows('abcdefghijklmnopqrstuvw', 'k')).summary).toBe('22 new · 1 failed');
		expect(summarizeReceipt(rows('a')).summary).toBe('1 new');
		expect(summarizeReceipt([{ char: 'g', status: 'changed' }]).summary).toBe('1 changed');
		expect(summarizeReceipt(rows('ab', 'ab')).summary).toBe('0 edits applied · 2 failed');
		expect(summarizeReceipt([]).summary).toBe('0 edits applied');
		// M7: rows already kept or reverted elsewhere are not counted in Keep N.
		const live = [
			{ char: 'a', status: 'new' },
			{ char: 'b', status: 'kept' },
			{ char: 'k', status: 'failed' },
		];
		expect(summarizeReceipt(live)).toMatchObject({ applied: 1, kept: 1, failed: 1 });
		expect(summarizeReceipt(live).summary).toBe('1 new · 1 kept · 1 failed');
		expect(
			summarizeReceipt([
				{ char: 'a', status: 'yours' },
				{ char: 'b', status: 'reverted' },
			]).summary
		).toBe('1 Yours · 1 reverted');
	});

	it('renders the strip from outlines, marks the failed glyph and offers Keep N / Retry k', () => {
		const card = mount('agent-receipt-card', {
			cardId: 'r1',
			glyphs: rows('abcdefghijklmnopqrstuvw', 'k'),
			project: projectWith('abcdefghij'),
		});
		const cells = Array.from(card.querySelectorAll('.agent-glyph-strip .agent-glyph-art'));
		expect(cells).toHaveLength(23);
		expect(cells[0].dataset.source).toBe('outline');
		expect(cells[10].dataset.source).toBe('ghost'); // k failed -> ghost
		expect(cells[10].classList.contains('agent-glyph-art--failed')).toBe(true);
		expect(cells[10].querySelector('.agent-glyph-art__badge').textContent).toContain('error');
		expect(cells[10].querySelector('.agent-sr-only').textContent).toBe('failed');
		// With many glyphs each one is a button that names it and its state.
		expect(cells[10].closest('button').getAttribute('aria-label')).toBe('k, failed');
		expect(card.querySelector('.agent-receipt__summary').textContent.trim()).toBe(
			'22 new · 1 failed'
		);
		const buttons = Array.from(card.querySelectorAll('.agent-receipt__actions button'));
		expect(buttons.map((b) => b.textContent.trim())).toEqual([
			'checkKeep 22',
			'refreshRetry k',
			'undoUndo 22',
		]);
		expect(card.querySelector('.agent-card .agent-card__button')).toBeNull(); // actions live below
	});

	it('Keep and Retry emit the applied / failed glyph ids and lock the card', () => {
		const data = { cardId: 'r1', glyphs: rows('abk', 'k'), project: false };
		let card = mount('agent-receipt-card', data);
		let { events } = wire(card);
		card.querySelector('[data-action="keep"]').click();
		expect(events[0]).toEqual({ action: 'keep', cardId: 'r1', glyphIds: ['glyph-0x61', 'glyph-0x62'] });
		expect(card.querySelector('[data-action="retry"]').disabled).toBe(true);
		expect(card.querySelector('agent-step-line').textContent).toContain('Kept 2 glyphs');

		card = mount('agent-receipt-card', data);
		({ events } = wire(card));
		card.querySelector('[data-action="retry"]').click();
		expect(events[0]).toEqual({ action: 'retry', cardId: 'r1', glyphIds: ['glyph-0x6B'] });
	});

	it('shows "0 edits applied" with an info icon when nothing actually changed', () => {
		const card = mount('agent-receipt-card', { cardId: 'r0', glyphs: [], project: false });
		const summary = card.querySelector('.agent-receipt__summary .agent-chip');
		expect(summary.textContent).toContain('0 edits applied');
		expect(summary.querySelector('.agent-chip__icon').textContent).toBe('info');
		expect(card.querySelector('[data-action="keep"]')).toBeNull();
		expect(card.querySelector('.agent-receipt__actions')).toBeNull();
		const retryOnly = mount('agent-receipt-card', { glyphs: rows('xy', 'xy'), project: false });
		expect(retryOnly.querySelector('[data-action="keep"]')).toBeNull();
		expect(retryOnly.querySelector('[data-action="retry"]').textContent).toContain('Retry 2');
	});
});

describe('<agent-receipt-card> Remix seeds (PR D)', () => {
	it('shows a Remix take’s seed and offers Re-roll instead of Retry', () => {
		const single = mount('agent-receipt-card', {
			cardId: 'r2',
			glyphs: [{ char: 'b', status: 'changed', seed: 4821 }],
			project: false,
		});
		expect(single.querySelector('.agent-receipt__seed').textContent).toBe('seed 4821');
		const labels = [...single.querySelectorAll('.agent-receipt__actions button')].map((b) =>
			b.textContent.trim()
		);
		expect(labels).toEqual(['checkKeep b', 'casinoRe-roll b', 'undoUndo']);
		const { events } = wire(single);
		single.querySelector('[data-action="reroll"]').click();
		expect(events[0]).toEqual({ action: 'reroll', cardId: 'r2', glyphIds: ['glyph-0x62'] });
	});

	it('names the seed per glyph in a multi-glyph receipt; a plain draft keeps Retry', () => {
		const card = mount('agent-receipt-card', {
			cardId: 'r3',
			glyphs: [
				{ char: 'b', status: 'changed', seed: 7 },
				{ char: 'c', status: 'changed' },
			],
			project: false,
		});
		const [b, c] = card.querySelectorAll('.agent-glyph-pick');
		expect(b.getAttribute('aria-label')).toBe('b, draft, seed 7');
		b.click();
		const row = card.querySelector('.agent-receipt__glyph-actions');
		expect(row.querySelector('.agent-receipt__seed').textContent).toBe('seed 7');
		expect(row.querySelector('[data-action="reroll-one"]')).not.toBeNull();
		expect(row.querySelector('[data-action="retry-one"]')).toBeNull();
		card.querySelector('.agent-glyph-pick[data-char="c"]').click();
		const plain = card.querySelector('.agent-receipt__glyph-actions');
		expect(plain.querySelector('[data-action="retry-one"]')).not.toBeNull();
		expect(plain.querySelector('.agent-receipt__seed')).toBeNull();
		expect(c.getAttribute('aria-label')).toBe('c, draft');
	});
});

describe('<agent-step-line>', () => {
	it('renders icon, sr-only status and Mono text; unknown tone falls back to info', () => {
		const line = mount('agent-step-line', { tone: 'kept', text: 'Style approved · n o H O' });
		expect(line.dataset.tone).toBe('kept');
		expect(line.querySelector('.agent-step-line__icon').textContent).toBe('check_circle');
		expect(line.querySelector('.agent-sr-only').textContent).toBe('Done: ');
		expect(line.querySelector('.agent-step-line__text').classList.contains('text-mono-small')).toBe(
			true
		);
		const yours = mount('agent-step-line', { tone: 'yours', text: 'You redrew a by hand' });
		expect(yours.querySelector('.agent-step-line__icon').textContent).toBe('edit');
		const failed = mount('agent-step-line', { tone: 'failed', text: 'k failed' });
		expect(failed.querySelector('.agent-sr-only').textContent).toBe('Failed: ');
		const odd = mount('agent-step-line', { tone: 'nope', text: 'x' });
		expect(odd.dataset.tone).toBe('info');
	});

	it('is registered once and tolerates repeated registration', async () => {
		const mod = await import('../ui/cards/index.js');
		expect(() => mod.registerAgentCards()).not.toThrow();
		expect(customElements.get('agent-step-line')).toBe(mod.AgentStepLine);
		vi.restoreAllMocks();
	});
});

describe('agent-cards.css beats the legacy global button rules', () => {
	const css = fs
		.readFileSync(path.resolve(__dirname, '../ui/cards/agent-cards.css'), 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '');
	const rules = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let match;
	while ((match = re.exec(css)) !== null) {
		for (const selector of match[1].split(',')) {
			rules.push({ selector: selector.trim(), declarations: match[2] });
		}
	}
	/** (ids, classes/attrs/pseudo-classes, elements) — :not() counts its argument */
	const specificity = (selector) => {
		const s = selector.replace(/:not\(([^)]*)\)/g, '$1');
		const ids = (s.match(/#[\w-]+/g) || []).length;
		const classes = (s.match(/\.[\w-]+|\[[^\]]+\]|:(?!:)[\w-]+/g) || []).length;
		const elements = (s.match(/(^|[\s>+~(])[a-z][\w-]*/g) || []).length;
		return [ids, classes, elements];
	};
	/**
	 * The legacy rules are `button` (0,0,1) at rest and `button:hover` /
	 * `button:focus` / `button[disabled]` (0,1,1) for states. A rest selector
	 * must beat (0,0,1); any selector carrying a state must beat (0,1,1).
	 */
	const beatsLegacy = ([i, c, e], selector) => {
		const stateful = /:(hover|focus|focus-visible|active|disabled)/.test(selector);
		if (i > 0) return true;
		return stateful ? c > 1 || (c === 1 && e > 1) : c > 0 || e > 1;
	};
	const PINNED = ['padding', 'margin', 'border-radius', 'border', 'background-color', 'box-shadow', 'color'];
	const STATES = ['', ':hover', ':focus', ':focus-visible', ':active', ':disabled', ':disabled:hover'];

	it('every state of .agent-card__button pins its box metrics at specificity above button:hover (0,1,1)', () => {
		for (const state of STATES) {
			const selector = `button.agent-card__button${state}`;
			const rule = rules.find((r) => r.selector === selector);
			expect(rule, `rule for ${selector}`).toBeDefined();
			expect(beatsLegacy(specificity(rule.selector), rule.selector), `${selector} specificity`).toBe(
				true
			);
			for (const prop of PINNED) {
				expect(rule.declarations, `${selector} pins ${prop}`).toMatch(new RegExp(`(^|;|\\s)${prop}\\s*:`));
			}
		}
	});

	it('no button rule in the cards stylesheet is weaker than the legacy global state rules', () => {
		for (const rule of rules) {
			if (!rule.selector.includes('agent-card__button')) continue;
			if (rule.selector.includes('agent-card__icon')) continue;
			expect(beatsLegacy(specificity(rule.selector), rule.selector), rule.selector).toBe(true);
		}
	});

	it('the variant hover/disabled rules never change geometry, only paint', () => {
		for (const rule of rules) {
			if (!/agent-card__button--(primary|secondary|ghost)/.test(rule.selector)) continue;
			expect(rule.declarations).not.toMatch(/(^|;|\s)(padding|margin|border-radius|border|box-shadow|height)\s*:/);
		}
	});
});
