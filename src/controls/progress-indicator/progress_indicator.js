import { addAsChildren, makeElement } from '../../common/dom.js';
import { pause } from '../../common/functions.js';

// Animation
let degrees = 0;

/**
 * Updates the currently displayed progress indicator
 * @param {String} message - what text to show for this progress step
 * @param {Boolean =} isError - switch the indicator to its error state
 */
export async function updateProgressIndicator(message, isError = false) {
	const container = document.querySelector('#progress-indicator__message');
	if (container) {
		/** @type {HTMLElement} */
		const bar = document.querySelector('#progress-indicator__bar');
		if (bar) {
			degrees = degrees + 0.5;
			bar.style.backgroundPosition = `${degrees}%`;
			if (message) container.innerHTML = message;
		}
		if (isError) {
			container.closest('#progress-indicator__wrapper')?.setAttribute('data-error', 'true');
			container.setAttribute('role', 'alert');
		}
		await pause();
	}
}

/**
 * Makes a progress indicator control
 * @returns {Element}
 */
export function makeProgressIndicator() {
	// log('makeProgressIndicator', 'start');

	let wrapper = makeElement({
		id: 'progress-indicator__wrapper',
		attributes: { role: 'progressbar', 'aria-busy': 'true', 'aria-label': 'Loading' },
	});
	let message = makeElement({
		id: 'progress-indicator__message',
		innerHTML: 'Working...',
		attributes: { 'aria-live': 'polite' },
	});
	let bar = makeElement({
		tag: 'div',
		id: 'progress-indicator__bar',
	});

	addAsChildren(wrapper, [message, bar]);

	// log('makeProgressIndicator', 'end');
	return wrapper;
}
