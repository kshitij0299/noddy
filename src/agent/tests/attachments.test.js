import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
	attachmentParts,
	prepareAttachment,
	summarizeFont,
	validateAttachmentSet,
} from '../attachments.js';

function sfnt() {
	const buffer = new ArrayBuffer(128);
	const view = new DataView(buffer);
	view.setUint32(0, 0x00010000);
	view.setUint16(4, 2);
	for (const [record, tag, offset, length] of [
		[12, 'head', 44, 54],
		[28, 'maxp', 98, 6],
	]) {
		for (let i = 0; i < 4; i++) view.setUint8(record + i, tag.charCodeAt(i));
		view.setUint32(record + 8, offset);
		view.setUint32(record + 12, length);
	}
	view.setUint16(44 + 18, 1000);
	view.setUint16(98 + 4, 12);
	return buffer;
}

const png = (width = 2, height = 2) => {
	const bytes = new Uint8Array(24);
	bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
	bytes.set([73, 72, 68, 82], 12);
	const view = new DataView(bytes.buffer);
	view.setUint32(16, width);
	view.setUint32(20, height);
	return bytes;
};

describe('local font and image attachments', () => {
	it('extracts bounded native font metadata from a real TTF without importing it', () => {
		const source = readFileSync('test/sample fonts/consola-test.ttf');
		const summary = summarizeFont(
			source.buffer.slice(source.byteOffset, source.byteOffset + source.byteLength)
		);
		expect(summary.format).toBe('TTF');
		expect(summary.glyphCount).toBeGreaterThan(0);
		expect(summary.unitsPerEm).toBeGreaterThan(0);
		expect(JSON.stringify(summary).length).toBeLessThan(1000);
	});

	it('rejects truncated directories, out-of-range tables, collections and invalid units', () => {
		expect(() => summarizeFont(new ArrayBuffer(5))).toThrow('incomplete');
		const invalid = sfnt();
		new DataView(invalid).setUint32(20, 0xfffffff0);
		expect(() => summarizeFont(invalid)).toThrow('bounds');
		const collection = sfnt();
		new DataView(collection).setUint32(0, 0x74746366);
		expect(() => summarizeFont(collection)).toThrow('Collections');
		const units = sfnt();
		new DataView(units).setUint16(62, 0);
		expect(() => summarizeFont(units)).toThrow('units');
	});

	it('checks content and MIME rather than trusting a picture filename', async () => {
		await expect(
			prepareAttachment(new File(['not a picture'], 'fake.png', { type: 'image/png' }))
		).rejects.toThrow('matching contents');
		await expect(
			prepareAttachment(new File([png()], 'fake.jpg', { type: 'image/jpeg' }))
		).rejects.toThrow('matching contents');
		const attachment = await prepareAttachment(
			new File([png()], 'image.png', { type: 'image/png' })
		);
		expect(attachment.kind).toBe('image');
		expect(attachment.dataURL).toMatch(/^data:image\/png;base64,/);
	});

	it('rejects image decode bombs before rendering or transmitting', async () => {
		await expect(
			prepareAttachment(new File([png(16000, 16000)], 'huge.png', { type: 'image/png' }))
		).rejects.toThrow('40 megapixels');
	});

	it('accepts fonts locally and serializes only the bounded summary', async () => {
		const attachment = await prepareAttachment(
			new File([sfnt()], 'my-font.ttf', { type: 'font/ttf' })
		);
		expect(attachment.summary.glyphCount).toBe(12);
		expect(attachment.file).toBeInstanceOf(File);
		expect(attachmentParts([attachment])[0].type).toBe('text');
		expect(attachmentParts([attachment])[0].text).toContain('reference only, not imported');
	});

	it('limits count and combined image bytes including previous chat references', () => {
		expect(() => validateAttachmentSet(Array(5).fill({ kind: 'font' }))).toThrow('4 files');
		expect(() =>
			validateAttachmentSet(Array(2).fill({ kind: 'image', size: 3 * 1024 * 1024 }))
		).toThrow('combined image');
	});
});
