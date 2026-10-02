import { FontFlux } from 'font-flux-js';
import {
	getCurrentProjectEditor,
	getGlyphrStudioApp,
	setCurrentProjectEditor,
} from '../app/main.js';
import { updateWindowUnloadEvent } from '../app/app.js';
import { ioFont_importFont } from '../formats_io/otf/font_import.js';
import { sortCharacterRanges } from '../pages/settings_project.js';
import { ProjectEditor } from '../project_editor/project_editor.js';

let importing = false;

/** Explicit user action only. Conversion finishes before a new editor is selected. */
export async function openFontAttachment(attachment) {
	if (importing) throw new Error('A font is already being opened. Please wait.');
	if (attachment.kind !== 'font' || !attachment.file)
		throw new Error('This font is no longer available. Attach it again.');
	importing = true;
	const previous = getCurrentProjectEditor();
	let editor;
	try {
		const buffer = await new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result);
			reader.onerror = () => reject(new Error('The font file could not be read.'));
			reader.readAsArrayBuffer(attachment.file);
		});
		const parsed = FontFlux.open(buffer);
		if (!parsed.glyphs?.length) throw new Error('This font has no readable glyphs.');
		// Existing `testing` mode performs the full conversion in an isolated project.
		// It avoids the global import target and defers navigation until conversion succeeds.
		const project = await ioFont_importFont(parsed, true, attachment.summary.format.toLowerCase());
		project.resetSessionStateForAllItems();
		editor = new ProjectEditor();
		editor.project = project; // Existing setter initializes the new editor's history.
		editor.nav.page = 'Characters';
		editor.selectedGlyphID = project.glyphs['glyph-0x41']
			? 'glyph-0x41'
			: Object.keys(project.glyphs)[0];
		setCurrentProjectEditor(editor);
		sortCharacterRanges();
		updateWindowUnloadEvent();
		editor.navigate();
		return editor;
	} catch {
		if (editor) {
			setCurrentProjectEditor(previous);
			const app = getGlyphrStudioApp();
			app.projectEditors = app.projectEditors.filter((item) => item !== editor);
			previous.navigate();
		}
		throw new Error(
			'The font could not be opened. Your current project has not been replaced. Try opening it from the existing Load tab.'
		);
	} finally {
		importing = false;
	}
}
