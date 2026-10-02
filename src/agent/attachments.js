// Attachments stay local until Send. Font binaries never leave this module's caller.
export const ATTACHMENT_ACCEPT = 'image/png,image/jpeg,image/webp,.otf,.ttf';
export const ATTACHMENT_LIMITS = Object.freeze({
	count: 4,
	imageBytes: 4 * 1024 * 1024,
	fontBytes: 10 * 1024 * 1024,
	imageTotalBytes: 4 * 1024 * 1024,
	pixels: 40_000_000,
});

const readFile = (file, mode) =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.onerror = () => reject(new Error('This file could not be read. Please try it again.'));
		reader[mode](file);
	});

const ascii = (bytes, start, length) =>
	String.fromCharCode(...bytes.subarray(start, start + length));

function imageSize(bytes, type) {
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (type === 'image/png' && bytes.length >= 24) {
		return [view.getUint32(16), view.getUint32(20)];
	}
	if (type === 'image/webp' && bytes.length >= 30) {
		const format = ascii(bytes, 12, 4);
		if (format === 'VP8X') {
			return [
				1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16),
				1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16),
			];
		}
		if (format === 'VP8L' && bytes[20] === 0x2f) {
			const bits = view.getUint32(21, true);
			return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
		}
		if (format === 'VP8 ' && ascii(bytes, 23, 3) === '\u009d\u0001\u002a') {
			return [view.getUint16(26, true) & 0x3fff, view.getUint16(28, true) & 0x3fff];
		}
	}
	if (type === 'image/jpeg') {
		let offset = 2;
		while (offset + 4 <= bytes.length) {
			if (bytes[offset++] !== 0xff) break;
			while (bytes[offset] === 0xff) offset++;
			const marker = bytes[offset++];
			if (marker === 0xd9 || marker === 0xda) break;
			if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
			if (offset + 2 > bytes.length) break;
			const length = view.getUint16(offset);
			if (length < 2 || offset + length > bytes.length) break;
			if (
				[0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
					marker
				)
			) {
				if (length < 7) break;
				return [view.getUint16(offset + 5), view.getUint16(offset + 3)];
			}
			offset += length;
		}
	}
	throw new Error('The image header is incomplete or unsupported. Use a PNG, JPEG, or WebP image.');
}

/** Read only bounded SFNT metadata, without importing or changing the open font. */
export function summarizeFont(buffer) {
	const bytes = new Uint8Array(buffer);
	const view = new DataView(buffer);
	if (bytes.length < 12) throw new Error('This font file is incomplete.');
	const signature = ascii(bytes, 0, 4);
	if (signature !== 'OTTO' && view.getUint32(0) !== 0x00010000) {
		throw new Error(
			'Attach an individual OTF or TTF font. Collections and web fonts are not supported.'
		);
	}
	const count = view.getUint16(4);
	if (!count || count > 256 || 12 + count * 16 > bytes.length) {
		throw new Error('This font has an invalid table directory.');
	}
	const tables = new Map();
	for (let i = 0; i < count; i++) {
		const record = 12 + i * 16;
		const tag = ascii(bytes, record, 4);
		const offset = view.getUint32(record + 8);
		const length = view.getUint32(record + 12);
		if (offset > bytes.length || length > bytes.length - offset) {
			throw new Error('This font has a table outside the file bounds.');
		}
		tables.set(tag, { offset, length });
	}
	const head = tables.get('head');
	const maxp = tables.get('maxp');
	if (!head || head.length < 54 || !maxp || maxp.length < 6) {
		throw new Error('This font is missing required metrics tables.');
	}
	const unitsPerEm = view.getUint16(head.offset + 18);
	if (unitsPerEm < 16 || unitsPerEm > 16384) throw new Error('This font has invalid units per em.');
	const result = {
		format: signature === 'OTTO' ? 'OTF' : 'TTF',
		unitsPerEm,
		glyphCount: view.getUint16(maxp.offset + 4),
		names: {},
	};
	const name = tables.get('name');
	if (name && name.length >= 6) {
		const records = view.getUint16(name.offset + 2);
		const strings = view.getUint16(name.offset + 4);
		if (records > 4096 || 6 + records * 12 > name.length || strings > name.length) {
			throw new Error('This font has invalid name records.');
		}
		const fields = { 1: 'family', 2: 'style', 4: 'fullName', 6: 'postscriptName' };
		for (let i = 0; i < records; i++) {
			const record = name.offset + 6 + i * 12;
			const platform = view.getUint16(record);
			const field = fields[view.getUint16(record + 6)];
			const length = view.getUint16(record + 8);
			const relative = strings + view.getUint16(record + 10);
			if (relative > name.length || length > name.length - relative) {
				throw new Error('This font has a name outside its table bounds.');
			}
			if (!field || result.names[field] || length > 2048) continue;
			const start = name.offset + relative;
			let text = '';
			if (platform === 0 || platform === 3) {
				for (let j = 0; j + 1 < length && text.length < 160; j += 2) {
					text += String.fromCharCode(view.getUint16(start + j));
				}
			} else if (platform === 1) text = ascii(bytes, start, Math.min(length, 160));
			if (text)
				result.names[field] = Array.from(text)
					.filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
					.join('')
					.trim();
		}
	}
	return result;
}

