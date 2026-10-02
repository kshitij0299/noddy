// This registry is shared by the provider and the native executor. Adding a tool
// here does not grant it access: the executor must implement its scoped command.
const coordinate = { type: 'number', minimum: -32768, maximum: 32767 };
const glyphId = { type: 'string', minLength: 8, maxLength: 32, pattern: '^glyph-0x[0-9A-Fa-f]+$' };
const expectedRevision = { type: 'string', minLength: 1, maxLength: 80 };
const object = (properties) => ({
	type: 'object',
	properties,
	required: Object.keys(properties),
	additionalProperties: false,
});
const handle = { ...object({ x: coordinate, y: coordinate }), type: ['object', 'null'] };
const point = object({ x: coordinate, y: coordinate, h1: handle, h2: handle });

export const TOOL_DEFINITIONS = [
	{
		name: 'get_context',
		description:
			'Read the project, currently bound glyph, selection, and revision. This session can edit only the glyph selected when the user sent the request. Font units use positive y upwards. No shell, navigation, deletion, export, font-wide generation, or arbitrary property edits are available.',
		inputSchema: object({}),
	},
	{
		name: 'read_glyphs',
		description:
			'Read up to 8 existing glyphs and their metrics, path indices, and locks, without creating glyphs. includePaths returns bounded cubic point data (512 control points total / 112 KB output); pathsIncluded=false means geometry was omitted, pathsTruncated=true means some path summaries were omitted. Read one glyph at a time for more detail. Read again after a stale revision. Only the bound current glyph is writable.',
		inputSchema: object({
			glyphIds: { type: 'array', items: glyphId, minItems: 1, maxItems: 8, uniqueItems: true },
			includePaths: { type: 'boolean' },
		}),
	},
	{
		name: 'set_spacing',
		description:
			'Set one spacing metric on the bound glyph, against the latest revision. leftSideBearing moves all outlines and adjusts advance to retain the right bearing. rightSideBearing changes advance only. advanceWidth changes advance only. Does not change outline weight. Each successful edit is one native undo action.',
		inputSchema: object({
			glyphId,
			expectedRevision,
			metric: { type: 'string', enum: ['leftSideBearing', 'rightSideBearing', 'advanceWidth'] },
			value: coordinate,
		}),
	},
	{
		name: 'transform_paths',
		description:
			'Translate the specified path indices in the bound glyph by dx, dy font units. Translation only: no scale, rotation, skew, component transforms, or changing locks. Read path indices and revision first. Positive y moves up. Advance width is unchanged.',
		inputSchema: object({
			glyphId,
			expectedRevision,
			pathIndices: {
				type: 'array',
				items: { type: 'integer', minimum: 0, maximum: 127 },
				minItems: 1,
				maxItems: 32,
				uniqueItems: true,
			},
			dx: coordinate,
			dy: coordinate,
		}),
	},
	{
		name: 'add_paths',
		description:
			'Append up to 16 closed cubic contours to the bound existing glyph, including a newly selected empty glyph. Does not replace existing outlines or navigate to another glyph. Each point has anchor x/y and incoming h1/outgoing h2 absolute coordinates; null handles make straight segments. Closure is implicit; do not repeat the first point. Use winding to create counters. Set advanceWidth separately when starting an empty glyph. Geometry is bounded; output is editable in the normal canvas.',
		inputSchema: object({
			glyphId,
			expectedRevision,
			paths: {
				type: 'array',
				minItems: 1,
				maxItems: 16,
				items: object({
					name: { type: 'string', minLength: 1, maxLength: 80 },
					points: { type: 'array', items: point, minItems: 3, maxItems: 128 },
				}),
			},
		}),
	},
];

/** Validate the supported JSON Schema subset at both sides of the tool boundary. */
export function validateToolInput(name, input) {
	const definition = TOOL_DEFINITIONS.find((tool) => tool.name === name);
	if (!definition) return { valid: false, error: `Unknown tool: ${name}` };
	try {
		checkSchema(definition.inputSchema, input, 'input');
		return { valid: true };
	} catch (error) {
		return { valid: false, error: error.message };
	}
}

function checkSchema(schema, value, path) {
	const fail = (message) => {
		throw new Error(`${path}: ${message}`);
	};
	const types = Array.isArray(schema.type) ? schema.type : [schema.type];
	if (value === null && types.includes('null')) return;
	const type = types.find((candidate) => candidate !== 'null');
	if (type === 'object') {
		if (!value || Array.isArray(value) || typeof value !== 'object') fail('expected object');
		if (Object.getPrototypeOf(value) !== Object.prototype) fail('expected plain object');
		for (const key of Object.keys(value)) {
			if (!Object.hasOwn(schema.properties, key)) fail(`unexpected property ${key}`);
		}
		for (const key of schema.required) {
			if (!Object.hasOwn(value, key)) fail(`missing ${key}`);
			checkSchema(schema.properties[key], value[key], `${path}.${key}`);
		}
	} else if (type === 'array') {
		if (!Array.isArray(value)) fail('expected array');
		if (value.length < schema.minItems || value.length > schema.maxItems)
			fail('invalid array size');
		if (schema.uniqueItems && new Set(value).size !== value.length) fail('duplicate items');
		value.forEach((item, index) => checkSchema(schema.items, item, `${path}[${index}]`));
	} else if (type === 'number' || type === 'integer') {
		if (typeof value !== 'number' || !Number.isFinite(value)) fail('expected finite number');
		if (type === 'integer' && !Number.isInteger(value)) fail('expected integer');
		if (value < schema.minimum || value > schema.maximum) fail('number outside supported bounds');
	} else if (type === 'string') {
		if (typeof value !== 'string') fail('expected string');
		if (value.length < schema.minLength || value.length > schema.maxLength)
			fail('invalid string length');
		if (schema.pattern && !new RegExp(schema.pattern).test(value)) fail('invalid identifier');
	} else if (type === 'boolean' && typeof value !== 'boolean') fail('expected boolean');
	if (schema.enum && !schema.enum.includes(value)) fail('unsupported value');
}
