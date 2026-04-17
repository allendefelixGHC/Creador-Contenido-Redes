---
phase: 07-carousel-publishing-ig-fb
verified: 2026-04-17T15:33:38Z
status: passed
score: 4/4 success criteria verified
re_verification: false
---

# Phase 7: Carousel Publishing IG+FB Verification Report

**Phase Goal:** Approving a multi-slide carousel brief publishes the full carousel to both Instagram and Facebook with all slides in correct order
**Verified:** 2026-04-17T15:33:38Z
**Status:** PASSED
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths (Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Approving SI on a 5-slide carousel results in a live IG carousel post with all 5 slides in correct order | VERIFIED | Exec 119: https://www.instagram.com/p/DXPMXdSFzMX/ — 5-slide IG carousel live |
| 2 | Same approval creates a FB multi-photo post with all 5 images visible on Propulsar page | VERIFIED | Exec 119: FB posted with attached_media[0..4] — confirmed in SUMMARY.md |
| 3 | IG carousel uses 3-step flow (N child containers → parent carousel → media_publish) with Wait >=30s after child creation | VERIFIED | Chain confirmed in workflow.json: Explode→Create Child→Collect IDs→Wait(45s)→Create Parent→media_publish→Permalink. Wait bumped 30→45s after exec 117 race condition — stronger than the 30s minimum stated in criteria |
| 4 | FB carousel body constructed dynamically from N blob URLs in Code node (not hardcoded); 3 slides → attached_media[0..2], 7 slides → attached_media[0..6] | VERIFIED | `🔧 FB: Build attached_media` uses `photoIds.map(id => ({ media_fbid: id }))` — purely dynamic from N-length photo_ids array. Exec 125 (3-slide) confirmed 3 items; exec 119 (5-slide) confirmed 5 items |

**Score:** 4/4 success criteria verified

---

## Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| `n8n/workflow.json` | VERIFIED | 57 nodes — valid JSON, all carousel nodes present and substantive |
| Carousel guard removed from `Prep Re-host Input` | VERIFIED | `throw new Error('Carousel publishing not yet supported')` absent from jsCode |
| `🔀 ¿Formato Carrusel?` IF node (typeVersion 1) | VERIFIED | Exists, type=n8n-nodes-base.if, typeVersion=1 |
| `💾 Guardar sesión Supabase (Carousel)` HTTP Request | VERIFIED | Exists, wired: Collect Image URLs → Guardar → Re-attach → Split URLs WA |
| `🔗 Re-attach carousel data` Set node | VERIFIED | Exists, cross-refs Collect Image URLs for session data |
| IG 7-node chain (Explode→Child→Collect→Wait→Parent→media_publish→Permalink) | VERIFIED | All 7 nodes present, fully connected sequentially |
| FB 7-node chain (Explode→Upload→Collect→Build→Publish→WA→Sheets) | VERIFIED | All 7 nodes present, fully connected sequentially |
| `🔧 FB: Build attached_media` Code node | VERIFIED | Dynamic `photoIds.map(id => ({ media_fbid: id }))` — not hardcoded |

---

## Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `🔗 Merge Rehost Output` | `🔀 ¿Formato Carrusel?` | main output 0 | WIRED | Confirmed in connections map |
| `🔀 ¿Formato Carrusel?` | `🎠 IG: Explode Carousel Slides` | TRUE output (index 0) | WIRED | Confirmed — TRUE branch connected |
| `🔀 ¿Formato Carrusel?` | `📤 IG: Create Container` | FALSE output (index 1) | WIRED | Single-post path preserved |
| `🗂️ Collect Image URLs` | `💾 Guardar sesión Supabase (Carousel)` | main output 0 | WIRED | Carousel session saved before WA preview |
| `🗂️ IG: Collect Child IDs` | `⏳ IG: Wait 30s Carousel` | main output 0 | WIRED | Confirmed |
| `🔧 FB: Build attached_media` | `🌐 FB: Publish Carousel Feed` | main output 0 | WIRED | Confirmed |

---

## Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| IGPUB-02 (IG carousel 3-step publish flow) | SATISFIED | Explode→N child containers→Collect IDs→Wait 45s→Parent container→media_publish→Permalink |
| FBPUB-02 (FB multi-photo post from carousel brief) | SATISFIED | Explode→N unpublished photos→Collect IDs→Build attached_media→/feed POST |
| FBPUB-04 (FB attached_media dynamically built from N images) | SATISFIED | Code node uses `photoIds.map(id => ({ media_fbid: id }))` — N-length array, not hardcoded |

---

## Anti-Patterns Found

None. No TODO/FIXME/placeholder comments found in carousel nodes. No stub return patterns. All publish chains have substantive implementation.

**Notable deviation from plan (not a gap):** The Wait node is 45s (not 30s as originally specified in the plan). This was intentionally bumped during E2E testing (exec 117 race condition). The success criterion requires "30-second Wait... is present" — the 45s value is a documented superset improvement, not a deviation from the goal.

**Sheets log columns:** The `📊 Google Sheets Log (Carousel)` node does not include `Format` or `Num_Slides` columns (plan said these were optional: "adding them is fine — Google Sheets auto-extends. If they don't appear as headers yet, add them manually"). The node does log Fecha, Tema, Tipo, Angulo, Plataformas, Modelo_Imagen, Imagen_URL, Estado, IG_URL, FB_URL, Publicado_En, Publish_Status — the core schema is complete and the log is wired. No carousel-specific metadata columns, but this does not block the phase goal.

---

## Human Verification Required

The following were already verified live during Phase 7 Plan 03 E2E testing (not requiring re-verification):

- **Exec 119 (5-slide IG carousel):** https://www.instagram.com/p/DXPMXdSFzMX/ — live post confirmed
- **Exec 125 (3-slide IG carousel):** https://www.instagram.com/p/DXPOIzBF0Qw/ — live post confirmed, dynamic 3 attached_media confirmed
- **Exec 122 (single-post regression):** https://www.instagram.com/p/DXPNonsD-6Y/ — FALSE branch confirmed working

No additional human verification required.

---

## Summary

Phase 7 goal is fully achieved. The 57-node workflow in `n8n/workflow.json` implements the complete carousel publish pipeline:

1. Format branch (`🔀 ¿Formato Carrusel?`) routes carousel briefs to the carousel chain and single-post briefs to the existing chain — both paths verified E2E.
2. IG carousel 3-step flow (N child containers → 45s Wait → parent container → media_publish) — working, race condition fixed.
3. FB carousel uses dynamically built `attached_media` array from N photo IDs — verified with both 3-slide and 5-slide briefs.
4. Carousel Supabase session save wired correctly before WA preview so the SI approval can retrieve session.
5. WA notification and Google Sheets log appended on successful carousel publish.
6. Single-post regression confirmed passing (exec 122).

All 4 success criteria verified. All 3 requirements (IGPUB-02, FBPUB-02, FBPUB-04) satisfied.

---

_Verified: 2026-04-17T15:33:38Z_
_Verifier: Claude (gsd-verifier)_
