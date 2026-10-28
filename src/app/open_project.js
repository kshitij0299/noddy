import { addAsChildren, makeElement } from '../common/dom.js';
import noddyLogoBig from '../common/graphics/noddy-logo-big.svg?raw';
import {
	closeAllErrors,
	closeEveryTypeOfDialog,
	showError,
	showToast,
} from '../controls/dialogs/dialogs.js';
import { makeProgressIndicator } from '../controls/progress-indicator/progress_indicator.js';
import { cancelDefaultEventActions } from '../edit_canvas/events.js';
import { ioFont_importFont } from '../formats_io/otf/font_import.js';
import { ioSVG_importSVGfont } from '../formats_io/svg_font/svg_font_import.js';
import { validateSingleFileInput } from '../formats_io/validate_file_input.js';
import { GlyphrStudioProject } from '../project_data/glyphr_studio_project.js';
import { importGlyphrProjectFromText } from '../project_editor/import_project.js';
import obleggExampleProject from '../samples/oblegg.gs2?raw';
import simpleExampleProject from '../samples/simpleExampleProject.json';
import { updateWindowUnloadEvent } from './app.js';
import {
	addProjectEditorAndSetAsImportTarget,
	getCurrentProjectEditor,
	getGlyphrStudioApp,
	getProjectEditorImportTarget,
	setCurrentProjectEditor,
} from './main.js';
import {
	DEFAULT_FONT_NAME,
	LICENCE_NOTE,
	cleanFontName,
	createKernelProject,
	importFontAsKernelProject,
	kernelSetLabel,
	openStartProject,
} from './start_font.js';
import { getTheme, toggleTheme } from './top_bar.js';

/**
 * Page > Open Project: the New font start screen (M5, flow-01).
 *
 * Centred wordmark, the font name, the set chip and three start cards:
 * Start with agent, Draw myself and From a font file. Opening an existing
 * project stays one row below (Open a file, Restore, Examples) and by
 * dropping a file anywhere on the page.
 */
let isSecondProject;

/** Font files the "From a font file" card accepts. */
// Only what the validator and importers read: no .woff2 (no importer).
export const FONT_FILE_ACCEPT = '.otf,.ttf,.woff,.svg';

/** The three starts, in order. `icon` is a Material Symbol; null uses the Noddy mark. */
export const START_CARDS = Object.freeze([
	// The file start comes first and is the recommended one (owner, 2026-10-28).
	{ id: 'file', title: 'From a font file', line: 'OTF, TTF or SVG', icon: 'upload_file', recommended: true },
	{ id: 'agent', title: 'Start with agent', line: 'Describe it, approve it', icon: null },
	{ id: 'draw', title: 'Draw myself', line: 'Pen and points', icon: 'ink_pen' },
]);

/**
 * Material Symbols Rounded icon (outlined).
 * @param {String} name
 * @returns {Element}
 */
function icon(name) {
	return makeElement({
		tag: 'span',
		className: 'material-symbols-rounded',
		content: name,
		attributes: { 'aria-hidden': 'true' },
	});
}

/**
 * Page Maker for the Open Project page
 * @param {Boolean} secondProjectFlag - true if it's not the currently selected project
 * @returns {Element}
 */
