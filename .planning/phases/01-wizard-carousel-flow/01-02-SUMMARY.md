---
phase: 01-wizard-carousel-flow
plan: "02"
subsystem: ui
tags: [node, wizard, anthropic, carousel, cli, json]

requires:
  - phase: 01-wizard-carousel-flow/01-01
    provides: isCarousel flag, numImages variable, carousel branch structure in run.js

provides:
  - Carousel-aware brief JSON with format/num_images/image_prompts via conditional spread
  - Single-post brief JSON backward-compatible at exactly 11 fields
  - suggestSlideCount function and suggest-slides command in step.js

affects:
  - 01-03 (n8n workflow must consume format/num_images/image_prompts from carousel brief)
  - Phase 2 (n8n carousel generation pipeline receives correct 14-field brief)

tech-stack:
  added: []
  patterns:
    - "Conditional spread pattern: ...(flag && { fields }) — zero-cost extension for single-post backward compat"
    - "step.js API-then-fallback: returns source field (claude|fallback) + optional error in every response"

key-files:
  created: []
  modified:
    - wizard/run.js
    - wizard/step.js

key-decisions:
  - "...(isCarousel && {...}) spread as LAST item in brief — single-post receives zero extra fields, no undefined keys"
  - "step.js suggestSlideCount returns source field explicitly — matches convention of all other step.js functions"

patterns-established:
  - "Conditional spread as last item in brief object for clean optional field extension"
  - "step.js functions always return source: 'claude' or source: 'fallback' + optional error on catch"

duration: 1min
completed: 2026-04-04
---

# Phase 01 Plan 02: Wizard Carousel Flow (Brief JSON + step.js) Summary

**Carousel brief extended to 14 fields via conditional spread; step.js gains suggestSlideCount and suggest-slides command — single-post brief unchanged at 11 fields**

## Performance

- **Duration:** 1 min
- **Started:** 2026-04-04T12:11:25Z
- **Completed:** 2026-04-04T12:12:30Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `...(isCarousel && { format: "carousel", num_images, image_prompts: [] })` spread to brief in run.js — carousel brief is 14 fields, single-post brief is exactly 11 with no extra keys
- Updated carousel summary screen to use `c("bright", ...)` wrapper on the "Carrusel — N slides" line for visual consistency
- Added `suggestSlideCount(topic, postType)` async function to step.js with API-then-fallback pattern, returns `{ count, reason, source }` matching step.js convention
- Added `suggest-slides` command to step.js `main()` between suggest-model and send branches
- Updated step.js JSDoc and usage help to list all 5 commands

## Task Commits

Each task was committed atomically:

1. **Task 1: Update brief JSON and summary screen in wizard/run.js** - `6497e40` (feat)
2. **Task 2: Add suggestSlideCount and suggest-slides command to wizard/step.js** - `b75d384` (feat)

**Plan metadata:** (see below)

## Files Created/Modified

- `wizard/run.js` - Added conditional spread to brief object; updated carousel summary line with bright wrapper
- `wizard/step.js` - Added suggestSlideCount function and suggest-slides command; updated JSDoc + usage string

## Decisions Made

- The `...(isCarousel && {...})` spread is the LAST item in the brief object so the 11 base fields are always listed first and easy to audit — carousel additions follow cleanly at the end
- `step.js suggestSlideCount` explicitly returns `source: "claude"` on success and `source: "fallback"` on both guard-fail and catch, matching the existing pattern in `getTrendingTopics` and `getAngles`

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `wizard/run.js` brief JSON is now fully carousel-aware: single-post = 11 fields, carousel = 14 fields including `format:"carousel"`, `num_images:N`, `image_prompts:[]`
- `wizard/step.js` is in sync with run.js — has `suggestSlideCount` and `suggest-slides` command
- Plan 01-03 can now build the n8n workflow knowing the exact brief schema it will receive

## Self-Check: PASSED

- wizard/run.js: FOUND
- wizard/step.js: FOUND
- 01-02-SUMMARY.md: FOUND
- Commit 6497e40: FOUND (Task 1 — brief JSON conditional spread)
- Commit b75d384: FOUND (Task 2 — step.js suggest-slides)
- isCarousel spread in brief: FOUND (line 405)
- format field only inside spread: VERIFIED
- suggest-slides command in step.js: FOUND
- suggest-slides returns valid JSON: VERIFIED (live test)

---
*Phase: 01-wizard-carousel-flow*
*Completed: 2026-04-04*
