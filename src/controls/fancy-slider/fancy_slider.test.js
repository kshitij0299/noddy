// #134: the legacy fancy slider keeps its signature and behaviour; only its look changed (it now
// wears the shared .nd-range style and paints its filled part).
import { describe, expect, it, vi } from 'vitest';
import { makeFancySlider } from './fancy_slider.js';

describe('makeFancySlider', () => {
	it('keeps its signature: value, callback, bounds, step, label', () => {
		const callback = vi.fn();
		const wrapper = makeFancySlider(30, callback, 0, 200, 10, 'Transparency');
		const bar = /** @type {HTMLInputElement} */ (wrapper.querySelector('input[type="range"]'));
		expect(wrapper.classList.contains('fancy-slider__wrapper')).toBe(true);
		expect(bar.classList.contains('nd-range')).toBe(true);
		expect([bar.value, bar.min, bar.max, bar.step]).toEqual(['30', '0', '200', '10']);
		expect(bar.getAttribute('aria-label')).toBe('Transparency');
		expect(bar.style.getPropertyValue('--nd-range-fill')).toBe('15%');

		bar.value = '100';
		bar.dispatchEvent(new Event('input'));
		expect(callback).toHaveBeenCalledWith(100);
		expect(wrapper.querySelector('.fancy-slider__slider-readout').textContent).toBe('100');
		expect(bar.getAttribute('aria-valuetext')).toBe('100');
		expect(bar.style.getPropertyValue('--nd-range-fill')).toBe('50%');
	});

	it('works with the defaults and no callback', () => {
		const wrapper = makeFancySlider();
		const bar = /** @type {HTMLInputElement} */ (wrapper.querySelector('input[type="range"]'));
		expect(bar.value).toBe('50');
		expect(bar.getAttribute('aria-label')).toBe('Slider value');
		bar.value = '70';
		expect(() => bar.dispatchEvent(new Event('input'))).not.toThrow();
		expect(bar.style.getPropertyValue('--nd-range-fill')).toBe('70%');
	});
});
