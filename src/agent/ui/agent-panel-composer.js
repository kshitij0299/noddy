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
	let generation = 0;

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
		useStarter(text) {
			setValue(text);
			input.focus();
		},
		submitFromKeyboard() {
			if (!store.get().busy) root.requestSubmit();
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

	// Esc while the `/` list is open only closes the list. ui-sdk does not mark that Esc as
	// handled, so note it before it runs (capture) and let the panel ask.
	/** @type {WeakSet<Event>} */
	const listEscapes = new WeakSet();
	root.addEventListener(
		'keydown',
		(event) => {
			if (event.key === 'Escape' && input.hasAttribute('data-open')) listEscapes.add(event);
		},
		true
	);

	function syncText() {
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

	function openChooser() {
		if (!store.get().busy && !store.get().disposed) chooser.click();
	}

	async function addFiles(files) {
		const { busy, disposed } = store.get();
		if (busy || disposed) return;
		const run = ++generation;
		update({ preparing: true });
		const next = [...store.get().attachments];
		try {
			for (const file of Array.from(files || [])) {
				try {
					validateAttachmentSet([...getReferences(), ...next, { kind: 'pending' }]);
					const attachment = await readAttachment(file);
					if (run !== generation || store.get().disposed) return;
					validateAttachmentSet([...getReferences(), ...next, attachment]);
					next.push(attachment);
				} catch (error) {
					if (run !== generation || store.get().disposed) return;
					onAttachError(error.message);
				}
			}
		} finally {
			if (run === generation) {
				chooser.value = '';
				update({ preparing: false, attachments: next });
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
				return /** @type {HTMLElement} */ (modelButton.querySelector('.agent-composer__chip-label'));
			},
			/** @param {{label: String, tier?: 'free'|'paid', local?: Boolean}} view */
			render({ label, tier, local = false }) {
				update({ model: { label, tier, local } });
			},
		},
		addFiles,
		/** True for an Esc the composer used itself (it closed the `/` list). */
		handledEscape(event) {
			return event.defaultPrevented || listEscapes.has(event);
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
		 */
		bindDropZone(zone) {
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
			generation++;
			input.value = '';
			input.dispatchEvent(new Event('input', { bubbles: true }));
			update({ preparing: false, attachments: [], hasText: false });
		},
		setBusy(value) {
			update({ busy: !!value });
		},
		dispose() {
			if (store.get().disposed) return;
			generation++;
			offControls();
			dropZones.splice(0).forEach((unbind) => unbind());
			input.removeEventListener('input', syncText);
			input.value = '';
			update({ disposed: true, attachments: [], hasText: false });
			reactRoot.unmount();
		},
	};
}
