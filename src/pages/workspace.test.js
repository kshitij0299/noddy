import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setCurrentProjectEditor } from '../app/main.js';
import { SpecimenCard } from '../controls/specimen-card/specimen_card.js';
import { GlyphrStudioProject } from '../project_data/glyphr_studio_project.js';
import { Navigator } from '../project_editor/navigator.js';
import { ProjectEditor } from '../project_editor/project_editor.js';
import { makePage_Workspace } from './workspace.js';

if (!customElements.get('specimen-card')) customElements.define('specimen-card', SpecimenCard);

describe('Workspace page', () => {
	beforeEach(() => {
		const editor = new ProjectEditor();
		editor.project = new GlyphrStudioProject({});
		setCurrentProjectEditor(editor);
	});

	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('is registered in the Navigator and is the default page', () => {
		const navigator = new Navigator();
		expect(navigator.page).toBe('Workspace');
		expect(navigator.tableOfContents.Workspace.pageMaker).toBe(makePage_Workspace);
		// The other pages stay reachable from the page menu
		expect(navigator.tableOfContents.Overview.pageMaker).toBeTypeOf('function');
		expect(navigator.tableOfContents.Characters.pageMaker).toBeTypeOf('function');
	});

	it('builds the specimen card above an empty grid region', () => {
		const navigator = new Navigator();
		const pageContent = navigator.makePageContent();
		document.body.appendChild(pageContent);
		expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('Workspace');

		const card = pageContent.querySelector('specimen-card#workspace__specimen');
		expect(card).not.toBeNull();
		expect(card.querySelectorAll('.specimen__ghost')).toHaveLength(7);

		const grid = pageContent.querySelector('.workspace__grid');
		expect(grid).not.toBeNull();
		expect(grid.children).toHaveLength(0);
		expect(card.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
	});
});
