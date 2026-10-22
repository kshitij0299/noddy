import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rectPathFromMaxes } from '../../edit_canvas/tools/new_basic_path';
import { GlyphrStudioProject } from '../../project_data/glyphr_studio_project.js';
import {
	GLYPH_STATUS_STORAGE_PREFIX,
	GLYPH_STATUS_TOPIC,
	GLYPH_STATUSES,
	GlyphStatusStore,
} from '../glyph-status.js';
import { ProjectEditor } from '../project_editor.js';

class MemoryStorage {
	constructor() {
		this.data = {};
	}
	getItem(k) {
		return k in this.data ? this.data[k] : null;
	}
	setItem(k, v) {
		this.data[k] = String(v);
	}
	removeItem(k) {
		delete this.data[k];
	}
}

const square = () => rectPathFromMaxes({ xMin: 0, xMax: 10, yMin: 0, yMax: 10 });

/** Minimal project stand-in: glyph-0x41 drawn, glyph-0x42 blank. */
function fakeProject(id) {
	const glyphs = {
		'glyph-0x41': { shapes: [square()] },
		'glyph-0x42': { shapes: [] },
	};
	return {
		settings: { project: { id } },
		glyphs,
		getItem: (itemID) => glyphs[itemID] || false,
	};
}

function makeStore({
	project = fakeProject('p1'),
	storage = new MemoryStorage(),
	publish = vi.fn(),
} = {}) {
	const ref = { project };
	const store = new GlyphStatusStore({
		getProject: () => ref.project,
		publish,
		getStorage: () => storage,
		now: () => 1000,
	});
	return { store, ref, storage, publish };
}

describe('GlyphStatusStore: defaults', () => {
	it('derives empty for missing or blank items and kept for drawn ones', () => {
		const { store } = makeStore();
		expect(store.get('glyph-0x41')).toEqual({
			status: 'kept',
			owner: 'user',
			updatedAt: null,
			derived: true,
		});
		expect(store.getStatus('glyph-0x42')).toBe('empty');
		expect(store.getStatus('glyph-0x43')).toBe('empty');
		expect(store.isYours('glyph-0x41')).toBe(false);
	});

	it('works without a project ID or storage', () => {
		const project = fakeProject(undefined);
		const { store } = makeStore({ project, storage: null });
		expect(store.set('glyph-0x42', 'draft', 'agent')).toBe(true);
		expect(store.getStatus('glyph-0x42')).toBe('draft');
	});
});

describe('GlyphStatusStore: set / get', () => {
	it('stores status, owner and timestamp; a record wins over the derived default', () => {
		const { store } = makeStore();
		store.set('glyph-0x41', 'draft', 'agent');
		expect(store.get('glyph-0x41')).toEqual({
			status: 'draft',
			owner: 'agent',
			updatedAt: 1000,
			derived: false,
		});
		store.set('glyph-0x42', 'failed', 'agent');
		expect(store.getStatus('glyph-0x42')).toBe('failed');
	});

	it('isYours reflects the yours status', () => {
		const { store } = makeStore();
		store.set('glyph-0x41', 'yours', 'user');
		expect(store.isYours('glyph-0x41')).toBe(true);
	});

	it('setting empty clears the record and returns to the derived status', () => {
		const { store } = makeStore();
		store.set('glyph-0x42', 'queued', 'agent');
		store.set('glyph-0x42', 'empty', 'user');
		expect(store.get('glyph-0x42').derived).toBe(true);
		store.set('glyph-0x41', 'draft', 'agent');
		store.clear('glyph-0x41');
		expect(store.getStatus('glyph-0x41')).toBe('kept');
	});

	it('rejects unknown statuses, owners, missing IDs, and agent-owned yours', () => {
		const { store, publish } = makeStore();
		expect(() => store.set('glyph-0x41', 'done', 'agent')).toThrow(/Unknown glyph status/);
		expect(() => store.set('glyph-0x41', 'Draft', 'agent')).toThrow(/Unknown glyph status/);
		expect(() => store.set('glyph-0x41', 'draft', 'robot')).toThrow(/owner/);
		expect(() => store.set('', 'draft', 'agent')).toThrow(/item ID/);
		expect(() => store.set('glyph-0x41', 'yours', 'agent')).toThrow(/yours/);
		expect(() => store.listByStatus('nope')).toThrow(/Unknown glyph status/);
		expect(store.getStatus('glyph-0x41')).toBe('kept');
		expect(publish).not.toHaveBeenCalled();
	});
});