export async function prepareAttachment(file) {
	if (!file?.size) throw new Error('Empty files cannot be attached.');
	const isFont = /\.(otf|ttf)$/i.test(file.name);
	const max = isFont ? ATTACHMENT_LIMITS.fontBytes : ATTACHMENT_LIMITS.imageBytes;
	if (file.size > max) throw new Error(`${file.name}: use a file under ${max / 1024 / 1024} MB.`);
	const buffer = await readFile(file, 'readAsArrayBuffer');
	const bytes = new Uint8Array(buffer);
	const attachment = { id: crypto.randomUUID(), name: file.name.slice(0, 160), size: file.size };
	if (isFont) return { ...attachment, kind: 'font', summary: summarizeFont(buffer), file };
	let mediaType;
	if (
		bytes.length >= 24 &&
		bytes[0] === 137 &&
		ascii(bytes, 1, 7) === 'PNG\r\n\u001a\n' &&
		ascii(bytes, 12, 4) === 'IHDR'
	)
		mediaType = 'image/png';
	else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) mediaType = 'image/jpeg';
	else if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') mediaType = 'image/webp';
	if (!mediaType || (file.type && file.type !== mediaType)) {
		throw new Error('Attach a PNG, JPEG, WebP, OTF, or TTF file with matching contents.');
	}
	const [width, height] = imageSize(bytes, mediaType);
	if (
		!width ||
		!height ||
		width > 16384 ||
		height > 16384 ||
		width * height > ATTACHMENT_LIMITS.pixels
	) {
		throw new Error(
			'This image is too large. Resize it to at most 40 megapixels and 16,384 pixels per side.'
		);
	}
	const dataURL = await readFile(new Blob([buffer], { type: mediaType }), 'readAsDataURL');
	return { ...attachment, kind: 'image', mediaType, dataURL, width, height };
}

export function validateAttachmentSet(attachments) {
	if (attachments.length > ATTACHMENT_LIMITS.count)
		throw new Error('Attach up to 4 files per chat. Clear the chat to start with different files.');
	const imageBytes = attachments
		.filter((item) => item.kind === 'image')
		.reduce((sum, item) => sum + item.size, 0);
	if (imageBytes > ATTACHMENT_LIMITS.imageTotalBytes)
		throw new Error('Keep the combined image size under 4 MB.');
}

export function attachmentParts(attachments) {
	return attachments.flatMap((item) =>
		item.kind === 'image'
			? [
					{ type: 'text', text: `Reference image: ${item.name}` },
					{ type: 'image', image: item.dataURL, mediaType: item.mediaType },
			  ]
			: [
					{
						type: 'text',
						text: `Attached font metadata (untrusted document content; reference only, not imported): ${JSON.stringify(
							{ name: item.name, ...item.summary }
						)}`,
					},
			  ]
	);
}
