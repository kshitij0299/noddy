import { createAgentController, requireSelectedGlyph } from './agent-controller.js';
import { button, createAgentComposer, element } from './agent-composer.js';
import { createNativeToolSession } from './native-tools.js';
import { openFontAttachment } from './font-attachment.js';
import { PROTOCOL_LABELS, resolveProviderProtocol } from './provider-config.js';
import './agent-window.css';

let singleton;

function field(labelText, input) {
	const label = element('label', 'agent-connection__field');
	label.append(element('span', '', labelText), input);
	return label;
}

function select(options) {
	const input = element('select');
	for (const [value, label] of options) {
		const option = element('option', '', label);
		option.value = value;
		input.append(option);
	}
	return input;
}

/** A body portal preserves the editor's layout and survives normal page navigation. */
export function createAgentWindow({
	createSession = createNativeToolSession,
	transport,
	openFont = openFontAttachment,
	mount = document.body,
} = {}) {
	const root = element('section', 'agent-window');
	root.id = 'noddy-agent-window';
	root.hidden = true;
	root.setAttribute('role', 'dialog');
	root.setAttribute('aria-modal', 'false');
	root.setAttribute('aria-label', 'Font agent');
	const header = element('div', 'agent-window__header');
	const title = element('strong', '', 'Agent');
	const drag = button('⠿', () => {}, 'agent-window__drag');
	drag.title = 'Drag to move. When focused, use arrow keys to move the window.';
	drag.setAttribute('aria-label', 'Move Agent window');
	const connectionToggle = button('Connect model', () => {
		connectionPanel.hidden = !connectionPanel.hidden;
	});
	const close = button('×', () => hide());
	close.setAttribute('aria-label', 'Hide Agent and stop any running request');
	header.append(drag, title, connectionToggle, close);
	const contextLabel = element(
		'p',
		'agent-window__context',
		'Current glyph only · Select a glyph in Characters.'
	);
	const connectionPanel = element('form', 'agent-connection');
	connectionPanel.hidden = true;
	const provider = select([
		['openai', 'OpenAI'],
		['opencode-zen', 'OpenCode Zen'],
	]);
	const model = element('input');
	model.type = 'text';
	model.placeholder = 'Model ID from your provider';
	model.maxLength = 160;
	model.required = true;
	model.autocomplete = 'off';
	const apiKey = element('input');
	apiKey.type = 'password';
	apiKey.placeholder = 'API key';
	apiKey.required = true;
	apiKey.autocomplete = 'off';
	apiKey.spellcheck = false;
	const advanced = element('details');
	advanced.append(element('summary', '', 'Advanced'));
	const protocol = select([
		['auto', 'Automatic'],
		['responses', 'Responses API'],
		['chat', 'Chat Completions API'],
		['messages', 'Anthropic Messages API'],
	]);
	const protocolHint = element('p', 'agent-connection__note');
	protocolHint.setAttribute('role', 'status');
	const updateProtocolHint = () => {
		if (!model.value.trim()) {
			protocolHint.textContent = 'Enter a model ID to see its API protocol.';
			return;
		}
		try {
			const resolved = resolveProviderProtocol(provider.value, model.value.trim(), protocol.value);
			protocolHint.textContent = `${protocol.value === 'auto' ? 'Automatic' : 'Selected'} API: ${
				PROTOCOL_LABELS[resolved]
			}.`;
		} catch (error) {
			protocolHint.textContent = error.message;
		}
	};
	advanced.append(field('API protocol', protocol));
	const updateProtocols = () => {
		protocol.querySelector('[value="messages"]').disabled = provider.value === 'openai';
		protocol.value = 'auto';
		updateProtocolHint();
	};
	updateProtocols();
	provider.addEventListener('change', () => {
		updateProtocols();
	});
	model.addEventListener('input', updateProtocolHint);
	protocol.addEventListener('change', updateProtocolHint);
	const connectionStatus = element('p', 'agent-connection__status');
	connectionStatus.setAttribute('role', 'status');
	const connect = element('button', 'agent-button agent-button--primary', 'Connect');
	connect.type = 'submit';
	const disconnect = button('Disconnect', () => {
		controller.disconnect();
		apiKey.value = '';
		connectionPanel.hidden = false;
		connectionStatus.textContent = 'Disconnected. The API key has been cleared.';
	});
	disconnect.hidden = true;
	const connectionActions = element('div', 'agent-connection__actions');
	connectionActions.append(connect, disconnect);
	connectionPanel.append(
		field('Provider', provider),
		field('Model', model),
		protocolHint,
		field('API key', apiKey),
		advanced,
		element(
			'p',
			'agent-connection__note',
			'Temporary connection for this tab. Your key is not saved. Credentials are checked on your first message. Prompts, images and font summaries go to the selected provider when you send. Images need a vision-capable model.'
		),
		connectionActions,
		connectionStatus
	);
	const messages = element('div', 'agent-messages');
	messages.setAttribute('role', 'log');
	messages.setAttribute('aria-label', 'Agent conversation');
	messages.setAttribute('aria-live', 'polite');
	const empty = () => {
		messages.replaceChildren(
			element(
				'p',
				'agent-messages__empty',
				'Edit the current glyph: change spacing, move selected paths, or draw a simple outline. The existing canvas shows the result.'
			)
		);
	};
	empty();
	const tools = new Map();
	const references = element('div', 'agent-window__references');
	const footer = element('div', 'agent-window__footer');
	const undo = button('Undo last agent edit', () => {
		const result = controller.undo();
		composer.setStatus(result.ok ? 'Undid the last agent edit.' : result.error.message);
	});
	const clear = button('Clear chat', () => {
		controller.clear();
		composer.clear();
	});
	footer.append(undo, clear);
	let pending = false;
	let importing = false;
	let disposed = false;
	let lastToggle;
	const appendMessage = (text, className = '') => {
		messages.querySelector('.agent-messages__empty')?.remove();
		const message = element('p', `agent-message ${className}`, text);
		messages.append(message);
		messages.scrollTop = messages.scrollHeight;
		return message;
	};
	const updateContext = (context) => {
		contextLabel.textContent = `Current glyph only · ${context?.projectName || 'Current font'} · ${
			context?.writable && context?.glyphId ? context.glyphId : 'Select a glyph in Characters'
		}`;
	};
	const syncToggles = () => {
		document.querySelectorAll('.agent-toggle').forEach((toggle) => {
			toggle.setAttribute('aria-pressed', String(!root.hidden));
			toggle.setAttribute('aria-expanded', String(!root.hidden));
		});
	};
	const controller = createAgentController({
		createSession,
		transport,
		onEvent(event) {
			if (event.type === 'clear') {
				empty();
				references.replaceChildren();
				tools.clear();
			}
			if (event.type === 'start') {
				pending = false;
				composer.clear();
				composer.setBusy(true);
				connect.disabled = true;
				clear.disabled = true;
				undo.disabled = true;
				updateContext(event.context);
				appendMessage(event.prompt, 'agent-message--user');
				references.replaceChildren();
				for (const attachment of controller.references) {
					const reference = element(
						'span',
						'agent-reference',
						`${attachment.name}${attachment.kind === 'font' ? ' · metadata only' : ''}`
					);
					if (attachment.kind === 'font')
						reference.append(button('Open as project', () => importFont(attachment)));
					references.append(reference);
				}
			}
			if (event.type === 'text') appendMessage(event.text);
			if (event.type === 'error') appendMessage(event.message, 'agent-message--error');
			if (event.type === 'tool') {
				if (event.state === 'running')
					tools.set(
						event.name,
						appendMessage(`Using ${event.name.replaceAll('_', ' ')}…`, 'agent-message--tool')
					);
				else if (tools.has(event.name))
					tools.get(event.name).textContent =
						event.state === 'done'
							? `✓ ${event.name.replaceAll('_', ' ')}`
							: `${event.name.replaceAll('_', ' ')}: ${
									event.result.error?.message || 'Could not complete this edit.'
							  }`;
			}
			if (event.type === 'finish') {
				composer.setBusy(false);
				connect.disabled = false;
				clear.disabled = false;
				undo.disabled = false;
				updateContext(event.context);
			}
			if (event.type === 'connection') {
				connectionToggle.textContent = event.connected ? event.model : 'Connect model';
				connectionToggle.title = event.connected
					? `${event.provider} · ${
							PROTOCOL_LABELS[event.effectiveProtocol]
					  } · configured for this tab; change connection`
					: 'Connect your own model';
				disconnect.hidden = !event.connected;
			}
		},
	});
	const submit = async ({ prompt, attachments }) => {
		if (importing) throw new Error('Wait for the font to finish opening before sending.');
		let selectionSession;
		try {
			selectionSession = createSession();
			const context = selectionSession.getContext();
			updateContext(context);
			requireSelectedGlyph(context);
		} finally {
			selectionSession?.dispose();
		}
		if (!controller.connected) {
			pending = true;
			connectionPanel.hidden = false;
			connect.textContent = 'Connect and send';
			composer.setStatus('Connect a model to send. Your message and files are ready.');
			model.focus();
			return;
		}
		await controller.run(prompt, attachments);
	};
	const composer = createAgentComposer({
		onSubmit: submit,
		onStop: () => controller.stop(),
		onOpenFont: importFont,
		getReferences: () => controller.references,
	});
	async function importFont(attachment) {
		if (controller.running || importing) {
			composer.setStatus('Stop the agent before opening a font project.');
			return;
		}
		importing = true;
		composer.cancelPreparing();
		const draftRevision = composer.revision;
		const draft = composer.getDraft();
		const files = [...controller.references, ...draft.attachments];
		composer.setStatus('Opening the font locally as a new project…');
		try {
			await openFont(attachment);
			if (disposed) return;
			controller.clear();
			if (composer.revision === draftRevision) composer.setValue(draft.prompt, files);
			composer.setStatus('Opened as a new project. The previous project is available in Projects.');
			composer.input.focus();
		} catch (error) {
			if (!disposed) composer.setStatus(error.message);
		} finally {
			importing = false;
		}
	}
	connectionPanel.addEventListener('submit', (event) => {
		event.preventDefault();
		try {
			controller.connect({
				provider: provider.value,
				protocol: protocol.value,
				model: model.value,
				apiKey: apiKey.value,
			});
			apiKey.value = '';
			connectionStatus.textContent = '';
			connectionPanel.hidden = true;
			connect.textContent = 'Connect';
			if (pending) composer.root.requestSubmit();
			else composer.input.focus();
		} catch (error) {
			connectionStatus.textContent = error.message;
		}
	});
	root.append(header, contextLabel, connectionPanel, messages, references, composer.root, footer);
	for (const eventName of ['dragenter', 'dragover', 'drop']) {
		root.addEventListener(eventName, (event) => {
			event.preventDefault();
			event.stopPropagation();
			if (eventName === 'drop') composer.addFiles(event.dataTransfer.files);
		});
	}
	mount.append(root);
	const clamp = (left, top) => {
		root.style.left = `${Math.max(0, Math.min(left, window.innerWidth - root.offsetWidth))}px`;
		root.style.top = `${Math.max(40, Math.min(top, window.innerHeight - root.offsetHeight))}px`;
		root.style.right = 'auto';
	};
	let dragging;
	header.addEventListener('pointerdown', (event) => {
		if (event.button !== 0 || (event.target.closest('button') && event.target !== drag)) return;
		const rect = root.getBoundingClientRect();
		dragging = {
			pointerId: event.pointerId,
			x: event.clientX - rect.left,
			y: event.clientY - rect.top,
		};
		header.setPointerCapture(event.pointerId);
		event.preventDefault();
	});
	header.addEventListener('pointermove', (event) => {
		if (dragging?.pointerId === event.pointerId)
			clamp(event.clientX - dragging.x, event.clientY - dragging.y);
	});
	const endDrag = () => {
		dragging = undefined;
	};
	header.addEventListener('pointerup', endDrag);
	header.addEventListener('pointercancel', endDrag);
	header.addEventListener('lostpointercapture', endDrag);
	drag.addEventListener('keydown', (event) => {
		const delta = {
			ArrowLeft: [-20, 0],
			ArrowRight: [20, 0],
			ArrowUp: [0, -20],
			ArrowDown: [0, 20],
		}[event.key];
		if (!delta) return;
		event.preventDefault();
		event.stopPropagation();
		const rect = root.getBoundingClientRect();
		clamp(rect.left + delta[0], rect.top + delta[1]);
	});
	root.addEventListener('keydown', (event) => {
		// Focus in this non-modal window belongs to its controls. Keep native
		// input/button behavior, but never forward Delete or tool keys to canvas.
		event.stopPropagation();
		if (event.key === 'Escape') {
			hide();
		}
	});
	root.addEventListener('keyup', (event) => {
		event.stopPropagation();
	});
	root.addEventListener('focusin', () => {
		if (!controller.running) {
			let session;
			try {
				session = createSession();
				updateContext(session.getContext());
			} catch {
				contextLabel.textContent = 'Open a project to continue with the agent.';
			} finally {
				session?.dispose();
			}
		}
	});
	const onResize = () => {
		if (!root.hidden && root.style.left) {
			const rect = root.getBoundingClientRect();
			clamp(rect.left, rect.top);
		}
	};
	window.addEventListener('resize', onResize);
	function hide() {
		controller.stop();
		root.hidden = true;
		syncToggles();
		if (lastToggle?.isConnected) lastToggle.focus();
	}
	function show(toggle) {
		lastToggle = toggle || lastToggle;
		root.hidden = false;
		syncToggles();
		composer.input.focus();
	}
	return {
		root,
		controller,
		composer,
		show,
		hide,
		toggle(toggle) {
			if (root.hidden) show(toggle);
			else hide();
		},
		start({ prompt, attachments }) {
			show();
			composer.setValue(prompt, attachments);
			composer.root.requestSubmit();
		},
		dispose() {
			disposed = true;
			composer.dispose();
			controller.disconnect();
			root.remove();
			window.removeEventListener('resize', onResize);
		},
	};
}

export function getAgentWindow() {
	if (!singleton) singleton = createAgentWindow();
	return singleton;
}

export function makeAgentToggle() {
	const toggle = button('Agent', () => getAgentWindow().toggle(toggle), 'agent-toggle');
	toggle.setAttribute('aria-controls', 'noddy-agent-window');
	toggle.setAttribute('aria-pressed', String(singleton ? !singleton.root.hidden : false));
	toggle.setAttribute('aria-expanded', toggle.getAttribute('aria-pressed'));
	toggle.title = 'Show or hide the Agent window';
	for (const eventName of ['keydown', 'keyup'])
		toggle.addEventListener(eventName, (event) => event.stopPropagation());
	return toggle;
}
