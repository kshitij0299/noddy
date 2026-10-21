/**
 * Agent panel composer (M4, issue #19; Figma Composer in 50:78).
 *
 * Attach (`attach_file`) · input "Ask the agent" · round send
 * (`arrow_upward`). Attachment chips sit above the input. Enter sends,
 * Shift+Enter adds a line; the input grows to 4 lines, then scrolls.
 * While a run is in flight the send button becomes Stop: minimizing and
 * Esc never stop a run, so this is the one place that does.
 *
 * Attachment reading and limits come from ../attachments.js (kept plumbing).
 */
import { ATTACHMENT_ACCEPT, prepareAttachment, validateAttachmentSet } from '../attachments.js';
import { el, icon } from './cards/card-shell.js';

const MAX_LINES = 4;

/**
 * @param {Object} options
 * @param {(draft: {prompt: String, attachments: Object[]}) => (void|Promise<void>)} options.onSubmit
 * @param {() => void} [options.onStop]
 * @param {() => Object[]} [options.getReferences] - attachments already in the conversation
 * @param {(file: File) => Promise<Object>} [options.readAttachment]
 * @param {(message: String) => void} [options.onAttachError]
 */
export function createPanelComposer({
	onSubmit,
	onStop = () => {},
	getReferences = () => [],
	readAttachment = prepareAttachment,
	onAttachError = () => {},
}) {
	const root = el('form', 'agent-composer');
	root.noValidate = true;
	const chips = el('div', 'agent-composer__chips');
	const row = el('div', 'agent-composer__row');

	const chooser = /** @type {HTMLInputElement} */ (el('input'));
	chooser.type = 'file';
	chooser.accept = ATTACHMENT_ACCEPT;
	chooser.multiple = true;
	chooser.hidden = true;
	chooser.tabIndex = -1;

	const attach = /** @type {HTMLButtonElement} */ (
		el('button', 'agent-icon-button agent-composer__attach')
	);
	attach.type = 'button';
	attach.setAttribute('aria-label', 'Attach a sketch or font');
	attach.append(icon('attach_file'));
	attach.addEventListener('click', () => chooser.click());

	const input = /** @type {HTMLTextAreaElement} */ (
		el('textarea', 'agent-composer__input text-body')
	);
	input.rows = 1;
	input.maxLength = 12000;
	input.placeholder = 'Ask the agent';
	input.setAttribute('aria-label', 'Ask the agent');

	const send = /** @type {HTMLButtonElement} */ (el('button', 'agent-composer__send'));
	send.type = 'submit';
	const sendIcon = icon('arrow_upward');
	send.append(sendIcon);

	row.append(attach, input, send);
	root.append(chips, row, chooser);

	let attachments = [];
	let busy = false;
	let preparing = false;
	let disposed = false;
	let generation = 0;

	function syncSend() {
		const empty = !input.value.trim() && !attachments.length;
		send.disabled = disposed || (!busy && (empty || preparing));
		send.classList.toggle('is-stop', busy);
		sendIcon.textContent = busy ? 'stop' : 'arrow_upward';
		send.setAttribute('aria-label', busy ? 'Stop the agent' : 'Send');
	}

	function grow() {
		input.style.height = 'auto';
		const style = getComputedStyle(input);
		const line = parseFloat(style.lineHeight) || 20;
		const max = line * MAX_LINES;
		const height = Math.min(input.scrollHeight, max);
		if (height > 0) input.style.height = `${height}px`;
		input.style.overflowY = input.scrollHeight > max ? 'auto' : 'hidden';
	}

	function render() {
		chips.replaceChildren(
			...attachments.map((attachment) => {
				const chip = el('span', 'agent-attachment text-label');
				chip.append(icon(attachment.kind === 'font' ? 'font_download' : 'image'));
				chip.append(el('span', 'agent-attachment__name', attachment.name));
				const remove = /** @type {HTMLButtonElement} */ (el('button', 'agent-attachment__remove'));
				remove.type = 'button';
				remove.disabled = busy;
				remove.setAttribute('aria-label', `Remove ${attachment.name}`);
				remove.append(icon('close'));
				remove.addEventListener('click', () => {
					attachments = attachments.filter((item) => item.id !== attachment.id);
					render();
					input.focus();
				});
				chip.append(remove);
				return chip;
			})
		);
		chips.hidden = !attachments.length;
		syncSend();
	}

	async function addFiles(files) {
		if (busy || disposed) return;
		const run = ++generation;
		preparing = true;
		syncSend();
		try {
			for (const file of Array.from(files || [])) {
				try {
					validateAttachmentSet([...getReferences(), ...attachments, { kind: 'pending' }]);
					const attachment = await readAttachment(file);
					if (run !== generation || disposed) return;
					validateAttachmentSet([...getReferences(), ...attachments, attachment]);
					attachments.push(attachment);
				} catch (error) {
					if (run !== generation || disposed) return;
					onAttachError(error.message);
				}
			}
		} finally {
			if (run === generation) {
				preparing = false;
				chooser.value = '';
				render();
			}
		}
	}

	chooser.addEventListener('change', () => addFiles(chooser.files));
	root.addEventListener('dragover', (event) => event.preventDefault());
	root.addEventListener('drop', (event) => {
		event.preventDefault();
		event.stopPropagation();
		addFiles(event.dataTransfer?.files);
	});
	root.addEventListener('paste', (event) => {
		event.stopPropagation();
		if (event.clipboardData?.files?.length) {
			event.preventDefault();
			addFiles(event.clipboardData.files);
		}
	});
	input.addEventListener('input', () => {
		grow();
		syncSend();
	});
	input.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			if (!busy) root.requestSubmit();
		}
	});
	root.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (disposed) return;
		if (busy) {
			onStop();
			return;
		}
		if (preparing || (!input.value.trim() && !attachments.length)) return;
		await onSubmit({ prompt: input.value, attachments: [...attachments] });
	});

	render();

	return {
		root,
		input,
		send,
		attach,
		addFiles,
		openChooser() {
			if (!busy) chooser.click();
		},
		getDraft() {
			return { prompt: input.value, attachments: [...attachments] };
		},
		setValue(prompt, files = attachments) {
			input.value = prompt;
			attachments = [...files];
			grow();
			render();
		},
		clear() {
			generation++;
			preparing = false;
			input.value = '';
			attachments = [];
			grow();
			render();
		},
		setBusy(value) {
			busy = value;
			attach.disabled = value;
			render();
		},
		dispose() {
			disposed = true;
			generation++;
			attachments = [];
			input.value = '';
			render();
		},
	};
}
