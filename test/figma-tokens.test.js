import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * [M1] Figma tokens and text roles (issue #7).
 *
 * Every token in docs/agentic/FIGMA-SPEC.md §1 must exist in CSS under the
 * Figma WEB code-syntax name (`--color-<group>-<name>`, `--space-N`,
 * `--radius-*`, `--shadow-*`), semantic colours in BOTH the light (`:root`)
 * and dark (`.dark, [data-theme='dark']`) blocks, and every text role must
 * have a `.text-<role>` class in resets.css.
 *
 * The colour token list is parsed from the spec's "Color" table so the test
 * and the spec cannot drift apart silently.
 */

const REPO_ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(REPO_ROOT, p), 'utf8');

const colorsCSS = read('src/common/colors.css').replace(/\/\*[\s\S]*?\*\//g, '');
const resetsCSS = read('src/common/resets.css').replace(/\/\*[\s\S]*?\*\//g, '');
const spec = read('docs/agentic/FIGMA-SPEC.md');

/**
 * Collects `--name: value;` declarations from every block whose selector
 * list matches the predicate.
 * @param {String} css - comment-free stylesheet
 * @param {Function} selectorMatches - (selector: String) => Boolean
 * @returns {Map<String, String>} declared custom properties
 */
function customProps(css, selectorMatches) {
	const props = new Map();
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let m;
	while ((m = re.exec(css))) {
		if (!selectorMatches(m[1].trim())) continue;
		for (const decl of m[2].split(';')) {
			const [name, ...rest] = decl.split(':');
			if (name && name.trim().startsWith('--')) props.set(name.trim(), rest.join(':').trim());
		}
	}
	return props;
}

const light = customProps(colorsCSS, (s) => s === ':root');
const dark = customProps(colorsCSS, (s) => s.includes("[data-theme='dark']"));

/**
 * Reads the semantic "Color" table in FIGMA-SPEC §1: rows look like
 * `| bg/canvas (app background) | warm/50 | warm/975 |`.
 * @returns {Array<String>} token names like `bg/canvas`, expanded for `status/*-subtle`
 */
function specColorTokens() {
	// [0] is the rest of the heading line; [1] is the markdown table itself.
	const table = spec.split('**Color** (modes Light / Dark')[1].split('\n\n')[1];
	const names = [];
	for (const line of table.split('\n')) {
		const m = line.match(/^\|\s*([a-z-]+\/[a-z*-]+)/);
		if (!m || m[1] === 'Token') continue;
		if (m[1] === 'status/*-subtle') {
			names.push(...['draft', 'kept', 'yours', 'failed'].map((s) => `status/${s}-subtle`));
		} else {
			names.push(m[1]);
		}
	}
	return names;
}

const toCSSName = (token) => `--color-${token.replace('/', '-')}`;

describe('Figma Noddy/Color semantic tokens', () => {
	const tokens = specColorTokens();

	it('parses the spec table', () => {
		expect(tokens).toContain('bg/canvas');
		expect(tokens).toContain('status/failed-subtle');
		expect(tokens.length).toBeGreaterThanOrEqual(23);
	});

	it.each(tokens)('%s exists in light and dark', (token) => {
		const name = toCSSName(token);
		expect(light.has(name), `${name} missing in :root`).toBe(true);
		expect(dark.has(name), `${name} missing in dark`).toBe(true);
	});

	it('follows the Figma deviations (text/secondary, dark bg/subtle, dark border/default)', () => {
		expect(light.get('--color-text-secondary')).toBe('var(--warm-550)');
		expect(light.get('--warm-550')).toBe('#75625a');
		expect(dark.get('--color-bg-subtle')).toBe('var(--warm-875)');
		expect(dark.get('--color-border-default')).toBe('var(--warm-850)');
	});

	it('resolves every semantic token to a declared primitive', () => {
		for (const [name, value] of [...light, ...dark]) {
			if (!name.startsWith('--color-')) continue;
			const ref = value.match(/^var\((--[a-z]+-\d+)\)$/);
			expect(ref, `${name} must alias a primitive, got "${value}"`).not.toBeNull();
			expect(light.has(ref[1]), `${ref[1]} (used by ${name}) is not declared`).toBe(true);
		}
	});
});

describe('Figma space, radius, shadow and focus tokens', () => {
	it.each(['1', '2', '3', '4', '5', '6', '8', '10', '12'])('--space-%s', (n) => {
		expect(light.get(`--space-${n}`)).toMatch(/^\d+px$/);
	});

	it('space tokens follow the spec values', () => {
		const expected = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 };
		for (const [n, px] of Object.entries(expected)) {
			expect(light.get(`--space-${n}`)).toBe(`${px}px`);
		}
	});

	it('radius tokens follow the spec values', () => {
		expect(light.get('--radius-sm')).toBe('4px');
		expect(light.get('--radius-md')).toBe('8px');
		expect(light.get('--radius-lg')).toBe('12px');
		expect(light.get('--radius-xl')).toBe('20px');
		expect(light.get('--radius-full')).toBe('999px');
	});

	it.each(['xs', 'sm', 'md', 'float'])('--shadow-%s', (n) => {
		expect(light.has(`--shadow-${n}`)).toBe(true);
	});

	it('focus ring is 2px peach with a 2px offset', () => {
		expect(light.get('--focus-ring-width')).toBe('2px');
		expect(light.get('--focus-ring-offset')).toBe('2px');
		expect(light.get('--focus-ring')).toContain('var(--color-focus-ring)');
		expect(light.get('--color-focus-ring')).toBe('var(--peach-300)');
	});

	it('keeps the legacy Contract 1 tokens available', () => {
		for (const legacy of ['--background', '--foreground', '--primary', '--ring', '--border', '--radius']) {
			expect(light.has(legacy), `${legacy} removed`).toBe(true);
		}
	});
});

describe('Figma text roles (.text-<role>)', () => {
	const roles = [
		'display',
		'title',
		'heading',
		'subheading',
		'body',
		'body-small',
		'label',
		'meta',
		'mono',
		'mono-small',
		'glyph-ref',
	];

	it.each(roles)('.text-%s is defined', (role) => {
		expect(resetsCSS).toMatch(new RegExp(`\\.text-${role}\\b`));
	});

	it('Display/Title/Heading use ROND 60 at weight 700', () => {
		const block = resetsCSS.match(/\.text-display,\s*\.text-title,\s*\.text-heading\s*\{([^}]*)\}/);
		expect(block).not.toBeNull();
		expect(block[1]).toContain("'ROND' 60");
		expect(block[1]).toContain('font-weight: 700');
	});

	it('Glyph ref is Google Sans Code italic', () => {
		// The standalone rule (not the shared .text-mono, .text-mono-small, .text-glyph-ref one).
		const block = resetsCSS.match(/\}\s*\.text-glyph-ref\s*\{([^}]*)\}/);
		expect(block[1]).toContain('font-style: italic');
		expect(resetsCSS).toMatch(/\.text-mono,\s*\.text-mono-small,\s*\.text-glyph-ref\s*\{[^}]*var\(--font-mono\)/);
	});

	it('loads Google Sans Code with an italic axis', () => {
		expect(resetsCSS).toMatch(/Google\+Sans\+Code:ital,wght@0,[\d.]+;1,[\d.]+/);
	});
});
