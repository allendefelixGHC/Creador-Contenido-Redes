---
phase: 05-instagram-single-photo-publishing
verified: 2026-04-16T00:00:00Z
status: gaps_found
score: 7/9 must-haves verified
re_verification: false
gaps:
  - truth: "After Merge Rehost Output, the main workflow calls Meta Graph API to create an IG container with the permanent Azure Blob URL as image_url and the Instagram caption text from GPT-4o"
    status: partial
    reason: "Blob URL path is correctly wired. IG Create Container reads $json.instagram_caption but Merge Rehost Output does not expose that field. It maps instagram (nested object) which is undefined on the Supabase resume path. Posts exec 90 and exec 93 were published with an empty/undefined caption."
    artifacts:
      - path: "n8n/workflow.json"
        issue: "IG Create Container jsonBody uses caption: $json.instagram_caption. Merge Rehost Output maps instagram = Prep.item.json.instagram which is undefined on the Supabase resume path (DB stores instagram_caption flat string). instagram_caption is never added to Merge Rehost Output assignments so $json.instagram_caption is undefined at the IG container node."
    missing:
      - "Add instagram_caption to Merge Rehost Output assignments pointing to Prep Re-host Input.item.json.instagram_caption"
      - "OR change IG Create Container jsonBody caption to cross-ref Prep Re-host Input.item.json.instagram_caption directly"
  - truth: "The Google Sheets Log row gains four new keys: IG_URL, FB_URL (empty string), Publicado_En, Publish_Status in addition to existing columns"
    status: partial
    reason: "Structural configuration is correct. Both test executions (exec 90 and exec 93) hit different Sheets errors patched after each run. No execution completed with the final corrected config (commit 827af90). A live row write has not been observed. SUMMARY explicitly flags this as a known gap."
    artifacts:
      - path: "n8n/workflow.json"
        issue: "Config correct (credential ID XjKteoOTobs1qR55, __rl format, all 4 new columns, cross-refs) but empirically unverified. No successful Sheets write confirmed in tests."
    missing:
      - "Run one full end-to-end execution after the 827af90 fix and confirm the Google Sheet receives a row with all 12 columns populated correctly"
human_verification:
  - test: "Confirm Google Sheets row logging works end-to-end"
    expected: "After a full SI approval flow, Log tab shows a new row with IG_URL=permalink URL, FB_URL=blank, Publicado_En=ISO timestamp, Publish_Status=success, and all pre-existing columns populated correctly."
    why_human: "Both test runs hit Sheets errors fixed after each run. Final fix 827af90 was never exercised in a successful live execution."
  - test: "Empirical duplicate-post prevention test (Test B)"
    expected: "After forcing media_publish timeout to 1500ms, Instagram profile shows 0 or 1 posts for that topic, never 2."
    why_human: "SUMMARY accepted structural verification (retryOnFail=false in config) as substitute. Config inspection cannot prove n8n 2.14.2 runtime behavior under a live timeout."
---

# Phase 5: Instagram Single-Photo Publishing Verification Report

