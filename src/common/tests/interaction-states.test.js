// #128: one interaction-state layer. jsdom cannot paint, so these check the stylesheet
// contracts the browser audit relies on; the look itself is checked in a real browser.
import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../..');
const read = (file) => fs.readFileSync(path.join(SRC, file), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Top-level selectors of every rule (at-rule bodies are flattened). */
function selectors(css) {
	const out = [];
	const re = /([^{}@;]+)\{[^{}]*\}/g;
	let match;
	while ((match = re.exec(stripComments(css))) !== null) out.push(match[1].trim());
	return out;
}

const resets = read('common/resets.css');
const interaction = read('common/interaction.css');
const colors = read('common/colors.css');

describe('resets.css: legacy state rules never outrank component styles', () => {
	const LEGACY_STATE =
		/(^|,)\s*(button|input|textarea|a|label)(\[disabled\])?(:hover|:focus|:active|:visited)|(^|,)\s*button\[disabled\]|(^|,)\s*\[(disabled|aria-disabled|aria-selected|aria-busy)/;

	it('wraps every button / link / field / ARIA state rule in :where()', () => {
		const offenders = selectors(resets).filter(
			(selector) => LEGACY_STATE.test(selector) && !selector.startsWith(':where(')
		);
		expect(offenders).toEqual([]);
	});

	it('never outlines a control on mouse focus (only :focus-visible draws a ring)', () => {
		const mouseFocusOutline = /\{[^{}]*outline[^{}]*\}/;
		const rules = stripComments(resets).match(/[^{}]+\{[^{}]*\}/g) || [];
		const offenders = rules.filter((rule) => {
			const selector = rule.slice(0, rule.indexOf('{'));
			return /:focus(?!-visible|-within)/.test(selector) && mouseFocusOutline.test(rule) && !/outline:\s*(0|none)/.test(rule);
		});
		expect(offenders).toEqual([]);
	});

	it('draws the global ring from the shared token', () => {
		const rule = stripComments(resets).match(/\n:focus-visible\s*\{([^}]*)\}/);
		expect(rule?.[1]).toContain('var(--state-focus-ring');
		expect(rule?.[1]).toContain('var(--state-focus-offset');
	});
});

describe('one focus ring colour', () => {
	it('light mode rings in peach/600 (peach/300 is under 3:1 on white)', () => {
		const light = colors.slice(0, colors.indexOf('.dark,'));
		expect(light).toMatch(/--color-focus-ring:\s*var\(--peach-600\)/);
	});

	it('dark mode keeps peach/300', () => {
		const dark = colors.slice(colors.indexOf('.dark,'));
		expect(dark).toMatch(/--color-focus-ring:\s*var\(--peach-300\)/);
	});

	it('the state token follows the colour token instead of a second value', () => {
		expect(interaction).toMatch(/--state-focus-color:\s*var\(--color-focus-ring\)/);
		expect(interaction.match(/--state-focus-color:/g)).toHaveLength(1);
	});
});

describe('shared lists for existing controls', () => {
	const lists = stripComments(interaction).match(/:is\(([^)]*(?:\([^)]*\)[^)]*)*)\)/g) || [];
	const classes = [
		...new Set(lists.join(' ').match(/\.[a-z][a-z0-9_-]+(?:__[a-z0-9-]+)?(?:--[a-z0-9-]+)?/g) || []),
	];

	it('lists a pressed fill, an accent pressed fill and one disabled look', () => {
		const css = stripComments(interaction);
		expect(css).toMatch(/\):active:not\([^{]*\{\s*background-color: var\(--state-pressed-bg\)/);
		expect(css).toMatch(/\):active:not\([^{]*\{\s*background-color: var\(--state-accent-pressed-bg\)/);
		expect(css).toMatch(
			/\):is\(:disabled, \[aria-disabled='true'\]\)\s*\{\s*opacity: var\(--state-disabled-opacity\);\s*cursor: default;/
		);
	});

	it('never repaints a selected control on press', () => {
		const pressed = stripComments(interaction).match(/\):active:not\(([^{]*)\)\s*\{\s*background-color: var\(--state-pressed-bg\)/);
		for (const state of ["[aria-checked='true']", "[aria-selected='true']", "[aria-pressed='true']", '.is-active', ':disabled'])
			expect(pressed?.[1]).toContain(state);
	});

	it('names only classes that still exist in the app', () => {
		const sources = [];
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (/\.(js|jsx)$/.test(entry.name) && !/\.test\./.test(entry.name))
					sources.push(fs.readFileSync(full, 'utf8'));
			}
		};
		walk(SRC);
		const code = sources.join('\n');
		const missing = classes
			.map((name) => name.slice(1))
			.filter((name) => !['focus-mode', 'is-active'].includes(name))
			// Modifiers are often built from a template (`agent-card__button--${variant}`).
			.filter((name) => !code.includes(name) && !code.includes(`${name.split('--')[0]}--\${`));
		expect(missing).toEqual([]);
	});
});

describe('Tools tab: rings at the scroller edges are not clipped', () => {
	it('pairs the ring-room padding with an equal negative margin, so nothing moves', () => {
		const panel = stripComments(read('agent/ui/agent-panel.css'));
		const chaos = stripComments(read('agent/ui/chaos/chaos-tab.css'));
		for (const [css, selector] of [
			[panel, '.agent-panel__tab--chaos'],
			[chaos, '.chaos-tool__scroll'],
		]) {
			const body = css.match(new RegExp(`\\n${selector.replace(/[.-]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[1];
			expect(body, selector).toContain('padding: var(--state-ring-room)');
			expect(body, selector).toContain('margin: calc(-1 * var(--state-ring-room))');
		}
		expect(interaction).toMatch(/--state-ring-room:\s*calc\(var\(--focus-ring-width\) \+ var\(--focus-ring-offset\)\)/);
	});
});
