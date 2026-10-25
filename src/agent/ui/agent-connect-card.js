/**
 * The stepped connect flow (M4, issues #21, #69, #76, #82), built in the Plan-card shell
 * (flow-03: 352px card, 1px border, radius-lg, 16px padding).
 *
 * Three steps, one decision each, always a way back:
 *   1. Provider   OpenRouter (recommended), OpenCode Zen, OpenAI, Anthropic. Choosing one goes on.
 *   2. API key    One field with show/hide, "Get a key ↗", "Check key". Nothing is billed: one relay
 *                 request checks the key and fetches the models it can use.
 *   3. Model      Only the key's models that work with Noddy's tools (model-requirements.js), Free
 *                 first, then Paid. A model that is not listed can be typed as a model ID.
 *                 "Use this model" sends one tiny tool-enabled test; only when it passes does the
 *                 card collapse to the Connected row.
 *
 * One form grid for every step (the owner's "boxes are different lengths" fix): a single column,
 * every field, list, row and button is the full content width, one control height (`--control-h`),
 * labels above fields, helper and error text directly under their field, and the same action stack
 * everywhere: the primary button, then Back, both full width. See docs/agentic/figma/CHANGES.md.
 *
 * Memory: only the provider and model are remembered (localStorage, `noddy.agent.connection`),
 * never the key. After a reload the card opens on Step 2 ("Reconnect to …") and asks for the key
 * again; Check key then tests the remembered model and connects with no Step 3.
 *
 * The API key lives in this card's password field and in memory (`state.key`, so another model can
 * be tested and Back/Change work). It is never written to storage, the project, DOM attributes or
 * text, logs or URLs; it is dropped on reset, dispose and when another provider is chosen.
 */
import { PROVIDERS } from '../provider-config.js';
import { tierOf } from '../model-list.js';
import { assessModel } from '../model-requirements.js';
import {
	NO_FORMAT_COPY,
	RELAY_OFF_COPY,
	captionFor,
	checkKeyText,
	checkTypedModel,
	defaultStorage,
	describeError,
	forget,
	groupModels,
	noSupportedNote,
	normalizeKey,
	preselect,
	readRemembered,
	remember,
} from '../connect-flow.js';
import { CHECK_TIMEOUT_MS, checkConnection, fetchModels } from '../connect-api.js';
import { cardButton, el, icon, srOnly } from './cards/card-shell.js';
import { createModelList } from './agent-model-list.js';

export { RELAY_OFF_COPY, checkConnection, fetchModels };

/**
 * Display name for the header chip, e.g. 'gpt-5' → 'GPT-5'. A vendor prefix
 * ('google/gemma-4-26b-a4b-it:free') is dropped: the end of the ID names the model and the
 * chip is short.
 * @param {String} model
 * @returns {String}
 */
