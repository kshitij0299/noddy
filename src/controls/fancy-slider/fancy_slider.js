import { addAsChildren, makeElement } from '../../common/dom.js';

/**
 * Makes a styled slider element
 * @param {Number} initialValue - what the slider value should be
 * @param {Function | false} callback - what to do when it changes
 * @param {Number} min - min value for the slider
 * @param {Number} max - max value for the slider
 * @param {Number} step - how big each step is
 * @param {String =} label - accessible name for the slider
 * @returns {Element}
 */
export function makeFancySlider(
	initialValue = 50,
	callback,
	min = 0,
	max = 100,
	step = 1,
	label = 'Slider value'
) {
	// log('makeFancySlider', 'start');

	let wrapper = makeElement({ className: 'fancy-slider__wrapper' });
	let sliderReadout = makeElement({
		className: 'fancy-slider__slider-readout',
		innerHTML: '' + initialValue,
		attributes: { 'aria-hidden': 'true' },
	});

	let bar = makeElement({
		tag: 'input',
		attributes: {
			type: 'range',
			value: initialValue,
			min: min,
			max: max,
			step: step,
			'aria-label': label,
			title: label,
			'aria-valuetext': '' + initialValue,
		},
		className: 'fancy-slider__bar nd-range',
	});
	// The filled part of the track (#134, nd-slider.css): webkit has no progress pseudo-element.
	const paintFill = (value) =>
		/** @type {HTMLElement} */ (bar).style.setProperty(
			'--nd-range-fill',
			`${((value - min) / (max - min || 1)) * 100}%`
		);
	paintFill(Number(initialValue));
	bar.addEventListener('input', (event) => {
		// @ts-expect-error 'property does exist'
		const value = parseInt(event.target.value);
		sliderReadout.innerHTML = '' + value;
		bar.setAttribute('aria-valuetext', '' + value);
		paintFill(value);
		if (callback) callback(value);
	});

	addAsChildren(wrapper, [bar, sliderReadout]);

	// log('makeFancySlider', 'end');
	return wrapper;
}
