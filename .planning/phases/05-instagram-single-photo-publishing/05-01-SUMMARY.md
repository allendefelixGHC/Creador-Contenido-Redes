---
phase: 05-instagram-single-photo-publishing
plan: 01
subsystem: publishing
tags: [meta-graph-api, instagram, n8n, http-request, ycloud, google-sheets, azure-blob]

# Dependency graph
requires:
  - phase: 04-azure-blob-re-hosting
    provides: permanent Azure Blob URLs in blob_urls[0].url; Merge Rehost Output Set node as final attachment point

provides:
  - 5-node IG single-photo publish chain inserted between Merge Rehost Output and Google Sheets Log
  - Carousel guard in Prep Re-host Input (Phase 7 removes)
  - Google Sheets Log updated with IG_URL, FB_URL (empty), Publicado_En, Publish_Status columns + cross-ref expressions
  - WhatsApp success notification with permalink after publish

affects:
  - 05-02 (deployment and E2E test plan — imports this modified workflow.json)
  - 06-facebook-single-photo-publishing (populates the FB_URL column pre-declared here)
  - 07-carousel-publishing (removes the carousel guard added here)
  - 09-error-handling (adds error output branching to IG nodes, changes onError from stopWorkflow)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IG 2-step publish: POST /media (container) -> Wait 30s -> POST /media_publish (retryOnFail=false)"
    - "Permalink retrieval: GET /v22.0/{media_id}?fields=permalink after publish"
    - "Cross-node references $('node-name').item.json.* required when $json context changes through a linear chain"
    - "FB_URL pre-declared as empty string to lock column order before Phase 6 populates it"

key-files:
  created: []
  modified:
    - n8n/workflow.json

key-decisions:
  - "media_publish has retryOnFail=false and maxTries=1 — not idempotent, retry creates duplicate live IG post"
  - "carousel guard added to Prep Re-host Input (throw on format=carousel) so Phase 5 scope stays single-post only"
  - "FB_URL pre-declared as empty string in Sheets Log to lock column order, Phase 6 only changes the expression"
  - "caption uses $json.instagram.caption not $json.instagram — GPT-4o text parser returns instagram as an object with .caption property (RESEARCH.md correction)"
  - "WhatsApp success node uses JSON.stringify({...}) wrapper per project pattern from effab36 to avoid escaping issues"
  - "All new HTTP Request nodes use graph.instagram.com/v22.0 host per project convention"

patterns-established:
  - "Publish chain pattern: container -> wait -> publish (retry=false) -> permalink GET -> notify WA -> Sheets Log"
  - "When a linear node chain changes what $json means at the end, all prior-context references must use $('node-name').item.json.*"

# Metrics
duration: ~15min
completed: 2026-04-16
---

# Phase 5 Plan 01: Instagram Single-Photo Publish Chain Summary

**5-node Meta Graph API publish chain inserted in n8n workflow — IG container creation, 30s wait, idempotent-safe media_publish (retry disabled), permalink retrieval, and WhatsApp success notification — with Sheets Log extended to include IG_URL, FB_URL, Publicado_En, Publish_Status**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-16
- **Completed:** 2026-04-16
- **Tasks:** 1/1
- **Files modified:** 1 (n8n/workflow.json)

## Accomplishments

- Added 5 new nodes to main workflow at X=3720..4600, Y=380: IG Create Container, Wait 30s, IG media_publish, IG Get Permalink, Notify WhatsApp Success
- Added carousel guard to Prep Re-host Input — throws descriptive error if format=carousel (Phase 7 removes this)
- Rewired connections: Merge Rehost Output -> IG chain -> Google Sheets Log (removed the old direct Merge Rehost Output -> Sheets Log wire)
- Repositioned Google Sheets Log from [2848, 384] to [4820, 380] so the canvas flows left-to-right
- Updated Sheets Log columns with cross-refs ($('🔗 Merge Rehost Output').item.json.*) for all pre-existing columns + 4 new keys: IG_URL, FB_URL (empty), Publicado_En, Publish_Status

## Task Commits

1. **Task 1: Add 5 new nodes + rewire connections + carousel guard** - `81d66e6` (feat)

**Plan metadata:** (included in docs commit below)

## Files Created/Modified

- `n8n/workflow.json` — Added 5 nodes, carousel guard, rewired connections, repositioned Sheets Log, updated Sheets Log columns

## Decisions Made

