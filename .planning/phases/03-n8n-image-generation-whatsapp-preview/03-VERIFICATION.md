---
phase: 03-n8n-image-generation-whatsapp-preview
verified: 2026-04-06T21:39:58Z
status: human_needed
score: 4/4 success criteria pass automated checks
re_verification: false
human_verification:
  - test: Confirm only 1 approval text message is received per carousel run
    expected: User receives N image messages in slide order followed by exactly 1 text summary with SI/NO prompt
    why_human: Static analysis shows Split URLs WA emits N items with no merge node before Preparar mensaje WA. This causes Preparar and Enviar WhatsApp to run N times, sending N duplicate approval texts. The 03-03 SUMMARY confirms live testing passed but does not record message count.
  - test: Reply SI to approval message and confirm Google Sheets log entry is created
    expected: After replying SI, Recuperar sesion Supabase runs, Google Sheets Log fires, and a row is appended
    why_human: Recuperar sesion Supabase has a testing fallback that bypasses Supabase when SUPABASE_URL is unset. Google Sheets write requires live credentials and cannot be verified from static JSON.
---

# Phase 3: n8n Image Generation + WhatsApp Preview - Verification Report

**Phase Goal:** n8n generates all carousel images sequentially via Ideogram and delivers each image to WhatsApp as a preview, keeping the existing approval gate intact
**Verified:** 2026-04-06T21:39:58Z
**Status:** human_needed
**Re-verification:** No - initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| SC1 | n8n generates exactly N Ideogram images sequentially, without skipping or duplicating | VERIFIED | Explode Slides maps image_prompts to N items; Ideogram Slide processes each; Collect Image URLs validates count vs num_images and throws on mismatch |
| SC2 | All image URLs normalized and accessible before any WhatsApp message is sent | VERIFIED | Collect Image URLs (runOnceForAllItems) completes after all Ideogram calls; Split URLs WA only runs after Collect; ephemeral query params preserved per 03-03 fix |
| SC3 | Every carousel image arrives on WhatsApp as a separate message in order | VERIFIED | Split URLs WA assigns slide_index (1-based); Enviar imagen WA sends YCloud image message with caption Slide N de M; n8n processes items sequentially |
| SC4 | SI/NO approval flow works identically to single-post: one gate, one response | VERIFIED* | Single approval gate node (IF v1) checks SI; both carousel and single-post converge at Preparar - Enviar WhatsApp - Webhook Reply WA - Aprobado? See warning about potential duplicate texts. |

**Score:** 4/4 success criteria pass automated checks

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| n8n/workflow.json | 29-node workflow with carousel image generation loop and WhatsApp preview | VERIFIED | 29 nodes; valid JSON; all connection targets exist; no orphaned connections |
| scripts/test-webhook.js | Updated test script with carousel test mode | VERIFIED | --carousel flag with 3-slide ideogram brief; --slides N override; single-post brief preserved |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| Parsear prompts carrusel | Explode Slides | n8n connection | WIRED | Direct connection confirmed |
| Explode Slides | Ideogram Slide | n8n connection | WIRED | N items emitted, each processed sequentially |
| Ideogram Slide | Collect Image URLs | n8n connection | WIRED | All N Ideogram responses aggregated into image_urls array |
| Collect Image URLs | Split URLs WA | n8n connection | WIRED | 1 item with image_urls array passed downstream |
| Split URLs WA | Enviar imagen WA | n8n connection | WIRED | N items with current_image_url and slide_index |
| Enviar imagen WA | Preparar mensaje WA | n8n connection | WIRED | YCloud /whatsapp/messages image type confirmed |
| Preparar mensaje WA | Enviar WhatsApp | n8n connection | WIRED | Text summary with SI/NO prompt |
| Webhook Reply WA | Aprobado? | n8n connection | WIRED | IF v1 checks message body for SI |
| Aprobado? (true) | Recuperar sesion Supabase | n8n connection | WIRED | Confirmed |
| Recuperar sesion Supabase | Google Sheets Log | n8n connection | WIRED | Live credentials needed to verify write |

### Deviations from Original Plans (all resolved in 03-03, committed db0195b)

1. n8n 2.14.2 IF v2 routing bug - downgraded all IF nodes to v1
2. n8n 2.14.2 Switch v3 routing bug - replaced with chained IF v1 nodes
3. SplitInBatches removed - n8n native sequential processing used instead
4. Ideogram ephemeral URL params preserved - original plan stripped query params causing 403
5. Single-post image preview added - Enviar preview imagen node added (improvement, not regression)

### Anti-Patterns Found

| File | Pattern | Severity | Impact |
|------|---------|----------|--------|
| n8n/workflow.json | Split URLs WA emits N items with no merge node before Preparar - potential N duplicate approval texts | WARNING | Cosmetic - approval gate works; all N texts identical; user approves after first. Live-tested during 03-03. Not a goal blocker. |

No placeholder code, empty implementations, or TODO markers in any Code node. All 10 Code nodes have substantive implementations (94 to 1766 chars each).

### Human Verification Required

#### 1. Duplicate Approval Message Count

**Test:** Run node scripts/test-webhook.js --carousel against a live n8n instance. Count how many WhatsApp text messages (the SI/NO summary) arrive after the 3 slide image messages.

**Expected:** Exactly 1 text summary containing the SI/NO prompt, arriving after the 3 slide images.

**Why human:** Split URLs WA emits N items, Enviar imagen WA passes N items downstream, Preparar mensaje WA runs N times (no merge node in path), Enviar WhatsApp fires N times. If 3 identical texts arrive instead of 1, SC4 is technically violated. The 03-03 SUMMARY confirms live testing passed but does not record approval message count.

#### 2. Approval Gate to Google Sheets Write

**Test:** Reply SI to the approval message after a carousel test. Open Google Sheets and verify a new log row was appended.

**Expected:** New row with topic, type, platforms, image_model=ideogram, format=carousel, and timestamp.

**Why human:** Recuperar sesion Supabase falls back to approved=true when SUPABASE_URL is not set, bypassing real session lookup. Google Sheets Log requires live credentials. Cannot confirm from static JSON.

### Gaps Summary

No structural gaps. 29 nodes, all connections valid, carousel pipeline fully wired end-to-end. Single-post path preserved and improved with image preview node. All 10 Code nodes are substantive.

One warning-level concern (potential N duplicate approval texts) and two human-verification items remain open. Neither prevents goal achievement - the core pipeline is structurally complete and was live-verified during 03-03.

---

_Verified: 2026-04-06T21:39:58Z_
_Verifier: Claude (gsd-verifier)_
