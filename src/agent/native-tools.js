import { getCurrentProjectEditor } from '../app/main.js';
import { refreshPanel } from '../panels/panels.js';
import { Glyph } from '../project_data/glyph.js';
import { GlyphrStudioProject } from '../project_data/glyphr_studio_project.js';
import {
	codePointToGlyphID,
	isInLatinKernel,
	latinKernelAll,
	latinKernelCoverage,
	latinKernelEntry,
} from '../project_editor/charset_latin_kernel.js';
import { checkGlyphOutlines } from './outline-check.js';
import {
	agentJobSignal,
	assertAgentMayWrite,
	grantConsent,
	isHandedToAgent,
	logAgentWrite,
	openGlyphId,
	ownershipOf,
	readMutationLog,
} from './ownership.js';
import { fontMetrics, renderRow } from './render.js';
import {
	READ_ONLY_TOOLS,
	RENDER_IMAGES_PER_REQUEST,
	validateToolInput,
} from './tool-definitions.js';

let nextSession = 0;
const activeTransactions = new WeakSet();
const agentSnapshots = new WeakSet();
const editorsWithHistoryRefresh = new WeakSet();
const copy = (value) => JSON.parse(JSON.stringify(value));
const jsonSize = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const fail = (code, message) => {
	throw Object.assign(new Error(message), { code });
};
const abortIfNeeded = (signal) => {
	if (signal?.aborted) fail('CANCELLED', 'The request was stopped.');
};

/**
 * One request, one captured editor and glyph. No global editor swapping, no
 * arbitrary property writes, and no model-controlled permissions. The UI should
 * create a new session per Send and retain the last one for its inline Undo.
 */
