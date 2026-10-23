import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * The owner's "the form structure looks ugly: some boxes are this length, some that length".
 * jsdom has no layout, so the grid is pinned where it lives, in the stylesheet: one content
 * width, one control height token, labels above, helper text under, the same action stack.
 * The real widths and heights are measured in Chrome (docs/agentic/screenshots/82).
 */
const css = fs.readFileSync(path.resolve(__dirname, '../ui/agent-panel.css'), 'utf8');

/**
 * Every plain rule, comments removed and @media headers dropped so their rules count too.
 * @returns {Array<{selector: string, body: string}>}
 */
function rules(source) {
	const flat = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@media[^{]*\{/g, '');
	const out = [];
	const pattern = /([^{}]+)\{([^{}]*)\}/g;
	let match;
	while ((match = pattern.exec(flat))) {
		out.push({ selector: match[1].trim().replace(/\s+/g, ' '), body: match[2] });
	}
	return out;
}
const all = rules(css);
const declaration = (body, name) => {
	const found = new RegExp(`(?:^|[;\\s])${name}\\s*:\\s*([^;]+)`).exec(body);
	return found ? found[1].trim() : null;
};
/** Rules whose selector list has exactly this selector in it. */
const rulesFor = (selector) =>
	all.filter((rule) => rule.selector.split(',').some((part) => part.trim() === selector));
const valueOf = (selector, property) =>
	rulesFor(selector)
		.map((rule) => declaration(rule.body, property))
		.filter(Boolean);

// Every class the connect flow owns (prefix match: .agent-field__box, .agent-models__list, ...).
const FAMILY = /\.agent-(connect|field|provider|models?|connected|error|badge|link)/;

describe('one form grid for the connect flow (#82)', () => {
	it('has one control height token, 40px, and 44px for fingers', () => {
		const host = rulesFor('.agent-connect-host').find((rule) => /--control-h/.test(rule.body));
		expect(declaration(host.body, '--control-h')).toBe('40px');
		const coarse = css.match(
			/@media \(pointer: coarse\), \(max-width: 759px\) \{\s*\.agent-connect-host \{\s*--control-h: (\d+px)/
		);
		expect(coarse?.[1]).toBe('44px');
	});

	it('fields, the search field, the Connected row and the primary and Back buttons all use that token', () => {
		expect(valueOf('.agent-field__box', 'height')).toContain('var(--control-h)');
		expect(valueOf('.agent-connected', 'height')).toContain('var(--control-h)');
		const button = 'form.agent-connect .agent-connect__actions button.agent-card__button';
		expect(valueOf(button, 'height')).toEqual(['var(--control-h)']);
		expect(valueOf(button, 'width')).toEqual(['100%']);
		// And in every state: hover, focus, active and disabled keep the same box.
		for (const state of [':hover', ':focus', ':active', ':disabled']) {
			expect(valueOf(button + state, 'height')).toEqual(['var(--control-h)']);
		}
		// Single-line list rows are at least the same height.
		expect(valueOf('.agent-models__list .agent-model', 'min-height')).toContain('var(--control-h)');
	});

	it('every field, list, provider row and action is the full content width: 100%, never a pixel width', () => {
		expect(valueOf('.agent-field__box', 'width')).toContain('100%');
		for (const selector of ['button.agent-provider', 'form.agent-connect', '.agent-connected']) {
			expect(valueOf(selector, 'width')).toContain('100%');
		}
		// The list has no width of its own: it is a block in a column.
		expect(valueOf('.agent-models__list', 'width')).toEqual([]);
	});

	it('no rule in the connect family sets a fixed pixel width, except the card, an inside icon and the spinner', () => {
		const allowed = new Map([
			['.agent-connect-host', ['352px']],
			['button.agent-field__icon-button', ['28px']],
			['.agent-connect__spinner', ['14px']],
		]);
		const offenders = [];
		for (const rule of all) {
			if (!FAMILY.test(rule.selector)) continue;
			for (const property of ['width', 'min-width', 'max-width']) {
				const value = declaration(rule.body, property);
				if (!value || !/\d+px/.test(value)) continue;
				const ok = [...allowed].some(
					([selector, values]) => rule.selector.includes(selector) && values.includes(value)
				);
				if (!ok) offenders.push(`${rule.selector} { ${property}: ${value} }`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('is one column: no grid or flex row puts two controls side by side in the form', () => {
		// Labels share a row with their action link; the progress bar is one row of three segments.
		// Nothing else in the form is laid out in columns.
		const columns = all.filter(
			(rule) =>
				FAMILY.test(rule.selector) &&
				/grid-template-columns/.test(rule.body) &&
				!rule.selector.includes('__progress') &&
				!rule.selector.includes('__details')
		);
		expect(columns.map((rule) => rule.selector)).toEqual([]);
		expect(valueOf('.agent-connect__actions', 'flex-direction')).toContain('column');
		expect(valueOf('.agent-connect__providers', 'flex-direction')).toContain('column');
	});

	it('the rhythm sits on the 4px grid: only spacing tokens, 56px provider rows, 4px bar', () => {
		const spacing = [];
		for (const rule of all) {
			if (!FAMILY.test(rule.selector)) continue;
			for (const property of ['gap', 'margin', 'padding', 'margin-top', 'margin-bottom']) {
				const value = declaration(rule.body, property);
				if (!value) continue;
				for (const px of value.match(/(?<![\w-])-?\d+(?:\.\d+)?px/g) ?? []) {
					const n = Math.abs(parseFloat(px));
					// 1px and 2px are hairlines; everything else must be a multiple of 4.
					if (n > 2 && n % 4 !== 0) spacing.push(`${rule.selector} { ${property}: ${value} }`);
				}
			}
		}
		expect(spacing).toEqual([]);
		expect(valueOf('button.agent-provider', 'height')).toContain('56px');
		expect(valueOf('.agent-connect__progress', 'height')).toContain('var(--space-1)');
	});

	it('labels sit above their field and helper or error text sits directly under it', () => {
		expect(valueOf('.agent-field', 'flex-direction')).toContain('column');
		// 8px between the label row and the box, 4px between the box and its message.
		expect(valueOf('.agent-field__label-row', 'margin-bottom')).toContain('var(--space-2)');
		expect(valueOf('.agent-field__message', 'margin-top')).toContain('var(--space-1)');
		// One reserved line, so an error replaces the helper without moving anything.
		expect(valueOf('.agent-field__message', 'min-height')).toContain('var(--space-5)');
	});

	it('the action stack is the same on every step and stays reachable on a tall card', () => {
		expect(valueOf('.agent-connect__actions', 'flex-direction')).toContain('column');
		expect(valueOf('.agent-connect__actions', 'gap')).toContain('var(--space-2)');
		expect(valueOf('.agent-connect__actions', 'position')).toContain('sticky');
	});

	it('uses tokens for colour, radius and focus: no hex or rgb colours in the connect family', () => {
		const loose = [];
		for (const rule of all) {
			if (!FAMILY.test(rule.selector)) continue;
			if (/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|oklch\(/.test(rule.body)) loose.push(rule.selector);
		}
		expect(loose).toEqual([]);
		expect(valueOf('.agent-field__box', 'border-radius')).toContain('var(--radius-md)');
		expect(valueOf('button.agent-provider', 'border-radius')).toContain('var(--radius-md)');
		expect(valueOf('.agent-field__box:focus-within', 'outline')).toContain('var(--focus-ring)');
	});

	it('has no native select, datalist or popover styling left over from the dropdown idea', () => {
		expect(css).not.toMatch(/\bselect\b[^-]|\bdatalist\b|\[popover\]|agent-dropdown/);
	});
});