export function makePage_OpenProject(secondProjectFlag = false) {
	isSecondProject = secondProjectFlag;

	const content = makeElement({ tag: 'div', id: 'app__page' });
	const page = makeElement({ tag: 'div', id: 'open-project__page', className: 'start' });
	const main = makeElement({ tag: 'main', className: 'start__main' });

	const logo = makeElement({
		id: 'open-project__logo',
		className: 'start__logo',
		innerHTML: noddyLogoBig,
		attributes: { role: 'img', 'aria-label': 'Noddy' },
	});
	const heading = makeElement({ tag: 'h1', className: 'start__visually-hidden', content: 'New font' });

	const nameLabel = makeElement({
		tag: 'label',
		className: 'start__visually-hidden',
		content: 'Font name',
		attributes: { for: 'input__new-project-name' },
	});
	const nameInput = makeElement({
		tag: 'input',
		id: 'input__new-project-name',
		className: 'start__name',
		attributes: {
			type: 'text',
			value: DEFAULT_FONT_NAME,
			maxlength: '80',
			autocomplete: 'off',
			spellcheck: 'false',
		},
	});

	const setChip = makeElement({ className: 'start__set' });
	setChip.append(icon('text_fields'), makeElement({ tag: 'span', content: kernelSetLabel() }));

	const stage = makeElement({ className: 'start__stage' });
	stage.appendChild(makeStartCards());

	const more = makeElement({
		id: 'open-project__right-area',
		className: 'start__more',
		attributes: { hidden: '' },
	});

	addAsChildren(main, [
		logo,
		heading,
		nameLabel,
		nameInput,
		setChip,
		stage,
		makeSecondaryRow(more),
		more,
	]);

	const theme = makeElement({
		tag: 'button',
		className: 'start__theme',
		title: 'Theme',
		attributes: { type: 'button', 'aria-label': 'Theme' },
		onClick: () => {
			toggleTheme();
			syncThemeButton(theme);
		},
	});
	theme.appendChild(icon('dark_mode'));
	syncThemeButton(theme);

	const dropNote = makeElement({ id: 'open-project__drop-note' });
	addAsChildren(page, [main, theme, dropNote]);
	content.appendChild(page);

	// Drag and drop: any project or font file, through the existing loader.
	page.addEventListener('dragenter', handleDragEnter);
	page.addEventListener('dragover', cancelDefaultEventActions);
	dropNote.addEventListener('drop', (/** @type {DragEvent} */ event) => {
		cancelDefaultEventActions(event);
		handleOpenProjectPageFileInput(event?.dataTransfer?.items || []);
	});
	dropNote.addEventListener('dragleave', handleDragLeave);

	if (!isSecondProject) {
		requestAnimationFrame(() => {
			if (!nameInput.isConnected) return;
			nameInput.focus();
			const end = nameInput.value.length;
			nameInput.setSelectionRange?.(end, end);
		});
	}

	return content;
}

/**
 * @param {Element} button - the theme icon button
 */
function syncThemeButton(button) {
	const isDark = getTheme() === 'dark';
	button.setAttribute('aria-pressed', String(isDark));
	const glyph = button.querySelector('.material-symbols-rounded');
	if (glyph) glyph.textContent = isDark ? 'light_mode' : 'dark_mode';
}

/**
 * The three equal start cards.
 * @returns {Element}
 */
export function makeStartCards() {
	const row = makeElement({
		className: 'start__cards',
		attributes: { role: 'group', 'aria-label': 'Start' },
	});
	START_CARDS.forEach((card) => {
		const button = makeElement({
			tag: 'button',
			className: card.recommended ? 'start-card start-card--recommended' : 'start-card',
			attributes: { type: 'button', 'data-start': card.id },
			onClick: () => handleStart(card.id),
		});
		const badge = makeElement({ tag: 'span', className: 'start-card__icon' });
		if (card.icon) badge.appendChild(icon(card.icon));
		else badge.appendChild(makeElement({ tag: 'span', className: 'start-card__mark' }));
		addAsChildren(button, [
			badge,
			makeElement({ tag: 'span', className: 'start-card__title', content: card.title }),
			makeElement({ tag: 'span', className: 'start-card__line', content: card.line }),
		]);
		if (card.recommended) {
			button.appendChild(makeElement({ tag: 'span', className: 'start-card__tag', content: 'Recommended' }));
		}
		row.appendChild(button);
	});
	return row;
}

/**
 * The font name typed on the start screen.
 * @returns {String}
 */
function typedName() {
	/** @type {HTMLInputElement} */
	const input = document.querySelector('#input__new-project-name');
	return cleanFontName(input?.value);
}

/**
 * Runs one of the three starts.
 * @param {'agent' | 'draw' | 'file'} id
 */
export function handleStart(id) {
	if (id === 'file') {
		pickFontFile();
		return;
	}
	const project = createKernelProject(typedName());
	openStartProject(project, {
		panel: id === 'agent' ? 'open' : 'minimized',
		secondProject: !!isSecondProject,
	});
}

// --------------------------------------------------------------
// From a font file (#24)
// --------------------------------------------------------------

/**
 * Opens the OS file picker for a font file. Cancelling the picker changes nothing.
 */
function pickFontFile() {
	/** @type {any} */
	const input = makeElement({
		tag: 'input',
		attributes: { type: 'file', accept: FONT_FILE_ACCEPT },
	});
	input.addEventListener('change', () => {
		const file = input.files?.[0];
		if (file) startFromFontFile(file);
	});
	input.click();
}

/**
 * Validates and imports a font file, cuts it down to the set and shows the
 * licence note. The project is committed only on Continue.
 * @param {File | Object} file - a File or FileSystemFileHandle
 * @returns {Promise<void>}
 */
