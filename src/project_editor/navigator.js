import { showAppErrorPage } from '../app/app.js';
import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { makeAppTopBar } from '../app/menu.js';
import { accentColors } from '../common/colors.js';
import { addAsChildren, insertAfter, makeElement } from '../common/dom.js';
import { countItems } from '../common/functions.js';
import { makeIcon } from '../common/graphics.js';
import { animateRemove, closeEveryTypeOfDialog } from '../controls/dialogs/dialogs.js';
import { makePage_About } from '../pages/about.js';
import { makePage_Characters } from '../pages/characters.js';
import { makePage_Components } from '../pages/components.js';
import { makePage_GlobalActions } from '../pages/global_actions.js';
import { makePage_Help } from '../pages/help.js';
import { makePage_Kerning } from '../pages/kerning.js';
import { makePage_Ligatures } from '../pages/ligatures.js';
import { livePreviewPageWindowResize, makePage_LivePreview } from '../pages/live_preview.js';
import { makePage_Overview } from '../pages/overview.js';
import { makePage_Settings } from '../pages/settings.js';
import { makeSingleItemTypeChooserContent } from '../panels/item_chooser.js';

// --------------------------------------------------------------
// Navigation
// --------------------------------------------------------------

export class Navigator {
	constructor() {
		this.page = 'Overview';
		this.panel = 'Attributes';
		this.pageContents = {};
	}

	/**
	 * List of pages the editor supports
	 */
	get tableOfContents() {
		return {
			Overview: {
				pageMaker: makePage_Overview,
				iconName: 'page_overview',
			},
			'Design glyphs': {
				type: 'subtitle',
			},
			Characters: {
				pageMaker: makePage_Characters,
				iconName: 'page_characters',
			},
			Ligatures: {
				pageMaker: makePage_Ligatures,
				iconName: 'page_ligatures',
			},
			Components: {
				pageMaker: makePage_Components,
				iconName: 'page_components',
			},
			Refine: {
				type: 'subtitle',
			},
			Kerning: {
				pageMaker: makePage_Kerning,
				iconName: 'page_kerning',
			},
			'Live preview': {
				pageMaker: makePage_LivePreview,
				iconName: 'page_livePreview',
			},
			'Global actions': {
				pageMaker: makePage_GlobalActions,
				iconName: 'page_globalActions',
			},
			'Settings & more': {
				type: 'subtitle',
			},
			Settings: {
				pageMaker: makePage_Settings,
				iconName: 'page_settings',
			},
			'Import & export': {
				pageMaker: false,
				iconName: 'page_importAndExport',
			},
			Help: {
				pageMaker: makePage_Help,
				iconName: 'page_help',
			},
			About: {
				pageMaker: makePage_About,
				iconName: 'page_about',
			},
		};
	}

	/**
	 * Changes the page of this Project Editor
	 * @param {Boolean =} test - set to true when running from Vitest
	 */
	navigate(test = false) {
		// log(`Navigator.navigate`, 'start');
		closeEveryTypeOfDialog();
		const wrapper = document.querySelector('#app__wrapper');

		if (wrapper) {
			try {
				const pageContentWrapper = this.makePageContent();
				// pageContentWrapper is #app__main-content containing #app__page
				const isWrapper = pageContentWrapper.id === 'app__main-content';
				const innerPage = isWrapper ? pageContentWrapper.firstElementChild || pageContentWrapper : pageContentWrapper;
				let body = wrapper.querySelector('#app__body');
				let mainContent;
				let rail;
				if (!body) {
					// Fresh shell — create top-bar + body (rail + main)
					wrapper.innerHTML = '';
					const topBar = makeAppTopBar();
					wrapper.appendChild(topBar);
					body = makeElement({ tag: 'div', id: 'app__body' });
					rail = makeDiscordRail();
					// Use the wrapper returned by makePageContent as mainContent directly
					mainContent = isWrapper ? pageContentWrapper : makeElement({ tag: 'div', id: 'app__main-content' });
					if (!isWrapper) mainContent.appendChild(innerPage);
					body.appendChild(rail);
					body.appendChild(mainContent);
					wrapper.appendChild(body);
				} else {
					// Shell exists — refresh top-bar, ensure rail visible & active, swap main content
					const existingTopBar = wrapper.querySelector('#app__top-bar');
					const newTopBar = makeAppTopBar();
					if (existingTopBar) existingTopBar.replaceWith(newTopBar);
					else wrapper.prepend(newTopBar);
					// Ensure body is directly after top-bar
					if (body.parentElement !== wrapper) wrapper.appendChild(body);
					else if (body.previousElementSibling !== newTopBar) {
						wrapper.insertBefore(body, newTopBar.nextSibling);
					}
					rail = body.querySelector('.discord-rail');
					if (!rail) {
						rail = makeDiscordRail();
						body.prepend(rail);
					} else {
						syncDiscordRailActiveState(rail, this.page);
						rail.hidden = false;
						rail.classList.remove('is-hidden');
						rail.style.display = '';
						rail.removeAttribute('hidden');
					}
					mainContent = body.querySelector('#app__main-content');
					if (!mainContent) {
						mainContent = makeElement({ tag: 'div', id: 'app__main-content' });
						body.appendChild(mainContent);
					}
					mainContent.innerHTML = '';
					// Insert the inner page (avoid nested #app__main-content)
					if (isWrapper && innerPage) {
						mainContent.appendChild(innerPage);
					} else {
						mainContent.appendChild(pageContentWrapper);
					}
				}
			} catch (e) {
				console.warn(`Navigation failed:`, e);
				showAppErrorPage(`Oops, navigation failed!`, e);
			}
		} else {
			if (!test) console.warn(`Navigation failed: app__wrapper could not be found.`);
		}
		// log(`Navigator.navigate`, 'end');
	}