describe('GlyphStatusStore: counts and lists', () => {
	it('counts every status, by default over project glyphs plus records', () => {
		const { store } = makeStore();
		store.set('glyph-0x43', 'queued', 'agent');
		const counts = store.counts();
		expect(Object.keys(counts)).toEqual([...GLYPH_STATUSES]);
		expect(counts).toEqual({
			empty: 1,
			queued: 1,
			drafting: 0,
			draft: 0,
			kept: 1,
			yours: 0,
			failed: 0,
		});
	});

	it('counts and lists over an explicit ID list', () => {
		const { store } = makeStore();
		store.set('glyph-0x41', 'draft', 'agent');
		const ids = ['glyph-0x41', 'glyph-0x42', 'glyph-0x44', 'glyph-0x45'];
		expect(store.counts(ids).empty).toBe(3);
		expect(store.counts(ids).draft).toBe(1);
		expect(store.listByStatus('draft', ids)).toEqual(['glyph-0x41']);
		expect(store.listByStatus('empty')).toEqual(['glyph-0x42']);
	});
});

describe('GlyphStatusStore: pub/sub', () => {
	it('publishes the topic once per actual change, and not for no-ops', () => {
		const { store, publish } = makeStore();
		store.set('glyph-0x42', 'drafting', 'agent');
		expect(publish).toHaveBeenCalledTimes(1);
		expect(publish).toHaveBeenCalledWith(GLYPH_STATUS_TOPIC, {
			id: 'glyph-0x42',
			status: 'drafting',
			owner: 'agent',
			previousStatus: 'empty',
		});
		store.set('glyph-0x42', 'drafting', 'agent');
		store.set('glyph-0x41', 'kept', 'user'); // same as the derived default
		store.clear('glyph-0x43'); // nothing stored
		expect(publish).toHaveBeenCalledTimes(1);
		store.set('glyph-0x42', 'draft', 'agent');
		expect(publish).toHaveBeenCalledTimes(2);
	});

	it('is delivered through ProjectEditor pub/sub', () => {
		const editor = new ProjectEditor();
		const callback = vi.fn();
		editor.subscribe({ topic: GLYPH_STATUS_TOPIC, subscriberID: 'test-tile', callback });
		editor.glyphStatus.set('glyph-0x41', 'queued', 'agent');
		expect(callback).toHaveBeenCalledTimes(1);
		expect(callback.mock.calls[0][0]).toMatchObject({ id: 'glyph-0x41', status: 'queued' });
	});
});

