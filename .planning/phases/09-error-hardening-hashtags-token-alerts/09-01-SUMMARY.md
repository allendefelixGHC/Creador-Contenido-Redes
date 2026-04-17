---
phase: 09-error-hardening-hashtags-token-alerts
plan: 01
subsystem: api
tags: [n8n, instagram, meta-graph-api, hashtags, azure-storage, blob-sas]

# Dependency graph
requires:
  - phase: 08-scheduling
    provides: "60-node workflow with scheduling gate; Prep Re-host Input as fan-in point"
  - phase: 05-instagram-single-photo-publishing
    provides: "IG media_publish chain; Get Permalink node; Merge Rehost Output Set node"
  - phase: 07-carousel-publishing
    provides: "Carousel media_publish chain; Get Carousel Permalink node"
provides:
  - "4 new nodes: Extract Hashtags (Single/Carousel) Code nodes + IG comment HTTP Request nodes"
  - "hashtag_block field threaded through Prep Re-host Input and Merge Rehost Output"
  - "IG captions published without hashtag lines (hashtags appear as first comment)"
  - "Azure SAS token with delete permission (sp=rwdlc) — enables blob cleanup in Plan 02"
affects:
  - "09-02-PLAN.md (error handler subgraph references hashtag_block and blob cleanup patterns)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Non-blocking comment node: onError=continueErrorOutput so comment failure does not abort the already-live post"
    - "Hashtag re-extraction in Prep Re-host Input: Supabase stores original caption with hashtags; approval path re-derives hashtag_block from stored instagram_caption"
    - "Explicit cross-ref in comment URL: uses $('node-name').item.json.id instead of $json.id to avoid Set v3.0 fan-out silent data drop"

key-files:
  created: []
  modified:
    - "n8n/workflow.json"

key-decisions:
  - "Hashtag re-extraction in Prep Re-host Input (not Normalizar URL imagen) — Supabase stores the original caption with hashtags; the approval webhook path re-derives hashtag_block from the stored instagram_caption so it is always available at publish time"
  - "Early extraction nodes (content generation path) serve WA preview only — clean caption shown in WhatsApp preview message; the approval path is authoritative for publish"
  - "Comment node uses onError=continueErrorOutput — post is already live when comment is attempted; comment failure should not roll back a successful publish"
  - "Comment URL uses explicit cross-ref to media_publish node ($('node-name').item.json.id) — avoids Set v3.0 fan-out silent data drop pitfall established in Phase 4"
  - "Azure SAS updated to sp=rwdlc (read+write+delete+list+create), expiry 2027-04-10 — enables blob DELETE in Plan 02 error cleanup"

patterns-established:
  - "Hashtag-as-comment pattern: strip hashtags from caption before container creation, post as /comments after media_publish using continueErrorOutput"
  - "Two-stage hashtag extraction: early extraction for UX (WA preview clean), re-extraction at publish time from Supabase session for correctness"

# Metrics
duration: ~35min
completed: 2026-04-17
---

# Phase 9, Plan 01: Hashtag Extraction + IG First-Comment Nodes Summary

**Hashtags stripped from IG caption and posted as first comment after media_publish — 4 new nodes (2 Code + 2 HTTP Request) inserted into single-post and carousel publish chains, with hashtag_block threaded through Prep Re-host Input and Merge Rehost Output**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-04-17T (continuation from Task 1 human checkpoint)
- **Completed:** 2026-04-17
- **Tasks:** 2 (Task 1: human action — SAS regeneration; Task 2: auto — workflow.json modification)
- **Files modified:** 1

## Accomplishments

- Azure SAS token updated with delete permission (sp=rwdlc) — user confirmed DELETE returns 404 not 403
- 4 new nodes added to workflow.json (total: 60 → 64 nodes)
- hashtag_block threaded through the approval path: Supabase stores original caption, re-extracted in Prep Re-host Input
- IG captions published to containers are now clean (no hashtag lines); hashtags appear as the first comment on the live post
- Comment nodes are non-blocking: onError=continueErrorOutput means a comment API failure does not abort an already-live post

## Task Commits

1. **Task 1: Regenerate Azure SAS with delete permission** — N/A (env var updated via Azure Portal, no code change)
2. **Task 2: Add hashtag extraction + IG first-comment nodes** — `01c788f` (feat)

## Files Created/Modified

- `n8n/workflow.json` — Added 4 nodes, updated connections (8 rewires), added hashtag_block to Prep Re-host Input + Merge Rehost Output

## Decisions Made

- **Hashtag re-extraction in Prep Re-host Input** (not early path): Supabase stores the original caption with hashtags intact. The approval webhook runs in a separate execution and reads from Supabase. Re-extracting in Prep Re-host Input ensures `hashtag_block` is always derived from the stored data, regardless of which generation path was used.
- **Comment node uses `onError=continueErrorOutput`**: A live IG post exists the moment `media_publish` succeeds. If the comment POST fails (rate limit, API error), the post should not be considered failed — the user gets their published post without the hashtag comment, which is a minor UX miss, not a publish failure.
- **Early extraction nodes serve WA preview quality**: The Extract Hashtags nodes in the content generation path clean the caption before it appears in the WhatsApp preview message, improving the preview readability. They do NOT affect what gets saved to Supabase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Downstream carousel nodes shifted in position**
- **Found during:** Task 2 (inserting comment nodes into carousel chain)
- **Issue:** Inserting `💬 IG: Post Carousel Hashtag Comment` at position x=5260 collided with `🔗 IG: Get Carousel Permalink` (also at x=5260). All 6 downstream carousel nodes (Get Carousel Permalink, FB: Explode Carousel Slides, FB: Upload Photo Unpublished, FB: Collect Photo IDs, FB: Build attached_media, FB: Publish Carousel Feed, Notify WhatsApp Carousel, Google Sheets Log Carousel) needed position shifts of +220px each.
- **Fix:** Shifted all downstream carousel nodes right by 220px; same shift applied to single-post downstream nodes (FB: Publish Photo, Notify WhatsApp Success, Google Sheets Log).
- **Files modified:** n8n/workflow.json
- **Committed in:** 01c788f (part of Task 2 commit)

---

**Total deviations:** 1 auto-fixed (position collision when inserting new nodes)
**Impact on plan:** Purely cosmetic in n8n UI — no functional change. Necessary to avoid overlapping nodes.

## Issues Encountered

None — all structural checks passed after edit (64 nodes, 8 correct connection rewires, hashtag_block in both Prep Re-host Input and Merge Rehost Output).

## User Setup Required

Azure SAS token updated by user before this plan continued:
- Container App: propulsar-n8n
- Env var: AZURE_SAS_PARAMS
- New permissions: sp=rwdlc (read+write+delete+list+create)
- Expiry: 2027-04-10
- Verification: DELETE request returned 404 (not 403)

## Next Phase Readiness

- Plan 02 (error handler subgraph) can reference `hashtag_block` from `🔗 Merge Rehost Output`
- Blob DELETE is unblocked — AZURE_SAS_PARAMS now has `d` permission
- Both single-post and carousel publish chains have hashtag comment nodes in place
- No deploy step needed for this plan — Plan 02 will deploy all Phase 9 changes together

---
*Phase: 09-error-hardening-hashtags-token-alerts*
*Completed: 2026-04-17*