	/**
	 * Sets the current view to the appropriate Page
	 * @returns {HTMLElement} #app__main-content wrapper containing page
	 */
	makePageContent() {
		const editorContent = makeElement({
			tag: 'div',
			id: 'app__main-content',
		});

		// Default page loader fallback
		let pageContent = makeElement({ tag: 'h1', innerHTML: 'Uninitialized page content' });
		let currentPageMaker = this.tableOfContents[this.page].pageMaker;

		if (!currentPageMaker) {
			console.warn(`No page maker for ${this.page}`);
			pageContent.innerHTML += `<br>${this.page}`;
		} else {
			window.removeEventListener('resize', livePreviewPageWindowResize);
			pageContent = this.tableOfContents[this.page].pageMaker();
			// Rail is now shell-level (#app__body > .discord-rail), not injected per page.
		}
		editorContent.appendChild(pageContent);

		return editorContent;
	}

	/**
	 * Returns True if the current page has an item chooser panel
	 * @returns {Boolean}
	 */
	get isOnChooserPanelPage() {
		const nh = this.page;
		return nh === 'Characters' || nh === 'Components' || nh === 'Kerning' || nh === 'Ligatures';
	}

	/**
	 * Returns true if the current page has an Edit Canvas
	 * @returns {Boolean}
	 */
	get isOnEditCanvasPage() {
		const nh = this.page;
		return nh === 'Characters' || nh === 'Components' || nh === 'Kerning' || nh === 'Ligatures';
	}
}

// --------------------------------------------------------------
// Helpers
// --------------------------------------------------------------

export function makeNavButton(properties = {}) {
	let title = properties.title || 't i t l e';
	let superTitle = properties.superTitle || 's u p e r t i t l e';
	let level = properties.level || '';

	return `
		<button
			data-nav-type="${superTitle}"
			class="nav-button"
			id="nav-button${level ? `-${level}` : ''}"
			title="${title}"
		>
			${makeNavButtonContent(title, superTitle)}
		</button>
	`;
}

export function makeNavButtonContent(title, superTitle) {
	return `
		<span class="nav-button__super-title">${superTitle}</span>
		<span class="nav-button__title" title="${title}">${title}</span>
	`;
}

export function toggleNavDropdown(parentElement) {
	closeAllNavMenus();
	showNavDropdown(parentElement);
}

/**
 *	Close all the main nav menu dropdowns
 * @param {Boolean} isChooserMenu - The Item Chooser can be inside a nav menu,
 *	this method gets called from other dropdowns, so we have to know if this is
 *	being called from a control inside a nav menu or from outside of it.
 */
export function closeAllNavMenus(isChooserMenu = false) {
	// log(`closeAllNavMenus`, 'start');
	let navMenus = document.querySelectorAll('nav');
	// log(navMenus);
	navMenus.forEach((elem) => {
		if (isChooserMenu) {
			if (elem.id !== 'nav-dropdown-chooser') animateRemove(elem);
		} else {
			animateRemove(elem);
		}
	});
	// log(`closeAllNavMenus`, 'end');
}

