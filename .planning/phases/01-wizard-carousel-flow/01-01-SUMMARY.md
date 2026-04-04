---
phase: 01-wizard-carousel-flow
plan: "01"
subsystem: ui
tags: [node, readline, anthropic, wizard, carousel, cli]

requires: []
provides:
  - suggestSlideCount function calling Anthropic API with topic+type context
  - Format selection step (PASO 3) inserted between angles and platforms
  - Carousel branch that auto-sets Ideogram v3 and skips model selection
  - Single-post flow structurally unchanged
affects:
  - 01-02 (brief JSON extension with carousel fields)
  - 01-03 (step.js sync)

tech-stack:
  added: []
  patterns:
    - "API-then-fallback pattern: guard on apiKey → httpPost → parse → fallback on catch (same as suggestAngles)"
    - "Conditional spread for backward-compatible brief JSON extension"
    - "isCarousel boolean as branch gate for format-specific UI and logic"

key-files:
  created: []
  modified:
    - wizard/run.js

key-decisions:
  - "Ideogram v3 is auto-set for all carousel slides — user never selects model for carousel"
  - "Format step placed after PASO 2.5 (angles) so suggestSlideCount can use topic + type"
  - "Slide count clamp uses suggested count as fallback on invalid input (not hardcoded 5)"

patterns-established:
  - "suggestSlideCount: mirrors suggestAngles pattern exactly (guard → httpPost → parse → clamp → fallback)"
  - "Carousel brief omits carousel-specific fields until plan 01-02 adds them via conditional spread"

duration: 2min
completed: 2026-04-04
---

# Phase 01 Plan 01: Wizard Carousel Flow (Format Selection) Summary

**Format selection step with AI slide count suggestion inserted into wizard/run.js — carousel auto-locks Ideogram v3, single-post flow unchanged**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-04T12:07:33Z
- **Completed:** 2026-04-04T12:09:25Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Added `suggestSlideCount(topic, postType)` using Anthropic API with API-key guard and fallback, clamped output to 3-10 range
- Inserted PASO 3 — Formato step after angle selection, before platforms (single post vs carousel choice)
- Renumbered subsequent steps: old PASO 3 → PASO 4 (plataformas), old PASO 4 → PASO 5 (imagen)
- Carousel branch skips image model questions entirely and auto-sets Ideogram v3 with `hasTextInImage: true`
- Summary screen branches to show carousel-specific info (slide count + model lock) vs single-post model info

## Task Commits

Each task was committed atomically:

1. **Task 1: Add suggestSlideCount function and format selection step** - `70d18df` (feat)

**Plan metadata:** (see below)

## Files Created/Modified

- `wizard/run.js` - Added suggestSlideCount function, PASO 3 format step, renumbered PASO 4/5, carousel branch for image model, updated summary block

## Decisions Made

- Format step placed after PASO 2.5 (angles) so the AI slide count suggestion has access to `topic` and `type` — same context used by `suggestAngles()`
- Carousel auto-sets Ideogram v3 without asking — this is a locked project decision (text-in-image accuracy)
- Slide count fallback on invalid input uses `suggestion.count` (the AI suggestion), not a hardcoded 5, so the AI recommendation is honored even when the user types something invalid
- Brief JSON not yet extended with carousel fields (`format`, `num_images`, `image_prompts`) — that is scoped to plan 01-02 per the plan instructions

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `wizard/run.js` now has the format step, `suggestSlideCount`, and carousel branching in place
- Plan 01-02 can extend the brief JSON with `format`, `num_images`, and `image_prompts` fields using the `isCarousel` and `numImages` variables already set
- `wizard/step.js` still needs a `suggest-slides` command added (also scoped to 01-02 per research recommendation)

## Self-Check: PASSED

- wizard/run.js: FOUND
- 01-01-SUMMARY.md: FOUND
- Commit 70d18df: FOUND
- suggestSlideCount function: FOUND
- PASO 3/4/5 labels (3 total): FOUND

---
*Phase: 01-wizard-carousel-flow*
*Completed: 2026-04-04*
