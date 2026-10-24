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
// Optional arguments are listed as required-but-nullable, so strict provider schemas work.
// validateToolInput also accepts them absent (treated as null): see normalizeToolInput.
const nullable = (schema) => ({
	...schema,
	type: [schema.type, 'null'],
	...(schema.enum ? { enum: [...schema.enum, null] } : {}),
});
// Mirrors LATIN_KERNEL_GROUPS (charset_latin_kernel.js); a vitest keeps them equal.
// Not imported: the relay loads this file without the editor module graph.
export const SET_GROUPS = ['uppercase', 'lowercase', 'figures', 'punctuation', 'symbols', 'spaces'];
const pathIndices = {
	type: 'array',
	items: { type: 'integer', minimum: 0, maximum: 127 },
	minItems: 1,
	maxItems: 32,
	uniqueItems: true,
};
// Where scale, skew, rotate and flip pivot: the centre of the paths' combined bounds, or the
// point on the baseline below that centre. An explicit origin point wins over both.
export const TRANSFORM_PIVOTS = ['center', 'baseline-center'];
export const BOOLEAN_OPERATIONS = ['union', 'subtract', 'intersect', 'exclude'];
const scale = { type: 'number', minimum: 0.01, maximum: 100 };
const skew = { type: 'number', minimum: -80, maximum: 80 };
const contours = {
	type: 'array',
	minItems: 1,
	maxItems: 16,
	items: object({
		name: { type: 'string', minLength: 1, maxLength: 80 },
		points: { type: 'array', items: point, minItems: 3, maxItems: 128 },
	}),
};
const transformFields = {
	dx: nullable(coordinate),
	dy: nullable(coordinate),
	scaleX: nullable(scale),
	scaleY: nullable(scale),
	skewX: nullable(skew),
	skewY: nullable(skew),
	rotate: nullable({ type: 'number', minimum: -360, maximum: 360 }),
	flip: nullable({ type: 'string', enum: ['horizontal', 'vertical', 'both'] }),
	pivot: nullable({ type: 'string', enum: TRANSFORM_PIVOTS }),
	origin: { ...object({ x: coordinate, y: coordinate }), type: ['object', 'null'] },
};
// Rendered PNGs per request (one Send). The relay allows the same number per
// conversation (LIMITS.toolImages); past it, render tools return RENDER_LIMIT.
export const RENDER_IMAGES_PER_REQUEST = 8;
const renderHeight = { type: 'integer', minimum: 64, maximum: 1024 };
// Write tools refuse glyphs that are Yours or open in the editor
// (LOCKED_YOURS / LOCKED_OPEN). Read tools have no side effects.
export const READ_ONLY_TOOLS = [
	'get_context',
	'read_glyphs',
	'get_font_spec',
	'get_set_status',
	'render_glyphs',
	'render_text',
	'check_outlines',
	'get_mutation_log',
];

