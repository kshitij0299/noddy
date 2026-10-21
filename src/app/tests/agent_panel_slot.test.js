import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import {
	AGENT_PANEL_SLOT_ID,
	getAgentPanelSlot,
	isAgentPanelMounted,
	makeWorkspace,
	mountAgentPanel,
	resetAgentPanelSlotForTests,
	unmountAgentPanel,
} from '../agent_panel_slot.js';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../main.js';
import { setLegacyPagesOverride } from '../legacy_pages.js';

/** @type {ProjectEditor} */
let editor;

beforeEach(() => {
	document.body.innerHTML = '<div id="app__wrapper"></div>';
	resetAgentPanelSlotForTests();
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	editor.project.settings.app.autoSave = false;
});

afterEach(() => {
	unmountAgentPanel();
	resetAgentPanelSlotForTests();
	getGlyphrStudioApp().projectEditors = [];
	document.body.innerHTML = '';
});

describe('Agent panel slot', () => {
	it('is hidden and the column is full width when nothing is mounted', () => {
		const workspace = makeWorkspace(document.createElement('div'));
		const slot = workspace.querySelector(`#${AGENT_PANEL_SLOT_ID}`);
		expect(slot).toBe(getAgentPanelSlot());
		expect(slot.hasAttribute('hidden')).toBe(true);
		expect(workspace.hasAttribute('data-agent-panel')).toBe(false);
		expect(isAgentPanelMounted()).toBe(false);
	});

	it('mounting a panel opens the second column; unmounting closes it', () => {
		const workspace = makeWorkspace(document.createElement('div'));
		document.querySelector('#app__wrapper').appendChild(workspace);
		const panel = document.createElement('section');
		panel.id = 'my-agent-panel';
		mountAgentPanel(panel);
		expect(isAgentPanelMounted()).toBe(true);
		expect(getAgentPanelSlot().hasAttribute('hidden')).toBe(false);
		expect(workspace.getAttribute('data-agent-panel')).toBe('open');
		unmountAgentPanel();
		expect(getAgentPanelSlot().hasAttribute('hidden')).toBe(true);
		expect(workspace.hasAttribute('data-agent-panel')).toBe(false);
	});

	it('the same slot and its contents survive editor.navigate()', () => {
		const panel = document.createElement('section');
		panel.id = 'my-agent-panel';
		panel.textContent = 'run in progress';
		mountAgentPanel(panel);

		// Settings and Help build without the canvas custom elements in jsdom.
		// They are hidden legacy pages now, so show them for this test.
		setLegacyPagesOverride(true);
		editor.nav.page = 'Settings';
		editor.navigate();
		const wrapper = document.querySelector('#app__wrapper');
		expect(wrapper.querySelector('#app__top-bar')).not.toBeNull();
		expect(wrapper.querySelector('#app__workspace #app__main-content')).not.toBeNull();
		const first = wrapper.querySelector(`#${AGENT_PANEL_SLOT_ID}`);
		expect(first).toBe(getAgentPanelSlot());
		expect(first.querySelector('#my-agent-panel')).toBe(panel);
		expect(wrapper.querySelector('#app__workspace').getAttribute('data-agent-panel')).toBe('open');

		editor.nav.page = 'Help';
		editor.navigate();
		const second = wrapper.querySelector(`#${AGENT_PANEL_SLOT_ID}`);
		expect(second).toBe(first);
		expect(second.querySelector('#my-agent-panel')).toBe(panel);
		expect(panel.textContent).toBe('run in progress');
		expect(wrapper.querySelectorAll('#app__top-bar').length).toBe(1);
		setLegacyPagesOverride(null);
	});
});