export function showNavDropdown(parentElement) {
	// log(`showNavDropdown`, 'start');
	let size = '500px';
	let navID;
	let rect = parentElement.getBoundingClientRect();
	let parentStyle = getComputedStyle(parentElement);
	let top = rect.top + rect.height - 3;

	let dropdownContent = makeElement({ tag: 'h3', content: 'Uninitialized' });
	let dropdownType = parentElement.getAttribute('data-nav-type');
	// log(`dropdownType: ${dropdownType}`);

	if (dropdownType === 'PAGE') {
		dropdownContent = makePageChooserContent();
		size = `${parentElement.parentElement.getBoundingClientRect().width - 2}px`;
		navID = 'nav-dropdown-page';
	}

	if (dropdownType === 'EDITING') {
		const editor = getCurrentProjectEditor();
		const project = getCurrentProject();
		dropdownContent = makeSingleItemTypeChooserContent(editor.nav.page, (itemID) => {
			editor.selectedItemID = itemID;
			editor.history.addState(`Navigated to ${editor.project.getItemName(itemID, true)}`);
			closeAllNavMenus();
		});

		if (
			(editor.nav.page === 'Ligatures' && countItems(project.ligatures) > 25) ||
			(editor.nav.page === 'Components' && countItems(project.components) > 25) ||
			editor.nav.page === 'Characters'
		) {
			size = '80%';
		} else {
			size = `${parentElement.getBoundingClientRect().width - 2}px`;
		}

		navID = 'nav-dropdown-chooser';
	}

	if (dropdownType === 'PANEL') {
		dropdownContent = makePanelChooserContent();
		size = `${rect.width - 2}px`;
		navID = 'nav-dropdown-panel';
	}

	let dropDown = makeElement({
		tag: 'nav',
		id: navID,
		attributes: { tabindex: '-1' },
		style: `
			left: ${rect.left + 1}px;
			top: ${top}px;
			min-width: ${size};
			max-width: 60%;
			background-color: ${parentStyle.backgroundColor};
			border-color: ${parentStyle.backgroundColor};
		`,
	});

	addAsChildren(dropDown, dropdownContent);
	// log(`dropDown:`);
	// log(dropDown);
	// closeAllNavMenus();
	closeEveryTypeOfDialog();

	// let appWrapper = document.querySelector('#app__wrapper');
	// appWrapper.appendChild(dropDown).focus();
	insertAfter(parentElement, dropDown);

	// log(`showNavDropdown`, 'end');
}

function makePageChooserContent() {
	// log(`makePageChooserContent`, 'start');

	let content = makeElement();
	let pageButton;
	let toc = getCurrentProjectEditor().nav.tableOfContents;

	Object.keys(toc).forEach((itemName) => {
		if (toc[itemName]?.type === 'subtitle') {
			content.appendChild(
				makeElement({ tag: 'h3', content: itemName, className: 'nav-dropdown__subtitle' })
			);
		} else if (itemName !== 'Open project' && toc[itemName].pageMaker) {
			pageButton = makeNavButton_Page(itemName, toc[itemName].iconName);
			content.appendChild(pageButton);
		}
	});

	// log(`makePageChooserContent`, 'end');
	return content;
}

function makeNavButton_Page(pageName, iconName) {
	let button = makeElement({
		tag: 'button',
		className: 'nav-dropdown__button',
		attributes: { tabindex: '0' },
	});
	button.innerHTML += makeIcon({ name: iconName, color: accentColors.blue.l90 });
	button.appendChild(makeElement({ content: pageName }));
	button.addEventListener('click', () => {
		let editor = getCurrentProjectEditor();
		if (editor.nav.page !== pageName) {
			editor.multiSelect.shapes.clear();
			editor.multiSelect.points.clear();
		}

		// Ensure the selected Panel is availabe for the new page, otherwise default to Attributes
		editor.nav.page = pageName;
		if (panelsPerPage?.[pageName]) {
			if (!panelsPerPage[pageName].includes(editor.nav.panel)) editor.nav.panel = 'Attributes';
		}

		editor.navigate();
		if (editor.selectedItemID) {
			let lastChange = editor.history.queue[0] || false;

			// Only add a nav item to the history queue if the previous undo item:
			//  - matches the current selected item
			//  - is not a whole project save
			if (
				lastChange &&
				!(lastChange.wholeProjectSave || lastChange.itemID === editor.selectedItemID)
			) {
				editor.history.addState(
					`Navigated to ${editor.project.getItemName(editor.selectedItemID, true)}`
				);
			}
		}
	});
	return button;
}

const panelsPerPage = {
	Characters: [
		'Attributes',
		'Layers',
		'ContextCharacters',
		'Transforms',
		'History',
		'Guides',
		'CharacterInfo',
		'QualityChecks',
	],
	Ligatures: ['Attributes', 'Layers', 'Transforms', 'History', 'Guides', 'QualityChecks'],
	Components: ['Attributes', 'Layers', 'Transforms', 'History', 'Guides', 'QualityChecks'],
	Kerning: ['Attributes', 'History'],
};

