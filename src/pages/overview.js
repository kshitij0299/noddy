import { emailLink } from '../app/app.js';
import { getCurrentProject, getCurrentProjectEditor } from '../app/main.js';
import { makeElement } from '../common/dom.js';
import { countItems } from '../common/functions.js';
import { showModalDialog } from '../controls/dialogs/dialogs.js';
import { makeAllItemTypeChooserContent } from '../panels/item_chooser.js';
import { makeNavButton, toggleNavDropdown } from '../project_editor/navigator.js';
import { makeContributeContent } from './about.js';

/**
 * Page > Overview
 * The first page you land on, with project and glyph information.
 * @returns {Element} - page content
 */
export function makePage_Overview() {
	const content = makeElement({
		tag: 'div',
		id: 'app__page',
		attributes: { 'data-page': 'overview' },
		innerHTML: `
		<div class="content__page overview__page">
			<div class="content-page__left-area">
				<div class="content-page__nav-area">
					${makeNavButton({ level: 'l1', superTitle: 'PAGE', title: 'Overview' })}
				</div>
				<div id="content-page__panel"></div>
			</div>
			<div class="content-page__right-area"></div>
		</div>
	`,
	});

	// log(content);

	let itemsContent = makeAllItemTypeChooserContent((itemID) => {
		// log(`Overview page - Character Chooser tile click handler`, 'start');
		// log(`itemID: ${itemID}`);

		const editor = getCurrentProjectEditor();
		editor.selectedItemID = itemID;
		// log(`editor.selectedItemID: ${editor.selectedItemID}`);

		if (itemID.startsWith('glyph-')) editor.nav.page = 'Characters';
		else if (itemID.startsWith('liga-')) editor.nav.page = 'Ligatures';
		else if (itemID.startsWith('comp-')) editor.nav.page = 'Components';
		else if (itemID.startsWith('kern-')) editor.nav.page = 'Kerning';
		// log(`editor.nav.page: ${editor.nav.page}`);
		editor.navigate();

		editor.history.addState(`Navigated to ${editor.project.getItemName(itemID, true)}`);
		// log(`Overview page - Character Chooser tile click handler`, 'end');
	});

	const project = getCurrentProject();
	const rightArea = content.querySelector('.content-page__right-area');
	let previewText = project.settings.app.previewText || 'Aa Bb Cc Xx Yy Zz';

	rightArea.appendChild(
		makeElement({
			tag: 'display-canvas',
			attributes: { text: previewText, 'font-size': '64', 'show-placeholder-message': 'true' },
			title: 'You can customize the the project preview text from the Settings > App page.',
		})
	);

	rightArea.appendChild(makeElement({ tag: 'hr', style: 'margin: 10px 0px 20px 0px;' }));
	rightArea.appendChild(itemsContent);
	// Page Selector
	let l1 = content.querySelector('#nav-button-l1');
	l1.addEventListener('click', function () {
		toggleNavDropdown(l1);
	});

	const panelArea = content.querySelector('#content-page__panel');
	const welcomeCard = makeElement({
		className: 'panel__card full-width more-padding',
	});
	welcomeCard.appendChild(
		makeElement({
			innerHTML: `
		<h2>Welcome to Noddy!</h2>
		<p>
			Noddy is a friendly font editor — an independent fork of Glyphr Studio.
			You can stay up to date on the latest news over at the
			<a href="https://www.glyphrstudio.com/blog" target="_blank">Glyphr Studio Blog</a>.
			We also have a
			<a href="https://www.glyphrstudio.com/help/tutorial" target="_blank">tutorial</a>
			over on the Help and Docs site that will help you walk through some of the key steps
			to designing your first font.
			<br><br>
			As always, if you find any bugs, or have an suggestions about functionality, please email us!
			${emailLink()}
		</p>
	`,
		})
	);

	const projectSummaryCard = makeElement({
		className: 'panel__card more-padding overview__info-card',
		innerHTML: `
			<h2>Project info</h2>
			<div class="overview__info-grid">
				<span class="overview__info-label">Project name</span><span>${project.settings.project.name}</span>
				<span class="overview__info-label">Font family</span><span>${project.settings.font.family}</span>
				<span class="overview__info-label">Style</span><span>${project.settings.font.style}</span>
				<span class="overview__info-label">Glyph count</span><span>${
					countItems(project.glyphs) + countItems(project.ligatures)
				}</span>
				<span class="overview__info-label">UPM</span><span>${project.settings.font.upm}</span>
				<span class="overview__info-label">Ascent</span><span>${project.settings.font.ascent}</span>
				<span class="overview__info-label">Descent</span><span>${project.settings.font.descent}</span>
			</div>
		`,
	});
	projectSummaryCard.appendChild(
		makeElement({
			tag: 'fancy-button',
			innerHTML: 'Edit project and font info',
			attributes: { secondary: '' },
			onClick: () => {
				const editor = getCurrentProjectEditor();
				editor.nav.page = 'Settings';
				editor.navigate();
			},
		})
	);

	const contributeCard = makeElement({
		className: 'panel__card full-width more-padding',
		innerHTML: `
			Noddy is open source and community supported — an independent fork of Glyphr Studio 2
			(GPL-3.0-or-later) by Matt LaGrandeur and contributors.
			<br>
			`,
	});
	contributeCard.appendChild(
		makeElement({
			tag: 'fancy-button',
			innerHTML: 'Learn how you can help Noddy!',
			attributes: { secondary: '' },
			onClick: () => {
				showModalDialog(makeContributeContent(), 500);
			},
		})
	);

	panelArea.appendChild(projectSummaryCard);
	panelArea.appendChild(welcomeCard);
	panelArea.appendChild(contributeCard);

	return content;
}
