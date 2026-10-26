// --------------------------------------------------------------
// Remix mode: the card deck (PR D). Pure and seeded: the same seed, glyph, chaos, mark and
// history deal the same cards with the same moves.
// --------------------------------------------------------------
/*
	A card is a move with concrete, seeded settings and a ready call: `play` is an apply_chaos
	input (add expectedRevision) that runs the move through the chaos engine, so its result
	reproduces from the card's seed and passes the legibility guard. A strong agent may instead
	re-express the card's idea by hand with transform_paths / copy_paths / boolean_paths.

	- Tabu: no card repeats within the last 3 glyphs of the run (TABU_GLYPHS). If the deck runs
	  short, the oldest tabu cards come back first (`tabuRelaxed`).
	- Style DNA, lightly: with a reference mark (describe_mark), slashes, gashes and kicks start
	  from the mark's angle and width and mutate from there.
	- The chaos dial (0–1) scales every range and how many cards are dealt; Wild widens it more.
	- Telephone: `telephoneCards` hands the previous glyph's kept moves on, plus one mutation.
*/
import { hashString, rngFor } from '../chaos/rng.js';

export const TABU_GLYPHS = 3;
export const MAX_CARDS = 3;
const MAX_CARD_SEED = 2147483646;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const round = (value) => Math.round(value);
const sign = (rng) => (rng.chance(0.5) ? 1 : -1);

/** The mark's angle (or a default) mutated by chaos, kept inside the ops' −80…80. */
const markAngle = (rng, c, mark, fallback = 35) =>
	round(clamp((mark?.angle ?? fallback) + rng.signed() * (8 + 40 * c), -80, 80));
const markWidth = (rng, c, mark) =>
	round(clamp((mark ? (mark.widthEm || 0.07) * 100 : 7) * (1 + rng.signed() * 0.5 * c), 2, 20));
const cutAngle = (rng, c) => round(rng.signed() * (10 + 50 * c));
const strength = (rng, c) => sign(rng) * round(35 + 65 * c * (0.6 + rng.next() * 0.4));

/**
 * The deck: id, what it does in words, the engine op it plays, and its seeded settings.
 * `params(rng, chaos 0–1, mark)` → apply_chaos params.
 */
export const DECK = Object.freeze([
	{
		id: 'SLASH',
		title: 'Slash',
		idea: 'one sharp slash through the ink, solid outside it',
		op: 'slash-cut',
		params: (rng, c, mark) => ({
			count: 1,
			angle: markAngle(rng, c, mark),
			width: markWidth(rng, c, mark),
			overshoot: round(clamp(10 + 50 * c * rng.next(), 0, 80)),
		}),
	},
	{
		id: 'DOUBLE-SLASH',
		title: 'Double slash',
		idea: 'two slashes, one through a stem',
		op: 'slash-cut',
		params: (rng, c, mark) => ({
			count: 2,
			angle: markAngle(rng, c, mark),
			width: round(clamp(markWidth(rng, c, mark) * 0.7, 2, 20)),
			overshoot: round(clamp(5 + 40 * c * rng.next(), 0, 80)),
		}),
	},
	{
		id: 'GASH',
		title: 'Gash the counter',
		idea: "a slash through the counter (O's hole, B's bowl), not the middle",
		op: 'gash',
		params: (rng, c, mark) => ({
			angle: markAngle(rng, c, mark, -35),
			width: markWidth(rng, c, mark),
			overshoot: round(clamp(10 + 40 * c * rng.next(), 0, 80)),
		}),
	},
	{
		id: 'KICK',
		title: 'Kick a terminal',
		idea: "a sharp spike off the end of a stroke (L's foot, a corner)",
		op: 'kick',
		params: (rng, c, mark) => ({
			angle: round(rng.signed() * 25 * c),
			width: markWidth(rng, c, mark),
			strength: round(40 + 60 * c * rng.next()),
		}),
	},
	{
		id: 'ROTATE-PIECE',
		title: 'Rotate a piece',
		idea: 'cut the letter in two and lean one piece over',
		op: 'piece-rotate',
		params: (rng, c) => ({ angle: cutAngle(rng, c), strength: strength(rng, c) }),
	},
	{
		id: 'SHIFT-STROKE',
		title: 'Shift a stroke',
		idea: 'cut the letter in two and slide one piece along the cut',
		op: 'piece-shift',
		params: (rng, c) => ({ angle: cutAngle(rng, c), strength: strength(rng, c) }),
	},
	{
		id: 'SCALE-PART',
		title: 'Scale a part',
		idea: 'grow or shrink the top or bottom of the letter',
		op: 'piece-scale',
		params: (rng, c) => ({ angle: cutAngle(rng, c), strength: strength(rng, c) }),
	},
	{
		id: 'MIRROR-PART',
		title: 'Mirror a part',
		idea: 'flip one piece of the letter left to right',
		op: 'piece-mirror',
		params: (rng, c) => ({ angle: cutAngle(rng, c) }),
	},
	{
		id: 'GLITCH-BAND',
		title: 'Glitch band',
		idea: 'knock a few horizontal slices sideways',
		op: 'glitch-bands',
		params: (rng, c) => ({ bands: rng.int(3, 7), shift: round(3 + 12 * c * (0.5 + rng.next())) }),
	},
	{
		id: 'WAVE',
		title: 'Wave',
		idea: 'let the letter ripple',
		op: 'warp',
		params: (rng, c) => ({ warp: 'wave', strength: sign(rng) * round(15 + 40 * c) }),
	},
	{
		id: 'TWIST',
		title: 'Twist',
		idea: 'wring the letter around its middle',
		op: 'warp',
		params: (rng, c) => ({ warp: 'twist', strength: sign(rng) * round(15 + 40 * c) }),
	},
	{
		id: 'BULGE',
		title: 'Bulge or arc',
		idea: 'swell the middle or bend the letter on an arc',
		op: 'warp',
		params: (rng, c) => ({
			warp: rng.chance(0.5) ? 'bulge' : 'arc',
			strength: sign(rng) * round(15 + 40 * c),
		}),
	},
]);

