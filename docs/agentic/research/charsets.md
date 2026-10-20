## 1. Standard sets: definitions and counts

| Set | What it is | Count |
|---|---|---|
| **Unicode Basic Latin** (U+0000–007F) | ASCII block. 33 controls (U+0000–001F, U+007F DEL). 95 printable characters: U+0020 space plus 94 graphic characters (U+0021–007E). | **95 printable** |
| **Unicode Latin-1 Supplement** (U+0080–00FF) | 32 C1 controls (U+0080–009F), then 96 printable characters U+00A0–00FF. These include NBSP U+00A0, soft hyphen U+00AD, the accented Western European letters, and symbols such as © ® ° × ÷ ¢ £ ¥. | **96 printable** |
| **GF Latin Kernel** | Google Fonts' minimum set. Its definition reads "Support ASCII + necessary punctuation and symbols for English language." It is required even for non-Latin families. | **116 code points** (all 95 ASCII + 21) |
| **GF Latin Core** | "Languages of Europe and the Americas with >5M speakers." It covers 26 languages (ca, cs, cy, da, de, en, es, fi, fr, hr, hu, is, it, lt, lv, mt, nb, nl, pl, pt, ro, sk, sq, sr, sv, tr) and is the minimum for Google Fonts onboarding. | **319 code points / 323 glyphs**. The extra 4 glyphs are .notdef, periodcentered.loclCAT, periodcentered.loclCAT.case and caroncomb.alt. It contains all of Kernel plus 203 more. |
| **Adobe Latin 1** ("ISO-Adobe") | The original Type 1 set plus the euro. Covers the major Western European languages. | **229**: 95 ASCII + 94 Latin-1 Supplement (everything except NBSP and soft hyphen) + 10 from Latin Extended-A + 30 others (ƒ, dashes, quotes, † ‡ ‰ ‹ › ⁄ € ™ −, 8 spacing accents, ﬁ ﬂ) |
| **Windows-1252** | Latin-1 plus 27 extra printable characters in 0x80–9F (€ ‚ „ … † ‡ ‰ Š Œ Ž ' ' " " • – — ˜ ™ š œ ž Ÿ ƒ ˆ ‹ ›). | 95 + 96 + 27 = **218 printable** |
| **MacRoman** | Legacy Mac 8-bit encoding. 128 high characters, including the Apple logo (U+F8FF), ﬁ ﬂ, ∂ ∑ π Ω and similar. | 95 + 128 = **223** |

**Glyphs every font needs regardless of set:**
- `.notdef` at glyph index 0. It is not a Unicode character, and Kernel's list omits it. Noddy's OTF export already creates one automatically from the cap height when `glyph-0x0` is absent (`src/formats_io/otf/font_export.js:120-121`, `:627-640`).
- `space` U+0020 and `nbspace` U+00A0. Both are empty and should have the same width.
- Optional for fonts that render on Windows, not in Kernel: `NULL` U+0000 and `CR` U+000D (both zero-width).

Sources:
- https://www.unicode.org/charts/PDF/U0000.pdf
- https://www.unicode.org/charts/PDF/U0080.pdf
- https://github.com/googlefonts/glyphsets (`Lib/glyphsets/definitions/GF_Latin_Kernel.yaml`, `GF_Latin_Core.yaml`, `data/results/nam/GF_Latin_Kernel.nam`, `GF_Latin_Core.nam`)
- https://github.com/adobe-type-tools/adobe-latin-charsets (`adobe-latin-1.txt`)

## 2. What GF Latin Kernel adds beyond ASCII (21 characters)

| Group | Characters |
|---|---|
| Space | U+00A0 NBSP |
| Currency | ¢ U+00A2 · £ U+00A3 · ¥ U+00A5 · € U+20AC |
| Marks | © U+00A9 · ® U+00AE · ™ U+2122 · ° U+00B0 |
| Math | × U+00D7 · ÷ U+00F7 · − U+2212 (true minus) |
| Punctuation | · U+00B7 · – U+2013 · — U+2014 · ' U+2018 · ' U+2019 · " U+201C · " U+201D · • U+2022 · … U+2026 |

Kernel has no accented letters, no ¡ ¿ « » § ¶, no superscripts or fractions, and no ﬁ/ﬂ ligatures.

