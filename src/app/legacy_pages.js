/**
 * Hidden legacy pages (UI reset, docs/agentic/UI-RESET.md).
 *
 * Noddy shows one page: the Workspace (specimen card + Letters & figures
 * grid) and, inside it, the focus editor for one letter. The old Glyphr
 * Studio pages (Overview, Characters, Ligatures, Components, Kerning,
 * Live preview, Global actions, Settings, Help, About) stay in the code so
 * the agent's tools and the tests built on them keep working, but the user
 * never navigates to them. They are reachable only with the `?legacy` URL
 * flag (or in dev mode) for debugging.
 */

/** Pages the Navigator may show without the legacy flag. */
export const VISIBLE_PAGES = Object.freeze(['Workspace']);

/** Pages hidden behind the legacy flag. 'Characters' is listed because the
 *  old Characters page is hidden too; focus mode on it stays visible. */
export const HIDDEN_PAGES = Object.freeze([
	'Overview',
	'Characters',
	'Ligatures',
	'Components',
	'Kerning',
	'Live preview',
	'Global actions',
	'Settings',
	'Help',
	'About',
]);

let override = null;

/**
 * Tests (or dev tooling) can force the flag on or off; `null` restores the
 * URL / dev-mode detection.
 * @param {Boolean | null} value
 */
export function setLegacyPagesOverride(value) {
	override = value;
}

/**
 * True when the old pages may be shown: `?legacy` in the URL, or dev mode.
 * @param {Object} [options]
 * @param {Boolean} [options.devMode] - app dev-mode switch (GlyphrStudioApp.settings.dev.mode)
 * @returns {Boolean}
 */
export function legacyPagesEnabled({ devMode = false } = {}) {
	if (override !== null) return override;
	if (devMode) return true;
	if (typeof window === 'undefined' || !window.location) return false;
	try {
		return new URLSearchParams(window.location.search).has('legacy');
	} catch {
		return false;
	}
}

/**
 * The page the Navigator should actually show for a requested page.
 * Focus mode lives on the Characters page and is always allowed.
 * @param {String} page - requested page name
 * @param {Object} [options]
 * @param {Boolean} [options.focus] - focus mode is active
 * @param {Boolean} [options.devMode]
 * @returns {String}
 */
export function resolveVisiblePage(page, { focus = false, devMode = false } = {}) {
	if (legacyPagesEnabled({ devMode })) return page;
	if (VISIBLE_PAGES.includes(page)) return page;
	if (page === 'Characters' && focus) return page;
	return 'Workspace';
}
