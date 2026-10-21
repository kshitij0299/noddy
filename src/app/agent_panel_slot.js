/**
 * Persistent agent panel slot (M2 app shell).
 *
 * `Navigator.navigate()` wipes `#app__wrapper` on every page change, so the
 * slot is a module singleton that the workspace re-attaches each time. Its
 * children (the M4 agent panel) are never rebuilt, so a run survives
 * navigation.
 *
 * Mount a panel with `mountAgentPanel(node)`; the workspace switches to two
 * columns. With nothing mounted the slot is hidden and the left column is
 * full width.
 */

import { makeElement } from '../common/dom.js';

export const AGENT_PANEL_SLOT_ID = 'app__agent-panel-slot';
export const WORKSPACE_ID = 'app__workspace';

/** @type {HTMLElement | null} */
let slot = null;

/** 'open' (panel column or drawer) or 'minimized' (pill only). */
let panelMode = 'open';

/**
 * The singleton slot element (created on first use).
 * @returns {HTMLElement}
 */
export function getAgentPanelSlot() {
	if (!slot) {
		slot = makeElement({
			tag: 'aside',
			id: AGENT_PANEL_SLOT_ID,
			className: 'agent-panel-slot',
			attributes: { 'aria-label': 'Agent panel', hidden: '' },
		});
	}
	return slot;
}

/**
 * @returns {Boolean} true when something is mounted in the slot
 */
export function isAgentPanelMounted() {
	return !!slot && slot.childElementCount > 0;
}

/**
 * Mounts a panel element into the slot, replacing any previous content.
 * @param {Element} panel - the agent panel root
 * @returns {HTMLElement} the slot
 */
export function mountAgentPanel(panel) {
	const target = getAgentPanelSlot();
	target.replaceChildren(panel);
	target.removeAttribute('hidden');
	syncWorkspaceColumns();
	return target;
}

/**
 * Empties the slot; the left column goes back to full width.
 */
export function unmountAgentPanel() {
	if (!slot) return;
	slot.replaceChildren();
	slot.setAttribute('hidden', '');
	syncWorkspaceColumns();
}

/**
 * Minimizing keeps the panel mounted (its thread and run live on); the
 * workspace drops to one column and only the pill shows.
 * @param {'open' | 'minimized'} mode
 */
export function setAgentPanelMode(mode) {
	panelMode = mode === 'minimized' ? 'minimized' : 'open';
	syncWorkspaceColumns();
}

/** @returns {'open' | 'minimized'} */
export function getAgentPanelMode() {
	return /** @type {'open' | 'minimized'} */ (panelMode);
}

/**
 * Reflects the mounted state on the workspace so CSS can pick the columns:
 * `data-agent-panel` is 'open' or 'minimized' while a panel is mounted.
 * @param {Element | null =} workspace - defaults to the live `#app__workspace`
 */
export function syncWorkspaceColumns(workspace = document.getElementById(WORKSPACE_ID)) {
	if (slot) slot.setAttribute('data-mode', panelMode);
	if (!workspace) return;
	if (isAgentPanelMounted()) workspace.setAttribute('data-agent-panel', panelMode);
	else workspace.removeAttribute('data-agent-panel');
}

/**
 * Builds the two-column workspace below the top bar: the page content on the
 * left and the persistent agent panel slot on the right.
 * @param {Element} pageContent - the `#app__main-content` element
 * @returns {HTMLElement}
 */
export function makeWorkspace(pageContent) {
	const workspace = makeElement({ tag: 'div', id: WORKSPACE_ID, className: 'app-workspace' });
	workspace.appendChild(pageContent);
	workspace.appendChild(getAgentPanelSlot());
	syncWorkspaceColumns(workspace);
	return workspace;
}

/** Test helper: forgets the singleton so a fresh slot is built. */
export function resetAgentPanelSlotForTests() {
	slot = null;
	panelMode = 'open';
}
