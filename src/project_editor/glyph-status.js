// --------------------------------------------------------------
// Glyph status store (Noddy)
// --------------------------------------------------------------
/*
	One source of truth for each glyph's review status and owner.
	See docs/agentic/PRODUCT.md (Statuses, Agent output).

	Statuses: empty · queued · drafting · draft · kept · yours · failed
	Owners:   agent · user

	Derived defaults (no stored record for the ID):
		- no item, or an item with no shapes  -> empty  (owner: user)
		- an item with shapes                 -> kept   (owner: user)
	Drawn glyphs without a record are 'kept', not 'yours': we cannot tell
	whether a pre-existing outline was drawn by hand or imported, and 'yours'
	is a lock against the agent. Hand edits should mark a glyph 'yours'
	explicitly through set(id, 'yours', 'user').

	A stored record always wins over the derived default.

	Persistence: NOT in the .gs2 file (no serialization change). Records with
	a persisted status (draft, kept, yours, failed) are mirrored to
	localStorage under `noddy.glyphStatus.<settings.project.id>`. 'queued' and
	'drafting' are run-time only. Every storage access is wrapped in
	try/catch; the store works in memory when storage is unavailable.
	A proposal for carrying status inside .gs2 lives in
	docs/agentic/proposals/GLYPH-STATUS-IN-GS2.md.

	Known limitation: undo/redo does NOT revert status. Whole-project undo
	snapshots come from project.save(), and status lives outside the project.

	Yours lock: set(id, status, 'agent') throws when the glyph is currently
	'yours', unless the caller passes { consent: true } (explicit user consent).

	Changes publish GLYPH_STATUS_TOPIC ('glyphStatusChanged') with
	{ id, status, owner, previousStatus } once per actual change. The topic is
	intentionally not in pub_sub.js `allTopics`, so '*' subscribers (the edit
	canvas redraw) are not triggered by status changes.
*/

export const GLYPH_STATUS_TOPIC = 'glyphStatusChanged';

export const GLYPH_STATUSES = Object.freeze([
	'empty',
	'queued',
	'drafting',
	'draft',
	'kept',
	'yours',
	'failed',
]);

export const GLYPH_STATUS_OWNERS = Object.freeze(['agent', 'user']);

/** Statuses that survive a reload. 'queued' / 'drafting' are run-time only. */
export const PERSISTED_GLYPH_STATUSES = Object.freeze(['draft', 'kept', 'yours', 'failed']);

export const GLYPH_STATUS_STORAGE_PREFIX = 'noddy.glyphStatus.';

const STORAGE_FORMAT_VERSION = 1;

/**
 * Returns window.localStorage, or null when it is missing or access throws.
 * @returns {Storage | null}
 */
function defaultStorage() {
	try {
		return globalThis.localStorage || null;
	} catch {
		return null;
	}
}

export class GlyphStatusStore {
	/**
	 * @param {Object} arg
	 * @param {Function} arg.getProject - returns the current GlyphrStudioProject
	 * @param {Function=} arg.publish - (topic, data) => void
	 * @param {Function=} arg.getStorage - returns a Storage-like object or null
	 * @param {Function=} arg.now - returns a timestamp in ms
	 */
	constructor({ getProject, publish = () => {}, getStorage = defaultStorage, now = Date.now }) {
		this._getProject = getProject;
		this._publish = publish;
		this._getStorage = getStorage;
		this._now = now;
		/** @type {String | false} project ID the records belong to */
		this._projectID = false;
		/** @type {Object<string, {status: string, owner: string, updatedAt: number}>} */
		this._records = {};
	}

	// --------------------------------------------------------------
	// Project binding
	// --------------------------------------------------------------

	get projectID() {
		return this._getProject()?.settings?.project?.id || false;
	}

	get storageKey() {
		const id = this.projectID;
		return id ? GLYPH_STATUS_STORAGE_PREFIX + id : false;
	}

	/**
	 * Loads records for the current project from storage, dropping
	 * whatever was held for a previous project.
	 */
	reload() {
		this._projectID = this.projectID;
		this._records = {};
		const key = this.storageKey;
		if (!key) return;

		let raw = null;
		try {
			raw = this._getStorage()?.getItem(key) ?? null;
		} catch {
			raw = null;
		}
		if (!raw) return;

		let parsed;
		try {
			parsed = JSON.parse(raw);
		} catch {
			return;
		}
		const items = parsed?.items;
		if (!items || typeof items !== 'object') return;

		Object.keys(items).forEach((id) => {
			const rec = items[id];
			if (!rec || !PERSISTED_GLYPH_STATUSES.includes(rec.status)) return;
			if (!GLYPH_STATUS_OWNERS.includes(rec.owner)) return;
			if (rec.status === 'yours' && rec.owner !== 'user') return;
			this._records[id] = {
				status: rec.status,
				owner: rec.owner,
				updatedAt: Number(rec.updatedAt) || 0,
			};
		});
	}

	/** Reloads when the editor's project has changed since the last access. */
	_sync() {
		if (this._projectID !== this.projectID) this.reload();
	}