export function createNativeToolSession({ getEditor = getCurrentProjectEditor, makeCanvas } = {}) {
	const editor = getEditor();
	const project = editor?.project;
	if (!project) fail('NO_PROJECT', 'Open a project before asking the agent to edit.');
	const glyphId = editor.nav?.page === 'Characters' ? editor.selectedItemID : null;
	// Sending a request from the focus editor names the open glyph: that Send
	// is the user's hand-off for this request only (open lock, not Yours).
	// The grant is UI-minted here; the model can never create one.
	const requestGrant =
		glyphId && openGlyphId(editor) === glyphId
			? grantConsent(editor, glyphId, { open: true })
			: undefined;
	// The agent's job on the bound glyph. "Take over" aborts it, and every
	// later write of this session then fails (CANCELLED) at execution time.
	const job = glyphId ? agentJobSignal(editor, glyphId) : undefined;
	const renderBudget = { used: 0 };
	const sessionId = `agent-${++nextSession}`;
	let revision = 0;
	let lastState;
	let lastHead;
	let disposed = false;
	let lastEdit;
	const completedCalls = new Map();

	function assertActive() {
		if (disposed) fail('SESSION_CLOSED', 'Send a new request to start a session.');
		if (getEditor() !== editor || editor.project !== project) {
			fail('PROJECT_CHANGED', 'The project changed. Send a new request for the current project.');
		}
	}

	function getContext() {
		assertActive();
		const glyph = project.glyphs[glyphId];
		const selection = getSelection(editor, glyph);
		// Data fingerprints catch manual mutations even when a UI handler omits
		// publish(). History identity also catches an edit followed by undo.
		const state = JSON.stringify([
			project.save(),
			editor.nav?.page,
			editor.selectedItemID,
			selection,
		]);
		if (state !== lastState || editor.history.queue[0] !== lastHead) {
			revision++;
			lastState = state;
			lastHead = editor.history.queue[0];
		}
		return {
			projectId: project.settings.project.id,
			projectName: project.settings.project.name,
			glyphId,
			revision: `${sessionId}:${revision}`,
			selection,
			writable: Boolean(
				glyph && editor.nav?.page === 'Characters' && editor.selectedItemID === glyphId
			),
			unitsPerEm: project.settings.font.upm,
			spec: compactSpec(project),
			set: setSummary(editor, project),
			lock: glyphId ? ownershipOf(editor, glyphId, { grant: requestGrant }).locked : null,
		};
	}

	function errorResult(error) {
		let context;
		try {
			context = getContext();
		} catch {
			// A closed/replaced project has no usable context in this session.
		}
		return {
			ok: false,
			error: {
				code: error.code || 'NATIVE_TOOL_FAILED',
				message: error.message || 'The edit failed.',
			},
			...(context ? { context } : {}),
		};
	}

	function execute(name, input, { callId, signal } = {}) {
		try {
			assertActive();
			abortIfNeeded(signal);
			const validation = validateToolInput(name, input);
			if (!validation.valid) fail('INVALID_ARGUMENTS', validation.error);
			const signature = JSON.stringify([name, input]);
			if (callId !== undefined && (typeof callId !== 'string' || callId.length > 200)) {
				fail('INVALID_CALL_ID', 'Call identity must be a short string.');
			}
			if (callId && completedCalls.has(callId)) {
				const previous = completedCalls.get(callId);
				if (previous.signature !== signature)
					fail('CALL_ID_CONFLICT', 'A call ID was reused for a different request.');
				return { ...copy(previous.result), duplicate: true };
			}
			if (completedCalls.size >= 64)
				fail('SESSION_LIMIT', 'This session reached its tool-call limit.');
			const context = getContext();
			let result;
			if (name === 'get_context') {
				result = { ok: true, context };
			} else if (name === 'read_glyphs') {
				let remainingPoints = 512;
				const glyphs = input.glyphIds.map((id) => {
					const glyph = project.glyphs[id];
					if (!glyph) return { glyphId: id, exists: false };
					const includePaths = input.includePaths && glyph.pointCount <= remainingPoints;
					if (includePaths) remainingPoints -= glyph.pointCount;
					return describeGlyph(glyph, includePaths, Math.floor(112000 / input.glyphIds.length));
				});
				result = { ok: true, context, glyphs };
			} else if (READ_ONLY_TOOLS.includes(name)) {
				// The envelope's ok always wins: a payload field can never fail a step.
				result = {
					...readTool(name, input, { editor, project, makeCanvas, renderBudget }),
					ok: true,
				};
			} else {
				if (!context.writable || input.glyphId !== glyphId) {
					fail(
						'OUT_OF_SCOPE',
						'Edits are limited to the glyph selected when you sent this request. Select the intended character and send again.'
					);
				}
				assertAgentMayWrite(editor, glyphId, { grant: requestGrant, job });
				if (input.expectedRevision !== context.revision) {
					fail(
						'STALE_REVISION',
						'The font or selection changed. Read the glyph again before editing.'
					);
				}
				if (lastState.length > 8_000_000)
					fail(
						'PROJECT_TOO_LARGE',
						'This project exceeds the first version’s native history snapshot limit.'
					);
				if (activeTransactions.has(editor))
					fail('EDITOR_BUSY', 'Another native command is editing this project.');
				const before = project.glyphs[glyphId];
				assertNoDependents(project, before);
				const candidate = new Glyph(copy(before.save(true)));
				candidate.wasCreatedThisSession = before.wasCreatedThisSession;
				// Component resolution is coupled to the active app. Do not claim
				// isolated geometry edits on component-bearing glyphs in this slice.
				if (candidate.shapes.some((shape) => shape.objType !== 'Path')) {
					fail(
						'UNSUPPORTED_COMPONENT',
						'Agent edits to glyphs containing component instances are not supported yet.'
					);
				}
				applyCommand(name, input, candidate);
				assertGeometry(candidate);
				abortIfNeeded(signal);
				// Re-check right before commit: the lock state is read at execution time.
				assertAgentMayWrite(editor, glyphId, { grant: requestGrant, job });
				if (JSON.stringify(before.save()) === JSON.stringify(candidate.save())) {
					result = { ok: true, changed: false, context, glyph: describeGlyph(before, false) };
				} else {
					commit(candidate, `Agent: ${commandTitle(name, input)}`, signal);
					logAgentWrite(editor, {
						tool: name,
						id: glyphId,
						summary: commandTitle(name, input),
						historyEntryRef: editor.history.queue[0],
					});
					result = {
						ok: true,
						changed: true,
						context: getContext(),
						glyph: describeGlyph(candidate, false),
						undoAvailable: true,
					};
					lastEdit = { entry: editor.history.queue[0], state: lastState };
				}
			}
			if (callId) completedCalls.set(callId, { signature, result: copy(result) });
			return result;
		} catch (error) {
			return errorResult(error);
		}
	}

	function commit(candidate, title, signal) {
		const history = editor.history;
		const queue = [...history.queue];
		const redoQueue = [...history.redoQueue];
		const initialProject = history.initialProject;
		const projectSaved = editor.projectSaved;
		const documentTitle = document.title;
		const historyButtons = ['actionButtonUndo', 'actionButtonRedo'].map((id) => {
			const element = document.getElementById(id);
			return { element, disabled: element?.hasAttribute('disabled') };
		});
		const originalGlyph = project.glyphs[glyphId];
		const shapeSelection = [...editor.multiSelect.shapes.members];
		const pointSelection = [...editor.multiSelect.points.members];
		const detached = [];
		activeTransactions.add(editor);
		try {
			ensureHistoryPanelRefresh(editor);
			if (history.initialProject === project) history.initialProject = snapshot(project);
			// Native undo/redo may install a history snapshot as the live project.
			// Detach that historical reference before a subsequent write; otherwise
			// later redo would replay a mutated snapshot.
			for (const entry of [...queue, ...redoQueue.flat()]) {
				if (!agentSnapshots.has(entry) && entry.itemState === project) {
					detached.push(entry);
					entry.itemState = snapshot(project);
				}
			}
			history.addWholeProjectChangePreState(title);
			captureHistorySnapshot(history.queue[0], project);
			abortIfNeeded(signal);
			candidate.parent = project;
			project.glyphs[glyphId] = candidate;
			candidate.changed();
			// Rebind selection by index to the new native objects; no stale refs.
			editor.multiSelect.shapes.members = shapeSelection
				.map((shape) => candidate.shapes[originalGlyph.shapes.indexOf(shape)])
				.filter(Boolean);
			editor.multiSelect.points.members = pointSelection
				.map((point) => {
					const pathIndex = originalGlyph.shapes.indexOf(point.parent);
					return candidate.shapes[pathIndex]?.pathPoints[point.parent.pathPoints.indexOf(point)];
				})
				.filter(Boolean);
			history.addWholeProjectChangePostState();
			captureHistorySnapshot(history.queue[0], project);
			abortIfNeeded(signal);
			editor.publish('currentItem', candidate);
			// Inspector change handlers capture native object references. Rebuild
			// the panel after replacing a glyph, not just its displayed values.
			refreshPanel();
			// The native pre-state hook autosaves the old state; run the same
			// native hook after successful commit so autosave contains the edit.
			history.updateAfterSaveState();
		} catch (error) {
			project.glyphs[glyphId] = originalGlyph;
			history.queue = queue;
			history.redoQueue = redoQueue;
			history.initialProject = initialProject;
			editor.projectSaved = projectSaved;
			document.title = documentTitle;
			for (const { element, disabled } of historyButtons) {
				if (element) element.toggleAttribute('disabled', disabled);
			}
			editor.multiSelect.shapes.members = shapeSelection;
			editor.multiSelect.points.members = pointSelection;
			for (const entry of detached) entry.itemState = project;
			try {
				editor.publish('currentItem', originalGlyph);
				refreshPanel();
			} catch {
				// Preserve the original failure if a UI subscriber also fails during rollback.
			}
			throw error;
		} finally {
			activeTransactions.delete(editor);
		}
	}

	function undoLast() {
		try {
			getContext();
			if (!lastEdit || editor.history.queue[0] !== lastEdit.entry || lastState !== lastEdit.state) {
				fail(
					'UNDO_NOT_LATEST',
					'Other edits occurred after this command. Use the editor’s history to undo.'
				);
			}
			editor.history.restoreState();
			refreshPanel();
			lastEdit = null;
			disposed = true;
			return { ok: true, undone: true };
		} catch (error) {
			return errorResult(error);
		}
	}

	return {
		getContext,
		execute,
		undoLast,
		dispose: () => {
			disposed = true;
			completedCalls.clear();
		},
	};
}