export const CARD_IDS = Object.freeze(DECK.map((card) => card.id));
const byId = (id) => DECK.find((card) => card.id === id);

/** The chaos the cards use, 0–1: Wild widens Remix's ranges. */
export function cardChaos(chaos, mode) {
	const c = clamp((Number.isFinite(chaos) ? chaos : 50) / 100, 0, 1);
	return mode === 'wild' ? clamp(c * 1.3 + 0.15, 0, 1) : c;
}

/** How many cards: 2, or 3 from chaos 67 up (and in Wild). */
export function cardCount(count, chaos, mode) {
	if (Number.isInteger(count)) return clamp(count, 1, MAX_CARDS);
	return mode === 'wild' || chaos >= 67 ? 3 : 2;
}

/** A card's own seed, from the take's seed. */
export function cardSeed(seed, glyphId, cardId) {
	return (hashString(`${seed >>> 0}|${glyphId}|${cardId}`) % MAX_CARD_SEED) + 1;
}

/**
 * One card dealt by id (as drawCards would deal it), for tests and the docs.
 * @param {String} id
 * @param {{seed: Number, glyphId: String, chaos?: Number, mode?: String, mark?: Object}} options
 */
export function dealCard(id, { seed, glyphId, chaos = 50, mode = 'remix', mark } = {}) {
	const card = byId(id);
	return card ? dealt(card, { seed, glyphId, c: cardChaos(chaos, mode), chaos, mark }) : null;
}

/** A dealt card: settings and the apply_chaos call that plays it. */
function dealt(card, { seed, glyphId, c, chaos, mark, params }) {
	const rng = rngFor(seed, glyphId, `card:${card.id}`);
	const settings = params ?? card.params(rng, c, mark);
	return {
		id: card.id,
		title: card.title,
		idea: card.idea,
		op: card.op,
		params: settings,
		seed: cardSeed(seed, glyphId, card.id),
		play: {
			tool: 'apply_chaos',
			input: {
				glyphIds: [glyphId],
				op: card.op,
				seed: cardSeed(seed, glyphId, card.id),
				chaos,
				params: settings,
			},
		},
	};
}

/**
 * Deals `count` cards for one glyph.
 * @param {Object} options
 * @param {Number} options.seed
 * @param {String} options.glyphId
 * @param {Number} [options.count]
 * @param {Number} [options.chaos] - the panel's 0–100
 * @param {String} [options.mode] - 'remix' | 'wild'
 * @param {Array<Array<String>>} [options.tabu] - card ids dealt to the previous glyphs, oldest first
 * @param {Object} [options.mark] - describe_mark of the reference
 */
