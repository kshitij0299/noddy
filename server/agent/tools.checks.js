import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateAgentStep, loadNativeRegistry } from './agent.js';
import { createProviderModel } from './providers.js';
import { providerToolSchema } from './tool-schema.js';
import { LIMITS, validateRequest } from './validation.js';

// The relay serves the shared native registry (src/agent/tool-definitions.js).
// These checks keep the relay and the browser executor on one contract.
const EXPECTED_TOOLS = [
	'get_context',
	'get_font_spec',
	'get_set_status',
	'render_glyphs',
	'render_text',
	'check_outlines',
	'get_mutation_log',
	'read_glyphs',
	'set_spacing',
	'transform_paths',
	'copy_paths',
	'boolean_paths',
	'add_paths',
	'create_glyph',
	'begin_glyph',
	'submit_glyph',
	'replace_paths',
	'delete_paths',
	'add_svg_path',
];
const pngBase64 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=';
const base = {
	provider: 'openai',
	protocol: 'responses',
	model: 'test-model',
	apiKey: 'test-key-not-real',
	messages: [{ role: 'user', content: 'Show me the font.' }],
};
const renderCall = {
	role: 'assistant',
	content: [
		{
			type: 'tool-call',
			toolCallId: 'call_1',
			toolName: 'render_text',
			input: { text: 'Hamburg', height: null, guides: null },
		},
	],
};
const renderResult = (data = pngBase64, mediaType = 'image/png') => ({
	role: 'tool',
	content: [
		{
			type: 'tool-result',
			toolCallId: 'call_1',
			toolName: 'render_text',
			output: {
				type: 'content',
				value: [
					{ type: 'text', text: '{"ok":true,"width":512,"height":384}' },
					{ type: 'file', mediaType, data: { type: 'data', data } },
				],
			},
		},
	],
});

function strictObjects(schema, path, problems) {
	const types = Array.isArray(schema.type) ? schema.type : [schema.type];
	if (types.includes('object')) {
		const keys = Object.keys(schema.properties ?? {});
		if (schema.additionalProperties !== false) problems.push(`${path}: additionalProperties`);
		if (JSON.stringify([...(schema.required ?? [])].sort()) !== JSON.stringify([...keys].sort()))
			problems.push(`${path}: every property must be required (use null for optional)`);
		for (const key of keys) strictObjects(schema.properties[key], `${path}.${key}`, problems);
	}
	if (schema.items) strictObjects(schema.items, `${path}[]`, problems);
	if (schema.enum && types.includes('null') && !schema.enum.includes(null))
		problems.push(`${path}: nullable enum must list null`);
}

test('relay registry is the shared native registry with the read tools', async () => {
	const registry = await loadNativeRegistry();
	assert.deepEqual(
		registry.definitions.map((tool) => tool.name),
		EXPECTED_TOOLS
	);
	for (const definition of registry.definitions) {
		const problems = [];
		strictObjects(definition.inputSchema, definition.name, problems);
		assert.deepEqual(problems, [], definition.name);
		assert.ok(definition.description.length > 40, `${definition.name} describes itself`);
		const wire = JSON.stringify(providerToolSchema(definition.inputSchema, 'openai', 'responses'));
		assert.equal(wire.includes('uniqueItems'), false);
	}
});

test('relay validator accepts nulls for optional read-tool arguments and rejects bad ones', async () => {
	const { validateToolInput } = await loadNativeRegistry();
	const ok = (name, input) => assert.equal(validateToolInput(name, input).valid, true, name);
	const bad = (name, input) => assert.equal(validateToolInput(name, input).valid, false, name);
	ok('get_font_spec', {});
	ok('get_set_status', { group: null });
	ok('get_set_status', { group: 'lowercase' });
	bad('get_set_status', { group: 'emoji' });
	// Optional means optional (bug 26): an absent nullable field is null.
	ok('get_set_status', {});
	ok('render_glyphs', { glyphIds: ['glyph-0x6E'] });
	ok('submit_glyph', { glyphId: 'glyph-0x6E', expectedRevision: 'r1' });
	bad('render_glyphs', { height: null });
	bad('submit_glyph', { glyphId: 'glyph-0x6E' });
	ok('render_glyphs', { glyphIds: ['glyph-0x6E'], height: null, guides: null });
	ok('render_glyphs', { glyphIds: ['glyph-0x6E', 'glyph-0x6F'], height: 1024, guides: false });
	bad('render_glyphs', { glyphIds: ['glyph-0x6E'], height: 2048, guides: null });
	bad('render_glyphs', {
		glyphIds: Array.from({ length: 9 }, (_, i) => `glyph-0x4${i}`),
		height: null,
		guides: null,
	});
	ok('render_text', { text: 'Hamburg', height: null, guides: true });
	bad('render_text', { text: 'a\nb', height: null, guides: null });
	bad('render_text', { text: 'x'.repeat(65), height: null, guides: null });
	ok('check_outlines', { glyphId: 'glyph-0x67' });
	bad('check_outlines', { glyphId: '../etc' });
	ok('get_mutation_log', { glyphId: null, limit: null });
	bad('get_mutation_log', { glyphId: null, limit: 0 });
});

