---
phase: 03-n8n-image-generation-whatsapp-preview
plan: 01
subsystem: n8n-workflow
tags: [n8n, ideogram, carousel, splitInBatches, image-generation]

# Dependency graph
requires:
  - phase: 02-n8n-content-generation
    provides: "Parsear prompts carrusel node outputs image_prompts array"
provides:
  - "Explode Slides Code node — maps image_prompts array into individual n8n items"
  - "SplitInBatches loop — iterates slides one at a time"
  - "Ideogram Slide HTTP Request — generates one image per slide via loop"
  - "Collect Image URLs Code node — aggregates all slide URLs into image_urls array"
affects: [03-02-whatsapp-preview, 03-03-publish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "SplitInBatches loop pattern: Explode items → SplitInBatches (batchSize=1) → process → loop back → Done branch exits"
    - "IMG-02 normalization: strip query params from Ideogram URLs, validate count vs expected"

key-files:
  created: []
  modified:
    - n8n/workflow.json

key-decisions:
  - "SplitInBatches batchSize=1 ensures sequential Ideogram calls (no rate limit issues)"
  - "Collect Image URLs validates slide count matches num_images before continuing — fail fast"
  - "Loop back-edge from Ideogram Slide to Split Slides is the key pattern for n8n carousel loops"

patterns-established:
  - "Carousel loop pattern: Explode → SplitInBatches(1) → HTTP Request → loop back → Done → Collect"

# Metrics
duration: 2min
completed: 2026-04-06
---

# Phase 3 Plan 01: Ideogram Carousel Loop Summary

**Sequential Ideogram image generation loop via SplitInBatches — explodes image_prompts array into per-slide items, calls Ideogram once per slide, collects all URLs with count validation**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-06T00:03:31Z
- **Completed:** 2026-04-06T00:04:44Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added 4 new nodes to the carousel branch: Explode Slides, Split Slides, Ideogram — Slide, Collect Image URLs
- Wired the complete SplitInBatches loop with loop back-edge from Ideogram back to Split Slides
- Collect Image URLs validates URL count matches num_images and emits clean image_urls array
- Single-post path (GPT-4o Text → Router → Flux/Ideogram/Nano Banana) completely untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Add Explode Slides + SplitInBatches + Ideogram HTTP Request nodes** - `c820108` (feat)
2. **Task 2: Add Collect Image URLs node + wire all carousel loop connections** - `c33d307` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `n8n/workflow.json` - Added 4 new carousel loop nodes and 5 new connection entries

## Decisions Made
- SplitInBatches batchSize=1 ensures strict sequential Ideogram calls — safer against rate limits than parallel
- Loop back-edge pattern: Ideogram Slide output 0 connects back to Split Slides input 0; Split Slides Done (output 1) exits to Collect URLs
- Collect Image URLs strips query params from Ideogram URLs for clean storage and throws if slide count mismatches

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Credentials (IDEOGRAM_API_KEY) already wired from Phase 2.

## Next Phase Readiness
- Carousel loop complete and ready for Plan 03-02 (WhatsApp carousel preview)
- Collect Image URLs emits `image_urls` array and `final_image_url` (first slide) ready for downstream WhatsApp node
- Plan 03-02 needs to wire Collect Image URLs → WhatsApp preview with N separate image messages

---
*Phase: 03-n8n-image-generation-whatsapp-preview*
*Completed: 2026-04-06*
