// --------------------------------------------------------------
// Chaos tools: seeded randomness (PR C)
// --------------------------------------------------------------
/*
	Every op draws from rng = mulberry32(hash(seed, glyph, op)), so a result reproduces from
	its seed and one glyph can be re-rolled without touching the others.
*/

/** 32-bit FNV-1a of a string. */
export function hashString(text) {
	let hash = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		hash ^= text.charCodeAt(index);
		hash = Math.imul(hash, 0x01000193);
	}
	return hash >>> 0;
}

/** mulberry32: a small, fast, well-mixed 32-bit generator. Returns () => [0, 1). */
export function mulberry32(seed) {
	let state = seed >>> 0;
	return function next() {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * The generator for one (seed, glyph, op), with a few helpers.
 * @param {Number} seed
 * @param {String} glyphId
 * @param {String} opId
 */
export function rngFor(seed, glyphId, opId) {
	const next = mulberry32(hashString(`${seed >>> 0}|${glyphId}|${opId}`));
	return {
		next,
		/** [min, max) */
		range: (min, max) => min + (max - min) * next(),
		/** [-1, 1) */
		signed: () => next() * 2 - 1,
		/** An integer in [min, max]. */
		int: (min, max) => Math.floor(min + (max - min + 1) * next()),
		pick: (list) => list[Math.floor(next() * list.length)],
		chance: (p) => next() < p,
	};
}

export const MAX_SEED = 2147483647;

/** A fresh seed for the dice button. */
export function randomSeed(random = Math.random) {
	return Math.floor(random() * 999999) + 1;
}
