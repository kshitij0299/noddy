import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getCurrentProjectEditor, getGlyphrStudioApp } from '../../app/main.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { openFontAttachment } from '../font-attachment.js';
import { prepareAttachment } from '../attachments.js';
import { FontFlux } from 'font-flux-js';

afterEach(() => vi.restoreAllMocks());

describe('explicit font attachment import', () => {
	it('preserves an icon font that has no capital A', async () => {
		vi.spyOn(ProjectEditor.prototype, 'navigate').mockImplementation(() => {});
		const font = FontFlux.create({
			family: 'Only Icons',
			unitsPerEm: 1000,
			ascender: 800,
			descender: -200,
		});
		font.addGlyph({
			name: 'icon',
			unicode: 0xe000,
			advanceWidth: 600,
			contours: [
				[
					{ x: 10, y: 10, onCurve: true },
					{ x: 300, y: 600, onCurve: true },
					{ x: 590, y: 10, onCurve: true },
				],
			],
		});
		const binary = font.export();
		const attachment = await prepareAttachment(
			new File([binary], 'icons.ttf', { type: 'font/ttf' })
		);
		const editor = await openFontAttachment(attachment);
		expect(editor.project.glyphs['glyph-0x41']).toBeUndefined();
		expect(editor.project.glyphs['glyph-0xE000']).toBeDefined();
		expect(editor.project.glyphs[editor.selectedGlyphID]).toBeDefined();
		expect(editor.selectedGlyphID).not.toBe('glyph-0x41');
	});
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
