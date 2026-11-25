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
import { createElement, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { NumberInput, NumberInputControl, NumberInputGroup } from '@ui-sdk/react/number-input';
import {
	Slider,
	SliderControl,
	SliderIndicator,
	SliderThumb,
	SliderTrack,
} from '@ui-sdk/react/slider';
import { isPlainNumber, largeStepFor, snapToStep, valueChars } from './steps.js';

export { largeStepFor, snapToStep } from './steps.js';

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

// Characters a number field may take in. ui-sdk refuses a minus sign when min >= 0 and any
// "e"; letting them in means "-20" can clamp to 0 and "1e3" can go back, instead of turning
// into 20 or 13 as you type.
const NUMBERISH = /^[\d.+\-eE]+$/;

// React tracks an input's value setter, so set it the way a browser does.
const setNativeValue = (input, text) =>
	Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, text);

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
	// What is typed in the field until Enter or blur ends the edit (undefined when not typing).
	const [draft, setDraft] = useState(undefined);
	const group = useRef(/** @type {HTMLElement | null} */ (null));
	const bounds = { min, max, step };
	// About a tenth of the range (10 on Chaos), the same on the thumb and in the field.
	const jump = largeStep ?? largeStepFor(bounds);

	useEffect(() => {
		const node = group.current;
		if (!node) return undefined;
		const letThrough = (event) => {
			if (event.inputType?.startsWith('insert') && NUMBERISH.test(event.data ?? ''))
				event.stopPropagation();
		};
		node.addEventListener('beforeinput', letThrough, true);
		return () => node.removeEventListener('beforeinput', letThrough, true);
	}, []);

	function take(next) {
		if (next === null || next === undefined || Number.isNaN(Number(next))) return;
		const snapped = snapToStep(next, bounds);
		if (snapped === store.get().value) return;
		store.set({ value: snapped });
		onInput?.(snapped);
	}

	/** Puts the current value back in the field (through ui-sdk). True when the text changed. */
	function putBack(input) {
		const text = String(store.get().value);
		if (input.value === text) return false;
		setNativeValue(input, text);
		input.dispatchEvent(new Event('input', { bubbles: true }));
		return true;
	}

	/** Before ui-sdk commits: text that is not a plain number goes back to the current value. */
	function dropJunk(input) {
		if (input.value.trim() !== '' && !isPlainNumber(input.value)) putBack(input);
	}

	return (
		<Slider
			value={value}
			min={min}
			max={max}
			step={step}
			largeStep={jump}
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
				largeStep={jump}
				// Alt+arrow moves one step (ui-sdk's tenth of a step would snap straight back).
				smallStep={step}
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
				<NumberInputGroup
					ref={group}
					className="nd-slider__field"
					// These run after ui-sdk's own Enter and blur handling. ui-sdk reports nothing
					// when the edit ends on the value it started from, so the draft ends here too.
					onKeyDown={(event) => {
						if (event.key === 'Enter') setDraft(undefined);
					}}
					onBlur={() => setDraft(undefined)}
				>
					<NumberInputControl
						aria-label={`${label} value`}
						className="nd-slider__input text-mono-small"
						style={{ '--nd-slider-value-chars': valueChars(bounds) }}
						// These run before ui-sdk's.
						onKeyDown={(event) => {
							const input = /** @type {HTMLInputElement} */ (event.currentTarget);
							if (event.key === 'Enter') dropJunk(input);
							else if (
								event.key === 'Escape' &&
								!event.ctrlKey &&
								!event.metaKey &&
								!event.altKey
							) {
								// Esc throws the typed text away. It only goes on to the panel (which
								// minimizes) when there was nothing to throw away.
								const discarded = putBack(input) || draft !== undefined;
								setDraft(undefined);
								if (discarded) {
									event.preventDefault();
									event.stopPropagation();
								}
							}
						}}
						onBlur={(event) => dropJunk(/** @type {HTMLInputElement} */ (event.currentTarget))}
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
 * `largeStep` (Shift+arrow, Page Up/Down) defaults to about a tenth of the range.
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
			/** @type {HTMLInputElement | null} */ (
				container.querySelector('input[type="range"]')
			)?.focus();
		},
		dispose() {
			if (!mounted) return;
			mounted = false;
			root.unmount();
		},
	};
}
