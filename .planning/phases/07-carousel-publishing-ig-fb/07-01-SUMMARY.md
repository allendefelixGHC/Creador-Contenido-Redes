---
phase: 07-carousel-publishing-ig-fb
plan: 01
subsystem: api
tags: [n8n, supabase, meta, instagram, carousel, workflow]

# Dependency graph
requires:
  - phase: 06-facebook-single-photo-publishing
    provides: "FB publish node, combined WA notification, Sheets log — single-post chain complete"
  - phase: 05-instagram-single-photo-publishing
    provides: "IG publish chain, Supabase session pattern, Merge Rehost Output node"
provides:
  - "Supabase content_sessions extended with format (TEXT) and image_urls (JSONB) columns"
  - "IF node '🔀 ¿Formato Carrusel?' routing carousel vs single-post after Merge Rehost Output"
  - "Carousel Supabase session save before WA preview (mirrors single-post pattern)"
  - "Re-attach carousel data node restoring original carousel fields after Supabase insert"
  - "Carousel guard removed from Prep Re-host Input — carousel briefs no longer throw"
affects:
  - "07-02 (carousel IG+FB publish chain connects to TRUE output of format branch)"
  - "07-03 (deploy + E2E verification)"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Format branch pattern: IF node (typeVersion 1) after Merge Rehost Output routes by format field"
    - "Carousel session save: HTTP Request INSERT before WA preview, mirrors single-post Supabase pattern"
    - "Cross-ref re-attach: Set node cross-refs upstream node to restore data after Supabase INSERT replaces item"

key-files:
  created: []
  modified:
    - "n8n/workflow.json"

key-decisions:
  - "🔀 ¿Formato Carrusel? uses IF typeVersion 1 (not v2) — same constraint as all other IF nodes in 2.14.2"
  - "TRUE output (index 0) of format branch left unconnected — Plan 02 connects carousel publish chain there"
  - "Carousel Supabase session save placed BEFORE Split URLs WA (before WA preview), not after — SI reply needs session to exist already"
  - "Re-attach carousel data cross-refs '🗂️ Collect Image URLs' (not upstream Supabase node) — Supabase INSERT response replaces item with inserted row, original carousel data only available via cross-ref"
  - "session_id read from Supabase insert response via cross-ref to '💾 Guardar sesión Supabase (Carousel)' — mirrors single-post Re-attach session data pattern"

patterns-established:
  - "Format branch pattern: established for routing carousel vs single-post post-rehost"

# Metrics
duration: 15min
completed: 2026-04-17
---

# Phase 7 Plan 01: Carousel Publishing Infrastructure Summary

**IF format branch + Supabase carousel session save inserted into n8n workflow — carousel briefs no longer throw, approval flow unblocked for Plan 02 carousel publish chain**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-17T (continuation — Task 1 Supabase schema pre-confirmed by user)
- **Completed:** 2026-04-17
- **Tasks:** 2 (Task 1: Supabase schema — human-action, pre-done; Task 2: workflow edits — auto)
- **Files modified:** 1

## Accomplishments

- Supabase content_sessions table extended with `format` (TEXT, default 'single') and `image_urls` (JSONB) columns — confirmed via API INSERT+SELECT by user
- Carousel guard removed from `🔧 Prep Re-host Input` jsCode (the `throw new Error('Carousel publishing not yet supported')` block that blocked Phase 7 end-to-end)
- `🔀 ¿Formato Carrusel?` IF node (typeVersion 1) inserted between Merge Rehost Output and IG Create Container — routes carousel=true to unconnected output (Plan 02), single-post=false to existing IG chain
- `💾 Guardar sesión Supabase (Carousel)` HTTP Request node added on the carousel path — saves carousel session (with format='carousel' + image_urls JSONB) to Supabase before WA preview is sent
- `🔗 Re-attach carousel data` Set node added after carousel Supabase insert — restores original carousel data via cross-ref to Collect Image URLs, adds session_id from insert response
- Node count: 40 → 43

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend Supabase content_sessions schema** — pre-done by user (human-action checkpoint), no commit
2. **Task 2: Remove carousel guard, add format branch, add carousel session save** — `9cdd5fd` (feat)

**Plan metadata:** (this commit)

## Files Created/Modified

- `n8n/workflow.json` — Carousel guard removed, 3 new nodes added (`🔀 ¿Formato Carrusel?`, `💾 Guardar sesión Supabase (Carousel)`, `🔗 Re-attach carousel data`), carousel path rewired, IG/FB chain positions shifted right

## Decisions Made

- `🔀 ¿Formato Carrusel?` uses IF typeVersion 1 — v2/Switch v3 broken in n8n 2.14.2 (same constraint as all other IF nodes in this workflow)
- TRUE output (index 0) left unconnected for Plan 02 — avoids broken-connection warnings being deferred to execution
- Carousel Supabase save placed BEFORE Split URLs WA — the SI approval webhook needs the session to exist at reply time, so it must be saved before WA images are sent
- `🔗 Re-attach carousel data` uses cross-refs to `🗂️ Collect Image URLs` — Supabase INSERT response replaces the item with the inserted row, so original carousel data must be cross-referenced from the pre-insert node (same pattern as single-post Re-attach session data)

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None — Supabase schema extension (Task 1) was pre-confirmed by user before this agent ran.

## Next Phase Readiness

- Plan 01 complete: format branch in place, carousel Supabase session save working, guard removed
- Plan 02 ready to start: needs to connect carousel IG + FB publish nodes to the TRUE output of `🔀 ¿Formato Carrusel?`
- The `🔀 ¿Formato Carrusel?` TRUE output (index 0) is intentionally unconnected — Plan 02 connects the carousel IG carousel container + FB carousel publish chain there

---
*Phase: 07-carousel-publishing-ig-fb*
*Completed: 2026-04-17*
