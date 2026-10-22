// Test helper: a fake relay transport that "draws" the glyph a run job asks
// for (create_glyph or begin_glyph → add_svg_path → submit_glyph → reply).
// No provider, no key, no network. Shared by the run tests.
import { vi } from 'vitest';

// SVG y-down about the ascender (800): a box from the baseline to 500.
export const FAKE_BOX = 'M100 300 L400 300 L400 800 L100 800 Z';

/**
 * @param {Object} [options]
 * @param {(glyphId: String) => Boolean} [options.fail] - glyphs to leave unsubmitted
 * @param {() => Promise<void>} [options.delay] - awaited before every step
 * @param {(glyphId: String) => Boolean} [options.exists] - whether the glyph exists
 */
export function fakeGlyphTransport({ fail = () => false, delay, exists = () => false } = {}) {
	return vi.fn(async (payload) => {
		if (delay) await delay();
		const first = payload.messages.find((m) => m.role === 'user');
		const text = first.content[0].text;
		const match = /\((glyph-0x[0-9A-F]+),/i.exec(text);
		const reply = (words) => ({
			text: words,
			messages: [{ role: 'assistant', content: words }],
			toolCalls: [],
			usage: { inputTokens: 500, outputTokens: 50 },
		});
		if (!match) return reply('Done.');
		const glyphId = match[1];
		const toolTurns = payload.messages.filter((m) => m.role === 'tool');
		const last = toolTurns.at(-1)?.content?.[0]?.output?.value;
		const revision = last?.context?.revision || payload.context.revision;
		const step = toolTurns.length;
		const call = (toolName, input) => ({
			text: '',
			messages: [
				{
					role: 'assistant',
					content: [{ type: 'tool-call', toolCallId: `${glyphId}-${step}`, toolName, input }],
				},
			],
			toolCalls: [{ toolCallId: `${glyphId}-${step}`, toolName, input }],
			usage: { inputTokens: 500, outputTokens: 50 },
		});
		if (fail(glyphId)) return reply('I could not draw it.');
		if (step === 0)
			return exists(glyphId)
				? call('begin_glyph', { glyphId, expectedRevision: revision })
				: call('create_glyph', {
						codePoint: parseInt(glyphId.slice(8), 16),
						expectedRevision: revision,
				  });
		const began = payload.messages.some(
			(m) => m.role === 'assistant' && m.content?.[0]?.toolName === 'begin_glyph'
		);
		if (step === 1 && began)
			// A redraw replaces every contour of the existing glyph.
			return call('replace_paths', {
				glyphId,
				expectedRevision: revision,
				pathIndices: null,
				paths: [
					{
						name: 'Box',
						points: [
							{ x: 100, y: 0, h1: null, h2: null },
							{ x: 100, y: 500, h1: null, h2: null },
							{ x: 400, y: 500, h1: null, h2: null },
							{ x: 400, y: 0, h1: null, h2: null },
						],
					},
				],
			});
		if (step === 1)
			return call('add_svg_path', {
				glyphId,
				expectedRevision: revision,
				d: FAKE_BOX,
				baselineY: null,
			});
		if (step === 2) return call('submit_glyph', { glyphId, expectedRevision: revision, note: null });
		return reply('Drew it.');
	});
}
