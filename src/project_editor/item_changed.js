// --------------------------------------------------------------
// itemChanged — "item X changed", whoever changed it
// --------------------------------------------------------------
/*
	A single editor topic, ITEM_CHANGED_TOPIC ('itemChanged'), with payload { id }.

	It is emitted centrally from ProjectEditor.publish (see pub_sub.js) whenever an
	item-edit topic is published. Every edit source already funnels through there:
		- manual edits (canvas tools, keyboard, panels publish 'currentItem' / 'currentPath' / ...)
		- agent commits (src/agent/native-tools.js publishes 'currentItem' after a commit)
		- undo / redo (History.restoreState / redoState publish 'currentItem')

	Emission is deferred to a microtask and de-duplicated per id, so one synchronous
	action (which often publishes several related topics) emits exactly one
	itemChanged per affected id. Emitting never touches selection, view, or focus.

	Subscribers must re-fetch the item by ID from the project (never via
	`getItem(id, true)` or the current selection). Use `subscribeToItemChanged`
	for a per-frame coalesced redraw callback.
*/

export const ITEM_CHANGED_TOPIC = 'itemChanged';

/** Topics that mean "the data of an item was edited". Selection topics are excluded. */
const ITEM_EDIT_TOPICS = new Set([
	'currentItem',
	'currentGlyph',
	'currentVirtualGlyph',
	'currentLigature',
	'currentComponent',
	'currentKernGroup',
	'currentPath',
	'currentVirtualShape',
	'currentComponentInstance',
	'currentPathPoint',
	'currentPathPoint.p',
	'currentPathPoint.h1',
	'currentPathPoint.h2',
]);

const ITEM_OBJ_TYPES = new Set(['Glyph', 'Ligature', 'Component', 'KernGroup']);

/** Pending ids per editor, flushed once per microtask. */
const pendingByEditor = new WeakMap();

/**
 * Resolve the item ID affected by a publish() call, or false if the topic
 * is not an item edit. Walks up the data's parent chain (point → path → item)
 * and falls back to the editor's selected item ID.
 * @param {Object} editor - ProjectEditor
 * @param {String} topic - topic passed to publish
 * @param {Object} data - data passed to publish
 * @returns {String | false}
 */
export function itemIdForPublish(editor, topic, data) {
	if (!ITEM_EDIT_TOPICS.has(topic)) return false;
	let node = data;
	for (let depth = 0; node && depth < 5; depth++) {
		if (ITEM_OBJ_TYPES.has(node.objType) && typeof node.id === 'string' && node.id) {
			return node.id;
		}
		node = node.parent;
	}
	return editor?.selectedItemID || false;
}

/**
 * Queue an itemChanged emission for an id. Multiple calls for the same id in
 * one synchronous task produce one emission.
 * @param {Object} editor - ProjectEditor (must have publish)
 * @param {String} id - item ID
 */
export function queueItemChanged(editor, id) {
	if (!editor || !id) return;
	let pending = pendingByEditor.get(editor);
	if (!pending) {
		pending = new Set();
		pendingByEditor.set(editor, pending);
		queueMicrotask(() => {
			pendingByEditor.delete(editor);
			pending.forEach((pendingID) => editor.publish(ITEM_CHANGED_TOPIC, { id: pendingID }));
		});
	}
	pending.add(id);
}

/**
 * Called by ProjectEditor.publish for every topic: queues itemChanged
 * when the topic is an item edit.
 * @param {Object} editor - ProjectEditor
 * @param {String} topic - topic passed to publish
 * @param {Object} data - data passed to publish
 */
export function noteItemEdit(editor, topic, data) {
	const id = itemIdForPublish(editor, topic, data);
	if (id) queueItemChanged(editor, id);
}

/**
 * Create a coalescing scheduler: `schedule(id)` collects ids and calls
 * `callback(id)` once per id on the next animation frame (or after `delay` ms
 * when a delay is given, or when requestAnimationFrame is unavailable).
 * @param {Function} callback - called with each changed id
 * @param {Object} [options]
 * @param {Number} [options.delay=0] - ms to wait; 0 means next animation frame
 * @returns {{ schedule: Function, flush: Function, cancel: Function }}
 */
export function createDebouncedRedraw(callback, { delay = 0 } = {}) {
	let pending = new Set();
	let handle = null;
	let usedFrame = false;

	function flush() {
		clearHandle();
		const ids = pending;
		pending = new Set();
		ids.forEach((id) => callback(id));
	}

	function clearHandle() {
		if (handle === null) return;
		if (usedFrame) cancelAnimationFrame(handle);
		else clearTimeout(handle);
		handle = null;
	}

	function schedule(id) {
		pending.add(id);
		if (handle !== null) return;
		usedFrame = !delay && typeof requestAnimationFrame === 'function';
		handle = usedFrame ? requestAnimationFrame(flush) : setTimeout(flush, delay);
	}

	function cancel() {
		clearHandle();
		pending = new Set();
	}

	return { schedule, flush, cancel };
}

/**
 * Subscribe to itemChanged with per-frame coalescing. Intended for glyph tiles,
 * the specimen, and the context strip: the callback receives the id and should
 * re-fetch the item from the project by that id.
 * @param {Object} editor - ProjectEditor
 * @param {Object} args
 * @param {String} args.subscriberID - unique subscriber name
 * @param {Function} args.callback - called with (id) once per frame per changed id
 * @param {String | Array<String>} [args.ids] - only react to these ids
 * @param {Number} [args.delay=0] - ms debounce; 0 means next animation frame
 * @returns {Function} unsubscribe - removes the subscription and cancels pending redraws
 */
export function subscribeToItemChanged(editor, { subscriberID, callback, ids, delay = 0 }) {
	const filter = ids ? new Set(typeof ids === 'string' ? [ids] : ids) : false;
	const redraw = createDebouncedRedraw(callback, { delay });
	editor.subscribe({
		topic: ITEM_CHANGED_TOPIC,
		subscriberID,
		callback: (data) => {
			if (!data?.id) return;
			if (filter && !filter.has(data.id)) return;
			redraw.schedule(data.id);
		},
	});
	return () => {
		redraw.cancel();
		if (editor.subscribers?.[ITEM_CHANGED_TOPIC]) {
			delete editor.subscribers[ITEM_CHANGED_TOPIC][subscriberID];
		}
	};
}
