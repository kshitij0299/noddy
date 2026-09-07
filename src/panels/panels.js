import { getCurrentProjectEditor } from '../app/main.js';
import { addAsChildren, makeElement } from '../common/dom.js';
import { countItems } from '../common/functions.js';
import { makePanel_GlyphAttributes } from './attributes_glyph_edit.js';
import { makePanel_KernGroupAttributes } from './attributes_kern.js';
import { makePanel_CharacterInfo } from './character_info.js';
import { makePanel_ContextCharacters } from './context_characters.js';
import { makePanel_Guides } from './guides.js';
import { makePanel_History } from './history.js';
import { makePanel_Layers } from './layers.js';
import { handlePanelsKeyPress, handlePanelsKeyUp } from './panel_events.js';
import { makePanel_QualityChecks } from './quality_checks.js';
import { makePanel_Transforms } from './transforms.js';

/**
 * Assembles the correct panel based on the current
 * project editor and page.
 */
export function makePanel() {
	// log(`makePanel`, 'start');
	ensurePanelDrawerWiring();

	const editor = getCurrentProjectEditor();
	// log(editor.nav);
	let content = makeElement();
	let panel = editor.nav.panel;
	// log(`panel: ${panel}`);

	if (panel !== 'Layers') {
		document.removeEventListener('keydown', handlePanelsKeyPress, false);
		document.removeEventListener('keyup', handlePanelsKeyUp, false);
	}

	if (editor.nav.page === 'Components' && countItems(editor.project.components) <= 0) {
		return content;
	}

	if (editor.nav.page === 'Ligatures' && countItems(editor.project.ligatures) <= 0) {
		return content;
	}

	if (editor.nav.page === 'Kerning' && countItems(editor.project.kerning) <= 0) {
		return content;
	}

	if (panel === 'Attributes') {
		unsubscribeExcept('attributesPanel');
		if (editor.nav.page === 'Kerning') addAsChildren(content, makePanel_KernGroupAttributes());
		else addAsChildren(content, makePanel_GlyphAttributes());
	} else if (panel === 'Transforms') {
		unsubscribeExcept('transformsPanel');
		addAsChildren(content, makePanel_Transforms());
	} else if (panel === 'Layers') {
		unsubscribeExcept('layersPanel');
		addAsChildren(content, makePanel_Layers());
		document.addEventListener('keydown', handlePanelsKeyPress, false);
		document.addEventListener('keyup', handlePanelsKeyUp, false);
	} else if (panel === 'Context characters') {
		unsubscribeExcept('contextCharactersPanel');
		addAsChildren(content, makePanel_ContextCharacters());
	} else if (panel === 'History') {
		unsubscribeExcept('historyPanel');
		addAsChildren(content, makePanel_History());
	} else if (panel === 'Guides') {
		unsubscribeExcept('guidesPanel');
		addAsChildren(content, makePanel_Guides());
	} else if (panel === 'Character info') {
		unsubscribeExcept('characterInfoPanel');
		addAsChildren(content, makePanel_CharacterInfo());
	} else if (panel === 'Quality checks') {
		unsubscribeExcept('qualityChecksPanel');
		addAsChildren(content, makePanel_QualityChecks());
	}

	// log(`makePanel`, 'end');
	return content;
}

function unsubscribeExcept(panelName = '') {
	const editor = getCurrentProjectEditor();
	if (panelName !== 'attributesPanel') editor.unsubscribe({ idToRemove: 'attributesPanel' });
	if (panelName !== 'layersPanel') editor.unsubscribe({ idToRemove: 'layersPanel' });
	if (panelName !== 'contextCharactersPanel')
		editor.unsubscribe({ idToRemove: 'contextCharactersPanel' });
	if (panelName !== 'historyPanel') editor.unsubscribe({ idToRemove: 'historyPanel' });
	if (panelName !== 'guidesPanel') editor.unsubscribe({ idToRemove: 'guidesPanel' });
}

/**
 * Refreshes the panel area in the current document
 */
