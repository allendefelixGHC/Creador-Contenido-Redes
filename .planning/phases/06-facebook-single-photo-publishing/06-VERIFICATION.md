---
phase: 06-facebook-single-photo-publishing
verified: 2026-04-17T13:01:20Z
status: passed
score: 3/3 must-haves verified
re_verification: false
---

# Phase 6: Facebook Single-Photo Publishing — Verification Report

**Phase Goal:** After SI approval, the same single-photo post is also published to Facebook and both the IG and FB URLs appear together in the WhatsApp success message
**Verified:** 2026-04-17T13:01:20Z
**Status:** passed
**Re-verification:** No — initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A live Facebook post appears on the Propulsar page after SI approval | VERIFIED | `🌐 FB: Publish Photo` node POSTs to `graph.facebook.com/v22.0/$FACEBOOK_PAGE_ID/photos` with image URL + caption + token. Chain wired from IG permalink. E2E exec 111 confirmed `post_id: 981931321668013_122119222677238849` |
| 2 | The WhatsApp success message contains both the IG permalink and FB post URL in one message | VERIFIED | `✅ Notify WhatsApp Success` jsonBody contains "Publicado en Instagram y Facebook" + `$('🔗 IG: Get Permalink').item.json.permalink` + `'https://www.facebook.com/' + $('🌐 FB: Publish Photo').item.json.post_id` — one message, both URLs |
| 3 | The Google Sheets log row has both IG_URL and FB_URL populated | VERIFIED | `📊 Google Sheets Log` has `operation: "append"`, `resource: "sheet"`, `columns.value.IG_URL` mapped to IG permalink expression, `columns.value.FB_URL` mapped to FB post_id expression. Schema order matches actual Sheet (Estado col H, FB_URL col J). E2E exec 111 confirmed row with all 12 columns |

**Score:** 3/3 truths verified

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `n8n/workflow.json` | Deployed workflow with FB publish chain | VERIFIED | 1688 lines, 40 nodes. FB node present (`n8n-nodes-base.httpRequest`), WA success node present, Sheets node present. Commits 0d48d27 + 5d089a7 confirmed in git log |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `🔗 IG: Get Permalink` | `🌐 FB: Publish Photo` | main connection index 0 | WIRED | Connection verified in `w.connections` |
| `🌐 FB: Publish Photo` | `graph.facebook.com` | POST `/$FACEBOOK_PAGE_ID/photos` | WIRED | URL uses `$env.FACEBOOK_PAGE_ID`; jsonBody passes `access_token: $env.META_PAGE_TOKEN`; confirmed set on Azure Container App |
| `🌐 FB: Publish Photo` | `✅ Notify WhatsApp Success` | main connection index 0 | WIRED | Connection verified in `w.connections` |
| `✅ Notify WhatsApp Success` | `📊 Google Sheets Log` | main connection index 0 | WIRED | Connection verified in `w.connections` |
| WA success body | IG permalink + FB URL | single YCloud message | WIRED | Single `jsonBody` expression constructs message with both URLs inline |
| Sheets `FB_URL` column | `post_id` from FB response | n8n expression | WIRED | `={{ 'https://www.facebook.com/' + $('🌐 FB: Publish Photo').item.json.post_id }}` |

---

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| FB post appears within 90s of IG post | SATISFIED | Same execution chain — FB publish fires immediately after IG permalink fetch; no async delay |
| One combined WA message with both URLs | SATISFIED | Single HTTP node with both URLs in one body string |
| Sheets row has IG_URL and FB_URL populated | SATISFIED | Both columns mapped with live expressions; schema order confirmed |

---

### Anti-Patterns Found

No stubs, TODOs, placeholder returns, or empty handlers found in any of the three critical nodes (`FB: Publish Photo`, `Notify WhatsApp Success`, `Google Sheets Log`).

---

### Human Verification Required

Three success criteria were empirically verified by the user during E2E testing (execution 111, 14/14 nodes success):

1. **Facebook post live** — `post_id: 981931321668013_122119222677238849` confirmed on Propulsar AI page
2. **Combined WA message** — Single WhatsApp notification with both `instagram.com/p/DXO8iARF3_s/` and Facebook URL received
3. **Sheets row** — Row with all 12 columns including IG_URL and FB_URL logged

No additional human tests are required for goal verification.

---

### Gap Summary

No gaps. All three success criteria are satisfied in code and confirmed empirically. The complete chain is:

`SI approval` → `IG publish` → `IG permalink fetch` → `FB photo publish` → `combined WA notification` → `Sheets row with both URLs`

All four nodes in the publish chain are substantive (no stubs), properly wired, and confirmed working against production APIs.

---

_Verified: 2026-04-17T13:01:20Z_
_Verifier: Claude (gsd-verifier)_