// --------------------------------------------------------------
// Read tools (M6 #25): no history, no publish, no selection or view change
// --------------------------------------------------------------

function compactSpec(project) {
	const font = project.settings.font;
	return {
		family: String(font.family).slice(0, 80),
		upm: font.upm,
		ascent: font.ascent,
		descent: font.descent,
		capHeight: font.capHeight,
		xHeight: font.xHeight,
		overshoot: font.overshoot,
	};
}

function setSummary(editor, project) {
	const coverage = latinKernelCoverage(project);
	const ids = latinKernelAll().map((entry) => entry.glyphID);
	const yours = editor.glyphStatus ? editor.glyphStatus.listByStatus('yours', ids) : [];
	return {
		name: 'Latin Kernel',
		total: coverage.total,
		drawn: coverage.drawn,
		statusCounts: editor.glyphStatus ? editor.glyphStatus.counts(ids) : null,
		yours: yours.slice(0, 64),
		open: openGlyphId(editor),
	};
}

/** In the set: a Latin Kernel character, or any glyph the project already has. */
function isInSet(project, id) {
	return isInLatinKernel(id) || Boolean(project.glyphs[id]);
}

function assertInSet(project, ids) {
	const outside = ids.filter((id) => !isInSet(project, id));
	if (outside.length)
		fail('OUT_OF_SET', `Not in this font's character set: ${outside.slice(0, 8).join(', ')}.`);
}

