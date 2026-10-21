import { FontFlux } from 'font-flux-js';
import fs from 'fs';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
	ensureAgentPanel,
	getAgentPanel,
	resetAgentPanelForTests,
} from '../../agent/ui/agent-panel.js';
import {
	getAgentPanelMode,
	getAgentPanelSlot,
	resetAgentPanelSlotForTests,
} from '../agent_panel_slot.js';
import { ioFont_exportFont } from '../../formats_io/otf/font_export.js';
import {
	isInLatinKernel,
	latinKernelAll,
	latinKernelUncoveredCodePoints,
} from '../../project_editor/charset_latin_kernel.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { getCurrentProjectEditor, getGlyphrStudioApp, setCurrentProjectEditor } from '../main.js';
import {
	FONT_FILE_ACCEPT,
	makePage_OpenProject,
	showLicenceNote,
	startFromFontFile,
	START_CARDS,
} from '../open_project.js';
import {
	DEFAULT_FONT_NAME,
	LICENCE_NOTE,
	cleanFontName,
	createKernelProject,
	importFontAsKernelProject,
	kernelSetLabel,
	openStartProject,
	subsetProjectToLatinKernel,
} from '../start_font.js';

// jsdom has no Web Animations; dialogs.js animates menus away on close.
if (!Element.prototype.animate) Element.prototype.animate = () => ({});

const FIXTURE_DIR = path.resolve(__dirname, '../../formats_io/otf/tests');

function readFixture(name) {
	return new Uint8Array(fs.readFileSync(path.join(FIXTURE_DIR, name))).buffer;
}

async function importFixture(name = 'ObleggExtendedTestRegular.otf') {
	const content = FontFlux.open(readFixture(name));
	return importFontAsKernelProject({ fileType: 'font', content, fileSuffix: 'otf' });
}

/** A fresh import-target editor whose navigate() is a no-op spy. */
function freshImportTarget() {
	const app = getGlyphrStudioApp();
	const editor = new ProjectEditor();
	editor.navigate = vi.fn();
	app.projectEditors = [editor];
	app.editorImportTarget = editor;
	setCurrentProjectEditor(editor);
	return editor;
}

function mountStartScreen() {
	document.body.innerHTML = '<div id="app__wrapper"></div>';
	const page = makePage_OpenProject();
	document.querySelector('#app__wrapper').appendChild(page);
	return page;
}

/** The real agent panel, built once like Navigator.navigate() does. */
function buildPanel(initialMode) {
	return ensureAgentPanel({ getEditor: () => null, probe: async () => true, initialMode });
}

beforeEach(() => {
	resetAgentPanelForTests();
	resetAgentPanelSlotForTests();
	freshImportTarget();
});

afterEach(() => {
	resetAgentPanelForTests();
	resetAgentPanelSlotForTests();
	document.body.innerHTML = '';
});

