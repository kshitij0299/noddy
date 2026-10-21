import { makeElement } from '../common/dom.js';
import { selectTool } from '../edit_canvas/tools/tools.js';

// --------------------------------------------------------------
// Focus mode: floating tool pill (issue #17, flow-06)
// --------------------------------------------------------------
/*
	Six buttons that call the real `selectTool()`; the active state follows
	`whichToolIsSelected`, so choosing a tool with an existing keyboard
	shortcut updates the pill too.

	Tool names are the existing Glyphr ones (tools/tools.js). The shortcut
	shown in each tooltip is the existing one (events_keyboard.js); none is
	added or changed here.
*/

/**
 * @typedef {Object} PillTool
 * @property {String} id - pill button ID
 * @property {String} tool - tool name passed to selectTool()
 * @property {Array<String>} activeFor - editor.selectedTool values that light this button
 * @property {String} icon - Material Symbols Rounded ligature
 * @property {String} label - accessible name
 * @property {String} shortcut - existing keyboard shortcut
 */

/** @type {ReadonlyArray<PillTool>} */
export const PILL_TOOLS = Object.freeze([
	{
		id: 'select',
		tool: 'pathEdit',
		// Shape select (V) and point edit (P) are both "select" in the pill.
		activeFor: ['pathEdit', 'resize'],
		icon: 'arrow_selector_tool',
		label: 'Select',
		shortcut: 'P',
	},
	{ id: 'pen', tool: 'newPath', activeFor: ['newPath'], icon: 'ink_pen', label: 'Pen', shortcut: 'H' },
	{
		id: 'add-point',
		tool: 'pathAddPoint',
		activeFor: ['pathAddPoint'],
		icon: 'add_circle',
		label: 'Add point',
		shortcut: 'U',
	},
	{
		id: 'rectangle',
		tool: 'newRectangle',
		activeFor: ['newRectangle'],
		icon: 'crop_square',
		label: 'Rectangle',
		shortcut: 'M',
	},
	{ id: 'oval', tool: 'newOval', activeFor: ['newOval'], icon: 'circle', label: 'Oval', shortcut: 'O' },
	{ id: 'hand', tool: 'pan', activeFor: ['pan'], icon: 'pan_tool', label: 'Hand', shortcut: 'Space' },
]);

/**
 * Builds the pill. Keys pressed on its buttons never reach the canvas
 * shortcuts (except Ctrl/Cmd combos such as undo).
 * @param {Object} editor - ProjectEditor
 * @returns {HTMLElement & {sync: Function}}
 */
export function makeToolPill(editor) {
	const pill = /** @type {HTMLElement & {sync: Function}} */ (
		makeElement({
			tag: 'div',
			className: 'focus-pill',
			attributes: { role: 'toolbar', 'aria-label': 'Drawing tools', 'aria-orientation': 'vertical' },
		})
	);

	const buttons = PILL_TOOLS.map((def) => {
		const button = makeElement({
			tag: 'button',
			className: 'focus-pill__tool',
			title: `${def.label} · ${def.shortcut}`,
			attributes: {
				type: 'button',
				'data-tool': def.id,
				'aria-label': def.label,
				'aria-pressed': 'false',
			},
			innerHTML: `<span class="material-symbols-rounded" aria-hidden="true">${def.icon}</span>`,
		});
		button.addEventListener('click', () => selectTool(def.tool));
		pill.appendChild(button);
		return { def, button };
	});

	const guard = (event) => {
		if (!event.ctrlKey && !event.metaKey) event.stopPropagation();
	};
	pill.addEventListener('keydown', guard);
	pill.addEventListener('keyup', guard);

	pill.sync = (tool = editor.selectedTool) => {
		buttons.forEach(({ def, button }) => {
			const active = def.activeFor.includes(tool);
			button.classList.toggle('is-active', active);
			button.setAttribute('aria-pressed', active ? 'true' : 'false');
		});
	};
	pill.sync();
	return pill;
}
