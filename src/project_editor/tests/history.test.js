import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../project_editor.js';

const ID = 'glyph-0x41';

function makeProject() {
	return new GlyphrStudioProject({
		settings: { app: { autoSave: false } },
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

let editor;

beforeEach(() => {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	// Load the project the same way the app does (project setter -> initializeHistory)
	editor.project = makeProject();
	editor.project.settings.app.autoSave = false;
	editor.nav.page = 'Characters';
	editor.selectedGlyphID = ID;
});

afterEach(() => {
	getGlyphrStudioApp().projectEditors = [];
});

describe('History: undo of the only entry after loading (#41)', () => {
	it('initialProject is a detached snapshot, not the live project', () => {
		expect(editor.history.initialProject).not.toBe(editor.project);
		expect(editor.history.initialProject.glyphs[ID].save()).toEqual(editor.project.glyphs[ID].save());
	});

	it('undoing a single edit restores the as-loaded state', () => {
		const point = editor.project.glyphs[ID].shapes[0].pathPoints[0];
		point.p.x += 25;
		editor.history.addState('Moved point');
		expect(editor.selectedItem.shapes[0].pathPoints[0].p.x).toBe(25);

		editor.history.restoreState();

		expect(editor.history.queue.length).toBe(0);
		expect(editor.selectedItem.shapes[0].pathPoints[0].p.x).toBe(0);
		expect(editor.project.glyphs[ID].shapes[0].pathPoints[0].p.x).toBe(0);
	});
});

describe('History: undo past an item auto-created after load (#41 QA)', () => {
	/** Open an item the project doesn't have, edit it once, then press undo three times. */
	function editCreatedGlyphAndUndo(glyphID) {
		editor.selectedGlyphID = glyphID;
		expect(editor.history.initialProject.glyphs[glyphID]).toBeUndefined();
		const created = editor.selectedItem; // auto-creates + whole-project post-state
		const createdWidth = created.advanceWidth;
		editor.selectedItem.advanceWidth = createdWidth + 111;
		editor.history.addState('Updated advanceWidth');

		expect(() => editor.history.restoreState()).not.toThrow();
		expect(() => editor.history.restoreState()).not.toThrow();
		expect(editor.history.queue.length).toBe(0);
		// Restored to the state it was created in, not deleted (selecting a
		// missing glyph would immediately re-create it and add history).
		expect(editor.project.glyphs[glyphID]).toBeDefined();
		expect(editor.project.glyphs[glyphID].advanceWidth).toBe(createdWidth);
		expect(() => editor.history.restoreState()).not.toThrow(); // "No more undo"
	}

	it('glyph missing from a loaded project (Oblegg -> U+00C0)', () => {
		editCreatedGlyphAndUndo('glyph-0xC0');
		expect(editor.project.glyphs[ID].shapes[0].pathPoints[0].p.x).toBe(0);
	});

	it('new font from scratch (A does not exist yet)', () => {
		editor.project = new GlyphrStudioProject({});
		editor.project.settings.app.autoSave = false;
		editor.nav.page = 'Characters';
		editCreatedGlyphAndUndo('glyph-0x41');
	});
});
