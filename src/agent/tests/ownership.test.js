import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getGlyphrStudioApp, setCurrentProjectEditor } from '../../app/main.js';
import { Glyph } from '../../project_data/glyph.js';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import { ProjectEditor } from '../../project_editor/project_editor.js';
import { createNativeToolSession } from '../native-tools.js';
import {
	OWNERSHIP_TOPIC,
	agentJobSignal,
	agentMayWrite,
	assertAgentMayWrite,
	getMutationLog,
	grantConsent,
	handToAgent,
	isGrant,
	isHandedToAgent,
	logAgentWrite,
	MUTATION_LOG_LIMIT,
	ownershipOf,
	takeBack,
	takeOver,
} from '../ownership.js';

const ID = 'glyph-0x6E';
const OTHER = 'glyph-0x6F';
const copy = (value) => JSON.parse(JSON.stringify(value));
const corner = (x, y) => ({ p: { coord: { x, y } }, h1: { use: false }, h2: { use: false } });

let editor;
let session;

beforeEach(() => {
	document.body.innerHTML =
		'<button id="actionButtonUndo" disabled></button><button id="actionButtonRedo" disabled></button>';
	editor = new ProjectEditor();
	setCurrentProjectEditor(editor);
	editor.project.settings.app.autoSave = false;
	editor.nav.page = 'Characters';
	for (const id of [ID, OTHER]) {
		editor.project.glyphs[id] = new Glyph({
			id,
			parent: editor.project,
			advanceWidth: 600,
			shapes: [
				{
					name: 'Outline',
					pathPoints: [corner(50, 0), corner(50, 500), corner(550, 500), corner(550, 0)],
				},
			],
		});
	}
	editor.selectedGlyphID = ID;
	editor.initializeHistory(new GlyphrStudioProject(copy(editor.project.save())));
	session = createNativeToolSession();
});

afterEach(() => {
	session?.dispose();
	vi.restoreAllMocks();
	getGlyphrStudioApp().projectEditors = [];
});

const openInFocus = (id) => {
	editor.nav.focus = { originID: id, order: [id] };
	editor.selectedGlyphID = id;
};
const write = (tool = session, value = 77) =>
	tool.execute('set_spacing', {
		glyphId: ID,
		expectedRevision: tool.getContext().revision,
		metric: 'rightSideBearing',
		value,
	});
const rsb = () => editor.project.glyphs[ID].rightSideBearing;

describe('assertAgentMayWrite', () => {
	it('allows a glyph that is neither Yours nor open', () => {
		expect(() => assertAgentMayWrite(editor, ID)).not.toThrow();
		expect(ownershipOf(editor, ID)).toEqual({
			status: 'kept',
			owner: 'user',
			open: false,
			handedToAgent: false,
			locked: null,
		});
	});

	it('throws LOCKED_YOURS for a Yours glyph and LOCKED_OPEN for the open glyph', () => {
		editor.glyphStatus.set(ID, 'yours', 'user');
		expect(() => assertAgentMayWrite(editor, ID)).toThrow(
			expect.objectContaining({ code: 'LOCKED_YOURS' })
		);
		openInFocus(OTHER);
		expect(() => assertAgentMayWrite(editor, OTHER)).toThrow(
			expect.objectContaining({ code: 'LOCKED_OPEN', glyphId: OTHER })
		);
		expect(agentMayWrite(editor, 'glyph-0x61')).toBe(true);
	});

	it('only accepts grants minted by UI code, for the same editor and glyph', () => {
		editor.glyphStatus.set(ID, 'yours', 'user');
		const forged = { editor, id: ID, open: true, yours: true };
		expect(isGrant(forged)).toBe(false);
		expect(agentMayWrite(editor, ID, { grant: forged })).toBe(false);
		const grant = grantConsent(editor, ID, { yours: true });
		expect(isGrant(grant)).toBe(true);
		expect(Object.isFrozen(grant)).toBe(true);
		expect(agentMayWrite(editor, ID, { grant })).toBe(true);
		expect(agentMayWrite(editor, OTHER, { grant: grantConsent(editor, ID, { open: true }) })).toBe(
			true
		);
		const otherEditor = new ProjectEditor();
		expect(
			agentMayWrite(editor, ID, { grant: grantConsent(otherEditor, ID, { yours: true }) })
		).toBe(false);
	});
});