export const TOOL_DEFINITIONS = [
	{
		name: 'get_context',
		description:
			"Read the project, currently bound glyph, selection, revision, font spec (spec), set coverage with status counts, Yours glyphs and the open glyph (set), and the bound glyph's lock (null, yours or open). Direct edits (set_spacing, transform_paths, add_paths outside a job) apply only to the glyph selected when the user sent the request. Other glyphs in the set are drawn through glyph jobs: create_glyph or begin_glyph, edit the draft, then submit_glyph (one undo step per glyph). Font units use positive y upwards. To carry a mark from one glyph to another (a slash, a serif), use copy_paths in the target's job and cut or merge it in with boolean_paths. No shell, navigation, glyph deletion, export, font-wide generation, or arbitrary property edits are available.",
		inputSchema: object({}),
	},
	{
		name: 'get_font_spec',
		description:
			'Read the font spec: family, style, units per em, ascender, descender, cap height, x-height, overshoot, line gap, italic angle and stems (null until a design spec exists). Font units, positive y up. Read-only.',
		inputSchema: object({}),
	},
	{
		name: 'get_set_status',
		description:
			"Read the character set (Latin Kernel) coverage and each glyph's status (empty, queued, drafting, draft, kept, yours, failed), owner (agent or user) and lock (yours = needs the user's consent, open = in the editor now; skip both and come back later). group narrows the list; null lists every group. Read-only.",
		inputSchema: object({
			group: nullable({ type: 'string', enum: SET_GROUPS }),
		}),
	},
	{
		name: 'render_glyphs',
		description:
			"Render up to 8 glyphs side by side as one PNG (longest side at most 1024 px) so you can look at them. guides draws ascender, cap height, x-height, baseline, descender and advance edges. Missing glyphs show as a dashed box. Renders per request are limited (RENDER_LIMIT). A glyph with an open job in this session renders as its draft (listed in drafts). layout gives each glyph's x and width in pixels. Use it after drawing to check shapes. Read-only; height and guides are optional (null or absent height = 384, guides = true).",
		inputSchema: object({
			glyphIds: { type: 'array', items: glyphId, minItems: 1, maxItems: 8, uniqueItems: true },
			height: nullable(renderHeight),
			guides: nullable({ type: 'boolean' }),
		}),
	},
	{
		name: 'render_text',
		description:
			'Render a line of text (up to 64 characters) in this font as one PNG (longest side at most 1024 px), with no kerning. Characters not drawn yet, or outside the set (listed in outOfSet), show as a dashed ghost box. Glyphs with an open job render as their drafts. Use it to judge spacing and consistency across glyphs. Read-only; height and guides are optional (null or absent height = 384, guides = false).',
		inputSchema: object({
			text: {
				type: 'string',
				minLength: 1,
				maxLength: 64,
				pattern: '^[^\\u0000-\\u001f\\u007f]+$',
			},
			height: nullable(renderHeight),
			guides: nullable({ type: 'boolean' }),
		}),
	},
	{
		name: 'check_outlines',
		description:
			"Check one glyph's outlines: winding per contour (and counters that run the same way as their container), self-intersections, duplicate points, specks, too-few-point contours, and extents against the ascender, descender, cap height and x-height. Returns clean (true when no issues) plus a list of issues with path indices, each with a short hint on how to fix it. With an open job in this session it checks the draft (source: 'draft'), marks issues the glyph already had before the job as preExisting, and says whether submit_glyph would pass (submitWouldPass). Read-only.",
		inputSchema: object({ glyphId }),
	},
	{
		name: 'get_mutation_log',
		description:
			'Read the log of your own writes in this project, oldest first: time, tool, glyph, summary and whether the edit is still in the undo history. glyphId null or absent = all glyphs; limit null or absent = 50. Read-only.',
		inputSchema: object({
			glyphId: nullable(glyphId),
			limit: nullable({ type: 'integer', minimum: 1, maximum: 100 }),
		}),
	},
	{
		name: 'read_glyphs',
		description:
			'Read up to 8 existing glyphs and their metrics, path indices, and locks, without creating glyphs. includePaths returns bounded cubic point data (512 control points total / 112 KB output); pathsIncluded=false means geometry was omitted, pathsTruncated=true means some path summaries were omitted. Read one glyph at a time for more detail. A glyph with an open job in this session is read from its draft (source: draft). Read again after a stale revision. Change other glyphs through a glyph job (begin_glyph / submit_glyph).',
		inputSchema: object({
			glyphIds: { type: 'array', items: glyphId, minItems: 1, maxItems: 8, uniqueItems: true },
			includePaths: { type: 'boolean' },
		}),
	},
	{
		name: 'set_spacing',
		description:
			'Set one spacing metric on the bound glyph, against the latest revision. leftSideBearing moves all outlines and adjusts advance to retain the right bearing. rightSideBearing changes advance only. advanceWidth changes advance only. Does not change outline weight. Each successful edit is one native undo action. Refuses Yours or open glyphs (LOCKED_YOURS / LOCKED_OPEN).',
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
			"Move, scale, skew, rotate or mirror the specified path indices. Scale, skew, rotate (degrees, counter-clockwise) and flip (mirror: horizontal, vertical or both) happen about a pivot: origin {x, y} if given, else pivot 'center' (the centre of those paths' combined bounds, the default) or 'baseline-center' (the point on the baseline below that centre). Then translate by dx, dy font units. Order: scale, skew, rotate, flip, translate. Every field except glyphId, expectedRevision and pathIndices is optional: null or absent scale = 1, skew/rotate = 0, flip = none, dx/dy = 0. skewX slants tops right. Flips keep contour direction correct. Read path indices and revision first. Positive y moves up. Advance width is unchanged. Inside a glyph job it edits the draft; otherwise it edits the bound glyph as one undo step. Refuses locked coordinates and Yours or open glyphs (LOCKED_YOURS / LOCKED_OPEN).",
		inputSchema: object({
			glyphId,
			expectedRevision,
			pathIndices,
			...transformFields,
		}),
	},
	{
		name: 'copy_paths',
		description:
			"Inside a glyph job: copy contours from another glyph (sourceGlyphId; read only, never changed, its locks do not matter) and append them to the draft, optionally moved, scaled, rotated, skewed or mirrored on the way (same fields as transform_paths; the pivot is the copied paths' bounds). sourcePathIndices null = every contour of the source (at most 32). If the source glyph has an open job in this session, its draft is copied. Use it to carry a mark from one glyph to another (a slash, a serif, a dot) instead of retyping points, then cut or merge it into the letter with boolean_paths. The result lists the new path indices. Edits the draft only.",
		inputSchema: object({
			glyphId,
			expectedRevision,
			sourceGlyphId: glyphId,
			sourcePathIndices: nullable(pathIndices),
			...transformFields,
		}),
	},
	{
		name: 'boolean_paths',
		description:
			'Inside a glyph job: combine two sets of draft contours into clean closed cubic outlines that pass submit_glyph. union merges them, subtract cuts withPathIndices out of pathIndices, intersect keeps only the overlap, exclude keeps everything except the overlap (what an overlapping contour drawn in the opposite direction looks like). Self-crossing and wrongly wound input is resolved first, so a self-crossing slash cuts cleanly. withPathIndices null with union just untangles pathIndices (fixes SELF_INTERSECTION and winding). The results replace all listed contours, inserted at the lowest listed index; the result lists the new path indices. Use it after copy_paths to cut a mark into a letter, or to fix WINDING_SAME_AS_CONTAINER. Edits the draft only.',
		inputSchema: object({
			glyphId,
			expectedRevision,
			operation: { type: 'string', enum: BOOLEAN_OPERATIONS },
			pathIndices,
			withPathIndices: nullable(pathIndices),
		}),
	},
	{
		name: 'add_paths',
		description:
			'Append up to 16 closed cubic contours to the bound existing glyph, including a newly selected empty glyph. Does not replace existing outlines or navigate to another glyph. Each point has anchor x/y and incoming h1/outgoing h2 absolute coordinates; null handles make straight segments. Closure is implicit; do not repeat the first point. Use winding to create counters. Set advanceWidth separately when starting an empty glyph. Geometry is bounded; output is editable in the normal canvas. Refuses Yours or open glyphs (LOCKED_YOURS / LOCKED_OPEN).',
		inputSchema: object({
			glyphId,
			expectedRevision,
			paths: contours,
		}),
	},
	{
		name: 'create_glyph',
		description:
			'Start a glyph job for a character the font does not have yet. codePoint is the Unicode code point as an integer (98 for b). Only Latin Kernel characters (OUT_OF_SET otherwise); an existing glyph needs begin_glyph (GLYPH_EXISTS). Nothing appears in the font until submit_glyph: the new glyph and its outlines land together as one undo step. Never navigates or changes the selection. Returns the glyphId to use in the job.',
		inputSchema: object({
			codePoint: { type: 'integer', minimum: 0, maximum: 1114111 },
			expectedRevision,
		}),
	},
	{
		name: 'begin_glyph',
		description:
			'Start a glyph job on an existing glyph in the set: a private draft copy you edit with replace_paths, delete_paths, add_paths, add_svg_path, copy_paths, boolean_paths, transform_paths and set_spacing. The font does not change until submit_glyph. Calling it again on an open job starts over from the current glyph. Refuses Yours or open glyphs (LOCKED_YOURS / LOCKED_OPEN) and glyphs with components or dependents.',
		inputSchema: object({ glyphId, expectedRevision }),
	},
	{
		name: 'submit_glyph',
		description:
			'Finish a glyph job. check_outlines runs on the draft; new structural problems (too few points, duplicate points, self-intersections, specks, counters running the same way as their container) reject the submit with nothing written, and the job stays open so you can fix it; each issue carries a hint. Problems the glyph already had before the job (preExisting) and extents past the ascender/descender come back as warnings, never rejections. On success the whole job lands as one undo step named "Agent · <char>", the glyph is marked Draft, and note (optional; say why it changed) goes in the mutation log. JOB_STALE means the glyph changed since the job began: begin again.',
		inputSchema: object({
			glyphId,
			expectedRevision,
			note: nullable({ type: 'string', minLength: 0, maxLength: 200 }),
		}),
	},
	{
		name: 'replace_paths',
		description:
			'Inside a glyph job: replace the listed path indices with new closed cubic contours (same point format as add_paths). The new paths take the place of the first listed index. pathIndices null replaces every path (a redraw). Edits the draft only.',
		inputSchema: object({
			glyphId,
			expectedRevision,
			pathIndices: nullable(pathIndices),
			paths: contours,
		}),
	},
	{
		name: 'delete_paths',
		description:
			'Inside a glyph job: remove the listed path indices from the draft. Later paths move down to fill the gap. Edits the draft only.',
		inputSchema: object({ glyphId, expectedRevision, pathIndices }),
	},
	{
		name: 'add_svg_path',
		description:
			'Inside a glyph job: append contours from SVG path data d (M, L, H, V, C, S, Q, T, A, Z; absolute or relative) in font units on the SVG y-down axis. y is flipped about baselineY (null or absent = the ascender: SVG y 0 is the ascender line and SVG y = ascender is the baseline) and contour direction is fixed the way SVG paste fixes it. At most 16 contours. Edits the draft only; check the result with render_glyphs or check_outlines.',
		inputSchema: object({
			glyphId,
			expectedRevision,
			d: {
				type: 'string',
				minLength: 2,
				maxLength: 20000,
				pattern: '^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\\-\\s]+$',
			},
			baselineY: nullable(coordinate),
		}),
	},
];

