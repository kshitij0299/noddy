import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentProjectEditor, setCurrentProjectEditor } from '../app/main.js';
import { GlyphGrid } from '../controls/glyph-grid/glyph-grid.js';
import { GlyphGridTile } from '../controls/glyph-grid/glyph-tile.js';
import { SpecimenCard } from '../controls/specimen-card/specimen_card.js';
import { GlyphrStudioProject } from '../project_data/glyphr_studio_project.js';
import { Navigator } from '../project_editor/navigator.js';
import { ProjectEditor } from '../project_editor/project_editor.js';
import { makePage_Workspace } from './workspace.js';

if (!customElements.get('specimen-card')) customElements.define('specimen-card', SpecimenCard);
if (!customElements.get('glyph-grid-tile')) customElements.define('glyph-grid-tile', GlyphGridTile);
if (!customElements.get('glyph-grid')) customElements.define('glyph-grid', GlyphGrid);

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

	it('builds the specimen card above the Letters & figures grid', () => {
		const navigator = new Navigator();
		const pageContent = navigator.makePageContent();
		document.body.appendChild(pageContent);
		expect(pageContent.querySelector('.nav-button__title').innerHTML).toBe('Workspace');

		const card = pageContent.querySelector('specimen-card#workspace__specimen');
		expect(card).not.toBeNull();
		expect(card.querySelectorAll('.specimen__ghost')).toHaveLength(7);

		const grid = pageContent.querySelector('.workspace__grid');
		expect(grid).not.toBeNull();
		expect(card.compareDocumentPosition(grid) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

		const glyphGrid = grid.querySelector('glyph-grid');
		expect(glyphGrid).not.toBeNull();
		expect(glyphGrid.querySelector('h3').textContent).toBe('Letters & figures');
		expect(glyphGrid.querySelectorAll('glyph-grid-tile')).toHaveLength(62);
		expect(glyphGrid.querySelector('glyph-grid-tile[tabindex="0"]')).not.toBeNull();
	});

	it('the specimen opens letters through the grid\'s openGlyph hook', () => {
		const navigator = new Navigator();
		const pageContent = navigator.makePageContent();
		document.body.appendChild(pageContent);
		const card = pageContent.querySelector('specimen-card#workspace__specimen');
		const editor = getCurrentProjectEditor();
		const navigate = vi.spyOn(editor, 'navigate').mockImplementation(() => {});
		card.onOpenLetter('glyph-0x61');
		expect(editor.selectedGlyphID).toBe('glyph-0x61');
		expect(editor.nav.page).toBe('Characters');
		expect(navigate).toHaveBeenCalledTimes(1);
		navigate.mockRestore();
	});
});
