---
name: frontend-style-guide
description: Project-specific visual rules, design tokens, and forbidden patterns. Loaded by frontend agent when a project has a defined style system.
---

# Frontend Style Guide (v6.5.0)

> ⚠️ This skill is a **template**. Each project should fork this file
> and customize the "Project-specific rules" section to match their
> design system.

## When this skill is active

Loaded by the `frontend` agent **after** reading `AGENTS.md`, if the
project has a design system. If the project doesn't have one, this
skill stays inactive and the agent falls back to the design system
discovered in code.

## Universal rules (apply to all projects)

### Component structure

- **Functional components only** (never class components)
- Use TypeScript, never plain JS
- Props interface named `<ComponentName>Props`
- Export component as default export, props interface as named export
- Co-locate: `Button.tsx`, `Button.stories.tsx`, `Button.module.css`
  (if CSS modules) in the same folder

### Naming

- Components: `PascalCase.tsx`
- Hooks: `useCamelCase.ts`
- Utils: `camelCase.ts`
- Types: `PascalCase` (no `I` prefix)
- Constants: `UPPER_SNAKE_CASE` (only for true constants, not config)
- Boolean props: prefix with `is`, `has`, `should` (`isLoading`, `hasError`)

### File organization

```
src/components/<domain>/
  ├── <ComponentName>.tsx
  ├── <ComponentName>.stories.tsx    (if Storybook)
  ├── <ComponentName>.module.css     (if CSS modules)
  ├── index.ts                       (barrel export)
  └── AGENTS.md                      (folder context map)
```

### Import order (enforced by ESLint)

1. External packages (`react`, `next`, etc)
2. Internal absolute (`@/components/...`, `@/lib/...`)
3. Relative (`./`, `../`)
4. Type-only imports (`import type`)

Empty line between each group.

### Tokens, NEVER hardcodes

| Use | NEVER |
|---|---|
| `var(--color-primary)` | `'#3b82f6'` |
| `theme.spacing.md` | `'16px'` |
| `theme.font.body` | `'14px Inter'` |
| `theme.radius.sm` | `'4px'` |

If you need a value not in the token system, **add it to the design
system first** (create a PR for `theme/tokens.ts`) before using it.

### Accessibility (WCAG 2.1 AA minimum)

- All interactive elements have `aria-label` if not textually labeled
- Color contrast ≥ 4.5:1 for text
- Focus rings visible (`:focus-visible`)
- Keyboard navigation works (Tab, Enter, Esc, Arrow keys as appropriate)
- Form fields have associated `<label>` (not just placeholder)
- `prefers-reduced-motion` respected for animations

### Responsiveness

- Mobile-first CSS
- Breakpoints (default, override in project tokens):
  - `sm`: 640px
  - `md`: 768px
  - `lg`: 1024px
  - `xl`: 1280px
  - `2xl`: 1536px
- Use CSS Grid or Flexbox, avoid `float` and absolute positioning for layout
- Test at 360px, 768px, 1024px, 1440px

## Project-specific rules

> The project should fork this section and customize.

### Stack (default — override per project)

- **Framework:** Next.js 14+ (App Router)
- **Styling:** Tailwind CSS 3+
- **Component library:** shadcn/ui (Radix primitives)
- **State:** React Query (server) + Zustand (client)
- **Forms:** react-hook-form + Zod
- **Icons:** lucide-react
- **Animation:** Framer Motion (only for orchestration, not micro-interactions)

### Color tokens (default palette)

```css
--color-primary: #3b82f6;     /* blue-500 */
--color-secondary: #64748b;   /* slate-500 */
--color-success: #10b981;     /* emerald-500 */
--color-warning: #f59e0b;     /* amber-500 */
--color-danger: #ef4444;      /* red-500 */
--color-bg: #ffffff;
--color-fg: #0f172a;          /* slate-900 */
```

### Spacing scale (4px base)

```
0 → 0
1 → 4px
2 → 8px
3 → 12px
4 → 16px
6 → 24px
8 → 32px
12 → 48px
16 → 64px
```

### Typography

```
display: 3rem / 1.2 / 700
h1: 2.25rem / 1.3 / 700
h2: 1.875rem / 1.4 / 600
h3: 1.5rem / 1.4 / 600
h4: 1.25rem / 1.5 / 600
body: 1rem / 1.6 / 400
small: 0.875rem / 1.5 / 400
caption: 0.75rem / 1.4 / 500
```

### Forbidden patterns

- ❌ `any` type (use `unknown` if forced, then narrow)
- ❌ `// @ts-ignore` (use `// @ts-expect-error` with explanation)
- ❌ Inline styles (except dynamic values from JS)
- ❌ `<div>` for buttons (use `<button>`)
- ❌ `<a>` for actions (use `<button>`)
- ❌ `useEffect` for derived state (compute in render)
- ❌ Prop drilling >2 levels (use context or composition)
- ❌ `console.log` left in code (use logger or remove)
- ❌ Unused imports / variables (ESLint will catch)

### Required patterns

- ✅ All async operations show loading state
- ✅ All async operations handle error state
- ✅ All forms have client-side validation (Zod)
- ✅ All destructive actions have confirmation
- ✅ All list views have empty state
- ✅ All data fetching has stale-while-revalidate

## How to fork this skill for your project

1. Copy this file to `.opencode/skills/frontend-style-guide/SKILL.md`
2. Override the "Project-specific rules" section
3. Update `description` in the frontmatter to mention the framework
4. Commit as part of the project's documentation

The `frontend` agent will load the project-local version instead of
the global one.
