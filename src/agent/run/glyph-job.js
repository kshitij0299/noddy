// --------------------------------------------------------------
// One run glyph = one agent job (M7 #28)
// --------------------------------------------------------------
/*
	Wires the run controller's `draft()` to the agent controller: a job-mode
	request whose session may write only this one glyph (jobScope), so the
	model cannot wander off to other glyphs, and whose events stay out of the
	chat thread. The glyph counts as drawn only when submit_glyph landed it.
*/
import { estimateCost } from './spend.js';

/** Tool calls one glyph job may use (create/begin, draw, look, check, submit). */
export const GLYPH_JOB_TOOL_LIMIT = 12;

/**
 * The job message for one glyph. The brief and the note are the user's words;
 * the context the relay sends with them stays data only.
 * @param {Object} job
 * @returns {String}
 */
export function glyphJobPrompt({ id, char, brief = '', spec = [], note = '', controls = [] }) {
	const code = id.replace(/^glyph-0x/i, '').toUpperCase().padStart(4, '0');
	const codePoint = parseInt(code, 16);
	const specLine = spec.map((s) => `${s.label} ${s.value}`).join(', ');
	const controlChars = controls
		.filter((controlId) => controlId !== id)
		.map((controlId) => String.fromCodePoint(parseInt(controlId.replace(/^glyph-0x/i, ''), 16)));
	return [
		`Run job: draw the glyph "${char}" (${id}, U+${code}) for this font, and nothing else.`,
		brief ? `Style brief from the user: ${brief}` : '',
		note ? `The user asked for this change to the style: ${note}` : '',
		specLine ? `Spec: ${specLine} (font units).` : '',
		controlChars.length
			? `Match the approved control glyphs ${controlChars.join(' ')}: look at them with render_glyphs first if they exist.`
			: '',
		`Start the job with create_glyph (codePoint ${codePoint}) when the glyph does not exist, otherwise begin_glyph (${id}).`,
		'Draw closed contours with add_svg_path or add_paths, check them with check_outlines, then submit_glyph with a short note.',
		'Keep the reply to one short sentence.',
	]
		.filter(Boolean)
		.join('\n');
}

/**
 * Builds the run controller's `draft()` on top of an agent controller.
 * @param {Object} controller - createAgentController()
 * @returns {(job: Object) => Promise<{ok: Boolean, cost: Number, error?: Object}>}
 */
export function createGlyphDrafter(controller) {
	return async function draft(job) {
		const summary = await controller.run(glyphJobPrompt(job), [], {
			job: true,
			scope: [job.id],
			maxTools: GLYPH_JOB_TOOL_LIMIT,
			signal: job.signal,
		});
		const ok = !!summary?.submitted?.includes(job.id);
		return {
			ok,
			cost: estimateCost(summary?.usage || []),
			...(ok
				? {}
				: {
						error: summary?.lastError || {
							code: 'NOT_SUBMITTED',
							message: 'The model did not finish the glyph',
						},
				  }),
		};
	};
}