function useRenderBudget(renderBudget) {
	if (renderBudget.used >= RENDER_IMAGES_PER_REQUEST)
		fail(
			'RENDER_LIMIT',
			`This request already rendered ${RENDER_IMAGES_PER_REQUEST} images. Finish with what you have; the user can send a follow-up.`
		);
	renderBudget.used++;
}

function readTool(name, input, { editor, project, makeCanvas, renderBudget }) {
	if (name === 'get_font_spec') {
		const font = project.settings.font;
		return {
			spec: {
				family: String(font.family).slice(0, 120),
				style: String(font.style).slice(0, 80),
				...fontMetrics(project),
				lineGap: font.lineGap,
				italicAngle: font.italicAngle,
				weight: font.weight,
				// No design-spec store yet (propose_font_spec is out of scope).
				stems: null,
			},
		};
	}
	if (name === 'get_set_status') {
		const entries = latinKernelAll().filter((entry) => !input.group || entry.group === input.group);
		const coverage = latinKernelCoverage(project);
		return {
			set: 'Latin Kernel',
			coverage: { total: coverage.total, drawn: coverage.drawn, byGroup: coverage.byGroup },
			statusCounts: editor.glyphStatus?.counts(entries.map((entry) => entry.glyphID)) ?? null,
			open: openGlyphId(editor),
			glyphs: entries.map((entry) => {
				const own = ownershipOf(editor, entry.glyphID);
				return {
					glyphId: entry.glyphID,
					char: entry.char,
					group: entry.group,
					exists: Boolean(project.glyphs[entry.glyphID]),
					status: own.status,
					owner: own.owner,
					lock: own.locked,
					...(isHandedToAgent(editor, entry.glyphID) ? { handedToAgent: true } : {}),
				};
			}),
		};
	}
	if (name === 'render_glyphs') {
		assertInSet(project, input.glyphIds);
		const items = input.glyphIds.map((id) => ({ glyphId: id, glyph: project.glyphs[id] || null }));
		useRenderBudget(renderBudget);
		return renderRow({
			project,
			items,
			height: input.height ?? undefined,
			guides: input.guides ?? true,
			gap: Math.round(project.settings.font.upm * 0.1),
			makeCanvas,
		});
	}
	if (name === 'render_text') {
		const ids = [...input.text].map((char) => codePointToGlyphID(char.codePointAt(0)));
		// Like the specimen: characters outside the set render as ghost boxes
		// and are listed, rather than failing the whole line.
		const outside = [...input.text].filter(
			(char, index) => !ids[index] || !isInSet(project, ids[index])
		);
		const items = ids.map((id) => ({
			glyphId: id || 'glyph-0x0',
			glyph: (id && project.glyphs[id]) || null,
		}));
		useRenderBudget(renderBudget);
		return {
			...renderRow({
				project,
				items,
				height: input.height ?? undefined,
				guides: input.guides ?? false,
				gap: 0,
				makeCanvas,
			}),
			outOfSet: [...new Set(outside)].slice(0, 32),
		};
	}
	if (name === 'check_outlines') {
		assertInSet(project, [input.glyphId]);
		const glyph = project.glyphs[input.glyphId];
		if (!glyph)
			return { glyphId: input.glyphId, exists: false, clean: true, issues: [], contours: [] };
		return {
			glyphId: input.glyphId,
			exists: true,
			char: latinKernelEntry(input.glyphId)?.char ?? null,
			componentCount: glyph.shapes.filter((shape) => shape.objType !== 'Path').length,
			...checkGlyphOutlines(glyph, fontMetrics(project)),
		};
	}
	if (name === 'get_mutation_log') {
		return readMutationLog(editor, {
			glyphId: input.glyphId ?? null,
			limit: input.limit ?? 50,
		});
	}
	fail('UNKNOWN_TOOL', 'This tool has no native implementation.');
}

function snapshot(project) {
	return hydrateSnapshot(project.save(), captureSessionState(project));
}