describe('GlyphStatusStore: persistence', () => {
	let storage;
	beforeEach(() => {
		storage = new MemoryStorage();
	});

	it('round-trips draft/kept/yours/failed through storage; queued/drafting are run-time only', () => {
		const { store } = makeStore({ storage });
		store.set('glyph-0x41', 'yours', 'user');
		store.set('glyph-0x42', 'failed', 'agent');
		store.set('glyph-0x43', 'draft', 'agent');
		store.set('glyph-0x44', 'kept', 'agent');
		store.set('glyph-0x45', 'queued', 'agent');
		store.set('glyph-0x46', 'drafting', 'agent');
		expect(storage.getItem(GLYPH_STATUS_STORAGE_PREFIX + 'p1')).toBeTruthy();

		const { store: reloaded } = makeStore({ storage });
		expect(reloaded.get('glyph-0x41')).toMatchObject({
			status: 'yours',
			owner: 'user',
			updatedAt: 1000,
		});
		expect(reloaded.get('glyph-0x42')).toMatchObject({ status: 'failed', owner: 'agent' });
		expect(reloaded.getStatus('glyph-0x43')).toBe('draft');
		expect(reloaded.get('glyph-0x44')).toMatchObject({ status: 'kept', owner: 'agent' });
		expect(reloaded.getStatus('glyph-0x45')).toBe('empty');
		expect(reloaded.getStatus('glyph-0x46')).toBe('empty');
	});

	it('removes the storage key when nothing persisted is left', () => {
		const { store } = makeStore({ storage });
		store.set('glyph-0x42', 'draft', 'agent');
		store.clear('glyph-0x42');
		expect(storage.getItem(GLYPH_STATUS_STORAGE_PREFIX + 'p1')).toBeNull();
	});

	it('ignores corrupt or invalid stored data', () => {
		storage.setItem(GLYPH_STATUS_STORAGE_PREFIX + 'p1', '{not json');
		expect(makeStore({ storage }).store.getStatus('glyph-0x41')).toBe('kept');

		storage.setItem(
			GLYPH_STATUS_STORAGE_PREFIX + 'p1',
			JSON.stringify({
				version: 1,
				items: {
					'glyph-0x41': { status: 'bogus', owner: 'user' },
					'glyph-0x42': { status: 'yours', owner: 'agent' },
					'glyph-0x43': { status: 'queued', owner: 'agent' },
					'glyph-0x44': { status: 'draft', owner: 'agent', updatedAt: 5 },
				},
			})
		);
		const { store } = makeStore({ storage });
		expect(store.getStatus('glyph-0x41')).toBe('kept');
		expect(store.getStatus('glyph-0x42')).toBe('empty');
		expect(store.getStatus('glyph-0x43')).toBe('empty');
		expect(store.get('glyph-0x44')).toMatchObject({ status: 'draft', updatedAt: 5 });
	});

	it('keeps working in memory when storage throws on every access', () => {
		const throwing = {
			getItem: () => {
				throw new Error('SecurityError');
			},
			setItem: () => {
				throw new Error('QuotaExceededError');
			},
			removeItem: () => {
				throw new Error('SecurityError');
			},
		};
		const { store, publish } = makeStore({ storage: throwing });
		expect(store.getStatus('glyph-0x41')).toBe('kept');
		expect(store.set('glyph-0x41', 'draft', 'agent')).toBe(true);
		expect(store.getStatus('glyph-0x41')).toBe('draft');
		expect(store.clear('glyph-0x41')).toBe(true);
		expect(publish).toHaveBeenCalledTimes(2);
	});

	it('keeps working when the storage getter itself throws', () => {
		const store = new GlyphStatusStore({
			getProject: () => fakeProject('p1'),
			getStorage: () => {
				throw new Error('SecurityError');
			},
		});
		expect(() => store.set('glyph-0x41', 'draft', 'agent')).not.toThrow();
		expect(store.getStatus('glyph-0x41')).toBe('draft');
	});
});

describe('GlyphStatusStore: project switch isolation', () => {
	it('drops and reloads records when the project changes', () => {
		const storage = new MemoryStorage();
		const { store, ref } = makeStore({ storage });
		store.set('glyph-0x41', 'draft', 'agent');
		store.set('glyph-0x42', 'queued', 'agent');

		ref.project = fakeProject('p2');
		expect(store.getStatus('glyph-0x41')).toBe('kept');
		expect(store.getStatus('glyph-0x42')).toBe('empty');
		store.set('glyph-0x41', 'yours', 'user');

		ref.project = fakeProject('p1');
		expect(store.getStatus('glyph-0x41')).toBe('draft');
		expect(store.getStatus('glyph-0x42')).toBe('empty'); // queued was run-time only
	});

	it('ProjectEditor reloads the store when a project is opened', () => {
		const storage = globalThis.localStorage;
		storage.clear();
		const projectA = new GlyphrStudioProject({ settings: { project: { id: 'noddy-test-a' } } });
		const projectB = new GlyphrStudioProject({ settings: { project: { id: 'noddy-test-b' } } });

		const editor = new ProjectEditor({ project: projectA });
		editor.glyphStatus.set('glyph-0x41', 'failed', 'agent');
		expect(storage.getItem(GLYPH_STATUS_STORAGE_PREFIX + 'noddy-test-a')).toBeTruthy();

		editor.project = projectB;
		expect(editor.glyphStatus.getStatus('glyph-0x41')).toBe('empty');

		editor.project = projectA;
		expect(editor.glyphStatus.getStatus('glyph-0x41')).toBe('failed');
		storage.clear();
	});
});

