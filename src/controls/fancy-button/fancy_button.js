import { makeElement } from '../../common/dom.js';
import style from './fancy-button.css?inline';

/**
 * It's a button... only fancier!
 */
export class FancyButton extends HTMLElement {
	/**
	 * Create an FancyButton
	 * @param {Object} attributes - collection of key: value pairs to set as attributes
	 */
	constructor(attributes = {}) {
		super();
		Object.keys(attributes).forEach((key) => this.setAttribute(key, attributes[key]));

		this.wrapper = makeElement({ className: 'wrapper' });
		this.buttonContent = makeElement({ className: 'buttonContent' });
		this.buttonText = makeElement({ tag: 'slot', className: 'buttonText' });

		// NOTE: never call this.setAttribute() in the constructor. Chrome throws
		// NotSupportedError ("the result must not have attributes") when a custom
		// element constructor adds host attributes during a
		// document.createElement() upgrade, leaving a dead (un-upgraded) element.
		// Host-attribute defaults live in connectedCallback() instead.

		if (this.hasAttribute('secondary')) {
			this.wrapper.setAttribute('secondary', '');
		}
		if (this.hasAttribute('danger')) {
			this.wrapper.setAttribute('danger', '');
		}
		if (this.hasAttribute('minimal')) {
			this.wrapper.setAttribute('minimal', '');
		}

		if (this.hasAttribute('disabled')) {
			this.wrapper.setAttribute('disabled', '');
			this.disabled = true;
		} else {
			this.wrapper.setAttribute('tabIndex', '0');
			this.disabled = false;
		}

		if (this.hasAttribute('loading')) {
			this.wrapper.setAttribute('loading', '');
		}

		if (this.hasAttribute('error')) {
			this.wrapper.setAttribute('error', '');
		}

		// Put it all together
		let shadow = this.attachShadow({ mode: 'open' });
		let styles = makeElement({ tag: 'style', innerHTML: style });
		shadow.appendChild(styles);

		this.buttonContent.appendChild(this.buttonText);
		this.wrapper.appendChild(this.buttonContent);
		shadow.appendChild(this.wrapper);

		if (!this.disabled) {
			this.addEventListener('keydown', this.keyPress);
		}
		// Disabled / loading buttons must not activate, even for synthetic clicks
		this.addEventListener('click', this.guardDisabledClick, true);
	}

	/**
	 * Initialize accessible naming once the light DOM is available
	 */
	connectedCallback() {
		// Host-attribute defaults (see constructor note: these must not run
		// during construction or document.createElement() upgrade breaks).
		if (!this.hasAttribute('role')) this.setAttribute('role', 'button');
		if (this.hasAttribute('disabled')) this.setAttribute('aria-disabled', 'true');
		if (this.hasAttribute('loading')) this.setAttribute('aria-busy', 'true');
		this.syncAccessibleName();
		this.hideDecorativeIcons();
	}

	/**
	 * Icon-only buttons need an accessible name: prefer an explicit
	 * aria-label, then title, and fall back to a generic label so
	 * icon-only controls are never unnamed.
	 */
	syncAccessibleName() {
		const hasText = (this.textContent || '').trim().length > 0;
		if (!hasText && !this.hasAttribute('aria-label')) {
			this.setAttribute('aria-label', this.getAttribute('title') || 'Button');
		}
	}

	/**
	 * Decorative icon glyphs inside the button must not be announced.
	 * Only spans explicitly marked as icons are hidden, so text labels
	 * are never affected.
	 */
	hideDecorativeIcons() {
		this.querySelectorAll(
			'span.material-symbols-rounded, span.material-symbols, span[class*="icon"]'
		).forEach((icon) => icon.setAttribute('aria-hidden', 'true'));
	}

	/**
	 * Swallow activation while disabled or loading
	 * @param {Object} ev - event
	 */
	guardDisabledClick(ev) {
		if (this.hasAttribute('disabled') || this.hasAttribute('loading')) {
			ev.preventDefault();
			ev.stopImmediatePropagation();
		}
	}

