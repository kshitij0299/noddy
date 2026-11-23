/**
 * Agent panel composer (#126): the vanilla facade around the React island in
 * ./composer/agent-composer.jsx (ui-sdk). The panel keeps talking to this small API; the island
 * renders the box (attachments, the textarea, + menu, Target, Model, Send).
 *
 * `root` is the <form>: Enter (no Shift) and the Send button submit it, and while a run is in
 * flight the same button is Stop (minimizing and Esc never stop a run). Typing stays possible
 * during a run. Mode, chaos, Telephone and Target live in ../agent-controls.js.
 *
 * Attachment reading and limits come from ../attachments.js (kept plumbing). The island renders
 * synchronously (flushSync), so `input`, `send` and the buttons exist as soon as this returns.
 */
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { createInputController } from '@ui-sdk/react/textarea';
import { createTriggerMenuController } from '@ui-sdk/react/trigger-menu';
import { onControlsChange } from '../agent-controls.js';
import { ATTACHMENT_ACCEPT, prepareAttachment, validateAttachmentSet } from '../attachments.js';
import { el, icon } from './cards/card-shell.js';
import { AgentComposer } from './composer/agent-composer.jsx';
import './composer/agent-composer.css';

/** A tiny store the island reads with useSyncExternalStore. */
function createStore(initial) {
	let state = initial;
	const listeners = new Set();
	return {
		get: () => state,
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
		set(patch) {
			state = { ...state, ...patch };
			for (const listener of [...listeners]) listener();
		},
	};
}

/** Whether a drag carries files (not text or a link dragged from the page). */
function carriesFiles(event) {
	return [...(event.dataTransfer?.types || [])].includes('Files');
}

/**
 * @param {Object} options
 * @param {(draft: {prompt: String, attachments: Object[]}) => (void|Promise<void>)} options.onSubmit
 * @param {() => void} [options.onStop]
 * @param {() => Object[]} [options.getReferences] - attachments already in the conversation
 * @param {(file: File) => Promise<Object>} [options.readAttachment]
 * @param {(message: String) => void} [options.onAttachError]
 * @param {() => any} [options.getEditor] - for Mode and Target
 */
