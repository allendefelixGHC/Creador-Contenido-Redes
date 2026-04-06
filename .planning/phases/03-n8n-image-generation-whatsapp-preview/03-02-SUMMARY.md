---
phase: 03-n8n-image-generation-whatsapp-preview
plan: 02
subsystem: n8n-workflow
tags: [n8n, ycloud, whatsapp, carousel, splitInBatches, image-preview]

# Dependency graph
requires:
  - phase: 03-01
    provides: "Collect Image URLs node emitting image_urls array + approval_number"
provides:
  - "Split URLs WA Code node — explodes image_urls into per-slide items with slide_index"
  - "Split Send WA SplitInBatches node — iterates images one at a time"
  - "Enviar imagen WA HTTP Request — sends each image to YCloud sendDirectly"
  - "Updated Preparar mensaje WA — handles both single-post and carousel formats"
affects: [03-03-publish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Second SplitInBatches loop for WhatsApp delivery: mirrors carousel image generation loop pattern"
    - "YCloud sendDirectly endpoint for synchronous image delivery confirmation"
    - "Dual-path Code node: try/catch to read from named node, fallback to $input (carousel vs single-post)"

key-files:
  created: []
  modified:
    - n8n/workflow.json

key-decisions:
  - "YCloud sendDirectly used (not /messages) — synchronous confirmation before sending next slide"
  - "Preparar mensaje WA reads from Collect Image URLs node via try/catch — falls back to $input for single-post path"
  - "Carousel approval message shows slide count and format line; single-post messages unchanged"

patterns-established:
  - "Dual-path Code node pattern: try { $('named-node').first().json } catch(e) { $input.first().json } for nodes fed by multiple paths"

# Metrics
duration: 6min
completed: 2026-04-06
---

# Phase 3 Plan 02: WhatsApp Carousel Preview Summary

**SplitInBatches WA loop sends each carousel slide as a separate YCloud image message, then feeds into the existing SI/NO approval gate with carousel-aware summary**

## Performance

- **Duration:** 6 min
- **Started:** 2026-04-06T17:46:33Z
- **Completed:** 2026-04-06T17:52:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added 3 new nodes implementing the WhatsApp image delivery loop (Split URLs WA, Split Send WA, Enviar imagen WA)
- Wired complete carousel WA path: Collect Image URLs → Split URLs → SplitInBatches → YCloud image → loop back → Done → Preparar mensaje WA
- Updated Preparar mensaje WA to handle both paths: reads Collect Image URLs for carousel, falls back to $input for single-post
- Single-post approval path (Normalizar → Preparar → Enviar WhatsApp) completely untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Add WhatsApp image loop nodes** - `a1e21df` (feat)
2. **Task 2: Wire WA loop connections + update Preparar mensaje WA** - `be3151f` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified
- `n8n/workflow.json` - Added 3 nodes (Split URLs WA, Split Send WA, Enviar imagen WA) + 4 connections + updated Preparar mensaje WA jsCode

## Decisions Made
- Used YCloud `sendDirectly` endpoint over `/messages` — provides synchronous delivery confirmation before the loop advances to the next slide, reducing risk of out-of-order delivery
- Preparar mensaje WA uses a try/catch pattern to read from "🗂️ Collect Image URLs" node first (carousel path), catching the n8n error when that node wasn't executed and falling back to `$input` (single-post path) — this keeps both paths feeding into the same node without branching
- Carousel approval message adds a format line showing slide count and a different imageStatus string showing N images generated; single-post messages render identically to before

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required. Credentials (YCLOUD_API_KEY, YCLOUD_WHATSAPP_NUMBER) already wired from earlier phases.

## Next Phase Readiness
- WhatsApp carousel preview loop complete and ready for Plan 03-03 (publish)
- After user approves via SI, the approval gate (Recuperar sesión Supabase → Google Sheets Log) needs to be extended to handle carousel publishing to Instagram + Facebook
- Plan 03-03 needs to post all carousel images to Instagram Carousel API (up to 10 slides)

---
*Phase: 03-n8n-image-generation-whatsapp-preview*
*Completed: 2026-04-06*

## Self-Check: PASSED

- n8n/workflow.json: FOUND
- 03-02-SUMMARY.md: FOUND
- Commit a1e21df: FOUND
- Commit be3151f: FOUND
