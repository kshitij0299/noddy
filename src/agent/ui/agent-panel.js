/**
 * Full-height agent panel (M4: issues #19, #20, #21; Figma flow-02..07).
 *
 * One module-level panel lives in the persistent slot
 * (src/app/agent_panel_slot.js), so a run survives page navigation.
 *
 *   header   mark · "Agent" (or the Agent | Chaos tabs once a chaos tool exists) · status dot ·
 *            [Local agent] · New chat · minimize (no close)
 *   thread   anchored at the bottom: bubbles, step lines, message cards
 *   composer "Ask the agent", then attach · Model · Mode · Target chips · send (PR B)
 *   pill     the minimized form (agent-pill.js)
 *
 * Minimizing, Esc and focus mode never stop a run: nothing here calls
 * `controller.stop()` except the composer's explicit Stop button, and a
 * whole-set run (M7) stops only from the run bar's inline "Stop run?".
 *
 * M7 runs (#28, #29): a message about the font or a style becomes a plan
 * (gate 1), the control glyphs n o H O wait at "Approve the style" (gate 2),
 * then the queue drafts one glyph job at a time (src/agent/run/). A message
 * that names one glyph ("fix the g") stays a small ask: no plan, no gate,
 * a receipt only. Receipts offer Keep N (Keep all for the group) and Retry.
 *
 * PR B: the Model chip opens the model list in a popover (switching keeps the chat, bugs 1 and
 * 14); Mode (Exact / Remix / Wild + chaos) and Target (this glyph / selected / whole set) reach
 * get_context and the built-in agent's instructions; New chat clears the thread (bug 20); a
 * loaded font gets edit suggestions (bug 16); with a local agent on, the composer talks to it
 * (bug 30).
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
import { createGlyphDrafter } from '../run/glyph-job.js';
import { classifyAsk } from '../run/intent.js';
import { RETRY_GLYPHS_EVENT, charOf, keepGlyphs, revertGlyphs, revertRun } from '../run/review.js';
import { onControlsChange, readAgentControls } from '../agent-controls.js';
import { createRunController } from '../run/run-controller.js';
import { formatDollars } from '../run/spend.js';
import { createCheckpointLine, createRunBar } from './agent-run-bar.js';
import { CARD_ACTION_EVENT, registerAgentCards } from './cards/index.js';
import { el, icon, srOnly } from './cards/card-shell.js';
import {
	RELAY_OFF_COPY,
	checkConnection,
	createConnectCard,
	fetchModels,
	modelLabel,
} from './agent-connect-card.js';
import { describeRunError } from '../connect-flow.js';
import { createPanelComposer } from './agent-panel-composer.js';
import { createAgentPill, derivePillPhase } from './agent-pill.js';
import { createModeChip, createModelChip, createTargetChip } from './agent-composer-chips.js';
import { closeAllPopovers, createPopover } from './agent-popover.js';
import { createPanelTabs, listChaosTools, onChaosToolsChange } from './agent-panel-tabs.js';
import './agent-panel.css';

export const PANEL_ID = 'agent-panel';
export const NARROW_QUERY = '(max-width: 1199px)';
export const PHONE_QUERY = '(max-width: 759px)';

export const SUGGESTIONS = Object.freeze(['Clean simple sans', 'Geometric']);
/** On a font that already has glyphs: edits, not a fresh start (bug 16). */
export const EDIT_SUGGESTIONS = Object.freeze(['Make it bolder', 'Restyle from A', 'Fix spacing']);

/**
 * Does the open project already have drawn glyphs?
 * @param {any} editor
 * @returns {Boolean}
 */
export function fontHasGlyphs(editor) {
	try {
		const glyphs = editor?.project?.glyphs || {};
		return Object.values(glyphs).some((glyph) => glyph?.shapes?.length > 0);
	} catch {
		return false;
	}
}

/** Error code → one-line thread copy. Unknown codes show the message. */
export const ERROR_COPY = Object.freeze({
	RELAY_OFFLINE: RELAY_OFF_COPY,
	CANCELLED: 'Provider not responding · try again',
	TIMEOUT: 'Provider not responding · try again',
	NO_GLYPH: 'Open a glyph first · the agent edits one glyph at a time',
	NO_MODEL: 'Connect a model first',
});

/**
 * One-line thread copy for an error. A provider failure says what the connect flow says:
 * `{status} · {what happened} — {what to do}` (see connect-flow.js `describeError`).
 * @param {{code?: String, status?: Number, hint?: String, message?: String}} error
 * @param {String} [provider]  the connected provider, for its name
 * @returns {String}
 */
export function threadCopyFor(error = {}, provider = '') {
	const provided = describeRunError(error, provider);
	if (provided) return provided.text;
	return ERROR_COPY[error.code] || error.message || 'Something went wrong · try again';
}

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

const EDIT_TOOLS = new Set(['set_spacing', 'transform_paths', 'add_paths', 'submit_glyph']);

/** Spec chips the Plan card shows (Figma flow-03). */
const PLAN_SPEC_KEYS = ['xHeight', 'capHeight', 'stems'];

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
 * Does this server offer Local agent? Only the dev server's config says localAgent: true.
 * @param {typeof fetch} [fetchImpl]
 * @returns {Promise<Boolean>}
 */
