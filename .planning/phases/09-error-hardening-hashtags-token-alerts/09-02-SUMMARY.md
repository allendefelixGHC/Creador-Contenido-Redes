---
phase: 09-error-hardening-hashtags-token-alerts
plan: 02
subsystem: api
tags: [n8n, meta-graph-api, error-handling, azure-storage, whatsapp, google-sheets]

# Dependency graph
requires:
  - phase: 09-01
    provides: "64-node workflow with hashtag comment nodes; Azure SAS sp=rwdlc (delete permission)"
  - phase: 05-instagram-single-photo-publishing
    provides: "Merge Rehost Output node (cross-ref source for error context)"
  - phase: 07-carousel-publishing
    provides: "Carousel publish chain; FB: Collect Photo IDs aggregation node"
provides:
  - "9-node error handler subgraph: Tag IG/FB Error -> Parse Meta Error -> IF Token Expirado -> WA alerts -> Sheets Fail Log -> Extract Blob Names -> Delete Azure Blob"
  - "All 12 Meta HTTP Request nodes with onError=continueErrorOutput (ERR-04)"
  - "Idempotent container nodes with retryOnFail=true, maxTries=2 (ERR-01/ERR-03)"
  - "WhatsApp error alerts: generic error + specific token-expired alert mentioning Susana (NOTIF-02/NOTIF-03)"
  - "Google Sheets fail log row with Publish_Status=failed + Error_Msg (LOG-03)"
  - "Azure Blob cleanup after both success and failure publish paths (REHOST-06)"
  - "Error_Msg column added to success Sheets logs for schema consistency"
affects:
  - "All downstream Meta API consumers — errors now route to subgraph instead of stopping workflow"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Error output fan-in via platform-tagger Set nodes: IG errors -> Tag IG Error, FB errors -> Tag FB Error -> single Parse Meta Error Code node"
    - "Cross-ref fallback chain in error Code node: try Merge Rehost Output, fall back to Prep Re-host Input — structural guarantee + defensive coding"
    - "Blob cleanup unified fan-in: success Sheets Log (single) + success Sheets Log (Carousel) + Sheets Fail Log all feed Extract Blob Names — single cleanup chain for all paths"
    - "IF typeVersion 1 for token-expired check — v2/Switch v3 broken in n8n 2.14.2 (consistent with all other IF nodes)"
    - "WA error nodes have onError=continueErrorOutput — WA failure must not block Sheets logging or blob cleanup"

key-files:
  created:
    - "scripts/patch-09-02.py"
  modified:
    - "n8n/workflow.json"

key-decisions:
  - "Two platform-tagger Set nodes (Tag IG Error / Tag FB Error) instead of per-node error handlers — adds _platform field cheaply, then single Parse Meta Error Code node handles all paths"
  - "Parse Meta Error uses structural cross-ref guarantee to Merge Rehost Output — ALL Meta nodes are downstream of Merge Rehost Output in the DAG so cross-ref is always available; Code node has try/catch fallback to Prep Re-host Input as secondary source"
  - "is_token_expired uses boolean from Code node but IF v1 compares String($json.is_token_expired) === 'true' — consistent with all other IF nodes in this workflow"
  - "Extract Blob Names receives from 3 sources (success single, success carousel, fail) — uses cross-ref fallback to Merge Rehost Output when blob_urls not in item (Sheets Log API response replaces item data)"
  - "fb-upload-photo-unpublished changed to retryOnFail=true (previously false per Phase 07 decision) — plan explicitly classifies it as idempotent for container creation; plan notes its retry safety for the upload-only step"
  - "Error_Msg column added to success Sheets log nodes for schema consistency — empty string on success, populated on fail"

# Metrics
duration: ~25min
completed: 2026-04-17
---

# Phase 9, Plan 02: Error Handler Subgraph + Blob Cleanup Summary