export function refreshPanel() {
	// log(`refreshPanel`, 'start');
	ensurePanelDrawerWiring();
	if (getCurrentProjectEditor().nav.panel === 'Transforms') {
		// log(`refreshPanel`, 'end');
		return;
	}
	let panelArea = document.querySelector('#editor-page__panel');
	if (panelArea) {
		let newContent = makePanel();
		// log(newContent);
		panelArea.innerHTML = '';
		panelArea.appendChild(newContent);
		wirePanelDrawerCloseButton();
	}
	// log(`refreshPanel`, 'end');
}

// --------------------------------------------------------------
// Panel drawer (Noddy responsive tiers T2/T3)
// Minimal open/close + focus in/out for the overlay drawer and
// sheet. All other panel logic above is untouched. State lives
// on document.body.noddy-panel-open so it survives navigation;
// CSS in editor-pages.css / content-pages.css does the layout.
// Keyboard shortcuts are never intercepted here except Tab wrap
// and Escape-to-dismiss while the drawer is open.
// --------------------------------------------------------------

const panelDrawerOpenClass = 'noddy-panel-open';
const compactViewportQuery = '(max-width: 1099px)';
const drawerFocusableSelector =
	'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
let panelDrawerWired = false;
/** @type {HTMLElement | null} */
let panelDrawerReturnFocusTo = null;

function isCompactViewport() {
	if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
	return window.matchMedia(compactViewportQuery).matches;
}

/**
 * Whether the panel drawer/sheet is currently open
 * @returns {Boolean}
 */
export function isPanelDrawerOpen() {
	if (typeof document === 'undefined' || !document.body) return false;
	return document.body.classList.contains(panelDrawerOpenClass);
}

function panelDrawerContainer() {
	if (typeof document === 'undefined') return null;
	return document.querySelector('#editor-page__panel, #content-page__panel');
}

function allFocusablesInDrawer(container) {
	if (!container) return [];
	return Array.from(container.querySelectorAll(drawerFocusableSelector)).filter(
		(element) => !element.disabled
	);
}

function syncPanelDrawerToggle() {
	if (typeof document === 'undefined') return;
	const toggle = document.querySelector('#noddy-panel-toggle');
	if (toggle) toggle.setAttribute('aria-expanded', isPanelDrawerOpen() ? 'true' : 'false');
}

/**
 * Opens the panel drawer/sheet (compact tiers only for focus moves)
 * @param {Boolean} moveFocus - move focus into the drawer when opening
 */
export function openPanelDrawer(moveFocus = true) {
	if (typeof document === 'undefined' || !document.body) return;
	const container = panelDrawerContainer();
	if (!container) return;
	if (!isPanelDrawerOpen()) {
		const active = document.activeElement;
		panelDrawerReturnFocusTo = active instanceof HTMLElement ? active : null;
		document.body.classList.add(panelDrawerOpenClass);
	}
	syncPanelDrawerToggle();
	if (moveFocus && isCompactViewport()) {
		const focusables = allFocusablesInDrawer(container);
		if (focusables.length > 0) focusables[0].focus();
	}
}

/**
 * Closes the panel drawer/sheet, returning focus to the opener
 * @param {Boolean} returnFocus - return focus to the pre-open element
 */
export function closePanelDrawer(returnFocus = true) {
	if (typeof document === 'undefined' || !document.body) return;
	if (!isPanelDrawerOpen()) return;
	document.body.classList.remove(panelDrawerOpenClass);
	syncPanelDrawerToggle();
	if (returnFocus) {
		const fallback =
			typeof document !== 'undefined'
				? document.querySelector('#noddy-panel-toggle')
				: null;
		const target =
			panelDrawerReturnFocusTo && document.contains(panelDrawerReturnFocusTo)
				? panelDrawerReturnFocusTo
				: fallback;
		if (target instanceof HTMLElement) target.focus();
	}
	panelDrawerReturnFocusTo = null;
}

/**
 * Toggles the panel drawer/sheet open state
 */
export function togglePanelDrawer() {
	if (isPanelDrawerOpen()) closePanelDrawer();
	else openPanelDrawer();
}

function makePanelDrawerToggle() {
	const toggle = makeElement({
		tag: 'button',
		id: 'noddy-panel-toggle',
		className: 'menu-entry-point noddy-panel-toggle',
		innerHTML: 'Panel',
		attributes: {
			title: 'Show or hide the panel',
			'aria-expanded': isPanelDrawerOpen() ? 'true' : 'false',
		},
	});
	toggle.addEventListener('click', () => togglePanelDrawer());
	return toggle;
}