export function createPanelComposer({
	onSubmit,
	onStop = () => {},
	getReferences = () => [],
	readAttachment = prepareAttachment,
	onAttachError = () => {},
	getEditor = () => null,
}) {
	const root = /** @type {HTMLFormElement} */ (el('form', 'agent-composer'));
	root.noValidate = true;
	const mount = el('div', 'agent-composer__island');
	// Popups (menus, tooltips, the chaos popover) render here: inside the panel, so the panel's
	// key guard and Esc handling see their keys, and they leave with it.
	const popups = el('div', 'agent-composer__popups');

	const chooser = /** @type {HTMLInputElement} */ (el('input'));
	chooser.type = 'file';
	chooser.accept = ATTACHMENT_ACCEPT;
	chooser.multiple = true;
	chooser.hidden = true;
	chooser.tabIndex = -1;
	root.append(mount, popups, chooser);

	const store = createStore({
		busy: false,
		preparing: false,
		disposed: false,
		hasText: false,
		attachments: [],
		placeholder: 'Ask the agent',
		starters: [],
		model: { label: 'No model', tier: undefined, local: false },
		version: 0,
	});
	const inputController = createInputController();
	// The `/` list and the tooltips, so Esc and Enter can reach them from here (see onKey below).
	const slashMenu = createTriggerMenuController();
	/** @type {Set<{isOpen: () => boolean, close: (options?: Object) => boolean}>} */
	const tooltips = new Set();
	// clear() and dispose() bump `epoch`: files still being read then are dropped. Each addFiles
	// call holds a token in `reading` while it reads, so overlapping batches all land.
	let epoch = 0;
	/** @type {Set<Object>} */
	const reading = new Set();

	/** Store writes land in the DOM before the call returns (the panel and tests read it). */
	function update(patch) {
		flushSync(() => store.set(patch));
	}

	const actions = {
		openChooser: () => openChooser(),
		removeAttachment(id) {
			update({ attachments: store.get().attachments.filter((item) => item.id !== id) });
			input.focus();
		},
		/** A starter from the + menu goes in at the caret; the draft stays (and Cmd-Z works). */
		useStarter(text) {
			insertAtCaret(text);
		},
		submitFromKeyboard() {
			if (!store.get().busy) root.requestSubmit();
		},
		/** The `/` list wants to open or close: keep a match Esc dismissed closed while typing. */
		slashOpenChange(open, details) {
			if (!open || dismissedAt === null || details?.reason !== 'input-change') return;
			if (input.value[dismissedAt] !== '/') dismissedAt = null;
			else if (slashMenu.getMatch()?.start === dismissedAt) details.cancel?.();
		},
	};

	const reactRoot = createRoot(mount);
	flushSync(() =>
		reactRoot.render(
			createElement(AgentComposer, {
				store,
				getEditor,
				container: popups,
				inputController,
				slashMenu,
				tooltips,
				actions,
			})
		)
	);

	const input = /** @type {HTMLTextAreaElement} */ (mount.querySelector('textarea'));
	const send = /** @type {HTMLButtonElement} */ (mount.querySelector('.agent-composer__send'));
	const plus = /** @type {HTMLButtonElement} */ (mount.querySelector('.agent-composer__plus'));
	const target = /** @type {HTMLButtonElement} */ (mount.querySelector('.agent-composer__target'));
	const modelButton = /** @type {HTMLButtonElement} */ (
		mount.querySelector('.agent-composer__model')
	);

	// ui-sdk closes the `/` list and tooltips from a `keydown` listener on `document`, but the
	// panel's key guard stops keys at the panel, so that listener never hears them. Handle the
	// two keys here, first (capture), through the controllers:
	// - Esc closes the open `/` list (ui-sdk then dismisses the match, so typing on does not
	//   reopen it), or else a tooltip opened by keyboard focus. Only that: the panel is told the
	//   Esc was used (handledEscape) and does not blur the input or minimize.
	// - Enter with nothing matching closes the list, so the message sends.
	// Menus and the chaos popover handle their own Esc on their content; they are left alone.
	/** @type {WeakSet<Event>} */
	const usedEscapes = new WeakSet();
	// Where the `/` match Esc closed starts: typing on in that same match keeps it closed, as
	// ui-sdk's own Esc does (the controller can close a match but not dismiss it).
	/** @type {Number|null} */
	let dismissedAt = null;
	function onKey(event) {
		if (event.isComposing || event.keyCode === 229) return;
		if (event.key === 'Escape') {
			if (slashMenu.isOpen()) {
				dismissedAt = slashMenu.getMatch()?.start ?? null;
				slashMenu.close({ reason: 'escape-key', event });
				usedEscapes.add(event);
				return;
			}
			// The next Esc leaves the field, as it does with no `/` typed (ui-sdk would otherwise
			// take it to dismiss the match it still thinks is live).
			if (event.target === input && dismissedAt !== null) {
				input.blur();
				usedEscapes.add(event);
				return;
			}
			// Focus inside a popup (a menu) means that popup owns this Esc.
			if (popups.contains(/** @type {Node} */ (event.target))) return;
			for (const tooltip of tooltips) {
				if (tooltip.isOpen()) {
					tooltip.close({ reason: 'escape-key', event });
					usedEscapes.add(event);
				}
			}
			return;
		}
		const plainEnter =
			event.key === 'Enter' && !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;
		// `data-empty` is ui-sdk's documented mark on TriggerMenuEmpty while nothing matches.
		if (plainEnter && slashMenu.isOpen() && popups.querySelector('.agent-menu--slash [data-empty]'))
			slashMenu.close({ reason: 'escape-key', event });
	}
	root.addEventListener('keydown', onKey, true);

	// The box's focus ring is for keyboard focus. A text field matches :focus-visible on a click
	// too (and on focus from code after a click, like opening the panel from its pill), so note
	// whether the last input was a pointer or a key and drop the ring for a pointer's focus.
	let lastPointer = false;
	const onAnyPointer = () => (lastPointer = true);
	const onAnyKey = () => (lastPointer = false);
	document.addEventListener('pointerdown', onAnyPointer, true);
	document.addEventListener('keydown', onAnyKey, true);
	// ui-sdk menu triggers open on press and cancel the press's default, so the browser never
	// sets :active on + or Target. Mark the pressed control (interaction.css styles
	// [data-pressed] like :active) until the pointer lifts.
	/** @type {Element|null} */
	let pressed = null;
	const release = () => {
		pressed?.removeAttribute('data-pressed');
		pressed = null;
	};
	const onPointerDown = (event) => {
		release();
		const control = /** @type {Element} */ (event.target)?.closest?.('.nd-control');
		if (
			control &&
			mount.contains(control) &&
			!control.matches(':disabled, [aria-disabled="true"]')
		) {
			pressed = control;
			control.setAttribute('data-pressed', '');
		}
	};
	root.addEventListener('pointerdown', onPointerDown, true);
	window.addEventListener('pointerup', release, true);
	window.addEventListener('pointercancel', release, true);
	const onFocusIn = () => root.toggleAttribute('data-pointer-focus', lastPointer);
	const onFocusOut = () => root.removeAttribute('data-pointer-focus');
	input.addEventListener('focus', onFocusIn);
	input.addEventListener('blur', onFocusOut);

	function syncText() {
		if (dismissedAt !== null && input.value[dismissedAt] !== '/') dismissedAt = null;
		const hasText = !!input.value.trim();
		if (hasText !== store.get().hasText) update({ hasText });
	}
	// Native listener: it also sees values written from code.
	input.addEventListener('input', syncText);

	function setValue(prompt, files) {
		input.value = prompt;
		input.dispatchEvent(new Event('input', { bubbles: true }));
		update({
			hasText: !!prompt.trim(),
			...(files ? { attachments: [...files] } : {}),
		});
	}

	/** Inserts `text` at the caret, with a space before it when it would touch a word. */
	function insertAtCaret(text) {
		input.focus();
		const start = input.selectionStart ?? input.value.length;
		const end = input.selectionEnd ?? start;
		const before = input.value.slice(0, start);
		const piece = (before && !/\s$/.test(before) ? ' ' : '') + text;
		// execCommand keeps the browser's undo stack; jsdom and old engines fall back.
		let done = false;
		try {
			done = !!document.execCommand?.('insertText', false, piece);
		} catch {
			done = false;
		}
		if (!done) {
			input.setRangeText(piece, start, end, 'end');
			input.dispatchEvent(new Event('input', { bubbles: true }));
		}
		syncText();
	}

	function openChooser() {
		if (!store.get().busy && !store.get().disposed) chooser.click();
	}

	/**
	 * Reads `files` one by one and commits each to the live list as soon as it is read, so a
	 * removal or another batch while this one reads is kept.
	 */
	async function addFiles(files) {
		const { busy, disposed } = store.get();
		if (busy || disposed) return;
		const run = epoch;
		const token = {};
		reading.add(token);
		update({ preparing: true });
		try {
			for (const file of Array.from(files || [])) {
				try {
					validateAttachmentSet([
						...getReferences(),
						...store.get().attachments,
						{ kind: 'pending' },
					]);
					const attachment = await readAttachment(file);
					if (run !== epoch) return;
					const current = store.get().attachments;
					validateAttachmentSet([...getReferences(), ...current, attachment]);
					update({ attachments: [...current, attachment] });
				} catch (error) {
					if (run !== epoch) return;
					onAttachError(error.message);
				}
			}
		} finally {
			reading.delete(token);
			if (run === epoch && !reading.size) {
				chooser.value = '';
				update({ preparing: false });
			}
		}
	}

	chooser.addEventListener('change', () => addFiles(chooser.files));
	root.addEventListener('paste', (event) => {
		event.stopPropagation();
		if (event.clipboardData?.files?.length) {
			event.preventDefault();
			addFiles(event.clipboardData.files);
		}
	});
	root.addEventListener('submit', async (event) => {
		event.preventDefault();
		const { busy, disposed, preparing, attachments } = store.get();
		if (disposed) return;
		if (busy) {
			onStop();
			return;
		}
		if (preparing || (!input.value.trim() && !attachments.length)) return;
		await onSubmit({ prompt: input.value, attachments: [...attachments] });
	});

	const offControls = onControlsChange(() => refresh());
	function refresh() {
		if (!store.get().disposed) update({ version: store.get().version + 1 });
	}

	/** @type {Array<() => void>} */
	const dropZones = [];

	return {
		root,
		input,
		send,
		/** The + menu's button (sketch, mode, starters). */
		plus,
		/** The Target chip. */
		target,
		/** The Model chip: the panel anchors the model list to `button`. */
		model: {
			button: modelButton,
			get label() {
				return /** @type {HTMLElement} */ (
					modelButton.querySelector('.agent-composer__chip-label')
				);
			},
			/** @param {{label: String, tier?: 'free'|'paid', local?: Boolean}} view */
			render({ label, tier, local = false }) {
				update({ model: { label, tier, local } });
			},
		},
		addFiles,
		/** The `/` list's ui-sdk controller (isOpen, open, close). */
		slashMenu,
		/** True for an Esc the composer used itself (it closed the `/` list or a tooltip). */
		handledEscape(event) {
			return event.defaultPrevented || usedEscapes.has(event);
		},
		/** Re-read Mode and Target (the open glyph changed, which sends no controls event). */
		refresh,
		/** The + menu's "Start with" rows. */
		setStarters(list) {
			const now = store.get().starters;
			if (list.length === now.length && list.every((text, i) => text === now[i])) return;
			update({ starters: [...list] });
		},
		/**
		 * Dropping files anywhere on `zone` attaches them, with an overlay while dragging.
		 * @param {HTMLElement} zone
		 * @param {Object} [options]
		 * @param {() => void} [options.onDrop] - runs before the files are read (the panel shows
		 *   its Agent tab, so a drop on the Tools tab lands where the user can see it)
		 */
		bindDropZone(zone, { onDrop: beforeDrop = () => {} } = {}) {
			const overlay = el('div', 'agent-drop-overlay');
			overlay.hidden = true;
			overlay.setAttribute('aria-hidden', 'true');
			overlay.append(icon('add_photo_alternate'), el('span', 'text-label', 'Drop to attach'));
			zone.append(overlay);
			let depth = 0;
			const show = (on) => {
				overlay.hidden = !on;
				if (!on) depth = 0;
			};
			const onEnter = (event) => {
				if (!carriesFiles(event)) return;
				event.preventDefault();
				depth++;
				show(!store.get().busy);
			};
			const onOver = (event) => {
				if (!carriesFiles(event)) return;
				event.preventDefault();
				if (event.dataTransfer) event.dataTransfer.dropEffect = store.get().busy ? 'none' : 'copy';
			};
			const onLeave = (event) => {
				if (!carriesFiles(event)) return;
				depth = Math.max(0, depth - 1);
				if (!depth) show(false);
			};
			const onDrop = (event) => {
				if (!carriesFiles(event)) return;
				event.preventDefault();
				event.stopPropagation();
				show(false);
				if (store.get().busy || store.get().disposed) return;
				beforeDrop();
				addFiles(event.dataTransfer?.files);
			};
			zone.addEventListener('dragenter', onEnter);
			zone.addEventListener('dragover', onOver);
			zone.addEventListener('dragleave', onLeave);
			zone.addEventListener('drop', onDrop);
			const unbind = () => {
				zone.removeEventListener('dragenter', onEnter);
				zone.removeEventListener('dragover', onOver);
				zone.removeEventListener('dragleave', onLeave);
				zone.removeEventListener('drop', onDrop);
				overlay.remove();
			};
			dropZones.push(unbind);
			return unbind;
		},
		/** The input's placeholder and name ("Ask the agent", "Message Claude Code"). */
		setPlaceholder(text) {
			update({ placeholder: text });
		},
		openChooser,
		getDraft() {
			return { prompt: input.value, attachments: [...store.get().attachments] };
		},
		setValue(prompt, files = store.get().attachments) {
			setValue(prompt, files);
		},
		clear() {
			epoch++;
			reading.clear();
			input.value = '';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			update({ preparing: false, attachments: [], hasText: false });
		},
		setBusy(value) {
			update({ busy: !!value });
		},
		dispose() {
			if (store.get().disposed) return;
			epoch++;
			reading.clear();
			offControls();
			dropZones.splice(0).forEach((unbind) => unbind());
			input.removeEventListener('input', syncText);
			input.removeEventListener('focus', onFocusIn);
			input.removeEventListener('blur', onFocusOut);
			root.removeEventListener('keydown', onKey, true);
			root.removeEventListener('pointerdown', onPointerDown, true);
			window.removeEventListener('pointerup', release, true);
			window.removeEventListener('pointercancel', release, true);
			document.removeEventListener('pointerdown', onAnyPointer, true);
			document.removeEventListener('keydown', onAnyKey, true);
			release();
			tooltips.clear();
			input.value = '';
			update({ disposed: true, attachments: [], hasText: false });
			reactRoot.unmount();
		},
	};
}