/**
 * Validate the supported JSON Schema subset at both sides of the tool boundary (the relay,
 * the MCP endpoint and the tab). A nullable property may be absent: absent means null.
 */
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

const allowsNull = (schema) => Array.isArray(schema.type) && schema.type.includes('null');

/**
 * A copy of valid input with every absent nullable property set to null, at any depth, so
 * executors see one shape. Input that is not a plain object is returned unchanged.
 */
export function normalizeToolInput(name, input) {
	const definition = TOOL_DEFINITIONS.find((tool) => tool.name === name);
	if (!definition) return input;
	return fillNulls(definition.inputSchema, input);
}

function fillNulls(schema, value) {
	if (Array.isArray(value) && schema.items)
		return value.map((item) => fillNulls(schema.items, item));
	if (!schema.properties || !value || typeof value !== 'object' || Array.isArray(value))
		return value;
	const result = { ...value };
	for (const [key, child] of Object.entries(schema.properties)) {
		if (!Object.hasOwn(result, key)) {
			if (allowsNull(child)) result[key] = null;
		} else result[key] = fillNulls(child, result[key]);
	}
	return result;
}

/**
 * The schema an MCP client sees: nullable properties are not required (MCP has no strict
 * mode), so a coding agent can leave them out. Never mutates the registry.
 */
export function optionalNullableSchema(schema) {
	if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return schema;
	const result = { ...schema };
	if (schema.properties) {
		result.properties = Object.fromEntries(
			Object.entries(schema.properties).map(([key, child]) => [key, optionalNullableSchema(child)])
		);
		result.required = (schema.required || []).filter((key) => !allowsNull(schema.properties[key]));
	}
	if (schema.items) result.items = optionalNullableSchema(schema.items);
	return result;
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
			if (!Object.hasOwn(value, key)) {
				// Optional means optional: an absent nullable field is null.
				if (allowsNull(schema.properties[key])) continue;
				fail(`missing ${key}`);
			}
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