export function startFromFontFile(file) {
	// A new pick replaces any error left over from the last one.
	closeAllErrors();
	const stage = document.querySelector('.start__stage');
	if (stage) stage.replaceChildren(makeProgressIndicator());
	// Where the File System Access API exists, the validator expects a file
	// handle; a plain File from the picker input gets a handle-shaped wrapper.
	const input =
		// @ts-expect-error 'property does exist'
		window.showOpenFilePicker && window.showSaveFilePicker && !file?.getFile
			? { name: file.name, getFile: async () => file }
			: file;
	return new Promise((resolve) => {
		const fail = (error) => {
			showError(error?.message || 'The font could not be imported.');
			showStartCards('file');
			resolve();
		};
		validateSingleFileInput(input, async (validation) => {
			// The validator reuses one result object and never clears it, so a
			// stale error or file would leak into the next pick. Take a copy
			// and clear the two fields this flow reads.
			const result = { ...validation };
			if (validation) {
				validation.errorMessage = '';
				validation.content = false;
			}
			try {
				if (result.errorMessage || !result.content) {
					throw new Error(result.errorMessage || 'The file could not be read.');
				}
				showLicenceNote(await importFontAsKernelProject(result));
				resolve();
			} catch (error) {
				fail(error);
			}
		}).catch(fail);
	});
}

/**
 * Puts the start cards back in the stage (after Cancel or an error).
 * @param {String=} focusId - card to focus
 */
export function showStartCards(focusId) {
	const stage = document.querySelector('.start__stage');
	if (!stage) return;
	stage.replaceChildren(makeStartCards());
	if (focusId) {
		/** @type {HTMLElement} */
		const card = stage.querySelector(`[data-start="${focusId}"]`);
		card?.focus();
	}
}

/**
 * The one-line licence note with Continue / Cancel, in place of the cards.
 * @param {{project: GlyphrStudioProject, coverage: {drawn: Number, total: Number}}} result
 * @returns {Element | null}
 */
export function showLicenceNote(result) {
	const stage = document.querySelector('.start__stage');
	if (!stage) return null;
	const { project, coverage } = result;
	const family = project.settings.font.family || project.settings.project.name;

	const note = makeElement({
		className: 'start__note',
		attributes: { role: 'group', 'aria-labelledby': 'start__note-title' },
	});
	const title = makeElement({
		tag: 'p',
		id: 'start__note-title',
		className: 'start__note-title',
		content: `${family} · ${coverage.drawn} of ${coverage.total} characters`,
	});
	const line = makeElement({ tag: 'p', className: 'start__note-line', content: LICENCE_NOTE });
	const actions = makeElement({ className: 'start__note-actions' });

	// While the note is up the name field shows the imported family (the
	// project keeps the font's own name) and is read-only.
	/** @type {HTMLInputElement | null} */
	const nameInput = document.querySelector('#input__new-project-name');
	const typed = nameInput?.value;
	if (nameInput) {
		nameInput.value = family;
		nameInput.disabled = true;
	}

	// Esc cancels from anywhere on the page while the note is up.
	const onKey = (event) => {
		if (!note.isConnected) {
			document.removeEventListener('keydown', onKey);
			return;
		}
		if (event.key !== 'Escape') return;
		event.preventDefault();
		close();
		showStartCards('file');
	};
	function close() {
		document.removeEventListener('keydown', onKey);
		if (nameInput) {
			nameInput.disabled = false;
			nameInput.value = typed;
		}
	}
	document.addEventListener('keydown', onKey);

	const cancel = makeElement({
		tag: 'button',
		className: 'start__button start__button--secondary',
		content: 'Cancel',
		attributes: { type: 'button', 'data-action': 'cancel' },
		onClick: () => {
			close();
			showStartCards('file');
		},
	});
	const proceed = makeElement({
		tag: 'button',
		className: 'start__button start__button--primary',
		content: 'Continue',
		attributes: { type: 'button', 'data-action': 'continue' },
		onClick: () => {
			document.removeEventListener('keydown', onKey);
			openStartProject(project, { panel: 'open', secondProject: !!isSecondProject });
		},
	});
	actions.append(cancel, proceed);
	note.append(title, line, actions);
	stage.replaceChildren(note);
	proceed.focus();
	return note;
}

// --------------------------------------------------------------
// Open an existing project: Open a file, Restore, Examples
// --------------------------------------------------------------

/**
 * The quiet row under the cards. Restore and Examples open a small panel.
 * @param {HTMLElement} more - the panel region
 * @returns {Element}
 */
