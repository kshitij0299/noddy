/**
 * New font start (M5, issues #23 and #24).
 *
 * The logic behind the three start cards on the start screen
 * (`open_project.js`): build a project with the GF Latin Kernel set, or
 * import a font file and cut it down to the set, then open it on the
 * Workspace with the agent panel open or minimized.
 *
 * Imports run the existing importers in their isolated `testing` mode (the
 * same path `src/agent/font-attachment.js` uses): they return a detached
 * project and never touch the current editor or navigate. Nothing is
 * committed to an editor until `openStartProject()`, so cancelling at any
 * step leaves no half-created project. No `src/formats_io/` code changes.
 *
 * Imported glyphs get no status record, so the status store derives 'kept'
 * (owner: user) for every drawn glyph. They are never agent Drafts.
 */

import { getAgentPanel } from '../agent/ui/agent-panel.js';
import { closeEveryTypeOfDialog } from '../controls/dialogs/dialogs.js';
import { ioFont_importFont } from '../formats_io/otf/font_import.js';
import { ioSVG_importSVGfont } from '../formats_io/svg_font/svg_font_import.js';
import { GlyphrStudioProject } from '../project_data/glyphr_studio_project.js';
import {
	LATIN_KERNEL_NOTDEF,
	applyLatinKernelToProject,
	isInLatinKernel,
	latinKernelAll,
	latinKernelCoverage,
	toCodePoint,
} from '../project_editor/charset_latin_kernel.js';
import { updateWindowUnloadEvent } from './app.js';
import {
	addProjectEditorAndSetAsImportTarget,
	getProjectEditorImportTarget,
	setCurrentProjectEditor,
} from './main.js';

export const DEFAULT_FONT_NAME = 'Bakery Sans';
export const LICENCE_NOTE = "Check the font's licence lets you modify it.";
export const FONT_FILE_TYPES = Object.freeze(['font', 'svg']);
const NAME_MAX_LENGTH = 80;

/** @returns {String} e.g. 'Latin Kernel · 116' */
export function kernelSetLabel() {
	return `Latin Kernel · ${latinKernelAll().length}`;
}

/**
 * Trims the typed name; empty falls back to the default.
 * @param {String=} name
 * @returns {String}
 */
export function cleanFontName(name) {
	const trimmed = String(name ?? '')
		.trim()
		.slice(0, NAME_MAX_LENGTH);
	return trimmed || DEFAULT_FONT_NAME;
}

/**
 * A fresh project named `name` whose character ranges are the Kernel set.
 * @param {String=} name
 * @returns {GlyphrStudioProject}
 */
export function createKernelProject(name) {
	const project = new GlyphrStudioProject({});
	const clean = cleanFontName(name);
	project.settings.project.name = clean;
	project.settings.font.family = clean;
	applyLatinKernelToProject(project);
	return project;
}

/**
 * Cuts an imported project down to the Kernel set, in place:
 * - glyphs outside the set are deleted (`.notdef` is kept);
 * - ligatures are deleted (none are in the set);
 * - kern groups keep only set members; a group with an empty side goes;
 * - the character ranges become the Kernel ranges, so missing set
 *   characters show as Empty.
 * @param {GlyphrStudioProject} project
 * @returns {{kept: Number, dropped: Number, coverage: ReturnType<typeof latinKernelCoverage>}}
 */
export function subsetProjectToLatinKernel(project) {
	let kept = 0;
	let dropped = 0;
	Object.keys(project.glyphs || {}).forEach((id) => {
		if (id === LATIN_KERNEL_NOTDEF.glyphID) return;
		if (isInLatinKernel(id)) {
			kept++;
		} else {
			delete project.glyphs[id];
			dropped++;
		}
	});

	Object.keys(project.ligatures || {}).forEach((id) => {
		delete project.ligatures[id];
		dropped++;
	});

	const inSet = (member) => {
		const codePoint = toCodePoint(member);
		return codePoint !== false && isInLatinKernel(codePoint);
	};
	Object.keys(project.kerning || {}).forEach((id) => {
		const group = project.kerning[id];
		group.leftGroup = (group.leftGroup || []).filter(inSet);
		group.rightGroup = (group.rightGroup || []).filter(inSet);
		if (!group.leftGroup.length || !group.rightGroup.length) delete project.kerning[id];
	});

	project.settings.project.characterRanges = [];
	applyLatinKernelToProject(project);
	return { kept, dropped, coverage: latinKernelCoverage(project) };
}

/**
 * Runs the existing importer for a validated font file without touching
 * the current editor, then cuts the result down to the Kernel set.
 * @param {Object} validationResult - from validateSingleFileInput
 * @returns {Promise<{project: GlyphrStudioProject, kept: Number, dropped: Number, coverage: Object}>}
 */
export async function importFontAsKernelProject(validationResult) {
	const { fileType, content, fileSuffix } = validationResult || {};
	if (!content || !FONT_FILE_TYPES.includes(fileType)) {
		throw new Error('Pick an OTF, TTF, WOFF or SVG font file.');
	}
	let project;
	if (fileType === 'font') {
		project = await ioFont_importFont(content, true, fileSuffix);
	} else {
		project = new GlyphrStudioProject(await ioSVG_importSVGfont(content, true));
	}
	if (!project || !Object.keys(project.glyphs || {}).length) {
		throw new Error('This font has no readable glyphs.');
	}
	const result = subsetProjectToLatinKernel(project);
	return { project, ...result };
}

/**
 * Commits a project to the import-target editor and opens the Workspace
 * with the agent panel in `panel` mode.
 * @param {GlyphrStudioProject} project
 * @param {Object} [options]
 * @param {'open' | 'minimized'} [options.panel='open']
 * @param {Boolean} [options.secondProject=false] - opened from the dialog over a project
 * @returns {Object} the ProjectEditor
 */
export function openStartProject(project, { panel = 'open', secondProject = false } = {}) {
	closeEveryTypeOfDialog();
	if (secondProject) addProjectEditorAndSetAsImportTarget();
	const editor = getProjectEditorImportTarget();
	setCurrentProjectEditor(editor);
	editor.project = project;
	editor.project.resetSessionStateForAllItems();
	editor.nav.page = 'Workspace';
	updateWindowUnloadEvent();
	editor.navigate();
	const agent = getAgentPanel();
	if (agent) {
		if (panel === 'minimized') agent.minimize();
		else agent.restore();
	}
	focusAfterStart(panel === 'minimized' ? 'minimized' : 'open');
	return editor;
}

/**
 * Puts keyboard focus somewhere useful after a start: the agent composer
 * when the panel is open, the first letter tile when it is minimized.
 * Runs now and again on the next frame, after the grid has rendered.
 * @param {'open' | 'minimized'} panel
 */
export function focusAfterStart(panel) {
	const target = () =>
		/** @type {HTMLElement | null} */ (
			panel === 'open'
				? getAgentPanel()?.composer?.input || null
				: document.querySelector('glyph-grid-tile[tabindex="0"]')
		);
	target()?.focus();
	// The grid may render its tiles a frame later; only fill in focus that
	// was lost (nothing focused), never steal it.
	requestAnimationFrame(() => {
		const active = document.activeElement;
		if (!active || active === document.body || !active.isConnected) target()?.focus();
	});
}
