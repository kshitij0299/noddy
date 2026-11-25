// #134: the Noddy slider on ui-sdk. Value changes reach onInput once per change, the arrows,
// Shift+arrows, Home and End step it, the number beside it is editable (clamped and snapped on
// commit), set() and setDisabled() drive it from vanilla code, and dispose() unmounts it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mountSlider, snapToStep } from './nd-slider.jsx';

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
	field.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text }));
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

	it('arrows step, Shift+arrows take ten steps, Home and End go to the bounds', async () => {
		const { slider, thumb, field, onInput } = mount();
		thumb.focus();
		await key(thumb, 'ArrowRight');
		expect(slider.value).toBe(55);
		expect(onInput).toHaveBeenLastCalledWith(55);
		await key(thumb, 'ArrowLeft');
		await key(thumb, 'ArrowDown');
		expect(slider.value).toBe(45);
		await key(thumb, 'ArrowRight', { shiftKey: true });
		expect(slider.value).toBe(95);
		await key(thumb, 'Home');
		expect(slider.value).toBe(0);
		await key(thumb, 'End');
		expect(slider.value).toBe(100);
		expect(field.value).toBe('100');
		expect(onInput).toHaveBeenCalledTimes(6);
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
