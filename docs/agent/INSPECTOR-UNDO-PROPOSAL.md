# Inspector numeric undo repair proposal

Status: awaiting explicit approval. This document proposes a shared inspector fix; the application change has not been applied.

The browser check found that manually changing the right side bearing after an agent edit does not create a history entry. Undo then removes the preceding agent command instead of the manual change. The proposed repair records one native history entry when a numeric inspector edit actually changes the selected item.

## Confirmed failure

The same sequence fails in the running app with ordinary typing and in a DOM regression using the real `InputNumber` custom element:

1. Add an outline whose maximum x coordinate is 590.
2. Use the agent to set advance width to 720, producing RSB 130.
3. Undo that agent command, then use native Redo: advance is 720.
4. Type RSB 150 in the inspector and commit the input: advance becomes 740.
5. Use native Undo. Actual advance is 0; expected advance is 720.

The proposed regression currently fails with `expected +0 to be 720`. The previously committed native suite has 26 passing tests; this additional failing test is held locally and is not included in the proposal commit.

`InputNumber.numberInputChanged()` in `src/controls/input-number/input_number.js:366` forwards a native `change` event. `makeSingleInput().changeHappened()` in `src/panels/cards.js:166` applies the property and publishes the new value, but never calls history. There is no document-level change listener that records this missing entry. AX automation is not the cause.

## Proposed scope

Change only `makeSingleInput()` in `src/panels/cards.js` and add focused regressions. Preserve native numeric setters, geometry, locks, canvas behavior, serialization, and the existing `History` implementation. No agent-specific interception of manual edits is proposed.

The numeric callers are glyph metrics, glyph/path/point positions and sizes, component-instance transforms, kern-group values, and guide locations. The proposed condition includes current-item editing topics and excludes guides, which use `editCanvasView` and need project-level history rather than a selected-item snapshot. Text inputs, lock toggles, and separate action buttons remain outside this repair.

No current numeric caller records its own history. `InputNumber` increment/decrement and text commit share the same forwarded event. Comparing serialized selected-item state rejects no-ops after numeric coercion; checking that the history head is unchanged avoids adding a duplicate if a subscriber already recorded the event.

## Proposed application diff

```diff
diff --git a/src/panels/cards.js b/src/panels/cards.js
--- a/src/panels/cards.js
+++ b/src/panels/cards.js
@@
 		const editor = getCurrentProjectEditor();
+		const recordsNumericHistory =
+			tagName === 'input-number' && topics.some((topic) => topic.startsWith('current'));
+		const beforeState = recordsNumericHistory
+			? JSON.stringify(editor.selectedItem.save())
+			: undefined;
+		const historyHead = editor.history.queue[0];
 		// Update the view so that the glyph stays put
@@
 		} else {
 			topics.forEach((topic) => editor.publish(topic, item));
 		}
+		if (
+			recordsNumericHistory &&
+			editor.history.queue[0] === historyHead &&
+			JSON.stringify(editor.selectedItem.save()) !== beforeState
+		) {
+			editor.history.addState(`Updated ${property}`);
+		}
 		// log(`makeSingleInput.changeHappened event`, 'end');
```

## Reproduction test

This test belongs in `src/agent/native-tools.test.js`, using its real project/editor fixture and `args()` helper. Register the actual custom element in that test file so its internal input forwards the event exactly as in the browser:

```js
import { InputNumber } from '../controls/input-number/input_number.js';

if (!customElements.get('input-number')) {
	customElements.define('input-number', InputNumber);
}

it('records a real numeric inspector edit after agent redo as its own native undo step', () => {
	document.body.insertAdjacentHTML('beforeend', '<div id="editor-page__panel"></div>');
	editor.nav.panel = 'Attributes';
	selected().shapes = [];
	selected().advanceWidth = 0;
	const rectangle = points.map((point) => ({
		...point,
		x: point.x === 40 ? 50 : 590,
	}));
	expect(session.execute('add_paths', args({
		paths: [{ name: 'Outline', points: rectangle }],
	})).ok).toBe(true);
	expect(session.execute('set_spacing', args({
		metric: 'advanceWidth', value: 720,
	})).ok).toBe(true);
	expect(session.undoLast().ok).toBe(true);
	editor.history.redoState();
	expect(selected().rightSideBearing).toBe(130);
	const input = document.querySelector('.singleInput-rightSideBearing');
	input.numberInput.value = '150';
	input.numberInput.dispatchEvent(new Event('change', { bubbles: true }));
	expect(selected().advanceWidth).toBe(740);
	editor.history.restoreState();
	expect(selected().advanceWidth).toBe(720);
});
```

After approval, also check that an unchanged value records nothing, one increment records exactly one entry, a locked value records nothing, guide changes do not add selected-item history, and manual Undo/Redo restores 720/740 in the browser. Run the focused suite, complete relevant suite, lint, and production build. Report any further existing manual-history behavior separately rather than widening this patch without review.

## Approval requirement

`AGENTS.md` section 3 protects “undo/redo” and “editing behavior” even when the file itself is outside the listed protected directories. It requires a domain explanation, focused regression evidence, verification-packet disclosure, and explicit user approval. This document provides the explanation, exact proposed change, and reproduced failure. Approval is required before applying the behavior change.