- **caption field correction from RESEARCH.md:** RESEARCH.md Node 1 snippet uses `caption: $json.instagram` but the GPT-4o text parser produces `instagram: { caption, ... }` (an object). Fixed to `$json.instagram.caption` in the IG Create Container jsonBody. This deviation from RESEARCH.md is intentional and correct.
- **+220 X shift from RESEARCH.md draft positions:** RESEARCH.md's architecture diagram shows Merge Rehost Output at ~3500. New nodes start at X=3720 (not 3500) to avoid colliding with the existing Set node already at [3500, 380].
- **media_publish retryOnFail=false with maxTries=1:** Non-negotiable safety requirement — media_publish is not idempotent. A retry after a network timeout where Meta already processed the request would create a duplicate live post. Only this one node has retry disabled; all other new HTTP nodes (container create, permalink GET, WA notify) have retry enabled because they are idempotent.
- **FB_URL declared as empty string placeholder:** Phase 6 will add Facebook publishing and populate this column. Pre-declaring it in Phase 5 locks the Google Sheet column order so Phase 6 only changes the expression value, not the column structure.
- **No end-to-end testing in this plan:** Plan 05-02 is responsible for deploying to n8n-azure and running E2E tests. This plan only modifies workflow.json locally.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed caption field: $json.instagram.caption instead of $json.instagram**
- **Found during:** Task 1 (IG Create Container node configuration)
- **Issue:** RESEARCH.md Node 1 snippet used `caption: $json.instagram` — but the GPT-4o text parser (node `🔧 Parsear contenido`) returns `instagram: { caption: "...", image_prompt: "..." }` as an object, not a string. Passing the whole object as `caption` would send `[object Object]` to Meta's API.
- **Fix:** Used `caption: $json.instagram.caption` in the IG Create Container jsonBody expression.
- **Files modified:** n8n/workflow.json (ig-create-container node)
- **Verification:** Confirmed by reading the parsear-contenido node at line 172 — returns `{ instagram: { caption, image_prompt } }`
- **Committed in:** 81d66e6 (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - Bug)
**Impact on plan:** Essential correctness fix. Without it, Meta API would receive `[object Object]` as caption and reject the container creation request.

## Issues Encountered

- Pre-existing `$env.` references inside `🔍 Recuperar sesión Supabase` Code node's jsCode — this was already present before Phase 5 and is a known issue documented in STATE.md. Phase 5 did not introduce this and the verification check #11 was interpreted as applying only to new/modified nodes.

## User Setup Required

Before running Phase 5 E2E tests (Plan 05-02), Felix must add 4 new columns to the Google Sheet UI in this exact order, appended after existing columns:
1. `IG_URL`
2. `FB_URL`
3. `Publicado_En`
4. `Publish_Status`

This cannot be automated. Plan 05-02 Task 1 is the checkpoint for this manual step.

## Node Configuration Summary

| Node ID | Name | Type | Position | retryOnFail | Notes |
|---------|------|------|----------|-------------|-------|
| ig-create-container | 📤 IG: Create Container | httpRequest 4.2 | [3720, 380] | true (3 tries) | Idempotent |
| wait-container-ready | ⏳ Wait 30s (container ready) | wait v1 | [3940, 380] | N/A | IGPUB-03 |
| ig-media-publish | 🚀 IG: media_publish | httpRequest 4.2 | [4160, 380] | **false** (1 try) | **CRITICAL — not idempotent** |
| ig-get-permalink | 🔗 IG: Get Permalink | httpRequest 4.2 | [4380, 380] | true (3 tries) | Idempotent GET |
| notify-wa-success | ✅ Notify WhatsApp Success | httpRequest 4.2 | [4600, 380] | true (2 tries) | Cross-refs Merge Rehost Output |
| log-sheets (existing) | 📊 Google Sheets Log | googleSheets 4.4 | [4820, 380] | — | Repositioned from [2848, 384] |

Connections added/changed: 6 new entries + 1 modified (Merge Rehost Output target changed from Google Sheets Log to IG Create Container).

## Next Phase Readiness

- Plan 05-02 (deployment + E2E test) can proceed: workflow.json is ready
- Felix must add 4 new Google Sheet columns before 05-02 tests run
- Meta token validity should be confirmed with a cheap GET before the first full test run (see RESEARCH.md pitfall section)

---

*Phase: 05-instagram-single-photo-publishing*
*Completed: 2026-04-16*
