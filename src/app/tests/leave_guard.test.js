import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { ProjectEditor } from '../../project_editor/project_editor.js';
import { showBeforeUnloadConfirmation } from '../app.js';
import {
	LEAVE_MESSAGE,
	leaveGuardProbes,
	shouldShowNotAutosaving,
	shouldWarnBeforeLeaving,
} from '../leave_guard.js';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../main.js';
import { AUTOSAVE_CHIP_TEXT, makeAppTopBar } from '../top_bar.js';

if (!Element.prototype.animate) {
	Element.prototype.animate = () => ({ onfinish: null, cancel() {} });
}

/** @type {ProjectEditor} */
let editor;
let devMode;
const agent = { running: false };
const realAgentProbe = leaveGuardProbes.agentRunning;

const chip = () => document.querySelector('#top-bar-status .top-bar__autosave-chip');
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function setState({ autoSave, dirty }) {
	editor.project.settings.app.autoSave = autoSave;
	if (dirty) editor.setProjectAsUnsaved();
	else editor.setProjectAsSaved();
}

function mountBar() {
	const bar = makeAppTopBar();
	document.querySelector('#app__wrapper').appendChild(bar);
	return bar;
}

/** jsdom's Event.returnValue is a boolean, so use a BeforeUnloadEvent-like stub. */
function unloadEvent() {
	return {
		returnValue: '',
		defaultPrevented: false,
		preventDefault() {
			this.defaultPrevented = true;
		},
		stopPropagation() {},
	};
}

beforeEach(() => {
	if (!document.querySelector('title')) document.head.appendChild(document.createElement('title'));
	document.title = 'Noddy';
	document.body.innerHTML = '<div id="app__wrapper"></div>';
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	devMode = getGlyphrStudioApp().settings.dev.mode;
	getGlyphrStudioApp().settings.dev.mode = false;
	agent.running = false;
	leaveGuardProbes.agentRunning = () => agent.running;
});

afterEach(() => {
	leaveGuardProbes.agentRunning = realAgentProbe;
	getGlyphrStudioApp().settings.dev.mode = devMode;
	getGlyphrStudioApp().projectEditors = [];
	document.body.innerHTML = '';
});

describe('Not autosaving chip', () => {
	it.each([
		{ autoSave: false, dirty: true, visible: true },
		{ autoSave: false, dirty: false, visible: false },
		{ autoSave: true, dirty: true, visible: false },
		{ autoSave: true, dirty: false, visible: false },
	])('autosave $autoSave, dirty $dirty → visible $visible', ({ autoSave, dirty, visible }) => {
		setState({ autoSave, dirty });
		mountBar();
		expect(shouldShowNotAutosaving()).toBe(visible);
		expect(!!chip()).toBe(visible);
		const status = document.getElementById('top-bar-status');
		expect(status.childElementCount).toBe(visible ? 1 : 0);
		if (visible) {
			expect(chip().textContent).toBe(`cloud_off${AUTOSAVE_CHIP_TEXT}`);
			expect(chip().querySelector('.material-symbols-rounded').getAttribute('aria-hidden')).toBe(
				'true'
			);
			expect(chip().classList.contains('text-label')).toBe(true);
		}
	});

	it('real agent probe reports idle when no Agent window exists', () => {
		expect(realAgentProbe()).toBe(false);
	});

	it('treats dev mode with dev autosave off as not autosaving', () => {
		const app = getGlyphrStudioApp();
		const devAutoSave = app.settings.dev.autoSave;
		app.settings.dev.mode = true;
		app.settings.dev.autoSave = false;
		setState({ autoSave: true, dirty: true });
		expect(shouldShowNotAutosaving()).toBe(true);
		app.settings.dev.autoSave = devAutoSave;
	});

	it('appears on the first unsaved change and goes away after saving', async () => {
		setState({ autoSave: false, dirty: false });
		mountBar();
		expect(chip()).toBeNull();
		editor.setProjectAsUnsaved();
		await flush();
		expect(chip()).not.toBeNull();
		editor.setProjectAsSaved();
		await flush();
		expect(chip()).toBeNull();
	});
});

describe('beforeunload', () => {
	it.each([
		{ dirty: false, running: false, warn: false },
		{ dirty: true, running: false, warn: true },
		{ dirty: false, running: true, warn: true },
		{ dirty: true, running: true, warn: true },
	])('dirty $dirty, agent running $running → warn $warn', ({ dirty, running, warn }) => {
		setState({ autoSave: true, dirty });
		agent.running = running;
		expect(shouldWarnBeforeLeaving()).toBe(warn);
		const event = unloadEvent();
		const result = showBeforeUnloadConfirmation(/** @type {any} */ (event));
		if (warn) {
			expect(event.returnValue).toBe(LEAVE_MESSAGE);
			expect(event.defaultPrevented).toBe(true);
			expect(result).toBe(LEAVE_MESSAGE);
		} else {
			expect(event.returnValue).toBe('');
			expect(event.defaultPrevented).toBe(false);
			expect(result).toBeUndefined();
		}
	});
});
