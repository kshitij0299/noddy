/**
 * "Local agent" switch for the agent panel (dev server only; loaded by agent-panel.js through
 * an `import.meta.env.DEV` dynamic import, so neither this nor ../local-agent.js is built).
 *
 * One header icon button (aria-pressed). On: this tab becomes the local agent's target and the
 * thread shows the `claude mcp add …` command with Copy. A coding agent connecting turns the
 * model chip into "<client> · connected"; its tool calls show as the usual step lines and a
 * submit_glyph adds the usual receipt. The composer's Stop button turns it off (as does the
 * switch, or closing the tab); built-in sends wait until then.
 */
import { createLocalAgentLink } from '../local-agent.js';
import { el, icon } from './cards/card-shell.js';
import './local-agent.css';

/**
 * @param {Object} panel - hooks from agent-panel.js
 * @param {HTMLElement} panel.header
 * @param {HTMLElement} panel.before - the header node the switch goes in front of
 * @param {(label: String | null) => void} panel.setChip - null: the model chip again
 * @param {(busy: Boolean) => void} panel.setBusy - the composer's Send ⇄ Stop
 * @param {(node: Node) => Node} panel.append - adds to the thread
 * @param {(tone: String, text: String) => void} panel.addStep
 * @param {(error: Object) => void} panel.addError
 * @param {(event: Object) => void} panel.showTool - step line for a tool event
 * @param {(ids: Array<String>) => void} panel.addReceipt
 * @param {() => Boolean} panel.isBusy - the built-in agent is working
 * @param {Function} panel.createSession
 * @param {typeof fetch} [panel.fetchImpl]
 */
export function mountLocalAgent(panel) {
	const button = /** @type {HTMLButtonElement} */ (
		el('button', 'agent-icon-button agent-local-toggle')
	);
	button.type = 'button';
	button.title = 'Local agent';
	button.setAttribute('aria-label', 'Local agent');
	button.setAttribute('aria-pressed', 'false');
	button.append(icon('terminal'));
	panel.header.insertBefore(button, panel.before);

	/** @type {HTMLElement | null} */
	let commandBubble = null;
	let starting = false;

	const link = createLocalAgentLink({
		createSession: panel.createSession,
		fetchImpl: panel.fetchImpl,
		onEvent(event) {
			if (event.type === 'state') onState(event);
			else if (event.type === 'tool') onTool(event);
		},
	});

	function onState({ state, client, reason }) {
		const on = state !== 'off';
		button.setAttribute('aria-pressed', String(on));
		panel.setBusy(on);
		if (state === 'connected') {
			panel.setChip(`${client} · connected`);
			panel.addStep('kept', `${client} connected`);
		} else if (state === 'waiting') {
			panel.setChip('Local agent · waiting');
		} else {
			panel.setChip(null);
			retireCommand();
			const copy = {
				stop: 'Local agent off · finished edits are kept',
				replaced: 'Local agent moved to another tab',
				closed: 'Local agent disconnected',
			}[reason];
			if (copy) panel.addStep('info', copy);
		}
	}

	function onTool(event) {
		panel.showTool(event);
		const id = event.result?.glyph?.glyphId;
		if (event.name === 'submit_glyph' && event.state === 'done' && event.result?.changed && id)
			panel.addReceipt([id]);
	}

	/** The token in the command is no use once off: the bubble says so instead. */
	function retireCommand() {
		if (!commandBubble) return;
		commandBubble.replaceChildren(
			el('span', 'agent-bubble__text', 'Local agent is off. Turn it on for a new command.')
		);
		commandBubble = null;
	}

	function showCommand(command) {
		const bubble = el('div', 'agent-bubble agent-bubble--agent agent-local text-body');
		bubble.append(
			el(
				'span',
				'agent-bubble__text',
				'Local agent is on. Run this in a terminal, then ask your agent to use Noddy:'
			)
		);
		const code = el('code', 'agent-local__command text-mono-small', command);
		const actions = el('div', 'agent-local__actions text-body-small');
		const copy = /** @type {HTMLButtonElement} */ (
			el('button', 'agent-link-button', 'Copy command')
		);
		copy.type = 'button';
		copy.addEventListener('click', async () => {
			try {
				await navigator.clipboard.writeText(command);
				copy.textContent = 'Copied';
			} catch {
				// No clipboard permission: select the text so Cmd+C works.
				const range = document.createRange();
				range.selectNodeContents(code);
				getSelection()?.removeAllRanges();
				getSelection()?.addRange(range);
				copy.textContent = 'Press Cmd+C to copy';
			}
		});
		actions.append(copy);
		bubble.append(code, actions);
		panel.append(bubble);
		commandBubble = bubble;
		copy.focus();
	}

	async function turnOn() {
		if (panel.isBusy()) {
			panel.addError({ message: 'Stop the agent first · then turn on Local agent' });
			return;
		}
		starting = true;
		button.disabled = true;
		try {
			const { command } = await link.enable();
			showCommand(command);
		} catch (error) {
			panel.addError({ message: error.message });
		} finally {
			starting = false;
			button.disabled = false;
		}
	}

	button.addEventListener('click', () => {
		if (starting) return;
		if (link.state === 'off') turnOn();
		else link.stop();
	});

	return {
		button,
		get on() {
			return link.state !== 'off';
		},
		get state() {
			return link.state;
		},
		stop: () => link.stop(),
		dispose() {
			link.stop();
			button.remove();
		},
	};
}
