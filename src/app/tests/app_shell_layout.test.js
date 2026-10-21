import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../main.js';

/**
 * Regression for PR #42 B3: app pages (open project, cross-project actions)
 * have no top bar and are the wrapper's only child. The shell grid gives
 * row 1 to the bar, so that child must span both rows or the start screen
 * is squeezed into 56px. jsdom does no layout, so this checks the DOM
 * shape plus the stylesheet rule that places it.
 */
const appCss = fs.readFileSync(path.resolve(__dirname, '../app.css'), 'utf8');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
function declarationsFor(selector) {
	const css = stripComments(appCss);
	const re = /([^{}]+)\{([^{}]*)\}/g;
	let match;
	while ((match = re.exec(css)) !== null) {
		const parts = match[1].split(',').map((s) => s.trim());
		if (parts.includes(selector)) return match[2].replace(/\s+/g, ' ');
	}
	return null;
}

beforeEach(() => {
	document.body.innerHTML = '<div id="app__wrapper"></div>';
	const editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	editor.project.settings.app.autoSave = false;
});

afterEach(() => {
	getGlyphrStudioApp().projectEditors = [];
	document.body.innerHTML = '';
});

describe('App shell layout: pages without a top bar', () => {
	it('an app page is the wrapper’s only child and spans the whole grid', () => {
		getGlyphrStudioApp().appPageNavigate(() => {
			const page = document.createElement('div');
			page.id = 'open-project__page';
			return page;
		});
		const wrapper = document.querySelector('#app__wrapper');
		expect(wrapper.childElementCount).toBe(1);
		expect(wrapper.firstElementChild.id).toBe('app__main-content');
		expect(wrapper.querySelector('#app__top-bar')).toBeNull();

		const decls = declarationsFor('#app__wrapper > #app__main-content');
		expect(decls, 'app.css must place the bar-less main content').not.toBeNull();
		expect(decls).toMatch(/grid-row:\s*1\s*\/\s*-1/);
	});

	it('the shell grid reserves row 1 for the bar and row 2 for the workspace', () => {
		expect(declarationsFor('#app__wrapper')).toMatch(/grid-template-rows:\s*56px minmax\(0, 1fr\)/);
		expect(declarationsFor('#app__workspace')).toMatch(/grid-row:\s*2/);
	});
});
