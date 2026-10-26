import { getCurrentProjectEditor } from '../app/main.js';
import { refreshPanel } from '../panels/panels.js';
import { Glyph } from '../project_data/glyph.js';
import { GlyphrStudioProject } from '../project_data/glyphr_studio_project.js';
import { ioSVG_convertSVGTagsToGlyph } from '../formats_io/svg_outlines/svg_outline_import.js';
import { queueItemChanged } from '../project_editor/item_changed.js';
import { isPreDraft } from '../project_editor/glyph-status.js';
import {
	codePointToGlyphID,
	isInLatinKernel,
	latinKernelAll,
	latinKernelCoverage,
	latinKernelEntry,
} from '../project_editor/charset_latin_kernel.js';
import {
	BLOCKING_ISSUES,
	checkGlyphOutlines,
	contourFingerprint,
	markPreExisting,
} from './outline-check.js';
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
import { readAgentControls } from './agent-controls.js';
import { getChaosOp, runChaos } from './chaos/engine.js';
import { glyphContours, projectCellGrid } from './chaos/project-bridge.js';
import { randomSeed } from './chaos/rng.js';
import { describeMutation, drawCards, telephoneCards } from './remix/deck.js';
import { describeMark } from './remix/describe-mark.js';
import {
	previousTake,
	recordDraw,
	recordTake,
	remixRun,
	siblingTakes,
	tabuFor,
} from './remix/remix-run.js';
import { NOVELTY_LIMIT, changeMask, closestSibling } from './remix/similarity.js';
import {
	READ_ONLY_TOOLS,
	REMIX_LOOP,
	RENDER_IMAGES_PER_REQUEST,
	normalizeToolInput,
	validateToolInput,
} from './tool-definitions.js';

// Tool calls per session. The local agent passes a larger limit (one session per MCP session).
const SESSION_CALL_LIMIT = 64;

let nextSession = 0;
const activeTransactions = new WeakSet();
const agentSnapshots = new WeakSet();
const editorsWithHistoryRefresh = new WeakSet();
/**
 * Status flips per history entry (the post-state entry of an agent job, or of
 * a Keep / Keep all / Revert): the status store lives outside the project, so
 * whole-project undo/redo cannot carry it. `before` / `after` are records as
 * GlyphStatusStore.get() returns them.
 * @type {WeakMap<Object, {changes: Array<{id: String, before: Object, after: Object}>, state: 'applied' | 'undone'}>}
 */
const jobStatusEntries = new WeakMap();
const copy = (value) => JSON.parse(JSON.stringify(value));
const jsonSize = (value) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const fail = (code, message, details) => {
	throw Object.assign(new Error(message), { code, ...(details ? { details } : {}) });
};
// Glyph jobs (M6 #26): create_glyph / begin_glyph open a private draft, the
// draft tools edit it, submit_glyph validates and commits it as one entry.
const JOB_TOOLS = [
	'create_glyph',
	'begin_glyph',
	'submit_glyph',
	'replace_paths',
	'delete_paths',
	'add_svg_path',
	'copy_paths',
	'boolean_paths',
	'apply_chaos',
	'draw_cards',
];
// Legacy write tools edit the job's draft when a job is open for their glyph.
const DRAFT_TOOLS = ['set_spacing', 'transform_paths', 'add_paths'];
const MAX_JOBS = 8;
// op_history keeps this many moves per job (the oldest drop off).
const MAX_MOVES = 24;
const cloneGlyph = (glyph) => {
	const clone = new Glyph(copy(glyph.save(true)));
	clone.wasCreatedThisSession = glyph.wasCreatedThisSession;
	return clone;
};
const abortIfNeeded = (signal) => {
	if (signal?.aborted) fail('CANCELLED', 'The request was stopped.');
};

/**
 * One request, one captured editor and glyph. No global editor swapping, no
 * arbitrary property writes, and no model-controlled permissions. The UI should
 * create a new session per Send and retain the last one for its inline Undo.
 * `grantOpen: false` (the local agent bridge) skips the Send-time hand-off below: an
 * external agent has no Send, so the open glyph stays LOCKED_OPEN.
 * `consentFor(id)` (the Chaos tab, PR C) returns a UI-minted grant (grantConsent) for a glyph
 * the user applied a chaos tool to; it is never reachable from model input. `historyLabel`
 * names the submit's undo step ("Chaos · A" instead of "Agent · A").
 */
