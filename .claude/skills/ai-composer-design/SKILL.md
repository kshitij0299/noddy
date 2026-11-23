---
name: ai-composer-design
description: Design and implement prompt input boxes (composers) for AI chat, multimodal, and agentic applications. Use when the user asks to design, build, code, audit, or improve an AI chat input box, prompt bar, message composer, multimodal prompt field, or chat UI component.
---

# AI Composer Design

Design and build clean, resilient AI prompt composers that balance minimal default UI with progressive disclosure for attachments, tools, voice, and power-user workflows.

## When to Use

- Designing or prototyping an AI chat input box, prompt bar, or composer in Figma or code
- Building React, React Native, or web chat input components for LLM and agent interfaces
- Auditing or simplifying a cluttered AI input bar that has accumulated too many buttons, banners, or modes
- Implementing multimodal attachments, slash commands, voice/dictation triggers, or streaming states in a chat UI

## Design & Implementation Workflow

### 1. Establish the Visual & Structural Foundation

- **Keep a single-story resting layout:** Start with a clean, single-row container rather than stacking multiple toolbar rows by default.
- **Constrain container width:** Apply a `max-width` between `720px` and `800px` (such as `768px`) so lines remain readable on wide screens without feeling cramped.
- **Set font size to 16px minimum:** Use `16px` (`1rem`) or larger for the input text. Fonts smaller than `16px` trigger automatic viewport zoom on mobile Safari and iOS webviews.
- **Use a clean sans-serif or system font:** Prioritize legibility and neutrality for general chat inputs over decorative serifs or novelty typefaces.
- **Combine soft elevation and outline:** Pair a subtle `1px` border with a soft `box-shadow` and clear surface contrast against the page background so the composer feels anchored without looking heavy.
- **Match corner radii concentrically:** Align the inner button radius with the outer container radius (for example, circular buttons inside a pill-shaped composer, or softly rounded square buttons inside a rounded rectangle).
- **Use calm, low-pressure placeholder text:** Keep placeholders brief (such as "Ask anything" or "Type a message...") to prevent empty-box friction without distracting the user.

### 2. Apply Progressive Disclosure to Controls

- **Consolidate secondary actions under a `+` menu:** Place a single `+` button on the bottom-left inside the composer to house file uploads, web search, tools, skills, connectors, and plugins in a popover menu.
- **Keep the model switcher compact:** Display only the active model name and a downward caret (`Quick ⌄`) on the trigger. In the popover, list only the latest models with a one-line summary each, tucking legacy versions into a "More models" submenu.
- **Separate dictation from live voice mode:** Treat speech-to-text dictation (microphone icon) and real-time conversational voice mode (waveform icon) as distinct actions.
- **Use one button for two jobs (Voice and Send):** Position voice on the bottom-right. When the input is empty, show the live voice trigger; as soon as the user types text, morph that button into the primary Send button (`↑`).
- **Keep usage metrics unobtrusive:** Avoid cluttering the typing area with prominent quota bars; use a subtle progress ring or quiet caption only when helpful.

### 3. Handle Text Input, Attachments & Drag-and-Drop

- **Render attachments inside the top of the composer:** Display uploaded images, files, and context chips inside the upper area of the composer container above the textarea so attachments and prompt text read as one unit.
- **Make attachment removal touch-friendly:** Place a clear `×` dismiss button on the corner of each attachment chip that is always visible (never hover-only, since touchscreens lack hover). Disable or hide removal cleanly while an upload is actively in progress.
- **Cap auto-growth at ~5 lines:** Allow the textarea to grow automatically from 1 line up to roughly 5 lines (`max-height`), then switch to internal vertical scrolling so long prompts never overtake the screen.
- **Convert pasted walls of text into chips:** When a user pastes a large block of text, collapse it into a compact "Pasted text" attachment chip instead of flooding the input field.
- **Turn the entire page into a dropzone:** Allow users to drag and drop files anywhere onto the viewport with a clear drop-target overlay, rather than forcing them to aim at a tiny file icon.
- **Configure keyboard submission cleanly:** Map `Enter` to send and `Shift + Enter` to insert a newline, and keep native `spellcheck` enabled.

### 4. Manage Lifecycle, Layout Transitions & Streaming States

- **Center on new chats, slide to bottom on active threads:** On an empty new chat, center the composer vertically beneath a concise, moderately sized greeting (such as "Good morning, [Name]"). Once the first message is sent, smoothly slide the composer to the bottom of the viewport and expand upward as text grows.
- **Keep generation states in the chat stream:** Do not decorate the composer with distracting rainbow borders or error shakes while the model is thinking or failing. Render "Thinking..." indicators and retry errors inside the conversation thread.
- **Never block the user's typing flow:** While a response is streaming, switch the Send button to a Stop button, but allow the user to type and queue their next prompt immediately.
- **Avoid noisy prompt suggestions:** Do not clutter the box with static suggestion pills or inline autocomplete-while-typing that interrupts writing flow. If offering contextual hints, use subtle ghost text accepted via `Tab`.

### 5. Support Power-User Triggers Without Mode Bloat

- **Use one unified composer across chat and code:** Avoid splitting "Chat" and "Code" into separate segmented toggles when addressing the same AI. Surface contextual selectors (such as repository, environment, or branch) only when a coding context is active.
- **Wire `/` for actions and `@` for context:** Typing `/` opens a filterable command menu (mirroring the `+` menu as "two doors, same room"). Typing `@` opens a filterable picker to reference files, docs, or entities inline within the sentence.

### 6. Defend Real Estate & Enforce Accessibility

- **Block stakeholder clutter:** Keep marketing banners, upgrade buttons, streak counters, floating help bubbles, mascots, star-rating widgets, and cookie banners out of the composer.
- **Limit legal copy to one line:** Place at most a single, unobtrusive disclaimer line beneath the composer (for example, "Answers can be wrong. Check the important ones.").
- **Preserve visible keyboard focus rings:** Never strip `:focus-visible` outlines without providing an equally clear high-contrast focus indicator.
- **Label every icon-only button:** Provide explicit `aria-label` attributes and hover tooltips (such as "Send message", "Add files", "Start voice mode") on all icon-only controls.
- **Provide generous touch targets:** Size interactive buttons to at least `40px` to `44px` in width and height so they are easy to tap on mobile without looking bulky.

## Gotchas

- **Hover-only dismiss buttons:** Hiding the `×` icon on attachment thumbnails until hover breaks mobile usability. Keep dismiss controls visible on touch devices.
- **Sub-16px mobile inputs:** Setting `font-size: 14px` or `15px` on `<textarea>` causes iOS browsers to zoom in unexpectedly on focus. Always use at least `16px`.
- **Creepy ambient personalization:** Avoid hyper-specific greetings referencing sleep habits, live weather, or calendar surveillance; stick to simple time-of-day or neutral greetings.
- **Over-engineering attachments:** Keep quick sketch or note attachments lightweight rather than turning the composer into a full multi-panel design tool.

## Noddy addendum

- Noddy's composer lives in a ~384px side panel, so the 720–800px max-width rule only applies if the composer is ever shown full-width.
- Noddy has no voice mode: the right-hand button is Send (and Stop while a run is going).
- Tokens only (Noddy colour, radius, type tokens). AGENTS.md §1 bans still apply.
