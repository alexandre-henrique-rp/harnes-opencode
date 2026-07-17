---
name: qa-e2e
description: How the tester agent operates. Reference for orchestrator and reviewer agents.
---

# QA E2E Reference (v6.5.0)

## Purpose

This skill is a **reference** for how the `tester` agent operates in
Phase 5. It exists so other agents (orchestrator, qa-gate, reviewers)
can understand the tester's outputs and the gates it enforces.

The `tester` agent itself does not need to load this skill — its
behavior is defined in `agents/tester.md`.

## What the tester does

The tester runs **AFTER** the build phase, in **Phase 5**. It does not
do TDD. It does post-implementation quality assurance.

### Steps

1. **Derive test chains** from:
   - `.harness/sprints/cross-sprint.json → flows[]` (cross-sprint flows)
   - `SPEC.md → User Stories & Acceptance Criteria` (per-feature)
   - **Auto-derivation:** CRUD lifecycle for each new module (POST → GET → PUT → DELETE → verify 404)

2. **Compile chains to code** via `test_codegen` tool

3. **Run chains** via `playwright_runner` (or equivalent)

4. **Measure coverage** via `coverage_analyzer` (≥85% required)

5. **Report** results to `qa-gate`

## Test scope

The tester is **the only agent** that writes:

- `qa/<sprint>/e2e-chains.json` (declarative test specs)
- `tests/**` (compiled test code)
- `e2e/**` (Playwright/Cypress files)
- `playwright/**` (config)

Other agents (frontend, backend) should NOT touch these paths. The
`path-boundary` plugin enforces this in v6.5.0.

## TDD vs Post-Implementation Testing

The harness is **deliberately not TDD** in the classic sense:

- ✅ **Backend:** does TDD within the build phase (RED-GREEN-REFACTOR per feature)
- ❌ **Frontend:** does NOT do TDD (context-first, see `frontend-context-first`)
- ✅ **Tester:** runs E2E + coverage gate **after** build, regardless of which agent built the feature

This is intentional. The harness treats:
- **Unit/integration tests** = feature code's responsibility (backend)
- **E2E tests + coverage gate** = qa phase's responsibility (tester)

## Why not TDD everywhere?

Because:

1. **TDD on UI is expensive and brittle** — tests written before UI exists
   are speculative and break on first refactor
2. **E2E tests are the actual quality gate** — they validate the user
   journey, not the implementation details
3. **Backend TDD is cheap and high-value** — units are stable, contracts
   are clear, refactor cycles are fast

The harness optimizes for the right tool per domain.

## Coverage gate

Minimum coverage is **85%** (lines, branches, functions). The tester
enforces this. If a sprint ships below 85%:

- Tester reports `readyForQAGate: false`
- `qa-gate` blocks the sprint
- The build agent must add tests and re-submit

## Cleanup rules (tester always does)

- Every chain has a `cleanup` step in **reverse order**
- Cleanup runs in `try/finally` — runs even on failure
- No shared state between chains (no `dataSource: shared`)
- Mocked external services (ViaCEP, etc) via nock/MSW

## Output format

The tester returns:

```json
{
  "phase": "phase.5.build",
  "agent": "tester",
  "sprint": "S01",
  "qaDir": "qa/S01/",
  "chainsFile": "qa/S01/e2e-chains.json",
  "resultsFile": "qa/S01/results.json",
  "coverage": {
    "lines": 87,
    "branches": 84,
    "functions": 91,
    "required": 85,
    "passed": true
  },
  "passed": 11,
  "failed": 1,
  "readyForQAGate": true
}
```

## How other agents interact

- **Orchestrator** waits for tester's output before invoking `qa-gate`
- **qa-gate** reads the coverage + pass/fail and decides go/no-go
- **code-reviewer** may sample test code for style (but not edit it)
- **frontend** / **backend** do NOT see the tester's code during build
  (they work from SPEC.md and the build output)

## Anti-patterns (tester must avoid)

- ❌ Edit `src/**` (even "to make the test pass")
- ❌ Chain without cleanup
- ❌ `dataSource: shared` (race conditions)
- ❌ Coverage < 85%
- ❌ Hardcoded test data
- ❌ Skipping response recording
- ❌ Sleeps / timeouts (use condition-based waiting)

## Related skills

- `backend-tdd` — backend's per-feature TDD cycle (orthogonal to E2E)
- `frontend-context-first` — frontend's no-test policy
- `decision-log` — persist "we accept <X>% coverage this sprint" if needed
