/**
 * Step maths shared by the Noddy slider (nd-slider.jsx) and the styled native ranges (#134).
 * Plain JS so a vanilla control can use it without pulling in React.
 */

const decimalsOf = (step) => (String(step).split('.')[1] || '').length;

/**
 * Clamps to [min, max] and snaps to the step counted from min (no float drift). A value that is
 * not a number falls back to min.
 */
export function snapToStep(value, { min, max, step }) {
	const number = Number(value);
	const clamped = Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : min;
	const steps = Math.round((clamped - min) / step);
	return Math.min(max, Number((min + steps * step).toFixed(decimalsOf(step))));
}

/** The Shift+arrow and Page Up/Down jump: about a tenth of the range, a whole number of steps. */
export function largeStepFor({ min, max, step }) {
	const steps = Math.max(1, Math.round((max - min) / 10 / step));
	return Number((steps * step).toFixed(decimalsOf(step)));
}

/** How many characters the longest value in the range takes (for sizing the value field). */
export function valueChars({ min, max, step }) {
	const decimals = decimalsOf(step);
	return Math.max(min.toFixed(decimals).length, max.toFixed(decimals).length);
}

/** True when `text` is a whole plain number: digits, an optional minus and decimal point. */
export function isPlainNumber(text) {
	return /^-?(\d+\.?\d*|\.\d+)$/.test(String(text).trim());
}