function makeSecondaryRow(more) {
	const row = makeElement({
		tag: 'div',
		className: 'start__secondary',
		attributes: { role: 'navigation', 'aria-label': 'Open a project' },
	});

	const openFile = makeElement({
		tag: 'button',
		className: 'start__link',
		content: 'Open a file',
		attributes: { type: 'button', 'data-more': 'open' },
		onClick: () => getFilesFromFilePicker(handleOpenProjectPageFileInput),
	});
	row.appendChild(openFile);

	const panels = [];
	if (!isSecondProject) panels.push({ id: 'restore', label: 'Restore', make: makeRestorePanel });
	panels.push({ id: 'examples', label: 'Examples', make: makeExamplesPanel });

	panels.forEach((panel) => {
		const button = makeElement({
			tag: 'button',
			className: 'start__link',
			content: panel.label,
			attributes: {
				type: 'button',
				'data-more': panel.id,
				'aria-expanded': 'false',
				'aria-controls': 'open-project__right-area',
			},
			onClick: () => {
				const open = button.getAttribute('aria-expanded') === 'true';
				row.querySelectorAll('[aria-expanded]').forEach((other) =>
					other.setAttribute('aria-expanded', 'false')
				);
				if (open) {
					more.setAttribute('hidden', '');
					more.replaceChildren();
					return;
				}
				button.setAttribute('aria-expanded', 'true');
				more.replaceChildren(panel.make());
				more.removeAttribute('hidden');
			},
		});
		row.appendChild(button);
	});
	return row;
}

/**
 * Auto-saved backups list.
 * @returns {Element}
 */
function makeRestorePanel() {
	const panel = makeElement({ id: 'tab-content__auto-saves', className: 'start__panel' });
	const list = makeElement({ id: 'auto-saves__list' });
	const saves = getGlyphrStudioApp().getLocalStorage().autoSaves;
	let hasContent = false;
	for (let id in saves) {
		const row = makeElement({ tag: 'div', className: 'auto-saves__list-row' });
		addAsChildren(row, [
			makeElement({ className: 'name', content: saves[id].name }),
			makeElement({ className: 'project-id', content: `(${id})` }),
			makeElement({
				tag: 'button',
				className: 'start__button start__button--secondary',
				content: 'Open',
				attributes: { type: 'button' },
				onClick: () => loadProjectFromAutoSave(id),
			}),
			makeElement({ className: 'time-stamp', content: new Date(saves[id].time).toLocaleString() }),
		]);
		list.appendChild(row);
		hasContent = true;
	}
	if (!hasContent) {
		list.appendChild(
			makeElement({ tag: 'p', className: 'start__muted', content: 'No auto-saves yet' })
		);
	}
	panel.appendChild(list);
	return panel;
}

/**
 * Sample projects.
 * @returns {Element}
 */
function makeExamplesPanel() {
	const panel = makeElement({ id: 'tab-content__examples', className: 'start__panel' });
	const samples = [
		{ id: 'oblegg', label: 'Oblegg' },
		{ id: 'simpleProject', label: 'Simple v2 project' },
	];
	samples.forEach((sample) => {
		panel.appendChild(
			makeElement({
				tag: 'button',
				className: 'start__button start__button--secondary',
				content: sample.label,
				attributes: { type: 'button' },
				onClick: () => handleLoadSample(sample.id),
			})
		);
	});
	return panel;
}

/**
 * Import OTF/SVG/Project functions can call this if import fails and the
 * user needs a second try: closes the open-a-project panel and puts the
 * start cards back.
 */
export function resetOpenProjectTabs() {
	const more = document.querySelector('#open-project__right-area');
	if (more) {
		more.replaceChildren();
		more.setAttribute('hidden', '');
	}
	document
		.querySelectorAll('.start__secondary [aria-expanded]')
		.forEach((button) => button.setAttribute('aria-expanded', 'false'));
	showStartCards();
}

/**
 * Shows an OS File Picker, then returns the selected files
 * to a provided callback function.
 * @param {Function} callback - what to do with the files
 * @param {Object} pickerOptions - OS File Picker Options Object
 */
export async function getFilesFromFilePicker(callback, pickerOptions = {}) {
	// @ts-expect-error 'property does exist'
	if (window.showOpenFilePicker) {
		let files;
		try {
			// @ts-expect-error 'property does exist'
			files = await window.showOpenFilePicker(pickerOptions);
		} catch {
			return; // Picker dismissed.
		}
		callback(files);
	} else {
		/** @type {any} */
		const fallbackFileChooser = makeElement({ tag: 'input', attributes: { type: 'file' } });
		fallbackFileChooser.addEventListener('change', (event) => {
			cancelDefaultEventActions(event);
			callback(fallbackFileChooser.files);
		});
		fallbackFileChooser.click();
	}
}

/**
 * Handle file input or drop (existing loader: projects and whole fonts).
 * @param {Object} files - event from drop, or fileHandle from showOpenFilePicker
 */