**Phase Goal:** After SI approval, a single-photo post is published to Instagram and the user receives a WhatsApp message with the live IG permalink and a Google Sheets row is created
**Verified:** 2026-04-16
**Status:** gaps_found
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | IG container created with blob URL and GPT-4o caption | PARTIAL | Blob URL path correct ($json.blob_urls[0].url in Merge output). Caption field ($json.instagram_caption) is undefined at runtime - Merge Rehost Output does not expose instagram_caption (only instagram nested object, undefined on Supabase resume path). Posts exec 90/93 published with empty caption. |
| 2 | 30-second Wait node between container creation and media_publish | VERIFIED | id=wait-container-ready, n8n-nodes-base.wait typeVersion=1, amount=30, unit=seconds. Exec 90 trace: 30.238s delta confirmed. |
| 3 | media_publish has retryOnFail=false, maxTries=1 | VERIFIED | ig-media-publish: retryOnFail=false, maxTries=1, onError=stopWorkflow. Exec 90/93 runData shows single execution entry per run. |
| 4 | GET /{media_id}?fields=permalink retrieves public IG URL | VERIFIED | ig-get-permalink: GET graph.facebook.com/v22.0/$json.id with fields=permalink. IG permalink confirmed in WA messages for exec 90/93. |
| 5 | WhatsApp message with Publicado, IG permalink, topic, and timestamp | VERIFIED | notify-wa-success jsonBody: JSON.stringify with Publicado en Instagram + $json.permalink + topic cross-ref + new Date().toISOString(). WA delivery confirmed in exec 90 and exec 93. |
| 6 | Google Sheets Log has IG_URL, FB_URL (empty), Publicado_En, Publish_Status | PARTIAL | Structural: all 4 keys present with correct expressions, cross-refs, credential, __rl format. Empirical: unconfirmed - both test runs hit Sheets errors; no execution completed with final corrected config. |
| 7 | Prep Re-host Input throws error if format=carousel | VERIFIED | jsCode: if (format === carousel) throw new Error(Carousel publishing not yet supported...) |
| 8 | All new Meta HTTP nodes use correct host and env vars via expression fields | VERIFIED | All 3 Meta nodes use graph.facebook.com/v22.0 (corrected from graph.instagram.com in commit c75c34f). No $env in jsCode confirmed. |
| 9 | WhatsApp success node uses JSON.stringify wrapper pattern | VERIFIED | notify-wa-success.parameters.jsonBody: ={{ JSON.stringify({...}) }} confirmed. |

**Score:** 7/9 truths verified (2 partial)

### Required Artifacts

| Artifact | Status | Details |
|----------|--------|---------|
| IG: Create Container | VERIFIED | id=ig-create-container, httpRequest 4.2, [3720,380], retryOnFail=true/maxTries=3 |
| Wait 30s (container ready) | VERIFIED | id=wait-container-ready, wait v1, [3940,380], amount=30s |
| IG: media_publish | VERIFIED | id=ig-media-publish, httpRequest 4.2, [4160,380], retryOnFail=false, maxTries=1 |
| IG: Get Permalink | VERIFIED | id=ig-get-permalink, httpRequest 4.2, [4380,380], GET with fields=permalink |
| Notify WhatsApp Success | VERIFIED | id=notify-wa-success, httpRequest 4.2, [4600,380], POST api.ycloud.com |
| Prep Re-host Input carousel guard | VERIFIED | jsCode throws on format=carousel with descriptive error |
| Google Sheets Log columns update | PARTIAL | Config structurally correct; empirical write unconfirmed after final fix |
| Connection chain rewired | VERIFIED | Full chain wired; old direct Merge->Sheets wire removed |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Merge Rehost Output | IG: Create Container | blob_urls[0].url | VERIFIED | blob_urls explicitly mapped in Merge assignments |
| Merge Rehost Output | IG: Create Container | instagram_caption | BROKEN | instagram_caption NOT in Merge assignments. Merge maps instagram (nested, undefined from Supabase path). Caption undefined at runtime. |
| IG: Create Container {id} | media_publish | $json.id as creation_id | VERIFIED | media_publish body: JSON.stringify({ creation_id: $json.id }) |
| media_publish {id} | IG: Get Permalink | URL uses $json.id | VERIFIED | Permalink URL: graph.facebook.com/v22.0/$json.id |
| IG: Get Permalink {permalink} | Notify WA Success | $json.permalink | VERIFIED | WA body: URL: + $json.permalink |
| Notify WA Success | Google Sheets Log | IG_URL cross-ref | STRUCTURAL | Expression correct; live write unconfirmed |
| All Meta/YCloud HTTP nodes | env vars | META_PAGE_TOKEN, INSTAGRAM_ACCOUNT_ID, YCLOUD_API_KEY, YCLOUD_WHATSAPP_NUMBER | VERIFIED | All env refs in HTTP expression fields only - no $env in jsCode |

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| IGPUB-01: 2-step container flow | SATISFIED | - |
| IGPUB-03: Container readiness Wait | SATISFIED | 30.238s delta confirmed in exec 90 |
| IGPUB-04/ERR-02: Retry disabled on media_publish | SATISFIED (structural) | Empirical forced-timeout test deferred |
| IGPUB-05: Permalink retrieval after publish | SATISFIED | Permalink confirmed in WA messages |
| NOTIF-01: WA success with Publicado + permalink | SATISFIED | Confirmed in exec 90 and exec 93 |
| LOG-01/LOG-02: Sheet columns + row populated | BLOCKED | Config correct; empirical write unconfirmed |
| Caption from GPT-4o | BLOCKED | instagram_caption not forwarded through Merge Rehost Output |

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| n8n/workflow.json (ig-create-container) | caption: $json.instagram_caption - field not in $json at that node | Blocker | IG posts published with empty/undefined caption. GPT-4o caption text silently dropped. Confirmed in live tests exec 90/93. |

