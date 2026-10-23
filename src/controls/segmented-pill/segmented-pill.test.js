import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setCurrentProjectEditor } from '../../app/main.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { GlyphGrid } from '../glyph-grid/glyph-grid.js';
import { GlyphGridTile } from '../glyph-grid/glyph-tile.js';
import { SpecimenCard } from '../specimen-card/specimen_card.js';
import { SEGMENTED_PILL } from './segmented-pill.js';

/*
	Shared SegmentedPill (Figma 61:187), used by the Workspace grid switch
	("62 | All 116") and the specimen card's mode pill (Text / Spacing /
	Waterfall). The bug this guards: the legacy global `button:hover/focus/
	active` rule in resets.css (specificity 0,1,1) beat the old single-class
	segment rules, so a clicked segment turned into a 4px-radius, margin-pushed
	box and the unselected one grew its own shape inside the track.

	jsdom cannot paint, so these tests resolve the cascade themselves: they
	take the real stylesheets, match each rule against the real DOM built by
	the two components, and pick the winner by specificity. The shared sheet is
	deliberately listed BEFORE resets.css, the worst case for source order, so
	only specificity can save the segment.
*/

if (!customElements.get('glyph-grid-tile')) customElements.define('glyph-grid-tile', GlyphGridTile);
if (!customElements.get('glyph-grid')) customElements.define('glyph-grid', GlyphGrid);
if (!customElements.get('specimen-card')) customElements.define('specimen-card', SpecimenCard);

const read = (rel) => fs.readFileSync(path.resolve(__dirname, rel), 'utf8');
const PILL_CSS = read('segmented-pill.css');
const RESETS_CSS = read('../../common/resets.css');
const COLORS_CSS = read('../../common/colors.css');

// ---------------------------------------------------------------------
// A tiny cascade resolver (no shorthand expansion: the pill sheet and the
// legacy rule use the same longhand/shorthand names on purpose).
// ---------------------------------------------------------------------

const strip = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

