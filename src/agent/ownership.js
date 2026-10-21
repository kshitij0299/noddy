// --------------------------------------------------------------
// Ownership lock and mutation log (Noddy, M6 #27)
// --------------------------------------------------------------
/*
	The agent must never overwrite the user's work. Every agent write tool
	calls assertAgentMayWrite(editor, id) before it touches a glyph:

	- LOCKED_YOURS: the glyph's status is 'yours' (glyph status store). Only a
	  user action can lift this, through a consent grant minted by UI code.
	- LOCKED_OPEN: the glyph is open in the focus editor. The agent skips it and
	  comes back later, unless the user handed that glyph to the agent.

	Grants are opaque objects kept in a module-private WeakSet. A tool call's
	arguments are JSON from the model, so the model can never produce one:
	consent always comes from UI code calling handToAgent() / grantConsent().

	User actions exposed for the panel and focus editor:
	- handToAgent(editor, id): "Hand to agent" on an open glyph. Lifts the open
	  lock (and the Yours lock: the hand-off is the user's consent) until
	  takeBack().
	- takeBack(editor, id): "Take back". Ends the hand-off.
	- takeOver(editor, id): "Take over" a glyph the agent is drafting. Aborts
	  that glyph's job signal (agentJobSignal), so writes holding it fail with
	  CANCELLED in assertAgentMayWrite; it also ends any hand-off and returns a
	  queued/drafting status to the user. Writes are atomic per glyph, so an
	  aborted job leaves no partial outline.

	The mutation log is in memory, append-only, one per editor. Entries are
	{ ts, tool, id, summary, historyEntryRef }. historyEntryRef is the native
	history entry object (the post-state entry of the write's whole-project
	pair), for receipts that revert one write. readMutationLog returns JSON-safe
	copies that say whether that entry is still in the undo queue.
*/

export const OWNERSHIP_TOPIC = 'agentOwnershipChanged';
export const MUTATION_LOG_LIMIT = 500;

const grants = new WeakSet();
/** @type {WeakMap<Object, Map<String, Object>>} editor -> id -> hand-off grant */
const handOffs = new WeakMap();
/** @type {WeakMap<Object, Map<String, AbortController>>} editor -> id -> job */
const jobs = new WeakMap();
/** @type {WeakMap<Object, Array<Object>>} editor -> log */
const logs = new WeakMap();

const lockError = (code, message, id) => Object.assign(new Error(message), { code, glyphId: id });

function mapFor(store, editor) {
	let map = store.get(editor);
	if (!map) {
		map = new Map();
		store.set(editor, map);
	}
	return map;
}

function publish(editor, data) {
	try {
		editor?.publish?.(OWNERSHIP_TOPIC, data);
	} catch {
		// Ownership changes never fail because a UI subscriber failed.
	}
}

/**
 * The glyph currently open in the focus editor, or null.
 * @param {Object} editor - ProjectEditor
 * @returns {String | null}
 */
export function openGlyphId(editor) {
	if (!editor?.nav?.focus) return null;
	return editor.selectedGlyphID || null;
}

/**
 * Mints a consent grant for one glyph. Call only from UI code, in response to
 * a user action. `scope` lists the locks it lifts: 'open', 'yours' or both.
 * @param {Object} editor
 * @param {String} id
 * @param {{open?: Boolean, yours?: Boolean}} scope
 * @returns {Object} an opaque, frozen grant
 */
export function grantConsent(editor, id, { open = false, yours = false } = {}) {
	if (!editor || typeof id !== 'string' || !id)
		throw new Error('A grant needs an editor and an ID');
	const grant = Object.freeze({ editor, id, open: !!open, yours: !!yours });
	grants.add(grant);
	return grant;
}

/**
 * @param {Object} grant
 * @returns {Boolean} whether this object was minted by grantConsent
 */
export function isGrant(grant) {
	return !!grant && typeof grant === 'object' && grants.has(grant);
}

function grantCovers(grant, editor, id, lock) {
	return isGrant(grant) && grant.editor === editor && grant.id === id && grant[lock] === true;
}

/**
 * Lock state of one glyph, for the panel, read tools and tests.
 * @param {Object} editor
 * @param {String} id
 * @param {{grant?: Object}=} options
 * @returns {{status: String, owner: String, open: Boolean, handedToAgent: Boolean,
 *   locked: null | 'yours' | 'open'}}
 */
export function ownershipOf(editor, id, { grant } = {}) {
	const record = editor?.glyphStatus?.get?.(id) || { status: 'empty', owner: 'user' };
	const handOff = handOffs.get(editor)?.get(id);
	const open = openGlyphId(editor) === id;
	const covers = (lock) =>
		grantCovers(grant, editor, id, lock) || grantCovers(handOff, editor, id, lock);
	let locked = null;
	if (record.status === 'yours' && !covers('yours')) locked = 'yours';
	else if (open && !covers('open')) locked = 'open';
	return {
		status: record.status,
		owner: record.owner,
		open,
		handedToAgent: !!handOff,
		locked,
	};
}

/**
 * Throws a structured error when the agent may not write this glyph.
 * Every agent write tool calls this before it changes anything.
 * @param {Object} editor
 * @param {String} id
 * @param {{grant?: Object, job?: AbortSignal}=} options - a UI-minted grant
 * (never model input) and the agent's job signal for this glyph
 * (agentJobSignal); a job aborted by takeOver() fails with CANCELLED.
 */
