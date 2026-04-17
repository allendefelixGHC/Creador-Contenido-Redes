---
phase: 08-scheduling
plan: 01
subsystem: scheduling
tags: [n8n, wizard, scheduling, timezone, supabase, wait-node]

# Dependency graph
requires:
  - phase: 07-carousel-publishing-ig-fb
    provides: 57-node workflow with Recuperar sesion Supabase → Prep Re-host Input connection; both Supabase session save nodes (single + carousel)
provides:
  - madridLocalToUTC() probe-based CET/CEST timezone conversion in wizard/run.js
  - parsePublishTime() for ahora/hoy HH:MM/manana HH:MM input parsing with validation
  - PASO 6 scheduling prompt in Wizard (between PASO 5 and RESUMEN FINAL)
  - publish_at field in brief JSON sent to n8n webhook
  - 3 new scheduling nodes in n8n workflow (Code guard + IF router + Wait)
  - publish_at saved in both Supabase session save nodes (single + carousel)
  - Full scheduling gate: Recuperar sesion → Compute wait_seconds → Programado? → (TRUE: Wait → Prep Re-host) / (FALSE: Prep Re-host)
affects: [08-02-deploy, any future phase touching Wizard prompts or n8n approval flow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Probe-based UTC offset detection via Intl.DateTimeFormat — no external timezone lib needed (Node.js 18+)"
    - "n8n Wait node 'After Time Interval' (seconds) with dynamic expression — avoids 'At Specified Time' reliability issues"
    - "65s minimum wait floor — n8n only persists Wait > 65s to DB; shorter waits run in-memory and are lost on restart"
    - "String(boolean) comparison in IF typeVersion 1 — consistent with all other IF nodes in workflow"
    - "Fan-in pattern: two n8n paths (Wait and IF FALSE) both connect to same downstream node (Prep Re-host Input)"

key-files:
  created: []
  modified:
    - wizard/run.js
    - n8n/workflow.json

key-decisions:
  - "Use Intl.DateTimeFormat probe method for CET/CEST conversion — no new npm dependencies"
  - "Use 'After Time Interval' (seconds) Wait mode, not 'At Specified Time' — avoids n8n #14723 reliability bug"
  - "65s minimum wait floor — executions shorter than 65s are not persisted to n8n DB; route to immediate instead"
  - "IF node must use typeVersion 1 — consistent with all 6 existing IF nodes; v2/Switch v3 broken in n8n 2.14.2"
  - "Fan-in without Merge node — both Wait output and IF FALSE output wire directly to Prep Re-host Input (standard n8n fan-in pattern, simpler than Merge)"
  - "publish_at saved to Supabase in both session saves — required because approval fires in a separate webhook execution"

patterns-established:
  - "Wizard scheduling prompt: ahora = now, hoy HH:MM = same-day UTC, manana HH:MM = next-day UTC with validation loop"
  - "n8n scheduling gate: Code guard → IF → (Wait → fan-in) / (direct fan-in) at Prep Re-host Input"

# Metrics
duration: 20min
completed: 2026-04-17
---

# Phase 8 Plan 01: Scheduling — Wizard + n8n Gate Summary

**Scheduling prompt added to Wizard (PASO 6) with CET/CEST-to-UTC conversion, plus a 3-node scheduling gate (Code guard + IF router + Wait) inserted into n8n between session retrieval and image rehosting**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-17T00:00:00Z
- **Completed:** 2026-04-17
- **Tasks:** 2/2 complete
- **Files modified:** 2

## Accomplishments

- Wizard PASO 6 presents 3 scheduling options (Ahora / Hoy HH:MM / Manana HH:MM) with a validation loop; converts Madrid local time to UTC ISO via probe-based Intl.DateTimeFormat offset detection (CET/CEST auto-detected, no new npm deps)
- n8n workflow gains 3 scheduling gate nodes (57 → 60 nodes): Code guard computes wait_seconds with 65s floor + 24h ceiling, IF routes scheduled vs immediate, Wait node holds execution with dynamic `={{ $json.wait_seconds }}` expression; both paths fan-in at Prep Re-host Input
- publish_at field added to both Supabase session saves (single + carousel) so it survives the WhatsApp approval webhook hop

## Task Commits

1. **Task 1: Add scheduling prompt + UTC conversion to Wizard** - `0f3f783` (feat)
2. **Task 2: Add scheduling gate nodes to n8n workflow + update Supabase saves** - `6d9718d` (feat)

**Plan metadata:** (final commit hash TBD after SUMMARY commit)

## Files Created/Modified

- `wizard/run.js` - Added madridLocalToUTC(), parsePublishTime(), PASO 6 scheduling prompt, publish_at in brief JSON
- `n8n/workflow.json` - Added 3 scheduling nodes (Code guard, IF router, Wait); updated 2 Supabase save jsonBody expressions; rewired Recuperar sesion → Compute → IF → paths → Prep Re-host

## Decisions Made

- **Intl.DateTimeFormat probe-based offset detection** — no external timezone library. Node.js 22 ships full IANA timezone database; probe method handles both CET (+1) and CEST (+2) DST automatically. Known edge case: spring-forward 02:00-03:00 window (~1 night/year) has possible 1h error, acceptable given 24h cap.
- **Wait node "After Time Interval" (seconds), NOT "At Specified Time"** — avoids documented n8n #14723 reliability bug (ISO string passed to specificTime mode interprets as epoch seconds → 55-year wait).
- **65s minimum floor for Wait** — n8n does not persist executions with wait < 65s to DB. Sub-65s scheduling routes to immediate publishing.
- **Fan-in without Merge node** — both Wait output and IF FALSE output wire directly to Prep Re-host Input. n8n supports multiple inputs to one node. Simpler than a Merge node; matches existing fan-in patterns in workflow.
- **IF typeVersion 1** — mandatory for n8n 2.14.2 on Azure; v2/Switch v3 broken (same constraint as all other IF nodes in this workflow).

## Deviations from Plan

None - plan executed exactly as written. Task 2 plan initially described 4 new nodes (with a Merge node) then self-corrected to 3 nodes (fan-in pattern). The final implementation followed the corrected 3-node approach.

## Issues Encountered

None.

## User Setup Required

**Before E2E testing of the scheduling feature:**
- Verify Azure Container Apps `min-replicas=1` for the n8n instance (listed as Phase 8 prerequisite in STATE.md). Scale-to-zero will silently kill Wait node executions. Check via Azure portal or: `az containerapp show --name n8n-azure --resource-group <rg> --query "properties.template.scale.minReplicas"`
- Deploy the updated workflow to n8n-azure (Phase 8 Plan 02)
- Add `publish_at` column to Supabase `content_sessions` table if strict schema: `ALTER TABLE content_sessions ADD COLUMN IF NOT EXISTS publish_at TEXT DEFAULT 'now';`

## Next Phase Readiness

- Wizard and workflow JSON fully updated with scheduling capability
- Ready for Phase 8 Plan 02: deploy to n8n-azure and run E2E tests (immediate + scheduled paths)
- Phase 8 prerequisite: verify `min-replicas=1` before any E2E test with long waits

---
*Phase: 08-scheduling*
*Completed: 2026-04-17*
