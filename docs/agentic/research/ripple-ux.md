# UX prior art for Noddy's "notice one edit, spread it" feature

Scope: the user hand-edits one glyph (for example, lowercase a). The agent works out what changed, says so in a fun way, and offers to spread the change, with scope, strength, preview, Draft-only apply, and one shared undo.

## 12 patterns, ranked by fit

**1. Copilot Next Edit Suggestions: predict related edits after one edit** ([VS Code docs](https://code.visualstudio.com/docs/editing/ai-powered-suggestions), [GitHub Next](https://githubnext.com/projects/copilot-next-edit-suggestions/))
- **Steal:** It triggers after you make an edit, not while you type. A gutter arrow points to where the next edits are, there is an optional collapsed mode, and Tab moves to a suggestion while a second Tab accepts it.
- **Avoid:** Jumping through edits in an order that feels random. The team itself says the path "could look pretty odd."
- **Why:** This is the closest structural match to our feature: one change leads to predicted related changes elsewhere, shown quietly.

**2. Illustrator Global Edit: select one, see the similar ones highlighted** ([Adobe](https://helpx.adobe.com/illustrator/using/global-edit.html))
- **Steal:** Matches light up automatically. Match criteria (appearance or size) narrow them, shift-click excludes one, and scope can be limited to a range of artboards.
- **Avoid:** Its live mirroring, where edits land everywhere at once with no preview or draft.
- **Why:** The "similar" criteria map straight onto letter anatomy chips such as stem foot, bowl or terminal.

**3. AutoDraw and Quick, Draw!: the AI reads your doodle** ([It's Nice That](https://www.itsnicethat.com/news/google-creative-lab-autodraw-ai-drawing-tool-120417), [Mental Floss](https://www.mentalfloss.com/article/88882/googles-addictive-new-app-makes-ai-guess-what-youre-doodling))
- **Steal:** A suggestion strip that updates after each finished line and gets more specific as you draw more. Also Quick, Draw!'s honest admission when it can't tell what you drew.
- **Avoid:** One click swapping out your own drawing.
- **Why:** These set the standard for "the AI guessed my doodle" being fun.

**4. Photoshop Generative Fill: three variations on a non-destructive layer** ([Mapsoft](https://mapsoft.com/posts/generative-fill-photoshop.html), [Adobe Community](https://community.adobe.com/questions-712/photoshop-no-longer-creating-three-options-when-using-generative-fill-or-generative-expand-1161579))
- **Steal:** Three thumbnails you can flip through with arrow keys. Results sit on a separate layer that persists.
- **Avoid:** Putting the variants in a panel that can be closed. Users then think they only got one result.
- **Why:** Gives the "3 variations" model, plus Drafts as a separate layer.

**5. Midjourney Vary (Subtle/Strong) and Vary Region** ([variations](https://docs.midjourney.com/docs/variations), [vary region](https://docs.midjourney.com/vary-region))
- **Steal:** Strength levels named by what they keep. Subtle keeps composition and colours; Strong may change them. A smaller selected region gives a smaller change.
- **Avoid:** Prompt-heavy, unbounded randomness.
- **Why:** This becomes our Subtle / Same / Wild control.

**6. Visual Studio Preview Changes and VS Code Refactor Preview** ([VS Code](https://code.visualstudio.com/docs/editing/refactoring), [Visual Studio](https://learn.microsoft.com/en-us/visualstudio/ide/preview-changes))
- **Steal:** A checkbox for each change, a diff when you select one, partial apply, and a single Apply/Discard.
- **Avoid:** The developer-style list UI. The checkboxes should be the glyph grid itself.
- **Why:** Applying a change across many items safely is a solved problem here.

**7. HAX guidelines and the PAIR guidebook** ([HAX library](https://www.microsoft.com/en-us/haxtoolkit/library/), [G9](https://www.microsoft.com/en-us/haxtoolkit/guideline/support-efficient-correction/), [example-based explanations](https://www.microsoft.com/en-us/haxtoolkit/pattern/g11-f-example-based-explanations/), [PAIR explainability](https://pair.withgoogle.com/chapter/explainability-trust/), [PAIR feedback](https://pair.withgoogle.com/chapter/People%20+%20AI%20Guidebook%20-%20Feedback%20+%20Control.pdf))
- **Steal:**
  - G3: time the help to the moment. G8: make it quick to dismiss.
  - G9: make correction easy. This includes the 9C pattern (undo automated actions) and 9E (batch editing).
  - G11: explain why it did what it did. G17: provide global controls.
  - PAIR: explain only part of the reasoning, explain by example, show confidence as a category, and offer a few alternatives when confidence is low.
- **Avoid:** Numeric confidence percentages and complete explanations. PAIR's advice is to aim for understanding.
- **Why:** This is the trust layer.

**8. Lightroom Recommended presets: an Amount slider from 0 to 200, plus "More like this"** ([Adobe](https://helpx.adobe.com/lightroom/web/edit-photos/use-presets/apply-presets.html))
- **Steal:** Adjust strength after generating, without regenerating, and allow going past 100% to exaggerate. "More like this" opens similar options. Saved presets also give a model for reusing a change in other fonts: a saved "Move".
- **Avoid:** Not saying where a recommendation came from.
- **Why:** Fine strength control that costs nothing to adjust.

**9. Procreate QuickShape** ([Procreate](https://help.procreate.com/pocket/handbook/guides/quickshape))
- **Steal:** After the gesture, the stroke snaps to a clean shape and a brief "Edit Shape" button appears, then goes away if ignored. Its nodes can be adjusted, and the shape can be reverted to freehand.
- **Avoid:** Applying the AI's reading of your stroke automatically.
- **Why:** A good timing model: react after the gesture ends, and let the user decline by ignoring it.

**10. Font-tool precedent** ([FontLab Edit Across Glyphs](https://help.fontlab.com/fontlab-vi/Using-the-Glyph-Window), [Glyphs filters act on selected layers](https://forum.glyphsapp.com/t/batch-metrics-transformation-for-brace-layers/9575), [Adobe Fontphoria](https://blog.adobe.com/en/publish/2018/12/19/project-fontphoria-previews-a-new-future-for-working-with-type), [Glyphs AI plugin](https://forum.glyphsapp.com/t/ai-font-assistant-plugin-extend-an-existing-font-to-more-glyphs/36563), [Google Fonts Knowledge](https://fonts.google.com/knowledge/glossary/letterform))
- **Steal:** Edit several glyphs in one view. Fontphoria showed "edit one glyph and the style spreads to the rest" back in 2018. Google Fonts Knowledge supplies the anatomy words (bowl, stem, counter).
- **Avoid:** Fontphoria's one-shot generation of every letter, which can take up to an hour of GPU time. The Glyphs plugin's post describes no preview or accept step. FontLab's expert mode toggles are also too much for this audience.
- **Why:** Shows the idea is valid, and where existing tools fall short.

**11. tldraw Make Real** ([Simon Willison](https://simonwillison.net/2023/Nov/16/tldrawdraw-a-ui/))
- **Steal:** The result is placed next to the source rather than replacing it. You correct it by changing the sketch on the canvas and running it again.
- **Avoid:** Overwriting the original.
- **Why:** Correcting by drawing suits a pen-tool app better than typing.

**12. Figma First Draft, Illustrator Generative Recolor and Canva Magic Edit** ([Figma](https://help.figma.com/hc/en-us/articles/23955143044247), [Recolor](https://helpx.adobe.com/illustrator/desktop/use-generative-ai/recolor-artwork-with-generative-recolor.html), [Canva](https://www.canva.com/help/using-magic-edit/))
- **Steal:** Sample-prompt chips, clicking a variant to preview it on the canvas, and "Make changes" with style controls. Canva shows four candidates with an option to generate new ones.
- **Avoid:** Making the prompt the main input. In Noddy the user's pen edit is the prompt.
- **Why:** Shows how to give people starter moves without a blank text box.

## How the flow should work

**NOTICE (without interrupting).**
- Trigger only when the edit has settled: pen released and about 1.5 s idle, or the user switches glyph. Never trigger mid-stroke (pattern 9; HAX G3).
- Show a small pip on the edge of the edited tile or canvas, like the NES gutter arrow. It expands into a chip on hover or Tab and fades if ignored. Each notice is also logged in the agent panel.
- Add a global control (G17): Noticing On / Quiet / Off.
- Skip trivial edits such as a single node nudge under a threshold.

**SHOW what it understood.**
- **Visual diff on the glyph:** the original outline as a grey ghost, with the changed segment in the accent colour (example-based explanation).
- **Plain-language chip** in anatomy words, for example "Curly tail on the stem foot."
- **Confidence by category:** "Pretty sure" or "Best guess." When it's a guess, offer 2–3 alternatives: "Curly tail? Hook? Swash?"
- **Correction:** tap an alternative, edit the chip's text, or circle the right region on the canvas (patterns 11 and 7, G9).
- **Detail on demand:** "What I measured" stays behind a disclosure.

**SCOPE picking.**
- Offer suggested group chips, for example "Stem-foot letters: d h i l m n u", "Bowl family: a d g q", "All lowercase."
- Matches light up in the grid. Click a letter to toggle it; shift-click excludes it (pattern 2).
- Glyphs marked **Yours** appear locked with "Ask first." They are never included by default.
- Keep a running count, for example "7 letters."

**STRENGTH.**
- A segmented control: **Subtle / Same / Wild** (pattern 5).
- Behind it, an Amount slider from 0 to 200% that tweaks the Drafts live without regenerating; Same is 100% (pattern 8).
- **3 variations** per letter. Flip through them with arrow keys, and use "More like this" to get more options (pattern 4).

**PREVIEW before apply.**
- Ghost proposals appear as translucent dashed overlays in the grid tiles and in a specimen line such as "hamburgefontsiv."
- Holding a key toggles Before/After.
- Nothing is written to the font until the user clicks **Spread to 7**.

**APPLY as Drafts.**
- The spread lands as Drafts, each with a badge, plus **Keep** / **Revert** per letter and **Keep all** / **Revert all** (pattern 6).
- The whole spread is **one entry in the shared undo history**, labelled "Spread: curly tail ×7" (G9, pattern 9C).
- Afterwards, offer "Save as Move" so the change can be reused in other fonts (Lightroom presets as precedent).

**Keep it FUN without becoming a toy.**
- **Voice:** a friend who knows type, not a linter.
  - "Ooh, your a grew a curly tail. Want the rest of the gang to match?"
  - For low confidence, be honest in the Quick, Draw! spirit: "No idea what that is, but I'm into it. Spread it anyway?"
- **Micro-delight:** Drafts ripple across the grid one letter at a time. The **Wild** label gives a small wobble. Keep animations small and purposeful, in the spirit of Teenage Engineering's spinning tape-reel screen animation ([Desirability Lab](https://desirabilitylab.com/backfill/backfill-2023-372-teenage-engineering-op-1), [Bizcommunity](https://bizcommunity.ug/Article/196/15/241169.html)).
- **Guardrails:**
  - Never auto-apply.
  - Always show the measurable change.
  - Use real type vocabulary.
  - Keep it to one dial rather than a dozen sliders.
  - No confetti, no flattery like "Brilliant!", and no chatter while the user is drawing.
  - Weird edits are treated as a creative choice to spread, never as an error to fix.