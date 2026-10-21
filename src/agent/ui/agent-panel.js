/**
 * Full-height agent panel (M4: issues #19, #20, #21; Figma flow-02..07).
 *
 * One module-level panel lives in the persistent slot
 * (src/app/agent_panel_slot.js), so a run survives page navigation.
 *
 *   header   mark · "Agent" · status dot · model chip · minimize (no close)
 *   thread   anchored at the bottom: bubbles, step lines, message cards
 *   composer attach · "Ask the agent" · send
 *   pill     the minimized form (agent-pill.js)
 *
 * Minimizing, Esc and focus mode never stop a run: nothing here calls
 * `controller.stop()` except the composer's explicit Stop button.
 *
 * Plumbing kept from before M4: agent-controller.js (runs, keys in memory),
 * native-tools.js (edits through history), attachments.js.
 */
import { getCurrentProjectEditor } from '../../app/main.js';
import {
	isAgentPanelMounted,
	mountAgentPanel,
	setAgentPanelMode,
} from '../../app/agent_panel_slot.js';
import { GLYPH_STATUS_TOPIC } from '../../project_editor/glyph-status.js';
import { createAgentController } from '../agent-controller.js';
import { createNativeToolSession } from '../native-tools.js';
import { CARD_ACTION_EVENT, registerAgentCards } from './cards/index.js';
import { el, icon, srOnly } from './cards/card-shell.js';
import {
	CHECK_COPY,
	checkConnection,
	createConnectCard,
	modelLabel,
} from './agent-connect-card.js';
import { createPanelComposer } from './agent-panel-composer.js';
import { createAgentPill, derivePillPhase } from './agent-pill.js';
import './agent-panel.css';

export const PANEL_ID = 'agent-panel';
export const NARROW_QUERY = '(max-width: 1199px)';
export const PHONE_QUERY = '(max-width: 759px)';

export const SUGGESTIONS = Object.freeze(['Clean simple sans', 'Geometric']);

/** Error code → one-line thread copy. Unknown codes show the message. */
export const ERROR_COPY = Object.freeze({
	RELAY_OFFLINE: CHECK_COPY['relay-offline'],
	PROVIDER_UNAVAILABLE: CHECK_COPY['provider-down'],
	CANCELLED: CHECK_COPY['provider-down'],
	TIMEOUT: CHECK_COPY['provider-down'],
	PROVIDER_AUTH: 'Key not accepted · reload to connect again',
	PROVIDER_LIMIT: 'Provider limit reached · check your account',
	NO_GLYPH: 'Open a glyph first · the agent edits one glyph at a time',
	NO_MODEL: 'Connect a model first',
});

/**
 * @param {{code?: String, message?: String}} error
 * @returns {String}
 */
export function threadCopyFor(error = {}) {
	return ERROR_COPY[error.code] || error.message || 'Something went wrong · try again';
}

/** Actions the controller cannot do yet; they get a visible stub line. */
const STUB_ACTIONS = Object.freeze({
	start: 'Starting a plan',
	adjust: 'Adjusting a plan',
	approve: 'Approving a style check',
	keep: 'Keep',
});

/**
 * 'glyph-0x61' → 'a'.
 * @param {String} [id]
 * @returns {String}
 */
export function charForGlyphId(id) {
	const match = /^glyph-0x([0-9a-f]+)$/i.exec(id || '');
	if (!match) return '';
	try {
		return String.fromCodePoint(parseInt(match[1], 16));
	} catch {
		return '';
	}
}

const EDIT_TOOLS = new Set(['set_spacing', 'transform_paths', 'add_paths']);

/**
 * Plain keys stay in the panel so tool keys, Delete or Space never reach the
 * canvas shortcuts. Modifier keys and Ctrl/Cmd combos always propagate so
 * global shortcuts (and modifier state tracking) keep working.
 * @param {KeyboardEvent} event
 */
export function guardPanelKey(event) {
	if (event.ctrlKey || event.metaKey) return;
	if (['Shift', 'Control', 'Alt', 'Meta', 'AltGraph', 'CapsLock'].includes(event.key)) return;
	event.stopPropagation();
}

