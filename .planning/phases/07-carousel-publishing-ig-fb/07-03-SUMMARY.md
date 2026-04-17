---
phase: 07-carousel-publishing-ig-fb
plan: 03
subsystem: deploy
tags: [n8n, deploy, e2e, carousel, meta, instagram, facebook]
---

## Summary

Deployed the 57-node carousel-enabled workflow to n8n-azure.propulsar.ai and ran 3 E2E tests against the live Meta Graph API. All tests pass after fixing a 30s→45s wait race condition.

## What Was Done

### Task 1: Deploy to n8n-azure
- PUT workflow.json (57 nodes) via n8n public API
- Activated workflow — confirmed 57 nodes, active=true
- No new env vars needed (FACEBOOK_PAGE_ID, INSTAGRAM_ACCOUNT_ID already present from Phase 5/6)

### Task 2: E2E Tests

**Test A — 5-slide carousel (exec 119):** PASS
- 5 child containers created → 45s wait → parent container → media_publish → permalink
- FB: 5 unpublished photos → attached_media[0..4] → feed POST
- WA notification with "Carrusel publicado (5 slides)" + IG permalink + FB URL
- Sheets row appended
- IG: https://www.instagram.com/p/DXPMXdSFzMX/

**Test B — 3-slide carousel (exec 125):** PASS
- 3 child containers, 3 attached_media — confirms dynamic slide count
- IG: https://www.instagram.com/p/DXPOIzBF0Qw/

**Test C — Single-post regression (exec 122):** PASS
- Format branch FALSE → existing single-post IG + FB chain → published correctly
- IG: https://www.instagram.com/p/DXPNonsD-6Y/

## Deviations

1. **Wait 30s → 45s:** Exec 117 failed at media_publish with "Media ID is not available" (error 9007/2207027). The 30-second wait was insufficient for 5-slide child container processing. Bumped to 45s — all subsequent carousel publishes succeeded. Committed as `7ba3ae7`.

2. **First test batch collision:** Sent single-post + carousel briefs simultaneously. Both WA approvals mapped to the carousel session (last-write-wins in Supabase). Resolved by testing sequentially — one brief at a time.

## Key Files

### Created
- (none — deploy only)

### Modified
- `n8n/workflow.json` — Wait node amount 30→45

## Self-Check: PASSED

- [x] 57 nodes deployed and active on n8n-azure
- [x] 5-slide carousel: IG + FB + WA + Sheets ✓
- [x] 3-slide carousel: dynamic attached_media ✓
- [x] Single-post regression: FALSE branch works ✓
- [x] 45s wait prevents media_publish race condition
- [x] All FB test posts deleted after verification
