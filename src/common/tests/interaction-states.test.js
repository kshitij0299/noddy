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

	/** Splits a selector list at top-level commas only. */
	const parts = (list) => {
		const out = [];
		let depth = 0;
		let current = '';
		for (const char of list) {
			if (char === '(') depth++;
			if (char === ')') depth--;
			if (char === ',' && depth === 0) {
				out.push(current.trim());
				current = '';
			} else current += char;
		}
		out.push(current.trim());
		return out;
	};

	it('wraps every button / link / field / ARIA state rule in :where()', () => {
		const offenders = selectors(resets)
			.flatMap(parts)
			.filter((selector) => LEGACY_STATE.test(selector) && !selector.startsWith(':where('));
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
		const pressed = [
			...stripComments(interaction).matchAll(
				/(:is\([^{]*?\)):active:not\(([^{]*)\)\s*\{\s*background-color: var\(--state-pressed-bg\)/g
			),
		];
		expect(pressed.length).toBe(2);
		for (const [, list, excluded] of pressed) {
			const states = ["[aria-checked='true']", "[aria-selected='true']", '.is-active', ':disabled'];
			if (list.includes('segmented-pill__segment')) states.push(".segmented-pill__segment[aria-pressed='true']");
			for (const state of states) expect(excluded, list).toContain(state);
		}
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

// ---- Cascade checks (fix round on #133) ----
// jsdom cannot match :hover / :active and does not apply specificity in getComputedStyle, so a
// computed-style test would pass whatever the CSS said. Instead these compute selector
// specificity exactly (Selectors Level 4) and assert which rule wins, which is the part that
// broke: a rest rule at element weight silently beat its zero-weight :where() state rules.

/** Splits at top-level commas (ignores commas inside parentheses). */
function splitList(list) {
	const out = [];
	let depth = 0;
	let current = '';
	for (const char of list) {
		if (char === '(') depth++;
		if (char === ')') depth--;
		if (char === ',' && depth === 0) {
			out.push(current.trim());
			current = '';
		} else current += char;
	}
	if (current.trim()) out.push(current.trim());
	return out;
}

const add = (x, y) => [x[0] + y[0], x[1] + y[1], x[2] + y[2]];
const cmp = (x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
const max = (list) => list.reduce((best, s) => (cmp(s, best) > 0 ? s : best), [0, 0, 0]);

/** Specificity [ids, classes/attributes/pseudo-classes, types] of one complex selector. */
function specificity(selector) {
	let total = [0, 0, 0];
	let i = 0;
	const s = selector;
	const readArgs = () => {
		let depth = 1;
		const start = ++i;
		while (depth) {
			if (s[i] === '(') depth++;
			if (s[i] === ')') depth--;
			i++;
		}
		return s.slice(start, i - 1);
	};
	while (i < s.length) {
		const ch = s[i];
		if (ch === '#') {
			total = add(total, [1, 0, 0]);
			i++;
			while (i < s.length && /[\w-]/.test(s[i])) i++;
		} else if (ch === '.') {
			total = add(total, [0, 1, 0]);
			i++;
			while (i < s.length && /[\w-]/.test(s[i])) i++;
		} else if (ch === '[') {
			total = add(total, [0, 1, 0]);
			while (s[i] !== ']') i++;
			i++;
		} else if (ch === ':' && s[i + 1] === ':') {
			total = add(total, [0, 0, 1]);
			i += 2;
			while (i < s.length && /[\w-]/.test(s[i])) i++;
			if (s[i] === '(') readArgs();
		} else if (ch === ':') {
			i++;
			let name = '';
			while (i < s.length && /[\w-]/.test(s[i])) name += s[i++];
			if (s[i] === '(') {
				const args = readArgs();
				if (name === 'where') continue;
				if (['is', 'not', 'has'].includes(name)) {
					total = add(total, max(splitList(args).map(specificity)));
					continue;
				}
			}
			total = add(total, [0, 1, 0]);
		} else if (/[a-zA-Z]/.test(ch)) {
			total = add(total, [0, 0, 1]);
			while (i < s.length && /[\w-]/.test(s[i])) i++;
		} else i++;
	}
	return total;
}

/** Every rule as { selector parts, declared properties }, at-rule bodies flattened. */
function rules(css) {
	const out = [];
	const re = /([^{}@;]+)\{([^{}]*)\}/g;
	let match;
	while ((match = re.exec(stripComments(css))) !== null) {
		const props = [...match[2].matchAll(/(?:^|;)\s*([\w-]+)\s*:/g)].map((m) => m[1]);
		for (const part of splitList(match[1].trim())) out.push({ selector: part, props, index: match.index });
	}
	return out;
}

describe('specificity helper', () => {
	it('matches the spec examples', () => {
		expect(specificity('input')).toEqual([0, 0, 1]);
		expect(specificity(':where(input:hover)')).toEqual([0, 0, 0]);
		expect(specificity('input:hover')).toEqual([0, 1, 1]);
		expect(specificity(':is(#a .b, button.c):active')).toEqual([1, 2, 0]);
		expect(specificity("button.x:not(:disabled, [aria-pressed='true'])")).toEqual([0, 2, 1]);
		expect(specificity('.x::-webkit-slider-thumb')).toEqual([0, 1, 1]);
	});
});

describe('resets.css cascade: a legacy rest rule never beats its own state rules', () => {
	const STATE = /:(hover|focus|focus-visible|active)\b|\[disabled|\[aria-disabled/;
	const all = rules(resets);
	// The element a selector's subject is, or '*' when it has none (e.g. [disabled]).
	const subject = (selector) => {
		const inner = selector.replace(/^:where\(([\s\S]*)\)$/, '$1');
		return splitList(inner).map((part) => {
			const last = part.split(/[\s>+~]+/).pop();
			return last.match(/^[a-z][\w-]*/)?.[0] ?? '*';
		});
	};

	it('every rest rule for a field, button, link or label is as light as its state rules', () => {
		const offenders = [];
		const stateRules = all.filter((r) => STATE.test(r.selector) && cmp(specificity(r.selector), [0, 0, 0]) === 0);
		for (const state of stateRules) {
			const elements = subject(state.selector);
			for (const rest of all) {
				if (STATE.test(rest.selector) || rest.index > state.index) continue;
				// A rest rule for a bare element: `input`, `input, textarea`, `:where(input)`.
				if (!/^(:where\()?[a-z][\w-]*(\s*,\s*[a-z][\w-]*)*\)?$/.test(rest.selector)) continue;
				const restElements = subject(rest.selector);
				// A subject-less state rule ([disabled]) reaches the form controls.
				const reach = elements.includes('*') ? ['input', 'textarea', 'select', 'button'] : elements;
				const overlaps = restElements.some((el) => reach.includes(el));
				const shared = rest.props.filter((p) => state.props.includes(p) || (p === 'border' && state.props.some((q) => q.startsWith('border'))));
				if (overlaps && shared.length && cmp(specificity(rest.selector), [0, 0, 0]) > 0)
					offenders.push(`${rest.selector} (${specificity(rest.selector)}) beats ${state.selector} on ${shared}`);
			}
		}
		expect(offenders).toEqual([]);
	});

	it('the field rest rule is wrapped, so hover, focus and [disabled] paint again', () => {
		const rest = all.find((r) => /^:where\(input, textarea\)$/.test(r.selector));
		expect(rest, 'base field rule').toBeTruthy();
		expect(specificity(rest.selector)).toEqual([0, 0, 0]);
		const disabled = all.find((r) => r.selector.startsWith(':where([disabled]'));
		expect(disabled.index, '[disabled] comes after the field rest rule').toBeGreaterThan(rest.index);
	});
});

describe('existing-control lists: weights', () => {
	const css = stripComments(interaction);
	const pressRules = rules(css).filter((r) => /:active/.test(r.selector) && r.props.includes('background-color'));

	it('only the ID-scoped controls carry ID weight', () => {
		for (const rule of pressRules) {
			const hasId = /#/.test(rule.selector);
			expect(specificity(rule.selector)[0] > 0, rule.selector).toBe(hasId);
		}
		const classOnly = pressRules.filter((r) => !/#/.test(r.selector));
		expect(classOnly.length).toBeGreaterThan(0);
	});

	it('the class-only pressed rule still beats every pinned :active / :hover rule of its controls', () => {
		const classPress = pressRules.find((r) => !/#/.test(r.selector) && /agent-tab/.test(r.selector));
		const pressWeight = specificity(classPress.selector);
		const listed = (classPress.selector.match(/\.[a-z][\w-]*/g) || []).filter(
			(c) => !['.segmented-pill__segment', '.is-active', '.focus-mode'].includes(c)
		);
		const files = [
			'agent/ui/agent-panel.css',
			'agent/ui/cards/agent-cards.css',
			'agent/ui/chaos/chaos-tab.css',
			'controls/glyph-grid/glyph-grid.css',
			'controls/specimen-card/specimen-card.css',
		];
		const offenders = [];
		for (const file of files) {
			for (const rule of rules(read(file))) {
				if (!rule.props.some((p) => p === 'background-color' || p === 'background')) continue;
				if (!/:(active|hover)/.test(rule.selector)) continue;
				const own = listed.find((c) => new RegExp(`${c.replace(/[.-]/g, '\\$&')}(?![\\w-])`).test(rule.selector));
				if (own && cmp(specificity(rule.selector), pressWeight) >= 0)
					offenders.push(`${file}: ${rule.selector} (${specificity(rule.selector)})`);
			}
		}
		expect(offenders).toEqual([]);
	});
});

describe('one focus ring colour, legacy rings included', () => {
	const hex = (name) => colors.match(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`))?.[1];
	const luminance = (h) => {
		const [r, g, b] = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
		const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
		return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
	};
	const contrast = (a, b) => {
		const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m);
		return (x + 0.05) / (y + 0.05);
	};
	const light = colors.slice(0, colors.indexOf('.dark,'));
	const dark = colors.slice(colors.indexOf('.dark,'));
	const token = (block, name) => block.match(new RegExp(`--${name}:\\s*var\\(--([\\w-]+)\\)`))?.[1];

	it('--ring points at the focus-ring token in light and dark', () => {
		expect(light).toMatch(/--ring:\s*var\(--color-focus-ring\);/);
		expect(dark).toMatch(/--ring:\s*var\(--color-focus-ring\);/);
	});

	it('the ring measures at least 3:1 on every surface it sits on', () => {
		for (const [block, mode] of [
			[light, 'light'],
			[dark, 'dark'],
		]) {
			const ring = hex(token(block, 'color-focus-ring'));
			for (const surface of ['color-bg-canvas', 'color-bg-surface', 'color-bg-surface-raised', 'color-bg-subtle']) {
				const bg = hex(token(block, surface));
				expect(contrast(ring, bg), `${mode} ring on ${surface}`).toBeGreaterThanOrEqual(3);
			}
		}
	});

	it('--ring is only used for focus rings, never for hover or selected paint', () => {
		const files = [];
		const walk = (dir) => {
			for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name.endsWith('.css')) files.push(full);
			}
		};
		walk(SRC);
		const offenders = [];
		for (const file of files) {
			const css = stripComments(fs.readFileSync(file, 'utf8'));
			for (const match of css.matchAll(/([^{}@;]+)\{([^{}]*)\}/g)) {
				for (const decl of match[2].split(';')) {
					if (!/var\(--ring\b/.test(decl)) continue;
					const prop = decl.split(':')[0].trim();
					const focusRule = /:focus-visible|:focus-within/.test(match[1]);
					const ok = prop === 'outline' || prop.startsWith('--') || prop === 'stroke' || (focusRule && prop === 'border-color');
					if (!ok) offenders.push(`${path.relative(SRC, file)}: ${match[1].trim()} { ${decl.trim()} }`);
				}
			}
		}
		expect(offenders).toEqual([]);
	});
});
