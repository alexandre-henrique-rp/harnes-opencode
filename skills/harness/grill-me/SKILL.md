---
name: grill-me
description: Use this skill when about to make a non-trivial design decision. Switches the agent from executor mode to interrogator mode. Asks one question at a time with a recommended answer. Explores the codebase before asking.
---

# Grill-Me Protocol (v6.5.0)

> Origin: Matt Pocock (`mattpocock/skills`). Adapted for the harness.

## What this skill does

Inverts the normal agent flow. Instead of "user gives plan → agent
executes", the agent switches to **interrogator mode** and asks the
user probing questions until every branch of the decision tree is
resolved. This runs **before** any code is written.

## When to load this skill

Load it when ALL of the following are true:

- The task involves **≥2 design decisions** with multiple valid answers
- The wrong choice would be **expensive to reverse** (architectural, library choice, data model)
- You have **some context already loaded** (AGENTS.md, related code)

**Do NOT load** for:

- Single-step changes (rename a prop, fix a typo)
- Tasks fully specified by SPEC.md with no ambiguity
- Critical hotfixes (urgency > quality)
- Pure mechanical work (run a migration, refactor a loop)

## Directives (in this order)

### 1. Read the user's request

Understand the goal before asking anything.

### 2. Explore the codebase FIRST

Before asking any question, gather evidence by:

- Reading applicable `AGENTS.md` files
- Reading relevant source files (the ones you'll likely touch, plus their neighbors)
- Reading the SPEC.md / PRD.md if they exist
- Checking `package.json` for available libraries
- Checking `.harness/decisions/` for prior decisions on this area

**Rule:** if a question can be answered by exploring the codebase,
explore instead of asking. The user is not your memory.

### 3. Walk the decision tree, one branch at a time

For each open decision:

- Ask **ONE question at a time** (serial dialogue, not a checklist)
- Provide your **recommended answer** with the question
- Wait for the user's response before opening the next branch
- If the answer depends on an upstream decision, resolve that first

**Question format:**

> **Q{n}:** <one specific question>
> **Recommendation:** <your proposed answer + 1-sentence rationale>

### 4. Stopping conditions

Stop asking when ANY of:

- User explicitly says "ok, segue" / "proceed" / "implement now" / "basta"
- You have walked every open branch and have no more questions
- You have asked **8 questions** in this session (hard cap) — at this
  point, **commit to your best recommendation** and proceed
- You encounter a **circular dependency** between decisions — surface it
  to the user explicitly, don't loop

### 5. Persist decisions

After the session, write all decisions to:

```
.harness/decisions/<sprint>-<feature-slug>.md
```

Use the format defined in the `decision-log` skill. The log is read by:

- The `frontend`/`backend` agent during implementation
- The `qa-gate` reviewer
- Future agents in subsequent sprints

## Guardrails against failure modes

| Failure mode | Mitigation |
|---|---|
| Agent asks too many questions | Hard cap at 8 questions; then commit and proceed |
| Agent asks questions the codebase can answer | Directive #2 (explore first) |
| Agent loops on the same decision | If user answered once, move on. Don't re-ask. |
| Agent asks vague "what do you want?" | Each question must be specific + recommend an answer |
| User just wants to ship | Single-step path: "if you say 'skip grill-me', I proceed with my best judgment" |
| Decision lost between turns | Persist to `.harness/decisions/` immediately |

## Output when done

Append to your response:

```json
{
  "grillMeUsed": true,
  "questionsAsked": 4,
  "decisionsPersisted": ".harness/decisions/S01-user-auth-modal.md",
  "readyToImplement": true
}
```

## Minimal example

User says: "create an auth modal".

Agent (you) explores first:
- Reads `src/components/auth/AGENTS.md` → confirms there are no auth components yet
- Reads `src/components/ui/Modal.tsx` → finds a base modal to reuse
- Reads `src/hooks/useAuth.ts` → finds existing auth hook
- Reads `package.json` → sees `next-auth` already installed

Then asks:

> **Q1:** Should this modal support login, signup, and forgot-password, or just login?
> **Recommendation:** start with just login, with signup + forgot-password as tabs inside the same modal. Simpler, no extra routing, and the existing `useAuth()` already exposes all three flows.

User: "just login".

> **Q2:** Centralized modal, or bottom-sheet on mobile?
> **Recommendation:** centralized on desktop, bottom-sheet <768px — consistent with the rest of the app (see `Card.tsx` which already uses this pattern).

User: "ok".

> **Q3:** Which auth provider? I see `useAuth()` wraps next-auth — should I integrate with it or use a custom API?
> **Recommendation:** re-use `useAuth()`. NextAuth is already configured in `pages/api/auth/[...nextauth].ts` and the previous sprint wired up the session. No need to add complexity.

User: "ok, segue".

Agent persists to `.harness/decisions/S01-user-auth-modal.md` and proceeds to implement.
