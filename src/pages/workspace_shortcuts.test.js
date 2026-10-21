import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrentProjectEditor, setCurrentProjectEditor } from '../app/main.js';
import { GlyphGrid } from '../controls/glyph-grid/glyph-grid.js';
import { GlyphGridTile } from '../controls/glyph-grid/glyph-tile.js';
import { SpecimenCard } from '../controls/specimen-card/specimen_card.js';
import { eventHandlerData } from '../edit_canvas/events.js';
import { handleKeyPress, handleKeyUp } from '../edit_canvas/events_keyboard.js';
import { GlyphrStudioProject } from '../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../project_editor/project_editor.js';

if (!customElements.get('specimen-card')) customElements.define('specimen-card', SpecimenCard);
if (!customElements.get('glyph-grid-tile')) customElements.define('glyph-grid-tile', GlyphGridTile);
if (!customElements.get('glyph-grid')) customElements.define('glyph-grid', GlyphGrid);

// Regression for #49: Ctrl/Cmd+Z did nothing on the Workspace page.
describe('Workspace keyboard undo / redo', () => {
	let undo;
	let redo;

	function press(key, mods = {}) {
		const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods });
		document.activeElement.dispatchEvent(event);
		document.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, ...mods }));
		return event;
	}

	function openPage(page) {
		const editor = getCurrentProjectEditor();
		editor.nav.page = page;
		document.body.appendChild(editor.nav.makePageContent());
	}

	beforeEach(() => {
		const editor = new ProjectEditor();
		editor.project = new GlyphrStudioProject({});
		setCurrentProjectEditor(editor);
		undo = vi.spyOn(editor.history, 'restoreState').mockImplementation(() => {});
		redo = vi.spyOn(editor.history, 'redoState').mockImplementation(() => {});
		Object.assign(eventHandlerData, { isCtrlDown: false, isShiftDown: false });
	});

	afterEach(() => {
		document.removeEventListener('keydown', handleKeyPress, false);
		document.removeEventListener('keyup', handleKeyUp, false);
		document.body.innerHTML = '';
	});

	it('Ctrl+Z and Cmd+Z undo on the Workspace page', () => {
		openPage('Workspace');
		const event = press('z', { ctrlKey: true });
		expect(undo).toHaveBeenCalledTimes(1);
		expect(event.defaultPrevented).toBe(true);
		press('z', { metaKey: true });
		expect(undo).toHaveBeenCalledTimes(2);
		expect(redo).not.toHaveBeenCalled();
	});

	it('Ctrl/Cmd+Shift+Z and Ctrl+Y redo on the Workspace page', () => {
		openPage('Workspace');
		press('Z', { ctrlKey: true, shiftKey: true });
		press('z', { metaKey: true, shiftKey: true });
		press('y', { ctrlKey: true });
		expect(redo).toHaveBeenCalledTimes(3);
		expect(undo).not.toHaveBeenCalled();
	});

	it('lets native text undo win while typing in an input', () => {
		openPage('Workspace');
		const input = document.createElement('input');
		document.body.appendChild(input);
		input.focus();
		const event = press('z', { ctrlKey: true });
		press('z', { ctrlKey: true, shiftKey: true });
		expect(undo).not.toHaveBeenCalled();
		expect(redo).not.toHaveBeenCalled();
		expect(event.defaultPrevented).toBe(false);
	});

	it('ignores plain z and leaves non-editing pages unchanged', () => {
		openPage('Workspace');
		press('z');
		expect(undo).not.toHaveBeenCalled();
		document.body.innerHTML = '';
		getCurrentProjectEditor().nav.page = 'Overview';
		press('z', { ctrlKey: true });
		expect(undo).not.toHaveBeenCalled();
	});
});
