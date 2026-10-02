/**
 * uniqueItems is not part of OpenAI's documented strict schema subset. Keep
 * uniqueness enforced by the shared native validator, but omit that keyword
 * from OpenAI-format wire schemas. Never mutate the canonical tool registry.
 * Source: https://developers.openai.com/api/docs/guides/structured-outputs#supported-schemas
 */
export function providerToolSchema(schema, provider, protocol) {
	if (provider !== 'openai' && protocol !== 'responses') return schema;
	const result = structuredClone(schema);
	const visit = (node) => {
		if (!node || typeof node !== 'object' || Array.isArray(node)) return;
		delete node.uniqueItems;
		for (const child of Object.values(node.properties ?? {})) visit(child);
		if (node.items) visit(node.items);
		for (const keyword of ['anyOf', 'oneOf', 'allOf']) {
			for (const child of node[keyword] ?? []) visit(child);
		}
		for (const child of Object.values(node.$defs ?? {})) visit(child);
	};
	visit(result);
	return result;
}