function makePanelChooserContent() {
	// log(`makePanelChooserContent`, 'start');
	let content = makeElement();
	let pageButton;
	let panels = listOfPanels();
	let page = getCurrentProjectEditor().nav.page;
	panelsPerPage[page].forEach((panelName) => {
		pageButton = makeNavButton_Panel(panels[panelName].name, panels[panelName].iconName);
		content.appendChild(pageButton);
	});

	// log(`makePanelChooserContent`, 'end');
	return content;
}

function makeNavButton_Panel(panelName, iconName) {
	let button = makeElement({
		tag: 'button',
		className: 'nav-dropdown__button',
		attributes: { tabindex: '0' },
	});
	button.innerHTML += makeIcon({ name: iconName, color: accentColors.blue.l90 });
	button.appendChild(makeElement({ content: panelName }));
	button.addEventListener('click', () => {
		// log(`navButton.click`, 'start');
		// log(`panelName: ${panelName}`);
		const editor = getCurrentProjectEditor();
		editor.nav.panel = panelName;
		editor.showPageTransitions = false;
		editor.navigate();
		editor.showPageTransitions = true;
		// log(`navButton.click`, 'end');
	});
	return button;
}

// --------------------------------------------------------------
// Discord-style page rail — icons-only vertical sidebar
// --------------------------------------------------------------

/**
 * Creates the Discord-like page rail element.
 * Icons only; groups separated by dividers mirroring
 * tableOfContents subtitles. Active page gets pill + peach fill.
 * @returns {HTMLElement}
 */
export function makeDiscordRail() {
	const editor = getCurrentProjectEditor();
	const toc = editor.nav.tableOfContents;
	const currentPage = editor.nav.page;

	const rail = makeElement({
		tag: 'nav',
		className: 'discord-rail',
		attributes: {
			'aria-label': 'Pages',
			role: 'navigation',
		},
	});

	let isFirstGroup = true;

	Object.keys(toc).forEach((pageName) => {
		const entry = toc[pageName];

		if (entry?.type === 'subtitle') {
			// Divider between groups — not before the very first group
			if (!isFirstGroup) {
				rail.appendChild(
					makeElement({
						tag: 'div',
						className: 'discord-rail__separator',
						attributes: { 'aria-hidden': 'true' },
					})
				);
			} else {
				isFirstGroup = false;
			}
			// Still mark that we passed a subtitle group so the next
			// divider logic works even if subtitle is first.
			return;
		}

		// Mirror chooser filter: skip non-page entries
		if (pageName === 'Open project' || !entry.pageMaker) return;

		isFirstGroup = false;

		const isActive = pageName === currentPage;
		const btn = makeElement({
			tag: 'button',
			className: `discord-rail__item${isActive ? ' discord-rail__item--active' : ''}`,
			attributes: {
				'aria-label': pageName,
				title: pageName,
				'aria-current': isActive ? 'page' : null,
				'data-page': pageName,
				type: 'button',
				tabindex: '0',
			},
		});

				// Pill indicator (left accent for active / hover)
		const pill = makeElement({
			tag: 'span',
			className: 'discord-rail__pill',
			attributes: { 'aria-hidden': 'true' },
		});

		// Icon — use currentColor so CSS color controls fill
		const iconWrap = makeElement({
			tag: 'span',
			className: 'discord-rail__icon',
			attributes: { 'aria-hidden': 'true' },
		});
		iconWrap.innerHTML = makeIcon({ name: entry.iconName, color: 'currentColor' });

		// Keep lightweight inline tooltip for a11y fallback (hidden when fixed tooltip is active)
		// Real hover label uses fixed portal to escape overflow clipping — see show/hide handlers below.
		const tooltip = makeElement({
			tag: 'span',
			className: 'discord-rail__tooltip',
			attributes: { 'aria-hidden': 'true' },
			content: pageName,
		});

		addAsChildren(btn, [pill, iconWrap, tooltip]);

		// Fixed tooltip portal — escapes all overflow clipping, always on right
		btn.addEventListener('mouseenter', () => {
			showDiscordRailTooltip(pageName, btn);
		});
		btn.addEventListener('mouseleave', hideDiscordRailTooltip);
		btn.addEventListener('focus', () => {
			showDiscordRailTooltip(pageName, btn);
		});
		btn.addEventListener('blur', hideDiscordRailTooltip);
		// Keep tooltip aligned on scroll/resize while hovered
		btn.addEventListener('mousemove', () => {
			// Re-position if already visible
			const tip = document.getElementById('discord-rail-tooltip-fixed');
			if (tip && tip.style.opacity === '1') showDiscordRailTooltip(pageName, btn);
		});

		btn.addEventListener('click', () => {
			if (editor.nav.page !== pageName) {
				editor.multiSelect.shapes.clear();
				editor.multiSelect.points.clear();
			}
			editor.nav.page = pageName;
			if (panelsPerPage?.[pageName]) {
				if (!panelsPerPage[pageName].includes(editor.nav.panel))
					editor.nav.panel = 'Attributes';
			}
			editor.navigate();
			if (editor.selectedItemID) {
				const lastChange = editor.history.queue[0] || false;
				if (
					lastChange &&
					!(lastChange.wholeProjectSave || lastChange.itemID === editor.selectedItemID)
				) {
					editor.history.addState(
						`Navigated to ${editor.project.getItemName(editor.selectedItemID, true)}`
					);
				}
			}
		});

		rail.appendChild(btn);
	});

	return rail;
}

