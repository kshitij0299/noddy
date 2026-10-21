import { getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { teardownFocusMode } from './focus_mode.js';
import { GlyphGrid, openGlyph } from '../controls/glyph-grid/glyph-grid.js';
import { handleKeyPress, handleKeyUp } from '../edit_canvas/events_keyboard.js';

/**
 * Page > Workspace
 * The Noddy home for an open project, and the only page the user sees
 * (docs/agentic/UI-RESET.md): the specimen card on top and the Letters &
 * figures grid (<glyph-grid>, issue #14) in the `.workspace__grid` region
 * below it. Both open a glyph in focus mode through `openGlyph(id)`. There
 * is no page menu; the old Glyphr Studio pages are hidden
 * (src/app/legacy_pages.js).
 *
 * @returns {Element} - page content
 */
export function makePage_Workspace() {
	// Focus mode is never open behind the workspace.
	const editor = getCurrentProjectEditor();
	if (editor?.nav?.focus) {
		teardownFocusMode(editor);
		editor.nav.focus = null;
	}
	const content = makeElement({
		tag: 'div',
		id: 'app__page',
		attributes: { 'data-page': 'workspace' },
		innerHTML: `
		<div class="workspace__page">
			<specimen-card id="workspace__specimen"></specimen-card>
			<section class="workspace__grid" aria-label="Letters &amp; figures"></section>
		</div>
	`,
	});

	// Upgrade the specimen now (it came from a template), or its constructor
	// would reset the hook once the page is attached.
	customElements.upgrade(content);
	const specimen = content.querySelector('#workspace__specimen');
	// @ts-expect-error 'onOpenLetter is the SpecimenCard hook'
	specimen.onOpenLetter = (id) => openGlyph(id, undefined, { origin: 'specimen' });
	content.querySelector('.workspace__grid').appendChild(new GlyphGrid());

	// Page-level shortcuts (#49): the edit canvas only attaches these once an
	// editing page has been opened. Same function references, so re-adding is
	// a no-op and they are never doubled.
	document.addEventListener('keydown', handleKeyPress, false);
	document.addEventListener('keyup', handleKeyUp, false);

	return content;
}
