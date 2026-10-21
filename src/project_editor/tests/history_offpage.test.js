import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../project_editor.js';

// Regression for #52: undo / redo off the editing pages (e.g. Workspace)
// dropped the history entry without restoring the glyph.
const A = 'glyph-0x41';
const B = 'glyph-0x42';

function makeProject() {
	return new GlyphrStudioProject({
		settings: { app: { autoSave: false } },
		glyphs: {
			[A]: { id: A, advanceWidth: 600 },
			[B]: { id: B, advanceWidth: 700 },
		},
	});
}

let editor;
const width = (id) => editor.project.glyphs[id].advanceWidth;

function edit(id, advanceWidth) {
	editor.nav.page = 'Characters';
	editor.selectedGlyphID = id;
	editor.selectedItem.advanceWidth = advanceWidth;
	editor.history.addState(`Width of ${id}`);
}

function goToWorkspace() {
	editor.nav.page = 'Workspace';
	editor.selectedGlyphID = false;
}

beforeEach(() => {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	editor.project = makeProject();
	editor.project.settings.app.autoSave = false;
});

afterEach(() => {
	getGlyphrStudioApp().projectEditors = [];
});

describe('History off the editing pages (#52)', () => {
	it('undo and redo restore the recorded glyph from the Workspace page', () => {
		edit(A, 650);
		edit(A, 700);
		goToWorkspace();

		editor.history.restoreState();
		expect(width(A)).toBe(650);
		expect(editor.nav.page).toBe('Workspace');

		editor.history.restoreState();
		expect(width(A)).toBe(600);
		expect(editor.history.queue).toHaveLength(0);

		editor.history.redoState();
		expect(width(A)).toBe(650);
		editor.history.redoState();
		expect(width(A)).toBe(700);
		expect(editor.nav.page).toBe('Workspace');
	});

	it('undoes the latest edit even when the entry before it is another glyph', () => {
		edit(A, 650);
		edit(B, 750);
		edit(A, 680);
		goToWorkspace();

		editor.history.restoreState();
		expect(width(A)).toBe(650);
		expect(width(B)).toBe(750);

		editor.history.restoreState();
		expect(width(B)).toBe(700);
		expect(width(A)).toBe(650);

		editor.history.restoreState();
		expect(width(A)).toBe(600);
		expect(editor.nav.page).toBe('Workspace');

		editor.history.redoState();
		editor.history.redoState();
		editor.history.redoState();
		expect(width(A)).toBe(680);
		expect(width(B)).toBe(750);
	});

	it('on an editing page a different-item entry still navigates without undoing', () => {
		edit(A, 650);
		edit(B, 750);
		editor.navigate = () => {};
		editor.history.restoreState();
		expect(width(B)).toBe(750);
		expect(editor.selectedGlyphID).toBe(A);
	});
});
