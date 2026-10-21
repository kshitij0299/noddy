import { makeElement } from '../common/dom.js';
import { makeNavButton, toggleNavDropdown } from '../project_editor/navigator.js';

/**
 * Page > Workspace
 * The Noddy home for an open project: the specimen card on top, and the
 * Letters & figures grid ([M2.4], issue #14) in the `.workspace__grid`
 * region below it. Grid builders append their content to that region:
 *
 *   const grid = page.querySelector('.workspace__grid');
 *   grid.appendChild(makeLettersAndFiguresGrid());
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

	const l1 = content.querySelector('#nav-button-l1');
	l1.addEventListener('click', function () {
		toggleNavDropdown(l1);
	});

	return content;
}