function matches(query) {
	try {
		return !!window.matchMedia?.(query).matches;
	} catch {
		return false;
	}
}

/**
 * Relay reachable? (GET /api/agent/config; no provider call, nothing billed.)
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Boolean>}
 */
export async function probeRelay(fetchImpl = globalThis.fetch) {
	try {
		const response = await fetchImpl('/api/agent/config', { method: 'GET' });
		if (!response.ok) return false;
		await response.json();
		return true;
	} catch {
		return false;
	}
}

/**
 * @param {Object} [options]
 * @param {Object} [options.controller] - an agent controller; built when omitted
 * @param {Function} [options.createSession]
 * @param {Function} [options.transport]
 * @param {typeof checkConnection} [options.check]
 * @param {typeof probeRelay} [options.probe]
 * @param {() => any} [options.getEditor]
 * @param {(glyphId: String) => void} [options.openGlyph] - "Edit by hand"
 * @param {'open'|'minimized'} [options.initialMode]
 */
export function createAgentPanel({
	controller: providedController,
	createSession = createNativeToolSession,
	transport,
	check = checkConnection,
	probe = probeRelay,
	getEditor = getCurrentProjectEditor,
	openGlyph = (glyphId) => {
		import('../../pages/focus_mode.js')
			.then((m) => m.openFocusMode(glyphId))
			.catch(() => {});
	},
	initialMode = matches(NARROW_QUERY) ? 'minimized' : 'open',
} = {}) {
	registerAgentCards();

	const host = el('div', 'agent-panel-host');
	const scrim = el('div', 'agent-panel__scrim');
	scrim.setAttribute('aria-hidden', 'true');

	const panel = el('section', 'agent-panel');
	panel.id = PANEL_ID;
	panel.setAttribute('aria-label', 'Agent');

	// ---- Header ----
	const header = el('header', 'agent-panel__header');
	const mark = el('span', 'agent-mark agent-mark--24');
	mark.setAttribute('aria-hidden', 'true');
	const title = el('span', 'agent-panel__title text-label', 'Agent');
	const dot = el('span', 'agent-panel__dot');
	dot.append(srOnly('Running'));
	dot.hidden = true;
	const chip = el('span', 'agent-panel__model text-mono-small', 'No model');
	const minimizeButton = /** @type {HTMLButtonElement} */ (
		el('button', 'agent-icon-button agent-panel__minimize')
	);
	minimizeButton.type = 'button';
	minimizeButton.setAttribute('aria-label', 'Minimize agent');
	minimizeButton.setAttribute('aria-controls', PANEL_ID);
	minimizeButton.append(icon('remove'));
	minimizeButton.addEventListener('click', () => minimize());
	header.append(mark, title, dot, chip, minimizeButton);

	// ---- Thread ----
	const thread = el('div', 'agent-panel__thread');
	thread.setAttribute('role', 'log');
	thread.setAttribute('aria-label', 'Agent conversation');
	thread.setAttribute('aria-live', 'polite');
	const log = el('div', 'agent-panel__log');
	thread.append(log);

	const typing = el('div', 'agent-bubble agent-bubble--agent agent-bubble--typing');
	typing.setAttribute('aria-label', 'Agent is working');
	typing.append(el('span'), el('span'), el('span'));

	// ---- State ----
	const status = { running: false, paused: false, failed: false, glyph: '', done: NaN, total: NaN };
	let mode = initialMode === 'minimized' ? 'minimized' : 'open';
	let savedScroll = 0;
	let modelId = '';
	let lastPrompt = '';
	/** @type {Map<String, HTMLElement>} */
	const toolLines = new Map();
	let runEdits = { changed: false, failed: false, glyphId: '' };

	const controller =
		providedController ||
		createAgentController({ createSession, transport, onEvent: (event) => onEvent(event) });

	// ---- Composer ----
	const composer = createPanelComposer({
		onSubmit: (draft) => submit(draft),
		onStop: () => controller.stop(),
		getReferences: () => controller.references || [],
		onAttachError: (message) => addError({ message }),
	});

	// ---- Connect card + empty state ----
	const connect = createConnectCard({
		check,
		onConnected(config) {
			try {
				controller.connect(config);
			} catch (error) {
				addError(error);
				return;
			}
			config.apiKey = '';
		},
		onRelayOffline: () => addError({ code: 'RELAY_OFFLINE' }),
	});

	const empty = el('div', 'agent-panel__empty');
	const emptyMark = el('span', 'agent-mark agent-mark--48');
	emptyMark.setAttribute('aria-hidden', 'true');
	const emptyTitle = el('h2', 'agent-panel__empty-title text-heading', 'What are we drawing?');
	const chips = el('div', 'agent-panel__chips');
	SUGGESTIONS.forEach((text) => {
		const button = /** @type {HTMLButtonElement} */ (
			el('button', 'agent-suggestion text-label', text)
		);
		button.type = 'button';
		button.addEventListener('click', () => {
			composer.setValue(text);
			composer.input.focus();
		});
		chips.append(button);
	});
	const sketch = /** @type {HTMLButtonElement} */ (el('button', 'agent-suggestion text-label'));
	sketch.type = 'button';
	sketch.append(icon('image'), el('span', '', 'Add a sketch'));
	sketch.addEventListener('click', () => composer.openChooser());
	chips.append(sketch);
	empty.append(emptyMark, emptyTitle, chips, connect.root);

	function renderEmptyState() {
		const connected = controller.connected;
		chips.hidden = !connected;
		connect.root.hidden = connected;
	}

	function showEmpty() {
		toolLines.clear();
		log.replaceChildren(empty);
		renderEmptyState();
	}

	// ---- Thread helpers ----
	function atBottom() {
		return thread.scrollHeight - thread.scrollTop - thread.clientHeight < 8;
	}

	/**
	 * Appends to the thread, keeping the typing dots last and following the
	 * newest message only when the reader is already at the bottom.
	 * @param {Node} node
	 * @returns {Node}
	 */
	function append(node) {
		const follow = atBottom();
		typing.remove();
		log.append(node);
		if (status.running) log.append(typing);
		if (follow) thread.scrollTop = thread.scrollHeight;
		return node;
	}

	function addBubble(text, who = 'agent', attachments = []) {
		const bubble = el('div', `agent-bubble agent-bubble--${who} text-body`);
		if (who === 'user') bubble.append(srOnly('You: '));
		bubble.append(el('span', 'agent-bubble__text', text));
		if (attachments.length) {
			const files = el('span', 'agent-bubble__files text-mono-small');
			files.textContent = attachments.map((file) => file.name).join(' · ');
			bubble.append(files);
		}
		return append(bubble);
	}

	function addError(error) {
		const bubble = el('div', 'agent-bubble agent-bubble--agent agent-bubble--error text-body');
		bubble.append(
			icon('error', 'agent-bubble__icon'),
			srOnly('Error: '),
			el('span', '', threadCopyFor(error))
		);
		return append(bubble);
	}

	function addStep(tone, text) {
		const line = /** @type {any} */ (document.createElement('agent-step-line'));
		line.render({ tone, text });
		return append(line);
	}

	/**
	 * Adds a message card (<agent-plan-card>, <agent-approval-card>,
	 * <agent-receipt-card>) to the thread.
	 * @param {String} tag
	 * @param {Object} data
	 */
	function addCard(tag, data) {
		const card = /** @type {any} */ (document.createElement(tag));
		card.render(data);
		return append(card);
	}

	// ---- Status: header dot + pill ----
	const pill = createAgentPill({ onExpand: () => restore() });

	function reviewCount() {
		try {
			return getEditor()?.glyphStatus?.listByStatus('draft').length || 0;
		} catch {
			return 0;
		}
	}

	function renderStatus() {
		status.running = !!controller.running || status.running;
		dot.hidden = !status.running;
		panel.toggleAttribute('data-running', status.running);
		const review = reviewCount();
		pill.render({
			phase: derivePillPhase({ ...status, review }),
			glyph: status.glyph,
			done: status.done,
			total: status.total,
			review,
			compact: matches(PHONE_QUERY),
		});
	}

	// ---- Controller events → thread ----
	function onEvent(event) {
		switch (event.type) {
			case 'clear':
				showEmpty();
				break;
			case 'start':
				// The conversation begins: the empty state (and its connect card) goes.
				empty.remove();
				status.running = true;
				status.failed = false;
				status.glyph = charForGlyphId(event.context?.glyphId);
				runEdits = { changed: false, failed: false, glyphId: event.context?.glyphId || '' };
				lastPrompt = event.prompt;
				toolLines.clear();
				composer.clear();
				composer.setBusy(true);
				addBubble(event.prompt, 'user', event.attachments || []);
				break;
			case 'text':
				addBubble(event.text, 'agent');
				break;
			case 'tool': {
				const name = String(event.name || '').replaceAll('_', ' ');
				if (event.state === 'running') {
					toolLines.set(event.name, addStep('info', `${name}…`));
				} else {
					const ok = event.state === 'done';
					if (EDIT_TOOLS.has(event.name)) {
						if (ok && event.result?.changed) runEdits.changed = true;
						if (!ok) runEdits.failed = true;
					}
					const line = toolLines.get(event.name);
					const copy = ok
						? { tone: 'kept', text: name }
						: {
								tone: 'failed',
								text: `${name} · ${event.result?.error?.message || 'not applied'}`,
						  };
					if (line) line.render(copy);
					else addStep(copy.tone, copy.text);
					toolLines.delete(event.name);
				}
				break;
			}
			case 'error':
				if (event.code === 'STOPPED') addStep('info', 'Stopped · finished edits are kept');
				else {
					status.failed = true;
					addError(event);
				}
				break;
			case 'finish': {
				status.running = false;
				typing.remove();
				composer.setBusy(false);
				const char = charForGlyphId(runEdits.glyphId);
				if (char && (runEdits.changed || runEdits.failed)) {
					addCard('agent-receipt-card', {
						cardId: `receipt-${Date.now()}`,
						glyphs: [{ char, status: runEdits.changed ? 'changed' : 'failed' }],
						project: getEditor()?.project,
					});
				}
				break;
			}
			case 'connection':
				modelId = event.connected ? event.model : '';
				chip.textContent = event.connected ? modelLabel(event.model) : 'No model';
				renderEmptyState();
				if (event.connected) {
					addStep('kept', `Connected · ${modelLabel(event.model)} · tools ok`);
					composer.input.focus();
				}
				break;
			default:
				break;
		}
		renderStatus();
	}

	// ---- Send ----
	async function submit({ prompt, attachments }) {
		if (!controller.connected) {
			const online = await probe();
			addError({ code: online ? 'NO_MODEL' : 'RELAY_OFFLINE' });
			if (online) connect.focus();
			return;
		}
		try {
			await controller.run(prompt, attachments);
		} catch (error) {
			// Rejected before the run started; the draft stays in the composer.
			addError(error);
		}
	}

	// ---- Card actions → controller ----
	host.addEventListener(CARD_ACTION_EVENT, (event) => {
		const detail = /** @type {CustomEvent} */ (event).detail || {};
		if (detail.action === 'tweak') {
			composer.setValue(detail.prefill || 'Tweak: ');
			composer.input.focus();
			return;
		}
		if (detail.action === 'edit-by-hand') {
			if (detail.glyphId) openGlyph(detail.glyphId);
			return;
		}
		if (detail.action === 'retry') {
			if (!lastPrompt || controller.running || !controller.connected) {
				addError({
					code: controller.connected ? undefined : 'NO_MODEL',
					message: 'Nothing to retry yet',
				});
				return;
			}
			controller.run(lastPrompt, []).catch((error) => addError(error));
			return;
		}
		const label = STUB_ACTIONS[detail.action];
		if (label) addStep('info', `${label} is coming in M7`);
	});

	// ---- Minimize / restore ----
	function applyMode() {
		setAgentPanelMode(mode);
		const minimized = mode === 'minimized';
		panel.hidden = minimized;
		scrim.hidden = minimized;
		pill.root.hidden = !minimized;
		pill.root.setAttribute('aria-expanded', String(!minimized));
		host.dataset.mode = mode;
	}

	function minimize() {
		if (mode === 'minimized') return;
		const hadFocus = panel.contains(document.activeElement);
		savedScroll = thread.scrollTop;
		mode = 'minimized';
		applyMode();
		renderStatus();
		if (hadFocus) pill.root.focus();
	}

	function restore({ focus = true } = {}) {
		if (mode === 'open') return;
		mode = 'open';
		applyMode();
		thread.scrollTop = savedScroll;
		renderStatus();
		if (focus) composer.input.focus();
	}

	scrim.addEventListener('click', () => minimize());

	// ---- Keyboard ----
	host.addEventListener('keydown', (event) => {
		guardPanelKey(event);
		if (event.key !== 'Escape' || event.ctrlKey || event.metaKey || event.altKey) return;
		if (event.target === composer.input) {
			composer.input.blur();
			event.preventDefault();
			return;
		}
		if (mode === 'open' && panel.contains(/** @type {Node} */ (event.target))) {
			event.preventDefault();
			minimize();
		}
	});
	host.addEventListener('keyup', guardPanelKey);
	// Drawer tiers: Esc from the page also closes the drawer to the pill.
	const onDocumentKey = (event) => {
		if (event.key !== 'Escape' || mode !== 'open' || !matches(NARROW_QUERY)) return;
		if (host.contains(/** @type {Node} */ (event.target))) return;
		minimize();
	};
	document.addEventListener('keydown', onDocumentKey);

	panel.append(header, thread, composer.root);
	host.append(scrim, panel, pill.root);
	showEmpty();
	applyMode();
	renderStatus();

	return {
		host,
		panel,
		pill,
		thread,
		composer,
		controller,
		addCard,
		addStep,
		/** Controller event sink (for a controller built outside the panel). */
		handleEvent: onEvent,
		get mode() {
			return mode;
		},
		get model() {
			return modelId;
		},
		minimize,
		restore,
		/** Re-read counts (review store) and redraw the pill and dot. */
		refreshStatus: renderStatus,
		/**
		 * Run progress for the pill until M7's queue reports it.
		 * @param {{glyph?: String, done?: Number, total?: Number, paused?: Boolean}} partial
		 */
		setRunStatus(partial = {}) {
			Object.assign(status, partial);
			renderStatus();
		},
		dispose() {
			document.removeEventListener('keydown', onDocumentKey);
			connect.clearKey();
			composer.dispose();
			controller.disconnect?.();
			host.remove();
		},
	};
}

