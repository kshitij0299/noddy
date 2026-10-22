// --------------------------------------------------------------
// Small ask or whole-set run? (M7 #28; PRODUCT.md "Runs")
// --------------------------------------------------------------
/*
	"Fix the g" is a small ask: no plan, no gate, only a receipt.
	"Clean simple sans, open curves" is whole-set work: a plan, the spec
	gate, the style gate on n o H O, then the queue.

	The rule is deliberately plain: a message that names one glyph is small;
	a message about the font, a style or the whole set is a run; anything
	else stays a small ask (the chat).
*/

const NAMED_GLYPH =
	/(?:^|\s)(?:the|letter|glyph|char(?:acter)?|lowercase|capital|uppercase|figure|digit)\s+['"‘“]?([A-Za-z0-9])['"’”]?(?=$|[\s.,!?;:])/i;
const QUOTED_GLYPH = /['"‘“]([A-Za-z0-9])['"’”]/;
const QUESTION =
	/\?\s*$|^(?:what|which|why|how|is|are|does|do|can|could|should|would|will|who|where|when)\b/i;
const ASKS_TO_DRAW = /\b(draw|make|create|design|build|generate)\b/i;
const WHOLE_SET =
	/\b(font|typeface|type ?face|alphabet|whole set|full set|all (?:the )?(?:letters|glyphs|characters)|every (?:letter|glyph)|sans|serif|slab|grotesk|grotesque|geometric|humanist|monospace|mono|didone|script|display|rounded|condensed|style|draw (?:it|them|the set))\b/i;

/**
 * @param {String} prompt
 * @returns {{kind: 'run' | 'small', char: String | null}}
 *   char: the glyph a small ask names ('g' in "fix the g"), if any
 */
export function classifyAsk(prompt = '') {
	const text = String(prompt).trim();
	const named = NAMED_GLYPH.exec(text) || QUOTED_GLYPH.exec(text);
	const char = named ? named[1] : null;
	if (char) return { kind: 'small', char };
	// A question about the font ("is the font ok?") wants an answer, not a plan.
	// "Can you draw a geometric sans?" is still a request to draw.
	if (QUESTION.test(text) && !ASKS_TO_DRAW.test(text)) return { kind: 'small', char: null };
	if (WHOLE_SET.test(text)) return { kind: 'run', char: null };
	return { kind: 'small', char: null };
}
