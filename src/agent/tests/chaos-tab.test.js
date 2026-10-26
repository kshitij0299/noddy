// PR C: the Chaos tab UI. The tabs appear once the tools register; the tool row is a radio
// group with arrows; knobs per tool; preview; Apply lands Drafts (one undo step per glyph) with
// Keep / Re-roll / Undo per glyph; Pixel Life explains itself on a drawn font.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { resetAgentControlsForTests, setMode, setPicks } from '../agent-controls.js';
import { toShapeData } from '../chaos/geometry.js';
import { CURVY_O, PIXEL_H, PIXEL_O, SANS_H } from '../chaos/tests/fixtures.js';
import { createAgentPanel } from '../ui/agent-panel.js';
import { listChaosTools, resetChaosToolsForTests } from '../ui/agent-panel-tabs.js';
import { registerChaosTools, resetChaosTabForTests } from '../ui/chaos/chaos-tab.js';

const H = 'glyph-0x48';
const O = 'glyph-0x4F';
const copy = (value) => JSON.parse(JSON.stringify(value));

function makeEditor(glyphs) {
	const editor = new ProjectEditor();
	editor.project.settings.project.id = 'chaos-font';
	editor.project.settings.app.autoSave = false;
	Object.assign(editor.project.settings.font, {
		upm: 1000,
		ascent: 800,
		descent: -200,
		capHeight: 700,
		xHeight: 500,
		overshoot: 10,
	});
	for (const [id, contours] of Object.entries(glyphs))
		editor.project.glyphs[id] = new Glyph({
			id,
			parent: editor.project,
			advanceWidth: 600,
			shapes: toShapeData(contours, 'Path'),
		});
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	return editor;
}

const panels = [];
function panelFor(editor) {
	setCurrentProjectEditor(editor);
	const panel = createAgentPanel({
		getEditor: () => editor,
		probe: async () => true,
		loadLocalAgent: null,
		controller: {
			connected: false,
			running: false,
			references: [],
			stop: vi.fn(),
			run: vi.fn(async () => {}),
			connect: vi.fn(),
			disconnect: vi.fn(),
			clear: vi.fn(),
		},
	});
	document.body.append(panel.host);
	panels.push(panel);
	return panel;
}

const chaosTab = (panel) => panel.panel.querySelector('.agent-panel__tab--chaos');
const waitFor = async (check, tries = 400) => {
	for (let i = 0; i < tries; i++) {
		if (check()) return true;
		await new Promise((resolve) => setTimeout(resolve, 10));
	}
	throw new Error('timed out');
};
const previewDone = (panel) => () =>
	['done', 'blocked', 'empty'].includes(
		chaosTab(panel).querySelector('.chaos-preview')?.dataset.state
	);
const button = (root, name) =>
	[...root.querySelectorAll('button')].find(
		(node) => (node.getAttribute('aria-label') || node.textContent.trim()) === name
	);

beforeEach(() => {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	sessionStorage.clear();
	localStorage.clear();
	resetAgentControlsForTests();
	resetChaosToolsForTests();
	resetChaosTabForTests();
});

afterEach(() => {
	panels.forEach((panel) => panel.dispose());
	panels.length = 0;
	resetChaosToolsForTests();
	resetAgentControlsForTests();
	setCurrentProjectEditor(undefined);
});

