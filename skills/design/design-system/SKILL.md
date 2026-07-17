---
name: design-system
description: Design tokens, component inventory, and visual rules. Loaded on demand by frontend and designer agents.
---

# Design System Skill (v6.5.0)

> ⚠️ This is a **reference** skill. Most projects don't need to
> override it — the project's own design system files (e.g.,
> `src/lib/design/tokens.ts`) are the source of truth. This skill
> teaches the agent **how to read and use** whatever design system
> the project has.

## Purpose

Help the agent:

1. **Locate** the design tokens file in the project
2. **Read** the tokens correctly
3. **Use** tokens instead of hardcoded values
4. **Detect** missing tokens and propose additions

## How to find the design system

Common locations, in order of likelihood:

```
src/lib/design/tokens.ts          ← most common
src/styles/tokens.ts
src/theme/tokens.ts
src/design-system/tokens.ts
tailwind.config.ts                ← if Tailwind, tokens may live here
styles/globals.css                ← CSS custom properties
```

Use `glob: "**/tokens.{ts,js,css}"` or `glob: "**/theme.{ts,js}"` to find it.

## Token categories

| Category | Examples | Why it matters |
|---|---|---|
| Color | `primary`, `secondary`, `success`, `danger`, `bg`, `fg` | Visual identity, accessibility |
| Spacing | `xs`, `sm`, `md`, `lg`, `xl` (4px or 8px base) | Layout rhythm |
| Typography | `fontFamily`, `fontSize`, `fontWeight`, `lineHeight` | Readability, hierarchy |
| Radius | `sm`, `md`, `lg`, `full` | Visual softness |
| Shadow | `sm`, `md`, `lg` | Elevation |
| Z-index | `dropdown`, `modal`, `tooltip` | Stacking |
| Breakpoints | `sm`, `md`, `lg`, `xl` | Responsiveness |
| Motion | `fast`, `normal`, `slow` (durations) | Animation feel |

## How to use tokens (correctly)

### ❌ Bad: hardcoded values

```tsx
<div style={{ padding: '16px', color: '#3b82f6', borderRadius: '8px' }}>
```

### ✅ Good: tokens

```tsx
<div className="p-4 text-primary rounded-md">
  {/* or */}
</div>
```

```css
/* If using CSS variables: */
.card {
  padding: var(--space-md);
  color: var(--color-primary);
  border-radius: var(--radius-md);
}
```

```tsx
/* If using JS theme: */
import { theme } from '@/lib/design/tokens';
<div style={{ padding: theme.spacing.md, color: theme.color.primary }}>
```

## Detecting missing tokens

When you need a value that isn't in the token system:

1. **Search** the codebase for similar uses (`grep`)
2. If the value is used 3+ times in different places without a token,
   **it's a missing token** — propose adding it
3. Create a PR for `tokens.ts` with the new token
4. Use the token in your implementation
5. Migrate the existing 3+ hardcodes in a follow-up

**Don't** add the hardcode in your code with a "TODO: tokenize" — that's
dívida técnica que ninguém vai pagar.

## Forbidden patterns (when working with design system)

- ❌ New color value not in the palette
- ❌ Magic numbers for spacing (always use scale)
- ❌ Inconsistent radius (mixing 4px and 8px in same context)
- ❌ Animations > 300ms without user-initiated reason
- ❌ Custom fonts not in the typography scale
- ❌ Z-index values outside the standard scale (e.g., `z-index: 99999`)

## Related skills

- `frontend-style-guide` — broader rules (components, accessibility, etc)
- `frontend-context-first` — uses this skill during implementation
