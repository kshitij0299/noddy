/**
 * Agent panel controls (PR B): mode (Exact / Remix / Wild), chaos (0–100) and target
 * (this glyph / selected glyphs / whole set). No DOM: the panel chips, the grid and the native
 * tools all read and write this one store.
 *
 * - Mode and chaos are remembered per project for this tab (sessionStorage, keyed by the
 *   project ID that round-trips in `.gs2`). Nothing is written to the project file.
 * - Picks are the glyphs the user Cmd/Ctrl/Shift-clicked in the grid (memory only).
 * - Target defaults from what is selected: the glyph open in the editor, else the picks (one
 *   pick = This glyph, more = Selected glyphs), else the whole set. A scope the user chose
 *   sticks until the selection changes.
 *
 * `readAgentControls(editor)` is what `get_context` reports (`mode`, `chaos`, `target`), so the
 * built-in agent and a local agent over MCP see the same thing.
 */
import { latinKernelAll } from '../project_editor/charset_latin_kernel.js';
import { openGlyphId } from './ownership.js';

export const MODES = Object.freeze(['exact', 'remix', 'wild']);
export const MODE_LABELS = Object.freeze({ exact: 'Exact', remix: 'Remix', wild: 'Wild' });
export const MODE_HINTS = Object.freeze({
	exact: 'Follow the reference faithfully',
	remix: 'Keep the vibe, vary each glyph',
	wild: 'Big swings, still readable',
});
export const SCOPES = Object.freeze(['glyph', 'selected', 'set']);
export const SCOPE_LABELS = Object.freeze({
	glyph: 'This glyph',
	selected: 'Selected glyphs',
	set: 'Whole set',
});
export const DEFAULT_MODE = 'exact';
export const DEFAULT_CHAOS = 50;
export const CONTROLS_STORAGE_PREFIX = 'noddy.agentControls:';
export const CONTROLS_EVENT = 'change';

/** One event target for every listener (the chips, the grid). */
const events = new EventTarget();
/** @type {Map<String, {mode: String, chaos: Number}>} per project ID, mirrors sessionStorage */
const memory = new Map();
/** @type {Array<String>} picked glyph IDs, in pick order */
let picks = [];
/** The scope the user chose, and the selection it was chosen for. */
let chosen = { scope: '', key: '' };

function notify(reason) {
	events.dispatchEvent(new CustomEvent(CONTROLS_EVENT, { detail: { reason } }));
}

/**
 * @param {(event: CustomEvent) => void} listener
 * @returns {() => void} unsubscribe
 */
export function onControlsChange(listener) {
	const handler = (event) => listener(/** @type {CustomEvent} */ (event));
	events.addEventListener(CONTROLS_EVENT, handler);
	return () => events.removeEventListener(CONTROLS_EVENT, handler);
}

function storage() {
	try {
		return globalThis.sessionStorage || null;
	} catch {
		return null;
	}
}

/** Clamp to 0–100 in whole steps; anything else is the default. */
export function clampChaos(value) {
	const number = Math.round(Number(value));
	if (!Number.isFinite(number)) return DEFAULT_CHAOS;
	return Math.min(100, Math.max(0, number));
}

function projectKey(editor) {
	try {
		return String(editor?.project?.settings?.project?.id || '');
	} catch {
		return '';
	}
}

function settingsFor(key) {
	if (memory.has(key)) return memory.get(key);
	let value = { mode: DEFAULT_MODE, chaos: DEFAULT_CHAOS };
	try {
		const raw = key ? storage()?.getItem(CONTROLS_STORAGE_PREFIX + key) : null;
		const parsed = raw ? JSON.parse(raw) : null;
		if (parsed && MODES.includes(parsed.mode))
			value = { mode: parsed.mode, chaos: clampChaos(parsed.chaos) };
	} catch {
		/* Unreadable: the defaults. */
	}
	memory.set(key, value);
	return value;
}

function saveSettings(key, value) {
	memory.set(key, value);
	try {
		if (key) storage()?.setItem(CONTROLS_STORAGE_PREFIX + key, JSON.stringify(value));
	} catch {
		/* Storage blocked: it still holds for this page. */
	}
}

/** @returns {{mode: String, chaos: Number}} */
export function getModeSettings(editor) {
	return { ...settingsFor(projectKey(editor)) };
}

export function setMode(editor, mode) {
	if (!MODES.includes(mode)) return;
	const key = projectKey(editor);
	saveSettings(key, { ...settingsFor(key), mode });
	notify('mode');
}

export function setChaos(editor, chaos) {
	const key = projectKey(editor);
	saveSettings(key, { ...settingsFor(key), chaos: clampChaos(chaos) });
	notify('chaos');
}

// ---- Picks (the grid's multi-selection) ----

/** @returns {Array<String>} */
export function getPicks() {
	return [...picks];
}

export function setPicks(ids = []) {
	const next = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
	if (next.length === picks.length && next.every((id, i) => id === picks[i])) return;
	picks = next;
	notify('picks');
}

export function togglePick(id) {
	setPicks(picks.includes(id) ? picks.filter((item) => item !== id) : [...picks, id]);
}

// ---- Target ----

/** Glyph IDs of the whole set (GF Latin Kernel, 116). */
export function setGlyphIds() {
	try {
		return latinKernelAll().map((entry) => entry.glyphID);
	} catch {
		return [];
	}
}

function openId(editor) {
	try {
		return openGlyphId(editor) || null;
	} catch {
		return null;
	}
}

/**
 * What each scope would cover right now; a scope with no glyphs is unavailable.
 * @returns {{glyph: Array<String>, selected: Array<String>, set: Array<String>}}
 */
export function scopeOptions(editor) {
	const open = openId(editor);
	const glyph = open ? [open] : picks.length === 1 ? [picks[0]] : [];
	return { glyph, selected: picks.length > 1 ? [...picks] : [], set: setGlyphIds() };
}

function selectionKey(editor) {
	return `${openId(editor) || ''}|${picks.join(',')}`;
}

/** The scope from the selection alone. */
export function defaultScope(editor) {
	const options = scopeOptions(editor);
	if (openId(editor)) return 'glyph';
	if (options.selected.length) return 'selected';
	if (options.glyph.length) return 'glyph';
	return 'set';
}

/** The user's choice, until the selection changes. */
export function setScope(editor, scope) {
	if (!SCOPES.includes(scope)) return;
	chosen = { scope, key: selectionKey(editor) };
	notify('scope');
}

/**
 * @returns {{scope: 'glyph'|'selected'|'set', glyphIds: Array<String>}}
 */
export function getTarget(editor) {
	const options = scopeOptions(editor);
	let scope = defaultScope(editor);
	if (chosen.scope && chosen.key === selectionKey(editor) && options[chosen.scope].length)
		scope = chosen.scope;
	return { scope: /** @type {any} */ (scope), glyphIds: options[scope] };
}

/**
 * The controls as `get_context` reports them.
 * @returns {{mode: String, chaos: Number, target: {scope: String, glyphIds: Array<String>}}}
 */
export function readAgentControls(editor) {
	const { mode, chaos } = getModeSettings(editor);
	return { mode, chaos, target: getTarget(editor) };
}

/** Test helper. */
export function resetAgentControlsForTests() {
	memory.clear();
	picks = [];
	chosen = { scope: '', key: '' };
}
