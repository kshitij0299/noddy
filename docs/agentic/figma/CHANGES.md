# Figma changes to sync

Design changes made in code that Figma does not show yet, so they can be synced later (see [FIGMA.md](../FIGMA.md)). One entry per change: what, where, and the tokens. Newest at the bottom.

## 82 · Connect flow: Provider, Key, Model (agent panel, empty state)

There is no Figma frame for this flow. It follows the Plan-card shell (`screens/flow-02.png`, `screens/flow-03.png`) and the Noddy tokens and type roles. Screenshots of every state are in `docs/agentic/screenshots/82/`. Issue: [#82](https://github.com/kshitij0299/noddy/issues/82).

### What changed

- **"Connect a model" card is now a stepped card.** Three steps, one decision each, always a way back: **Choose a provider**, **Add your {Provider} key**, **Choose a model**. The old single dense form (provider dropdown, model field, key field, advanced format) is gone, and so are the native `<select>` and `<datalist>`.
- **Step header, the same on all three steps.** Step title on the left (`text-subheading`), "Step n of 3" on the right (`text-meta`), then a 4px bar split into three equal segments (done and current `--color-bg-accent`, the rest `--color-bg-track`). The bar is decoration; the text carries the step. Header row 24px, 12px gap, bar, 16px to the body.
- **Step 1.** Four full-width rows, 56px, 8px apart: name (`text-label`), one hint line (`text-body-small`), outlined `chevron_right`. OpenRouter first with a "Recommended" tag. Choosing a row goes on; there is no Next and no Back on this step.
- **Step 2.** Label row ("API key" left, "Get a key ↗" right), one 40px password field with an inside show/hide toggle (outlined `visibility`, 12px from the edge), one reserved helper line ("Your key stays in this tab and is never saved."), then the action stack.
- **Step 3.** "Key works · {Provider}" line, label row ("Model" left, price unit right), a search field when the list is long (inside-left `search`, inside-right clear), the listbox (two groups, **Free · n** then **Paid · n**, sticky headings), one quiet line ("Showing 42 models that work with Noddy's tools." and a "Use a model ID" link), a caption ("Free models may keep what you send." or "Paid models bill your {Provider} account."), then the action stack. Rows show only what differs from the group: the model ID (wraps, never cut), Vision, a Paid price, "Ends 31 Oct". The selected row has `--color-bg-accent-subtle` and a check; hover is paint only.
- **Only models that work with Noddy's tools are listed**, nothing is greyed out (owner decision, issue #82). The rule lives in `src/agent/model-requirements.js`.
- **Connected row.** One two-line, 56px row (the height of a provider row), field border and radius: check icon; line one the provider (`text-label`) with its Free or Paid badge; line two the whole model ID (`text-mono-small`, secondary colour); a ghost "Change" button at the right, centred. The ID is cut with an ellipsis only here, and only when it is too long; the full text is in `title` and in what a screen reader gets. It replaces the card; the suggestion chips come back with it.
- **Errors.** Outlined `error` icon plus text (the text stays `--color-text-primary`) plus a `--color-status-failed` field border: `{status} · {what happened} — {what to do}`, with fix links ("Add credits ↗", "Open settings ↗") and a closed-by-default **Details** disclosure (status, host, the provider's cleaned message). In the thread the same words appear with "Change model" and "Re-enter key".
- **Empty state anchors to the top while a card is showing**, so the greeting block never moves between steps. At a window height of 1000px or less the mark and the title step aside while a card is showing (on every step, so nothing moves between steps), and nothing is padded under the card.
- **Step 3 fits the panel.** The list gives up height (down to 136px, about four rows) until the whole step fits the thread, so the count line, "Use a model ID" and the cost line are never below the fold; it is 320px when there is room. The failure of "Use this model" and the cost line are in the sticky action stack above the primary. (QA on PR #83: at 1440 × 900, 1024 × 768 and 390 × 844 they were under the sticky actions.)
- **Key text the relay would refuse is named before anything is sent.** A leading `Bearer ` (copied from a curl example) is dropped. A space inside, a non-ASCII character or a text over 512 characters gets a plain line ("That has a space in it, so it is not a key — paste only the key. Nothing was sent."). A refusal by the relay itself says "Noddy's relay refused …" with Details "From: Noddy relay, on this computer", never the provider's name.

### The one form grid (the owner's "some boxes are this length, some that length")

Every step uses the same grid. The card is 352px in the 384px panel with 16px padding and a 1px border, so the content is 318px. One column, nothing beside a field.

| Rule | Value |
|---|---|
| Width | Every field, search field, list, provider row, primary and Back button is **100%** of the content width. Icons (show/hide, search, clear) sit **inside** the field box, 12px from its edge. No control has a pixel width. |
| Height | One token, `--control-h: 40px` (44px when `pointer: coarse` or under 760px wide), set on `.agent-connect-host`. Fields, the search field, list rows (minimum), primary and Back use it. Two-line rows (provider rows, the Connected row) are 56px. |
| Labels | Above the field, `text-label`, sentence case, three words at most, 8px gap to the field. An action link ("Get a key ↗", "Pick from the list") sits right-aligned in the label row. Placeholders are examples only, never the label. |
| Helper and error | Directly under the field, 4px gap, `text-body-small`, one reserved 20px line. A one-line error replaces the helper in that line, so nothing moves. A longer error (two or three lines, plus its Details) pushes the actions down by its extra lines: this happens only right after the person pressed the button, and keeps the error next to the field it is about. On Step 3 the error of "Use this model" and the cost line sit in the sticky action stack, right above the primary, so they are on screen at any panel height. |
| Rhythm | 4px grid: card padding 16, field groups 16 apart, 16 before the actions, 8 between the two buttons. |
| Actions | The same on every step: **primary full width** (filled accent, `--radius-full`), then **Back as a full-width ghost button** under it. Tab order: primary, then Back. The stack sticks to the bottom of the scrolling thread when the card is taller than the panel (Step 3 on a short window, any step on a phone). |
| Shape | Fields, lists and rows `--radius-md` with a 1px `--color-border-default`. Card `--radius-lg`. Focus is `--focus-ring`, never clipped. |
| Type | Values `text-body`; key and model IDs `text-mono`; prices `text-mono-small`; step title `text-subheading`; step count `text-meta`. |

`src/agent/tests/connect-form-grid.test.js` pins this in the stylesheet (one token, 100% widths, no pixel widths, 4px rhythm, tokens only), and the measured widths and heights in Chrome are in the PR.

### Deviations from the UX note, and why

- Tab order on Step 2 follows the visual order: "Get a key" (in the label row above the field) comes first, then the field, show/hide, Check key, Back. A DOM order that differs from the picture is worse.
- The action stack is sticky in every viewport (the note said phones and short viewports), because Step 3 is taller than the 820px panel at 1440 × 900.
- A Step 2 error longer than one line moves the actions down (see Helper and error). The note said nothing moves; reserving three blank lines under every key field would cost more than a move that follows the person's own press.
- "Use a model ID" is a quiet link in the count line rather than a "Custom…" row, because the owner asked for unsupported and unknown models to be hidden and for no extra toggle. A search with no match also offers the text as a model ID.
- The Connected row has two lines (provider and badge, then the model ID) instead of one 40px line: a one-line row cut a real OpenRouter ID after about 19 characters at 1440 and after 14 at 375. The header chip shows the model without its vendor prefix (`gemma-4-26b-a4b-it:free`) for the same reason.

### Research behind the layout

- Baymard, [Avoid multi-column forms](https://baymard.com/blog/avoid-multi-column-forms): in its testing multi-column forms led people to skip or misread fields; single column is recommended, and a two-column form layout is "never recommended".
- NN/g, [Website forms usability](https://www.nngroup.com/articles/web-form-design/): labels close to and above their fields, one column, field size that matches the expected input, one prominent primary action near the fields, no Reset.
- NN/g, [Wizards](https://www.nngroup.com/articles/wizards/): show the steps and the current one, explicit Previous and Next, mark completed steps, keep each step simple, pre-fill from earlier use.
- GitHub Primer, [Forms](https://primer.style/product/ui-patterns/forms/): stack controls vertically, labels of three words or fewer in sentence case, no placeholder as label, inline errors tied to the input.
- IBM Carbon, [Text input style](https://carbondesignsystem.com/components/text-input/style/) and [Form style](https://carbondesignsystem.com/components/form/style/): 40px medium input, 8px label gap, 4px helper margin, 12px helper and label type.
- GOV.UK, [Text input](https://design-system.service.gov.uk/components/text-input/): labels above, inputs fill their container unless the content has a known length.
- W3C WAI-ARIA APG, [Editable combobox with list autocomplete](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-autocomplete-list/): the keyboard model of the search field over the list.
- Product flows: Raycast [Bring your own keys](https://manual.raycast.com/ai/bring-your-own-keys) (provider, paste key, Verify, then models), OpenCode [Providers](https://opencode.ai/docs/providers/) (`/connect`, paste key, `/models`), Crush's key check at provider setup. All three put the provider first, check the key before showing models, and show a connection state.
- Laws of UX, [Hick's law](https://lawsofux.com/hicks-law/) and [Jakob's law](https://lawsofux.com/jakobs-law/).

None of these is copied: the grid is translated into Noddy tokens, radius and type roles.