## 3. Recommendation for Noddy v1

**Use GF Latin Kernel exactly: 116 encoded characters, plus `.notdef` = 117 glyphs.**

Why this set:
- It is a published, versioned standard with a machine-readable list.
- The `glyphsets` / fontbakery tools can check it, so the agent can verify that the set is complete instead of guessing.
- It matches the user's request ("English plus some symbols") word for word.
- In the UI, call it "**Latin Kernel (English)**". "Basic Latin" is the wrong label because it means only ASCII.

**Full list:**

| Group | Characters | Count |
|---|---|---|
| Uppercase | A B C D E F G H I J K L M N O P Q R S T U V W X Y Z | 26 |
| Lowercase | a b c d e f g h i j k l m n o p q r s t u v w x y z | 26 |
| Figures | 0 1 2 3 4 5 6 7 8 9 | 10 |
| Punctuation | . , : ; ! ? ' " ' ' " " ‐(hyphen-minus) – — … · • ( ) [ ] { } / \ _ | 27 |
| Symbols | # $ % & * + < = > @ ^ \| ~ ` × ÷ − ¢ £ ¥ € © ® ™ ° | 25 |
| Spaces | space, NBSP | 2 |
| Unencoded | .notdef | 1 |
| **Total** | | **116 + 1 = 117** |

**How much actually needs drawing (this sets the agent's budget):**
- 2 glyphs are empty: space and NBSP.
- About 25 can be derived from other glyphs by reuse, component or transform:
  - NBSP = space.
  - ' = ' rotated 180°. " = two of '. " = two of '. " = two of '.
  - : = two periods. ; = period + comma. … = three periods. · and • are scaled periods.
  - Hyphen, en dash, em dash and minus are one bar at different widths. + rotated 45° gives ×. ÷ = minus + 2 dots. = is two bars.
  - > = mirrored <. The closing ) ] } are mirrored openers. \ = mirrored /.
  - ¢ = c + stroke. £ comes from L/f. ¥ = Y + bars. € = C + bars. ® = © with R. ™ = scaled T and M.
- That leaves about 89 glyphs drawn from scratch.

**v2 step-up: GF Latin Core (323 glyphs, 26 languages, the Google Fonts onboarding minimum).** Of the 203 code points it adds:
- **145 are precomposed accented letters.** These should be built as **components**: base letter + mark. Noddy already has `ComponentInstance` (`src/project_data/component_instance.js:15`).
- **26 are marks**: combining marks U+0300–0328 and spacing accents such as ˆ ˇ ˘ ˙ ˚ ˛ ˜ ˝ ¨ ´ ¸ ¯.
- **32 are new drawings**: ¡ § ª « ¶ º » ¿ Æ Ð Ø Þ ß æ ð ø þ Đ đ Ħ ħ ı Ł ł Œ œ ȷ ẞ ‚ „ ‹ ›.

So v2 means about 32 new drawings, about 26 marks, and anchor placement. The other 145 are assembly, which suits an agent well.

An intermediate option is Adobe Latin 1 (229), if Windows-1252 legacy coverage matters. Core is the better target because it is defined per language and has tooling to check it.

## 4. How Noddy defines characters today, and whether the set fits

- **`CharacterRange` is a contiguous `{begin, end, name}` interval only.** See `src/project_data/character_range.js:15-31`. Membership is a simple begin ≤ id ≤ end check (`:124`).
- **Unicode blocks come from a static table.** `src/lib/unicode/unicode_blocks_0_bmp.js:3` defines `'Basic Latin'` as 0x20–0x7F. Note this includes DEL.
- **Basic Latin already gets a hard-coded custom order.** When a range starts at or before 0x21 and ends at 0x7E/0x7F, `generator()` uses `basicLatinOrder` instead of code point order (`character_range.js:85-90`). The order (`:175-271`) is A–Z, a–z, 0–9, punctuation, then space last.
- **New projects default to that range.** `glyphr_studio_project.js:170-171` adds the range for 0x41. `project_editor.js:273-276` special-cases selecting "A" first.
- **Progress counts are per range.** See `updateCharacterRangeCount` / `updateAllCharacterRangeCounts` at `glyphr_studio_project.js:464-483`.
- **The chooser lists ranges, plus Ligatures and Components** (`src/panels/item_chooser.js:99-160`). The range editor and Unicode block picker live in `src/pages/settings_project.js:505`, `:763-792`.
- **The agent tools don't use ranges.** Only `create_glyph`, which is planned but not built yet, refers to a "requested character set" (`docs/agent/build-catalog.py:29`).

