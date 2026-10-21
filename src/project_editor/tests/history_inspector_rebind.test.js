import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { refreshPanel } from '../../panels/panels.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../project_editor.js';

const ID = 'glyph-0x41';

function makeProject() {
	return new GlyphrStudioProject({
		glyphs: {
			[ID]: {
				id: ID,
				advanceWidth: 600,
				shapes: [
					{
						name: 'Outline',
						pathPoints: [
							[0, 0],
							[500, 0],
							[500, 700],
							[0, 700],
						].map(([x, y]) => ({ p: { coord: { x, y } }, h1: { use: false }, h2: { use: false } })),
					},
				],
			},
		},
	});
}

/** Type a value into the Attributes panel's advance-width field, as a user would. */
function typeAdvanceWidth(value) {
	const input = document.querySelector('#editor-page__panel .singleInput-advanceWidth');
	expect(input).toBeTruthy();
	input.value = value;
	input.dispatchEvent(new Event('change'));
}

let editor;

beforeEach(() => {
	document.body.innerHTML = `
		<button id="actionButtonUndo" disabled></button>
		<button id="actionButtonRedo" disabled></button>
		<div id="editor-page__panel"></div>`;
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	editor.project = makeProject();
	editor.project.settings.app.autoSave = false;
	editor.nav.page = 'Characters';
	editor.nav.panel = 'Attributes';
	editor.selectedGlyphID = ID;
	refreshPanel();
});

afterEach(() => {
	getGlyphrStudioApp().projectEditors = [];
	document.body.innerHTML = '';
});

describe('History: inspector rebinds to the restored item (#44)', () => {
	it('an inspector edit right after undo applies to the current glyph', () => {
		typeAdvanceWidth(700);
		typeAdvanceWidth(650);
		expect(editor.project.glyphs[ID].advanceWidth).toBe(650);
		expect(editor.history.queue.length).toBe(2);

		editor.history.restoreState();
		expect(editor.project.glyphs[ID].advanceWidth).toBe(700);

		typeAdvanceWidth(800);
		expect(editor.project.glyphs[ID].advanceWidth).toBe(800);
	});

	it('an inspector edit right after redo applies to the current glyph', () => {
		typeAdvanceWidth(700);
		typeAdvanceWidth(650);
		editor.history.restoreState();
		editor.history.redoState();
		expect(editor.project.glyphs[ID].advanceWidth).toBe(650);

		typeAdvanceWidth(820);
		expect(editor.project.glyphs[ID].advanceWidth).toBe(820);
	});
});