function captureHistorySnapshot(entry, project) {
	const saved = copy(project.save());
	const sessionState = captureSessionState(project);
	// History installs itemState directly as the live project on undo/redo.
	// Agent-owned entries must return a detached project on every restoration,
	// including when the *next* edit is manual. A local snapshot accessor keeps
	// that invariant without changing or monkeypatching the native History API.
	Object.defineProperty(entry, 'itemState', {
		enumerable: true,
		configurable: true,
		get: () => hydrateSnapshot(saved, sessionState),
	});
	agentSnapshots.add(entry);
}

function hydrateSnapshot(saved, sessionState) {
	const data = copy(saved);
	const result = new GlyphrStudioProject(data);
	// Import hydration stamps version metadata and ignores boolean settings.
	// History must preserve exact settings, retaining only the three native
	// object collections that need their class methods after restoration.
	const hydrated = result.settings;
	result.settings = copy(data.settings);
	result.settings.project.characterRanges = hydrated.project.characterRanges;
	result.settings.app.guides.custom = hydrated.app.guides.custom;
	result.settings.app.livePreviews = hydrated.app.livePreviews;
	for (const group of ['glyphs', 'components', 'ligatures']) {
		for (const [id, flags] of Object.entries(sessionState[group])) {
			if (result[group][id]) Object.assign(result[group][id], flags);
		}
	}
	return result;
}

function captureSessionState(project) {
	// These flags affect exportUneditedItems, but intentionally are not part of
	// .gs2 serialization. Preserve them as a private history sidecar.
	return Object.fromEntries(
		['glyphs', 'components', 'ligatures'].map((group) => [
			group,
			Object.fromEntries(
				Object.entries(project[group]).map(([id, glyph]) => [
					id,
					{
						hasChangedThisSession: glyph.hasChangedThisSession,
						wasCreatedThisSession: glyph.wasCreatedThisSession,
					},
				])
			),
		])
	);
}

function ensureHistoryPanelRefresh(editor) {
	if (editorsWithHistoryRefresh.has(editor)) return;
	let previousProject = editor.project;
	// Menu/keyboard undo uses native History directly, outside a tool session.
	// Its restored project replaces every object referenced by inspector event
	// handlers. Keep one editor-owned observer alive for that history's lifetime,
	// even after the agent window/session closes; no global history monkeypatch.
	editor.subscribe({
		topic: 'currentItem',
		subscriberID: 'agent-history-project-restoration',
		callback: () => {
			if (editor.project === previousProject) return;
			previousProject = editor.project;
			if (getCurrentProjectEditor() === editor) refreshPanel();
		},
	});
	editorsWithHistoryRefresh.add(editor);
}

function getSelection(editor, glyph) {
	const pathIndices = (editor.multiSelect?.shapes?.members || [])
		.map((shape) => glyph?.shapes.indexOf(shape))
		.filter((index) => index >= 0);
	const pointIndices = (editor.multiSelect?.points?.members || [])
		.map((point) => ({
			pathIndex: glyph?.shapes.indexOf(point.parent),
			pointIndex: point.parent?.pathPoints.indexOf(point),
		}))
		.filter((point) => point.pathIndex >= 0 && point.pointIndex >= 0);
	return { pathIndices, pointIndices };
}

function describeGlyph(glyph, includePaths, maxBytes = 112000) {
	const bounds = glyph.maxes;
	const description = {
		glyphId: glyph.id,
		exists: true,
		name: glyph.name,
		advanceWidth: glyph.advanceWidth,
		leftSideBearing: glyph.leftSideBearing,
		rightSideBearing: glyph.rightSideBearing,
		bounds: { xMin: bounds.xMin, xMax: bounds.xMax, yMin: bounds.yMin, yMax: bounds.yMax },
		pathCount: glyph.shapes.length,
		pointCount: glyph.pointCount,
		usedIn: glyph.usedIn.slice(0, 32),
		dependentCount: glyph.usedIn.length,
		pathsIncluded: includePaths,
		paths: glyph.shapes.slice(0, 128).map((shape, index) => ({
			index,
			name: String(shape.name).slice(0, 80),
			type: shape.objType,
			locks: { x: shape.xLock, y: shape.yLock, width: shape.wLock, height: shape.hLock },
			...(includePaths && shape.objType === 'Path'
				? {
						points: shape.pathPoints.map((point) => ({
							x: point.p.x,
							y: point.p.y,
							h1: point.h1.use ? { x: point.h1.x, y: point.h1.y } : null,
							h2: point.h2.use ? { x: point.h2.x, y: point.h2.y } : null,
							locks: {
								p: { x: point.p.xLock, y: point.p.yLock },
								h1: { x: point.h1.xLock, y: point.h1.yLock },
								h2: { x: point.h2.xLock, y: point.h2.yLock },
							},
						})),
				  }
				: {}),
		})),
	};
	if (jsonSize(description) > maxBytes) {
		for (const path of description.paths) delete path.points;
		description.pathsIncluded = false;
	}
	while (jsonSize(description) > maxBytes && description.paths.length) {
		description.paths.length = Math.floor(description.paths.length / 2);
	}
	description.pathsTruncated = description.paths.length < glyph.shapes.length;
	return description;
}