/**
 * Update active state of an existing persistent rail without recreating DOM.
 * @param {HTMLElement} rail
 * @param {String} currentPage
 */
export function syncDiscordRailActiveState(rail, currentPage) {
	if (!rail) return;
	const page = currentPage || getCurrentProjectEditor()?.nav?.page;
	rail.querySelectorAll('.discord-rail__item').forEach((btn) => {
		const isActive = btn.getAttribute('data-page') === page;
		btn.classList.toggle('discord-rail__item--active', isActive);
		if (isActive) btn.setAttribute('aria-current', 'page');
		else btn.removeAttribute('aria-current');
	});
}

// -- Fixed tooltip portal (escapes overflow clipping) --
let _discordRailFixedTip = null;
function ensureDiscordRailFixedTip() {
	if (_discordRailFixedTip && document.body.contains(_discordRailFixedTip)) return _discordRailFixedTip;
	_discordRailFixedTip = makeElement({
		tag: 'div',
		id: 'discord-rail-tooltip-fixed',
		className: 'discord-rail__tooltip discord-rail__tooltip--fixed',
		attributes: { 'aria-hidden': 'true', role: 'tooltip' },
	});
	_discordRailFixedTip.style.opacity = '0';
	_discordRailFixedTip.style.pointerEvents = 'none';
	document.body.appendChild(_discordRailFixedTip);
	return _discordRailFixedTip;
}

function showDiscordRailTooltip(text, anchorEl) {
	const tip = ensureDiscordRailFixedTip();
	tip.textContent = text;
	tip.style.opacity = '1';
	tip.style.transform = 'translateY(-50%) translateX(0) scale(1)';
	// Position fixed to the right of the anchor
	const rect = anchorEl.getBoundingClientRect();
	// Ensure tip is measured after display
	tip.style.left = `${rect.right + 14}px`;
	// Use anchor center; fixed tooltip uses transform translateY(-50%)
	tip.style.top = `${rect.top + rect.height / 2}px`;
	// Keep within viewport vertically
	requestAnimationFrame(() => {
		const tipRect = tip.getBoundingClientRect();
		const pad = 8;
		let top = rect.top + rect.height / 2;
		if (tipRect.top < pad) top = pad + tipRect.height / 2;
		if (tipRect.bottom > window.innerHeight - pad) top = window.innerHeight - pad - tipRect.height / 2;
		tip.style.top = `${top}px`;
	});
}

function hideDiscordRailTooltip() {
	if (_discordRailFixedTip) {
		_discordRailFixedTip.style.opacity = '0';
		_discordRailFixedTip.style.transform = 'translateY(-50%) translateX(-4px) scale(0.98)';
	}
}

/**
 * List of panels the editor supports
 */
function listOfPanels() {
	return {
		Attributes: {
			name: 'Attributes',
			panelMaker: false,
			iconName: 'panel_attributes',
		},
		Layers: {
			name: 'Layers',
			panelMaker: false,
			iconName: 'panel_layers',
		},
		ContextCharacters: {
			name: 'Context characters',
			panelMaker: false,
			iconName: 'panel_contextCharacters',
		},
		Transforms: {
			name: 'Transforms',
			panelMaker: false,
			iconName: 'panel_transforms',
		},
		History: {
			name: 'History',
			panelMaker: false,
			iconName: 'panel_history',
		},
		Guides: {
			name: 'Guides',
			panelMaker: false,
			iconName: 'panel_guides',
		},
		CharacterInfo: {
			name: 'Character info',
			panelMaker: false,
			iconName: 'panel_characterInfo',
		},
		QualityChecks: {
			name: 'Quality checks',
			panelMaker: false,
			iconName: 'panel_qualityChecks',
		},
	};
}
