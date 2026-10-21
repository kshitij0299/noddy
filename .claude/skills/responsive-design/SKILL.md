---
name: responsive-design
description: Implement modern responsive layouts using container queries, fluid typography, CSS Grid, and mobile-first breakpoint strategies. Use when building adaptive interfaces, implementing fluid layouts, or creating component-level responsive behavior.
---

# Responsive Design

Master modern responsive design techniques to create interfaces that adapt seamlessly across all screen sizes and device contexts.

## When to Use This Skill

- Implementing mobile-first responsive layouts
- Using container queries for component-based responsiveness
- Creating fluid typography and spacing scales
- Building complex layouts with CSS Grid and Flexbox
- Designing breakpoint strategies for design systems
- Implementing responsive images and media
- Creating adaptive navigation patterns
- Building responsive tables and data displays

## Detailed patterns and worked examples

Detailed pattern documentation lives in `references/details.md`. Read that file when the navigation tier above is insufficient.

## Best Practices

1. **Mobile-First**: Start with mobile styles, enhance for larger screens
2. **Content Breakpoints**: Set breakpoints based on content, not devices
3. **Fluid Over Fixed**: Use fluid values for typography and spacing
4. **Container Queries**: Use for component-level responsiveness
5. **Test Real Devices**: Simulators don't catch all issues
6. **Performance**: Optimize images, lazy load off-screen content
7. **Touch Targets**: Maintain 44x44px minimum on mobile
8. **Logical Properties**: Use inline/block for internationalization

## Common Issues

- **Horizontal Overflow**: Content breaking out of viewport
- **Fixed Widths**: Using px instead of relative units
- **Viewport Height**: 100vh issues on mobile browsers
- **Font Size**: Text too small on mobile
- **Touch Targets**: Buttons too small to tap accurately
- **Aspect Ratio**: Images squishing or stretching
- **Z-Index Stacking**: Overlays breaking on different screens


---

## Noddy addendum (read this before applying the skill here)

This skill is vendored for the Noddy font editor (see `docs/agentic/PRODUCT.md`, `docs/agentic/UI-RESET.md`). Where the skill and Noddy disagree, Noddy wins:

- **Source of truth:** the Figma screens (`docs/agentic/figma/screens/`) and `PRODUCT.md`. The skill is a method, not a direction: never change the product look (Google Sans Flex, ROND 60 headings, peach/brown tokens, outlined Material Symbols Rounded).
- **Colour and spacing only from tokens** in `src/common/colors.css` (`--color-*`, `--space-*`, `--radius-*`, `--shadow-*`). The skill's own palettes, `tokens.css`, `base.css` or `app.css` are reference material, never copied into the repo.
- **Still banned by AGENTS.md section 1 and 3b:** the old-branch layout grids and breakpoints, drawer transforms, `overflow-x: clip`, `scrollbar-gutter`, `contain: layout`, dot-grid or glow wrappers. No new runtime dependency. Never touch protected areas (AGENTS.md section 3).
- **The font is the hero.** Chrome never covers rendered glyphs; controls sit in their own rows. Every control must have a reason to exist. Minimal text.
- **Browser checks** use the in-app browser (local session) or the Playwright helper in `docs/agentic/ENVIRONMENT.md`. Do not run this skill's own scripts; they are kept only so the text stays complete.
