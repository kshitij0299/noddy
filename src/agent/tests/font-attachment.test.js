import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentProjectEditor, getGlyphrStudioApp } from '../../app/main.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { openFontAttachment } from '../font-attachment.js';
import { prepareAttachment } from '../attachments.js';

afterEach(() => vi.restoreAllMocks());

describe('explicit font attachment import', () => {
	it('converts a real TTF into a new editable project while preserving the current font', async () => {
		const previous = getCurrentProjectEditor();
		const before = JSON.stringify(previous.project.save());
		const previousHistory = previous.history;
		const navigate = vi.spyOn(ProjectEditor.prototype, 'navigate').mockImplementation(() => {});
		const source = readFileSync('test/sample fonts/consola-test.ttf');
		const attachment = await prepareAttachment(
			new File([source], 'consola.ttf', { type: 'font/ttf' })
		);
		const editor = await openFontAttachment(attachment);
		expect(editor).not.toBe(previous);
		expect(getCurrentProjectEditor()).toBe(editor);
		expect(editor.nav.page).toBe('Characters');
		expect(editor.project.glyphs[editor.selectedGlyphID]).toBeDefined();
		expect(editor.project.settings.project.exportFormat).toBe('ttf');
		expect(editor.history.queue).toEqual([]);
		expect(JSON.stringify(previous.project.save())).toBe(before);
		expect(previous.history).toBe(previousHistory);
		expect(getGlyphrStudioApp().projectEditors).toContain(previous);
		expect(navigate).toHaveBeenCalled();
	});

	it('does not select another project when binary conversion fails', async () => {
		const previous = getCurrentProjectEditor();
		const before = getGlyphrStudioApp().projectEditors.length;
		await expect(
			openFontAttachment({
				kind: 'font',
				file: new File(['invalid'], 'bad.ttf'),
				summary: { format: 'TTF' },
			})
		).rejects.toThrow('not been replaced');
		expect(getCurrentProjectEditor()).toBe(previous);
		expect(getGlyphrStudioApp().projectEditors).toHaveLength(before);
	});
});
