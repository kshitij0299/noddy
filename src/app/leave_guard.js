/**
 * Safety signals for an open project (issue #10):
 * - whether autosave is currently off or unavailable,
 * - whether leaving the page should ask first (unsaved work or an agent run).
 *
 * Read-only: nothing here saves, serializes or changes agent behaviour.
 */

import { isAgentRunning } from '../agent/agent-window.js';
import { getCurrentProject, getGlyphrStudioApp } from './main.js';

/**
 * Read at call time so tests can stand in for the Agent window.
 */
export const leaveGuardProbes = {
	agentRunning: () => isAgentRunning(),
};

/** Same wording as the app's beforeunload confirmation. */
export const LEAVE_MESSAGE = 'Are you sure you want to exit? Any unsaved data may be lost.';

/**
 * The editor marks unsaved work with a bullet in the document title
 * (`setProjectAsUnsaved`); there is no separate flag.
 * @returns {Boolean}
 */
export function hasUnsavedChanges() {
	return document.title.includes(' •');
}

/**
 * True when edits are written to local storage after each change: the
 * project setting is on and (in dev mode) the dev override is on too.
 * The app turns the project setting off when local storage is full.
 * @returns {Boolean}
 */
export function isAutosaveOn() {
	const project = getCurrentProject();
	if (!project?.settings?.app?.autoSave) return false;
	const app = getGlyphrStudioApp();
	if (app?.settings?.dev?.mode) return !!app.settings.dev.autoSave;
	return true;
}

/**
 * Show the "Not autosaving" chip only when it matters.
 * @returns {Boolean}
 */
export function shouldShowNotAutosaving() {
	return !isAutosaveOn() && hasUnsavedChanges();
}

/**
 * Leaving should ask only with unsaved changes or while an agent run is
 * active; never when the project is clean and the agent idle.
 * @returns {Boolean}
 */
export function shouldWarnBeforeLeaving() {
	return hasUnsavedChanges() || leaveGuardProbes.agentRunning();
}
