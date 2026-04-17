---
phase: 06-facebook-single-photo-publishing
plan: 01
subsystem: api
tags: [facebook, meta-graph-api, n8n, http-request, whatsapp, google-sheets]

# Dependency graph
requires:
  - phase: 05-instagram-single-photo-publishing
    provides: IG publish chain (IG: Get Permalink node + Merge Rehost Output data contract + WA notification + Sheets Log with FB_URL placeholder)
provides:
  - FB: Publish Photo HTTP Request node (POST /{PAGE_ID}/photos, retryOnFail=false)
  - Connection chain: IG Get Permalink → FB Publish Photo → Notify WhatsApp Success → Google Sheets Log
  - Combined IG+FB success notification via WhatsApp (single message)
  - Populated FB_URL column in Google Sheets Log using post_id from FB publish response
affects: [06-facebook-single-photo-publishing plan-02, 07-carousel-publishing, 09-error-handling]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "FB photo publish: POST /{PAGE_ID}/photos with url+message+access_token, returns {id, post_id}"
    - "FB URL construction: 'https://www.facebook.com/' + post_id (no extra GET needed)"
    - "retryOnFail=false on non-idempotent publish endpoints (same as IG media_publish)"

key-files:
  created: []
  modified:
    - n8n/workflow.json

key-decisions:
  - "FB: Publish Photo positioned between IG: Get Permalink and Notify WhatsApp Success (sequential, not parallel) — avoids Set v3 fan-out cross-ref data drop pitfall from Phase 4"
  - "retryOnFail=false, maxTries=1 on FB: Publish Photo — POST /{PAGE_ID}/photos is not idempotent, retry creates duplicate live FB post (same pattern as IG media_publish)"
  - "FB URL constructed inline as 'https://www.facebook.com/' + post_id — no second GET call needed since /photos response includes post_id directly"
  - "WA success message updated in-place (single message with both IG+FB URLs) — not a second WA node"

patterns-established:
  - "FB publish node: typeVersion 4.2, retryOnFail=false, maxTries=1, onError=stopWorkflow"
  - "Cross-node refs for caption: $('🔗 Merge Rehost Output').item.json.facebook_caption || instagram_caption || ''"

# Metrics
duration: 8min
completed: 2026-04-17
---

# Phase 6 Plan 01: Facebook Single-Photo Publishing — Workflow JSON Summary

**Facebook photo publish node added to workflow.json — POST /{PAGE_ID}/photos inserted between IG permalink and WA notification, with combined IG+FB success message and Sheets FB_URL populated from post_id**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-17T10:32:00Z
- **Completed:** 2026-04-17T10:40:00Z
- **Tasks:** 1/1 complete
- **Files modified:** 1

## Accomplishments

- Added `🌐 FB: Publish Photo` HTTP Request node (typeVersion 4.2, retryOnFail=false, maxTries=1) to workflow.json (39→40 nodes)
- Rewired connection chain: IG Get Permalink → FB Publish Photo → Notify WhatsApp Success → Google Sheets Log
- Updated `✅ Notify WhatsApp Success` jsonBody to include both Instagram and Facebook URLs in one combined message
- Updated `📊 Google Sheets Log` FB_URL column from empty string to `={{ 'https://www.facebook.com/' + $('🌐 FB: Publish Photo').item.json.post_id }}`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add FB Publish Photo node and rewire connections** - `a436122` (feat)

**Plan metadata:** TBD (docs: complete plan)

## Files Created/Modified

- `n8n/workflow.json` - Added FB publish node, rewired 2 connections, updated 2 existing nodes (WA notification body + Sheets FB_URL expression)

## Decisions Made

- **Sequential chain (not parallel):** FB publish goes AFTER IG: Get Permalink in a linear chain rather than parallelizing IG+FB. Avoids Set v3 fan-out cross-ref silent data drops (established Phase 4 pitfall). Adds ~1-2s but keeps chain auditable.
- **retryOnFail=false:** POST /{PAGE_ID}/photos is NOT idempotent. Same reasoning as IG `media_publish`. A retry after Meta processes but before n8n receives the response creates a duplicate live FB post.
- **FB URL from post_id inline:** `post_id` from the /photos response (`{page_id}_{photo_id}` format) is sufficient to construct `https://www.facebook.com/{post_id}` — no extra permalink GET call needed.
- **Single WA message:** Updated existing `✅ Notify WhatsApp Success` node rather than adding a second WA node. Success criterion requires ONE combined message with both IG and FB URLs.
- **Node position:** FB publish placed at [4600, 380] (same X as old WA position), WA shifted to [4850, 380], Sheets to [5070, 380] — maintains horizontal chain layout.

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — all 4 verification checks passed on first attempt.

## User Setup Required

None — no external service configuration required for this plan. Plan 02 handles deployment to n8n-azure.

**Pre-flight note for Plan 02:** Verify `FACEBOOK_PAGE_ID` is set in the n8n Azure Container App environment variables before E2E test. This env var exists in `.env.example` but may not have been pushed to the Container App (Phase 5 focused on IG-specific vars).

## Next Phase Readiness

- `n8n/workflow.json` is ready for deployment to n8n-azure (Plan 02)
- All 4 structural verifications pass locally: FB node exists with retryOnFail=false, chain rewired correctly, WA includes both URLs, Sheets FB_URL uses post_id cross-ref
- Plan 02 will: deploy via n8n API PATCH, verify env vars, run E2E test, and empirically confirm Google Sheets row logging (pending since Phase 5 827af90 fix)

---
*Phase: 06-facebook-single-photo-publishing*
*Completed: 2026-04-17*
