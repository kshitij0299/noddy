// #134: the Noddy slider on ui-sdk. Value changes reach onInput once per change, the arrows,
// Shift+arrows, Home and End step it, the number beside it is editable (clamped and snapped on
// commit), set() and setDisabled() drive it from vanilla code, and dispose() unmounts it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSlider, snapToStep } from './nd-slider.jsx';
import { isPlainNumber, largeStepFor, valueChars } from './steps.js';

const mounted = [];
function mount(options = {}) {
	const container = document.createElement('div');
	document.body.append(container);
	const onInput = vi.fn();
	const slider = mountSlider(container, {
		label: 'Chaos',
		value: 50,
		min: 0,
		max: 100,
		step: 5,
		onInput,
		...options,
	});
	mounted.push({ slider, container });
	const thumb = /** @type {HTMLInputElement} */ (container.querySelector('input[type="range"]'));
	const field = /** @type {HTMLInputElement} */ (container.querySelector('.nd-slider__input'));
	return { slider, container, thumb, field, onInput };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// A browser renders between two key presses; settle() gives React the same chance.
async function key(target, name, init = {}) {
	target.dispatchEvent(
		new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true, ...init })
	);
	target.dispatchEvent(new KeyboardEvent('keyup', { key: name, bubbles: true, ...init }));
	await settle();
}

// React tracks the value setter, so set it the way a browser does.
const setNativeValue = (input, text) =>
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text);

function typeInto(field, text) {
	field.focus();
	setNativeValue(field, text);
	field.dispatchEvent(
		new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })
	);
}

afterEach(() => {
	mounted.forEach(({ slider, container }) => {
		slider.dispose();
		container.remove();
	});
	mounted.length = 0;
});

describe('snapToStep', () => {
	it('clamps and snaps from min without float drift', () => {
		expect(snapToStep(37, { min: 0, max: 100, step: 5 })).toBe(35);
		expect(snapToStep(38, { min: 0, max: 100, step: 5 })).toBe(40);
		expect(snapToStep(-4, { min: 0, max: 100, step: 5 })).toBe(0);
		expect(snapToStep(240, { min: 48, max: 240, step: 8 })).toBe(240);
		expect(snapToStep(0.3, { min: 0, max: 1, step: 0.1 })).toBe(0.3);
		expect(snapToStep(7, { min: 3, max: 12, step: 2 })).toBe(7);
	});

	it('falls back to min for a value that is not a number', () => {
		expect(snapToStep(undefined, { min: 10, max: 100, step: 5 })).toBe(10);
		expect(snapToStep('x', { min: 0, max: 1, step: 0.1 })).toBe(0);
	});
});

describe('step helpers', () => {
	it('the large step is about a tenth of the range, in whole steps', () => {
		expect(largeStepFor({ min: 0, max: 100, step: 5 })).toBe(10);
		expect(largeStepFor({ min: 0, max: 100, step: 1 })).toBe(10);
		expect(largeStepFor({ min: -100, max: 100, step: 1 })).toBe(20);
		expect(largeStepFor({ min: 48, max: 240, step: 8 })).toBe(16);
		expect(largeStepFor({ min: 0, max: 4, step: 1 })).toBe(1);
		expect(largeStepFor({ min: 0, max: 1, step: 0.05 })).toBe(0.1);
	});

	it('the value field is as wide as the longest value', () => {
		expect(valueChars({ min: 0, max: 100, step: 5 })).toBe(3);
		expect(valueChars({ min: -100, max: 100, step: 1 })).toBe(4);
		expect(valueChars({ min: 0, max: 1, step: 0.1 })).toBe(3);
		expect(valueChars({ min: 0, max: 9, step: 1 })).toBe(1);
	});

	it('a plain number is digits with an optional minus and point', () => {
		for (const ok of ['5', '-20', '12.5', '.5', ' 40 ']) expect(isPlainNumber(ok)).toBe(true);
		for (const bad of ['1e3', '-', '1-2', '5.5.5', 'abc', '+'])
			expect(isPlainNumber(bad)).toBe(false);
	});
});

