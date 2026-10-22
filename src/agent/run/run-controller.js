// --------------------------------------------------------------
// Run orchestration (M7 #28): plan → spec gate → n o H O → style gate → queue
// --------------------------------------------------------------
/*
	A run is whole-set work. States:

	  idle      nothing proposed
	  plan      gate 1: the Plan card (plan + spec + spend cap) waits for
	            Start or Adjust. Nothing is drawn until Start.
	  controls  drafting the control glyphs n o H O
	  style     gate 2: "Approve the style" waits for Approve, Tweak or Edit
	            by hand. Nothing else is drawn until Approve.
	  drafting  the queue, one glyph job at a time (Queued → Drafting → Draft)
	  paused    Pause finished the current glyph, or the spend cap was reached
	  stopped   Stop: the unfinished draft is discarded, queued glyphs return
	            to what they were; finished drafts stay Drafts
	  done      the queue is empty

	Only explicit calls change the state. Esc, minimizing the panel, hiding it
	or opening a glyph never reach this module, so they can never stop a run.

	Each glyph is one agent job through `draft()` (the panel wires it to the
	agent controller with a job scoped to that glyph), so each glyph is one
	history entry, lands as Draft, and is never Kept automatically. Yours
	glyphs are skipped; a glyph open in the editor is skipped and tried once
	more at the end of the queue (ownership.js).

	A "Before run" checkpoint (history head + the status of every glyph in the
	run) is recorded at Start; review.js revertRun() uses it.
*/
import { ownershipOf } from '../ownership.js';
import { keepGlyphs } from './review.js';
import { RUN_GROUPS, runOrder } from './run-order.js';
import { DEFAULT_SPEND_CAP, formatDollars } from './spend.js';

export const RUN_STATES = Object.freeze([
	'idle',
	'plan',
	'controls',
	'style',
	'drafting',
	'paused',
	'stopped',
	'done',
]);

/** States in which a run is in progress (not finished, not stopped). */
export const ACTIVE_RUN_STATES = Object.freeze(['plan', 'controls', 'style', 'drafting', 'paused']);

/** Statuses the queue drafts. Kept, Yours, Draft and in-flight glyphs are left alone. */
export const QUEUEABLE_STATUSES = Object.freeze(['empty', 'failed']);

/**
 * Spec proposal from the project's metrics (gate 1).
 * @param {Object} project
 * @returns {Array<{key: String, label: String, value: Number}>}
 */
export function proposeSpec(project) {
	const font = project?.settings?.font || {};
	const upm = Number(font.upm) || 1000;
	const num = (value, fallback) => {
		const n = Number(value);
		return Number.isFinite(n) && n !== 0 ? Math.round(n) : fallback;
	};
	return [
		{ key: 'xHeight', label: 'x-height', value: num(font.xHeight, Math.round(upm * 0.5)) },
		{ key: 'capHeight', label: 'cap', value: num(font.capHeight, Math.round(upm * 0.7)) },
		{ key: 'stems', label: 'stems', value: Math.round(upm * 0.088) },
		{ key: 'overshoot', label: 'overshoot', value: num(font.overshoot, Math.round(upm * 0.012)) },
	];
}

/**
 * @param {Object} options
 * @param {() => Object} options.getEditor - ProjectEditor
 * @param {(job: Object) => Promise<{ok: Boolean, cost?: Number, created?: Boolean,
 *   error?: {code?: String, message?: String}}>} options.draft - draws ONE glyph:
 *   { id, char, group, signal, brief, spec, note, controls }
 * @param {(event: Object) => void} [options.onEvent]
 */
