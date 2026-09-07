import { makeElement } from '../../common/dom.js';
import { animateRemove, closeAllInfoBubbles } from '../dialogs/dialogs.js';
import bubbleStyle from './info-bubble-popup.css?inline';
import style from './info-bubble.css?inline';

/**
 * A small bubble that displays information
 * about a target UI element
 */
export class InfoBubble extends HTMLElement {
	/**
	 * Create an InfoBubble
	 */
	constructor() {
		super();

		if (!this.hasAttribute('role')) this.setAttribute('role', 'button');
		if (!this.hasAttribute('aria-expanded')) this.setAttribute('aria-expanded', 'false');
		if (!this.hasAttribute('aria-label') && !this.hasAttribute('title')) {
			this.setAttribute('aria-label', 'Show information');
		}

		let wrapper = makeElement({ className: 'wrapper', tabIndex: true });
		this.entryPoint = makeElement({
			id: 'entryPoint',
			content: '?',
			attributes: { 'aria-hidden': 'true' },
		});

		// Put together visible stuff
		let shadow = this.attachShadow({ mode: 'open' });
		let styles = makeElement({ tag: 'style', innerHTML: style });
		shadow.appendChild(styles);

		wrapper.appendChild(this.entryPoint);
		shadow.appendChild(wrapper);

		// Event listeners
		this.addEventListener('click', this.toggle);
		this.addEventListener('keydown', this.keyPress);
	}

	/**
	 * Toggle the bubble
	 */
	toggle() {
		if (document.querySelector('#bubble')) this.hide(this.entryPoint);
		else this.show();
	}

	/**
	 * Show the bubble
	 */
	show() {
		// log(`info-bubble show`, 'start');
		closeAllInfoBubbles();
		// put together bubble stuff
		// log(`Making bubble...`);
		let bubble = makeElement({
			id: 'bubble',
			attributes: { role: 'tooltip' },
		});
		let bubbleStyles = makeElement({ tag: 'style', innerHTML: bubbleStyle });
		bubble.appendChild(bubbleStyles);

		// log(`Making pointer...`);
		let pointer = makeElement({
			className: 'pointer',
		});

		// log(`Making content...`);
		let content = makeElement({
			innerHTML: this.innerHTML,
			className: 'content',
		});
		let bubbleWidth = this.getAttribute('bubble-width');
		// log(`bubbleWidth: ${bubbleWidth}`);
		if (bubbleWidth) content.setAttribute('style', `width: ${bubbleWidth};`);

		bubble.appendChild(pointer);
		bubble.appendChild(content);
		content.addEventListener('mouseleave', () => this.hide(this.entryPoint));

		// Add and show bubble
		document.body.appendChild(bubble);
		this.setAttribute('aria-expanded', 'true');
		bubble.addEventListener('keydown', (ev) => {
			if (ev.key === 'Escape' || ev.keyCode === 27) {
				ev.preventDefault();
				this.hide(this.entryPoint);
				this.focus();
			}
		});
		let entryPointRect = this.entryPoint.getBoundingClientRect();
		let bubbleRect = bubble.getBoundingClientRect();
		let left = entryPointRect.x + entryPointRect.width + 2;
		let top = entryPointRect.y - bubbleRect.height / 2 + 18;

		if (left < 0 || top < 0) {
			/** @type {HTMLElement} */
			const pointer = bubble.querySelector('.pointer');
			pointer.style.display = 'none';
		}
		left = Math.max(left, 0);
		top = Math.max(top, 0);

		// log(`showing bubble at ${left} / ${top}`);
		// log(this.entryPoint);
		bubble.style.left = `${left}px`;
		bubble.style.top = `${top}px`;

		this.entryPoint.style.borderColor = 'var(--primary, rgb(180, 180, 180))';
		this.entryPoint.style.backgroundColor = 'var(--primary, rgb(180, 180, 180))';
		this.entryPoint.style.color = 'var(--primary-foreground, rgb(250, 250, 250))';
		this.entryPoint.style.cursor = 'pointer';
		this.entryPoint.innerHTML = '✖';

		// log(`info-bubble show`, 'end');
	}

	/**
	 * Hide the bubble
	 * @param {HTMLElement} entryPoint
	 */
	hide(entryPoint) {
		// log(`info-bubble hide`, 'start');
		// log(this);
		// log(entryPoint);
		/** @type {HTMLElement} */
		let bubble = document.querySelector('#bubble');
		if (bubble) animateRemove(bubble, 120, 0.98, '0px');
		this.setAttribute('aria-expanded', 'false');
		// document.body.removeChild(bubble);
		// log(`bubble has been removed`);

		entryPoint.style.borderColor = 'var(--muted-foreground, rgb(180, 180, 180))';
		entryPoint.style.backgroundColor = 'var(--card, transparent)';
		entryPoint.style.color = 'var(--muted-foreground, rgb(180, 180, 180))';
		entryPoint.style.cursor = 'help';
		entryPoint.innerHTML = '?';
		entryPoint.blur();
		// log(`info-bubble hide`, 'end');
	}

	/**
	 * Handle keypress event
	 * @param {Object} ev - event
	 */
	keyPress(ev) {
		switch (ev.keyCode) {
			case 13: // enter
			case 32: // space
				ev.preventDefault();
				this.dispatchEvent(new Event('click'));
				break;
			case 27: // escape
				this.hide(this.entryPoint);
				break;
			case 37: // d-pad left
			case 39: // d-pad right
			case 98: // ten key down
			case 102: // ten key right
			case 104: // ten key up
			case 107: // ten key +
			case 109: // ten key -
			case 100: // ten key left
				this.dispatchEvent(new Event('click'));
				break;

			default:
				break;
		}
	}
}