export function drawCards({ seed, glyphId, count, chaos = 50, mode = 'remix', tabu = [], mark }) {
	const c = cardChaos(chaos, mode);
	const n = cardCount(count, chaos, mode);
	const banned = new Set(tabu.flat());
	const rng = rngFor(seed, glyphId, 'deck');
	const shuffle = (list) => {
		const out = [...list];
		for (let i = out.length - 1; i > 0; i--) {
			const j = Math.floor(rng.next() * (i + 1));
			[out[i], out[j]] = [out[j], out[i]];
		}
		return out;
	};
	let pool = shuffle(DECK.filter((card) => !banned.has(card.id)));
	let relaxed = false;
	// Short deck: the oldest glyph's cards come back first.
	for (const older of tabu) {
		if (pool.length >= n) break;
		const back = older.filter((id) => !pool.some((card) => card.id === id)).map(byId);
		pool = [...pool, ...shuffle(back.filter(Boolean))];
		relaxed = true;
	}
	const cards = pool.slice(0, n).map((card) => dealt(card, { seed, glyphId, c, chaos, mark }));
	return { cards, tabu: [...banned], tabuRelaxed: relaxed };
}

/**
 * Telephone: the previous glyph's kept moves, re-dealt for this glyph, plus one mutation:
 * tweak one setting, swap one card for a fresh one (not tabu, not already in hand), or add one.
 * @param {Object} options - as drawCards, plus
 * @param {Array<{id: String, params: Object}>} options.previous - kept cards of the previous glyph
 * @param {String} options.from - the previous glyph's ID
 */
export function telephoneCards({
	seed,
	glyphId,
	chaos = 50,
	mode = 'remix',
	tabu = [],
	mark,
	previous = [],
	from,
}) {
	const c = cardChaos(chaos, mode);
	const rng = rngFor(seed, glyphId, 'telephone');
	const hand = previous
		.filter((card) => byId(card.id))
		.slice(0, MAX_CARDS)
		.map((card) => ({ card: byId(card.id), params: { ...card.params } }));
	const banned = new Set([...tabu.flat(), ...hand.map((entry) => entry.card.id)]);
	const fresh = DECK.filter((card) => !banned.has(card.id));
	const kinds = [];
	if (hand.some((entry) => numericKeys(entry.params).length)) kinds.push('tweak');
	if (hand.length && fresh.length) kinds.push('swap');
	if (hand.length < MAX_CARDS && fresh.length) kinds.push('add');
	const kind = kinds.length ? rng.pick(kinds) : 'add';
	let mutation;
	if (kind === 'tweak') {
		const entries = hand.filter((entry) => numericKeys(entry.params).length);
		const entry = rng.pick(entries);
		const key = rng.pick(numericKeys(entry.params));
		const before = entry.params[key];
		const [min, max] = RANGES[key] || [-100, 100];
		const delta = sign(rng) * (max - min) * (0.12 + 0.28 * c) * (0.6 + rng.next() * 0.4);
		const after = clamp(round(before + delta), min, max);
		entry.params[key] = after === before ? clamp(before + (delta > 0 ? 1 : -1), min, max) : after;
		mutation = { kind, card: entry.card.id, key, from: before, to: entry.params[key] };
	} else {
		const pool = fresh.length ? fresh : DECK;
		const card = pool[Math.floor(rng.next() * pool.length)];
		const entry = { card, params: null };
		if (kind === 'swap') {
			const at = Math.floor(rng.next() * hand.length);
			mutation = { kind, card: card.id, replaced: hand[at].card.id };
			hand[at] = entry;
		} else {
			hand.push(entry);
			mutation = { kind: 'add', card: card.id };
		}
	}
	const cards = hand.map((entry) =>
		dealt(entry.card, { seed, glyphId, c, chaos, mark, params: entry.params ?? undefined })
	);
	return { cards, tabu: [...new Set(tabu.flat())], tabuRelaxed: false, telephone: { from, mutation } };
}

// Ranges of the numeric settings cards use (the ops clamp too).
const RANGES = {
	angle: [-80, 80],
	width: [2, 20],
	overshoot: [0, 80],
	strength: [-100, 100],
	shift: [1, 30],
	bands: [2, 12],
	count: [1, 4],
};

function numericKeys(params) {
	return Object.keys(params || {}).filter(
		(key) => typeof params[key] === 'number' && key !== 'count'
	);
}

/** A mutation in words, for the result and the thread. */
export function describeMutation(mutation) {
	if (!mutation) return '';
	if (mutation.kind === 'tweak')
		return `${mutation.card}: ${mutation.key} ${mutation.from} → ${mutation.to}`;
	if (mutation.kind === 'swap') return `${mutation.replaced} swapped for ${mutation.card}`;
	return `added ${mutation.card}`;
}
