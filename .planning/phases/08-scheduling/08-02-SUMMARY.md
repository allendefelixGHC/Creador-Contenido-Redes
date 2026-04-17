---
phase: 08-scheduling
plan: 02
subsystem: scheduling
tags: [n8n, deploy, e2e, azure, supabase, scheduling]

# Dependency graph
requires:
  - phase: 08-scheduling-01
    provides: 60-node workflow with scheduling gate (Code guard + IF + Wait), Wizard PASO 6 with publish_at
provides:
  - Deployed 60-node workflow on n8n-azure with scheduling active
  - Azure min-replicas=1 confirmed (Wait node persistence safe)
  - Supabase publish_at column verified
  - E2E verified: immediate publish (FALSE path), scheduled publish (TRUE path + Wait), past-time rejection (Wizard guard)
affects: [phase-09-error-hardening]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "publish_at must flow through all Code nodes in pipeline (Parsear contenido, Parsear prompts carrusel, Collect Image URLs) — not just Supabase save expression"
    - "n8n API PUT requires stripped settings (executionOrder only); active is read-only — use /activate /deactivate endpoints"

key-files:
  created:
    - .planning/phases/08-scheduling/08-02-SUMMARY.md
  modified:
    - n8n/workflow.json

key-decisions:
  - "publish_at passthrough: field must be explicitly forwarded in Parsear contenido, Parsear prompts carrusel, and Collect Image URLs Code nodes — webhook body fields are NOT auto-forwarded through the pipeline"
  - "$input.first().json is mandatory in Code nodes with mode runOnceForAllItems — bare .first() is a syntax error in n8n sandbox"
  - "YCloud sends 'from' field WITH + prefix — approval webhook simulation must include + for Supabase approval_number match"

patterns-established:
  - "E2E scheduling test pattern: send brief → wait for processing → clean Supabase sessions → approve → verify n8n execution trace for scheduled/wait_seconds/Wait node presence"

# Metrics
duration: 45min
completed: 2026-04-17
---

# Phase 8 Plan 02: Deploy + E2E Tests Summary

**Deployed 60-node scheduling workflow to n8n-azure. 3 bugs found and fixed during E2E testing. Immediate + scheduled publish paths verified end-to-end.**

## Performance

- **Duration:** ~45 min (including 3 bug fixes + redeployments)
- **Started:** 2026-04-17T16:17:00Z
- **Completed:** 2026-04-17T16:51:00Z
- **Tasks:** 2/2 complete
- **Files modified:** 1

## Accomplishments

- Azure Container Apps `propulsar-n8n` confirmed at min-replicas=1 (no change needed)
- Supabase `publish_at` column already existed (default `'now'`)
- 60-node workflow deployed and active on n8n-azure
- **Test A (immediate):** Exec 133 — `scheduled=false`, `wait_seconds=0`, Wait node NOT in trace, post published immediately to IG+FB ✓
- **Test B (scheduled 3.9 min):** Exec 139 — `scheduled=true`, `wait_seconds=233`, `⏳ Wait — Scheduled Publish` IN trace, post published at scheduled time to IG+FB ✓
- **Test C (past time):** `parsePublishTime('hoy 03:00')` returns `{error: "La hora está en el pasado."}`, both `manana`/`mañana` forms work ✓
- **Test D (cleanup):** 3 Facebook test posts deleted via Graph API ✓

## Task Commits

1. **Task 1: Deploy + Azure verification** — `196a827` (chore)
2. **Task 2: E2E tests + bug fixes** — `b17f84f` (fix: 3 bugs)

## Bugs Found and Fixed During E2E

### Bug 1: Missing `$json` prefix in Supabase save expressions
- **Symptom:** Exec 127 — `invalid syntax` in `💾 Guardar sesión Supabase`
- **Cause:** `publish_at: .publish_at || 'now'` instead of `publish_at: $json.publish_at || 'now'`
- **Fix:** Added `$json` prefix in both single + carousel Supabase save nodes

### Bug 2: Missing `$input` in Compute wait_seconds Code node
- **Symptom:** Exec 131 — `Unexpected token '.'` SyntaxError
- **Cause:** `const data = .first().json;` instead of `$input.first().json;`
- **Fix:** Added `$input` prefix

### Bug 3: publish_at lost during pipeline (Parsear contenido)
- **Symptom:** Exec 136 — `publish_at` stored as `"now"` in Supabase despite sending future timestamp
- **Cause:** `🔧 Parsear contenido`, `🔧 Parsear prompts carrusel`, and `🗂️ Collect Image URLs` Code nodes did not forward `publish_at` from webhook body. `$json.publish_at` was undefined at Supabase save time, falling back to `'now'`
- **Fix:** Added `publish_at: b.publish_at || 'now'` to all 3 Code nodes
- **Root cause insight:** Webhook body fields must be explicitly forwarded through every Code node in the pipeline; they are NOT auto-propagated

## E2E Test Evidence

| Test | Exec | publish_at | scheduled | wait_seconds | Wait node | Result |
|------|------|-----------|-----------|-------------|-----------|--------|
| A (immediate) | 133 | now | false | 0 | absent | ✓ IG+FB published |
| B (scheduled) | 139 | 2026-04-17T16:47:41Z | true | 233 | present | ✓ IG+FB published after wait |
| C (past time) | structural | hoy 03:00 | — | — | — | ✓ error returned |
| D (cleanup) | — | — | — | — | — | ✓ 3 FB posts deleted |

## Deviations from Plan

- Plan expected `publish_at` column to need adding — already existed in Supabase
- 3 bugs required intermediate redeployments (4 total deploys instead of 1)
- Test B initially failed because `publish_at` was lost in pipeline (Bug 3); original Test B exec 136 published immediately; fixed version exec 139 published after Wait

## Issues Encountered

- YCloud webhook `from` field includes `+` prefix — simulated approval must match stored `approval_number` format
- Multiple pending Supabase sessions caused `Cannot coerce the result to a single JSON object` error — must clean old sessions before testing
- n8n API `/workflows/{id}` PUT rejects `active` in body (read-only) — use `/activate` and `/deactivate` endpoints instead

---
*Phase: 08-scheduling*
*Completed: 2026-04-17*
