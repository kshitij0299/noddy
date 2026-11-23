import { afterAll, beforeAll } from 'vitest';
import { log } from './src/app/main';
beforeAll(() => {
	global.log = log;
});
afterAll(() => {
	delete global.log;
});

// ui-sdk (the agent composer island, #126) needs browser APIs jsdom lacks. These are the stubs
// the ui-sdk testing guide lists; jsdom has no layout, animation or top layer to drive.
// `??=` keeps a real implementation if jsdom ever adds one.
if (typeof HTMLElement !== 'undefined') {
	HTMLElement.prototype.showPopover ??= function () {};
	HTMLElement.prototype.hidePopover ??= function () {};
	Element.prototype.getAnimations ??= () => [];
	Element.prototype.scrollIntoView ??= function () {};
	Element.prototype.checkVisibility ??= () => true;
	document.getAnimations ??= () => [];
	document.elementFromPoint ??= () => null;
	document.elementsFromPoint ??= () => [];
	globalThis.ResizeObserver ??= class {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
}
// jsdom cannot parse the `@layer ui-sdk { ... }` rules ui-sdk adds (they only matter in a real
// browser): drop that one complaint, matched on the sheet text, so other CSS errors stay visible.
const virtualConsole = globalThis.jsdom?.virtualConsole;
if (virtualConsole) {
	const listeners = virtualConsole.listeners('jsdomError');
	virtualConsole.removeAllListeners('jsdomError');
	virtualConsole.on('jsdomError', (error) => {
		const uiSdkLayer =
			String(error?.message || '').includes('Could not parse CSS stylesheet') &&
			String(error?.detail || '').includes('@layer ui-sdk');
		if (uiSdkLayer) return;
		for (const listener of listeners) listener(error);
	});
}
