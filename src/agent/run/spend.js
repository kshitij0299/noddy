// --------------------------------------------------------------
// Spend estimate for the run's cap (M7 #28)
// --------------------------------------------------------------
/*
	The relay returns token usage per step; Noddy does not know each
	provider's prices. The estimate uses one conservative default rate
	(input and output per million tokens) and a flat amount per step when a
	provider reports no usage. It is shown as "up to $1.20" in the plan and
	pauses the run when it reaches the cap; it is an estimate, never a bill.
*/

export const DEFAULT_SPEND_CAP = 1.2;
export const DEFAULT_RATES = Object.freeze({ inputPerMillion: 2.5, outputPerMillion: 10 });
/** Used for a step whose provider reported no token counts. */
export const FLAT_STEP_COST = 0.004;

/**
 * Estimated cost in dollars of one or more relay steps.
 * @param {Array<{inputTokens?: Number|null, outputTokens?: Number|null}|null|undefined>} usages
 * @param {typeof DEFAULT_RATES} [rates]
 * @returns {Number}
 */
export function estimateCost(usages = [], rates = DEFAULT_RATES) {
	let total = 0;
	for (const usage of usages) {
		const input = Number(usage?.inputTokens);
		const output = Number(usage?.outputTokens);
		if (!Number.isFinite(input) && !Number.isFinite(output)) {
			total += FLAT_STEP_COST;
			continue;
		}
		total +=
			((Number.isFinite(input) ? input : 0) * rates.inputPerMillion +
				(Number.isFinite(output) ? output : 0) * rates.outputPerMillion) /
			1_000_000;
	}
	return total;
}

/**
 * '$1.20'
 * @param {Number} dollars
 * @returns {String}
 */
export function formatDollars(dollars) {
	return `$${(Math.max(0, dollars) || 0).toFixed(2)}`;
}