	_save() {
		const key = this.storageKey;
		if (!key) return;
		const items = {};
		Object.keys(this._records).forEach((id) => {
			const rec = this._records[id];
			if (PERSISTED_GLYPH_STATUSES.includes(rec.status)) items[id] = { ...rec };
		});
		try {
			const storage = this._getStorage();
			if (!storage) return;
			if (Object.keys(items).length) {
				storage.setItem(key, JSON.stringify({ version: STORAGE_FORMAT_VERSION, items }));
			} else {
				storage.removeItem(key);
			}
		} catch {
			// Storage full, blocked or unavailable: keep working in memory.
		}
	}

	// --------------------------------------------------------------
	// Read
	// --------------------------------------------------------------

	/**
	 * Status record for an item ID. Derived records have updatedAt: null.
	 * @param {String} id
	 * @returns {{status: string, owner: string, updatedAt: number | null, derived: boolean}}
	 */
	get(id) {
		this._sync();
		const rec = this._records[id];
		if (rec) return { ...rec, derived: false };
		return { status: this._derive(id), owner: 'user', updatedAt: null, derived: true };
	}

	/**
	 * @param {String} id
	 * @returns {String} status
	 */
	getStatus(id) {
		return this.get(id).status;
	}

	/**
	 * True when the user owns this glyph by hand; the agent must not touch it
	 * without explicit consent.
	 * @param {String} id
	 */
	isYours(id) {
		return this.getStatus(id) === 'yours';
	}

	/**
	 * Count of items per status. Every status key is present.
	 * @param {Array<String>=} ids - items to count (e.g. the character set).
	 * Defaults to every glyph in the project plus any ID with a record.
	 * @returns {Object<string, number>}
	 */
	counts(ids) {
		const result = {};
		GLYPH_STATUSES.forEach((s) => (result[s] = 0));
		this._ids(ids).forEach((id) => result[this.getStatus(id)]++);
		return result;
	}

	/**
	 * IDs that currently have the given status.
	 * @param {String} status
	 * @param {Array<String>=} ids - candidates; same default as counts()
	 * @returns {Array<String>}
	 */
	listByStatus(status, ids) {
		if (!GLYPH_STATUSES.includes(status)) throw new Error(`Unknown glyph status: ${status}`);
		return this._ids(ids).filter((id) => this.getStatus(id) === status);
	}

	// --------------------------------------------------------------
	// Write
	// --------------------------------------------------------------

	/**
	 * Sets the status and owner for an item ID. Setting 'empty' clears the
	 * stored record so the status is derived again.
	 * Publishes GLYPH_STATUS_TOPIC once when something actually changed.
	 * @param {String} id
	 * @param {String} status - one of GLYPH_STATUSES
	 * @param {String} owner - 'agent' | 'user'
	 * @param {Object=} options
	 * @param {Boolean=} options.consent - the user explicitly allowed the agent
	 * to change a 'yours' glyph. Without it, an agent-owned change to a glyph
	 * whose current status is 'yours' throws (like every other rejected input).
	 * User-owned changes are always allowed.
	 * @returns {Boolean} whether anything changed
	 */
	set(id, status, owner, { consent = false } = {}) {
		if (!id || typeof id !== 'string') throw new Error('Glyph status needs an item ID');
		if (!GLYPH_STATUSES.includes(status)) throw new Error(`Unknown glyph status: ${status}`);
		if (!GLYPH_STATUS_OWNERS.includes(owner))
			throw new Error(`Unknown glyph status owner: ${owner}`);
		if (status === 'yours' && owner !== 'user') {
			throw new Error(`Only the user can mark a glyph as 'yours'`);
		}

		this._sync();
		const before = this.get(id);
		if (owner === 'agent' && before.status === 'yours' && consent !== true) {
			throw new Error(`Glyph ${id} is 'yours': the agent needs the user's consent to change it`);
		}

		if (status === 'empty') {
			if (!this._records[id]) return false;
			delete this._records[id];
		} else {
			const prev = this._records[id];
			if (prev && prev.status === status && prev.owner === owner) return false;
			this._records[id] = { status, owner, updatedAt: this._now() };
		}

		const after = this.get(id);
		const changed = before.status !== after.status || before.owner !== after.owner;
		this._save();
		if (changed) {
			this._publish(GLYPH_STATUS_TOPIC, {
				id,
				status: after.status,
				owner: after.owner,
				previousStatus: before.status,
			});
		}
		return changed;
	}

	/**
	 * Removes the stored record so the status is derived again.
	 * @param {String} id
	 * @returns {Boolean} whether anything changed
	 */
	clear(id) {
		return this.set(id, 'empty', 'user');
	}

	// --------------------------------------------------------------
	// Helpers
	// --------------------------------------------------------------

	_derive(id) {
		let item = false;
		try {
			item = this._getProject()?.getItem(id);
		} catch {
			item = false;
		}
		return item?.shapes?.length > 0 ? 'kept' : 'empty';
	}

	_ids(ids) {
		this._sync();
		if (Array.isArray(ids)) return ids;
		const project = this._getProject();
		const all = new Set(Object.keys(project?.glyphs || {}));
		Object.keys(this._records).forEach((id) => all.add(id));
		return [...all];
	}
}