export function createNativeToolSession({
	getEditor = getCurrentProjectEditor,
	makeCanvas,
	jobScope,
	grantOpen = true,
	renderLimit = RENDER_IMAGES_PER_REQUEST,
	callLimit = SESSION_CALL_LIMIT,
	consentFor,
	historyLabel = 'Agent',
} = {}) {
	const editor = getEditor();
	const project = editor?.project;
	if (!project) fail('NO_PROJECT', 'Open a project before asking the agent to edit.');
	const glyphId = editor.nav?.page === 'Characters' ? editor.selectedItemID : null;
	// Sending a request from the focus editor names the open glyph: that Send
	// is the user's hand-off for this request only (open lock, not Yours).
	// The grant is UI-minted here; the model can never create one.
	const requestGrant =
		grantOpen && glyphId && openGlyphId(editor) === glyphId
			? grantConsent(editor, glyphId, { open: true })
			: undefined;
	// The agent's job on the bound glyph. "Take over" aborts it, and every
	// later write of this session then fails (CANCELLED) at execution time.
	const job = glyphId ? agentJobSignal(editor, glyphId) : undefined;
	const boundJobSignal = job;
	const renderBudget = { used: 0, limit: renderLimit, external: !grantOpen };
	// An external (local) agent has no Send button: its messages never say "Send".
	const external = !grantOpen;
	const sessionId = `agent-${++nextSession}`;
	let revision = 0;
	let lastState;
	let lastHead;
	let disposed = false;
	let lastEdit;
	const completedCalls = new Map();
	/** @type {Map<String, {id: String, create: Boolean, candidate: Glyph, base: String | null, signal: AbortSignal}>} */
	const jobs = new Map();
	// The Send-time grant covers only the glyph bound to this request.
	const grantFor = (id) =>
		(id === glyphId ? requestGrant : undefined) ??
		(typeof consentFor === 'function' ? consentFor(id) : undefined);
	// A run job (M7) may write only the glyph(s) the run queued for it.
	const scope = Array.isArray(jobScope) ? new Set(jobScope) : null;
	function assertInJobScope(id) {
		if (scope && !scope.has(id))
			fail('OUT_OF_SCOPE', `This run job draws ${[...scope].map(glyphChar).join(' ')} only.`);
	}

	function assertActive() {
		if (disposed)
			fail(
				'SESSION_CLOSED',
				external
					? 'This tool session ended. Call get_context to start a new one.'
					: 'Send a new request to start a session.'
			);
		if (getEditor() !== editor || editor.project !== project) {
			fail(
				'PROJECT_CHANGED',
				external
					? 'The project changed. Call get_context and read the glyphs again.'
					: 'The project changed. Send a new request for the current project.'
			);
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
			// The panel's Mode, Chaos and Target chips (PR B): the same for MCP clients.
			...readAgentControls(editor),
			// A local agent has no system prompt from Noddy: it reads the Remix loop here (the
			// built-in agent gets the same text in its instructions, server/agent/agent.js).
			...(external && readAgentControls(editor).mode !== 'exact' ? { remixLoop: REMIX_LOOP } : {}),
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
				...(error.details ? { details: error.details } : {}),
			},
			...(context ? { context } : {}),
		};
	}

	/**
	 * Runs one tool call. Returns the result, or a Promise of it for boolean_paths (its
	 * geometry library loads on first use); callers await either.
	 */
	function execute(name, input, options = {}) {
		if (name === 'boolean_paths') return executeBoolean(input, options);
		if (name === 'apply_chaos') return executeChaos(input, options);
		return executeNow(name, input, options);
	}

	// apply_chaos (PR C): the engine runs (and may load paper.js) on each glyph's base outline
	// first; the job tool then applies each result only if that base is still what it ran on.
	async function executeChaos(rawInput, options) {
		let prepared;
		try {
			if (validateToolInput('apply_chaos', rawInput).valid && !disposed) {
				const input = normalizeToolInput('apply_chaos', rawInput);
				prepared = await prepareChaos(input);
			}
		} catch (error) {
			prepared = { error };
		}
		return executeNow('apply_chaos', rawInput, { ...options, prepared });
	}

	/** What apply_chaos starts from for one glyph: before-draft, the open draft, or the font. */
	function chaosBase(id, base) {
		if (base === 'before-draft') {
			const record = editor.glyphStatus?.get?.(id);
			if (record?.status === 'draft' && isPreDraft(record.preDraft))
				return {
					glyph: record.preDraft.glyph ? new Glyph(copy(record.preDraft.glyph)) : null,
					key: 'pre',
				};
		}
		const glyph = glyphFor(id);
		return { glyph, key: glyph ? JSON.stringify(glyph.save()) : '' };
	}

	async function prepareChaos(input) {
		const op = getChaosOp(input.op);
		const metrics = fontMetrics(project);
		const controls = readAgentControls(editor);
		const seed = input.seed ?? Math.floor(Math.random() * 999999) + 1;
		const chaos = input.chaos ?? controls.chaos;
		const breakRules = input.breakRules === true && controls.mode === 'wild';
		const grid = op?.needsGrid ? projectCellGrid(project, input.glyphIds) : null;
		const results = new Map();
		for (const id of input.glyphIds) {
			const { glyph, key } = chaosBase(id, input.base);
			let result;
			try {
				result = await runChaos({
					op: input.op,
					contours: glyphContours(glyph),
					glyphId: id,
					seed,
					chaos,
					params: input.params ?? {},
					metrics,
					grid,
					breakRules,
				});
			} catch (error) {
				result = {
					ok: false,
					error: { code: error.code || 'CHAOS_FAILED', message: error.message },
				};
			}
			results.set(id, { key, result });
		}
		return { results, breakRules, guard: breakRules ? 'off' : 'on' };
	}

	// The boolean runs on a snapshot of the draft before the synchronous tool path; the job
	// tool then applies it only if the draft is still that snapshot.
	async function executeBoolean(rawInput, options) {
		let prepared;
		try {
			if (validateToolInput('boolean_paths', rawInput).valid) {
				const input = normalizeToolInput('boolean_paths', rawInput);
				const job = jobs.get(input.glyphId);
				if (job) {
					const candidate = job.candidate;
					prepared = { candidate, contours: await computeBoolean(candidate, input) };
				}
			}
		} catch (error) {
			prepared = { candidate: jobs.get(rawInput?.glyphId)?.candidate, error };
		}
		return executeNow('boolean_paths', rawInput, { ...options, prepared });
	}

	function executeNow(name, rawInput, { callId, signal, prepared } = {}) {
		try {
			assertActive();
			abortIfNeeded(signal);
			const validation = validateToolInput(name, rawInput);
			if (!validation.valid) fail('INVALID_ARGUMENTS', validation.error);
			// Optional means optional: absent nullable fields become null.
			const input = normalizeToolInput(name, rawInput);
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
			if (completedCalls.size >= callLimit)
				fail('SESSION_LIMIT', 'This session reached its tool-call limit.');
			const context = getContext();
			let result;
			if (name === 'get_context') {
				result = { ok: true, context };
			} else if (name === 'read_glyphs') {
				let remainingPoints = 512;
				const glyphs = input.glyphIds.map((id) => {
					// A glyph with an open job in this session reads as its draft (#68).
					const glyph = glyphFor(id);
					if (!glyph) return { glyphId: id, exists: false };
					const includePaths = input.includePaths === true && glyph.pointCount <= remainingPoints;
					if (includePaths) remainingPoints -= glyph.pointCount;
					return {
						...describeGlyph(glyph, includePaths, Math.floor(112000 / input.glyphIds.length)),
						source: jobs.has(id) ? 'draft' : 'font',
					};
				});
				result = { ok: true, context, glyphs };
			} else if (name === 'describe_mark') {
				result = describeMarkTool(input, context);
			} else if (name === 'op_history') {
				result = opHistory(input, context);
			} else if (READ_ONLY_TOOLS.includes(name)) {
				// The envelope's ok always wins: a payload field can never fail a step.
				result = {
					...readTool(name, input, {
						editor,
						project,
						makeCanvas,
						renderBudget,
						glyphFor,
						draftCheck,
					}),
					ok: true,
				};
			} else if (
				JOB_TOOLS.includes(name) ||
				(DRAFT_TOOLS.includes(name) && jobs.has(input.glyphId))
			) {
				result = runJobTool(name, input, context, signal, prepared);
			} else {
				assertInJobScope(input.glyphId);
				if (!context.writable || input.glyphId !== glyphId) {
					fail(
						'OUT_OF_SCOPE',
						external
							? 'Direct edits need the glyph selected in Noddy. Edit other glyphs through a glyph job: begin_glyph or create_glyph, then submit_glyph.'
							: 'Edits are limited to the glyph selected when you sent this request. Select the intended character and send again.'
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
					commit(glyphId, candidate, `Agent: ${commandTitle(name, input)}`, signal);
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

	// ----------------------------------------------------------
	// Glyph jobs: a detached draft per glyph, one history entry per submit
	// ----------------------------------------------------------

	// The glyph tools read: the job's draft when this session has one open, else the font's.
	function glyphFor(id) {
		return jobs.get(id)?.candidate ?? project.glyphs[id] ?? null;
	}

	/**
	 * The gate's view of a draft: every issue, marked preExisting when the glyph had it before
	 * the job, and the issues that would reject submit_glyph.
	 */
	function draftCheck(id) {
		const job = jobs.get(id);
		if (!job) return null;
		const metrics = fontMetrics(project);
		const check = checkGlyphOutlines(job.candidate, metrics);
		const base = job.create ? null : job.baseGlyph;
		// Pre-existing means in THIS glyph before the job: a contour copied in from another
		// glyph (copy_paths) is always new, even if it matches one the glyph had.
		const copied = new Set(job.copied || []);
		const issues = markPreExisting(
			job.candidate,
			check.issues,
			base,
			base ? checkGlyphOutlines(base, metrics).issues : []
		).map((issue) =>
			issue.preExisting &&
			Number.isInteger(issue.pathIndex) &&
			copied.has(contourFingerprint(job.candidate.shapes[issue.pathIndex]))
				? { ...issue, preExisting: false }
				: issue
		);
		const blocking = issues.filter(
			(issue) => BLOCKING_ISSUES.includes(issue.code) && !issue.preExisting
		);
		return { check: { ...check, issues }, blocking };
	}

	function runJobTool(name, input, context, signal, prepared) {
		if (input.expectedRevision !== context.revision) {
			fail('STALE_REVISION', 'The font or selection changed. Read the glyph again before editing.');
		}
		if (name === 'create_glyph') {
			assertInJobScope(codePointToGlyphID(input.codePoint));
			return createJob(input, context);
		}
		if (name === 'begin_glyph') {
			assertInJobScope(input.glyphId);
			return beginJob(input.glyphId, context);
		}
		if (name === 'apply_chaos') return applyChaos(input, context, signal, prepared);
		if (name === 'draw_cards') {
			assertInJobScope(input.glyphId);
			return drawCardsJob(input, context);
		}
		const job = jobs.get(input.glyphId);
		if (!job) fail('NO_JOB', 'Start a glyph job with begin_glyph or create_glyph first.');
		assertJobLive(job);
		if (name === 'submit_glyph') return submitJob(job, input, context, signal);
		// Edit a copy so a failed command leaves the draft as it was.
		const next = cloneGlyph(job.candidate);
		const before = next.shapes.length;
		let added;
		if (name === 'copy_paths') {
			if (input.sourceGlyphId === input.glyphId && !jobs.has(input.sourceGlyphId))
				fail('NO_JOB', 'Start a glyph job with begin_glyph or create_glyph first.');
			assertInSet(project, [input.sourceGlyphId]);
			added = copyPathsInto(next, glyphFor(input.sourceGlyphId), input);
			job.copied = [
				...(job.copied || []),
				...added.map((index) => contourFingerprint(next.shapes[index])),
			];
		} else if (name === 'boolean_paths') {
			if (!prepared || prepared.candidate !== job.candidate)
				fail('DRAFT_CHANGED', 'The draft changed while the boolean ran. Call boolean_paths again.');
			if (prepared.error) throw prepared.error;
			added = applyBoolean(next, input, prepared.contours);
		} else applyDraftCommand(name, input, next, project);
		assertGeometry(next);
		abortIfNeeded(signal);
		recordMove(job, name, input, job.candidate);
		job.candidate = next;
		return {
			ok: true,
			context,
			job: describeJob(job),
			glyph: describeGlyph(next, false),
			...(added
				? { newPathIndices: added }
				: name === 'add_paths' || name === 'add_svg_path'
				? { newPathIndices: range(before, next.shapes.length) }
				: {}),
		};
	}

	/** apply_chaos, the synchronous half: each glyph's result becomes its job's draft. */
	function applyChaos(input, context, signal, prepared) {
		if (!prepared) fail('CHAOS_UNAVAILABLE', 'The chaos engine could not run. Try again.');
		if (prepared.error) {
			if (prepared.error.code) throw prepared.error;
			fail('CHAOS_UNAVAILABLE', 'The chaos engine could not load. Try again.');
		}
		const results = [];
		for (const id of input.glyphIds) {
			try {
				abortIfNeeded(signal);
				assertInJobScope(id);
				assertInSet(project, [id]);
				const entry = prepared.results.get(id);
				if (!entry)
					fail('CHAOS_UNAVAILABLE', 'This glyph was not prepared. Call apply_chaos again.');
				if (chaosBase(id, input.base).key !== entry.key)
					fail(
						'DRAFT_CHANGED',
						'The glyph changed while the chaos tool ran. Call apply_chaos again.'
					);
				const { result } = entry;
				if (!result.ok)
					fail(
						result.error.code,
						jobs.get(id)?.remix && result.error.code === 'GUARD_REJECTED'
							? `${result.error.message} This card does not suit this glyph: skip it and play the next one.`
							: result.error.message
					);
				if (!jobs.has(id)) beginJob(id, context);
				const job = jobs.get(id);
				assertJobLive(job);
				const next = cloneGlyph(job.candidate);
				next._shapes = [];
				for (const data of chaosShapeData(result.contours, input.op)) next.addOneShape(data);
				next.changed();
				assertGeometry(next);
				recordMove(job, 'apply_chaos', { ...input, landedSeed: result.seed }, job.candidate);
				job.candidate = next;
				// A take that began from before its Draft (draw_cards re-roll) stays one.
				job.fromPreDraft = job.fromPreDraft === true || input.base === 'before-draft';
				results.push({
					glyphId: id,
					ok: true,
					seed: result.seed,
					chaos: result.chaos,
					rerolled: result.rerolled,
					attempts: result.attempts,
					job: describeJob(job),
				});
			} catch (error) {
				results.push({
					glyphId: id,
					ok: false,
					error: {
						code: error.code || 'CHAOS_FAILED',
						message: error.message || 'The tool failed.',
					},
				});
			}
		}
		const applied = results.filter((result) => result.ok);
		if (!applied.length)
			fail(
				results[0]?.error?.code || 'CHAOS_FAILED',
				results[0]?.error?.message || 'Nothing was applied.',
				{ results }
			);
		return {
			ok: true,
			context,
			op: input.op,
			guard: prepared.guard,
			results,
			next: 'Look with render_glyphs, then submit_glyph each glyph to land it as a Draft (one undo step each).',
		};
	}

	// ----------------------------------------------------------
	// Remix mode (PR D): cards, the move log and its regret, describe_mark
	// ----------------------------------------------------------

	/** A draft edit inside a job, for op_history (`before` is the draft it replaced). */
	function recordMove(job, tool, input, before) {
		job.moves ??= [];
		const card =
			tool === 'apply_chaos'
				? job.remix?.cards.find((item) => item.op === input.op && item.seed === input.seed)
				: null;
		job.moves.push({
			index: job.moves.length,
			tool,
			card: card?.id ?? null,
			summary: moveSummary(tool, input),
			before,
			reverted: false,
			reason: '',
		});
		if (job.moves.length > MAX_MOVES) job.moves.shift();
	}

	function describeMove(move) {
		return {
			index: move.index,
			tool: move.tool,
			card: move.card,
			summary: move.summary,
			reverted: move.reverted,
			...(move.reason ? { reason: move.reason } : {}),
		};
	}

	function drawCardsJob(input, context) {
		const controls = readAgentControls(editor);
		if (controls.mode === 'exact')
			fail(
				'MODE_EXACT',
				'Cards are for Remix and Wild. In Exact, follow the reference faithfully; the user switches the mode in the panel.'
			);
		const id = input.glyphId;
		assertInSet(project, [id]);
		const run = remixRun(editor);
		// A re-roll of this run's Remix Draft starts from the glyph before that Draft.
		const record = editor.glyphStatus?.get?.(id);
		const reroll =
			run.takes.has(id) &&
			record?.status === 'draft' &&
			isPreDraft(record.preDraft) &&
			Boolean(record.preDraft.glyph);
		beginJob(id, context);
		const job = jobs.get(id);
		if (reroll) {
			const start = new Glyph(copy(record.preDraft.glyph));
			start.wasCreatedThisSession = job.candidate.wasCreatedThisSession;
			job.candidate = start;
			job.fromPreDraft = true;
		}
		const seed = input.seed ?? randomSeed();
		const tabu = tabuFor(run, id);
		const previous = controls.telephone ? previousTake(run, id) : null;
		const options = {
			seed,
			glyphId: id,
			count: input.count ?? undefined,
			chaos: controls.chaos,
			mode: controls.mode,
			tabu,
			mark: run.mark,
		};
		const deal = previous?.kept?.length
			? telephoneCards({ ...options, previous: previous.kept, from: previous.glyphId })
			: drawCards(options);
		recordDraw(run, id, { seed, cards: deal.cards });
		job.remix = {
			seed,
			cards: deal.cards,
			start: glyphContours(job.candidate),
			telephone: deal.telephone ?? null,
		};
		job.moves = [];
		return {
			ok: true,
			context,
			glyphId: id,
			seed,
			startedFrom: reroll ? 'before-draft' : 'current',
			cards: deal.cards.map((card) => ({
				id: card.id,
				title: card.title,
				idea: card.idea,
				params: card.params,
				play: card.play,
			})),
			tabu: deal.tabu,
			...(deal.tabuRelaxed ? { tabuRelaxed: true } : {}),
			...(deal.telephone
				? {
						telephone: {
							from: glyphChar(deal.telephone.from),
							mutation: describeMutation(deal.telephone.mutation),
						},
				  }
				: {}),
			...(run.mark ? { reference: run.mark.summary } : {}),
			job: describeJob(job),
			next: 'Play each card (its play input plus expectedRevision), render_glyphs, then op_history revert one move and say why, then submit_glyph.',
		};
	}

	function opHistory(input, context) {
		const job = jobs.get(input.glyphId);
		if (!job) fail('NO_JOB', 'Start a glyph job with draw_cards or begin_glyph first.');
		assertJobLive(job);
		job.moves ??= [];
		let reverted = null;
		if (input.revert === true) {
			const active = job.moves.filter((item) => !item.reverted);
			const move = active.at(-1);
			if (!move) fail('NO_MOVE', 'This job has no move left to revert.');
			// The regret drops one move of several: the only move left stays (else nothing lands).
			if (active.length === 1 && job.remix)
				fail(
					'LAST_MOVE',
					'This is the only move left, so keep it: play another card first if you want to regret one, or submit_glyph as it is.'
				);
			job.candidate = move.before;
			move.reverted = true;
			move.reason = input.reason ? String(input.reason).trim().slice(0, 200) : '';
			reverted = describeMove(move);
		}
		return {
			ok: true,
			context,
			glyphId: input.glyphId,
			moves: job.moves.map(describeMove),
			...(reverted
				? {
						reverted,
						next: 'Look again with render_glyphs if you like, then submit_glyph and say why you kept the rest.',
				  }
				: {}),
			job: describeJob(job),
		};
	}

	function describeMarkTool(input, context) {
		assertInSet(project, [input.glyphId]);
		const glyph = glyphFor(input.glyphId);
		if (!glyph) fail('GLYPH_MISSING', 'This glyph has no outlines yet.');
		const marked = new Set(input.pathIndices);
		const mark = [];
		const rest = [];
		for (const index of input.pathIndices)
			if (!glyph.shapes[index])
				fail('MISSING_PATH', `Path ${index} does not exist. Read the glyph again.`);
		glyph.shapes.forEach((shape, index) => {
			if (shape.objType !== 'Path')
				fail('UNSUPPORTED_COMPONENT', 'describe_mark works on ordinary paths only.');
			(marked.has(index) ? mark : rest).push(...glyphContours({ shapes: [shape] }));
		});
		const measured = describeMark(mark, rest, fontMetrics(project));
		if (!measured) fail('EMPTY_MARK', 'These paths enclose no ink to measure.');
		remixRun(editor).mark = { ...measured, glyphId: input.glyphId, pathIndices: input.pathIndices };
		return {
			ok: true,
			context,
			glyphId: input.glyphId,
			source: jobs.has(input.glyphId) ? 'draft' : 'font',
			mark: measured,
			next: "This is the run's reference mark: draw_cards starts slashes, gashes and kicks from its angle and width. Re-express it on each glyph's anatomy; never paste it.",
		};
	}

	/**
	 * Novelty pressure in Remix and Wild: what this take changed must not look like what a
	 * sibling's take changed. Returns the take's change mask (null when not checked).
	 */
	function assertNovel(job, controls) {
		if (controls.mode === 'exact' || job.create) return null;
		const start = job.remix?.start ?? glyphContours(job.baseGlyph);
		const mask = changeMask(start, glyphContours(job.candidate));
		const closest = closestSibling(mask, siblingTakes(remixRun(editor), job.id));
		if (closest && closest.similarity >= NOVELTY_LIMIT)
			fail(
				'TOO_SIMILAR',
				`This take changes ${glyphChar(job.id)} the way ${glyphChar(
					closest.glyphId
				)} was changed (${Math.round(closest.similarity * 100)}% alike), so nothing was written. Make it this glyph's own: draw_cards again with another seed (seed + 1), or revert a move with op_history and play another.`,
				{ sibling: closest.glyphId, similarity: closest.similarity, limit: NOVELTY_LIMIT }
			);
		return mask;
	}

	// Read at execution time: a Take over or a newly opened glyph stops the job.
	function assertJobLive(job) {
		if (job.signal.aborted) {
			jobs.delete(job.id);
			fail('CANCELLED', 'You took this glyph over, so the agent stopped. The draft was discarded.');
		}
		assertAgentMayWrite(editor, job.id, { grant: grantFor(job.id), job: job.signal });
	}

	function openJob(id, candidate, create, context) {
		if (!jobs.has(id) && jobs.size >= MAX_JOBS)
			fail('JOB_LIMIT', `Submit an open glyph job first (at most ${MAX_JOBS} at once).`);
		const job = {
			id,
			create,
			candidate,
			base: create ? null : JSON.stringify(project.glyphs[id].save()),
			// The glyph as it was when the job began: the gate's reference for preExisting.
			baseGlyph: create ? null : cloneGlyph(project.glyphs[id]),
			// The bound glyph keeps the session's signal, so a Take over before
			// begin_glyph still cancels; other glyphs get their current signal.
			signal: id === glyphId ? boundJobSignal : agentJobSignal(editor, id),
		};
		const restarted = jobs.has(id);
		jobs.set(id, job);
		return { ok: true, context, glyphId: id, restarted, job: describeJob(job) };
	}

	function createJob(input, context) {
		const id = codePointToGlyphID(input.codePoint);
		if (!id || !isInLatinKernel(id))
			fail('OUT_OF_SET', "Not in this font's character set (Latin Kernel).");
		if (project.glyphs[id]) fail('GLYPH_EXISTS', 'This glyph exists. Use begin_glyph to edit it.');
		assertAgentMayWrite(editor, id, {
			grant: grantFor(id),
			job: id === glyphId ? boundJobSignal : undefined,
		});
		// Same starting state as the native auto-create (new Glyph({ id })),
		// but kept off the project until submit: never getItem(id, true).
		return openJob(id, new Glyph({ id }), true, context);
	}

	function beginJob(id, context) {
		assertInSet(project, [id]);
		const before = project.glyphs[id];
		if (!before) fail('GLYPH_MISSING', 'This glyph does not exist yet. Use create_glyph.');
		assertAgentMayWrite(editor, id, {
			grant: grantFor(id),
			job: id === glyphId ? boundJobSignal : undefined,
		});
		assertNoDependents(project, before);
		if (before.shapes.some((shape) => shape.objType !== 'Path')) {
			fail(
				'UNSUPPORTED_COMPONENT',
				'Agent edits to glyphs containing component instances are not supported yet.'
			);
		}
		return openJob(id, cloneGlyph(before), false, context);
	}

	function submitJob(job, input, context, signal) {
		if (lastState.length > 8_000_000)
			fail(
				'PROJECT_TOO_LARGE',
				'This project exceeds the first version’s native history snapshot limit.'
			);
		if (activeTransactions.has(editor))
			fail('EDITOR_BUSY', 'Another native command is editing this project.');
		const current = project.glyphs[job.id];
		const stale = job.create
			? Boolean(current)
			: !current || JSON.stringify(current.save()) !== job.base;
		if (stale) {
			jobs.delete(job.id);
			fail('JOB_STALE', 'This glyph changed since the job began. Begin the job again.');
		}
		if (current) assertNoDependents(project, current);
		const candidate = job.candidate;
		assertGeometry(candidate);
		// New structural problems reject; ones the glyph already had (the user's own outlines,
		// e.g. a deliberately self-crossing slash) and extents are warnings.
		const { check, blocking } = draftCheck(job.id);
		const warnings = check.issues.filter((issue) => !blocking.includes(issue));
		if (blocking.length) {
			fail(
				'INVALID_OUTLINES',
				'The draft has new outline problems, so nothing was written. Each issue has a hint; fix them and submit again.',
				{ issues: blocking.slice(0, 32) }
			);
		}
		abortIfNeeded(signal);
		if (!job.create && JSON.stringify(candidate.save()) === job.base) {
			jobs.delete(job.id);
			return { ok: true, changed: false, context, glyph: describeGlyph(current, false), warnings };
		}
		// Remix and Wild: a take that repeats a sibling's change is rejected (job stays open).
		const mask = assertNovel(job, readAgentControls(editor));
		// Re-check right before commit: the lock state is read at execution time.
		assertJobLive(job);
		const char = glyphChar(job.id);
		commit(job.id, candidate, `${historyLabel} · ${char}`, signal, { create: job.create });
		jobs.delete(job.id);
		try {
			const store = editor.glyphStatus;
			const before = store?.get(job.id);
			// The outline before the agent drew it, for Revert (a redraw of a
			// Draft keeps the first snapshot inside the store).
			// A chaos re-roll from before the Draft (apply_chaos base 'before-draft') keeps the
			// first snapshot, so Undo goes back to the glyph before any chaos.
			const keep = job.fromPreDraft && before?.status === 'draft' && isPreDraft(before.preDraft);
			const preDraft = keep ? before.preDraft : { glyph: job.create ? null : JSON.parse(job.base) };
			// assertJobLive passed, so a Yours glyph here carries the user's consent.
			store?.set(job.id, 'draft', 'agent', { consent: true, preDraft });
			if (before)
				jobStatusEntries.set(editor.history.queue[0], {
					changes: [{ id: job.id, before, after: store.get(job.id) }],
					state: 'applied',
				});
		} catch {
			// Status bookkeeping never undoes a committed edit.
		}
		const remix = mask ? recordRemixTake(job, mask) : null;
		const note = input.note ? String(input.note).trim() : '';
		logAgentWrite(editor, {
			tool: 'submit_glyph',
			id: job.id,
			summary: `${job.create ? 'create' : 'edit'} ${char}${note ? `: ${note}` : ''}`,
			historyEntryRef: editor.history.queue[0],
		});
		const result = {
			ok: true,
			changed: true,
			created: job.create,
			context: getContext(),
			glyph: describeGlyph(project.glyphs[job.id], false),
			warnings,
			undoAvailable: true,
			...(remix ? { remix } : {}),
		};
		lastEdit = { entry: editor.history.queue[0], state: lastState };
		return result;
	}

	/** After a Remix submit: the run remembers the take; the result reports it. */
	function recordRemixTake(job, mask) {
		const moves = job.moves || [];
		const kept = moves.filter((move) => !move.reverted);
		const regrets = moves.filter((move) => move.reverted);
		const cards = job.remix?.cards || [];
		const keptCards = kept
			.map((move) => cards.find((card) => card.id === move.card))
			.filter(Boolean)
			.map((card) => ({ id: card.id, params: card.params }));
		recordTake(remixRun(editor), job.id, {
			seed: job.remix?.seed ?? null,
			cards: cards.map((card) => card.id),
			kept: keptCards,
			regret: regrets.map(describeMove),
			mask,
		});
		if (!job.remix) return null;
		return {
			seed: job.remix.seed,
			cards: cards.map((card) => card.id),
			kept: kept.map((move) => move.card || move.summary),
			regret: regrets.map((move) => ({ move: move.card || move.summary, reason: move.reason })),
			...(regrets.length
				? {}
				: {
						nudge: 'Regret rule: before submitting the next glyph, revert one move with op_history and say why you kept the rest.',
				  }),
		};
	}

	function commit(targetId, candidate, title, signal, { create = false } = {}) {
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
		const originalGlyph = project.glyphs[targetId];
		// Only the selected glyph is on screen: its panel and selection follow
		// the new native objects. Any other glyph changes without touching the
		// user's selection, view or focus.
		const isSelected = Boolean(originalGlyph) && editor.selectedItemID === targetId;
		const rangeCounts = project.settings.project.characterRanges.map((range) => range.count);
		const rangeTotal = project.settings.project.characterRanges.length;
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
			if (create) {
				// The native creation path, inside this transaction's entry.
				project.addItemByType(candidate, 'Glyph', targetId);
			} else {
				candidate.parent = project;
				project.glyphs[targetId] = candidate;
			}
			candidate.changed();
			if (isSelected) {
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
			}
			history.addWholeProjectChangePostState();
			captureHistorySnapshot(history.queue[0], project);
			abortIfNeeded(signal);
			if (isSelected) {
				editor.publish('currentItem', candidate);
				// Inspector change handlers capture native object references. Rebuild
				// the panel after replacing a glyph, not just its displayed values.
				refreshPanel();
			} else {
				// Tiles and the specimen re-fetch by ID; nothing else moves.
				queueItemChanged(editor, targetId);
			}
			// The native pre-state hook autosaves the old state; run the same
			// native hook after successful commit so autosave contains the edit.
			history.updateAfterSaveState();
		} catch (error) {
			if (originalGlyph) project.glyphs[targetId] = originalGlyph;
			else delete project.glyphs[targetId];
			const ranges = project.settings.project.characterRanges;
			ranges.length = rangeTotal;
			rangeCounts.forEach((count, index) => (ranges[index].count = count));
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
				if (isSelected) {
					editor.publish('currentItem', originalGlyph);
					refreshPanel();
				}
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
		/** Glyph IDs with an unsubmitted job (dropped by dispose). */
		get openJobs() {
			return [...jobs.keys()];
		},
		dispose: () => {
			disposed = true;
			completedCalls.clear();
			// An unsubmitted draft is thrown away: nothing was written.
			jobs.clear();
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
	const limit = renderBudget.limit ?? RENDER_IMAGES_PER_REQUEST;
	if (renderBudget.used >= limit)
		fail(
			'RENDER_LIMIT',
			renderBudget.external
				? `This tool session already rendered ${limit} images.`
				: `This request already rendered ${limit} images. Finish with what you have; the user can send a follow-up.`
		);
	renderBudget.used++;
}

function readTool(
	name,
	input,
	{
		editor,
		project,
		makeCanvas,
		renderBudget,
		glyphFor = (id) => project.glyphs[id] || null,
		draftCheck = () => null,
	}
) {
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
	// Glyphs with an open job in this session are shown as their drafts (#68).
	const draftsOf = (ids) => [...new Set(ids)].filter((id) => id && draftCheck(id));
	if (name === 'render_glyphs') {
		assertInSet(
			project,
			input.glyphIds.filter((id) => !draftCheck(id))
		);
		const items = input.glyphIds.map((id) => ({ glyphId: id, glyph: glyphFor(id) }));
		useRenderBudget(renderBudget);
		return {
			...renderRow({
				project,
				items,
				height: input.height ?? undefined,
				guides: input.guides ?? true,
				gap: Math.round(project.settings.font.upm * 0.1),
				makeCanvas,
			}),
			drafts: draftsOf(input.glyphIds),
		};
	}
	if (name === 'render_text') {
		const ids = [...input.text].map((char) => codePointToGlyphID(char.codePointAt(0)));
		// Like the specimen: characters outside the set render as ghost boxes
		// and are listed, rather than failing the whole line.
		const outside = [...input.text].filter(
			(char, index) => !ids[index] || (!isInSet(project, ids[index]) && !draftCheck(ids[index]))
		);
		const items = ids.map((id) => ({
			glyphId: id || 'glyph-0x0',
			glyph: (id && glyphFor(id)) || null,
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
			drafts: draftsOf(ids),
		};
	}
	if (name === 'check_outlines') {
		const draft = draftCheck(input.glyphId);
		if (draft) {
			const glyph = glyphFor(input.glyphId);
			return {
				glyphId: input.glyphId,
				exists: true,
				source: 'draft',
				char: latinKernelEntry(input.glyphId)?.char ?? null,
				componentCount: 0,
				...draft.check,
				pathCount: glyph.shapes.length,
				// What submit_glyph would do now: only new structural problems reject.
				submitWouldPass: draft.blocking.length === 0,
			};
		}
		assertInSet(project, [input.glyphId]);
		const glyph = project.glyphs[input.glyphId];
		if (!glyph)
			return { glyphId: input.glyphId, exists: false, clean: true, issues: [], contours: [] };
		return {
			glyphId: input.glyphId,
			exists: true,
			char: latinKernelEntry(input.glyphId)?.char ?? null,
			source: 'font',
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
			const replaced = previousProject;
			previousProject = editor.project;
			if (getCurrentProjectEditor() === editor) refreshPanel();
			// A whole-project undo/redo publishes currentItem for the selected
			// item only. Announce every glyph whose data differs, so tiles and
			// the specimen redraw an agent job's glyph that is not selected.
			for (const id of changedItemIds(replaced, editor.project)) queueItemChanged(editor, id);
			// History publishes before it moves the entries between its queues.
			queueMicrotask(() => syncJobStatus(editor));
		},
	});
	editorsWithHistoryRefresh.add(editor);
}

/**
 * After a whole-project undo or redo, put the statuses an entry changed back
 * (undo) or apply them again (redo): an agent job's Draft, a Keep, a Revert.
 * Only the entry just undone (head of the redo queue) or just redone (head of
 * the undo queue) is touched.
 */
function syncJobStatus(editor) {
	const store = editor.glyphStatus;
	if (!store) return;
	const undone = jobStatusEntries.get(editor.history.redoQueue[0]?.[0]);
	const redone = jobStatusEntries.get(editor.history.queue[0]);
	try {
		if (undone?.state === 'applied') {
			undone.state = 'undone';
			for (const change of undone.changes) store.restore(change.id, change.before);
		} else if (redone?.state === 'undone') {
			redone.state = 'applied';
			for (const change of redone.changes) store.restore(change.id, change.after);
		}
	} catch {
		// Status bookkeeping never blocks undo or redo.
	}
}

// --------------------------------------------------------------
// Review commits (M7 #29): Keep, Keep all, Revert, Revert run
// --------------------------------------------------------------

/**
 * One history entry for a review action, made by a user action in the UI
 * (never by a model tool). Replaces the listed glyphs with the given data
 * (a forward commit, not history time travel) and sets the listed statuses.
 * Undo / redo of the entry puts both the outlines and the statuses back.
 * Same transaction shape as an agent job: a whole-project pre/post pair with
 * detached snapshots, rolled back fully on error.
 * @param {Object} editor - ProjectEditor
 * @param {Object} change
 * @param {String} change.title - history title, e.g. 'Keep · 22 glyphs'
 * @param {Object<String, Object | null>=} change.glyphs - id → Glyph save()
 *   data to put back, or null for an empty outline
 * @param {Array<{id: String, record: Object}>=} change.statuses - records to
 *   set (as GlyphStatusStore.get() returns them)
 * @returns {{ok: true, entry: Object} | {ok: false, error: {code: String, message: String}}}
 */
export function commitReview(editor, { title, glyphs = {}, statuses = [] }) {
	const project = editor?.project;
	if (!project)
		return { ok: false, error: { code: 'NO_PROJECT', message: 'Open a project first.' } };
	if (activeTransactions.has(editor))
		return {
			ok: false,
			error: { code: 'EDITOR_BUSY', message: 'Another edit is in progress. Try again.' },
		};
	const history = editor.history;
	const queue = [...history.queue];
	const redoQueue = [...history.redoQueue];
	const initialProject = history.initialProject;
	const projectSaved = editor.projectSaved;
	const documentTitle = document.title;
	const store = editor.glyphStatus;
	const originals = {};
	const detached = [];
	const ids = Object.keys(glyphs).filter((id) => project.glyphs[id]);
	const selectedChanged = ids.includes(editor.selectedItemID);
	const shapeSelection = [...editor.multiSelect.shapes.members];
	const pointSelection = [...editor.multiSelect.points.members];
	const applied = [];
	activeTransactions.add(editor);
	try {
		ensureHistoryPanelRefresh(editor);
		if (history.initialProject === project) history.initialProject = snapshot(project);
		for (const entry of [...queue, ...redoQueue.flat()]) {
			if (!agentSnapshots.has(entry) && entry.itemState === project) {
				detached.push(entry);
				entry.itemState = snapshot(project);
			}
		}
		history.addWholeProjectChangePreState(title);
		captureHistorySnapshot(history.queue[0], project);
		for (const id of ids) {
			const original = project.glyphs[id];
			originals[id] = original;
			const data = glyphs[id] ? copy(glyphs[id]) : { id };
			const candidate = new Glyph({ ...data, id });
			candidate.wasCreatedThisSession = original.wasCreatedThisSession;
			candidate.parent = project;
			project.glyphs[id] = candidate;
			candidate.changed();
		}
		if (selectedChanged) {
			editor.multiSelect.shapes.members = [];
			editor.multiSelect.points.members = [];
		}
		history.addWholeProjectChangePostState();
		captureHistorySnapshot(history.queue[0], project);
		const changes = [];
		for (const { id, record } of statuses) {
			const before = store?.get(id);
			if (!store || !before) continue;
			store.restore(id, record);
			applied.push({ id, before });
			changes.push({ id, before, after: store.get(id) });
		}
		if (changes.length) jobStatusEntries.set(history.queue[0], { changes, state: 'applied' });
		for (const id of ids) {
			if (id === editor.selectedItemID) {
				editor.publish('currentItem', project.glyphs[id]);
				if (getCurrentProjectEditor() === editor) refreshPanel();
			} else queueItemChanged(editor, id);
		}
		history.updateAfterSaveState();
		return { ok: true, entry: history.queue[0] };
	} catch (error) {
		for (const id of Object.keys(originals)) project.glyphs[id] = originals[id];
		for (const { id, before } of applied.reverse()) store.restore(id, before);
		history.queue = queue;
		history.redoQueue = redoQueue;
		history.initialProject = initialProject;
		editor.projectSaved = projectSaved;
		document.title = documentTitle;
		editor.multiSelect.shapes.members = shapeSelection;
		editor.multiSelect.points.members = pointSelection;
		for (const entry of detached) entry.itemState = project;
		return {
			ok: false,
			error: {
				code: error.code || 'REVIEW_FAILED',
				message: error.message || 'The change failed.',
			},
		};
	} finally {
		activeTransactions.delete(editor);
	}
}

function changedItemIds(before, after) {
	const ids = [];
	for (const group of ['glyphs', 'components', 'ligatures']) {
		const a = before?.[group] || {};
		const b = after?.[group] || {};
		for (const id of new Set([...Object.keys(a), ...Object.keys(b)])) {
			if (!a[id] || !b[id] || JSON.stringify(a[id].save()) !== JSON.stringify(b[id].save()))
				ids.push(id);
		}
	}
	return ids;
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
		const shapes = input.pathIndices.map((index) => {
			const shape = glyph.shapes[index];
			if (!shape) fail('MISSING_PATH', `Path ${index} no longer exists. Read the glyph again.`);
			return shape;
		});
		applyTransform(shapes, input);
	} else if (name === 'add_paths') {
		for (const path of input.paths) glyph.addOneShape(contourShape(path));
	} else fail('UNKNOWN_TOOL', 'This tool has no native implementation.');
}

function contourShape(path) {
	return {
		name: path.name,
		pathPoints: path.points.map((point) => ({
			type: 'corner',
			p: { coord: { x: point.x, y: point.y } },
			h1: { coord: point.h1 || { x: point.x, y: point.y }, use: point.h1 !== null },
			h2: { coord: point.h2 || { x: point.x, y: point.y }, use: point.h2 !== null },
		})),
	};
}

function pathIndicesOrAll(glyph, indices) {
	const list = indices ?? glyph.shapes.map((_, index) => index);
	for (const index of list) {
		const shape = glyph.shapes[index];
		if (!shape) fail('MISSING_PATH', `Path ${index} no longer exists. Read the glyph again.`);
		assertUnlocked(shape);
	}
	return list;
}

function assertUnlocked(shape) {
	if (shape.objType !== 'Path')
		fail('UNSUPPORTED_COMPONENT', 'Only ordinary paths can be changed.');
	const controls = shape.pathPoints.flatMap((point) => [point.p, point.h1, point.h2]);
	if (
		shape.xLock ||
		shape.yLock ||
		shape.wLock ||
		shape.hLock ||
		controls.some((control) => control.xLock || control.yLock)
	) {
		fail(
			'LOCKED_GEOMETRY',
			'A path or point coordinate is locked. Unlock it in the editor before requesting this edit.'
		);
	}
}

/** Draft-only commands (replace_paths, delete_paths, add_svg_path) and the legacy ones. */
function applyDraftCommand(name, input, glyph, project) {
	if (name === 'delete_paths') {
		const remove = new Set(pathIndicesOrAll(glyph, input.pathIndices));
		glyph._shapes = glyph.shapes.filter((_, index) => !remove.has(index));
		glyph.changed();
	} else if (name === 'replace_paths') {
		const indices = pathIndicesOrAll(glyph, input.pathIndices);
		const remove = new Set(indices);
		const at = indices.length ? Math.min(...indices) : glyph.shapes.length;
		const kept = glyph.shapes.filter((_, index) => !remove.has(index));
		const before = kept.filter((shape) => glyph.shapes.indexOf(shape) < at);
		const after = kept.filter((shape) => glyph.shapes.indexOf(shape) > at);
		glyph._shapes = [];
		const added = input.paths.map((path) => glyph.addOneShape(contourShape(path)));
		glyph._shapes = [...before, ...added, ...after];
		glyph.changed();
	} else if (name === 'add_svg_path') {
		const svg = `<svg xmlns="http://www.w3.org/2000/svg"><path d="${input.d}"/></svg>`;
		let imported;
		try {
			imported = ioSVG_convertSVGTagsToGlyph(svg, false, project.settings.font.upm);
		} catch {
			imported = null;
		}
		if (!imported?.shapes.length)
			fail('INVALID_SVG', 'The SVG path data has no drawable contours.');
		if (imported.shapes.length > 16) fail('GEOMETRY_LIMIT', 'Use at most 16 contours per call.');
		// SVG is y-down. Mirror about baselineY / 2 (y -> baselineY - y) and fix
		// contour direction, exactly as SVG paste does (events_drag_drop_paste.js).
		const baseline = input.baselineY ?? project.settings.font.ascent;
		imported.flipNS(baseline / 2);
		imported.reverseWinding();
		const start = glyph.shapes.length;
		imported.shapes.forEach((shape, index) => {
			const data = copy(shape.save());
			data.name = `SVG ${start + index + 1}`;
			glyph.addOneShape(data);
		});
	} else applyCommand(name, input, glyph);
}

const rad = (degrees) => (degrees * Math.PI) / 180;
const round = (value) => Math.round(value * 1000) / 1000;

/** scale, skew, rotate and flip about one origin, as a 2x2 matrix. */
function linearMatrix({ scaleX, scaleY, skewX, skewY, rotate, flip }) {
	const multiply = (m, n) => [
		m[0] * n[0] + m[1] * n[2],
		m[0] * n[1] + m[1] * n[3],
		m[2] * n[0] + m[3] * n[2],
		m[2] * n[1] + m[3] * n[3],
	];
	let m = [scaleX ?? 1, 0, 0, scaleY ?? 1];
	m = multiply([1, Math.tan(rad(skewX ?? 0)), Math.tan(rad(skewY ?? 0)), 1], m);
	const angle = rad(rotate ?? 0);
	m = multiply([Math.cos(angle), -Math.sin(angle), Math.sin(angle), Math.cos(angle)], m);
	const fx = flip === 'horizontal' || flip === 'both' ? -1 : 1;
	const fy = flip === 'vertical' || flip === 'both' ? -1 : 1;
	return multiply([fx, 0, 0, fy], m);
}

/** transform_paths / copy_paths: the linear part about the pivot, then the move. */
function applyTransform(shapes, input) {
	applyLinearTransform(shapes, input);
	const dx = input.dx ?? 0;
	const dy = input.dy ?? 0;
	for (const shape of shapes) {
		assertMoveAllowed(shape, dx, dy);
		shape.updateShapePosition(dx, dy);
	}
}

function applyLinearTransform(shapes, input) {
	const m = linearMatrix(input);
	if (m[0] === 1 && m[1] === 0 && m[2] === 0 && m[3] === 1) return;
	const determinant = m[0] * m[3] - m[1] * m[2];
	if (Math.abs(determinant) < 1e-6)
		fail('INVALID_TRANSFORM', 'This transform collapses the paths.');
	let origin = input.origin;
	if (!origin) {
		const bounds = shapes.map((shape) => shape.maxes);
		const xMin = Math.min(...bounds.map((b) => b.xMin));
		const xMax = Math.max(...bounds.map((b) => b.xMax));
		const yMin = Math.min(...bounds.map((b) => b.yMin));
		const yMax = Math.max(...bounds.map((b) => b.yMax));
		// 'baseline-center' pivots on the baseline (y = 0) below the centre.
		origin = { x: (xMin + xMax) / 2, y: input.pivot === 'baseline-center' ? 0 : (yMin + yMax) / 2 };
	}
	for (const shape of shapes) {
		assertUnlocked(shape);
		for (const point of shape.pathPoints) {
			for (const control of [point.p, point.h1, point.h2]) {
				const x = control.coord.x - origin.x;
				const y = control.coord.y - origin.y;
				control.coord.x = round(origin.x + m[0] * x + m[1] * y);
				control.coord.y = round(origin.y + m[2] * x + m[3] * y);
			}
		}
		// A mirror reverses contour direction; reverse the points back, as
		// Path.flipNS / flipEW do, so counters stay counters.
		if (determinant < 0) shape.reverseWinding();
		shape.changed();
	}
}

const range = (start, end) => Array.from({ length: end - start }, (_, index) => start + index);
const MAX_COPY_PATHS = 32;

/**
 * copy_paths: appends copies of the source's contours to the draft (locks cleared: the source
 * is only read), transformed about the copies' own bounds. Returns the new path indices.
 */
function copyPathsInto(draft, source, input) {
	if (!source) fail('GLYPH_MISSING', 'The source glyph has no outlines yet.');
	const indices = input.sourcePathIndices ?? source.shapes.map((_, index) => index);
	if (!indices.length) fail('MISSING_PATH', 'The source glyph has no paths to copy.');
	if (indices.length > MAX_COPY_PATHS)
		fail(
			'GEOMETRY_LIMIT',
			`Copy at most ${MAX_COPY_PATHS} paths per call; list sourcePathIndices in batches.`
		);
	const start = draft.shapes.length;
	const copies = indices.map((index) => {
		const shape = source.shapes[index];
		if (!shape) fail('MISSING_PATH', `The source has no path ${index}. Read it again.`);
		if (shape.objType !== 'Path')
			fail('UNSUPPORTED_COMPONENT', 'Only ordinary paths can be copied, not component instances.');
		const data = copy(shape.save());
		for (const key of ['xLock', 'yLock', 'wLock', 'hLock']) delete data[key];
		for (const point of data.pathPoints || []) {
			for (const part of ['p', 'h1', 'h2']) {
				if (point[part]) {
					delete point[part].xLock;
					delete point[part].yLock;
				}
			}
		}
		return draft.addOneShape(data);
	});
	applyTransform(copies, input);
	return range(start, draft.shapes.length);
}

function booleanSides(glyph, input) {
	const subject = input.pathIndices;
	const clip = input.withPathIndices ?? [];
	if (!clip.length && input.operation !== 'union')
		fail(
			'INVALID_ARGUMENTS',
			`${input.operation} needs withPathIndices. Only union works on one set (it untangles it).`
		);
	if (subject.some((index) => clip.includes(index)))
		fail('INVALID_ARGUMENTS', 'pathIndices and withPathIndices must not share a path.');
	const shapes = (list) =>
		list.map((index) => {
			const shape = glyph.shapes[index];
			if (!shape) fail('MISSING_PATH', `Path ${index} no longer exists. Read the glyph again.`);
			assertUnlocked(shape);
			if (shape.pathPoints.length < 2)
				fail('TOO_FEW_POINTS', `Path ${index} has too few points to combine. Delete it first.`);
			return shape;
		});
	return { subject: shapes(subject), clip: shapes(clip), indices: [...subject, ...clip] };
}

/** boolean_paths, the asynchronous half: paper.js runs on the draft as it is now. */
async function computeBoolean(glyph, input) {
	const { subject, clip } = booleanSides(glyph, input);
	let booleanContours;
	try {
		({ booleanContours } = await import('./path-boolean.js'));
	} catch {
		fail('BOOLEAN_UNAVAILABLE', 'The boolean engine could not load. Try again.');
	}
	try {
		return await booleanContours({ operation: input.operation, subject, clip });
	} catch (error) {
		if (error?.code) throw error;
		fail('BOOLEAN_FAILED', 'These contours could not be combined. Check them with check_outlines.');
	}
}

/**
 * boolean_paths, the synchronous half: the result replaces every listed contour, inserted at
 * the lowest listed index; outer contours run clockwise and counters the other way.
 */
function applyBoolean(glyph, input, contours) {
	const { indices } = booleanSides(glyph, input);
	const remove = new Set(indices);
	const at = Math.min(...indices);
	const before = glyph.shapes.filter((shape, index) => index < at && !remove.has(index));
	const after = glyph.shapes.filter((shape, index) => index > at && !remove.has(index));
	glyph._shapes = [];
	const added = contours.map((contour, index) => {
		const shape = glyph.addOneShape(
			contourShape({ name: `${input.operation} ${index + 1}`, points: contour.points })
		);
		// Glyphr's findWinding: negative = clockwise (outer, y up).
		const outer = contour.depth % 2 === 0;
		const winding = shape.findWinding();
		if ((outer && winding > 0) || (!outer && winding < 0)) shape.reverseWinding();
		return shape;
	});
	glyph._shapes = [...before, ...added, ...after];
	glyph.changed();
	return range(before.length, before.length + added.length);
}

const round2 = (value) => Math.round(value * 100) / 100;

function chaosShapeData(contours, op) {
	return contours.map((contour, index) =>
		contourShape({
			name: `${op} ${index + 1}`,
			points: contour.points.map((point) => ({
				x: round2(point.x),
				y: round2(point.y),
				h1: point.h1 ? { x: round2(point.h1.x), y: round2(point.h1.y) } : null,
				h2: point.h2 ? { x: round2(point.h2.x), y: round2(point.h2.y) } : null,
			})),
		})
	);
}

function glyphChar(id) {
	const entry = latinKernelEntry(id);
	if (entry?.char) return entry.char;
	const codePoint = parseInt(id.slice('glyph-'.length), 16);
	return Number.isInteger(codePoint) ? String.fromCodePoint(codePoint) : id;
}

function describeJob(job) {
	return {
		glyphId: job.id,
		char: glyphChar(job.id),
		creating: job.create,
		pathCount: job.candidate.shapes.length,
		pointCount: job.candidate.pointCount,
		advanceWidth: job.candidate.advanceWidth,
	};
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

/** One line per move for op_history. */
function moveSummary(tool, input) {
	if (tool === 'apply_chaos') return `apply_chaos ${input.op} seed ${input.landedSeed ?? input.seed}`;
	if (tool === 'transform_paths' || tool === 'set_spacing' || tool === 'add_paths')
		return commandTitle(tool, input);
	if (tool === 'copy_paths') return `copy_paths from ${glyphChar(input.sourceGlyphId)}`;
	if (tool === 'boolean_paths') return `boolean_paths ${input.operation}`;
	if (tool === 'replace_paths') return `replace_paths ${input.paths.length} paths`;
	if (tool === 'delete_paths') return `delete_paths ${input.pathIndices.length} paths`;
	return tool;
}

function commandTitle(name, input) {
	if (name === 'set_spacing') return `set ${input.metric} to ${input.value}`;
	if (name === 'transform_paths') {
		const linear = ['scaleX', 'scaleY', 'skewX', 'skewY', 'rotate', 'flip'].some(
			(key) => input[key] !== null && input[key] !== undefined
		);
		return `${linear ? 'transform' : 'move'} ${input.pathIndices.length} paths`;
	}
	return `add ${input.paths.length} paths`;
}