function assertNoDependents(project, glyph) {
	const collections = [project.glyphs, project.components, project.ligatures];
	const linked = collections.some((collection) =>
		Object.values(collection).some((item) => item.shapes.some((shape) => shape.link === glyph.id))
	);
	if (glyph.usedIn.length || linked)
		fail(
			'DEPENDENT_GLYPHS',
			'This glyph is reused by other glyphs. Agent edits with dependent glyph effects are not supported yet.'
		);
}

function assertMoveAllowed(shape, dx, dy) {
	if (shape.objType !== 'Path')
		fail('UNSUPPORTED_COMPONENT', 'Only ordinary paths can be translated.');
	const controls = shape.pathPoints.flatMap((point) => [point.p, point.h1, point.h2]);
	if (
		(dx && shape.xLock) ||
		(dy && shape.yLock) ||
		controls.some((control) => (dx && control.xLock) || (dy && control.yLock))
	) {
		fail(
			'LOCKED_GEOMETRY',
			'A path or point coordinate is locked. Unlock it in the editor before requesting this edit.'
		);
	}
}

function applyCommand(name, input, glyph) {
	if (name === 'set_spacing') {
		if (input.metric === 'leftSideBearing') {
			if (!glyph.shapes.length)
				fail(
					'EMPTY_GLYPH',
					'An empty glyph has no left outline bearing. Set advanceWidth or add outlines first.'
				);
			const dx = input.value - glyph.leftSideBearing;
			glyph.shapes.forEach((shape) => assertMoveAllowed(shape, dx, 0));
		}
		glyph[input.metric] = input.value;
	} else if (name === 'transform_paths') {
		for (const index of input.pathIndices) {
			const shape = glyph.shapes[index];
			if (!shape) fail('MISSING_PATH', `Path ${index} no longer exists. Read the glyph again.`);
			assertMoveAllowed(shape, input.dx, input.dy);
			shape.updateShapePosition(input.dx, input.dy);
		}
	} else if (name === 'add_paths') {
		for (const path of input.paths) {
			glyph.addOneShape({
				name: path.name,
				pathPoints: path.points.map((point) => ({
					type: 'corner',
					p: { coord: { x: point.x, y: point.y } },
					h1: { coord: point.h1 || { x: point.x, y: point.y }, use: point.h1 !== null },
					h2: { coord: point.h2 || { x: point.x, y: point.y }, use: point.h2 !== null },
				})),
			});
		}
	} else fail('UNKNOWN_TOOL', 'This tool has no native implementation.');
}

function assertGeometry(glyph) {
	if (glyph.shapes.length > 128 || glyph.pointCount > 4096)
		fail(
			'GEOMETRY_LIMIT',
			'This glyph exceeds the agent geometry limit (128 paths / 4096 points).'
		);
	if (glyph.advanceWidth < 0 || glyph.advanceWidth > 32767 || !Number.isFinite(glyph.advanceWidth))
		fail('INVALID_ADVANCE', 'Advance width must stay between 0 and 32767 font units.');
	for (const shape of glyph.shapes) {
		for (const point of shape.pathPoints) {
			for (const control of [point.p, point.h1, point.h2]) {
				if (
					![control.coord.x, control.coord.y].every(
						(value) => Number.isFinite(value) && value >= -32768 && value <= 32767
					)
				)
					fail(
						'GEOMETRY_BOUNDS',
						'The edit would move geometry outside supported font coordinates.'
					);
			}
		}
	}
}

function commandTitle(name, input) {
	if (name === 'set_spacing') return `set ${input.metric} to ${input.value}`;
	if (name === 'transform_paths') return `move ${input.pathIndices.length} paths`;
	return `add ${input.paths.length} paths`;
}