**9-node error handler subgraph wired to all 12 Meta HTTP Request nodes — failed publishes trigger WhatsApp alerts (generic + token-expired), log to Google Sheets, and clean up Azure Blobs; successful publishes also clean up blobs**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-04-17
- **Tasks:** 1/1
- **Files modified:** 1 (n8n/workflow.json), 1 created (scripts/patch-09-02.py)

## Accomplishments

- All 10 Meta publish nodes changed from `onError=stopWorkflow` to `onError=continueErrorOutput`
- Both hashtag comment nodes already had `continueErrorOutput` from Plan 01 — confirmed unchanged
- 4 idempotent container nodes: `retryOnFail=true, maxTries=2, waitBetweenTries=3000` (ERR-01/ERR-03)
- 4 non-idempotent publish nodes: `retryOnFail=false` preserved (ERR-03 duplicate-post defense)
- 9 new error handler nodes added (64 -> 73 total nodes)
- Error output connections wired from 9 IG nodes -> Tag IG Error; 3 FB nodes -> Tag FB Error
- IF Token Expirado routes OAuthException code 190 to specific WA alert mentioning Susana as admin
- Generic WA alert includes error_code, error_message, fbtrace_id, platform_failed
- Sheets Fail Log writes Publish_Status=failed + Error_Msg (code + fbtrace_id)
- Extract Blob Names + Delete Azure Blob chain runs from both success AND failure paths
- `Error_Msg: ""` added to success Sheets log nodes for column schema consistency

## Task Commits

1. **Task 1: Build error handler subgraph + wire all Meta nodes** — `e61db2f`

## Files Created/Modified

- `n8n/workflow.json` — 10 onError changes, 4 retryOnFail changes, 9 new nodes, 9+3+2 new connections, Error_Msg column in 3 Sheets nodes
- `scripts/patch-09-02.py` — programmatic patch script (reproducible, reviewable)

## Decisions Made

- **Two platform-tagger nodes** (Tag IG Error / Tag FB Error): simpler than per-node handlers or trying to introspect which node errored. Adds `_platform` string that Parse Meta Error reads. Mirrors the plan's "FINAL FINAL APPROACH".
- **Cross-ref fallback in Parse Meta Error**: `$('🔗 Merge Rehost Output').first().json` is the primary source. Wrapped in try/catch with fallback to `$('🔧 Prep Re-host Input').first().json`. This is a structural guarantee (all Meta nodes are downstream of Merge Rehost Output) plus defensive coding.
- **Single blob cleanup chain** for all paths: success single, success carousel, and fail all feed the same Extract Blob Names -> Delete Azure Blob chain. Extract Blob Names cross-refs Merge Rehost Output when `blob_urls` is not in the incoming item (Sheets API response replaces item).
- **fb-upload-photo-unpublished retryOnFail=true**: The plan explicitly classifies this as an idempotent container-creation node. Phase 07 had set it to `false` as a precaution — the plan's ERR-01 requirement overrides this for Plan 02.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

Validation script run immediately after patch:
- 12/12 Meta nodes: `onError=continueErrorOutput` — PASS
- 4/4 idempotent nodes: `retryOnFail=true` — PASS
- 4/4 non-idempotent nodes: `retryOnFail=false` — PASS
- 9/9 new error handler nodes exist — PASS
- 7/7 IG node error outputs -> Tag IG Error — PASS
- 3/3 FB node error outputs -> Tag FB Error — PASS
- 2/2 success Sheets logs -> Extract Blob Names — PASS
- Error_Msg column in all 3 Sheets nodes — PASS
- check-token-expired typeVersion=1 — PASS
- Total nodes: 73 — PASS

## Self-Check: PASSED

All assertions passed. Commit `e61db2f` verified in git log.

## Next Phase Readiness

- Phase 9 is now complete (Plans 01 + 02 done)
- Workflow deploy to n8n Azure is the next step — import updated workflow.json via n8n API
- E2E testing should verify: a forced Meta error triggers WA alert + Sheets row + blob deletion
- The 13-plan v1.1 roadmap is complete at this point
