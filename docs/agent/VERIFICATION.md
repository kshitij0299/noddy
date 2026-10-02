# Revised proposal verification

2 October 2026. This packet covers research, planning and editable Figma concepts, not application implementation.

- Existing checkout matched `https://github.com/kshitij0299/noddy.git` through the `noddy` remote. An existing-repository fetch updated `noddy/main`; no clone, pull or merge was performed.
- Planning worktree: `noddy-agent-plan`; branch: `codex/native-agent-plan`; base: `f2bb1bc9302bb9e7566155bab0fa8ff2fd354f3e` from Noddy main. Original checkout branch and source were preserved.
- Ran the original checkout's existing Vite executable on temporary port 5187 without installation or source changes. Inspected the welcome New/Examples tabs, Oblegg overview, and Characters / Latin Small Letter N / Attributes.
- Native numeric-control experiment: right bearing 40 → 60 caused advance 1088 → 1108. Restored right bearing 40 and observed advance 1088. This verifies that one native parameter operation, not an agent implementation.
- Undo was explored through UI automation but was not conclusively verified end to end. Agent transaction/history integration remains proposed and must be tested during implementation.
- A native read-only audit examined domain objects, locks, geometry, component dependencies, history and font I/O. Findings are in SOURCE-AUDIT.md. No source was sent to OpenCode; the earlier connectivity-only pilot read no repository files.
- Replaced the rejected Figma redesign and separate review/architecture frames. The current page contains two additive concepts: New-tab action and existing-editor placement with a small Agent window. Some existing action icons are represented by labels solely as context.
- Figma nodes: welcome `12:18`, editor `12:40`, Agent window `12:297`, page `3:2`. Two composition screenshots inspected, then the transform-origin text wrapping and welcome whitespace corrected and checked again.
- Figma output is editable text, frames, button instances and vector paths. No complete-UI raster is present. Product UI fonts checked: Google Sans Flex and Google Sans Code. Oblegg glyph outline comes from shipped sample data.
- Proposed catalogue contains 11 unique tools; only get_context, read_glyphs and set_spacing belong in the first implementation slice. JSON parsing, unique names, required root properties and strict root object schemas checked. Construction-script JavaScript syntax checked.
- Application source/protected files touched: none. Lint, application tests, production build, provider calls, agent execution, responsive behavior and export round trips were not run for this planning-only change. No production-readiness claim.

Changed artifacts: PLAN.md, SOURCE-AUDIT.md, tool-catalog.json and generator, this verification record, and Figma source/state under design/figma/native-agent-plan/. No app framework, serialization, shortcuts, canvas or history behavior changed.
