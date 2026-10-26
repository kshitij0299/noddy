// PR D: Remix mode's pure parts. The card deck (determinism, tabu, chaos, Style DNA),
// Telephone's one mutation, novelty pressure (change masks) and describe_mark.
import { describe, expect, it } from 'vitest';
import { contourArea, reverseContour } from '../../chaos/geometry.js';
import { CURVY_O, METRICS, SANS_H } from '../../chaos/tests/fixtures.js';
import { CHAOS_OP_NAMES } from '../../tool-definitions.js';
import { CARD_IDS, DECK, cardCount, dealCard, drawCards, telephoneCards } from '../deck.js';
import { describeMark } from '../describe-mark.js';
import {
	previousTake,
	recordDraw,
	recordTake,
	remixRun,
	tabuFor,
} from '../remix-run.js';
import { NOVELTY_LIMIT, changeMask, closestSibling, maskSimilarity } from '../similarity.js';

const B = 'glyph-0x42';
const C = 'glyph-0x43';

/** A straight bar through (cx, cy) at `angle` degrees; clockwise unless `cut`. */
function bar(cx, cy, angle, length, width, { cut = false } = {}) {
	const a = (angle * Math.PI) / 180;
	const ux = Math.cos(a);
	const uy = Math.sin(a);
	const p = (along, across) => ({
		x: cx + ux * along - uy * across,
		y: cy + uy * along + ux * across,
		h1: null,
		h2: null,
	});
	let contour = {
		points: [p(-length / 2, -width / 2), p(length / 2, -width / 2), p(length / 2, width / 2), p(-length / 2, width / 2)],
	};
	const clockwise = contourArea(contour) < 0;
	if (clockwise === cut) contour = reverseContour(contour);
	return contour;
}

describe('card deck', () => {
	it('plays only real chaos ops, with unique ids', () => {
		expect(new Set(CARD_IDS).size).toBe(DECK.length);
		for (const card of DECK) expect(CHAOS_OP_NAMES).toContain(card.op);
	});

	it('deals the same cards and moves for the same seed, other cards for another seed', () => {
		const a = drawCards({ seed: 7, glyphId: B, count: 3 });
		const b = drawCards({ seed: 7, glyphId: B, count: 3 });
		expect(b).toEqual(a);
		expect(a.cards).toHaveLength(3);
		const others = [8, 9, 10, 11].map((seed) => drawCards({ seed, glyphId: B, count: 3 }));
		expect(others.some((other) => JSON.stringify(other.cards) !== JSON.stringify(a.cards))).toBe(
			true
		);
		// Each card carries a ready apply_chaos call for this glyph.
		for (const card of a.cards) {
			expect(card.play.tool).toBe('apply_chaos');
			expect(card.play.input).toMatchObject({ glyphIds: [B], op: card.op, seed: card.seed });
		}
	});

	it('never deals a card the previous 3 glyphs had (tabu)', () => {
		const run = remixRun({});
		const order = ['glyph-0x41', B, C, 'glyph-0x44', 'glyph-0x45', 'glyph-0x46', 'glyph-0x47'];
		for (const [index, id] of order.entries()) {
			const tabu = tabuFor(run, id);
			const { cards } = drawCards({ seed: 100 + index, glyphId: id, count: 3, tabu });
			const banned = new Set(tabu.flat());
			for (const card of cards) expect(banned.has(card.id)).toBe(false);
			recordDraw(run, id, { seed: 100 + index, cards });
		}
		// The window is 3 glyphs: the fifth glyph's tabu lists glyphs 2–4 only.
		const fifth = tabuFor(run, order[4]);
		expect(fifth).toHaveLength(3);
		expect(fifth[0]).toEqual(run.draws.get(order[1]).cards.map((c) => c.id));
	});

	it('scales with the chaos dial: more cards and wider settings', () => {
		expect(cardCount(null, 20, 'remix')).toBe(2);
		expect(cardCount(null, 80, 'remix')).toBe(3);
		expect(cardCount(null, 10, 'wild')).toBe(3);
		const spread = (chaos) =>
			Math.max(
				...[1, 2, 3, 4, 5, 6, 7, 8].map((seed) =>
					Math.abs(dealCard('ROTATE-PIECE', { seed, glyphId: B, chaos }).params.strength)
				)
			);
		expect(spread(90)).toBeGreaterThan(spread(10));
	});

	it('starts slashes from the reference mark (Style DNA)', () => {
		const mark = { angle: -60, widthEm: 0.12 };
		const slash = dealCard('SLASH', { seed: 3, glyphId: B, chaos: 10, mark });
		expect(Math.abs(slash.params.angle - -60)).toBeLessThanOrEqual(15);
		expect(slash.params.width).toBeGreaterThanOrEqual(10);
	});
});