function parseRules(css, order) {
	const rules = [];
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let m;
	while ((m = re.exec(strip(css))) !== null) {
		const selector = m[1].trim();
		if (selector.startsWith('@')) continue;
		const declarations = {};
		m[2].split(';').forEach((decl) => {
			const i = decl.indexOf(':');
			if (i > 0) declarations[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
		});
		selector.split(',').forEach((part) => {
			rules.push({ selector: part.trim(), declarations, order: order++ });
		});
	}
	return rules;
}

/** [ids, classes + attributes + pseudo-classes, elements]; :not(x) counts as x. */
function specificity(selector) {
	const s = selector.replace(/:not\(([^)]*)\)/g, ' $1 ').replace(/\[[^\]]*\]/g, '.a');
	const ids = (s.match(/#[\w-]+/g) || []).length;
	const classes = (s.match(/\.[\w-]+/g) || []).length + (s.match(/(?<!:):[\w-]+/g) || []).length;
	const elements = (s.match(/(^|[\s>+~])[a-z][\w-]*/gi) || []).length;
	return [ids, classes, elements];
}

const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** User-action pseudo-classes become attributes so jsdom can match them. */
function withStates(selector) {
	return selector
		.replace(/:focus-visible/g, '[data-s-focus-visible]')
		.replace(/:focus(?![\w-])/g, '[data-s-focus]')
		.replace(/:hover/g, '[data-s-hover]')
		.replace(/:active/g, '[data-s-active]');
}

/**
 * Declared value of every property on `el` in a given interaction state.
 * @param {HTMLElement} el
 * @param {Array} rules
 * @param {String[]} states - any of focus, focus-visible, hover, active
 */
function resolve(el, rules, states = []) {
	states.forEach((s) => el.setAttribute(`data-s-${s}`, ''));
	const winners = {};
	for (const rule of rules) {
		let matches = false;
		try {
			matches = el.matches(withStates(rule.selector));
		} catch (error) {
			matches = false;
		}
		if (!matches) continue;
		const spec = specificity(rule.selector);
		for (const [prop, value] of Object.entries(rule.declarations)) {
			const prev = winners[prop];
			if (!prev || compare(spec, prev.spec) > 0 || (compare(spec, prev.spec) === 0 && rule.order > prev.order)) {
				winners[prop] = { value, spec, order: rule.order };
			}
		}
	}
	states.forEach((s) => el.removeAttribute(`data-s-${s}`));
	return Object.fromEntries(Object.entries(winners).map(([p, w]) => [p, w.value]));
}

// Pill sheet first (lowest order), legacy reset after it (highest order).
const RULES = [...parseRules(PILL_CSS, 0), ...parseRules(RESETS_CSS, 1000)];

const px = (token) => Number(new RegExp(`--${token}:\\s*(\\d+)px`).exec(COLORS_CSS)[1]);

// ---------------------------------------------------------------------
// Real components
// ---------------------------------------------------------------------

let grid;
let card;

beforeEach(() => {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	const editor = new ProjectEditor();
	editor.project = new GlyphrStudioProject({});
	setCurrentProjectEditor(editor);
	editor.project.settings.app.autoSave = false;
	grid = new GlyphGrid({ editor });
	document.body.appendChild(grid);
	card = document.createElement('specimen-card');
	document.body.appendChild(card);
});

afterEach(() => {
	grid.remove();
	card.remove();
});

/** The two pills in the app, each with its segments and which one is selected. */
function pills() {
	const gridSegments = [...grid.querySelectorAll('.glyph-grid__segment')];
	const modeSegments = [...card.querySelectorAll('.specimen__mode')];
	return [
		{
			name: 'grid switch',
			track: grid.querySelector('.glyph-grid__switch'),
			segments: gridSegments,
			selected: (el) => el.getAttribute('aria-pressed') === 'true',
		},
		{
			name: 'mode pill',
			track: card.querySelector('.specimen__mode-pill'),
			segments: modeSegments,
			selected: (el) => el.getAttribute('aria-checked') === 'true',
		},
	];
}

describe('SegmentedPill: shared markup', () => {
	it('both pills use the shared track and segment classes', () => {
		for (const pill of pills()) {
			expect(pill.track.classList.contains(SEGMENTED_PILL.track), pill.name).toBe(true);
			expect(pill.segments.length, pill.name).toBeGreaterThanOrEqual(2);
			pill.segments.forEach((s) => {
				expect(s.classList.contains(SEGMENTED_PILL.segment), pill.name).toBe(true);
				expect(s.tagName).toBe('BUTTON');
			});
			expect(pill.segments.filter(pill.selected), pill.name).toHaveLength(1);
		}
		expect(card.querySelector('.specimen__mode-pill').classList.contains('segmented-pill--icons')).toBe(true);
	});

	it('keeps exactly one selected segment after switching', () => {
		grid.querySelector('[data-view="all"]').click();
		card.querySelector('[data-mode="waterfall"]').click();
		for (const pill of pills()) {
			expect(pill.segments.filter(pill.selected), pill.name).toHaveLength(1);
		}
		expect(grid.segmentAll.getAttribute('aria-pressed')).toBe('true');
		expect(card.querySelector('[data-mode="waterfall"]').getAttribute('aria-checked')).toBe('true');
	});
});

describe('SegmentedPill: track', () => {
	it('is one quiet full-radius pill, 36px tall, with an equal 4px inset and no border', () => {
		for (const pill of pills()) {
			const track = resolve(pill.track, RULES);
			expect(track['border-radius'], pill.name).toBe('var(--radius-full)');
			expect(track.height, pill.name).toBe('36px');
			expect(track.padding, pill.name).toBe('var(--space-1)');
			expect(track.gap, pill.name).toBe('var(--space-1)');
			expect(track.border, pill.name).toBeUndefined();
			expect(track['background-color'], pill.name).toMatch(/--color-bg-(subtle|surface)/);
			expect(px('space-1')).toBe(4);
		}
	});

	it('the inset is the same on all four sides: segment height = track height - 2 x padding', () => {
		for (const pill of pills()) {
			const track = resolve(pill.track, RULES);
			const segment = resolve(pill.segments[0], RULES);
			const inset = px('space-1');
			expect(Number.parseInt(track.height, 10) - 2 * inset, pill.name).toBe(Number.parseInt(segment.height, 10));
			expect(segment.margin, pill.name).toBe('0');
		}
	});
});

describe('SegmentedPill: segments in every interaction state', () => {
	const STATES = [[], ['hover'], ['focus'], ['active'], ['focus', 'focus-visible'], ['hover', 'focus', 'active']];

	it('every segment is a full-radius pill with fixed geometry, whatever the legacy button rule says', () => {
		for (const pill of pills()) {
			for (const el of pill.segments) {
				for (const states of STATES) {
					const label = `${pill.name} ${el.textContent || el.dataset.mode} [${states.join('+') || 'rest'}]`;
					const style = resolve(el, RULES, states);
					expect(style['border-radius'], label).toBe('var(--radius-full)');
					expect(style.height, label).toBe('28px');
					expect(style.margin, label).toBe('0');
					expect(style.border, label).toBe('0');
					expect(style['box-shadow'], label).toBe('none');
					expect(style.padding, label).toMatch(/^0 var\(--/);
				}
			}
		}
	});

	it('the selected segment sits on bg/accent with text/on-accent, in every state', () => {
		for (const pill of pills()) {
			const el = pill.segments.find(pill.selected);
			for (const states of STATES) {
				const label = `${pill.name} selected [${states.join('+') || 'rest'}]`;
				const style = resolve(el, RULES, states);
				expect(style['background-color'], label).toBe('var(--color-bg-accent)');
				expect(style.color, label).toBe('var(--color-text-on-accent)');
			}
		}
	});

	it('an unselected segment has no background or shape at rest, focused or pressed; only its text colour changes on hover', () => {
		for (const pill of pills()) {
			for (const el of pill.segments.filter((s) => !pill.selected(s))) {
				for (const states of STATES) {
					const label = `${pill.name} ${el.textContent || el.dataset.mode} [${states.join('+') || 'rest'}]`;
					const style = resolve(el, RULES, states);
					expect(style['background-color'], label).toBe('transparent');
					expect(style['box-shadow'], label).toBe('none');
					expect(style.color, label).toBe(
						states.includes('hover') ? 'var(--color-text-primary)' : 'var(--color-text-secondary)'
					);
				}
			}
		}
	});

	it('hover and focus are paint-only: only paint properties differ from rest', () => {
		// border-color is inert here: the segment border is `0` in every state
		const PAINT = new Set(['color', 'background-color', 'outline', 'outline-offset', 'border-color']);
		for (const pill of pills()) {
			for (const el of pill.segments) {
				const rest = resolve(el, RULES, []);
				for (const states of STATES.slice(1)) {
					const style = resolve(el, RULES, states);
					Object.keys({ ...rest, ...style }).forEach((prop) => {
						if (PAINT.has(prop)) return;
						expect(style[prop], `${pill.name} ${prop} [${states.join('+')}]`).toBe(rest[prop]);
					});
				}
			}
		}
	});

	it('shows a focus ring on keyboard focus only, never on mouse focus, and never clips it', () => {
		for (const pill of pills()) {
			const el = pill.segments[0];
			const ring = resolve(el, RULES, ['focus', 'focus-visible']);
			expect(ring.outline, pill.name).toBe('var(--focus-ring)');
			expect(ring['outline-offset'], pill.name).toBe('var(--focus-ring-offset)');
			const mouse = resolve(el, RULES, ['focus']);
			expect(mouse.outline, pill.name).toBe('none');
			const track = resolve(pill.track, RULES);
			expect(track.overflow, pill.name).toBeUndefined();
		}
	});
});

describe('SegmentedPill: hover state', () => {
	// Everything that decides how a segment is shaped. Hover may change none of it.
	const GEOMETRY = ['border-radius', 'height', 'width', 'margin', 'padding', 'border', 'box-shadow', 'min-width', 'min-height'];
	const hoverRules = RULES.filter((rule) => /:hover/.test(rule.selector));
	const COLOUR_LITERAL = /#[0-9a-f]{3,8}\b|(?<![-\w])white(?![-\w])|\b(rgb|rgba|hsl|hsla|oklch|oklab|lab|lch)\(/i;
	// The legacy hover rule also sets border-color. It is inert here (the segment border is `0`), so it is
	// left out when comparing two resolved styles.
	const visible = (style) => {
		const { 'border-color': inert, ...rest } = style;
		return rest;
	};

	it('the hover rule for an unselected segment changes only the text colour, to the text/primary token', () => {
		// The last matching rule wins; the earlier one only re-pins the base geometry against the legacy rule.
		const unselectedHover = hoverRules.filter((rule) => rule.selector === 'button.segmented-pill__segment:hover');
		expect(unselectedHover.length).toBeGreaterThan(0);
		expect(unselectedHover[unselectedHover.length - 1].declarations).toEqual({ color: 'var(--color-text-primary)' });
	});

	it('no hover rule in the pill sheet paints a shape: no fill, border, radius, spacing or shadow on an unselected segment', () => {
		const pillHoverRules = hoverRules.filter((rule) => rule.order < 1000);
		expect(pillHoverRules.length).toBeGreaterThan(0);
		for (const rule of pillHoverRules) {
			const aria = /\[aria-(pressed|checked)='true'\]/.test(rule.selector);
			for (const [prop, value] of Object.entries(rule.declarations)) {
				const label = `${rule.selector} { ${prop}: ${value} }`;
				// A hover rule may re-pin the base geometry/paint (it must out-rank the legacy rule), or set the
				// token colour, but only the selected segment gets a background, and never a literal colour.
				expect(value, label).not.toMatch(COLOUR_LITERAL);
				if (!aria && prop === 'background-color') expect(value, label).toBe('transparent');
				if (!aria && prop === 'border-radius') expect(value, label).toBe('var(--radius-full)');
				if (!aria && prop === 'height') expect(value, label).toBe('28px');
				if (!aria && prop === 'margin') expect(value, label).toBe('0');
				if (!aria && prop === 'border') expect(value, label).toBe('0');
				if (!aria && prop === 'box-shadow') expect(value, label).toBe('none');
			}
		}
	});

	it('uses tokens only: the pill sheet has no white, hex or rgb colour anywhere', () => {
		expect(strip(PILL_CSS)).not.toMatch(COLOUR_LITERAL);
	});

	it('a hovered unselected segment has the same shape as the selected highlight: same radius, height, spacing, border and shadow', () => {
		for (const pill of pills()) {
			const selected = visible(resolve(pill.segments.find(pill.selected), RULES, []));
			for (const el of pill.segments.filter((s) => !pill.selected(s))) {
				const hovered = visible(resolve(el, RULES, ['hover']));
				GEOMETRY.forEach((prop) => {
					expect(hovered[prop], `${pill.name} ${el.textContent || el.dataset.mode} ${prop}`).toBe(selected[prop]);
				});
				expect(hovered['border-radius']).toBe('var(--radius-full)');
			}
		}
	});

	it('hover on an unselected segment is exactly its rest style with the colour swapped to text/primary', () => {
		for (const pill of pills()) {
			for (const el of pill.segments.filter((s) => !pill.selected(s))) {
				const rest = visible(resolve(el, RULES, []));
				const hovered = visible(resolve(el, RULES, ['hover']));
				expect(hovered, pill.name).toEqual({ ...rest, color: 'var(--color-text-primary)' });
				expect(rest.color, pill.name).toBe('var(--color-text-secondary)');
				expect(rest['background-color'], pill.name).toBe('transparent');
			}
		}
	});

	it('hover on the selected segment changes nothing', () => {
		for (const pill of pills()) {
			const el = pill.segments.find(pill.selected);
			expect(visible(resolve(el, RULES, ['hover'])), pill.name).toEqual(visible(resolve(el, RULES, [])));
		}
	});

	it('every hover selector out-ranks the legacy `button:hover` rule, so the legacy shape can never win', () => {
		const legacy = specificity('button:hover');
		expect(legacy).toEqual([0, 1, 1]);
		const pillHoverRules = hoverRules.filter((rule) => rule.order < 1000);
		for (const rule of pillHoverRules) {
			expect(compare(specificity(rule.selector), legacy), rule.selector).toBeGreaterThan(0);
		}
	});

	it('no other stylesheet styles a segment on hover (the shape fight came from a second rule)', () => {
		const roots = ['../../controls', '../../app', '../../pages', '../../panels', '../../agent', '../../common'];
		const files = [];
		const walk = (dir) => {
			fs.readdirSync(dir, { withFileTypes: true }).forEach((entry) => {
				const full = path.join(dir, entry.name);
				if (entry.isDirectory()) walk(full);
				else if (entry.name.endsWith('.css')) files.push(full);
			});
		};
		roots.forEach((root) => walk(path.resolve(__dirname, root)));
		const offenders = [];
		files.forEach((file) => {
			if (path.basename(file) === 'segmented-pill.css') return;
			parseRules(fs.readFileSync(file, 'utf8'), 0).forEach((rule) => {
				if (/:hover/.test(rule.selector) && /glyph-grid__segment|specimen__mode(?!-pill)|segmented-pill/.test(rule.selector)) {
					offenders.push(`${path.relative(__dirname, file)}: ${rule.selector}`);
				}
			});
		});
		expect(offenders).toEqual([]);
	});
});

describe('SegmentedPill: icon variant (mode pill)', () => {
	it('uses 36px-wide icon segments: 4 + 3 x 36 + 2 x 4 + 4 = 124px, the Figma pill', () => {
		const icons = resolve(card.querySelector('.specimen__mode-pill'), RULES);
		expect(icons['--segmented-pill-segment-width']).toBe('36px');
		const segment = resolve(card.querySelector('.specimen__mode'), RULES);
		expect(segment.width).toBe('var(--segmented-pill-segment-width, auto)');
		expect(4 + 3 * 36 + 2 * 4 + 4).toBe(124);
	});
});
