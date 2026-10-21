import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Contract 2 §2 — typography / font-rendering guard.
 *
 * Application UI typography must NEVER determine the rendering of
 * user/project font content. This guard fails the suite if any GLOBAL
 * stylesheet sets a font-rendering property (font-family,
 * font-variation-settings, font-feature-settings, letter-spacing) on a
 * content-surface selector (`*`, `canvas`, `display-canvas`,
 * `font-preview`, `edit-canvas`, `[data-font-content]`).
 *
 * Component-scoped stylesheets (e.g. the font-preview shadow-DOM internals
 * in src/controls/font-preview/) are explicitly allowlisted — the ban
 * applies to global stylesheets only.
 *
 * NOTE (deferred, outside Agent A scope): stamping `data-font-content` onto
 * the preview roots in font_preview.js / display_canvas.js belongs to the
 * agent that owns those controls. This guard verifies the CSS side of the
 * marker contract (global CSS reserves and never targets it).
 */

const REPO_ROOT = path.resolve(__dirname, '..');

// Global stylesheets: every .css file loaded document-wide via <link> in
// src/index.html, plus the pop-out document stylesheet (inlined by
// src/project_editor/pop_out_window.js). Per-control stylesheets loaded by
// individual controls are component-scoped and NOT listed here.
const GLOBAL_STYLESHEETS = [
	'src/common/resets.css',
	'src/common/colors.css',
	'src/app/app.css',
	'src/app/app-pages.css',
	'src/panels/panels.css',
	'src/project_editor/nav.css',
	'src/project_editor/pop-out-window.css',
	'src/pages/editor-pages.css',
	'src/pages/content-pages.css',
	'src/pages/workspace.css',
	'src/controls/specimen-card/specimen-card.css',
	'src/controls/dialogs/dialogs.css',
	'src/controls/fancy-slider/fancy-slider.css',
	'src/controls/tabs/tab-control.css',
	'src/controls/progress-indicator/progress-indicator.css',
	// Side-effect imports (document-wide once their module loads).
	'src/controls/glyph-grid/glyph-grid.css',
	'src/pages/focus-mode.css',
	'src/agent/ui/cards/agent-cards.css',
];

// Allowlisted: component-scoped stylesheets (matched by path substring).
const ALLOWLISTED_PATH_PARTS = ['font-preview'];

// Content-surface selectors a global stylesheet must never set font props on.
const BANNED_ELEMENTS = ['canvas', 'display-canvas', 'font-preview', 'edit-canvas', 'glyph-tile'];

// Font-rendering properties covered by Contract 2 §5.
const BANNED_PROPS = [
	'font-family',
	'font-variation-settings',
	'font-feature-settings',
	'letter-spacing',
];

/**
 * Strips block comments so prose mentioning e.g. "font-preview" can never
 * false-positive as a rule.
 * @param {String} css - raw stylesheet text
 * @returns {String} - stylesheet without comments
 */