### Human Verification Required

**1. Google Sheets Row Logging - End-to-End**

**Test:** Run a full single-photo flow (Wizard -> SI approval) with the current deployed workflow. After execution completes, open the Google Sheet Log tab and inspect the newest row.
**Expected:** IG_URL contains the Instagram permalink URL, FB_URL is blank, Publicado_En has an ISO timestamp, Publish_Status shows success, and pre-existing columns (Tema, Tipo, Angulo, Plataformas, Modelo_Imagen, Imagen_URL, Estado) are all populated - not blank.
**Why human:** The last Sheets fix (commit 827af90, __rl format for documentId and sheetName) was never exercised in a successful live execution.

**2. Empirical Duplicate Post Prevention (Test B)**

**Test:** Temporarily set media_publish timeout to 1500ms in n8n UI Settings tab, run a full SI approval flow, let the timeout fire. Open instagram.com/propulsar_ai and count posts with the test topic/caption.
**Expected:** 0 or 1 new posts. Never 2.
**Why human:** SUMMARY accepted structural config (retryOnFail=false) as substitute. Config inspection cannot prove n8n 2.14.2 runtime behavior under a live timeout.

### Gaps Summary

Two gaps block full goal achievement:

**Gap 1 - Caption silently undefined (Blocker):** The phase goal requires posts to be published with the Instagram caption text from GPT-4o. The IG Create Container node reads $json.instagram_caption but this field is not present in Merge Rehost Output output. On the Supabase session resume path: Recuperar sesion Supabase returns the flat session row (has instagram_caption as flat string), Prep Re-host Input spreads all fields via ...data spread (so instagram_caption exists on Prep output), but Merge Rehost Output explicit assignments only map instagram (the nested {caption, image_prompt} object) which is undefined because Supabase does not store a nested instagram object. Result: $json.instagram_caption is undefined at the IG Create Container node. The two live test posts (exec 90, exec 93) confirm the pipeline functions but posts were published without caption text. Fix: add instagram_caption to Merge Rehost Output assignments pointing to Prep Re-host Input.item.json.instagram_caption.

**Gap 2 - Google Sheets empirical write unconfirmed:** All Sheets configuration is structurally correct after commit 827af90 (credential ID, __rl format, 12 column keys with correct expressions and cross-refs). However no execution completed successfully with that fix applied - both test runs hit different Sheets errors patched after each run. Success Criterion 4 (Sheet row has IG_URL + Publicado_En populated) cannot be marked fully satisfied until one successful Sheets write is observed.

The phase critical path (IG publish + WA notification + 30s wait + retry-disabled protection) is functional and verified. Gaps affect caption quality (posts published without GPT-4o text) and logging completeness.

---

_Verified: 2026-04-16_
_Verifier: Claude (gsd-verifier)_
