/**
 * <agent-step-line>: full-width one-liner in the thread.
 * `render({ tone, text, icon })` — tone: 'kept' | 'yours' | 'failed' | 'info'.
 * Status is carried by the icon and a screen-reader prefix, never colour alone.
 */
import { el, icon, srOnly } from './card-shell.js';

export const STEP_TONES = Object.freeze({
	kept: { icon: 'check_circle', label: 'Done' },
	yours: { icon: 'edit', label: 'Your edit' },
	failed: { icon: 'error', label: 'Failed' },
	info: { icon: 'info', label: 'Note' },
});

export class AgentStepLine extends HTMLElement {
	constructor() {
		super();
		this._data = null;
	}

	set data(value) {
		this.render(value);
	}

	get data() {
		return this._data;
	}

	connectedCallback() {
		if (this._data && !this.childElementCount) this.render(this._data);
	}

	/**
	 * @param {Object} data
	 * @param {String} data.text - Mono one-liner
	 * @param {'kept'|'yours'|'failed'|'info'} [data.tone]
	 * @param {String} [data.icon] - icon override
	 */
	render(data = {}) {
		this._data = data;
		const tone = STEP_TONES[data.tone] ? data.tone : 'info';
		const spec = STEP_TONES[tone];
		this.dataset.tone = tone;
		const line = el('div', `agent-step-line agent-step-line--${tone}`);
		line.setAttribute('role', 'status');
		line.append(
			icon(data.icon || spec.icon, 'agent-step-line__icon'),
			srOnly(`${spec.label}: `),
			el('span', 'agent-step-line__text text-mono-small', data.text || '')
		);
		this.replaceChildren(line);
	}
}