export function assertAgentMayWrite(editor, id, options = {}) {
	if (options.job?.aborted) {
		throw lockError('CANCELLED', 'You took this glyph over, so the agent stopped. Skip it.', id);
	}
	const { locked } = ownershipOf(editor, id, options);
	if (locked === 'yours') {
		throw lockError(
			'LOCKED_YOURS',
			'This glyph is Yours. The agent needs your consent to change it. Skip it.',
			id
		);
	}
	if (locked === 'open') {
		throw lockError(
			'LOCKED_OPEN',
			'This glyph is open in the editor. Skip it and come back later.',
			id
		);
	}
}

/**
 * True when the agent may write the glyph (no throw).
 * @param {Object} editor
 * @param {String} id
 * @param {{grant?: Object}=} options
 */
export function agentMayWrite(editor, id, options = {}) {
	return ownershipOf(editor, id, options).locked === null;
}

/**
 * "Hand to agent": the user lets the agent edit an open glyph (and a Yours
 * glyph) until takeBack(). User action only.
 * @param {Object} editor
 * @param {String} id
 * @returns {Object} the hand-off grant
 */
export function handToAgent(editor, id) {
	const grant = grantConsent(editor, id, { open: true, yours: true });
	mapFor(handOffs, editor).set(id, grant);
	publish(editor, { id, action: 'handToAgent' });
	return grant;
}

/**
 * "Take back": ends a hand-off. User action only.
 * @param {Object} editor
 * @param {String} id
 * @returns {Boolean} whether a hand-off ended
 */
export function takeBack(editor, id) {
	const ended = !!handOffs.get(editor)?.delete(id);
	if (ended) publish(editor, { id, action: 'takeBack' });
	return ended;
}

/**
 * Is the glyph handed to the agent right now?
 * @param {Object} editor
 * @param {String} id
 */
export function isHandedToAgent(editor, id) {
	return !!handOffs.get(editor)?.has(id);
}

/**
 * The abort signal of the agent's job on one glyph. Agent write paths check
 * it before committing; takeOver() aborts it.
 * @param {Object} editor
 * @param {String} id
 * @returns {AbortSignal}
 */
export function agentJobSignal(editor, id) {
	const map = mapFor(jobs, editor);
	let job = map.get(id);
	if (!job || job.signal.aborted) {
		job = new AbortController();
		map.set(id, job);
	}
	return job.signal;
}

/**
 * "Take over": the user takes a glyph the agent is drafting. Cancels that
 * glyph's job, ends any hand-off and hands a queued/drafting status back to
 * the user. User action only.
 * @param {Object} editor
 * @param {String} id
 * @returns {{cancelled: Boolean}}
 */
export function takeOver(editor, id) {
	const job = jobs.get(editor)?.get(id);
	const cancelled = !!job && !job.signal.aborted;
	if (cancelled) job.abort('TAKEN_OVER');
	jobs.get(editor)?.delete(id);
	handOffs.get(editor)?.delete(id);
	const status = editor?.glyphStatus?.getStatus?.(id);
	if (status === 'queued' || status === 'drafting') {
		try {
			editor.glyphStatus.clear(id);
		} catch {
			// Status bookkeeping never blocks the user taking a glyph.
		}
	}
	publish(editor, { id, action: 'takeOver', cancelled });
	return { cancelled };
}

// --------------------------------------------------------------
// Mutation log
// --------------------------------------------------------------

/**
 * Appends one agent write. Append-only: entries are frozen and never removed
 * except by the size cap (oldest first).
 * @param {Object} editor
 * @param {{tool: String, id: String, summary: String, historyEntryRef?: Object, ts?: Number}} entry
 * @returns {Object} the frozen entry
 */
export function logAgentWrite(
	editor,
	{ tool, id, summary, historyEntryRef = null, ts = Date.now() }
) {
	if (!editor) throw new Error('The mutation log needs an editor');
	let log = logs.get(editor);
	if (!log) {
		log = [];
		logs.set(editor, log);
	}
	const entry = Object.freeze({
		ts,
		tool: String(tool),
		id: String(id),
		summary: String(summary).slice(0, 200),
		historyEntryRef,
	});
	log.push(entry);
	if (log.length > MUTATION_LOG_LIMIT) log.splice(0, log.length - MUTATION_LOG_LIMIT);
	publish(editor, { id: entry.id, action: 'write', tool: entry.tool });
	return entry;
}

/**
 * Every logged write, oldest first, with live history entry references (for
 * receipts and the panel).
 * @param {Object} editor
 * @returns {ReadonlyArray<Object>}
 */
export function getMutationLog(editor) {
	return Object.freeze([...(logs.get(editor) || [])]);
}

/**
 * JSON-safe copy of the log for the agent's read tool.
 * @param {Object} editor
 * @param {{glyphId?: String | null, limit?: Number}=} options
 */
export function readMutationLog(editor, { glyphId = null, limit = 50 } = {}) {
	const all = logs.get(editor) || [];
	const matching = glyphId ? all.filter((entry) => entry.id === glyphId) : all;
	return {
		total: matching.length,
		entries: matching.slice(-limit).map((entry) => ({
			ts: entry.ts,
			tool: entry.tool,
			id: entry.id,
			summary: entry.summary,
			inHistory:
				!!entry.historyEntryRef && !!editor.history?.queue?.includes(entry.historyEntryRef),
		})),
	};
}
