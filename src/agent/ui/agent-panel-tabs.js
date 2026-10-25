/**
 * The agent panel's tabs: Agent | Chaos (owner decision 2026-10-24, PR B shell).
 *
 * The Chaos tab holds algorithmic tools that run without AI (PR C). PR B ships only the shell:
 * the tab row appears once at least one chaos tool is registered, so no empty tab ships. Until
 * then the header shows the plain "Agent" title.
 *
 * Registration hook for PR C:
 *
 *   import { registerChaosTool } from './agent-panel-tabs.js';
 *   const unregister = registerChaosTool({
 *     id: 'slash-cut',
 *     label: 'Slash cut',
 *     // Draws the tool into its own block in the Chaos tab; may return a dispose function.
 *     mount(container, { getEditor }) { ... return () => {}; },
 *   });
 *
 * Keyboard: the tab row is one tab stop (roving tabindex); Left / Right / Home / End move and
 * select (automatic activation), as in the WAI-ARIA tabs pattern.
 */
import { el } from './cards/card-shell.js';

/** @typedef {{id: String, label: String, mount: (container: HTMLElement, context: Object) => (void | (() => void))}} ChaosTool */

/** @type {Map<String, ChaosTool>} */
const tools = new Map();
const events = new EventTarget();

/**
 * Adds a tool to the Chaos tab (and shows the tab). The same id replaces the old tool.
 * @param {ChaosTool} tool
 * @returns {() => void} unregister
 */
export function registerChaosTool(tool) {
	if (!tool || typeof tool.id !== 'string' || !tool.id || typeof tool.mount !== 'function')
		throw new Error('A chaos tool needs an id and a mount(container) function.');
	tools.set(tool.id, { ...tool, label: String(tool.label || tool.id) });
	events.dispatchEvent(new Event('change'));
	return () => {
		if (tools.get(tool.id)?.mount !== tool.mount) return;
		tools.delete(tool.id);
		events.dispatchEvent(new Event('change'));
	};
}

/** @returns {Array<ChaosTool>} */
export function listChaosTools() {
	return [...tools.values()];
}

/** @returns {() => void} unsubscribe */
export function onChaosToolsChange(listener) {
	events.addEventListener('change', listener);
	return () => events.removeEventListener('change', listener);
}

/** Test helper. */
export function resetChaosToolsForTests() {
	tools.clear();
	events.dispatchEvent(new Event('change'));
}

export const PANEL_TABS = Object.freeze([
	{ id: 'agent', label: 'Agent' },
	{ id: 'chaos', label: 'Chaos' },
]);

let tabsCount = 0;

/**
 * @param {Object} options
 * @param {Record<String, HTMLElement>} options.panels - tab id → its tab panel element
 * @param {(id: String) => void} [options.onSelect]
 */
export function createPanelTabs({ panels, onSelect = () => {} }) {
	const uid = `agent-tabs-${++tabsCount}`;
	const root = el('div', 'agent-tabs');
	root.setAttribute('role', 'tablist');
	root.setAttribute('aria-label', 'Agent panel');
	let current = 'agent';

	const buttons = PANEL_TABS.map((tab) => {
		const button = /** @type {HTMLButtonElement} */ (
			el('button', 'agent-tab text-label', tab.label)
		);
		button.type = 'button';
		button.id = `${uid}-${tab.id}`;
		button.dataset.tab = tab.id;
		button.setAttribute('role', 'tab');
		const panel = panels[tab.id];
		if (panel) {
			panel.id ||= `${uid}-${tab.id}-panel`;
			panel.setAttribute('role', 'tabpanel');
			panel.setAttribute('aria-labelledby', button.id);
			button.setAttribute('aria-controls', panel.id);
		}
		button.addEventListener('click', () => select(tab.id));
		return button;
	});
	root.append(...buttons);

	root.addEventListener('keydown', (event) => {
		const at = buttons.findIndex((button) => button === document.activeElement);
		if (at < 0) return;
		let next = -1;
		if (event.key === 'ArrowRight') next = (at + 1) % buttons.length;
		else if (event.key === 'ArrowLeft') next = (at - 1 + buttons.length) % buttons.length;
		else if (event.key === 'Home') next = 0;
		else if (event.key === 'End') next = buttons.length - 1;
		if (next < 0) return;
		event.preventDefault();
		select(buttons[next].dataset.tab, { focus: true });
	});

	function select(id, { focus = false } = {}) {
		if (!PANEL_TABS.some((tab) => tab.id === id)) return;
		current = id;
		for (const button of buttons) {
			const on = button.dataset.tab === id;
			button.setAttribute('aria-selected', String(on));
			button.tabIndex = on ? 0 : -1;
			if (on && focus) button.focus();
		}
		for (const [tabId, panel] of Object.entries(panels)) panel.hidden = tabId !== id;
		onSelect(id);
	}

	select('agent');

	return {
		root,
		select,
		get current() {
			return current;
		},
	};
}
