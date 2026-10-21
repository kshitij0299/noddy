import { makeElement } from '../common/dom.js';
import { GlyphGrid, openGlyph } from '../controls/glyph-grid/glyph-grid.js';
import { makeNavButton, toggleNavDropdown } from '../project_editor/navigator.js';

/**
 * Page > Workspace
 * The Noddy home for an open project: the specimen card on top, and the
 * Letters & figures grid (<glyph-grid>, issue #14) in the `.workspace__grid`
 * region below it. Both open a glyph through `openGlyph(id)`, the single
 * hook [M3] focus mode replaces.
 *
 * @returns {Element} - page content
 */
export function makePage_Workspace() {
	const content = makeElement({
		tag: 'div',
		id: 'app__page',
		attributes: { 'data-page': 'workspace' },
		innerHTML: `
		<div class="workspace__page">
			<div class="workspace__nav-area">
				${makeNavButton({ level: 'l1', superTitle: 'PAGE', title: 'Workspace' })}
			</div>
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
	specimen.onOpenLetter = (id) => openGlyph(id);
	content.querySelector('.workspace__grid').appendChild(new GlyphGrid());

	const l1 = content.querySelector('#nav-button-l1');
	l1.addEventListener('click', function () {
		toggleNavDropdown(l1);
	});

	return content;
}
