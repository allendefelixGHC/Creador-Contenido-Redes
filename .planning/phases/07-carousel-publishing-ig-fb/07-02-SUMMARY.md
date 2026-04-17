---
phase: 07-carousel-publishing-ig-fb
plan: 02
subsystem: api
tags: [n8n, meta, instagram, facebook, carousel, workflow, whatsapp, sheets]

# Dependency graph
requires:
  - phase: 07-01
    provides: "IF format branch (¿Formato Carrusel?), carousel Supabase session save, guard removed — TRUE output ready to connect"
  - phase: 06-facebook-single-photo-publishing
    provides: "FB publish pattern, single-post chain, Sheets log, WA notification"
provides:
  - "IG carousel 3-step publish chain: Explode -> N child containers -> Collect IDs -> 30s Wait -> Parent container -> media_publish -> Permalink"
  - "FB carousel 2-step publish chain: Explode -> N unpublished photos -> Collect IDs -> Build attached_media -> /feed POST"
  - "Carousel WhatsApp notification with slide count + IG permalink + FB URL"
  - "Carousel Google Sheets log row in same Log tab as single-post"
  - "Complete 14-node carousel publish chain connected to TRUE output of ¿Formato Carrusel?"
affects:
  - "07-03 (deploy + E2E verification of full carousel flow)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IG carousel 3-step: N child containers (fan-out) -> aggregate IDs -> parent container -> media_publish (retryOnFail=false)"
    - "FB multi-photo: N unpublished photos (fan-out) -> aggregate IDs -> [{ media_fbid }] array -> /feed POST (retryOnFail=false)"
    - "Cross-ref pattern: Collect IDs nodes cross-ref Merge Rehost Output for session data after fan-out aggregation"
    - "Non-idempotent node protection: retryOnFail=false + maxTries=1 on all publish nodes (Carousel media_publish, FB Upload, FB Publish Feed)"

key-files:
  created: []
  modified:
    - "n8n/workflow.json"

key-decisions:
  - "IG child container creation has retryOnFail=true (idempotent — creates isolated child ID), but media_publish has retryOnFail=false (NOT idempotent — duplicate live post)"
  - "FB Upload Photo Unpublished has retryOnFail=false — not safe after timeout (orphaned unpublished photos possible)"
  - "FB Publish Carousel Feed uses JSON specifyBody mode with attached_media array built in Code node — if Meta rejects the format, fallback is stringified body in Build attached_media node"
  - "🗂️ FB: Collect Photo IDs cross-refs both Merge Rehost Output (session data) and IG: Get Carousel Permalink (instagram_permalink) — all downstream nodes (WA, Sheets) read from this single aggregation node"
  - "Carousel Sheets log uses identical schema to single-post log — same credential (XjKteoOTobs1qR55), same tab (Log), same column order — no schema migration needed"
  - "🖼️ FB: Explode Carousel Slides omits slide count validation (already validated by IG: Explode Carousel Slides earlier in chain)"

# Metrics
duration: ~20min
completed: 2026-04-17
---

# Phase 7 Plan 02: Carousel Publish Chain Summary

**Complete 14-node carousel publish chain added to workflow.json — IG 3-step carousel + FB attached_media multi-photo + WA notification + Sheets log, connected to TRUE output of format branch**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-04-17
- **Completed:** 2026-04-17
- **Tasks:** 2/2 complete
- **Files modified:** 1

## Accomplishments

- Task 1: 7 IG carousel nodes added and connected to TRUE output of `🔀 ¿Formato Carrusel?`:
  - `🎠 IG: Explode Carousel Slides` — fans out blob_urls (validates 1-10 slides)
  - `🖼️ IG: Create Child Container` — HTTP POST /media with is_carousel_item=true per slide (retryOnFail=true)
  - `🗂️ IG: Collect Child IDs` — aggregates IDs, rebuilds session, builds children_csv (runOnceForAllItems)
  - `⏳ IG: Wait 30s Carousel` — 30s wait for children to reach FINISHED state
  - `🎠 IG: Create Parent Container` — HTTP POST /media with media_type=CAROUSEL (retryOnFail=true)
  - `🚀 IG: Carousel media_publish` — HTTP POST /media_publish (retryOnFail=false, maxTries=1)
  - `🔗 IG: Get Carousel Permalink` — GET permalink for downstream use
