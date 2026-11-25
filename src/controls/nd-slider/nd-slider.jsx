/**
 * The Noddy slider (#134), on ui-sdk: a thin track with a filled part, a small thumb that grows
 * on hover and press, and the value as an editable number beside it.
 *
 *   hero   label and value on one line, the track below at full width (the Tools tab's Chaos)
 *   row    label · fixed-length track · value, laid on the parent's grid columns (Fine-tune)
 *
 * Vanilla code mounts one with mountSlider(); each slider is its own small React root, so the
 * vanilla panels around it stay as they are. Styles: nd-slider.css (linked from index.html).
 */
import { createElement, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import {
	NumberInput,
	NumberInputControl,
	NumberInputGroup,
} from '@ui-sdk/react/number-input';
import {
	Slider,
	SliderControl,
	SliderIndicator,
	SliderThumb,
	SliderTrack,
} from '@ui-sdk/react/slider';

function createStore(initial) {
	let state = initial;
	const listeners = new Set();
	return {
		get: () => state,
		set(patch) {
			state = { ...state, ...patch };
			listeners.forEach((listener) => listener());
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => listeners.delete(listener);
		},
	};
}

/** Clamps to [min, max] and snaps to the step counted from min (no float drift). */
export function snapToStep(value, { min, max, step }) {
	const clamped = Math.min(max, Math.max(min, Number(value)));
	const steps = Math.round((clamped - min) / step);
	const decimals = (String(step).split('.')[1] || '').length;
	return Math.min(max, Number((min + steps * step).toFixed(decimals)));
}

export function NdSlider({
	store,
	label,
	min,
	max,
	step,
	largeStep,
	unit = '',
	variant = 'row',
	labelClassName = '',
	onInput,
}) {
	const { value, disabled } = useSyncExternalStore(store.subscribe, store.get);
	// What is typed in the field until Enter or blur commits it (undefined when not typing).
	const [draft, setDraft] = useState(undefined);
	const bounds = { min, max, step };
	const steps = largeStep === undefined ? {} : { largeStep };

	function take(next) {
		if (next === null || next === undefined || Number.isNaN(Number(next))) return;
		const snapped = snapToStep(next, bounds);
		if (snapped === store.get().value) return;
		store.set({ value: snapped });
		onInput?.(snapped);
	}

	return (
		<Slider
			value={value}
			min={min}
			max={max}
			step={step}
			{...steps}
			disabled={disabled}
			format={(number) => `${number}${unit}`}
			onValueChange={(next) => take(next)}
			className={`nd-slider nd-slider--${variant}`}
		>
			<span className={`nd-slider__label text-label ${labelClassName}`.trim()} aria-hidden="true">
				{label}
			</span>
			<SliderControl className="nd-slider__control">
				<SliderTrack className="nd-slider__track">
					<SliderIndicator className="nd-slider__indicator" />
					<SliderThumb aria-label={label} className="nd-slider__thumb" />
				</SliderTrack>
			</SliderControl>
			<NumberInput
				value={draft === undefined ? value : draft}
				min={min}
				max={max}
				step={step}
				{...steps}
				disabled={disabled}
				className="nd-slider__value"
				// Typing waits for Enter or blur, so a half-typed number never reaches a preview.
				onValueChange={(next, details) => {
					if (details.reason === 'input-change') setDraft(next);
					else {
						setDraft(undefined);
						take(next);
					}
				}}
				onValueCommit={(next) => {
					setDraft(undefined);
					take(next);
				}}
			>
				<NumberInputGroup className="nd-slider__field">
					<NumberInputControl
						aria-label={`${label} value`}
						className="nd-slider__input text-mono-small"
					/>
					{unit ? (
						<span className="nd-slider__unit text-mono-small" aria-hidden="true">
							{unit}
						</span>
					) : null}
				</NumberInputGroup>
			</NumberInput>
		</Slider>
	);
}

/**
 * Mounts a slider into `container` (rendered synchronously, so it can be queried right away).
 * @param {HTMLElement} container
 * @param {{label: String, value: Number, min?: Number, max?: Number, step?: Number,
 *   largeStep?: Number, unit?: String, variant?: 'hero' | 'row', disabled?: Boolean,
 *   labelClassName?: String, onInput?: (value: Number) => void}} options
 */
export function mountSlider(container, options) {
	const { value, disabled = false, min = 0, max = 100, step = 1, ...rest } = options;
	const store = createStore({ value: snapToStep(value, { min, max, step }), disabled });
	container.classList.add('nd-slider-mount');
	const root = createRoot(container);
	flushSync(() => root.render(createElement(NdSlider, { store, min, max, step, ...rest })));
	let mounted = true;
	return {
		get value() {
			return store.get().value;
		},
		set(next) {
			if (mounted) flushSync(() => store.set({ value: snapToStep(next, { min, max, step }) }));
		},
		setDisabled(next) {
			if (mounted) flushSync(() => store.set({ disabled: Boolean(next) }));
		},
		focus() {
			/** @type {HTMLInputElement | null} */ (container.querySelector('input[type="range"]'))?.focus();
		},
		dispose() {
			if (!mounted) return;
			mounted = false;
			root.unmount();
		},
	};
}
