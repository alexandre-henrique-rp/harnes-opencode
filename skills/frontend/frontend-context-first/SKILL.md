---
name: frontend-context-first
description: Required protocol for the frontend agent. Defines the context-first flow: read AGENTS.md, run grill-me, then implement. No proactive test writing.
---

# Frontend Context-First Protocol (v6.5.0)

## Purpose

Eliminate the **test-first anti-pattern** in frontend work, which
wastes tokens on speculative UI tests and produces worse implementation
results. Replace it with **context-first**: read the local map, run
grill-me, then implement.

## When this skill is active

This skill is **always active** for the `frontend` agent. It is loaded
on demand at the start of every frontend task via:

```
skill({ name: "frontend-context-first" })
```

## The 5-step protocol

### Step 1 — Read context (mandatory)

Read ALL applicable `AGENTS.md` files:

- Root `AGENTS.md` (always)
- `<target-folder>/AGENTS.md` for each folder you'll touch
- Ancestor folders up to the root
- Adjacent folders if the change has cross-cutting impact

Use `glob` to locate them, then `read` to load each.

**If any required `AGENTS.md` is missing**, ABORT and report:

```json
{
  "blocker": true,
  "missingAgMd": ["src/components/auth/AGENTS.md"],
  "reason": "Cannot implement without local context map"
}
```

The orchestrator will invoke `documenter` and re-dispatch.

### Step 2 — Load style guide (if it exists)

```
skill({ name: "frontend-style-guide" })
```

This adds project-specific visual rules (design tokens, forbidden patterns).

### Step 3 — Run grill-me (if applicable)

**Run grill-me if the feature has ≥2 design decisions open.**

Load:

```
skill({ name: "grill-me" })
```

Follow the grill-me protocol. At the end, the decisions are persisted
to `.harness/decisions/<sprint>-<feature>.md`.

**Skip grill-me if** the task is:
- A single-step change with no design decisions
- Fully specified by SPEC.md + design.md (no ambiguity)
- A critical hotfix

### Step 4 — Build the implementation brief

Compose (in your scratchpad, not committed):

```markdown
## Brief — <feature>

**Requirement:** <from sprint/SPEC>
**Grill-me decisions:** <summary or "skipped — no open decisions">
**Local patterns (from AGENTS.md):**
- <convention 1>
- <convention 2>
**Reusable components identified:**
- `<path>` — <why it fits>
**Design tokens to use:**
- `<token>` — <where it applies>
**Risks / open issues:**
- <list>
```

### Step 5 — Implement, self-check, return

1. Edit only files in your paths allowlist (denied: `*.test.*`, `*.spec.*`, `tests/**`, `e2e/**`, `qa/**`)
2. **Do NOT write tests proactively.** If a piece of logic is non-trivial
   and isolated, ASK the user (default answer: "no, skip the test").
3. Run self-check: `npm run lint && npm run typecheck && npm run build`
4. Return the JSON contract (see `agents/frontend.md` §8)

## Test policy (explicit)

| Code type | Test policy |
|---|---|
| Pure UI component (Button, Card, Modal) | **No test generated** |
| Component with isolated complex logic (validator, parser, state machine) | Ask user first; default NO |
| Hook with side effects (useAuth, useFetch) | Ask user; default NO unless reused in >3 places |
| Utility function (formatters, calculations) | Optional unit test IF user approves |
| Integration with backend | Hand off to backend agent — out of scope for frontend |

The `tester` agent (Phase 5) covers E2E with 85% coverage gate.
Frontend tests are **supplementary**, not required.

## Why this protocol exists

The old TDD-on-frontend approach:

- Wastes 30-50% of tokens writing tests that will be rewritten
- Produces tests that don't survive the first refactor of UI
- Gives false confidence (UI tests are flaky)
- Slows down the human-visible iteration loop

The context-first approach:

- Uses the local `AGENTS.md` map as the "spec" (cheaper, always current)
- Uses grill-me to resolve ambiguity before code is written
- Defers quality gate to the `tester` (who is purpose-built for E2E)
- Produces implementations that match existing patterns

## Anti-patterns

- ❌ Skipping the `AGENTS.md` read because "I know the project"
- ❌ Skipping grill-me because the task "seems simple"
- ❌ Writing a test "just in case" without asking
- ❌ Copy-pasting code from other components without reading their AGENTS.md
- ❌ Hardcoding values that exist as design tokens

## Related skills

- `grill-me` — for resolving open design decisions
- `frontend-style-guide` — for visual rules
- `docs-curator` — for creating new AGENTS.md when needed
- `decision-log` — for persisting grill-me decisions
