# Backlog: neutral (grey) theme with peach as a spot colour

Status: idea, not started. Raised by the owner on 2026-11-25.

## The ask

The app is too orange right now. The owner wants to see a black-and-white version:
greys, off-white surfaces and off-grey buttons, with the brand peach showing up only
in a few places. This is for later, after the control swaps.

## What it would mean

- **Surfaces and text:** move from the warm scale toward a near-neutral grey scale
  (keep a slight warm bias so it does not look like a default grey).
- **Controls:** selected, checked and filled states use near-black / dark grey, not peach.
  Hover and pressed stay grey steps.
- **Peach stays for:** the logo, the primary action on a screen (one per screen), the
  agent's own marks (Draft status, agent activity), and focus rings if contrast allows.
- **Peach goes from:** panel headers (the big orange PANEL bar), checkboxes, slider
  tracks, selected tool buttons, toggles, the "Recommended" card fill.

## Why it should be cheap

Colours already run through tokens in `src/common/colors.css`, and state colours through
`--state-*` in `src/common/interaction.css` (PR 133). Most of this is re-pointing tokens:
`--color-bg-accent`, `--color-bg-accent-subtle`, `--state-accent-*`, `--primary`.
The places that hard-code peach are the real work; grep for `peach-` outside `colors.css`.

## Preview

The control-swaps page has a "Grey, less orange" switch that shows the new controls with a
near-black accent: https://claude.ai/artifact/16HBGVxtWM8M21RamdVwg6 (private to the owner).

## Open questions for the owner

1. Is peach the focus ring colour, or does that go dark too?
2. Does dark mode get the same treatment (light grey accent on dark)?
3. Ship it as the only theme, or as a choice next to the current peach one?

## Notes

- Figma is the design source (`docs/agentic/FIGMA.md`), so the tokens change there first
  or get logged in `docs/agentic/figma/CHANGES.md`.
- Do this after the control swaps, so the new controls are themed once, not twice.