export function modelLabel(model = '') {
	return model.replace(/^[^/]+\//, '').replace(/^gpt/i, 'GPT');
}

const STEP_COUNT = 3;
let cardCount = 0;

/** The shortest the Step 3 list gets when it is fitted to a short panel (about four rows). */
const LIST_MIN_HEIGHT = 136;

/**
 * The element that scrolls the card (the panel's thread), or null.
 * @param {Element} node
 * @returns {HTMLElement|null}
 */
function scrollParent(node) {
	for (let at = node.parentElement; at; at = at.parentElement) {
		const { overflowY } = getComputedStyle(at);
		if (overflowY === 'auto' || overflowY === 'scroll') return at;
	}
	return null;
}

/**
 * @typedef {Object} Connection
 * @property {string} provider
 * @property {string} model
 * @property {'free'|'paid'} [tier]
 */

/**
 * @param {Object} [options]
 * @param {(config: {provider: string, model: string, apiKey: string}) => void} [options.onConnected]
 *   called once a model passed its test; must hand the key to the controller. Receives a fresh object.
 * @param {typeof checkConnection} [options.check]  the tiny tool-enabled test message
 * @param {typeof fetchModels} [options.loadModels]  key check plus the key's model list
 * @param {Storage|null} [options.storage]  where the provider and model are remembered
 * @param {() => number} [options.now]
 * @param {() => void} [options.onViewChange]  the card or the Connected row came on screen
 */
export function createConnectCard({
	onConnected = () => {},
	check = checkConnection,
	loadModels = fetchModels,
	storage = defaultStorage(),
	now = () => Date.now(),
	onViewChange = () => {},
} = {}) {
	const uid = `agent-connect-${++cardCount}`;
	const root = el('div', 'agent-connect-host');
	const announcer = el('div', 'agent-sr-only');
	announcer.setAttribute('role', 'status');
	announcer.setAttribute('aria-live', 'polite');

	const form = /** @type {HTMLFormElement} */ (el('form', 'agent-card agent-connect'));
	form.setAttribute('aria-label', 'Connect a model');
	form.noValidate = true;
	const connectedRow = el('div', 'agent-connected');
	connectedRow.setAttribute('role', 'status');

	const remembered = readRemembered(storage);

	const state = {
		/** @type {1|2|3} */
		step: remembered ? 2 : 1,
		/** The provider chosen on Step 1 ('' until then). */
		provider: remembered?.provider ?? '',
		/** The remembered connection this card is reconnecting to (until a model is connected). */
		reconnect: remembered,
		/** Verified key, memory only. */
		key: '',
		/** The key's models as the relay listed them; the list shows the ones that meet the requirements. */
		/** @type {import('../model-list.js').ListedModel[]} */
		models: [],
		/** The key was checked and Step 3 has what it needs (a list, or the reason there is none). */
		checked: false,
		/** 'list': pick from the key's models. 'id': type a model ID (nothing to list, or chosen). */
		mode: /** @type {'list'|'id'} */ ('list'),
		/** Line under the Model ID field: why this step shows it. */
		idNote: '',
		/** What was typed in the Model ID field. */
		idText: '',
		/** @type {{remaining: number, limit: number}|null} */
		counters: null,
		/** The model "Use this model" would test. */
		picked: '',
		/** A line under the key-works line: why this step opened. */
		notice: '',
		/** @type {null|'checking'|'testing'} */
		busy: null,
		/** @type {AbortController|null} */
		abort: null,
		/** @type {Connection|null} */
		connected: null,
		/** The card is out of the way: the Connected row shows. */
		collapsed: false,
	};

	// ---- Small builders ------------------------------------------------------------------------

	function announce(text) {
		announcer.textContent = '';
		// A new text node is announced again even when the words repeat.
		setTimeout(() => (announcer.textContent = text), 20);
	}

	function header(title) {
		const node = el('div', 'agent-connect__header');
		const row = el('header', 'agent-connect__head');
		const heading = el('h2', 'agent-connect__title text-subheading', title);
		heading.tabIndex = -1;
		row.append(
			heading,
			el('span', 'agent-connect__count text-meta', `Step ${state.step} of ${STEP_COUNT}`)
		);
		const bar = el('div', 'agent-connect__progress');
		bar.setAttribute('aria-hidden', 'true');
		for (let i = 1; i <= STEP_COUNT; i++) {
			bar.append(
				el('span', i <= state.step ? 'agent-connect__segment is-on' : 'agent-connect__segment')
			);
		}
		node.append(row, bar);
		return { node, heading };
	}

	/** A labelled field: label row (with an optional action), the control box, the message slot. */
	function field({ label, id, action }) {
		const wrap = el('div', 'agent-field');
		const row = el('div', 'agent-field__label-row');
		const labelNode = /** @type {HTMLLabelElement} */ (
			el('label', 'agent-field__label text-label', label)
		);
		labelNode.htmlFor = id;
		row.append(labelNode);
		if (action) row.append(action);
		const box = el('div', 'agent-field__box');
		const message = el('div', 'agent-field__message text-body-small');
		message.id = `${id}-message`;
		wrap.append(row, box, message);
		return { wrap, row, box, message, labelNode };
	}

	/** The error block: status line with its fix links, and a closed-by-default Details disclosure. */
	function errorBlock(view) {
		const block = el('div', 'agent-error');
		block.setAttribute('role', 'alert');
		const line = el('div', 'agent-error__line');
		const text = el('span', 'agent-error__text text-body-small');
		// A key prefix ("sk-or-") never breaks across two lines.
		for (const part of view.text.split(/(\bsk-[a-z]+-|\bsk-)/)) {
			if (!part) continue;
			text.append(/^sk-/.test(part) ? el('span', 'agent-nowrap', part) : part);
		}
		line.append(icon('error', 'agent-error__icon'), srOnly('Failed: '), text);
		block.append(line);
		const actions = el('div', 'agent-error__actions text-body-small');
		for (const link of view.links) {
			const anchor = /** @type {HTMLAnchorElement} */ (el('a', 'agent-link', `${link.label} ↗`));
			anchor.href = link.href;
			anchor.target = '_blank';
			anchor.rel = 'noopener noreferrer';
			actions.append(anchor);
		}
		if (view.details.length) {
			const toggle = /** @type {HTMLButtonElement} */ (
				el('button', 'agent-link-button', 'Details')
			);
			toggle.type = 'button';
			toggle.setAttribute('aria-expanded', 'false');
			const list = el('dl', 'agent-error__details text-mono-small');
			list.id = `${uid}-details-${Math.random().toString(36).slice(2, 8)}`;
			list.hidden = true;
			toggle.setAttribute('aria-controls', list.id);
			for (const [name, value] of view.details) {
				list.append(el('dt', '', name), el('dd', '', value));
			}
			toggle.addEventListener('click', () => {
				const open = toggle.getAttribute('aria-expanded') !== 'true';
				toggle.setAttribute('aria-expanded', String(open));
				list.hidden = !open;
			});
			actions.append(toggle);
			block.append(actions, list);
		} else if (actions.childElementCount) {
			block.append(actions);
		}
		return block;
	}

	function primaryButton(label) {
		const button = /** @type {HTMLButtonElement} */ (
			cardButton({ label, action: 'primary', variant: 'primary' })
		);
		button.type = 'submit';
		button.classList.add('agent-connect__primary');
		return button;
	}

	function backButton() {
		const button = /** @type {HTMLButtonElement} */ (
			cardButton({ label: 'Back', action: 'back', variant: 'ghost' })
		);
		button.type = 'button';
		button.classList.add('agent-connect__back');
		return button;
	}

	function setPrimaryLabel(button, label, busy = false) {
		button.querySelector('.agent-card__button-label').textContent = label;
		button.classList.toggle('is-checking', busy);
		if (busy) {
			button.setAttribute('aria-busy', 'true');
			if (!button.querySelector('.agent-connect__spinner')) {
				const spinner = el('span', 'agent-connect__spinner');
				spinner.setAttribute('aria-hidden', 'true');
				button.prepend(spinner);
			}
		} else {
			button.removeAttribute('aria-busy');
			button.querySelector('.agent-connect__spinner')?.remove();
		}
	}

	// ---- Step views ----------------------------------------------------------------------------
	// Each builder returns { nodes, focus, ...hooks }. Hooks are what the flow needs to change
	// without drawing the step again (busy, error), so typed text and focus are never lost.

	/** @type {null | {focus: () => void, setBusy?: (on: boolean) => void, showError?: (view: any) => void, dispose?: () => void}} */
	let view = null;

	function buildProviderStep() {
		const head = header('Choose a provider');
		const group = el('div', 'agent-connect__providers');
		group.setAttribute('role', 'group');
		group.setAttribute('aria-label', 'Provider');
		const buttons = Object.entries(PROVIDERS).map(([id, spec]) => {
			const button = /** @type {HTMLButtonElement} */ (el('button', 'agent-provider'));
			button.type = 'button';
			button.dataset.provider = id;
			const text = el('span', 'agent-provider__text');
			const name = el('span', 'agent-provider__name text-label');
			name.append(el('span', '', spec.label));
			if (spec.recommended) name.append(el('span', 'agent-provider__tag text-meta', 'Recommended'));
			text.append(name, el('span', 'agent-provider__hint text-body-small', spec.hint));
			button.append(text, icon('chevron_right', 'agent-provider__chevron'));
			button.addEventListener('click', () => chooseProvider(id));
			return button;
		});
		group.append(...buttons);
		// Up and Down also move between the rows (Tab reaches every row too).
		group.addEventListener('keydown', (event) => {
			if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
			const at = buttons.indexOf(/** @type {HTMLButtonElement} */ (document.activeElement));
			const next =
				buttons[(at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length];
			next.focus();
			event.preventDefault();
		});
		return {
			title: 'Choose a provider',
			nodes: [head.node, group],
			focus() {
				(
					buttons.find((button) => button.dataset.provider === state.provider) ?? buttons[0]
				).focus();
			},
		};
	}

	function buildKeyStep() {
		const spec = PROVIDERS[state.provider];
		// "Reconnect" until the key is checked; after that the card is just picking a model again.
		const reconnect =
			!!state.reconnect && state.reconnect.provider === state.provider && !state.key;
		const title = reconnect ? `Reconnect to ${spec.label}` : `Add your ${spec.label} key`;
		const head = header(title);
		const nodes = [head.node];
		if (reconnect) {
			nodes.push(el('p', 'agent-connect__line text-body-small', `Model: ${state.reconnect.model}`));
		}

		const inputId = `${uid}-key`;
		const link = /** @type {HTMLAnchorElement} */ (
			el('a', 'agent-link text-body-small', 'Get a key ↗')
		);
		link.href = spec.keyUrl;
		link.target = '_blank';
		link.rel = 'noopener noreferrer';
		const fieldParts = field({ label: 'API key', id: inputId, action: link });
		const input = /** @type {HTMLInputElement} */ (el('input', 'agent-field__input text-mono'));
		input.id = inputId;
		input.type = 'password';
		input.autocomplete = 'off';
		input.spellcheck = false;
		input.autocapitalize = 'off';
		input.placeholder = state.provider === 'anthropic' ? 'sk-ant-…' : 'sk-…';
		input.setAttribute('data-1p-ignore', '');
		input.setAttribute('data-lpignore', 'true');
		input.setAttribute('aria-describedby', fieldParts.message.id);
		const reveal = /** @type {HTMLButtonElement} */ (el('button', 'agent-field__icon-button'));
		reveal.type = 'button';
		reveal.setAttribute('aria-label', 'Show key');
		reveal.setAttribute('aria-pressed', 'false');
		const revealIcon = icon('visibility');
		reveal.append(revealIcon);
		reveal.addEventListener('click', () => {
			const show = input.type === 'password';
			input.type = show ? 'text' : 'password';
			reveal.setAttribute('aria-pressed', String(show));
			reveal.setAttribute('aria-label', show ? 'Hide key' : 'Show key');
			revealIcon.textContent = show ? 'visibility_off' : 'visibility';
		});
		fieldParts.box.append(input, reveal);

		const primary = primaryButton('Check key');
		const back = backButton();
		back.addEventListener('click', goBack);

		const verified = () => !!state.key && normalizeKey(input.value) === state.key;
		function helper() {
			fieldParts.message.replaceChildren(
				el(
					'span',
					'',
					verified() ? 'Key checked' : 'Your key stays in this tab and is never saved.'
				)
			);
			fieldParts.box.classList.remove('is-invalid');
			input.removeAttribute('aria-invalid');
		}
		function sync() {
			// Editing a checked key turns the button back into "Check key".
			if (!state.busy) setPrimaryLabel(primary, verified() ? 'Continue' : 'Check key');
		}
		if (state.key) input.value = state.key;
		helper();
		sync();
		input.addEventListener('input', () => {
			if (
				fieldParts.message.querySelector('.agent-error') ||
				fieldParts.message.textContent === 'Key checked'
			) {
				helper();
			}
			sync();
		});

		nodes.push(fieldParts.wrap);
		const actions = el('div', 'agent-connect__actions');
		actions.append(primary, back);
		nodes.push(actions);

		return {
			title,
			nodes,
			focus() {
				input.focus();
			},
			setBusy(on) {
				input.readOnly = on;
				setPrimaryLabel(
					primary,
					on
						? state.busy === 'testing'
							? 'Connecting…'
							: 'Checking…'
						: verified()
						? 'Continue'
						: 'Check key',
					on
				);
			},
			showError(errorView) {
				fieldParts.message.replaceChildren(errorBlock(errorView));
				fieldParts.box.classList.add('is-invalid');
				input.setAttribute('aria-invalid', 'true');
				if (errorView.focus === 'key') {
					input.focus();
					input.select();
				}
			},
			/** @returns {string} what was typed, as the key to check */
			read() {
				const key = normalizeKey(input.value);
				// The field shows the key that will be sent (whitespace and quotes removed).
				if (key !== input.value) input.value = key;
				return key;
			},
		};
	}

	function buildModelStep() {
		const spec = PROVIDERS[state.provider];
		const head = header('Choose a model');
		const nodes = [head.node];

		const status = el('p', 'agent-connect__status text-body-small');
		status.append(
			icon('check', 'agent-connect__status-icon'),
			el('span', '', `Key works · ${spec.label}`)
		);
		nodes.push(status);
		if (state.notice) {
			const notice = el('p', 'agent-connect__line text-body-small', state.notice);
			notice.setAttribute('role', 'status');
			nodes.push(notice);
		}

		const typedOnly = state.mode === 'id';
		const errorSlot = el('div', 'agent-connect__error');
		/** @type {ReturnType<typeof createModelList> | null} */
		let list = null;
		let idInput = /** @type {HTMLInputElement|null} */ (null);
		if (typedOnly) {
			const id = `${uid}-model-id`;
			// "Pick from the list" sits in the label row, like "Get a key" on Step 2.
			let back = null;
			if (hasListed()) {
				back = /** @type {HTMLButtonElement} */ (
					el('button', 'agent-link-button', 'Pick from the list')
				);
				back.type = 'button';
				back.addEventListener('click', () => {
					state.mode = 'list';
					state.idNote = '';
					show(3);
				});
			}
			const parts = field({ label: 'Model ID', id, action: back ?? undefined });
			const input = /** @type {HTMLInputElement} */ (el('input', 'agent-field__input text-mono'));
			idInput = input;
			input.id = id;
			input.type = 'text';
			input.autocomplete = 'off';
			input.spellcheck = false;
			input.maxLength = 160;
			input.placeholder = state.provider === 'anthropic' ? 'claude-sonnet-5-5' : 'model-id';
			input.value = state.idText;
			input.setAttribute('aria-describedby', parts.message.id);
			const helper = () =>
				parts.message.replaceChildren(
					el('span', '', state.idNote || 'Noddy sends one small test before it connects.')
				);
			helper();
			input.addEventListener('input', () => {
				state.idText = input.value.trim();
				// Typing again clears a failure shown for the ID that was typed.
				if (errorSlot.childElementCount) errorSlot.replaceChildren();
				parts.box.classList.remove('is-invalid');
				input.removeAttribute('aria-invalid');
			});
			parts.box.append(input);
			nodes.push(parts.wrap);
		} else {
			list = createModelList({
				onSelect: (model) => pick(model.id),
				onConfirm: () => useModel(),
				onUseTyped: (id) => useId(id),
				onUseId: () => useId(''),
			});
			nodes.push(list.root);
		}

		const caption = el('p', 'agent-connect__caption text-body-small');
		const primary = primaryButton('Use this model');
		const back = backButton();
		back.addEventListener('click', goBack);
		// While the test runs, Cancel stops it and keeps this step (bug 13).
		const cancel = /** @type {HTMLButtonElement} */ (
			cardButton({ label: 'Cancel', action: 'cancel', variant: 'ghost' })
		);
		cancel.type = 'button';
		cancel.classList.add('agent-connect__cancel');
		cancel.hidden = true;
		cancel.addEventListener('click', () => {
			cancelRequest();
			errorSlot.replaceChildren(
				el('p', 'agent-connect__line text-body-small', 'Test cancelled · nothing changed.')
			);
			primary.focus();
		});
		// The failure of "Use this model" and the cost line sit in the sticky action stack, right
		// above the button they are about, so they are on screen at any panel height.
		const actions = el('div', 'agent-connect__actions');
		actions.append(errorSlot, caption, primary, cancel, back);
		nodes.push(actions);

		// The list gives up height until the whole step fits the panel, so the count line, "Use a
		// model ID" and the cost line are never below the fold (QA #83: 1440x900, 1024x768, 390x844).
		let frame = 0;
		/** @type {Element|null} */
		let watched = null;
		function fitList() {
			frame = 0;
			const box = /** @type {HTMLElement|null} */ (list?.root.querySelector('.agent-models__list'));
			const scroller = box && form.isConnected ? scrollParent(form) : null;
			if (!box || !scroller || !scroller.clientHeight) return;
			// The thread is watched too (the window or the panel changes height), once it is known.
			if (observer && watched !== scroller) {
				observer.observe(scroller);
				watched = scroller;
			}
			box.style.maxHeight = '';
			const overflow = scroller.scrollHeight - scroller.clientHeight;
			if (overflow <= 1) return;
			const height = box.getBoundingClientRect().height;
			const fitted = Math.max(LIST_MIN_HEIGHT, Math.floor(height - overflow));
			if (fitted < height) box.style.maxHeight = `${fitted}px`;
		}
		const queueFit = () => {
			if (!frame) frame = requestAnimationFrame(fitList);
		};
		/** @type {ResizeObserver|null} */
		let observer = null;
		if (list && typeof ResizeObserver === 'function') {
			observer = new ResizeObserver(queueFit);
			observer.observe(form);
			queueFit();
		}

		function updateCaption() {
			const model = state.models.find((item) => item.id === state.picked);
			caption.textContent = typedOnly ? '' : captionFor(state.provider, model);
		}
		function pick(id) {
			state.picked = id;
			list?.select(id);
			updateCaption();
			errorSlot.replaceChildren();
		}
		function draw() {
			if (!list) return;
			list.render({
				models: state.models,
				provider: state.provider,
				selected: state.picked,
				counters: state.counters,
				now: now(),
			});
			updateCaption();
		}
		draw();
		updateCaption();

		return {
			title: 'Choose a model',
			nodes,
			focus() {
				if (list) list.focus();
				else idInput?.focus();
			},
			redraw: draw,
			dispose() {
				observer?.disconnect();
				observer = null;
				if (frame) cancelAnimationFrame(frame);
				frame = 0;
			},
			setBusy(on) {
				list?.setBusy(on);
				if (idInput) idInput.readOnly = on;
				setPrimaryLabel(primary, on ? 'Testing…' : 'Use this model', on);
				const hadFocus = document.activeElement === back || document.activeElement === cancel;
				cancel.hidden = !on;
				back.hidden = on;
				if (on) {
					errorSlot.replaceChildren();
					caption.textContent = `One short test message · up to ${Math.round(
						CHECK_TIMEOUT_MS / 1000
					)} s`;
				} else updateCaption();
				if (hadFocus) (on ? cancel : back).focus();
			},
			showError(errorView) {
				errorSlot.replaceChildren(errorBlock(errorView));
				if (typedOnly) {
					idInput.setAttribute('aria-invalid', 'true');
					idInput.parentElement.classList.add('is-invalid');
					idInput.focus();
				} else if (list) {
					list.focus();
				}
			},
			/** @returns {string} the ID the primary button would test ('' when nothing is chosen) */
			readModel() {
				return typedOnly ? idInput.value.trim() : state.picked;
			},
			get list() {
				return list;
			},
		};
	}

	// ---- Rendering ----------------------------------------------------------------------------

	let ready = false;
	function renderRoot() {
		if (state.collapsed && state.connected) {
			renderConnectedRow();
			root.replaceChildren(connectedRow, announcer);
		} else {
			root.replaceChildren(form, announcer);
		}
		// The owner arranges its own block around the card (the greeting, the suggestions).
		if (ready) onViewChange();
	}

	/**
	 * The Connected row: two lines in a 56px box (the height of a provider row). Line one is the
	 * provider with its Free or Paid badge, line two the model ID, which is long on OpenRouter
	 * (`vendor/name:variant`) and is cut with an ellipsis only here; the full ID is in `title`
	 * and in the text a screen reader gets. "Change" sits at the right, centred.
	 */
	function renderConnectedRow() {
		const { provider, model, tier } = state.connected;
		const label = PROVIDERS[provider].label;
		const text = el('span', 'agent-connected__text');
		text.title = `${label} · ${model}`;
		const head = el('span', 'agent-connected__head text-label');
		head.append(el('span', '', label));
		if (tier) {
			const badge = el('span', `agent-badge agent-badge--${tier}`);
			badge.dataset.badge = tier;
			badge.append(
				icon(tier === 'free' ? 'money_off' : 'paid', 'agent-badge__icon'),
				el('span', 'agent-badge__label', tier === 'free' ? 'Free' : 'Paid')
			);
			head.append(badge);
		}
		text.append(head, el('span', 'agent-connected__model text-mono-small', model));
		const change = /** @type {HTMLButtonElement} */ (
			cardButton({ label: 'Change', action: 'change', variant: 'ghost' })
		);
		change.type = 'button';
		change.addEventListener('click', openChange);
		connectedRow.replaceChildren(icon('check_circle', 'agent-connected__icon'), text, change);
	}

	/**
	 * Draw one step.
	 * @param {1|2|3} step
	 * @param {{focus?: boolean}} [options]
	 */
	function show(step, { focus = true } = {}) {
		cancelRequest();
		state.step = step;
		state.collapsed = false;
		view?.dispose?.();
		view = step === 1 ? buildProviderStep() : step === 2 ? buildKeyStep() : buildModelStep();
		form.dataset.step = String(step);
		form.replaceChildren(...view.nodes);
		renderRoot();
		announce(`Step ${step} of ${STEP_COUNT}. ${view.title}`);
		if (focus) view.focus();
	}

	// ---- Requests -----------------------------------------------------------------------------

	function cancelRequest() {
		if (state.abort) state.abort.abort();
		state.abort = null;
		if (state.busy) {
			state.busy = null;
			view?.setBusy?.(false);
		}
		form.removeAttribute('aria-busy');
	}

	function begin(kind) {
		cancelRequest();
		const abort = new AbortController();
		state.abort = abort;
		state.busy = kind;
		form.setAttribute('aria-busy', 'true');
		view?.setBusy?.(true);
		return abort;
	}

	function end() {
		state.abort = null;
		state.busy = null;
		form.removeAttribute('aria-busy');
		view?.setBusy?.(false);
	}

	/** Step 1 → 2. Another provider drops the key and the list that belonged to the first. */
	function chooseProvider(id) {
		if (id !== state.provider) dropSession();
		state.provider = id;
		show(2);
	}

	function goBack() {
		if (state.step === 3) show(2);
		else if (state.step === 2) show(1);
	}

	function dropSession() {
		state.key = '';
		state.models = [];
		state.checked = false;
		state.counters = null;
		state.picked = '';
		state.notice = '';
		state.mode = 'list';
		state.idNote = '';
		state.idText = '';
	}

	/** The models Step 3 would list (those that work with Noddy's tools). */
	const supportedCount = () =>
		groupModels(state.models, { provider: state.provider, now: now() }).reduce(
			(sum, group) => sum + group.models.length,
			0
		);
	/** Step 3 has a list to go back to. */
	const hasListed = () => supportedCount() > 0;
	/** The key was checked, so Step 3 can open without asking for it again. */
	const hasStep3 = () => !!state.key && state.checked;

	const localError = (text) => ({
		kind: 'local',
		text,
		links: [],
		details: [],
		focus: 'key',
		reenterKey: false,
	});

	/** Step 3 for the models now in memory: the first Free model, else the first Paid one. */
	function goToModelStep() {
		const groups = groupModels(state.models, { provider: state.provider, now: now() });
		state.picked = preselect(groups, now());
		state.mode = groups.length ? 'list' : 'id';
		state.idNote = groups.length ? '' : noSupportedNote(state.provider, state.models.length);
		show(3);
	}

	const CANT_LIST = "This key can't list models. Type a model ID.";

	async function submitKey() {
		const key = /** @type {any} */ (view).read();
		// Text the relay would refuse (a space, a non-ASCII character) is named here: nothing is
		// sent, so the provider is never blamed for it.
		const text = checkKeyText(key);
		if (!text.ok) {
			/** @type {any} */ (view).showError(localError(text.text));
			return;
		}
		// A key that was already checked: on to the models, nothing to send.
		if (key === state.key && state.checked) {
			show(3);
			return;
		}
		const abort = begin('checking');
		const answer = await loadModels(
			{ provider: state.provider, apiKey: key },
			{ signal: abort.signal }
		);
		if (abort.signal.aborted) return;
		end();
		if (!answer.ok) {
			const error = answer.error ?? { offline: true };
			if (error.aborted) return;
			// The provider will not list models for this key (a restricted key, say). The key may still
			// be good: go on and let the one test message decide.
			const refusesList =
				['PROVIDER_FORBIDDEN', 'PROVIDER_MODEL', 'PROVIDER_REQUEST'].includes(error.code ?? '') &&
				error.hint !== 'free-tier-only';
			if (!refusesList) {
				/** @type {any} */ (view).showError(
					describeError(error, { provider: state.provider, key })
				);
				return;
			}
			const lead = Number.isInteger(error.status) ? `${error.status} · ` : '';
			state.key = key;
			state.models = [];
			state.checked = true;
			state.counters = null;
			state.mode = 'id';
			state.idNote =
				error.code === 'PROVIDER_FORBIDDEN'
					? `${lead}This key can't list models — type a model ID.`
					: CANT_LIST;
			state.idText = state.reconnect?.provider === state.provider ? state.reconnect.model : '';
			state.picked = '';
			state.notice = '';
			show(3);
			return;
		}

		state.key = key;
		state.models = answer.models;
		state.checked = true;
		state.counters = answer.freeRequests ?? null;
		state.notice = '';
		const target = state.reconnect?.provider === state.provider ? state.reconnect.model : '';
		if (target) {
			// Reconnecting: test the remembered model right away; no Step 3 when it works. It is
			// tried unless the list says it cannot run the agent or no longer has it.
			const known = state.models.find((model) => model.id === target);
			const gone = state.models.length > 0 && !known;
			if (
				!gone &&
				(!known ||
					assessModel(known, { provider: state.provider, now: now() }).status !== 'unsupported')
			) {
				await testModel(target, { from: 2 });
				return;
			}
			state.notice = "That model isn't available now. Pick another.";
		}
		goToModelStep();
	}

	/**
	 * Send the one tiny tool-enabled test. A pass connects (the Connected row shows); a failure
	 * keeps the list open with the reason, or sends a bad key back to Step 2.
	 * @param {string} id
	 * @param {{from: 2|3}} context  the step the user pressed the button on
	 */
	async function testModel(id, { from }) {
		const abort = begin(from === 2 ? 'checking' : 'testing');
		const answer = await check(
			{ provider: state.provider, model: id, apiKey: state.key },
			{ signal: abort.signal }
		);
		if (abort.signal.aborted) return;
		end();
		if (answer.ok) {
			finishConnected(id);
			return;
		}
		const error = answer.error ?? { offline: true };
		if (error.aborted) return;
		const errorView = describeError(error, { provider: state.provider, key: state.key });
		if (errorView.reenterKey) {
			// The key stopped working: ask for it again on Step 2.
			const bad = state.key;
			state.key = '';
			if (state.step !== 2) show(2);
			/** @type {any} */ (view).showError(
				describeError(error, { provider: state.provider, key: bad })
			);
			return;
		}
		if (errorView.kind === 'free-tier' && from === 3 && state.mode === 'list') {
			// OpenCode lets its free models run only inside OpenCode. The error says to pick a
			// paid one: put the selection on the first Paid model so the next press tries that.
			const paid = groupModels(state.models, { provider: state.provider, now: now() }).find(
				(group) => group.id === 'paid'
			);
			if (paid?.models.length) {
				state.picked = paid.models[0].id;
				/** @type {any} */ (view).redraw?.();
			}
		}
		if (from === 2) {
			// The remembered model failed: Step 3, that model still selected, with the reason.
			const groups = groupModels(state.models, { provider: state.provider, now: now() });
			if (groups.some((group) => group.models.some((model) => model.id === id))) {
				state.picked = id;
				state.mode = 'list';
			} else {
				// A model the list does not offer (typed before): keep it in the ID field.
				state.mode = 'id';
				state.idText = id;
				state.idNote = '';
			}
			show(3);
		}
		/** @type {any} */ (view).showError(errorView);
	}

	/** "Use this model": the same model that is already connected needs no new test. */
	async function useModel() {
		if (state.busy || state.step !== 3) return;
		const id = /** @type {any} */ (view).readModel();
		if (!id) {
			/** @type {any} */ (view).showError(
				localError(state.mode === 'id' ? 'Type a model ID first.' : 'Choose a model first.')
			);
			return;
		}
		if (state.mode === 'id' && !rejectTyped(id)) return;
		if (state.connected?.provider === state.provider && state.connected.model === id) {
			state.collapsed = true;
			renderRoot();
			return;
		}
		await testModel(id, { from: 3 });
	}

	/** @returns {boolean} whether the typed ID may be tested (otherwise the reason is shown) */
	function rejectTyped(id) {
		const typed = checkTypedModel(state.provider, id);
		if (typed.ok) return true;
		/** @type {any} */ (view).showError(
			localError(typed.reason === 'format' ? NO_FORMAT_COPY : 'That is not a valid model ID.')
		);
		return false;
	}

	/** "Use a model ID" (or "Use “…” as a model ID" for the search text): Step 3 asks for the ID itself. */
	function useId(text) {
		state.mode = 'id';
		state.idNote = '';
		if (text) state.idText = text;
		show(3);
	}

	function finishConnected(id) {
		const listed = state.models.find((model) => model.id === id);
		const tier = listed
			? tierOf(listed)
			: state.reconnect?.model === id
			? state.reconnect.tier
			: undefined;
		state.connected = { provider: state.provider, model: id, ...(tier ? { tier } : {}) };
		state.reconnect = null;
		remember(state.connected, storage);
		state.collapsed = true;
		view?.dispose?.();
		renderRoot();
		announce(`Connected to ${PROVIDERS[state.provider].label}, ${id}.`);
		// A fresh object: the panel blanks what it is given, and this card keeps its own copy.
		onConnected({ provider: state.provider, model: id, apiKey: state.key });
	}

	/** Change: the model list when the key is still in memory, else the key. */
	function openChange() {
		if (hasStep3()) {
			openModelStep();
		} else {
			state.reconnect = null;
			show(2);
		}
	}

	/** Step 3 on the model now connected: on it when the list has it, else in the ID field. */
	function openModelStep() {
		const current = state.connected?.model ?? '';
		const groups = groupModels(state.models, { provider: state.provider, now: now() });
		const listed = groups.some((group) => group.models.some((model) => model.id === current));
		if (listed) {
			state.mode = 'list';
			state.picked = current;
		} else if (state.checked && groups.length && !current) {
			state.mode = 'list';
		} else if (current && !listed) {
			// Typed before (or no longer listed): the ID field keeps it.
			state.mode = 'id';
			state.idText = current;
			state.idNote = groups.length ? '' : state.idNote;
		}
		show(3);
	}

	// ---- Form events --------------------------------------------------------------------------

	form.addEventListener('submit', (event) => {
		event.preventDefault();
		if (state.busy) return;
		if (state.step === 2) submitKey();
		else if (state.step === 3) useModel();
	});

	// Esc inside the card never leaves it or minimizes the panel (the list and search use it first).
	// In the model chip's popover an unused Esc closes the popover instead.
	form.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey) {
			if (form.closest('.agent-popover')) return;
			event.stopPropagation();
		}
	});

	show(state.step, { focus: false });
	ready = true;

	function disposeSession() {
		cancelRequest();
		dropSession();
		const input = form.querySelector('input[type=password], input[type=text].agent-field__input');
		if (input && state.step === 2) /** @type {HTMLInputElement} */ (input).value = '';
	}

	return {
		root,
		/** True while the card (not the Connected row) is on screen. */
		get showsCard() {
			return !(state.collapsed && state.connected);
		},
		/** The current step, 1 to 3. */
		get step() {
			return state.step;
		},
		/** @returns {Connection|null} */
		get connected() {
			return state.connected ? { ...state.connected } : null;
		},
		focus() {
			if (state.collapsed && state.connected) connectedRow.querySelector('button')?.focus();
			else view?.focus();
		},
		/** Open the card on 'model' (when the key is in memory), 'key' or 'provider'. */
		open(where = 'model') {
			if (where === 'provider') show(1);
			else if (where === 'model' && hasStep3()) {
				openModelStep();
			} else {
				state.reconnect = null;
				if (!state.provider) show(1);
				else show(2);
			}
		},
		/** Back to the start, forgetting the key and the list (e.g. after a disconnect). */
		reset() {
			disposeSession();
			state.connected = null;
			state.collapsed = false;
			state.reconnect = readRemembered(storage);
			state.provider = state.reconnect?.provider ?? '';
			show(state.reconnect ? 2 : 1, { focus: false });
		},
		/** Wipe the key from the field and from memory (e.g. when the panel is disposed). */
		clearKey() {
			disposeSession();
			state.connected = null;
			state.collapsed = false;
			state.reconnect = null;
			state.provider = '';
			show(1, { focus: false });
		},
		/** Forget the remembered provider and model as well. */
		forget() {
			forget(storage);
		},
	};
}
