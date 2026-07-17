---
name: backend-tdd
description: Required protocol for the backend agent. Classic TDD: RED → GREEN → REFACTOR. No compromise.
---

# Backend TDD Protocol (v6.5.0)

## Purpose

Maintain the **test-first discipline** in backend work. Every feature
ships with tests that were written BEFORE the implementation. Coverage
gate is 85% (validated by the `tester` in Phase 5).

## When this skill is active

This skill is **always active** for the `backend` agent.

## The 3-phase protocol

### Phase 1 — RED (write the failing test)

1. Read the requirement + acceptance criteria from SPEC.md
2. **Write the test FIRST** — assert the desired behavior
3. Run the test. It MUST fail or produce a compile error
4. Classify the failure:
   - `expected-behavior-not-implemented` — test correctly fails
   - `test-bug` — test is wrong, fix the test, re-run
5. Report the RED state

```bash
# Run just the new test
npm test -- --testPathPattern=<test-file>

# Expected output: FAIL with assertion error or compile error
```

Commit message:
```bash
git commit -m "test(<sprint>): RED <feature-name> - <expected behavior>"
```

### Phase 2 — GREEN (write minimum impl)

6. Write the **minimum** code to make the test pass
7. Do NOT add extra features, helpers, or optimizations
8. Run the test. It MUST pass
9. Report the GREEN state

```bash
npm test -- --testPathPattern=<test-file>
# Expected output: PASS
```

Commit message:
```bash
git commit -m "feat(<sprint>): GREEN <feature-name>"
```

### Phase 3 — REFACTOR (clean up)

10. Identify duplication, awkward names, missed patterns
11. Apply refactorings (extract method, rename, etc)
12. Re-run **ALL tests in the module** — must all pass
13. Coverage check: `npm run coverage` (≥85%)
14. Report the REFACTOR state

```bash
npm test -- --testPathPattern=<module>
npm run coverage
# Expected: 100% pass, ≥85% coverage
```

Commit message:
```bash
git commit -m "refactor(<sprint>): <feature-name> - <what was cleaned>"
```

## Hard rules

- ❌ NEVER write impl before test. The RED step is sacred.
- ❌ NEVER skip REFACTOR. Dívida técnica cresce exponencialmente.
- ❌ NEVER accept coverage < 85%. The `tester` will block the sprint.
- ❌ NEVER write impl without first making sure the test FAILS.
  If it passes on first try, the test is wrong — fix the test.
- ❌ NEVER mix TDD with exploratory coding. If you're exploring,
  say so explicitly and discard the work before starting TDD.

## Failure classification (RED step)

When the test fails, classify the failure into one of:

| Class | Meaning | Action |
|---|---|---|
| `expected-behavior-not-implemented` | The test correctly identifies missing behavior | Proceed to GREEN |
| `test-bug` | The test is wrong (e.g., wrong assertion) | Fix test, re-run, re-classify |
| `environment-bug` | The test infra is broken (e.g., missing fixture) | Fix infra, re-run |
| `spec-ambiguity` | The test is right but the spec is unclear | Stop, ask user / grill-me |

If `spec-ambiguity`: STOP TDD. Run `skill: grill-me` to clarify before
continuing. Do NOT guess the spec.

## Coverage gate

The `tester` agent validates 85% coverage globally. Per-feature, you
should aim for 100% on the new code. The 85% global gate means
existing low-coverage code won't block — but new code MUST be 100%.

## Commit convention

Every TDD cycle produces 1 commit:

| Step | Commit prefix | Example |
|---|---|---|
| RED | `test(<sprint>):` | `test(S01): RED user-auth - rejects invalid email` |
| GREEN | `feat(<sprint>):` | `feat(S01): GREEN user-auth` |
| REFACTOR | `refactor(<sprint>):` | `refactor(S01): extract validation helper` |

This makes `git log` a literal TDD journal.

## Security checks (mandatory before GREEN)

Before declaring GREEN, the impl must pass:

- [ ] Input validation (Zod / Joi / class-validator)
- [ ] No PII in logs (use `mask()` helper)
- [ ] Rate limiting if endpoint is public
- [ ] Auth check (middleware or guard)
- [ ] No hardcoded secrets (env vars only)
- [ ] LGPD compliance if endpoint touches personal data

Load `skill: security-audit` to get the full checklist.

## Anti-patterns

- ❌ "I'll write the impl first, then the test" (defeats the purpose)
- ❌ "Test is just a sanity check, doesn't need to fail first" (yes it does)
- ❌ "I'll refactor later" (you won't, and the `tester` will block)
- ❌ "Coverage is just a number" (it's the floor, not the ceiling)
- ❌ "I'll skip the security check, it's an internal endpoint"
  (security is not optional, ever)

## Related skills

- `grill-me` — for resolving spec ambiguities
- `security-audit` — mandatory checklist
- `lgpd-compliance` — if endpoint touches PII
- `decision-log` — for persisting design decisions
- `backend-api-design` — for REST contract standards
