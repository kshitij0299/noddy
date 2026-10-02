import { ATTACHMENT_ACCEPT, prepareAttachment, validateAttachmentSet } from './attachments.js';

export function element(tag, className, text) {
	const node = document.createElement(tag);
	if (className) node.className = className;
	if (text !== undefined) node.textContent = text;
	return node;
}

export function button(text, onClick, className = '') {
	const node = element('button', `agent-button ${className}`, text);
	node.type = 'button';
	node.addEventListener('click', onClick);
	return node;
}

/** Shared by the existing welcome form and the floating window. */
export function createAgentComposer({
	onSubmit,
	onStop = () => {},
	onOpenFont,
	getReferences = () => [],
	readAttachment = prepareAttachment,
	placeholder = 'Ask the agent to edit the current glyph…',
	submitLabel = 'Send',
}) {
	const root = element('form', 'agent-composer');
	const input = element('textarea', 'agent-composer__input');
	input.placeholder = placeholder;
	input.setAttribute('aria-label', 'Message the font agent');
	input.rows = 3;
	input.maxLength = 12000;
	const chips = element('div', 'agent-attachments');
	const status = element('p', 'agent-composer__status');
	status.setAttribute('role', 'status');
	const chooser = element('input');
	chooser.type = 'file';
	chooser.accept = ATTACHMENT_ACCEPT;
	chooser.multiple = true;
	chooser.hidden = true;
	chooser.setAttribute('aria-label', 'Attach images or fonts');
	const attach = button('＋ Attach', () => chooser.click());
	attach.title = 'Attach PNG, JPEG, WebP, OTF, or TTF files';
	const send = element('button', 'agent-button agent-button--primary', submitLabel);
	send.type = 'submit';
	const row = element('div', 'agent-composer__actions');
	row.append(attach, element('span', 'agent-composer__hint', 'Images · OTF · TTF'), send);
	root.append(input, chips, row, chooser, status);
	let attachments = [];
	let preparing = false;
	let busy = false;
	let disposed = false;
	let readGeneration = 0;
	let draftRevision = 0;
	const cancelPreparing = () => {
		readGeneration++;
		draftRevision++;
		preparing = false;
		send.disabled = disposed;
		chooser.value = '';
	};
	const render = () => {
		chips.replaceChildren();
		for (const attachment of attachments) {
			const chip = element('div', 'agent-attachment');
			if (attachment.kind === 'image') {
				const preview = element('img');
				preview.src = attachment.dataURL;
				preview.alt = '';
				chip.append(preview);
			}
			chip.append(
				element('span', '', `${attachment.name}${attachment.kind === 'font' ? ' · metadata' : ''}`)
			);
			if (attachment.kind === 'font' && onOpenFont) {
				const open = button('Open as project', () => onOpenFont(attachment));
				open.disabled = busy;
				chip.append(open);
			}
			const remove = button('×', () => {
				attachments = attachments.filter((item) => item.id !== attachment.id);
				draftRevision++;
				render();
			});
			remove.setAttribute('aria-label', `Remove ${attachment.name}`);
			remove.disabled = busy;
			chip.append(remove);
			chips.append(chip);
		}
	};
	const addFiles = async (files) => {
		if (preparing || busy || disposed) return;
		const generation = ++readGeneration;
		const isCurrent = () => !disposed && generation === readGeneration;
		preparing = true;
		send.disabled = true;
		status.textContent = 'Reading attachments locally…';
		const errors = [];
		try {
			for (const file of Array.from(files)) {
				if (!isCurrent()) return;
				try {
					validateAttachmentSet([...getReferences(), ...attachments, { kind: 'pending' }]);
					const attachment = await readAttachment(file);
					if (!isCurrent()) return;
					validateAttachmentSet([...getReferences(), ...attachments, attachment]);
					attachments.push(attachment);
					draftRevision++;
				} catch (error) {
					if (!isCurrent()) return;
					errors.push(error.message);
				}
			}
			status.textContent =
				errors.join(' ') ||
				'Ready. Images and font metadata will be sent only when you press Send.';
			render();
		} finally {
			if (isCurrent()) {
				preparing = false;
				send.disabled = false;
				chooser.value = '';
			}
		}
	};
	chooser.addEventListener('change', () => addFiles(chooser.files));
	for (const eventName of ['dragenter', 'dragover', 'dragleave', 'drop']) {
		root.addEventListener(eventName, (event) => {
			event.preventDefault();
			event.stopPropagation();
			root.classList.toggle(
				'agent-composer--dragging',
				eventName === 'dragover' || eventName === 'dragenter'
			);
			if (eventName === 'drop') addFiles(event.dataTransfer.files);
		});
	}
	root.addEventListener('paste', (event) => {
		event.stopPropagation();
		if (event.clipboardData?.files.length) {
			event.preventDefault();
			addFiles(event.clipboardData.files);
		}
	});
	root.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (disposed) return;
		if (busy) return onStop();
		if (preparing || (!input.value.trim() && !attachments.length)) return;
		try {
			await onSubmit({ prompt: input.value, attachments: [...attachments] });
		} catch (error) {
			status.textContent = error.message;
		}
	});
	input.addEventListener('input', () => {
		draftRevision++;
	});
	input.addEventListener('keydown', (event) => {
		if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
			event.preventDefault();
			if (!busy && !preparing) root.requestSubmit();
		}
	});
	return {
		root,
		input,
		addFiles,
		cancelPreparing,
		get revision() {
			return draftRevision;
		},
		getDraft() {
			return { prompt: input.value, attachments: [...attachments] };
		},
		setValue(prompt, files = []) {
			if (disposed) return;
			cancelPreparing();
			input.value = prompt;
			attachments = [...files];
			status.textContent = '';
			render();
		},
		clear() {
			cancelPreparing();
			input.value = '';
			attachments = [];
			status.textContent = '';
			render();
		},
		setStatus(text) {
			status.textContent = text;
		},
		setBusy(value) {
			if (value) cancelPreparing();
			busy = value;
			input.readOnly = value;
			attach.disabled = value;
			send.textContent = value ? 'Stop' : submitLabel;
			render();
		},
		dispose() {
			disposed = true;
			cancelPreparing();
			attachments = [];
			input.value = '';
			status.textContent = '';
			render();
		},
	};
}