describe('New font: project state for each start (#23)', () => {
	it('labels the set with its real size', () => {
		expect(kernelSetLabel()).toBe('Latin Kernel · 116');
		expect(latinKernelAll()).toHaveLength(116);
	});

	it('cleans the typed name and falls back to the default', () => {
		expect(cleanFontName('  Rye Round  ')).toBe('Rye Round');
		expect(cleanFontName('   ')).toBe(DEFAULT_FONT_NAME);
		expect(cleanFontName(undefined)).toBe('Bakery Sans');
		expect(cleanFontName('x'.repeat(200))).toHaveLength(80);
	});

	it('createKernelProject names the font and covers the whole Kernel set', () => {
		const project = createKernelProject('Rye Round');
		expect(project.settings.project.name).toBe('Rye Round');
		expect(project.settings.font.family).toBe('Rye Round');
		expect(latinKernelUncoveredCodePoints(project)).toEqual([]);
		// Basic Latin + the 21 single-code-point ranges, nothing else
		expect(project.settings.project.characterRanges).toHaveLength(22);
	});

	it('Start with agent opens the Workspace with the agent panel open', () => {
		mountStartScreen();
		buildPanel('minimized');
		document.querySelector('#input__new-project-name').value = 'Rye Round';
		document.querySelector('[data-start="agent"]').click();

		const editor = getCurrentProjectEditor();
		expect(editor.project.settings.project.name).toBe('Rye Round');
		expect(editor.project.settings.font.family).toBe('Rye Round');
		expect(latinKernelUncoveredCodePoints(editor.project)).toEqual([]);
		expect(editor.nav.page).toBe('Workspace');
		expect(editor.navigate).toHaveBeenCalledTimes(1);
		expect(getAgentPanel().mode).toBe('open');
		expect(getAgentPanelMode()).toBe('open');
	});

	it('Draw myself opens the same project with the agent panel minimized', () => {
		mountStartScreen();
		buildPanel('open');
		document.querySelector('[data-start="draw"]').click();

		const editor = getCurrentProjectEditor();
		expect(editor.project.settings.project.name).toBe('Bakery Sans');
		expect(latinKernelUncoveredCodePoints(editor.project)).toEqual([]);
		expect(editor.nav.page).toBe('Workspace');
		expect(getAgentPanel().mode).toBe('minimized');
		expect(getAgentPanelMode()).toBe('minimized');
	});

	it('focus lands in the composer when the panel opens', () => {
		mountStartScreen();
		buildPanel('minimized');
		// navigate() is a spy here; stand in for the Workspace it would build.
		getCurrentProjectEditor().navigate = vi.fn(() =>
			document.querySelector('#app__wrapper').replaceChildren(getAgentPanelSlot())
		);
		document.querySelector('[data-start="agent"]').click();
		expect(document.activeElement).toBe(getAgentPanel().composer.input);
	});

	it('focus lands on the first letter tile when the panel is minimized', async () => {
		mountStartScreen();
		buildPanel('open');
		const editor = getCurrentProjectEditor();
		// navigate() is a spy here; stand in for the grid it would render.
		editor.navigate = vi.fn(() => {
			const tile = document.createElement('glyph-grid-tile');
			tile.setAttribute('tabindex', '0');
			document.querySelector('#app__wrapper').replaceChildren(tile);
		});
		document.querySelector('[data-start="draw"]').click();
		await new Promise((resolve) => requestAnimationFrame(resolve));
		expect(document.activeElement.tagName).toBe('GLYPH-GRID-TILE');
	});

	it('openStartProject never lands on a hidden page', () => {
		const editor = openStartProject(createKernelProject('X'), { panel: 'minimized' });
		expect(editor.nav.page).toBe('Workspace');
	});
});

describe('New font screen DOM (#23)', () => {
	it('shows the wordmark, the name field, the set chip and three cards in order', () => {
		const page = mountStartScreen();
		expect(page.querySelector('.start__logo svg')).not.toBeNull();
		/** @type {HTMLInputElement} */
		const name = page.querySelector('#input__new-project-name');
		expect(name.value).toBe('Bakery Sans');
		expect(page.querySelector('label[for="input__new-project-name"]')).not.toBeNull();
		expect(page.querySelector('.start__set').textContent).toContain('Latin Kernel · 116');

		const cards = [...page.querySelectorAll('.start-card')];
		expect(cards.map((card) => card.dataset.start)).toEqual(['agent', 'draw', 'file']);
		expect(cards.map((card) => card.querySelector('.start-card__title').textContent)).toEqual([
			'Start with agent',
			'Draw myself',
			'From a font file',
		]);
		// Real buttons: Tab reaches them after the name field, Enter activates.
		cards.forEach((card) => expect(card.tagName).toBe('BUTTON'));
		expect(
			name.compareDocumentPosition(cards[0]) & Node.DOCUMENT_POSITION_FOLLOWING
		).toBeTruthy();
		expect(cards[0].querySelector('.start-card__mark')).not.toBeNull();
		expect(cards[1].querySelector('.material-symbols-rounded').textContent).toBe('ink_pen');
		expect(cards[2].querySelector('.material-symbols-rounded').textContent).toBe('upload_file');
		expect(START_CARDS.every((card) => !card.line.includes('.'))).toBe(true);
	});

	it('keeps Open a file, Restore and Examples reachable below the cards', () => {
		const page = mountStartScreen();
		const more = [...page.querySelectorAll('.start__secondary button')];
		expect(more.map((b) => b.textContent)).toEqual(['Open a file', 'Restore', 'Examples']);

		const examples = more[2];
		examples.click();
		expect(examples.getAttribute('aria-expanded')).toBe('true');
		const region = page.querySelector('#open-project__right-area');
		expect(region.hidden).toBe(false);
		expect(region.textContent).toContain('Oblegg');

		examples.click();
		expect(region.hidden).toBe(true);
	});

	it('the second-project dialog hides Restore, as before', () => {
		document.body.innerHTML = '';
		const page = makePage_OpenProject(true);
		document.body.appendChild(page);
		const labels = [...page.querySelectorAll('.start__secondary button')].map((b) => b.textContent);
		expect(labels).toEqual(['Open a file', 'Examples']);
	});
});

