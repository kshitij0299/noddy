/**
 * Run bar and "Before run" checkpoint line (M7 #28 / #29; Figma flow-05/07).
 *
 * The run bar sits in its own row between the thread and the composer while
 * a run is drafting or paused: status text (never colour alone), Pause or
 * Resume, and Stop. Stop asks inline ("Stop run?" with Stop run / Cancel);
 * nothing stops a run without that confirm. Esc inside the confirm cancels
 * it and never reaches the panel (which would minimize, not stop).
 *
 * The checkpoint line is a step line with one action, "Revert run".
 */
import { cardButton, el, icon } from './cards/card-shell.js';

export const RUN_BAR_STATES = Object.freeze(['controls', 'drafting', 'paused']);

/**
 * Status copy for the bar. Pure, for tests.
 * @param {{state: String, glyph?: String, done?: Number, total?: Number,
 *   pauseReason?: String|null}} view
 * @param {{pausing?: Boolean}} [extra]
 * @returns {String}
 */
export function runBarText(view = { state: 'idle' }, { pausing = false } = {}) {
	const count = view.total > 0 ? ` · ${Math.max(0, view.done || 0)}/${view.total}` : '';
	if (view.state === 'paused') {
		const why = { cap: ' · spend cap', error: ' · error' }[view.pauseReason] || '';
		return `Paused${why}${count}`;
	}
	const verb = pausing ? 'Pausing after' : 'Drafting';
	return view.glyph ? `${verb} ${view.glyph}${count}` : `Drafting${count}`;
}

/**
 * @param {Object} handlers
 * @param {() => void} handlers.onPause
 * @param {() => void} handlers.onResume
 * @param {() => void} handlers.onStop - after the inline confirm
 */
export function createRunBar({ onPause, onResume, onStop }) {
	const root = el('div', 'agent-run-bar');
	root.setAttribute('role', 'group');
	root.setAttribute('aria-label', 'Run');
	root.hidden = true;

	const lead = el('span', 'agent-run-bar__lead');
	lead.setAttribute('aria-hidden', 'true');
	const text = el('span', 'agent-run-bar__text text-label');
	text.setAttribute('role', 'status');
	const actions = el('div', 'agent-run-bar__actions');

	const pauseButton = cardButton({ label: 'Pause', action: 'pause', iconName: 'pause', variant: 'secondary' });
	const resumeButton = cardButton({
		label: 'Resume',
		action: 'resume',
		iconName: 'play_arrow',
		variant: 'primary',
	});
	const stopButton = cardButton({ label: 'Stop', action: 'stop', iconName: 'stop', variant: 'ghost' });
	const confirmText = el('span', 'agent-run-bar__text text-label', 'Stop run?');
	const confirmButton = cardButton({ label: 'Stop run', action: 'confirm-stop', variant: 'primary' });
	const cancelButton = cardButton({ label: 'Cancel', action: 'cancel-stop', variant: 'ghost' });

	let confirming = false;
	let pausing = false;
	let last = { state: 'idle' };

	pauseButton.addEventListener('click', () => {
		// aria-disabled, not disabled: a disabled button would drop keyboard
		// focus to <body>; focus stays here until Resume replaces it.
		if (pausing) return;
		pausing = true;
		onPause();
		draw();
	});
	resumeButton.addEventListener('click', () => onResume());
	stopButton.addEventListener('click', () => {
		confirming = true;
		draw();
		cancelButton.focus();
	});
	cancelButton.addEventListener('click', () => {
		confirming = false;
		draw();
		stopButton.focus();
	});
	confirmButton.addEventListener('click', () => {
		confirming = false;
		onStop();
		draw();
	});
	root.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && confirming && !event.ctrlKey && !event.metaKey) {
			event.preventDefault();
			event.stopPropagation();
			cancelButton.click();
		}
	});

	function draw() {
		const visible = RUN_BAR_STATES.includes(last.state);
		root.hidden = !visible;
		if (!visible) {
			confirming = false;
			pausing = false;
			return;
		}
		const paused = last.state === 'paused';
		if (paused) pausing = false;
		root.dataset.state = confirming ? 'confirm' : paused ? 'paused' : 'running';
		lead.replaceChildren(
			paused ? icon('pause', 'agent-run-bar__icon') : el('span', 'agent-run-bar__spinner')
		);
		if (confirming) {
			setActions(confirmButton, cancelButton);
			text.replaceWith(confirmText);
			return;
		}
		if (confirmText.isConnected) confirmText.replaceWith(text);
		text.textContent = runBarText(last, { pausing });
		pauseButton.setAttribute('aria-disabled', pausing ? 'true' : 'false');
		setActions(paused ? resumeButton : pauseButton, stopButton);
	}

	/** Swaps the buttons only when they change: re-inserting a focused
	 * button would drop keyboard focus to <body>. */
	function setActions(...buttons) {
		const same =
			actions.children.length === buttons.length &&
			buttons.every((button, index) => actions.children[index] === button);
		if (!same) actions.replaceChildren(...buttons);
	}

	root.append(lead, text, actions);

	return {
		root,
		/** @param {Object} view - run controller view */
		render(view) {
			const hadFocus = root.contains(document.activeElement);
			last = view || { state: 'idle' };
			draw();
			// A Pause → Resume swap must not drop keyboard focus to <body>:
			// it lands on Resume (or Pause again after Resume).
			if (hadFocus && !root.contains(document.activeElement) && !root.hidden) {
				(confirming ? cancelButton : actions.firstElementChild)?.focus?.();
			}
		},
		get confirming() {
			return confirming;
		},
	};
}

/**
 * "Before run" checkpoint line with its one action.
 * @param {{onRevert: () => void}} handlers
 */
export function createCheckpointLine({ onRevert }) {
	const root = el('div', 'agent-checkpoint');
	const line = /** @type {any} */ (document.createElement('agent-step-line'));
	line.render({ tone: 'info', icon: 'history', text: 'Before run · checkpoint' });
	const revert = cardButton({ label: 'Revert run', action: 'revert-run', iconName: 'undo', variant: 'ghost' });
	revert.disabled = true;
	revert.addEventListener('click', () => onRevert());
	root.append(line, revert);
	return {
		root,
		line,
		revert,
		/** @param {Boolean} enabled - the run drew something to revert */
		setEnabled(enabled) {
			if (root.dataset.done) return;
			revert.disabled = !enabled;
		},
		/** @param {String} text - result line; the action is spent */
		finish(text) {
			root.dataset.done = 'true';
			const hadFocus = document.activeElement === revert;
			revert.disabled = true;
			line.render({ tone: 'kept', icon: 'history', text });
			if (hadFocus) {
				root.tabIndex = -1;
				root.focus({ preventScroll: true });
			}
		},
	};
}