async function handleOpenProjectPageFileInput(files) {
	/** @type {HTMLElement} */
	const dropNote = document.querySelector('#open-project__drop-note');
	if (dropNote) dropNote.style.display = 'none';
	const stage = document.querySelector('.start__stage');
	if (stage) stage.replaceChildren(makeProgressIndicator());

	let fileInput;
	let fileResult;
	if (files.length) {
		fileInput = files[0];
		if (fileInput.getAsFileSystemHandle) fileResult = await fileInput.getAsFileSystemHandle();
		else if (fileInput.getAsFile) fileResult = await fileInput.getAsFile();
		else fileResult = fileInput;
	} else {
		showError(`No files were found that could be imported.`);
	}

	if (!fileResult) {
		showError(`The file could not be read.`);
		resetOpenProjectTabs();
	} else {
		validateSingleFileInput(fileResult, postValidationCallback);
	}
}

/**
 * What to do after a file has been validated
 * @param {Object} validationResult - validation object
 */
function postValidationCallback(validationResult) {
	if (isSecondProject) addProjectEditorAndSetAsImportTarget();
	if (validationResult.content) {
		if (validationResult.fileType === 'font') {
			ioFont_importFont(validationResult.content, false, validationResult.fileSuffix);
		} else if (validationResult.fileType === 'svg') {
			ioSVG_importSVGfont(validationResult.content);
		} else if (validationResult.fileType === 'project') {
			getCurrentProjectEditor().loadedFileHandle = validationResult.fileHandle;
			importProjectDataAndNavigate(validationResult.content);
		}
	} else {
		if (validationResult.errorMessage) {
			showError(validationResult.errorMessage);
		} else {
			showError(`Some unknown error happened when loading the file.`);
		}
		resetOpenProjectTabs();
	}
}

/**
 * Do all the stuff necessary to import a text file and
 * get the UI to the right page.
 * @param {GlyphrStudioProject | Object} glyphrStudioProjectFile
 */
export function importProjectDataAndNavigate(glyphrStudioProjectFile) {
	closeEveryTypeOfDialog();
	const editor = getProjectEditorImportTarget();
	setCurrentProjectEditor(editor);
	if (!glyphrStudioProjectFile) {
		editor.project = new GlyphrStudioProject({});
		const name = typedName();
		editor.project.settings.project.name = name;
		editor.project.settings.font.family = name;
	} else {
		editor.project = importGlyphrProjectFromText(glyphrStudioProjectFile);
	}

	editor.project.resetSessionStateForAllItems();
	editor.nav.page = 'Workspace';
	if (isSecondProject) showToast(`Switched to<br>${editor.project.settings.project.name}`);
	updateWindowUnloadEvent();
	editor.navigate();
}

/**
 * Finds and loads a project by ID from local storage
 * @param {String} projectID - internal Glyphr Studio Project ID
 */
function loadProjectFromAutoSave(projectID) {
	const saves = getGlyphrStudioApp().getLocalStorage().autoSaves;
	for (let id in saves) {
		if (id === projectID) {
			importProjectDataAndNavigate(saves[id].project);
			showToast(`Restored project from auto-save:<br>${saves[id].name}`);
			return;
		}
	}
}

// --------------------------------------------------------------
// Drag Events
// --------------------------------------------------------------

/**
 * Handle DragOver event
 * @param {Object} event - event
 */
function handleDragEnter(event) {
	event.dataTransfer.dropEffect = 'copy';
	/** @type {HTMLElement} */
	const dropNote = document.querySelector('#open-project__drop-note');
	dropNote.style.animation = 'var(--animate-fade-in)';
	dropNote.style.opacity = '1';
	dropNote.innerHTML = `Drop it!`;
	dropNote.style.display = 'block';
}

/**
 * Handle DragLeave event
 */
function handleDragLeave() {
	/** @type {HTMLElement} */
	const dropNote = document.querySelector('#open-project__drop-note');
	dropNote.style.animation = 'var(--animate-fade-out)';
	window.setTimeout(() => {
		dropNote.style.display = 'none';
		dropNote.style.opacity = '0';
	}, 170);
}

// --------------------------------------------------------------
// Loading projects
// --------------------------------------------------------------

/**
 * Load a project sample
 * @param {String} name - which sample to load
 */
function handleLoadSample(name) {
	if (isSecondProject) addProjectEditorAndSetAsImportTarget();
	const panel = document.querySelector('#tab-content__examples');
	if (panel) panel.replaceChildren(makeElement({ tag: 'p', content: 'Loading example project…' }));

	let project = simpleExampleProject;
	if (name === 'oblegg') project = obleggExampleProject;
	setTimeout(() => importProjectDataAndNavigate(project), 100);
}