describe('From a font file (#24)', () => {
	it('drops every glyph outside the Kernel and sets the Kernel ranges', async () => {
		const result = await importFixture();
		const { project, coverage, kept, dropped } = result;
		const ids = Object.keys(project.glyphs).filter((id) => id !== 'glyph-0x0');
		expect(ids.length).toBe(kept);
		ids.forEach((id) => expect(isInLatinKernel(id)).toBe(true));
		expect(dropped).toBeGreaterThan(0);
		expect(Object.keys(project.ligatures)).toEqual([]);
		expect(latinKernelUncoveredCodePoints(project)).toEqual([]);
		expect(project.settings.project.characterRanges).toHaveLength(22);
		expect(coverage.total).toBe(116);
		expect(coverage.drawn).toBeGreaterThan(0);
		expect(coverage.drawn).toBeLessThanOrEqual(kept);
		expect(coverage.drawn + coverage.missing.length).toBe(116);
	});

	it('keeps only Kernel members in kern groups', () => {
		const project = createKernelProject('K');
		project.kerning = {
			'kern-1': { leftGroup: ['0x41', '0x416'], rightGroup: ['0x56'], value: -40 },
			'kern-2': { leftGroup: ['0x416'], rightGroup: ['0x41'], value: -10 },
		};
		subsetProjectToLatinKernel(project);
		expect(Object.keys(project.kerning)).toEqual(['kern-1']);
		expect(project.kerning['kern-1'].leftGroup).toEqual(['0x41']);
	});

	it('rejects a file that is not a font', async () => {
		await expect(
			importFontAsKernelProject({ fileType: 'project', content: '{}', fileSuffix: 'gs2' })
		).rejects.toThrow(/OTF, TTF, WOFF or SVG/);
	});

	it('shows the one-line licence note, and Cancel leaves no project behind', async () => {
		mountStartScreen();
		const before = getCurrentProjectEditor();
		const beforeProject = before.project;
		const result = await importFixture();

		const note = showLicenceNote(result);
		expect(note.querySelector('.start__note-line').textContent).toBe(LICENCE_NOTE);
		expect(note.querySelector('.start__note-title').textContent).toMatch(/of 116 characters$/);
		expect(document.querySelector('.start__cards')).toBeNull();
		expect(document.activeElement.dataset.action).toBe('continue');

		note.querySelector('[data-action="cancel"]').click();
		expect(document.querySelector('.start__note')).toBeNull();
		expect(document.querySelectorAll('.start-card')).toHaveLength(3);
		expect(getCurrentProjectEditor()).toBe(before);
		expect(before.project).toBe(beforeProject);
		expect(before.navigate).not.toHaveBeenCalled();
	});

	it('Esc on the note cancels too', async () => {
		mountStartScreen();
		const note = showLicenceNote(await importFixture());
		note.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(document.querySelector('.start__note')).toBeNull();
		expect(document.activeElement.dataset.start).toBe('file');
	});

	it('Continue opens the subsetted project; imported glyphs are Kept, not Drafts', async () => {
		mountStartScreen();
		buildPanel('minimized');
		const result = await importFixture();
		showLicenceNote(result).querySelector('[data-action="continue"]').click();

		const editor = getCurrentProjectEditor();
		expect(editor.project).toBe(result.project);
		expect(editor.nav.page).toBe('Workspace');
		expect(editor.navigate).toHaveBeenCalledTimes(1);
		expect(getAgentPanel().mode).toBe('open');
		const drawnId = Object.keys(editor.project.glyphs).find(
			(id) => id !== 'glyph-0x0' && editor.project.glyphs[id].shapes?.length
		);
		expect(drawnId).toBeTruthy();
		expect(editor.glyphStatus.getStatus(drawnId)).toBe('kept');
		expect(editor.glyphStatus.listByStatus('draft')).toEqual([]);
	});

	it('the whole flow from a picked File reaches the licence note', async () => {
		mountStartScreen();
		const file = new File([readFixture('ObleggExtendedTestRegular.otf')], 'Oblegg.otf');
		await startFromFontFile(file);
		await vi.waitFor(() => expect(document.querySelector('.start__note')).not.toBeNull());
		expect(document.querySelector('.start__note-line').textContent).toBe(LICENCE_NOTE);
		expect(getCurrentProjectEditor().navigate).not.toHaveBeenCalled();
	});

	it('the picker offers only types the importers read (no .woff2)', () => {
		expect(FONT_FILE_ACCEPT.split(',')).toEqual(['.otf', '.ttf', '.woff', '.svg']);
		expect(START_CARDS.find((card) => card.id === 'file').line).toBe('OTF, TTF or SVG');
	});

	it('an invalid file shows an error, brings the cards back and creates no project', async () => {
		mountStartScreen();
		const before = getCurrentProjectEditor();
		const beforeProject = before.project;
		await startFromFontFile(new File(['{"not": "a font"}'], 'notes.json'));

		expect(document.querySelector('#error')).not.toBeNull();
		expect(document.querySelector('.start__note')).toBeNull();
		expect(document.querySelectorAll('.start-card')).toHaveLength(3);
		expect(document.activeElement.dataset.start).toBe('file');
		expect(getCurrentProjectEditor()).toBe(before);
		expect(before.project).toBe(beforeProject);
		expect(before.navigate).not.toHaveBeenCalled();
	});

	it('regression: a good pick after a bad one reaches the note (validator result leak)', async () => {
		mountStartScreen();
		await startFromFontFile(new File(['nope'], 'broken.otf'));
		expect(document.querySelector('#error')).not.toBeNull();
		expect(document.querySelector('.start__note')).toBeNull();

		const good = new File([readFixture('ObleggExtendedTestRegular.otf')], 'Oblegg.otf');
		await startFromFontFile(good);
		expect(document.querySelector('.start__note-line').textContent).toBe(LICENCE_NOTE);
		// The stale error from the first pick is dismissed.
		await vi.waitFor(() => expect(document.querySelector('#error')).toBeNull());

		// And the reverse: a bad pick after a good one does not reuse the old font.
		document.querySelector('[data-action="cancel"]').click();
		await startFromFontFile(new File(['nope'], 'broken.otf'));
		expect(document.querySelector('.start__note')).toBeNull();
		expect(document.querySelector('#error')).not.toBeNull();
		expect(getCurrentProjectEditor().navigate).not.toHaveBeenCalled();
	});

	it('while the note is up the name shows the imported family, read-only; Esc anywhere cancels', async () => {
		mountStartScreen();
		/** @type {HTMLInputElement} */
		const name = document.querySelector('#input__new-project-name');
		name.value = 'Typed';
		showLicenceNote(await importFixture());
		expect(name.value).toBe('Oblegg');
		expect(name.disabled).toBe(true);

		document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
		expect(document.querySelector('.start__note')).toBeNull();
		expect(name.value).toBe('Typed');
		expect(name.disabled).toBe(false);
	});

	it('the subsetted project exports and re-imports with only Kernel glyphs', async () => {
		const { project, coverage } = await importFixture();
		const editor = new ProjectEditor({ project });
		setCurrentProjectEditor(editor);
		const buffer = await ioFont_exportFont('otf', true);
		const font = FontFlux.open(buffer);
		const exported = new Set();
		font.glyphs.forEach((glyph) => {
			if (typeof glyph.unicode === 'number') exported.add(glyph.unicode);
			(glyph.unicodes || []).forEach((u) => exported.add(u));
		});
		exported.forEach((cp) => expect(isInLatinKernel(cp)).toBe(true));
		const drawn = latinKernelAll().filter((e) => !coverage.missing.includes(e.codePoint));
		drawn.forEach((entry) => expect(exported.has(entry.codePoint)).toBe(true));

		const reimported = await importFontAsKernelProject({
			fileType: 'font',
			content: font,
			fileSuffix: 'otf',
		});
		expect(reimported.coverage.drawn).toBe(coverage.drawn);
	});
});