describe('write tools respect the lock', () => {
	it('rejects a write to a Yours glyph and leaves it untouched', () => {
		editor.glyphStatus.set(ID, 'yours', 'user');
		const before = rsb();
		const history = editor.history.queue.length;
		const result = write();
		expect(result.ok).toBe(false);
		expect(result.error.code).toBe('LOCKED_YOURS');
		expect(rsb()).toBe(before);
		expect(editor.history.queue.length).toBe(history);
	});

	it('rejects a write to a glyph the user opened after sending', () => {
		openInFocus(ID);
		const result = write();
		expect(result.error.code).toBe('LOCKED_OPEN');
	});

	it('cannot be talked past: extra consent arguments are invalid', () => {
		editor.glyphStatus.set(ID, 'yours', 'user');
		const result = session.execute('set_spacing', {
			glyphId: ID,
			expectedRevision: session.getContext().revision,
			metric: 'rightSideBearing',
			value: 10,
			consent: true,
		});
		expect(result.error.code).toBe('INVALID_ARGUMENTS');
	});

	it('a Send from the focus editor hands that glyph over for that request only', () => {
		openInFocus(ID);
		const fromFocus = createNativeToolSession();
		expect(fromFocus.getContext().lock).toBeNull();
		expect(write(fromFocus).ok).toBe(true);
		expect(rsb()).toBe(77);
		// The request grant does not lift the Yours lock.
		editor.glyphStatus.set(ID, 'yours', 'user');
		expect(fromFocus.getContext().lock).toBe('yours');
		expect(write(fromFocus, 80).error.code).toBe('LOCKED_YOURS');
		fromFocus.dispose();
		// Other sessions still see the open lock.
		editor.glyphStatus.clear(ID);
		expect(write().error.code).toBe('LOCKED_OPEN');
	});

	it('Hand to agent lifts the open and Yours locks; Take back restores them', () => {
		const publish = vi.spyOn(editor, 'publish');
		openInFocus(ID);
		editor.glyphStatus.set(ID, 'yours', 'user');
		handToAgent(editor, ID);
		expect(isHandedToAgent(editor, ID)).toBe(true);
		expect(publish).toHaveBeenCalledWith(OWNERSHIP_TOPIC, { id: ID, action: 'handToAgent' });
		expect(write().ok).toBe(true);
		expect(takeBack(editor, ID)).toBe(true);
		expect(takeBack(editor, ID)).toBe(false);
		expect(write(session, 90).error.code).toBe('LOCKED_YOURS');
		editor.glyphStatus.clear(ID);
		expect(write(session, 90).error.code).toBe('LOCKED_OPEN');
	});
});

describe('Take over', () => {
	it('cancels the glyph job, returns the glyph to the user and leaves no partial edit', () => {
		editor.glyphStatus.set(ID, 'drafting', 'agent');
		const signal = agentJobSignal(editor, ID);
		expect(agentJobSignal(editor, ID)).toBe(signal);
		const before = JSON.stringify(editor.project.glyphs[ID].save());
		const history = editor.history.queue.length;
		expect(takeOver(editor, ID)).toEqual({ cancelled: true });
		expect(signal.aborted).toBe(true);
		expect(signal.reason).toBe('TAKEN_OVER');
		expect(editor.glyphStatus.get(ID)).toMatchObject({
			status: 'kept',
			owner: 'user',
			derived: true,
		});
		// An agent write already in flight for this glyph stops before commit.
		const result = session.execute(
			'set_spacing',
			{
				glyphId: ID,
				expectedRevision: session.getContext().revision,
				metric: 'rightSideBearing',
				value: 5,
			},
			{ signal }
		);
		expect(result.error.code).toBe('CANCELLED');
		expect(JSON.stringify(editor.project.glyphs[ID].save())).toBe(before);
		expect(editor.history.queue.length).toBe(history);
		expect(getMutationLog(editor)).toHaveLength(0);
		// A new job gets a fresh signal.
		expect(agentJobSignal(editor, ID).aborted).toBe(false);
		expect(takeOver(editor, OTHER)).toEqual({ cancelled: false });
	});

	it('ends a hand-off and keeps a draft status as it is', () => {
		editor.glyphStatus.set(ID, 'draft', 'agent');
		handToAgent(editor, ID);
		takeOver(editor, ID);
		expect(isHandedToAgent(editor, ID)).toBe(false);
		expect(editor.glyphStatus.getStatus(ID)).toBe('draft');
	});
});

describe('mutation log', () => {
	it('is append-only, per editor, capped oldest first', () => {
		const first = logAgentWrite(editor, {
			tool: 'add_paths',
			id: ID,
			summary: 'add 1 paths',
			ts: 1,
		});
		expect(Object.isFrozen(first)).toBe(true);
		const view = getMutationLog(editor);
		expect(() => view.push({})).toThrow();
		expect(getMutationLog(new ProjectEditor())).toEqual([]);
		for (let index = 0; index < MUTATION_LOG_LIMIT; index++) {
			logAgentWrite(editor, { tool: 'set_spacing', id: ID, summary: `n${index}`, ts: index + 2 });
		}
		const log = getMutationLog(editor);
		expect(log).toHaveLength(MUTATION_LOG_LIMIT);
		expect(log[0].summary).toBe('n0');
	});
});