test('the browser render budget per request matches the relay image limit', async () => {
	const { RENDER_IMAGES_PER_REQUEST } = await import('../../src/agent/tool-definitions.js');
	assert.equal(RENDER_IMAGES_PER_REQUEST, LIMITS.toolImages);
});

test('accepts rendered PNG tool results and the extended context; rejects spoofed or excess images', async () => {
	const registry = await loadNativeRegistry();
	const request = validateRequest(
		{
			...base,
			messages: [...base.messages, renderCall, renderResult()],
			context: {
				glyphId: 'glyph-0x6E',
				unitsPerEm: 1000,
				spec: { family: 'Test', upm: 1000, ascent: 800, descent: -200 },
				set: { name: 'Latin Kernel', total: 116, drawn: 3, yours: ['glyph-0x41'], open: null },
				lock: null,
			},
		},
		registry.definitions
	);
	assert.equal(request.messages[2].content[0].output.value[1].data.data, pngBase64);
	for (const message of [
		renderResult('YmFk'),
		renderResult(pngBase64, 'image/jpeg'),
		renderResult('not base64!'),
	]) {
		assert.throws(() =>
			validateRequest(
				{ ...base, messages: [...base.messages, renderCall, message] },
				registry.definitions
			)
		);
	}
	const many = [];
	for (let index = 0; index <= LIMITS.toolImages; index++) {
		const call = structuredClone(renderCall);
		const result = renderResult();
		call.content[0].toolCallId = `call_${index}`;
		result.content[0].toolCallId = `call_${index}`;
		many.push(call, result);
	}
	assert.throws(
		() => validateRequest({ ...base, messages: [...base.messages, ...many] }, registry.definitions),
		/rendered images/
	);
});

function finalResponse(protocol) {
	if (protocol === 'responses')
		return {
			id: 'resp_1',
			created_at: 1,
			model: 'test-model',
			output: [
				{
					type: 'message',
					id: 'msg_1',
					role: 'assistant',
					phase: 'final_answer',
					content: [{ type: 'output_text', text: 'Done.', annotations: [] }],
				},
			],
			usage: { input_tokens: 10, output_tokens: 4, total_tokens: 14 },
		};
	if (protocol === 'messages')
		return {
			id: 'msg_1',
			type: 'message',
			role: 'assistant',
			model: 'test-model',
			content: [{ type: 'text', text: 'Done.' }],
			stop_reason: 'end_turn',
			usage: { input_tokens: 10, output_tokens: 4 },
		};
	return {
		id: 'chat_1',
		object: 'chat.completion',
		created: 1,
		model: 'test-model',
		choices: [
			{ index: 0, message: { role: 'assistant', content: 'Done.' }, finish_reason: 'stop' },
		],
		usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
	};
}

for (const [provider, protocol] of [
	['openai', 'responses'],
	['opencode-zen', 'responses'],
	['opencode-zen', 'messages'],
	['anthropic', 'messages'],
]) {
	test(`actual SDK ${provider}/${protocol} sends a rendered PNG tool result as an image`, async () => {
		const registry = await loadNativeRegistry();
		const requests = [];
		const transport = async (url, init) => {
			requests.push(JSON.parse(init.body));
			return new Response(JSON.stringify(finalResponse(protocol)), {
				headers: { 'Content-Type': 'application/json' },
			});
		};
		const result = await generateAgentStep(
			{ ...base, provider, protocol, messages: [...base.messages, renderCall, renderResult()] },
			registry,
			{ modelFactory: (settings) => createProviderModel(settings, transport) }
		);
		assert.equal(result.text, 'Done.');
		assert.equal(requests.length, 1);
		assert.ok(JSON.stringify(requests[0]).includes(pngBase64), 'PNG bytes reach the provider');
		assert.equal(requests[0].tools.length, EXPECTED_TOOLS.length);
	});
}