**Verdict: Kernel does not map onto an existing range, so Noddy needs a new `CharacterSet` concept.** Kernel is not contiguous. It touches 6 Unicode blocks:
- Basic Latin (`:3`)
- Latin-1 Supplement (`:5`)
- General Punctuation (`:83`)
- Currency Symbols (`:85`)
- Letterlike Symbols (`:91`)
- Mathematical Operators (`:94`)

Built from those blocks, the chooser would show **683 cells for 116 wanted characters**. That breaks the "bounded" goal for both the user and the agent.

What the `CharacterSet` needs:
- An explicit, ordered list of code points plus unencoded glyph names (`.notdef`, later `.case` alternates).
- A source ID and version, for example `GF_Latin_Kernel@glyphsets x.y`.
- Grouping for the UI: uppercase, lowercase, figures, punctuation, symbols, spaces.
- A per-glyph status (empty, drafted, reviewed, locked).

`basicLatinOrder` already shows the codebase wants curated ordering. A set generalizes it. Keep `CharacterRange` for import/export compatibility, and have the chooser, progress counts and agent scope read from the active set.

## 5. Drawing order (drives the agent plan)

0. **Metrics first.** Set UPM, x-height, cap height, ascender, descender and overshoot (about 1–1.5% of UPM). Every later glyph depends on these vertical numbers.
1. **n, o.** These are the lowercase controls: n sets stem weight, arch and straight sidebearings; o sets curve weight, contrast and round sidebearings plus overshoot.
2. **h m u l i j r** (straight/arch family). Each is a direct reuse of n's stem and arch, which locks the vertical rhythm early.
3. **b d p q c e** (bowl family). These combine o's bowl with n's stem; e and c test the openness of apertures.
4. **a g s f t** (unique lowercase). They are the hardest and most expressive, and they need settled weight and proportions first.
5. **v w y x k z** (diagonals). Diagonal stems need optical thinning and their own spacing logic, so do them as a batch.
6. **Spacing proof of the lowercase**, using strings like `nnonnoo`, `hamburgefontsiv`. Catches rhythm errors before the capitals copy them.
7. **H, O.** These are the uppercase controls: cap stem (heavier than the lowercase stem), cap round, and cap sidebearings.
8. **I L E F T** (straight caps). These derive from H's stem and set the crossbar height and thickness.
9. **C G D Q** (round caps). These derive from O; Q's tail is a style signature.
10. **B P R J U S** (mixed caps). Bowls plus stems. S is the hardest curve and should come after O, C and G.
11. **V A W X Y K N M Z** (diagonal caps). These reuse the diagonal weights from v/w and need apex overshoot.
12. **Figures 0 1 then 2–9.** 0 derives from O/o proportions. Make all figures one width (tabular) so they align in tables.
13. **Core punctuation: . , ' ! ? : ;** The period's dot size comes from i/j. The comma and right quote share a shape. Everything after this point reuses them.
14. **Derived punctuation: quotes, " ' " ", …, ·, •, hyphen, en dash, em dash.** These are transforms and copies of step 13, so they are cheap for the agent.
15. **Brackets and slashes: ( ) [ ] { } / \ _ |.** Set the height to cap height plus descender. The closing forms are mirrors.
16. **Math: + − × ÷ = < > ~ ^.** Center them on the figure height with one shared bar weight and width.
17. **Symbols: # $ % & @ * ` ° © ® ™ ¢ £ ¥ €.** Each is built from finished letters and figures (S, c, L, Y, C, 0/o, R, T, M, a). & and @ are the hardest.
18. **space, NBSP, .notdef.** The space width is about the n counter or about ¼ em; NBSP is the same width.
19. **Global spacing pass, then a basic kerning pass** (pairs such as T, V, W, Y against o, e, a, period and comma). Spacing is only reliable once every glyph exists.