describe('GlyphStatusStore: yours lock', () => {
	it('rejects agent changes to a yours glyph without consent', () => {
		const { store, publish } = makeStore();
		store.set('glyph-0x41', 'yours', 'user');
		publish.mockClear();
		expect(() => store.set('glyph-0x41', 'draft', 'agent')).toThrow(/consent/);
		expect(() => store.set('glyph-0x41', 'queued', 'agent', { consent: false })).toThrow(/consent/);
		expect(() => store.set('glyph-0x41', 'empty', 'agent')).toThrow(/consent/);
		expect(store.isYours('glyph-0x41')).toBe(true);
		expect(publish).not.toHaveBeenCalled();
	});

	it('allows agent changes with explicit consent, and user changes always', () => {
		const { store } = makeStore();
		store.set('glyph-0x41', 'yours', 'user');
		expect(store.set('glyph-0x41', 'draft', 'agent', { consent: true })).toBe(true);
		expect(store.getStatus('glyph-0x41')).toBe('draft');

		store.set('glyph-0x42', 'yours', 'user');
		expect(store.set('glyph-0x42', 'kept', 'user')).toBe(true);
		store.set('glyph-0x42', 'yours', 'user');
		expect(store.clear('glyph-0x42')).toBe(true);
	});

	it('keeps the lock after a reload from storage', () => {
		const storage = new MemoryStorage();
		makeStore({ storage }).store.set('glyph-0x41', 'yours', 'user');
		const { store } = makeStore({ storage });
		expect(() => store.set('glyph-0x41', 'draft', 'agent')).toThrow(/consent/);
	});
});

describe('GlyphStatusStore: pre-draft snapshot and restore (M7 #29)', () => {
	const preDraft = { glyph: { id: 'glyph-0x42', advanceWidth: 300, shapes: [] } };

	it('a Draft carries its pre-draft snapshot, persisted and reloaded', () => {
		const { store, storage } = makeStore();
		store.set('glyph-0x42', 'draft', 'agent', { preDraft });
		expect(store.get('glyph-0x42').preDraft).toEqual(preDraft);
		const { store: again } = makeStore({ storage });
		expect(again.get('glyph-0x42').preDraft).toEqual(preDraft);
	});

	it('a redraw keeps the first snapshot; any other status drops it', () => {
		const { store } = makeStore();
		store.set('glyph-0x42', 'draft', 'agent', { preDraft });
		store.set('glyph-0x42', 'drafting', 'agent');
		store.set('glyph-0x42', 'draft', 'agent', { preDraft: { glyph: null } });
		expect(store.get('glyph-0x42').preDraft).toEqual({ glyph: null });
		store.set('glyph-0x42', 'draft', 'agent');
		expect(store.get('glyph-0x42').preDraft).toEqual({ glyph: null });
		store.set('glyph-0x42', 'kept', 'user');
		expect(store.get('glyph-0x42').preDraft).toBeUndefined();
	});

	it('restore puts a record back exactly, a derived record clears', () => {
		const { store, publish } = makeStore();
		store.set('glyph-0x42', 'draft', 'agent', { preDraft });
		const draft = store.get('glyph-0x42');
		store.set('glyph-0x42', 'kept', 'user');
		publish.mockClear();
		expect(store.restore('glyph-0x42', draft)).toBe(true);
		expect(store.get('glyph-0x42')).toMatchObject({ status: 'draft', owner: 'agent', preDraft });
		expect(publish).toHaveBeenCalledTimes(1);
		expect(store.restore('glyph-0x42', { status: 'empty', owner: 'user', derived: true })).toBe(
			true
		);
		expect(store.get('glyph-0x42').derived).toBe(true);
	});
});

describe('GlyphStatusStore: deleted items', () => {
	it('ProjectEditor.deleteItem clears the status record', () => {
		globalThis.localStorage.clear();
		const project = new GlyphrStudioProject({ settings: { project: { id: 'noddy-test-del' } } });
		const editor = new ProjectEditor({ project });
		expect(editor.project.getItem('glyph-0x5A', true)).toBeTruthy();
		// History reads the app-global editor; stub it, this test is about status
		editor.history = {
			addState: vi.fn(),
			addWholeProjectChangePreState: vi.fn(),
			addWholeProjectChangePostState: vi.fn(),
		};
		editor.glyphStatus.set('glyph-0x5A', 'yours', 'user');
		const callback = vi.fn();
		editor.subscribe({ topic: GLYPH_STATUS_TOPIC, subscriberID: 'test-del', callback });

		editor.deleteItem('glyph-0x5A', editor.project.glyphs);
		expect(editor.glyphStatus.get('glyph-0x5A')).toMatchObject({ status: 'empty', derived: true });
		expect(callback).toHaveBeenCalledTimes(1);
		expect(
			globalThis.localStorage.getItem(GLYPH_STATUS_STORAGE_PREFIX + 'noddy-test-del')
		).toBeNull();
		globalThis.localStorage.clear();
	});
});