export function createRunController({ getEditor, draft, onEvent = () => {} }) {
	/** @type {Object | null} */
	let run = null;
	let pumping = false;

	const emit = (type, data = {}) => {
		try {
			onEvent({ type, ...data, run: view() });
		} catch {
			// A UI listener never breaks the run.
		}
	};

	function view() {
		if (!run) return { state: 'idle' };
		return {
			state: run.state,
			glyph: run.current?.char || '',
			done: run.done,
			total: run.total,
			spent: run.spent,
			cap: run.cap,
			pauseReason: run.pauseReason,
			failed: [...run.failed],
			drawn: Object.keys(run.drawn),
		};
	}

	function setState(state, extra = {}) {
		run.state = state;
		emit('state', extra);
	}

	const store = () => getEditor()?.glyphStatus;

	/** Puts back the status a glyph had before the run queued it (only while
	 * the run still owns it: a glyph the user made Yours meanwhile stays Yours). */
	function restorePrior(id) {
		const prior = run.prior.get(id);
		const s = store();
		if (!s || !['queued', 'drafting'].includes(s.getStatus(id))) return;
		try {
			s.restore(id, prior || { status: 'empty', owner: 'user', derived: true });
		} catch {
			// Status bookkeeping never breaks the run.
		}
	}

	function markQueued(item) {
		const s = store();
		if (!s) return;
		if (!run.prior.has(item.id)) run.prior.set(item.id, s.get(item.id));
		try {
			s.set(item.id, 'queued', 'agent');
		} catch {
			// A Yours glyph is skipped when its turn comes.
		}
	}

	// ----------------------------------------------------------
	// Gate 1: the plan
	// ----------------------------------------------------------

	/**
	 * Proposes a plan for whole-set work. The run waits at the Plan card.
	 * @param {Object} options
	 * @param {String} options.brief - the user's words
	 * @param {'letters' | 'all'} [options.scope]
	 * @param {Number} [options.spendCap]
	 * @param {Array} [options.attachments] - reference files sent with each job
	 * @returns {Object} the plan
	 */
	function propose({
		brief = '',
		scope = 'letters',
		spendCap = DEFAULT_SPEND_CAP,
		attachments = [],
	} = {}) {
		if (run && ['controls', 'drafting'].includes(run.state))
			throw new Error('A run is drafting. Pause or stop it first.');
		const editor = getEditor();
		const project = editor?.project;
		if (!project) throw new Error('Open a project before starting a run.');
		const s = editor.glyphStatus;
		const order = runOrder(scope);
		const glyphs = order.filter((item) => {
			const status = s ? s.getStatus(item.id) : 'empty';
			// Controls always pass the style gate, drawn or not.
			return item.group === 'controls' || QUEUEABLE_STATUSES.includes(status);
		});
		const groups = RUN_GROUPS.filter((group) =>
			glyphs.some((item) => item.group === group.id)
		).map((group, index) => ({ id: group.id, label: group.label, selected: index === 0 }));
		const plan = {
			brief: String(brief).slice(0, 2000),
			attachments: Array.isArray(attachments) ? attachments.slice() : [],
			scope,
			spec: proposeSpec(project),
			groups,
			glyphs,
			spendCap,
			spendLabel: `up to ${formatDollars(spendCap)}`,
		};
		run = newRecord(plan, 'plan');
		emit('plan', { plan });
		emit('state');
		return plan;
	}

	function newRecord(plan, state) {
		return {
			state,
			plan,
			queue: [],
			current: null,
			done: 0,
			total: 0,
			spent: 0,
			cap: plan.spendCap,
			pauseRequested: false,
			pauseReason: null,
			drawn: {},
			failed: new Set(),
			prior: new Map(),
			deferred: new Set(),
			rows: new Map(),
			note: '',
			checkpoint: null,
			resumeState: null,
		};
	}

	/** Adjust: the plan waits for the user's next message (re-propose). */
	function adjust() {
		if (run?.state !== 'plan') return false;
		setState('idle');
		return true;
	}

	/**
	 * Start (passes gate 1): records the "Before run" checkpoint, queues the
	 * glyphs and drafts the control glyphs.
	 */
	function start() {
		if (run?.state !== 'plan') return Promise.resolve(false);
		const editor = getEditor();
		const s = editor.glyphStatus;
		const statuses = {};
		for (const item of run.plan.glyphs) if (s) statuses[item.id] = s.get(item.id);
		run.checkpoint = {
			label: 'Before run',
			historyRef: editor.history?.queue?.[0] || null,
			historyLength: editor.history?.queue?.length || 0,
			statuses,
			at: Date.now(),
		};
		emit('checkpoint', { checkpoint: run.checkpoint });
		const controls = run.plan.glyphs.filter((item) => item.group === 'controls');
		const toDraw = controls.filter((item) =>
			QUEUEABLE_STATUSES.includes(s ? s.getStatus(item.id) : 'empty')
		);
		run.total = run.plan.glyphs.filter(
			(item) => item.group !== 'controls' || toDraw.includes(item)
		).length;
		run.queue = toDraw.slice();
		run.queue.forEach(markQueued);
		setState('controls');
		return pump();
	}

	// ----------------------------------------------------------
	// Gate 2: the style
	// ----------------------------------------------------------

	/** Approve: the control glyphs are Kept (one entry) and the queue runs. */
	function approve() {
		if (run?.state !== 'style') return Promise.resolve(false);
		const editor = getEditor();
		const controls = run.plan.glyphs.filter((item) => item.group === 'controls');
		const result = keepGlyphs(
			editor,
			controls.map((item) => item.id)
		);
		emit('kept', { ids: result.kept });
		const rest = run.plan.glyphs.filter(
			(item) =>
				item.group !== 'controls' &&
				QUEUEABLE_STATUSES.includes(editor.glyphStatus?.getStatus(item.id) || 'empty')
		);
		rest.forEach(markQueued);
		// Glyphs retried while the gate was open keep their place after the rest.
		run.queue = [...rest, ...run.queue.filter((item) => !rest.includes(item))];
		setState('drafting');
		return pump();
	}

	/**
	 * Tweak: redraw the control glyphs that are still Drafts with the user's
	 * note, then wait at the style gate again.
	 * @param {String} note
	 */
	function tweak(note = '') {
		if (run?.state !== 'style') return Promise.resolve(false);
		run.note = String(note).slice(0, 2000);
		const s = store();
		const again = run.plan.glyphs.filter(
			(item) =>
				item.group === 'controls' &&
				['draft', 'failed', 'empty'].includes(s ? s.getStatus(item.id) : 'empty')
		);
		run.queue = again.slice();
		run.total += again.length;
		run.queue.forEach((item) => {
			run.prior.set(item.id, s?.get(item.id));
			try {
				s?.set(item.id, 'queued', 'agent');
			} catch {
				// Yours: skipped at its turn.
			}
		});
		setState('controls');
		return pump();
	}

	// ----------------------------------------------------------
	// Pause, resume, stop, retry
	// ----------------------------------------------------------

	/** Pause: the current glyph finishes, then the run waits. */
	function pause() {
		if (!run || !['controls', 'drafting'].includes(run.state)) return false;
		if (run.current) {
			run.pauseRequested = true;
			emit('state', { pausing: true });
		} else {
			pauseNow('user');
		}
		return true;
	}

	function pauseNow(reason) {
		run.pauseRequested = false;
		run.pauseReason = reason;
		run.resumeState = run.state;
		setState('paused');
		emit('paused', { reason, spent: run.spent, cap: run.cap });
	}

	/** Resume after Pause; after the spend cap this is the consent to spend another cap. */
	function resume() {
		if (run?.state !== 'paused') return Promise.resolve(false);
		if (run.pauseReason === 'cap') run.cap += run.plan.spendCap;
		run.pauseReason = null;
		setState(run.resumeState || 'drafting');
		return pump();
	}

	/**
	 * Stop (after the inline "Stop run?" confirm): the unfinished draft is
	 * discarded, queued glyphs return to what they were. Finished drafts stay.
	 */
	function stop() {
		if (!run || !['controls', 'style', 'drafting', 'paused'].includes(run.state)) return false;
		run.queue.forEach((item) => restorePrior(item.id));
		run.queue = [];
		run.pauseRequested = false;
		setState('stopped');
		run.current?.abort.abort('stopped');
		emit('stopped', { done: run.done, total: run.total });
		return true;
	}

	/**
	 * Retry Failed glyphs: they go back on the queue. After a finished or
	 * stopped run (or with no run) they draft right away, with no gates.
	 * @param {Array<String>} ids
	 */
	function retry(ids = []) {
		const s = store();
		const failed = ids.filter((id) => s?.getStatus(id) === 'failed');
		if (!failed.length) return Promise.resolve(false);
		const order = runOrder('all');
		const items = failed.map(
			(id) => order.find((item) => item.id === id) || { id, char: id, group: 'rest' }
		);
		if (!run) {
			const project = getEditor()?.project;
			run = newRecord(
				{
					brief: '',
					scope: 'all',
					spec: proposeSpec(project),
					groups: [],
					glyphs: items,
					spendCap: DEFAULT_SPEND_CAP,
					spendLabel: `up to ${formatDollars(DEFAULT_SPEND_CAP)}`,
				},
				'done'
			);
			run.checkpoint = { label: 'Before run', historyRef: null, statuses: {}, at: Date.now() };
		}
		if (run.checkpoint)
			for (const item of items)
				if (!run.checkpoint.statuses[item.id]) run.checkpoint.statuses[item.id] = s.get(item.id);
		const fresh = items.filter((item) => !run.queue.some((queued) => queued.id === item.id));
		fresh.forEach((item) => run.deferred.delete(item.id));
		run.queue.push(...fresh);
		fresh.forEach(markQueued);
		if (['controls', 'drafting', 'paused', 'style'].includes(run.state)) {
			run.total += fresh.length;
			emit('state');
			return Promise.resolve(true);
		}
		run.total = fresh.length;
		run.done = 0;
		run.pauseReason = null;
		setState('drafting');
		return pump();
	}

	// ----------------------------------------------------------
	// The queue
	// ----------------------------------------------------------

	async function pump() {
		if (pumping) return true;
		pumping = true;
		try {
			while (run && ['controls', 'drafting'].includes(run.state)) {
				if (!run.queue.length) {
					if (run.state === 'controls') {
						const ids = run.plan.glyphs
							.filter((item) => item.group === 'controls')
							.map((item) => item.id);
						setState('style');
						emit('gate', { gate: 'style', ids });
					} else {
						setState('done');
						emit('done', { done: run.done, total: run.total });
					}
					break;
				}
				if (run.pauseRequested) {
					pauseNow('user');
					break;
				}
				if (run.spent >= run.cap) {
					pauseNow('cap');
					break;
				}
				const item = run.queue.shift();
				await processItem(item);
				if (run.state === 'stopped') break;
				flushGroup(item.group);
			}
		} finally {
			pumping = false;
		}
		return true;
	}

	function addRow(item, status) {
		if (item.group === 'controls') return;
		if (!run.rows.has(item.group)) run.rows.set(item.group, []);
		const rows = run.rows.get(item.group);
		const at = rows.findIndex((row) => row.id === item.id);
		const row = { id: item.id, char: item.char, status };
		if (at >= 0) rows[at] = row;
		else rows.push(row);
	}

	/** One receipt per group, when its last queued glyph is done. */
	function flushGroup(group) {
		if (group === 'controls') return;
		if (run.queue.some((item) => item.group === group)) return;
		const rows = run.rows.get(group);
		if (!rows?.length) return;
		run.rows.delete(group);
		emit('group', { group, label: RUN_GROUPS.find((g) => g.id === group)?.label || group, rows });
	}

	async function processItem(item) {
		const editor = getEditor();
		const s = editor?.glyphStatus;
		const lock = editor ? ownershipOf(editor, item.id).locked : null;
		if (lock === 'yours') {
			restorePrior(item.id);
			run.done++;
			emit('progress', { id: item.id, char: item.char, phase: 'skipped', reason: 'yours' });
			return;
		}
		if (lock === 'open') {
			if (!run.deferred.has(item.id)) {
				run.deferred.add(item.id);
				run.queue.push(item);
				emit('progress', { id: item.id, char: item.char, phase: 'deferred', reason: 'open' });
				return;
			}
			restorePrior(item.id);
			run.done++;
			emit('progress', { id: item.id, char: item.char, phase: 'skipped', reason: 'open' });
			return;
		}
		try {
			s?.set(item.id, 'drafting', 'agent');
		} catch {
			// Became Yours between the check and now: skipped below by the lock.
		}
		const abort = new AbortController();
		run.current = { id: item.id, char: item.char, abort };
		emit('progress', { id: item.id, char: item.char, phase: 'drafting' });
		let result;
		try {
			result = await draft({
				id: item.id,
				char: item.char,
				group: item.group,
				signal: abort.signal,
				brief: run.plan.brief,
				attachments: run.plan.attachments || [],
				spec: run.plan.spec,
				note: run.note,
				controls: run.plan.glyphs
					.filter((g) => g.group === 'controls')
					.map((g) => g.id),
			});
		} catch (error) {
			result = { ok: false, error: { code: error?.code, message: error?.message } };
		}
		run.current = null;
		run.spent += Number(result?.cost) || 0;
		const status = s?.getStatus(item.id);
		if (status === 'draft' && result?.ok !== false) {
			const glyph = editor.project.glyphs[item.id];
			run.drawn[item.id] = {
				submitted: glyph ? JSON.stringify(glyph.save()) : '',
				preDraft: s.get(item.id).preDraft || null,
			};
			run.failed.delete(item.id);
			run.done++;
			addRow(item, 'draft');
			emit('progress', { id: item.id, char: item.char, phase: 'draft' });
			return;
		}
		if (abort.signal.aborted || run.state === 'stopped') {
			// Stop: the unfinished draft was never written; put the status back.
			restorePrior(item.id);
			emit('progress', { id: item.id, char: item.char, phase: 'discarded' });
			return;
		}
		const code = result?.error?.code;
		if (code === 'LOCKED_OPEN' && !run.deferred.has(item.id)) {
			run.deferred.add(item.id);
			run.queue.push(item);
			try {
				s?.set(item.id, 'queued', 'agent');
			} catch {
				// Status only.
			}
			emit('progress', { id: item.id, char: item.char, phase: 'deferred', reason: 'open' });
			return;
		}
		if (['LOCKED_YOURS', 'LOCKED_OPEN', 'CANCELLED'].includes(code)) {
			if (s?.getStatus(item.id) === 'drafting') restorePrior(item.id);
			run.done++;
			emit('progress', {
				id: item.id,
				char: item.char,
				phase: 'skipped',
				reason: code === 'LOCKED_YOURS' ? 'yours' : code === 'CANCELLED' ? 'taken' : 'open',
			});
			return;
		}
		try {
			s?.set(item.id, 'failed', 'agent');
		} catch {
			// Yours by now: leave it.
		}
		run.failed.add(item.id);
		run.done++;
		addRow(item, 'failed');
		emit('progress', {
			id: item.id,
			char: item.char,
			phase: 'failed',
			reason: result?.error?.message || 'not drawn',
		});
	}

	return {
		propose,
		adjust,
		start,
		approve,
		tweak,
		pause,
		resume,
		stop,
		retry,
		get state() {
			return run?.state || 'idle';
		},
		get active() {
			return !!run && ACTIVE_RUN_STATES.includes(run.state);
		},
		/** True while a glyph job is in flight. */
		get busy() {
			return !!run?.current;
		},
		get view() {
			return view();
		},
		/** The current run's record (plan, drawn, checkpoint) for review.js. */
		get run() {
			return run;
		},
		/** Tests: resolves once the queue loop is idle. */
		async settle() {
			while (pumping) await new Promise((resolve) => setTimeout(resolve, 0));
		},
	};
}
