---
name: worker-escalation
description: Stuck-worker detection protocol. Workers emit structured escalation JSON when they detect loops, budget exhaustion, structural errors, or ambiguity mid-flight. Orchestrator reads and decides. Reference for orchestrator, tester, backend, frontend, and any other worker that may run for >5min.
---

# Worker Escalation Protocol (v6.6.1)

## Purpose

The harness runs workers in **batch mode**:

```
orchestrator → [dispatch worker] → worker executes → worker returns JSON → orchestrator validates
                  ↑                                              ↑
                  silence here (1h loops happen here)             orchestrator only sees AFTER
```

When a worker detects it is stuck — same error repeating, budget exhausted, structural error it cannot fix locally, or ambiguity — it MUST emit a structured escalation instead of looping silently. The orchestrator reads the escalation and decides.

This skill exists because the v6.6.1 flow has **no mid-flight channel**. The only mitigation is structured escalation in the worker's final JSON. Without it, the orchestrator discovers the loop only after the worker eventually returns (or never returns).

## When to escalate (workers)

Trigger escalation when **any** of these is true:

| Symptom | Threshold |
|---|---|
| Same error pattern repeats | 3+ identical error hashes (same exitCode + same first-200-chars of stderr) |
| Elapsed time without progress | >10min since last successful tool call |
| Token budget | >80% of the 4000-token task budget consumed without returning `readyForQAGate` |
| Structural error | Mock/schema/setup/fixture error not fixable in 1 local iteration |
| Ambiguity | Decision requires human or domain expertise not owned by this worker |

**Anti-trigger:** transient errors (HTTP 502/503/504, ECONNRESET) — retry locally first per `failure-protocol.json → transient` rules. Do NOT escalate transient failures.

## Escalation JSON schema

Workers add this field to their final output when triggered:

```json
{
  "escalation": {
    "triggered": true,
    "class": "loop | budget | structural | ambiguity",
    "attempts": 3,
    "elapsedMs": 600000,
    "lastError": {
      "tool": "bash",
      "args": "vitest run tests/payment.test.ts",
      "exitCode": 1,
      "stderrHash": "a1b2c3d4",
      "stderrFirst200": "Error: Cannot find module '../../services/payment'"
    },
    "tried": [
      "Added missing import for payment service",
      "Fixed typo in fixture file",
      "Reinstalled dependencies"
    ],
    "proposedActions": [
      {
        "id": "A1",
        "action": "reroute-to-backend",
        "owner": "backend",
        "reason": "Schema mismatch — backend owns the response contract"
      },
      {
        "id": "A2",
        "action": "patch-and-retry",
        "patch": "src/services/payment.ts: replace mock with real stub"
      },
      {
        "id": "A3",
        "action": "ask-user",
        "reason": "Unclear which business rule applies"
      }
    ],
    "contextForOrchestrator": "Same 'Cannot find module' error after 3 fix attempts. The import path is correct, suggesting the module genuinely does not exist — possible schema regeneration issue."
  },
  "readyForQAGate": false
}
```

### Field reference

| Field | Required | Purpose |
|---|---|---|
| `triggered` | yes | Always `true` when this object exists |
| `class` | yes | One of `loop`, `budget`, `structural`, `ambiguity` |
| `attempts` | yes | How many local fix attempts were made |
| `elapsedMs` | yes | Wall-clock time since worker started |
| `lastError` | yes | What just failed (most recent attempt) |
| `tried` | yes | What the worker already tried (so orchestrator doesn't repeat) |
| `proposedActions[]` | yes | 1-3 candidate next steps. Orchestrator picks one. |
| `contextForOrchestrator` | recommended | Free-text insight that helped-classify the failure |

## Classes

| Class | Meaning | Orchestrator's first move |
|---|---|---|
| `loop` | Same error repeats, local fixes exhausted | Read last 5 events; classify error; dispatch with hint |
| `budget` | Token/time exhausted without progress | Abort, checkpoint, replan with reduced scope |
| `structural` | Mock/schema/setup error not in worker's scope | Re-route to domain owner (backend/frontend) |
| `ambiguity` | Decision needs human or cross-domain input | Ask user via `question` with structured options |

## Orchestrator handler

When a worker returns `escalation.triggered: true`:

1. **DO NOT** re-dispatch the same worker with the same instructions (guaranteed to loop again).
2. **READ** the escalation JSON + last 5 events from `.harness/audit/session-*.jsonl`.
3. **CLASSIFY** using the table above. If the worker's class disagrees with your diagnosis, use yours (and log the disagreement).
4. **DECIDE** which `proposedActions[]` entry to take. If none fits, add your own.
5. **ACT**:
   - `loop` → re-dispatch worker with `extraContext` containing: "Previous attempt failed with X. Try Y instead."
   - `budget` → call `harness-checkpoint` (action: create) for partial work, shrink scope, re-dispatch
   - `structural` → dispatch the domain owner (backend/frontend) to fix root cause, then re-dispatch the original worker
   - `ambiguity` → call `question` to escalate to user with rich context + 2-4 options
6. **LOG** to `.harness/events.jsonl`:
   ```json
   {"event": "escalation.handled", "from": "tester", "class": "structural", "actionTaken": "reroute-to-backend", "nextDispatch": "T015-fix-schema"}
   ```

## Why a JSON field, not a new tool

Adding a new `escalate` tool requires permission-block edits in every worker (orchestrator owns the permission schema). A JSON field in the existing output requires no permission changes — it rides the existing return channel. Trade-off: it fires at the END of the worker's run, not mid-flight. The orchestrator's job is to keep workers short (≤10min) so this trade-off is acceptable.

## Anti-patterns (workers)

- ❌ Loop silently for >3 iterations of the same error
- ❌ Emit escalation without `proposedActions[]` (orchestrator has no options to evaluate)
- ❌ Mark `readyForQAGate: true` after escalation (must be `false`)
- ❌ Use escalation for transient errors (retry locally first per `failure-protocol.json`)
- � Escalate "ambiguity" without proposing 2+ concrete options
- ❌ Emit escalation in <3 attempts (premature — you haven't exhausted local fixes yet)

## Anti-patterns (orchestrator)

- ❌ Ignore `escalation.triggered: true` and treat as normal failure
- � Re-dispatch same worker with same instructions (loop guaranteed)
- ❌ Ask user before reading the escalation context (you have the data, decide first)
- ❌ Pick a `proposedActions[]` entry without checking `tried[]` (might repeat failed fix)
- ❌ Forget to log `escalation.handled` to events.jsonl (audit gap)

## Related

- `failure-protocol.json → classes.transient` — handles auto-retry for HTTP/network failures
- `failure-protocol.json → classes.quality` — handles score/coverage/vuln thresholds
- `agents/tester.md → passo 4.5` — tester-specific detection rules
- `agents/orchestrator.md → Handler de escalation` — orchestrator's response playbook
- `~/.config/opencode/training/no-workarounds/SKILL.md` — fix root cause, don't patch symptoms
