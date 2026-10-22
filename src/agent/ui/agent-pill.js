/**
 * Minimized agent pill (M4, issue #20; Figma flow-05 / flow-06 / flow-08).
 *
 * One button: mark, status line, optional progress ring, decorative expand
 * icon. Pressing it restores the full panel. It has no stop or close
 * control: minimizing never stops a run.
 *
 * States (status is text + shape, never colour alone):
 *   idle      "Ask the agent"              (phone: "Agent")
 *   running   "Drafting g · 10/62" + ring  (count only when known)
 *   needs-you peach dot + "Needs you · 4 to review", or a waiting gate:
 *             "Needs you · plan ready" / "Needs you · approve the style"
 *   paused    `pause` icon + "Paused · 10/62" ("Paused · spend cap · 10/62")
 *   failed    `error` icon + "Stopped · 10/62"
 */
import { el, icon } from './cards/card-shell.js';

export const PILL_PHASES = Object.freeze(['idle', 'running', 'needs-you', 'paused', 'failed']);

const RING_RADIUS = 8;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/**
 * Picks the pill phase. A live run always wins; then paused, failed, a run
 * waiting at a gate, and glyphs waiting for review.
 * @param {Object} status
 * @param {Boolean} [status.running]
 * @param {Boolean} [status.paused]
 * @param {Boolean} [status.failed]
 * @param {Number} [status.review] - glyphs waiting for review (draft)
 * @param {String} [status.gate] - 'plan' | 'style' while a run waits at a gate
 * @returns {String} one of PILL_PHASES
 */
export function derivePillPhase({ running, paused, failed, review, gate } = {}) {
	if (running) return 'running';
	if (paused) return 'paused';
	if (failed) return 'failed';
	if (gate) return 'needs-you';
	if (review > 0) return 'needs-you';
	return 'idle';
}

/**
 * State → what the pill shows. Pure, so the copy mapping is testable.
 * @param {Object} state
 * @param {String} state.phase - one of PILL_PHASES
 * @param {String} [state.glyph] - the glyph being drafted, e.g. 'g'
 * @param {Number} [state.done] - glyphs finished in this run
 * @param {Number} [state.total] - glyphs in this run
 * @param {Number} [state.review] - glyphs waiting for review
 * @param {String} [state.gate] - 'plan' | 'style': a run waits for the user
 * @param {String} [state.pauseReason] - 'cap' when the spend cap paused the run
 * @param {Boolean} [state.compact] - phone width
 * @returns {{text: String, icon: String|null, dot: Boolean, ring: Boolean, progress: Number|null}}
 */
export function pillView(state = { phase: 'idle' }) {
	const hasCount = Number.isFinite(state.total) && state.total > 0;
	const count = hasCount ? ` · ${Math.max(0, state.done || 0)}/${state.total}` : '';
	const base = { text: '', icon: null, dot: false, ring: false, progress: null };
	switch (state.phase) {
		case 'running':
			return {
				...base,
				text: `${state.glyph ? `Drafting ${state.glyph}` : 'Working'}${count}`,
				ring: true,
				progress: hasCount ? Math.min(1, Math.max(0, (state.done || 0) / state.total)) : null,
			};
		case 'needs-you': {
			if (state.gate === 'plan') return { ...base, text: 'Needs you · plan ready', dot: true };
			if (state.gate === 'style')
				return { ...base, text: 'Needs you · approve the style', dot: true };
			const n = Math.max(0, state.review || 0);
			return { ...base, text: `Needs you · ${n} to review`, dot: true };
		}
		case 'paused':
			return {
				...base,
				text: `Paused${state.pauseReason === 'cap' ? ' · spend cap' : ''}${count}`,
				icon: 'pause',
			};
		case 'failed':
			return { ...base, text: `Stopped${count}`, icon: 'error' };
		default:
			return { ...base, text: state.compact ? 'Agent' : 'Ask the agent' };
	}
}

/**
 * Builds the pill button.
 * @param {Object} options
 * @param {Function} options.onExpand - restores the full panel
 * @returns {{root: HTMLButtonElement, render: (state: Object) => void, view: Object}}
 */
export function createAgentPill({ onExpand }) {
	const root = /** @type {HTMLButtonElement} */ (el('button', 'agent-pill'));
	root.type = 'button';
	root.id = 'agent-pill';
	root.setAttribute('aria-controls', 'agent-panel');
	root.setAttribute('aria-expanded', 'false');
	root.addEventListener('click', () => onExpand());

	const mark = el('span', 'agent-mark agent-mark--24');
	mark.setAttribute('aria-hidden', 'true');
	const lead = el('span', 'agent-pill__lead');
	lead.setAttribute('aria-hidden', 'true');
	const label = el('span', 'agent-pill__label text-label');
	const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	ring.setAttribute('class', 'agent-pill__ring');
	ring.setAttribute('viewBox', '0 0 20 20');
	ring.setAttribute('aria-hidden', 'true');
	ring.innerHTML = `<circle class="agent-pill__ring-track" cx="10" cy="10" r="${RING_RADIUS}"/><circle class="agent-pill__ring-value" cx="10" cy="10" r="${RING_RADIUS}" transform="rotate(-90 10 10)"/>`;
	const expand = icon('open_in_full', 'agent-pill__expand');
	root.append(mark, lead, label, ring, expand);

	const api = {
		root,
		view: pillView(),
		/** @param {Object} state */
		render(state) {
			const view = pillView(state);
			api.view = view;
			root.dataset.phase = state.phase || 'idle';
			label.textContent = view.text;
			lead.replaceChildren();
			if (view.dot) lead.append(el('span', 'agent-pill__dot'));
			if (view.icon) lead.append(icon(view.icon, 'agent-pill__icon'));
			lead.hidden = !view.dot && !view.icon;
			ring.style.display = view.ring ? '' : 'none';
			const value = ring.querySelector('.agent-pill__ring-value');
			if (view.progress === null) {
				ring.classList.add('is-indeterminate');
				value.setAttribute('stroke-dasharray', `${RING_LENGTH * 0.3} ${RING_LENGTH}`);
			} else {
				ring.classList.remove('is-indeterminate');
				value.setAttribute('stroke-dasharray', `${RING_LENGTH * view.progress} ${RING_LENGTH}`);
			}
			root.setAttribute('aria-label', `Agent: ${view.text}. Open the agent panel`);
		},
	};
	api.render({ phase: 'idle' });
	return api;
}
