import { addAsChildren, makeElement } from '../../common/dom.js';
import { closeAllInfoBubbles } from '../dialogs/dialogs.js';

export class TabControl {
	constructor(targetElement, label = 'Tabs') {
		this.tabs = [];
		this.targetElement = targetElement;
		this.label = label;
		this.targetElement.addEventListener('scroll', closeAllInfoBubbles);
	}

	/**
	 * Saves a new tab object to this tab group
	 * @param {String} tabName - name for the tab
	 * @param {function} contentMaker - function that creates the tab content
	 */
	registerTab(tabName = 'Tab Name', contentMaker = () => {}) {
		const isFirst = this.tabs.length === 0;
		const tabElement = makeElement({
			className: 'tab-control__tab',
			innerHTML: tabName,
			attributes: {
				tabindex: isFirst ? '0' : '-1',
				role: 'tab',
				'aria-selected': 'false',
				title: tabName,
			},
			onClick: () => {
				this.selectTab(tabName, false);
			},
		});
		tabElement.addEventListener('keydown', (ev) => this.tabKeyPress(ev, tabName));
		let newTab = {
			name: tabName,
			contentMaker: contentMaker,
			tabElement: tabElement,
		};

		this.tabs.push(newTab);
	}

	/**
	 * Makes the tabs
	 * @returns {Element}
	 */
	makeTabs() {
		const tabContainer = makeElement({
			tag: 'div',
			className: 'tab-control__tab-container panel__card full-width',
			attributes: { role: 'tablist', 'aria-label': this.label },
		});

		this.tabs.forEach((tabData) => {
			tabContainer.appendChild(tabData.tabElement);
		});

		return tabContainer;
	}

	/**
	 * Selects the specified tab
	 * @param {String} tabName - which to select
	 * @param {Boolean =} moveFocus - move keyboard focus to the selected tab
	 */
	selectTab(tabName, moveFocus = false) {
		this.targetElement.innerHTML = '';
		this.tabs.forEach((tab) => {
			if (tab.name === tabName) {
				tab.tabElement.setAttribute('selected', '');
				tab.tabElement.setAttribute('aria-selected', 'true');
				tab.tabElement.setAttribute('tabindex', '0');
				addAsChildren(this.targetElement, tab.contentMaker());
				if (moveFocus) tab.tabElement.focus();
			} else {
				tab.tabElement.removeAttribute('selected');
				tab.tabElement.setAttribute('aria-selected', 'false');
				tab.tabElement.setAttribute('tabindex', '-1');
			}
		});
		closeAllInfoBubbles();
	}

	/**
	 * Keyboard support: arrows move between tabs (roving tabindex),
	 * Enter/Space activate, Home/End jump to the ends.
	 * @param {Object} ev - keydown event
	 * @param {String} tabName - tab that has focus
	 */
	tabKeyPress(ev, tabName) {
		const currentIndex = this.tabs.findIndex((tab) => tab.name === tabName);
		if (currentIndex === -1) return;
		let nextIndex = -1;
		switch (ev.keyCode) {
			case 37: // d-pad left
			case 100: // ten key left
				nextIndex = (currentIndex - 1 + this.tabs.length) % this.tabs.length;
				break;
			case 39: // d-pad right
			case 102: // ten key right
				nextIndex = (currentIndex + 1) % this.tabs.length;
				break;
			case 36: // home
				nextIndex = 0;
				break;
			case 35: // end
				nextIndex = this.tabs.length - 1;
				break;
			case 13: // enter
			case 32: // space
				ev.preventDefault();
				this.selectTab(tabName, false);
				return;
			default:
				return;
		}
		ev.preventDefault();
		this.selectTab(this.tabs[nextIndex].name, true);
	}
}