/** @type {ReturnType<typeof createAgentPanel> | null} */
let singleton = null;

/** @returns {ReturnType<typeof createAgentPanel> | null} */
export function getAgentPanel() {
	return singleton;
}

/**
 * Builds the panel once and mounts it in the persistent slot. Safe to call
 * after every navigation; the same panel (and its run) is re-used.
 * @param {Object} [options] - passed to createAgentPanel on first use
 * @returns {ReturnType<typeof createAgentPanel>}
 */
export function ensureAgentPanel(options) {
	if (!singleton) singleton = createAgentPanel(options);
	// Never replace something else already mounted in the slot.
	if (!isAgentPanelMounted()) mountAgentPanel(singleton.host);
	setAgentPanelMode(singleton.mode);
	const editor = getCurrentProjectEditor();
	try {
		editor?.subscribe?.({
			topic: GLYPH_STATUS_TOPIC,
			subscriberID: 'agentPanel',
			callback: () => singleton?.refreshStatus(),
		});
	} catch {
		/* The pill falls back to counts read on each render. */
	}
	singleton.refreshStatus();
	return singleton;
}

/** Read-only: true while the agent has a request in flight. */
export function isAgentRunning() {
	return !!singleton?.controller.running;
}

/** Test helper: drops the singleton. */
export function resetAgentPanelForTests() {
	singleton?.dispose();
	singleton = null;
}
