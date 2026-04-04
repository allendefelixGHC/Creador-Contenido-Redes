---
phase: 02-n8n-content-generation
plan: 02
subsystem: testing
tags: [test-webhook, carousel, n8n, verification]

# Dependency graph
requires:
  - phase: 02-n8n-content-generation
    plan: 01
    provides: "Carousel branch in n8n workflow (IF + GPT-4o + Code nodes)"
provides:
  - "Carousel test mode in test-webhook.js (--carousel flag)"
  - "Configurable slide count (--slides N)"
affects: [03-carousel-image-generation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CLI flag detection with process.argv.includes for test mode selection"
    - "Carousel brief matches exact 14-field schema from Phase 1 Wizard"

key-files:
  created: []
  modified:
    - scripts/test-webhook.js

key-decisions:
  - "Carousel brief uses same 14-field schema as Wizard output — ensures test matches real usage"
  - "Default 5 slides with --slides N override for flexibility"

patterns-established:
  - "Test modes via CLI flags (--carousel, --slides N) for webhook testing"

# Metrics
duration: 2min
completed: 2026-04-04
---

# Phase 02 Plan 02: Carousel Test Mode Summary

**Added --carousel flag to test-webhook.js for testing carousel branch without interactive Wizard**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-04T15:10:00Z
- **Completed:** 2026-04-04T15:12:00Z (Task 1 only)
- **Tasks:** 1/2 (Task 2 = human verification, deferred)
- **Files modified:** 1

## Accomplishments

- Added `--carousel` CLI flag to select carousel test brief
- Added `--slides N` flag to override default slide count (5)
- Carousel brief has all 14 fields matching Phase 1 Wizard schema
- Single-post test mode unchanged (default, no flags)

## Task Commits

1. **Task 1: Add carousel test mode** - `d18e747` (feat)

## Files Created/Modified

- `scripts/test-webhook.js` - Added carousel brief, CLI flag detection, mode indicator in console output

## Decisions Made

- **14-field carousel brief**: Matches exact Wizard output schema to ensure test exercises the real path
- **Default 5 slides**: Most common carousel size; overridable with --slides for edge case testing

## Deviations from Plan

None — Task 1 executed as written.

## Pending Checkpoint

**Task 2 (human-verify) deferred** — requires:
1. Upload workflow.json to n8n Azure
2. Link OpenAI credentials to carousel GPT-4o node
3. Test both paths: `--carousel` (TRUE branch) and default (FALSE branch)
4. Verify slide prompts contain Propulsar style (#1a1a2e, gradient)

This verification can be done at any time before Phase 3 execution.

## Self-Check: PASSED

- `scripts/test-webhook.js` — FOUND
- Commit `d18e747` — FOUND

---
*Phase: 02-n8n-content-generation*
*Completed: 2026-04-04 (Task 1; Task 2 deferred)*