describe('Chaos tab', () => {
	it('shows the Agent | Chaos tabs only once the tools are registered', () => {
		const panel = panelFor(makeEditor({ [H]: SANS_H }));
		expect(panel.tabs.root.hidden).toBe(true);
		registerChaosTools();
		registerChaosTools(); // idempotent
		expect(listChaosTools().map((tool) => tool.id)).toEqual([
			'slash-cut',
			'glitch-bands',
			'warp',
			'grid-snap',
			'pixel-life',
		]);
		expect(panel.tabs.root.hidden).toBe(false);
	});

	it('lists the tools as one radio group; arrows choose and swap the knobs', () => {
		registerChaosTools();
		const panel = panelFor(makeEditor({ [H]: SANS_H }));
		panel.tabs.select('chaos');
		const radios = [...chaosTab(panel).querySelectorAll('.chaos-tab__pick')];
		expect(radios.map((r) => r.textContent.replace(/^[a-z_0-9]+/, ''))).toEqual([
			'Slash cut',
			'Glitch bands',
			'Warp',
			'Grid snap',
			'Pixel Life',
		]);
		expect(radios[0].getAttribute('aria-checked')).toBe('true');
		expect(radios.map((r) => r.tabIndex)).toEqual([0, -1, -1, -1, -1]);
		const labels = () =>
			[...chaosTab(panel).querySelectorAll('.chaos-knob__label')].map((l) => l.textContent);
		expect(labels()).toEqual([
			'Chaos',
			'Slashes',
			'Angle',
			'Width',
			'Overshoot',
			'Seed',
			'Break rules',
		]);
		radios[0].focus();
		radios[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
		expect(document.activeElement).toBe(radios[1]);
		expect(radios[1].getAttribute('aria-checked')).toBe('true');
		expect(labels()).toEqual(['Chaos', 'Bands', 'Max shift', 'Seed', 'Break rules']);
		radios[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
		expect(labels()).toEqual([
			'Chaos',
			'Generations',
			'Rule',
			'Protect stems',
			'Seed',
			'Break rules',
		]);
	});

	it('previews the target, applies Drafts with one undo step per glyph, and Keep / Undo work', async () => {
		registerChaosTools();
		const editor = makeEditor({ [H]: PIXEL_H, [O]: PIXEL_O });
		setPicks([H, O]);
		const panel = panelFor(editor);
		panel.tabs.select('chaos');
		const tab = chaosTab(panel);
		await waitFor(previewDone(panel));
		expect(tab.querySelectorAll('.chaos-preview__cell').length).toBe(2);
		// Break rules only shows in Wild mode.
		expect(tab.querySelector('.chaos-knob--wild').hidden).toBe(true);
		const before = editor.history.length;
		button(tab, 'Apply').click();
		await waitFor(() =>
			/landed/.test(tab.querySelector('.chaos-results__status')?.textContent || '')
		);
		expect(editor.history.length - before).toBe(2);
		expect(editor.glyphStatus.getStatus(H)).toBe('draft');
		expect(editor.glyphStatus.getStatus(O)).toBe('draft');
		const rows = [...tab.querySelectorAll('.chaos-result')];
		expect(rows.map((row) => row.querySelector('.chaos-result__char').textContent)).toEqual([
			'H',
			'O',
		]);
		button(tab, 'Keep H').click();
		expect(editor.glyphStatus.getStatus(H)).toBe('kept');
		const drafted = JSON.stringify(editor.project.glyphs[O].save());
		button(tab, 'Undo O').click();
		expect(JSON.stringify(editor.project.glyphs[O].save())).not.toBe(drafted);
		expect(editor.glyphStatus.getStatus(O)).not.toBe('draft');
		expect(button(tab, 'Keep all').disabled).toBe(true);
	});

	it('Re-roll deals a new seed; Wild mode shows Break rules', async () => {
		registerChaosTools();
		const editor = makeEditor({ [H]: SANS_H });
		setPicks([H]);
		const panel = panelFor(editor);
		panel.tabs.select('chaos');
		const tab = chaosTab(panel);
		await waitFor(previewDone(panel));
		const seed = tab.querySelector('.chaos-seed').value;
		button(tab, 'Re-roll: new seed').click();
		expect(tab.querySelector('.chaos-seed').value).not.toBe(seed);
		setMode(editor, 'wild');
		await waitFor(() => !tab.querySelector('.chaos-knob--wild').hidden);
	});

	it('Pixel Life on a drawn font says why and cannot apply', async () => {
		registerChaosTools();
		const editor = makeEditor({ [O]: CURVY_O });
		setPicks([O]);
		const panel = panelFor(editor);
		panel.tabs.select('chaos');
		const tab = chaosTab(panel);
		const pixel = [...tab.querySelectorAll('.chaos-tab__pick')].at(-1);
		pixel.click();
		await waitFor(previewDone(panel));
		expect(tab.querySelector('.chaos-preview').dataset.state).toBe('blocked');
		expect(tab.querySelector('.chaos-preview__note').textContent).toMatch(/pixel grid/);
		expect(button(tab, 'Apply').disabled).toBe(true);
	});
});