describe('Noddy slider', () => {
	it('renders a named thumb, a filled track and an editable value', () => {
		const { container, thumb, field } = mount({ unit: '°' });
		expect(container.querySelector('.nd-slider')).not.toBeNull();
		expect(thumb.getAttribute('aria-label')).toBe('Chaos');
		expect(thumb.value).toBe('50');
		expect(thumb.getAttribute('aria-valuetext')).toBe('50°');
		expect(container.querySelector('.nd-slider__indicator')).not.toBeNull();
		expect(field.getAttribute('aria-label')).toBe('Chaos value');
		expect(field.value).toBe('50');
		expect(container.querySelector('.nd-slider__unit').textContent).toBe('°');
		// The visible label is for sighted users; the thumb carries the name.
		expect(container.querySelector('.nd-slider__label').getAttribute('aria-hidden')).toBe('true');
	});

	it('arrows step, Shift+arrows take a tenth of the range, Home and End go to the bounds', async () => {
		const { slider, thumb, field, onInput } = mount();
		thumb.focus();
		await key(thumb, 'ArrowRight');
		expect(slider.value).toBe(55);
		expect(onInput).toHaveBeenLastCalledWith(55);
		await key(thumb, 'ArrowLeft');
		await key(thumb, 'ArrowDown');
		expect(slider.value).toBe(45);
		await key(thumb, 'ArrowRight', { shiftKey: true });
		expect(slider.value).toBe(55);
		await key(thumb, 'PageUp');
		expect(slider.value).toBe(65);
		await key(thumb, 'Home');
		expect(slider.value).toBe(0);
		await key(thumb, 'End');
		expect(slider.value).toBe(100);
		expect(field.value).toBe('100');
		expect(onInput).toHaveBeenCalledTimes(7);
	});

	it('typing a number commits on Enter, clamped and snapped; a half-typed number waits', async () => {
		const { slider, thumb, field, onInput } = mount();
		typeInto(field, '3');
		expect(onInput).not.toHaveBeenCalled();
		typeInto(field, '37');
		await key(field, 'Enter');
		expect(slider.value).toBe(35);
		expect(onInput).toHaveBeenLastCalledWith(35);
		await settle();
		expect(thumb.value).toBe('35');
		expect(field.value).toBe('35');
		typeInto(field, '400');
		field.blur();
		expect(slider.value).toBe(100);
		await settle();
		expect(field.value).toBe('100');
	});

	it('an emptied field goes back to the value it had', async () => {
		const { slider, field, onInput } = mount();
		typeInto(field, '');
		field.blur();
		await settle();
		expect(slider.value).toBe(50);
		expect(field.value).toBe('50');
		expect(onInput).not.toHaveBeenCalled();
	});

	// Review of #137: ui-sdk reports nothing when the typed text ends on the value it started
	// from, so the draft used to stay and the field stopped following the slider.
	it('retyping the value it already has and pressing Enter leaves the field following', async () => {
		const { slider, thumb, field, onInput } = mount();
		typeInto(field, '5');
		typeInto(field, '50');
		await key(field, 'Enter');
		thumb.focus();
		await key(thumb, 'ArrowRight');
		expect(slider.value).toBe(55);
		expect(field.value).toBe('55');
		slider.set(80);
		await settle();
		expect(field.value).toBe('80');
		field.focus();
		await key(field, 'ArrowUp');
		expect(slider.value).toBe(85);
		expect(onInput).toHaveBeenLastCalledWith(85);
	});

	it('the same after a blur', async () => {
		const { slider, field } = mount();
		typeInto(field, '5');
		typeInto(field, '50');
		field.blur();
		await settle();
		slider.set(20);
		await settle();
		expect(field.value).toBe('20');
	});

	it('a minus sign below a 0 minimum clamps to 0; junk goes back to the value', async () => {
		const { slider, field, onInput } = mount();
		const insert = (text) => {
			const event = new InputEvent('beforeinput', {
				bubbles: true,
				cancelable: true,
				inputType: 'insertText',
				data: text,
			});
			field.dispatchEvent(event);
			return !event.defaultPrevented;
		};
		field.focus();
		expect(insert('-')).toBe(true);
		expect(insert('e')).toBe(true);
		expect(insert('x')).toBe(false); // letters are still refused
		typeInto(field, '-20');
		await key(field, 'Enter');
		expect(slider.value).toBe(0);
		expect(field.value).toBe('0');
		for (const junk of ['1e3', '-', '5.5.5']) {
			slider.set(50);
			onInput.mockClear();
			typeInto(field, junk);
			await key(field, 'Enter');
			expect(slider.value).toBe(50);
			expect(field.value).toBe('50');
			expect(onInput).not.toHaveBeenCalled();
		}
		typeInto(field, '1e3');
		field.blur();
		await settle();
		expect(slider.value).toBe(50);
		expect(field.value).toBe('50');
	});

	it('Esc throws the typed text away and does not reach the panel; a second Esc does', async () => {
		const { slider, field, onInput } = mount();
		// The agent panel listens on an ancestor (agent-panel.js), like this one.
		const panel = vi.fn();
		const onPanelKey = (event) => event.key === 'Escape' && panel();
		document.body.addEventListener('keydown', onPanelKey);
		for (const typed of ['60', '400', '-2']) {
			typeInto(field, typed);
			await key(field, 'Escape');
			expect(field.value).toBe('50');
		}
		expect(panel).not.toHaveBeenCalled();
		field.blur();
		await settle();
		expect(slider.value).toBe(50);
		expect(onInput).not.toHaveBeenCalled();
		field.focus();
		await key(field, 'Escape');
		expect(panel).toHaveBeenCalled();
		document.body.removeEventListener('keydown', onPanelKey);
	});

	it('Alt+arrow in the field moves one step; Shift+arrow a tenth of the range', async () => {
		const { slider, field } = mount();
		field.focus();
		await key(field, 'ArrowUp', { altKey: true });
		expect(slider.value).toBe(55);
		await key(field, 'ArrowUp', { shiftKey: true });
		expect(slider.value).toBe(65);
	});

	it('sizes the field from the longest value; a missing value starts at min', () => {
		const { field } = mount({ min: -100, max: 100, step: 1, value: -100 });
		expect(field.style.getPropertyValue('--nd-slider-value-chars')).toBe('4');
		expect(field.value).toBe('-100');
		const other = mount({ value: undefined, min: 10 });
		expect(other.slider.value).toBe(10);
		expect(other.field.style.getPropertyValue('--nd-slider-value-chars')).toBe('3');
	});

	it('set() moves it without calling onInput; setDisabled() disables both parts', () => {
		const { slider, container, thumb, field, onInput } = mount();
		slider.set(80);
		expect(thumb.value).toBe('80');
		expect(field.value).toBe('80');
		expect(onInput).not.toHaveBeenCalled();
		slider.setDisabled(true);
		expect(container.querySelector('.nd-slider').hasAttribute('data-disabled')).toBe(true);
		expect(thumb.disabled).toBe(true);
		expect(field.disabled).toBe(true);
		slider.setDisabled(false);
		expect(thumb.disabled).toBe(false);
	});

	it('the row form lays label, track and value in that order; dispose unmounts', () => {
		const { slider, container } = mount({ variant: 'row', labelClassName: 'chaos-knob__label' });
		const root = container.querySelector('.nd-slider');
		expect(root.classList.contains('nd-slider--row')).toBe(true);
		const visible = [...root.children].filter((child) => child.type !== 'hidden');
		expect(visible.map((child) => child.className.split(' ')[0])).toEqual([
			'nd-slider__label',
			'nd-slider__control',
			'nd-slider__value',
		]);
		expect(container.querySelector('.chaos-knob__label').textContent).toBe('Chaos');
		slider.dispose();
		expect(container.querySelector('.nd-slider')).toBeNull();
		slider.set(10); // no-op after dispose
	});
});