describe('Telephone', () => {
	const previous = [
		{ id: 'SLASH', params: { count: 1, angle: 40, width: 7, overshoot: 20 } },
		{ id: 'KICK', params: { angle: 0, width: 8, strength: 60 } },
	];

	it('hands the kept moves on with exactly one mutation, reproducibly', () => {
		const a = telephoneCards({ seed: 5, glyphId: C, previous, from: B });
		expect(telephoneCards({ seed: 5, glyphId: C, previous, from: B })).toEqual(a);
		expect(a.telephone.from).toBe(B);
		const { mutation } = a.telephone;
		const ids = a.cards.map((card) => card.id);
		if (mutation.kind === 'tweak') {
			expect(ids).toEqual(['SLASH', 'KICK']);
			const card = a.cards.find((c) => c.id === mutation.card);
			expect(card.params[mutation.key]).toBe(mutation.to);
			expect(mutation.to).not.toBe(mutation.from);
		} else if (mutation.kind === 'swap') {
			expect(ids).toContain(mutation.card);
			expect(ids).not.toContain(mutation.replaced);
		} else expect(ids).toEqual(['SLASH', 'KICK', mutation.card]);
		// Over a few seeds every kind of mutation shows up.
		const kinds = new Set(
			[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(
				(seed) => telephoneCards({ seed, glyphId: C, previous, from: B }).telephone.mutation.kind
			)
		);
		expect([...kinds].sort()).toEqual(['add', 'swap', 'tweak']);
	});

	it('takes the closest earlier glyph with a landed take', () => {
		const run = remixRun({});
		recordDraw(run, B, { seed: 1, cards: [] });
		recordTake(run, B, { seed: 1, kept: previous });
		recordDraw(run, C, { seed: 2, cards: [] });
		expect(previousTake(run, C)).toMatchObject({ glyphId: B, seed: 1 });
		expect(previousTake(run, B)).toBe(null);
	});
});

describe('novelty pressure (change masks)', () => {
	// The graffiti slash: drawn against the letter, it cuts the ink and stays solid outside.
	const slashOn = (letter, angle, at = { x: 300, y: 350 }) => [
		...letter,
		bar(at.x, at.y, angle, 700, 60, { cut: true }),
	];

	it('finds the same mark pasted on two letters, and lets a different move through', () => {
		const onH = changeMask(SANS_H, slashOn(SANS_H, 40));
		const onO = changeMask(CURVY_O, slashOn(CURVY_O, 40));
		const crossed = changeMask(CURVY_O, slashOn(CURVY_O, -45));
		const kick = changeMask(CURVY_O, [...CURVY_O, bar(520, 20, -30, 220, 50)]);
		// A cut changes the same footprint on any letter: pasting it is caught.
		expect(maskSimilarity(onH, onO)).toBeGreaterThanOrEqual(NOVELTY_LIMIT);
		expect(maskSimilarity(onO, crossed)).toBeLessThan(NOVELTY_LIMIT);
		expect(maskSimilarity(onO, kick)).toBeLessThan(NOVELTY_LIMIT);
		expect(closestSibling(onO, [{ glyphId: 'H', mask: onH }, { glyphId: 'K', mask: kick }])).toMatchObject(
			{ glyphId: 'H' }
		);
	});

	it('is symmetric and treats two no-change takes as alike', () => {
		const a = changeMask(SANS_H, slashOn(SANS_H, 30));
		const b = changeMask(CURVY_O, slashOn(CURVY_O, 10));
		expect(maskSimilarity(a, b)).toBeCloseTo(maskSimilarity(b, a), 6);
		const none = changeMask(SANS_H, SANS_H);
		expect(none.count).toBe(0);
		expect(maskSimilarity(none, changeMask(CURVY_O, CURVY_O))).toBe(1);
		expect(maskSimilarity(none, a)).toBe(0);
	});
});

describe('describe_mark', () => {
	it('measures a cutting slash across an O: angle, size, crossings, overshoot', () => {
		const slash = bar(300, 350, 45, 1000, 60, { cut: true });
		const m = describeMark([slash], CURVY_O, METRICS);
		expect(Math.abs(m.angle - 45)).toBeLessThanOrEqual(3);
		expect(m.lengthEm).toBeGreaterThan(0.9);
		expect(m.lengthEm).toBeLessThan(1.1);
		expect(m.widthEm).toBeGreaterThan(0.04);
		expect(m.widthEm).toBeLessThan(0.1);
		expect(m.crossings.map((run) => run.over)).toEqual([
			'outside',
			'ink',
			'counter',
			'ink',
			'outside',
		]);
		expect(m.strokesCrossed).toBe(2);
		expect(m.countersCrossed).toBe(1);
		expect(m.overshoot.startEm).toBeGreaterThan(0);
		expect(m.overshoot.endEm).toBeGreaterThan(0);
		expect(m.combines).toBe('cut');
		expect(m.letter.x).toBeCloseTo(0.5, 1);
		expect(m.summary).toMatch(/45°.*2 strokes and 1 counter.*cuts through the ink/);
	});

	it('tells a solid mark from a cut, and a mark that stays clear of the letter', () => {
		expect(describeMark([bar(300, 350, -20, 800, 60)], CURVY_O, METRICS).combines).toBe('solid');
		const apart = describeMark([bar(1200, 350, 0, 200, 40)], CURVY_O, METRICS);
		expect(apart.combines).toBe('apart');
		expect(apart.strokesCrossed).toBe(0);
		expect(Math.abs(apart.angle)).toBeLessThanOrEqual(2);
	});
});
