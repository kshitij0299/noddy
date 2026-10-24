/**
 * "Local agent" switch for the agent panel (dev server only; loaded by agent-panel.js through
 * an `import.meta.env.DEV` dynamic import, so neither this nor ../local-agent.js is built).
 *
 * One header icon button (aria-pressed). On: this tab becomes the local agent's target and the
 * thread shows the `claude mcp add …` command with Copy. A coding agent connecting turns the
 * model chip into "<client> · connected"; its tool calls show as the usual step lines and a
 * submit_glyph adds the usual receipt. The composer's Stop button turns it off (as does the
 * switch, or closing the tab); built-in sends wait until then.
 *
 * A reload keeps it on for this tab (bug 25): the switch state is kept in sessionStorage and
 * the panel turns it back on at mount. The dev server's token is the same until it restarts,
 * so the coding agent's existing `claude mcp add` entry keeps working.
 */
import { createLocalAgentLink } from '../local-agent.js';
import { el, icon } from './cards/card-shell.js';
import './local-agent.css';

// Per tab: sessionStorage survives a reload of this tab only.
export const LOCAL_AGENT_STORAGE_KEY = 'noddy.localAgent';

/**
 * What is kept: 'on:<fingerprint>' of the command, never the token itself. A different
 * fingerprint after a reload means the dev server restarted (new token): show the command.
 * @param {String} command
 */
function fingerprint(command) {
	let hash = 0;
	for (const char of command) hash = (Math.imul(hash, 31) + char.codePointAt(0)) | 0;
	return (hash >>> 0).toString(36);
}

/** @returns {String | null} the stored fingerprint, '' for an old plain 'on', null when off */
function remembered() {
	try {
		const value = sessionStorage.getItem(LOCAL_AGENT_STORAGE_KEY);
		if (value === 'on') return '';
		return value?.startsWith('on:') ? value.slice(3) : null;
	} catch {
		return null;
	}
}

/** @param {String | false} command - the command now on, or false: off */
function remember(command) {
	try {
		if (command) sessionStorage.setItem(LOCAL_AGENT_STORAGE_KEY, `on:${fingerprint(command)}`);
		else sessionStorage.removeItem(LOCAL_AGENT_STORAGE_KEY);
	} catch {
		// Storage blocked: Local agent still works, it just does not survive a reload.
	}
}

/**
 * MCP clientInfo names are ids ("claude-code"); the chip shows "Claude Code".
 * @param {String} name
 * @returns {String}
 */
export function clientLabel(name) {
	const words = String(name || '')
		.split(/[-_\s]+/)
		.filter(Boolean);
	if (!words.length) return 'Local agent';
	return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

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
	/** The client the thread last announced, so a repeated event adds no second line. */
	let announced = null;

	const link = createLocalAgentLink({
		createSession: panel.createSession,
		fetchImpl: panel.fetchImpl,
		onEvent(event) {
			if (event.type === 'state') onState(event);
			else if (event.type === 'tool') onTool(event);
		},
	});

	function onState({ state, client: name, reason }) {
		const client = clientLabel(name);
		const on = state !== 'off';
		button.setAttribute('aria-pressed', String(on));
		panel.setBusy(on);
		if (state === 'connected') {
			panel.setChip(`${client} · connected`);
			if (announced !== client) panel.addStep('kept', `${client} connected`);
			announced = client;
		} else if (state === 'waiting') {
			panel.setChip('Local agent · waiting');
			announced = null;
		} else {
			announced = null;
			panel.setChip(null);
			retireCommand();
			// The user turned it off, or another tab took it: a reload keeps it off. A closed
			// stream (reload, dev server restart) keeps it on for the next load.
			if (reason === 'stop' || reason === 'replaced') remember(false);
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

	/** @param {{resumed?: Boolean}} [options] - resumed: turned back on after a reload */
	async function turnOn({ resumed = false } = {}) {
		if (panel.isBusy()) {
			if (!resumed) panel.addError({ message: 'Stop the agent first · then turn on Local agent' });
			return;
		}
		starting = true;
		button.disabled = true;
		try {
			const { command } = await link.enable();
			const before = remembered();
			remember(command);
			if (resumed && before === fingerprint(command))
				panel.addStep('info', 'Local agent is still on after the reload');
			else showCommand(command);
		} catch (error) {
			remember(false);
			if (!resumed) panel.addError({ message: error.message });
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

	if (remembered() !== null) turnOn({ resumed: true });

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