- Task 2: 7 FB/WA/Sheets nodes added and connected after IG chain:
  - `🖼️ FB: Explode Carousel Slides` — fans out blob_urls for FB uploads
  - `📤 FB: Upload Photo Unpublished` — HTTP POST /photos with published=false (retryOnFail=false)
  - `🗂️ FB: Collect Photo IDs` — aggregates IDs, cross-refs IG permalink + session data
  - `🔧 FB: Build attached_media` — builds [{ media_fbid }] array
  - `🌐 FB: Publish Carousel Feed` — HTTP POST /feed with attached_media (retryOnFail=false, maxTries=1)
  - `✅ Notify WhatsApp Carousel` — YCloud WA text with slide count + IG permalink + FB URL
  - `📊 Google Sheets Log (Carousel)` — appends Log row, same schema + credentials as single-post log
- Full 14-node chain verified: all 14 sequential connections confirmed, single-post path untouched
- Node count: 43 → 57 (50 after Task 1, 57 after Task 2)

## Task Commits

1. **Task 1: IG carousel 3-step chain (7 nodes)** — `b097282`
2. **Task 2: FB carousel chain + WA + Sheets (7 nodes)** — `566e1f9`

## Files Created/Modified

- `n8n/workflow.json` — 14 new nodes added, connections updated, TRUE branch of format IF connected

## Decisions Made

- IG child containers are retryOnFail=true (idempotent), but media_publish is retryOnFail=false (same pattern as single-post media_publish — duplicate-post prevention)
- FB Upload Photo Unpublished has retryOnFail=false — retry after timeout could create orphaned unpublished photos
- FB Publish Carousel Feed uses JSON mode with attached_media array built in Code node; if Meta API rejects this format during E2E (Plan 03), fallback is to stringify the full request body in Build attached_media and pass via $json.request_body
- `🗂️ FB: Collect Photo IDs` is the single aggregation point for all downstream data — WA and Sheets cross-ref this node
- Carousel Sheets log uses exact same column schema, tab, and credentials as single-post log — no migration or schema changes needed

## Deviations from Plan

None — plan executed exactly as written. All 14 nodes implemented per specification, positions assigned sequentially (Y=200 for carousel chain, stepping X by 220 per node from X=3940).

## Issues Encountered

None.

## Verification Results

All 9 automated checks passed:
1. JSON valid
2. 57 nodes (expected 57)
3. Full 14-node carousel chain connected end-to-end
4. retryOnFail=false on IG: Carousel media_publish
5. retryOnFail=false on FB: Upload Photo Unpublished
6. retryOnFail=false on FB: Publish Carousel Feed
7. 30s Wait (amount=30, unit=seconds) between Collect Child IDs and Create Parent Container
8. attached_media built in Code node
9. Single-post FALSE branch unchanged

## Next Phase Readiness

- Plan 02 complete: full carousel publish chain in workflow.json
- Plan 03 ready to start: deploy updated workflow.json to n8n Azure, run E2E carousel test (wizard -> WA preview -> SI -> IG carousel post + FB carousel post + WA notification + Sheets row)
- Known risk for Plan 03: FB /feed attached_media format may need fallback to stringified body if Meta rejects the JSON structure

## Self-Check

- [ ] n8n/workflow.json modified — file exists at `n8n/workflow.json`
- [ ] Task 1 commit b097282 exists
- [ ] Task 2 commit 566e1f9 exists

---
*Phase: 07-carousel-publishing-ig-fb*
*Completed: 2026-04-17*