function wirePanelDrawerToggle() {
	if (typeof document === 'undefined') return;
	if (document.querySelector('#noddy-panel-toggle')) return;
	// Primary mount: app top-bar menus (present on every navigator page).
	// Fallbacks cover shells without a top bar (editor / content page nav
	// areas). Same toggle, same behavior, same focus discipline in all
	// cases; no navigation logic is touched.
	const mount =
		document.querySelector('#app__top-bar .top-bar__menus') ||
		document.querySelector('.editor-page__nav-area') ||
		document.querySelector('.content-page__nav-area');
	if (!mount) return;
	mount.appendChild(makePanelDrawerToggle());
}

function wirePanelDrawerCloseButton() {
	if (typeof document === 'undefined') return;
	if (!isCompactViewport()) return;
	const container = panelDrawerContainer();
	if (!container || container.querySelector('.noddy-panel-close')) return;
	const closeButton = makeElement({
		tag: 'button',
		className: 'noddy-panel-close',
		innerHTML: '&times;',
		attributes: { title: 'Close panel', 'aria-label': 'Close panel' },
	});
	closeButton.addEventListener('click', () => {
		closePanelDrawer();
	});
	container.insertBefore(closeButton, container.firstChild);
}

function wirePanelDrawerChrome() {
	wirePanelDrawerToggle();
	wirePanelDrawerCloseButton();
}

/**
 * Drawer key discipline: Escape dismisses (the global canvas
 * handler also runs and closes dialogs — both layers dismiss
 * without swallowing the shortcut). Tab cycles inside the open
 * drawer. All other keys pass through untouched.
 * @param {KeyboardEvent} event - original event
 */
function handlePanelDrawerKeys(event) {
	if (!isPanelDrawerOpen() || !isCompactViewport()) return;
	if (event.key === 'Escape') {
		closePanelDrawer();
		return;
	}
	if (event.key !== 'Tab') return;
	const container = panelDrawerContainer();
	if (!container) return;
	const focusables = allFocusablesInDrawer(container);
	if (focusables.length === 0) return;
	if (!container.contains(document.activeElement)) {
		event.preventDefault();
		focusables[0].focus();
		return;
	}
	const first = focusables[0];
	const last = focusables[focusables.length - 1];
	if (event.shiftKey && document.activeElement === first) {
		event.preventDefault();
		last.focus();
	} else if (!event.shiftKey && document.activeElement === last) {
		event.preventDefault();
		first.focus();
	}
}

function ensurePanelDrawerWiring() {
	if (panelDrawerWired) {
		wirePanelDrawerChrome();
		return;
	}
	if (typeof document === 'undefined') return;
	panelDrawerWired = true;
	wirePanelDrawerChrome();
	if (typeof MutationObserver !== 'undefined') {
		const observer = new MutationObserver(() => wirePanelDrawerChrome());
		observer.observe(document.documentElement, { childList: true, subtree: true });
	}
	document.addEventListener('keydown', handlePanelDrawerKeys, false);
	if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
		const query = window.matchMedia(compactViewportQuery);
		const onCompactChange = () => {
			if (query.matches) {
				wirePanelDrawerChrome();
				// Default-closed: the drawer opens only via the toggle,
				// close button, or openPanelDrawer() callers — never
				// automatically (review fix-up: no surprise overlay).
			} else {
				closePanelDrawer(false);
			}
		};
		if (typeof query.addEventListener === 'function') {
			query.addEventListener('change', onCompactChange);
		} else if (typeof query.addListener === 'function') {
			query.addListener(onCompactChange);
		}
		onCompactChange();
	}
}

// Eager wiring: makePanel()/refreshPanel() only run on editor-panel pages,
// so content/app shells would otherwise never install the drawer observer
// or the toggle. Installing once at import covers every shell from first
// paint; per-page calls above just re-assert the chrome. No navigation
// logic is touched.
if (typeof document !== 'undefined' && typeof window !== 'undefined') {
	try {
		ensurePanelDrawerWiring();
	} catch {
		// Non-DOM environments: pages wire on demand via makePanel().
	}
}
