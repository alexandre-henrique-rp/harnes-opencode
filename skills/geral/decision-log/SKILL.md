---
name: decision-log
description: Persist grill-me and architectural decisions to durable file in ADR format. Future agents read this to understand rationale.
---

# Decision Log — ADR Format (v6.5.0)

## Purpose

Capture **non-trivial decisions** made during grill-me sessions or
implementation in a durable, queryable format. Future agents (in
later sprints, or after context loss) can read the log to understand
**why** a choice was made, not just **what** was chosen.

This follows the **Architecture Decision Record (ADR)** convention from
the software industry.

## When to write

Write a decision log when ANY of:

- ✅ A grill-me session resolved ≥2 open design questions
- ✅ A library was introduced or replaced
- ✅ A state management approach was chosen
- ✅ An API contract was defined
- ✅ A data model / schema was designed
- ✅ A test strategy was changed

Do NOT write for:

- ❌ Single-line code changes
- ❌ Routine refactors
- ❌ Trivial bug fixes

## File location

```
.harness/decisions/<sprint>-<feature-slug>.md
```

Examples:

```
.harness/decisions/S01-user-auth-modal.md
.harness/decisions/S02-payment-provider-integration.md
.harness/decisions/S03-state-management-react-query.md
```

## Format (mandatory)

```markdown
# ADR-<NNN>: <decision title>

> **Status:** Accepted | Superseded | Deprecated
> **Date:** YYYY-MM-DD
> **Sprint:** S01
> **Deciders:** <agent or human names>

## Context

<1-3 paragraphs describing the situation. What was the problem? What
constraints existed? What forces were at play?>

## Decision

<1-2 paragraphs stating the decision clearly. Use present tense:
"We will...">

## Alternatives considered

### Option A: <name>
- **Pro:** <benefit>
- **Con:** <drawback>
- **Rejected because:** <reason>

### Option B: <name>
- **Pro:** <benefit>
- **Con:** <drawback>
- **Rejected because:** <reason>

## Consequences

### Positive
- <benefit 1>
- <benefit 2>

### Negative
- <trade-off 1>
- <trade-off 2>

### Neutral
- <side-effect that is neither good nor bad>

## Implementation notes

- <file paths affected>
- <migration steps if any>
- <rollback plan>

## Source

- **Grill-me session:** <date> (<n> questions, persisted in <session-id>)
- **User input:** <direct quote or "no user input">
- **Related ADRs:** <links>
```

## Numbering

ADRs are numbered sequentially per project, NOT per sprint. The
`<sprint>` prefix in the filename is for grouping; the `ADR-NNN` is
for ordering.

```bash
# To find the next ADR number:
ls .harness/decisions/ | grep -oE 'ADR-[0-9]+' | sort -t- -k2 -n | tail -1
```

If none exist, start at `ADR-001`.

## Status lifecycle

```
Proposed → Accepted → (Superseded | Deprecated)
```

- **Proposed** — written, not yet implemented
- **Accepted** — implementation in progress or complete
- **Superseded** — replaced by a later ADR (link to the new one)
- **Deprecated** — no longer applies (project no longer uses this)

## Examples

### Good ADR (concise)

```markdown
# ADR-007: Reuse useAuth hook for the auth modal

> **Status:** Accepted
> **Date:** 2026-07-17
> **Sprint:** S01
> **Deciders:** frontend agent + product owner

## Context

The auth modal needs to support login. We already have a `useAuth()`
hook (from sprint S00) that wraps next-auth. We could either reuse it
or build a new auth integration.

## Decision

We will reuse `useAuth()` as-is. The modal will consume the hook
directly and call its `signIn()` method.

## Alternatives considered

### Option A: Build new auth integration with custom API
- **Pro:** more control over the auth flow
- **Con:** duplicates work, breaks the "single source of truth" for auth
- **Rejected because:** we already have working auth, and consistency matters more than control

## Consequences

### Positive
- Faster implementation (no new auth code)
- Consistency with rest of the app
- One place to fix auth bugs

### Negative
- Tied to next-auth (can't easily swap providers without refactoring)

## Implementation notes

- Affected: `src/components/auth/AuthModal.tsx`, `src/hooks/useAuth.ts` (read-only)
- No migration needed
- Rollback: revert the modal to use local state

## Source

- **Grill-me session:** 2026-07-17 (3 questions)
- **User input:** "ok, segue" after Q3
- **Related ADRs:** ADR-002 (useAuth hook design)
```

### Bad ADR (don't write this)

```markdown
# Decisions for AuthModal

We decided to use useAuth and Modal. The user said it's fine. Done.
```

Why it's bad:
- No context (why was the decision needed?)
- No alternatives (what was rejected?)
- No consequences (what are the trade-offs?)
- No ADR number
- No status

## How agents use this

- **`frontend`/`backend` during implementation**: read decisions for the
  current sprint before starting work
- **`qa-gate`**: checks that implementation matches the decisions
- **`code-reviewer`**: validates that code aligns with documented rationale
- **Future sprints**: when refactoring, check if the decision is still valid

## Anti-patterns

- ❌ Writing an ADR with no context section
- ❌ "We'll see" / "TBD" in the Decision section
- ❌ Missing alternatives (every decision has at least one rejected option)
- ❌ Missing consequences (what did we give up?)
- ❌ Not updating status when the decision is superseded
- ❌ Writing an ADR for trivial changes (every renamed variable ≠ ADR)
