# Design ↔ Code

## Overview

pen.dev enables a **two-way workflow** between design and code:
- **Design → Code:** Generate components from pen.dev designs
- **Code → Design:** Import existing code into pen.dev

## Design → Code Workflow

### Basic Export to Code

1. **Design in pen.dev** - Design your screens, layouts or individual UI components on the canvas
2. **Save the `.pen` file** in your project workspace
3. **Open AI chat** - Press `Cmd/Ctrl + K`
4. **Ask pen.dev to generate code**

### Example Prompts

**Component generation**
```
Create a React component for this button
```
```
Generate TypeScript types for this form
```
```
Export this card as a reusable component
```

**Full pages**
```
Generate a Next.js page from this design
```
```
Create a landing page component with Tailwind CSS
```
```
Export this dashboard as a React component
```

**With specific libraries**
```
Generate code using Shadcn UI components
```
```
Create this form using React Hook Form
```
```
Export using Lucide icons instead of Material Icons
```

---

## Code → Design Workflow

### Importing Existing Code

If you have existing components in your codebase, pen.dev can recreate them visually.

**Requirements:**
- Keep the `.pen` file in the same workspace as your code
- The AI agent can access both files

**Workflow:**

1. **Open your `.pen` file**
2. **Open AI chat** - Press `Cmd/Ctrl + K`
3. **Ask to import code**

### Example Prompts

```
Recreate the Button component from src/components/Button.tsx
```
```
Import the LoginForm from my codebase into this design
```
```
Add the Header component from src/layouts/Header.tsx
```

**What gets imported:**
- Component structure and hierarchy
- Layout and positioning
- Styling (colors, typography, spacing)

---

## Two-Way Sync

### Keeping Design and Code in Sync

The most powerful workflow combines both directions:

1. **Start with code** - Import existing components into pen.dev
2. **Design improvements** - Make visual changes in pen.dev
3. **Update code** - Ask AI to apply changes back to code
4. **Iterate** - Repeat as needed

---

## Variables & Design Tokens

### CSS Variables ↔ pen.dev Variables

Create a synchronized design token system:

**Import CSS to pen.dev:**
1. Have a `globals.css` or similar file with CSS variables
2. Ask the agent:

```
Create pen.dev variables from my globals.css
```
```
Import design tokens from src/styles/tokens.css
```

**Export pen.dev to CSS:**
1. Define variables in pen.dev
2. Ask the agent:

```
Update globals.css with these pen.dev variables
```
```
Sync these design tokens to my CSS
```

---

## Best Practices

### File Organization

**Keep .pen files in your repo:**
```
my-project/
├── src/
│   ├── components/
│   └── styles/
├── design.pen           ← Design file
└── package.json
```

**Benefits:**
- AI agent can see both design and code
- Version control tracks both together
- Easy to keep in sync

### Workflow Recommendations

**Start new features:**
1. Design in pen.dev first
2. Generate initial code
3. Refine code implementation
4. Update design if needed

**Update existing features:**
1. Import component into pen.dev
2. Make design changes
3. Sync changes back to code

**Design system maintenance:**
1. Define variables in pen.dev
2. Sync to CSS
3. Use variables in both design and code
4. Update once, apply everywhere

---

## Popular Stacks & Libraries

pen.dev is not limited to a specific framework — you can ask the AI to generate code for any stack. Here are some commonly used options:

**Frameworks:**
- React (JavaScript or TypeScript), Next.js, Vue, Svelte, plain HTML/CSS

**Styling:**
- Tailwind CSS, CSS Modules, Styled Components, plain CSS

**Component Libraries:**
- shadcn/ui, Radix UI, Chakra UI, Material UI, or your own custom components

### Specifying Your Stack

Mention your preferred technologies in the prompt so the AI generates code that fits your project:

```
Generate Next.js 14 code with Tailwind CSS
```
```
Create a Vue component using TypeScript
```
```
Use shadcn/ui components for this layout
```

---

## Icon Libraries

### Built-in vs Code Libraries

**In pen.dev:**
- pen.dev includes the following built-in icon libraries: Material Symbols (Outlined, Rounded, Sharp), Lucide Icons, Feather, and Phosphor.
- You can also import your own SVG icons the same way as individual images.

**For code generation:**
- Specify your preferred library in prompts
- Common options: Lucide, Heroicons, FontAwesome, React Icons

**Example:**
```
Generate this design using Lucide icons
```
```
Replace Material Icons with Heroicons in the code
```