	/**
	 * Specify which attributes are observed and trigger attributeChangedCallback
	 */
	static get observedAttributes() {
		return ['disabled', 'secondary', 'danger', 'minimal', 'loading', 'error'];
	}

	/**
	 * Listens for attribute changes on this element
	 * @param {String} attributeName - which attribute was changed
	 * @param {String} oldValue - value before the change
	 * @param {String} newValue - value after the change
	 */
	attributeChangedCallback(attributeName, oldValue, newValue) {
		// log(`Attribute ${attributeName} was ${oldValue}, is now ${newValue}`);
		if (!this.wrapper) return;
		if (attributeName === 'disabled') {
			if (newValue === '') {
				// disabled
				this.wrapper.setAttribute('disabled', '');
				this.setAttribute('aria-disabled', 'true');
				this.wrapper.removeAttribute('tabIndex');
				this.disabled = true;
			} else if (oldValue === '') {
				// enabled
				this.wrapper.removeAttribute('disabled');
				this.removeAttribute('aria-disabled');
				if (!this.hasAttribute('loading')) this.wrapper.setAttribute('tabIndex', '0');
				this.disabled = false;
			}
		}
		if (attributeName === 'loading') {
			if (newValue !== null) {
				// loading
				this.wrapper.setAttribute('loading', '');
				this.setAttribute('aria-busy', 'true');
				this.wrapper.removeAttribute('tabIndex');
			} else {
				// done loading
				this.wrapper.removeAttribute('loading');
				this.removeAttribute('aria-busy');
				if (!this.hasAttribute('disabled')) this.wrapper.setAttribute('tabIndex', '0');
			}
		}
		if (attributeName === 'error') {
			if (newValue !== null) {
				this.wrapper.setAttribute('error', '');
			} else {
				this.wrapper.removeAttribute('error');
			}
		}
		if (attributeName === 'secondary') {
			if (newValue === '') {
				// secondary
				this.wrapper.setAttribute('secondary', '');
			} else if (oldValue === '') {
				// primary
				this.wrapper.removeAttribute('secondary');
			}
		}
		if (attributeName === 'danger') {
			if (newValue === '') {
				// danger
				this.wrapper.setAttribute('danger', '');
			} else if (oldValue === '') {
				// safe
				this.wrapper.removeAttribute('danger');
			}
		}
		if (attributeName === 'minimal') {
			if (newValue === '') {
				// minimal
				this.wrapper.setAttribute('minimal', '');
			} else if (oldValue === '') {
				// primary
				this.wrapper.removeAttribute('minimal');
			}
		}
	}

	/**
	 * Handle keypress events
	 * @param {Object} ev - event
	 */
	keyPress(ev) {
		if (ev.keyCode === 13 || ev.keyCode === 32) {
			if (ev.keyCode === 32 && ev.target !== this) return;
			if (ev.keyCode === 32) ev.preventDefault();
			let click = new MouseEvent('click', {
				shiftKey: ev.shiftKey,
				ctrlKey: ev.ctrlKey,
				altKey: ev.altKey,
				metaKey: ev.metaKey,
			});
			this.dispatchEvent(click);
			this.flashAsPressed(this);
		}
	}

	/**
	 * Fake pressed state for keyboard event
	 * @param {Object} elem - element that got pressed
	 */
	flashAsPressed(elem) {
		elem.wrapper.style.top = '1px';
		elem.wrapper.style.left = '1px';
		elem.wrapper.style.boxShadow = 'none';

		setTimeout(function () {
			elem.wrapper.style.top = '0px';
			elem.wrapper.style.left = '0px';
			elem.wrapper.style.boxShadow = '2px 2px 2px rgba(0, 0, 0, 0.3)';
		}, 100);
	}
}