function stripComments(css) {
	return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extracts top-level selector/declaration pairs. @media/@keyframes wrappers
 * never match (their braces nest); their inner rules match with the correct
 * inner selector, which is exactly what the guard must inspect.
 * @param {String} css - comment-free stylesheet text
 * @returns {Array<{selector: String, declarations: String}>}
 */
function extractRules(css) {
	const rules = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let match;
	while ((match = re.exec(css)) !== null) {
		rules.push({ selector: match[1].trim(), declarations: match[2] });
	}
	return rules;
}

/**
 * Returns the banned surface a selector part targets, or null.
 * Matches real element targeting (not class-name substrings such as
 * `.editor-page__edit-canvas-wrapper`).
 * @param {String} part - single comma-separated selector part
 * @returns {String|null} - banned surface name or null
 */
function bannedSurfaceInSelectorPart(part) {
	const s = part.toLowerCase().trim();
	if (s === '*' || /(^|[\s>+~])\*([\s>+~:.#[]|$)/.test(s)) return '*';
	if (s.includes('[data-font-content]')) return '[data-font-content]';
	const tokens = s.split(/[\s>+~]+/);
	for (const token of tokens) {
		const element = token.split(/[:.#[]/)[0];
		if (BANNED_ELEMENTS.includes(element)) return element;
	}
	return null;
}

/**
 * Scans one global stylesheet for banned font-prop writes.
 * @param {String} relPath - repo-relative stylesheet path
 * @returns {String[]} - human-readable violation descriptions
 */
function scanStylesheet(relPath) {
	const absPath = path.resolve(REPO_ROOT, relPath);
	if (!fs.existsSync(absPath)) return [`missing stylesheet: ${relPath}`];
	const css = stripComments(fs.readFileSync(absPath, 'utf8'));
	const violations = [];
	for (const { selector, declarations } of extractRules(css)) {
		if (selector.startsWith('@')) continue; // @font-face, @keyframes, @import
		const decls = declarations.toLowerCase();
		const hitProps = BANNED_PROPS.filter((prop) => decls.includes(prop));
		if (hitProps.length === 0) continue;
		for (const part of selector.split(',')) {
			const surface = bannedSurfaceInSelectorPart(part);
			if (surface) {
				violations.push(
					`${relPath}: global selector "${part.trim()}" sets ${hitProps.join(', ')} on <${surface}>`
				);
			}
		}
	}
	return violations;
}

describe('CSS typography guard (Contract 2 §2)', () => {
	it('scans only global stylesheets; component internals are allowlisted', () => {
		for (const relPath of GLOBAL_STYLESHEETS) {
			const allowlisted = ALLOWLISTED_PATH_PARTS.some((part) => relPath.includes(part));
			expect(allowlisted, `${relPath} must not be an allowlisted component path`).toBe(false);
		}
	});

	it('no GLOBAL stylesheet sets font props on *, canvas, display-canvas, font-preview, edit-canvas or [data-font-content]', () => {
		const violations = [];
		for (const relPath of GLOBAL_STYLESHEETS) {
			violations.push(...scanStylesheet(relPath));
		}
		expect(violations, 'UI font must never target project/font content surfaces').toEqual([]);
	});

	it('the old global `*` reset no longer sets font-family', () => {
		const css = stripComments(
			fs.readFileSync(path.resolve(REPO_ROOT, 'src/common/resets.css'), 'utf8')
		);
		for (const { selector, declarations } of extractRules(css)) {
			if (selector.startsWith('@')) continue;
			const parts = selector.split(',').map((p) => p.trim());
			if (parts.includes('*')) {
				expect(
					declarations.toLowerCase().includes('font-family'),
					'`*` must not set font-family (use scoped UI selectors)'
				).toBe(false);
			}
		}
	});

	it('UI font is applied via scoped chrome selectors', () => {
		const css = fs.readFileSync(path.resolve(REPO_ROOT, 'src/common/resets.css'), 'utf8');
		for (const chrome of ['#app__wrapper', 'dialog', '.panel__card', 'fancy-button']) {
			expect(css.includes(chrome), `scoped UI font rule must cover ${chrome}`).toBe(true);
		}
	});

	it('global CSS reserves the [data-font-content] marker without targeting it', () => {
		const css = fs.readFileSync(path.resolve(REPO_ROOT, 'src/common/resets.css'), 'utf8');
		expect(css.includes('[data-font-content]'), 'resets.css must document the marker').toBe(true);
		const violations = scanStylesheet('src/common/resets.css').filter((v) =>
			v.includes('[data-font-content]')
		);
		expect(violations).toEqual([]);
	});

	it('Contract 1 §1 OKLCH tokens are present with exact values', () => {
		const css = fs.readFileSync(path.resolve(REPO_ROOT, 'src/common/colors.css'), 'utf8');
		const expected = [
			'--background: oklch(1 0 0);',
			'--foreground: oklch(0.2707 0.054 44.1725);',
			'--primary: oklch(0.8141 0.1261 58.1544);',
			'--ring: oklch(0.8141 0.1261 58.1544);',
			'--destructive: oklch(0.6137 0.2039 25.5645);',
			'--background: oklch(0.1979 0.0107 39.2759);',
			'--foreground: oklch(0.9799 0.0076 48.6561);',
			'--destructive: oklch(0.6884 0.2009 24.0561);',
		];
		for (const token of expected) {
			expect(css.includes(token), `colors.css must contain \`${token}\``).toBe(true);
		}
	});
});