export async function probeLocalAgent(fetchImpl = globalThis.fetch) {
	try {
		const response = await fetchImpl('/api/agent/config', { method: 'GET' });
		return response.ok && (await response.json())?.localAgent === true;
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
 * @param {typeof fetchModels} [options.loadModels] - the key's live model list
 * @param {typeof probeRelay} [options.probe]
 * @param {Storage|null} [options.storage] - where the provider and model are remembered
 * @param {() => any} [options.getEditor]
 * @param {(glyphId: String) => void} [options.openGlyph] - "Edit by hand"
 * @param {'open'|'minimized'} [options.initialMode]
 * @param {(() => Promise<Object>) | null} [options.loadLocalAgent] - the dev-only Local agent
 *   module (local-agent-control.js); null in the build, so the bridge is never bundled
 * @param {typeof probeLocalAgent} [options.probeLocal]
 */
export function createAgentPanel({
	controller: providedController,
	createSession = createNativeToolSession,
	transport,
	check = checkConnection,
	loadModels = fetchModels,
	probe = probeRelay,
	storage: providedStorage = undefined,
	getEditor = getCurrentProjectEditor,
	openGlyph = (glyphId) => {
		import('../../pages/focus_mode.js')
			.then((m) => m.openFocusMode(glyphId))
			.catch(() => {});
	},
	initialMode = matches(NARROW_QUERY) ? 'minimized' : 'open',
	// import.meta.env.DEV is false in `vite build`, so the import is dropped from the bundle.
	loadLocalAgent = import.meta.env.DEV ? () => import('./local-agent-control.js') : null,
	probeLocal = probeLocalAgent,
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
	const newChatButton = /** @type {HTMLButtonElement} */ (
		el('button', 'agent-icon-button agent-panel__new-chat')
	);
	newChatButton.type = 'button';
	newChatButton.title = 'New chat';
	newChatButton.setAttribute('aria-label', 'New chat');
	newChatButton.append(icon('edit_square'));
	newChatButton.addEventListener('click', () => newChat());
	const minimizeButton = /** @type {HTMLButtonElement} */ (
		el('button', 'agent-icon-button agent-panel__minimize')
	);
	minimizeButton.type = 'button';
	minimizeButton.setAttribute('aria-label', 'Minimize agent');
	minimizeButton.setAttribute('aria-controls', PANEL_ID);
	minimizeButton.append(icon('remove'));
	minimizeButton.addEventListener('click', () => minimize());
	// Pushes the header buttons to the right edge (spacing lives here, never on a button).
	const headerSpacer = el('span', 'agent-panel__header-spacer');
	header.append(mark, title, dot, headerSpacer, newChatButton, minimizeButton);

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
	let providerId = '';
	let lastPrompt = '';
	/** Local agent (dev server only): its chip label while on, and the switch. */
	let localChip = null;
	/** @type {{on: Boolean, state: String, stop: Function, dispose: Function} | null} */
	let localAgent = null;
	/** The local agent took a message and has not answered yet. */
	let localBusy = false;
	let disposed = false;
	/** @type {Map<String, HTMLElement>} */
	const toolLines = new Map();
	let runEdits = { changed: false, failed: false, glyphId: '', submitted: [] };
	let adjusting = false;
	let cardCount = 0;
	/** @type {HTMLElement & {render: Function, acted: String|null} | null} */
	let approvalCard = null;
	/** @type {ReturnType<typeof createCheckpointLine> | null} */
	let checkpointLine = null;
	/** Receipts whose Keep N follows live statuses until they are acted on. */
	const liveReceipts = new Set();

	const controller =
		providedController ||
		createAgentController({ createSession, transport, onEvent: (event) => onEvent(event) });

	// ---- Runs (M7) ----
	const runs = createRunController({
		getEditor,
		draft: createGlyphDrafter(controller),
		onEvent: (event) => onRunEvent(event),
		// A chat message (e.g. a small ask while paused) is in flight.
		isBusy: () => !!controller.running || status.running,
	});
	const runBar = createRunBar({
		onPause: () => runs.pause(),
		onResume: () => runAction(() => runs.resume()),
		onStop: () => runs.stop(),
	});

	// ---- Composer ----
	const composer = createPanelComposer({
		onSubmit: (draft) => submit(draft),
		// While Local agent is on, Stop turns it off; otherwise it stops the built-in agent.
		onStop: () => (localAgent?.on ? localAgent.stop() : controller.stop()),
		getReferences: () => controller.references || [],
		onAttachError: (message) => addError({ message }),
	});

	// ---- Composer chips: Model · Mode · Target (PR B) ----
	const modelChip = createModelChip();
	const modeChip = createModeChip({ getEditor });
	const targetChip = createTargetChip({ getEditor });
	composer.tools.append(modelChip.button, modeChip.button, targetChip.button);
	const modelPopover = createPopover({
		anchor: modelChip.button,
		label: 'Model',
		width: 'wide',
		className: 'agent-popover--model',
		onOpen: () => openModelMenu(),
		onClose: () => returnConnectCard(),
		focus: () => connect.focus(),
	});
	// Its own head: what this list is, and the two ways out of it.
	const modelHead = el('div', 'agent-popover__head');
	const changeProvider = /** @type {HTMLButtonElement} */ (
		el('button', 'agent-link-button', 'Change provider')
	);
	changeProvider.type = 'button';
	changeProvider.addEventListener('click', () => {
		connect.open('provider');
		connect.focus();
	});
	const reenterKey = /** @type {HTMLButtonElement} */ (
		el('button', 'agent-link-button', 'Re-enter key')
	);
	reenterKey.type = 'button';
	reenterKey.addEventListener('click', () => {
		connect.open('key');
		connect.focus();
	});
	const modelHeadLinks = el('div', 'agent-popover__links text-body-small');
	modelHeadLinks.append(changeProvider, reenterKey);
	modelHead.append(el('span', 'agent-popover__title text-label', 'Model'), modelHeadLinks);
	modelPopover.root.prepend(modelHead);
	// With a local agent on the chip is its status; the model waits until it is off.
	// The card is already on screen in the empty state: the chip takes you to it instead.
	modelChip.button.addEventListener(
		'click',
		(event) => {
			const cardShowing = empty.isConnected && connect.showsCard && !modelPopover.isOpen;
			if (!localChip && !cardShowing) return;
			event.stopImmediatePropagation();
			if (cardShowing && !localChip) connect.focus();
		},
		true
	);

	function renderModelChip() {
		if (localChip) {
			modelChip.render({ label: localChip, local: true });
			return;
		}
		const tier = connect.connected?.tier;
		modelChip.render({
			// The variant (":free") is the badge; the chip keeps the name.
			label: modelId ? modelLabel(modelId).replace(/:free$/, '') : 'No model',
			...(modelId && tier ? { tier } : {}),
		});
	}

	// ---- Connect card + empty state ----
	const connect = createConnectCard({
		check,
		loadModels,
		storage: providedStorage,
		onViewChange: () => renderEmptyState(),
		onConnected(config) {
			try {
				controller.connect(config);
			} catch (error) {
				addError(error);
				return;
			}
			config.apiKey = '';
		},
	});

	/** Puts the connect card in the model popover (the chat stays where it is). */
	function openModelMenu() {
		modelPopover.body.append(connect.root);
		connect.open(connect.connected ? 'model' : 'key');
	}

	/** The card goes back to the empty state when the popover closes. */
	function returnConnectCard() {
		if (connect.root.parentElement !== empty) empty.append(connect.root);
		renderEmptyState();
	}

	/** Model chip: the empty state's card while it shows, else the popover. */
	function showModelChoice(where = 'model') {
		if (localChip) return;
		if (empty.isConnected && connect.showsCard && !modelPopover.isOpen) {
			connect.open(where);
			connect.focus();
			return;
		}
		if (!modelPopover.isOpen) modelPopover.open();
		if (where !== 'model') {
			connect.open(where);
			connect.focus();
		}
	}

	const empty = el('div', 'agent-panel__empty');
	const emptyMark = el('span', 'agent-mark agent-mark--48');
	emptyMark.setAttribute('aria-hidden', 'true');
	const emptyTitle = el('h2', 'agent-panel__empty-title text-heading', 'What are we drawing?');
	const chips = el('div', 'agent-panel__chips');
	/** 'new' (an empty font) or 'edit' (a loaded font): which suggestions are drawn. */
	let emptyKind = '';
	function drawSuggestions(kind) {
		emptyKind = kind;
		emptyTitle.textContent = kind === 'edit' ? 'What should we change?' : 'What are we drawing?';
		const buttons = (kind === 'edit' ? EDIT_SUGGESTIONS : SUGGESTIONS).map((text) => {
			const button = /** @type {HTMLButtonElement} */ (
				el('button', 'agent-suggestion text-label', text)
			);
			button.type = 'button';
			button.addEventListener('click', () => {
				composer.setValue(text);
				composer.input.focus();
			});
			return button;
		});
		const sketch = /** @type {HTMLButtonElement} */ (el('button', 'agent-suggestion text-label'));
		sketch.type = 'button';
		sketch.append(icon('image'), el('span', '', 'Add a sketch'));
		sketch.addEventListener('click', () => composer.openChooser());
		chips.replaceChildren(...buttons, sketch);
	}
	drawSuggestions('new');
	empty.append(emptyMark, emptyTitle, chips, connect.root);

	function renderEmptyState() {
		const kind = fontHasGlyphs(getEditor()) ? 'edit' : 'new';
		if (kind !== emptyKind) drawSuggestions(kind);
		// A local agent needs no model: its suggestions show while it is on.
		const ready = controller.connected || !!localAgent?.on;
		const cardHere = connect.root.parentElement === empty && connect.showsCard;
		// The suggestions come once a model is connected and the card has stepped aside as the
		// Connected row. While the card shows, the block anchors to the top so it never moves
		// between steps.
		chips.hidden = !(ready && !cardHere);
		empty.toggleAttribute('data-connecting', cardHere && !localAgent?.on);
		connect.root.hidden = !!localAgent?.on && connect.root.parentElement === empty;
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
		if (working()) log.append(typing);
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

	/**
	 * The fixes a provider failure offers in the thread: a link to the provider's page where it
	 * has one, "Change model" and, for a refused key, "Re-enter key". Both open the model chip's
	 * list; the chat stays (bugs 1, 14): the conversation the controller keeps is text only.
	 * @param {ReturnType<typeof describeRunError>} view
	 */
	function errorActions(view) {
		const row = el('div', 'agent-bubble__actions text-body-small');
		for (const link of view.links) {
			const anchor = /** @type {HTMLAnchorElement} */ (el('a', 'agent-link', `${link.label} ↗`));
			anchor.href = link.href;
			anchor.target = '_blank';
			anchor.rel = 'noopener noreferrer';
			row.append(anchor);
		}
		const change = /** @type {HTMLButtonElement} */ (
			el('button', 'agent-link-button', 'Change model')
		);
		change.type = 'button';
		change.addEventListener('click', () => changeModel('model'));
		row.append(change);
		if (view.reenterKey) {
			const again = /** @type {HTMLButtonElement} */ (
				el('button', 'agent-link-button', 'Re-enter key')
			);
			again.type = 'button';
			again.addEventListener('click', () => changeModel('key'));
			row.append(again);
		}
		return row;
	}

	/** The model chip's list, on its model or key step. The chat stays. */
	function changeModel(where) {
		if (controller.running) return;
		showModelChoice(where);
	}

	/** A provider failure whose fixes wait for the request to end (the buttons need an idle agent). */
	let pendingFixes = null;

	/** Put the fixes on the bubble, if they can be used now: not during a request or a whole-set run. */
	function offerFixes() {
		const fixes = pendingFixes;
		pendingFixes = null;
		if (!fixes || controller.running || runs.active || !fixes.bubble.isConnected) return;
		fixes.bubble.append(errorActions(fixes.view));
	}

	function addError(error) {
		const bubble = el('div', 'agent-bubble agent-bubble--agent agent-bubble--error text-body');
		const provided = describeRunError(error, providerId);
		const text = el('span', 'agent-bubble__text', threadCopyFor(error, providerId));
		bubble.append(icon('error', 'agent-bubble__icon'), srOnly('Error: '), text);
		append(bubble);
		if (provided) {
			// The controller reports the error while its request is still open: the fixes follow at 'finish'.
			pendingFixes = { bubble, view: provided };
			if (!controller.running) offerFixes();
		}
		// An error is always brought into view, wherever the reader was.
		thread.scrollTop = thread.scrollHeight;
		return bubble;
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

	/** A chat request or a run's glyph job is in flight. */
	function working() {
		return (
			status.running ||
			!!controller.running ||
			localBusy ||
			['controls', 'drafting'].includes(runs.state)
		);
	}

	function renderStatus() {
		const run = runs.view;
		const drafting = ['controls', 'drafting'].includes(run.state);
		const running = working();
		dot.hidden = !running;
		panel.toggleAttribute('data-running', running);
		if (!running) typing.remove();
		else if (!typing.isConnected && !empty.isConnected) {
			const follow = atBottom();
			log.append(typing);
			if (follow) thread.scrollTop = thread.scrollHeight;
		}
		const review = reviewCount();
		const inRun = drafting || run.state === 'paused';
		const gate = run.state === 'plan' ? 'plan' : run.state === 'style' ? 'style' : undefined;
		pill.render({
			phase: derivePillPhase({
				...status,
				running,
				paused: status.paused || run.state === 'paused',
				gate,
				review,
			}),
			glyph: inRun ? run.glyph : status.glyph,
			done: inRun ? run.done : status.done,
			total: inRun ? run.total : status.total,
			review,
			gate,
			pauseReason: run.pauseReason,
			compact: matches(PHONE_QUERY),
		});
		runBar.render(run);
		newChatButton.disabled = !canStartNewChat();
		checkpointLine?.setEnabled((run.drawn || []).length > 0);
		refreshReceipts();
	}

	// ---- Receipts follow live statuses (Keep N always matches) ----
	function receiptRows(ids) {
		const store = getEditor()?.glyphStatus;
		return ids.map((id) => {
			const record = store?.get(id);
			const status = record?.status;
			let row = 'kept';
			if (status === 'queued' || status === 'drafting') row = 'working';
			else if (status === 'yours') row = 'yours';
			else if (status === 'empty') row = 'reverted';
			else if (status === 'draft')
				row = record.preDraft && record.preDraft.glyph === null ? 'new' : 'changed';
			else if (status === 'failed') row = 'failed';
			return { char: charOf(id), status: row };
		});
	}

	function refreshReceipts() {
		for (const entry of liveReceipts) {
			const { card, ids } = entry;
			if (!card.isConnected) {
				liveReceipts.delete(entry);
				continue;
			}
			// Mid-action (Keep / Retry): reopenReceipt redraws it right after.
			if (card.acted) continue;
			const rows = receiptRows(ids);
			const key = JSON.stringify(rows);
			if (key === entry.key) continue;
			entry.key = key;
			const focused = /** @type {HTMLElement} */ (document.activeElement);
			const action = card.contains(focused) ? focused.dataset?.action : null;
			card.render({ ...card.data, glyphs: rows, project: getEditor()?.project });
			if (action) card.querySelector(`[data-action="${action}"]`)?.focus();
		}
	}

	/**
	 * A receipt for glyph IDs; its counts follow live statuses until acted on.
	 * @param {String} kind - 'run' | 'chat'
	 * @param {Array<String>} ids
	 */
	function addReceipt(kind, ids) {
		const rows = receiptRows(ids);
		const card = /** @type {any} */ (
			addCard('agent-receipt-card', {
				cardId: `${kind}-receipt-${++cardCount}`,
				glyphs: rows,
				project: getEditor()?.project,
			})
		);
		liveReceipts.add({ card, ids, key: JSON.stringify(rows) });
		return card;
	}

	/** A tool event's step line (the built-in agent's and the local agent's calls). */
	function showTool(event) {
		const name = String(event.name || '').replaceAll('_', ' ');
		if (event.state === 'running') {
			toolLines.set(event.name, addStep('info', `${name}…`));
		} else {
			const ok = event.state === 'done';
			if (EDIT_TOOLS.has(event.name)) {
				if (ok && event.result?.changed) runEdits.changed = true;
				if (!ok) runEdits.failed = true;
				const submittedId = event.result?.glyph?.glyphId;
				if (event.name === 'submit_glyph' && ok && event.result?.changed && submittedId)
					runEdits.submitted.push(submittedId);
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
	}

	// ---- Controller events → thread ----
	function onEvent(event) {
		switch (event.type) {
			case 'clear':
				resetThread();
				showEmpty();
				break;
			case 'start':
				// The conversation begins: the empty state (and its connect card) goes.
				empty.remove();
				status.running = true;
				status.failed = false;
				status.glyph = charForGlyphId(event.context?.glyphId);
				runEdits = {
					changed: false,
					failed: false,
					glyphId: event.context?.glyphId || '',
					submitted: [],
				};
				lastPrompt = event.prompt;
				toolLines.clear();
				composer.clear();
				composer.setBusy(true);
				addBubble(event.prompt, 'user', event.attachments || []);
				break;
			case 'text':
				addBubble(event.text, 'agent');
				break;
			case 'tool':
				showTool(event);
				break;
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
				offerFixes();
				// Small asks get a receipt only (no plan, no gate).
				if (runEdits.submitted.length) {
					addReceipt('chat', [...new Set(runEdits.submitted)]);
				} else {
					const char = charForGlyphId(runEdits.glyphId);
					if (char && (runEdits.changed || runEdits.failed)) {
						addCard('agent-receipt-card', {
							cardId: `chat-receipt-${++cardCount}`,
							glyphs: [{ char, status: runEdits.changed ? 'changed' : 'failed' }],
							project: getEditor()?.project,
						});
					}
				}
				break;
			}
			case 'connection':
				modelId = event.connected ? event.model : '';
				providerId = event.connected ? event.provider : '';
				renderModelChip();
				if (event.connected) modelPopover.close({ restoreFocus: false });
				// A disconnect also drops the list (and the key copy kept for it).
				if (!event.connected) connect.reset();
				renderEmptyState();
				// The Connected row is the feedback; the composer is the next step.
				if (event.connected) composer.input.focus();
				break;
			default:
				break;
		}
		renderStatus();
	}

	// ---- Send ----
	async function submit({ prompt, attachments }) {
		// A local agent on: the message goes to it, not the built-in model (bug 30).
		if (localAgent?.on) {
			empty.remove();
			const sent = await localAgent.send({
				prompt,
				attachments,
				controls: readAgentControls(getEditor()),
			});
			if (sent) composer.clear();
			return;
		}
		if (!controller.connected) {
			const online = await probe();
			addError({ code: online ? 'NO_MODEL' : 'RELAY_OFFLINE' });
			if (online) connect.focus();
			return;
		}
		const runState = runs.state;
		if (runState === 'controls' || runState === 'drafting') {
			// The draft stays in the composer.
			addStep('info', 'The run is drafting · pause it to chat');
			return;
		}
		if (runState === 'style') {
			// Gate 2: the message is the tweak.
			userMessage(prompt, attachments);
			if (approvalCard && !approvalCard.acted) approvalCard.act('tweak');
			const note = prompt.replace(/^\s*tweak\s*:?\s*/i, '');
			runAction(() => runs.tweak(note));
			return;
		}
		if (runState === 'plan' || adjusting) {
			// Gate 1: the message adjusts the plan.
			const base = runs.run?.plan?.brief || '';
			const note = prompt.replace(/^\s*adjust\s*:?\s*/i, '');
			userMessage(prompt, attachments);
			proposeRun([base, note].filter(Boolean).join('. '), attachments);
			return;
		}
		const ask = classifyAsk(prompt);
		if (ask.kind === 'run' && runState === 'paused') {
			// The paused run still owns its Queued glyphs; the draft stays here.
			addError({ message: 'Finish or stop the current run first' });
			return;
		}
		if (ask.kind === 'run') {
			userMessage(prompt, attachments);
			proposeRun(prompt, attachments);
			return;
		}
		try {
			// "Fix the g": job tools draw by glyph ID, so no glyph needs to be open.
			if (ask.char) await controller.run(prompt, attachments, { requireGlyph: false });
			else await controller.run(prompt, attachments);
		} catch (error) {
			// Rejected before the run started; the draft stays in the composer.
			addError(error);
		}
	}

	/** The user's message for a run (the chat path adds its own on 'start'). */
	function userMessage(prompt, attachments = []) {
		empty.remove();
		composer.clear();
		addBubble(prompt, 'user', attachments);
	}

	function proposeRun(brief, attachments = []) {
		adjusting = false;
		try {
			runs.propose({ brief, attachments });
		} catch (error) {
			addError(error);
		}
	}

	/** Runs a run-controller call and reports a rejection in the thread. */
	function runAction(call) {
		Promise.resolve()
			.then(call)
			.catch((error) => addError(error));
	}

	// ---- Run events → thread ----
	function onRunEvent(event) {
		const run = event.run || {};
		switch (event.type) {
			case 'plan': {
				const plan = event.plan;
				addBubble('Here’s the plan', 'agent');
				addCard('agent-plan-card', {
					cardId: `run-plan-${++cardCount}`,
					spendCap: plan.spendLabel,
					specs: plan.spec.filter((spec) => PLAN_SPEC_KEYS.includes(spec.key)),
					order: plan.groups,
				});
				break;
			}
			case 'checkpoint':
				checkpointLine = createCheckpointLine({ onRevert: () => revertTheRun() });
				append(checkpointLine.root);
				break;
			case 'gate': {
				const chars = event.ids.map(charOf);
				addBubble(`Drew ${chars.join(' ')}. Does this feel right?`, 'agent');
				approvalCard = /** @type {any} */ (
					addCard('agent-approval-card', {
						cardId: `run-style-${++cardCount}`,
						glyphs: chars,
						project: getEditor()?.project,
					})
				);
				break;
			}
			case 'progress':
				if (event.phase === 'skipped') {
					const why = {
						yours: 'Yours',
						open: 'open in the editor',
						taken: 'you took it over',
					}[event.reason];
					addStep('yours', `Skipped ${event.char} · ${why || 'locked'}`);
				}
				break;
			case 'group':
				addBubble(`${event.label} drafted`, 'agent');
				addReceipt(
					'run',
					event.rows.map((row) => row.id)
				);
				break;
			case 'paused':
				if (event.reason === 'cap')
					addStep(
						'info',
						`Spend cap reached · ${formatDollars(event.spent)} · Resume allows ${formatDollars(
							runs.run?.plan?.spendCap || 0
						)} more`
					);
				else if (event.reason === 'error')
					addError({
						message: `${event.message || 'The provider did not answer'} · run paused, Resume to try again`,
					});
				else addStep('info', `Paused · ${run.done}/${run.total}`);
				break;
			case 'busy':
				addStep('info', 'The agent is answering a message · resume when it finishes');
				break;
			case 'stopped':
				addStep('info', `Stopped · ${run.done}/${run.total} · the unfinished draft was discarded`);
				break;
			case 'done': {
				const review = reviewCount();
				addStep('kept', review ? `Run finished · ${review} to review` : 'Run finished');
				break;
			}
			default:
				break;
		}
		renderStatus();
		// Gates, receipts and pauses ask for the user: bring them into view.
		if (['plan', 'gate', 'group', 'paused', 'stopped', 'done', 'busy'].includes(event.type))
			thread.scrollTop = thread.scrollHeight;
	}

	function revertTheRun() {
		const run = runs.run;
		if (!run) return;
		const result = revertRun(getEditor(), run);
		if (!result.ok) {
			addError(result.error || {});
			return;
		}
		const kept = result.kept.length ? ` · ${result.kept.length} kept (Yours or edited)` : '';
		const n = result.reverted.length;
		checkpointLine?.finish(`Run reverted · ${n} ${n === 1 ? 'glyph' : 'glyphs'}${kept}`);
	}

	// Retry from a Failed tile (glyph-grid.js).
	const onRetryGlyphs = (event) => {
		const ids = /** @type {CustomEvent} */ (event).detail?.ids || [];
		retryGlyphs(ids);
	};
	document.addEventListener(RETRY_GLYPHS_EVENT, onRetryGlyphs);

	function retryGlyphs(ids) {
		if (!controller.connected) {
			addError({ code: 'NO_MODEL' });
			return;
		}
		if (status.running) {
			addStep('info', 'The agent is busy · retry when it finishes');
			return;
		}
		const chars = ids.map(charOf).join(' ');
		if (chars) addStep('info', `Retrying ${chars}`);
		runAction(() => runs.retry(ids));
	}

	// ---- Card actions → run controller / review ----
	/**
	 * Re-opens the style gate card after Tweak or Edit by hand, so Approve
	 * stays available until the tweak is actually sent.
	 * @param {any} card
	 * @param {{tone: String, text: String}} line
	 */
	function reopenGate(card, line) {
		if (runs.state !== 'style' || card !== approvalCard) return;
		card.render({ ...(card.data || {}), project: getEditor()?.project });
		addStep(line.tone, line.text);
	}

	/**
	 * A live receipt stays usable after Keep or Retry (Keep N and Retry k are
	 * separate jobs): it is redrawn from live statuses and the result line
	 * goes to the thread.
	 * @param {any} card
	 * @param {{tone: String, text: String} | null} line
	 * @returns {Boolean} whether the card was a live receipt
	 */
	function reopenReceipt(card, line) {
		const entry = [...liveReceipts].find((item) => item.card === card);
		if (!entry) return false;
		const rows = receiptRows(entry.ids);
		entry.key = JSON.stringify(rows);
		card.render({ ...card.data, glyphs: rows, project: getEditor()?.project });
		const next =
			card.querySelector('button[data-action="retry"]') ||
			card.querySelector('button[data-action="keep"]');
		if (next) next.focus();
		if (line) addStep(line.tone, line.text);
		return true;
	}

	/**
	 * Undo Drafts from a receipt: back to what they were before, one history entry.
	 * @param {any} card
	 * @param {Array<String>} ids
	 */
	function undoGlyphs(card, ids) {
		const result = revertGlyphs(getEditor(), ids);
		const n = result.reverted.length;
		const line = {
			tone: result.ok ? 'info' : 'failed',
			text: result.ok
				? n
					? `Undid ${result.reverted.map(charOf).join(' ')}`
					: 'Nothing to undo'
				: result.error?.message || 'Not undone',
		};
		if (!reopenReceipt(card, line)) {
			const own = card?.lastElementChild;
			if (own?.tagName === 'AGENT-STEP-LINE') own.render(line);
			else addStep(line.tone, line.text);
		}
		renderStatus();
	}

	/**
	 * Retry on a Draft: ask whoever is drawing (the local agent or the model) for another take.
	 * The Draft stays until the new one lands, so a failed retry loses nothing.
	 * @param {any} card
	 * @param {Array<String>} ids
	 */
	function redoGlyphs(card, ids) {
		const chars = ids.map(charOf).join(' ');
		const prompt = `Redraw ${chars}: try a different take, same style.`;
		reopenReceipt(card, null);
		if (localAgent?.on) {
			localAgent.send({ prompt, attachments: [], controls: readAgentControls(getEditor()) });
			return;
		}
		if (!controller.connected) {
			addError({ code: 'NO_MODEL' });
			return;
		}
		if (controller.running || runs.active) {
			addStep('info', 'The agent is busy · retry when it finishes');
			return;
		}
		controller.run(prompt, [], { requireGlyph: false }).catch((error) => addError(error));
	}

	host.addEventListener(CARD_ACTION_EVENT, (event) => {
		const detail = /** @type {CustomEvent} */ (event).detail || {};
		const card = /** @type {any} */ (event.target);
		const cardId = String(detail.cardId || '');
		// Per-glyph receipt actions (PR B) are the receipt's own, for one glyph.
		const glyphAction = String(detail.action || '').endsWith('-one');
		if (glyphAction) detail.action = String(detail.action).slice(0, -4);
		if (detail.action === 'undo') {
			undoGlyphs(card, detail.glyphIds || []);
			return;
		}
		if (detail.action === 'retry') {
			const store = getEditor()?.glyphStatus;
			const drafts = (detail.glyphIds || []).filter((id) => store?.getStatus(id) === 'draft');
			if (drafts.length) {
				redoGlyphs(card, drafts);
				return;
			}
		}
		if (detail.action === 'start') {
			runAction(() => runs.start());
			return;
		}
		if (detail.action === 'adjust') {
			runs.adjust();
			adjusting = true;
			composer.setValue('Adjust: ');
			composer.input.focus();
			return;
		}
		if (detail.action === 'approve') {
			runAction(() => runs.approve());
			return;
		}
		if (detail.action === 'tweak') {
			reopenGate(card, { tone: 'yours', text: 'Tweak · say what to change and send' });
			composer.setValue(detail.prefill || 'Tweak: ');
			composer.input.focus();
			return;
		}
		if (detail.action === 'edit-by-hand') {
			reopenGate(card, {
				tone: 'yours',
				text: detail.char ? `Editing ${detail.char} by hand · Approve when ready` : 'Editing by hand',
			});
			if (detail.glyphId) openGlyph(detail.glyphId);
			return;
		}
		if (detail.action === 'keep') {
			// Keep all for this receipt: Drafts only, one history entry.
			const result = keepGlyphs(getEditor(), detail.glyphIds || []);
			const n = result.kept.length;
			const line = {
				tone: result.ok ? 'kept' : 'failed',
				text: result.ok
					? `Kept ${n} ${n === 1 ? 'glyph' : 'glyphs'}`
					: result.error?.message || 'Not kept',
			};
			if (!reopenReceipt(card, line)) {
				const own = card?.lastElementChild;
				if (own?.tagName === 'AGENT-STEP-LINE') own.render(line);
			}
			renderStatus();
			return;
		}
		if (detail.action === 'retry' && cardId.startsWith('run-')) {
			reopenReceipt(card, null);
			retryGlyphs(detail.glyphIds || []);
			return;
		}
		if (detail.action === 'retry') {
			const failedIds = detail.glyphIds || [];
			// A small ask's failed job glyph: retry it as a scoped glyph job.
			if (failedIds.length && getEditor()?.glyphStatus?.getStatus(failedIds[0]) === 'failed') {
				if (!reopenReceipt(card, null)) {
					const own = card?.lastElementChild;
					if (own?.tagName === 'AGENT-STEP-LINE') own.remove();
				}
				retryGlyphs(failedIds);
				return;
			}
			if (!lastPrompt || controller.running || !controller.connected) {
				addError({
					code: controller.connected ? undefined : 'NO_MODEL',
					message: 'Nothing to retry yet',
				});
				return;
			}
			controller.run(lastPrompt, []).catch((error) => addError(error));
		}
	});

	// ---- New chat (bug 20) ----
	/** Forget what the thread tracks; the cards themselves go with the thread. */
	function resetThread() {
		closeAllPopovers();
		liveReceipts.clear();
		toolLines.clear();
		approvalCard = null;
		checkpointLine = null;
		adjusting = false;
		lastPrompt = '';
		pendingFixes = null;
	}

	/** Something to clear, and nothing working that the thread would lose track of. */
	function canStartNewChat() {
		return empty.parentElement !== log && !working() && !runs.active && !localBusy;
	}

	function newChat() {
		if (!canStartNewChat()) return;
		try {
			// The controller forgets the conversation and emits 'clear' (the empty state).
			controller.clear();
		} catch (error) {
			addError(error);
			return;
		}
		if (empty.parentElement !== log) {
			resetThread();
			showEmpty();
		}
		renderStatus();
		composer.input.focus();
	}

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
		closeAllPopovers();
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

	// ---- Local agent (dev server only) ----
	if (import.meta.env.DEV && loadLocalAgent) {
		probeLocal()
			.then((available) => (available ? loadLocalAgent() : null))
			.then((module) => {
				if (!module || disposed) return;
				localAgent = module.mountLocalAgent({
					header,
					before: newChatButton,
					setChip(label) {
						localChip = label;
						if (label) modelPopover.close({ restoreFocus: false });
						renderModelChip();
						const client = label?.endsWith(' · connected') ? label.slice(0, -12) : '';
						composer.setPlaceholder(
							client ? `Message ${client}` : label ? 'Message your local agent' : 'Ask the agent'
						);
					},
					setBusy(busy) {
						localBusy = busy;
						composer.setBusy(busy || !!controller.running);
						renderStatus();
					},
					setRouting() {
						renderEmptyState();
						renderStatus();
					},
					addBubble,
					append,
					addStep,
					addError,
					showTool,
					addReceipt: (ids) => addReceipt('chat', ids),
					isBusy: () => working() || runs.active,
					createSession,
				});
			})
			.catch(() => {
				/* No Local agent: the panel works as before. */
			});
	}
	// ---- Tabs: Agent | Chaos (the Chaos tab shows once a chaos tool is registered, PR C) ----
	const agentTab = el('div', 'agent-panel__tab agent-panel__tab--agent');
	agentTab.append(
		thread,
		runBar.root,
		composer.root,
		modelPopover.root,
		modeChip.popover.root,
		targetChip.popover.root
	);
	const chaosTab = el('div', 'agent-panel__tab agent-panel__tab--chaos');
	const tabs = createPanelTabs({
		panels: { agent: agentTab, chaos: chaosTab },
		onSelect: () => closeAllPopovers(),
	});
	header.insertBefore(tabs.root, title);
	/** @type {Array<Function>} */
	let chaosDisposers = [];
	function renderChaosTab() {
		const list = listChaosTools();
		const shown = list.length > 0;
		tabs.root.hidden = !shown;
		title.hidden = shown;
		if (!shown && tabs.current !== 'agent') tabs.select('agent');
		chaosDisposers.forEach((dispose) => dispose());
		chaosDisposers = [];
		chaosTab.replaceChildren();
		for (const tool of list) {
			const block = el('section', 'agent-chaos-tool');
			block.dataset.tool = tool.id;
			block.setAttribute('aria-label', tool.label);
			chaosTab.append(block);
			try {
				const dispose = tool.mount(block, { getEditor });
				if (typeof dispose === 'function') chaosDisposers.push(dispose);
			} catch {
				block.remove();
			}
		}
	}
	const offChaos = onChaosToolsChange(() => renderChaosTab());
	renderChaosTab();
	// The target follows the grid selection and the open glyph.
	const offControls = onControlsChange(() => renderStatus());

	panel.append(header, agentTab, chaosTab);
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
		runs,
		runBar,
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
		/** Re-read counts (review store), the chips and the empty state; redraw the pill and dot. */
		refreshStatus() {
			modeChip.render();
			targetChip.render();
			if (empty.isConnected) renderEmptyState();
			renderStatus();
		},
		modelChip,
		modeChip,
		targetChip,
		tabs,
		newChatButton,
		/**
		 * Run progress for the pill until M7's queue reports it.
		 * @param {{glyph?: String, done?: Number, total?: Number, paused?: Boolean}} partial
		 */
		setRunStatus(partial = {}) {
			Object.assign(status, partial);
			renderStatus();
		},
		/** The Local agent switch once mounted (dev server only), else null. */
		get localAgent() {
			return localAgent;
		},
		dispose() {
			disposed = true;
			closeAllPopovers();
			offChaos();
			offControls();
			chaosDisposers.forEach((dispose) => dispose());
			modeChip.dispose();
			targetChip.dispose();
			localAgent?.dispose();
			document.removeEventListener('keydown', onDocumentKey);
			document.removeEventListener(RETRY_GLYPHS_EVENT, onRetryGlyphs);
			if (runs.active) runs.stop();
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
		// The Target chip follows the glyph open in the editor (stepping prev / next too).
		editor?.subscribe?.({
			topic: 'whichGlyphIsSelected',
			subscriberID: 'agentPanel',
			callback: () => singleton?.refreshStatus(),
		});
	} catch {
		/* The pill falls back to counts read on each render. */
	}
	singleton.refreshStatus();
	return singleton;
}

/** Read-only: true while the agent has a request in flight or a run going. */
export function isAgentRunning() {
	return !!singleton?.controller.running || !!singleton?.runs.busy;
}

/** Test helper: drops the singleton. */
export function resetAgentPanelForTests() {
	singleton?.dispose();
	singleton = null;
}
