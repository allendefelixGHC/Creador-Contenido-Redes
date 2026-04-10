# Propulsar Content Engine

## What This Is

AI-powered content generation engine for Propulsar.ai's social media. Interactive Wizard (wizard/run.js) + n8n workflow on Azure generate Instagram/Facebook posts — both single images and multi-slide carousels — with AI-generated text and images in Propulsar's visual identity. Content is previewed via WhatsApp (YCloud), approved with SI/NO, and logged to Google Sheets.

**Shipped as of v1.0:** Full carousel support (3-10 slides), Ideogram v3 text-in-image, sequential image generation, individual WhatsApp previews per slide, SI/NO approval gate.

## Core Value

Generate complete social media posts (single or carousel) in one wizard run, each with AI-generated images that include readable Spanish text overlays following Propulsar's brand — previewed via WhatsApp before publication.

## Current State

**v1.0 shipped 2026-04-10.** Pipeline live: Wizard → n8n webhook → GPT-4o text → Ideogram/Flux/Nano Banana images → WhatsApp preview → SI/NO approval → Google Sheets log.

**Stack:** Node.js Wizard, n8n 2.14.2 on Azure Container Apps (`propulsar-n8n`), Ideogram v3 API, YCloud WhatsApp, Supabase (session state), Google Sheets (log).

**Pending for v1.1:** Automatic publishing to Instagram/Facebook via Meta Graph API. Tokens are now available (META_PAGE_TOKEN, INSTAGRAM_ACCOUNT_ID, FACEBOOK_PAGE_ID configured in `.env` and Azure Container App environment variables on 2026-04-10).

## Current Milestone: v1.1 Automatic Publishing

**Goal:** Close the loop — publish approved carousels and single posts directly to Instagram and Facebook via Meta Graph API, with scheduling, re-hosting, retry logic, and WhatsApp confirmations.

**Target features:**
- Publish single-post + carousel to Instagram and Facebook via Meta Graph API
- Re-host Ideogram images in Azure Blob Storage before sending to Meta (ephemeral URLs break Meta ingestion)
- Scheduling via n8n Wait node — Wizard asks "publish now or at specific time (today/tomorrow, max 24h)"
- Retry logic on Meta publish failures; on final failure → WhatsApp notify Felix + log error in Google Sheets
- On success → WhatsApp message with published post URLs (IG + FB) + log in Sheets

## Requirements

### Validated

- ✓ Single-image post generation via Wizard + n8n — pre-v1.0
- ✓ GPT-4o text generation for Instagram + Facebook captions — pre-v1.0
- ✓ Image generation via Flux 2 Pro, Ideogram v3, Nano Banana Pro — pre-v1.0
- ✓ WhatsApp preview and approval flow — pre-v1.0
- ✓ Webhook communication between Wizard and n8n — pre-v1.0
- ✓ Wizard asks format: single post or carousel — v1.0
- ✓ Wizard asks number of slides for carousel (3-10, default 5) — v1.0
- ✓ For carousels, `has_text_in_image` is always true (Ideogram default) — v1.0
- ✓ GPT-4o generates one image prompt per slide with text overlay content — v1.0
- ✓ AI chooses carousel structure (narrative/listicle/step-by-step) — v1.0
- ✓ n8n generates N images sequentially (one per slide) — v1.0
- ✓ All carousel images sent via WhatsApp as preview (individual messages) — v1.0
- ✓ Brief JSON includes `num_images` and `image_prompts` array — v1.0
- ✓ Single post flow unchanged (backward compatible) — v1.0
- ✓ Single post also sends image preview to WhatsApp before text — v1.0 (added during 03-03 verification)

### Active

<!-- Defined during v1.1 requirements phase. See REQUIREMENTS.md for full list with REQ-IDs. -->

- [ ] Publish single-post to Instagram and Facebook via Meta Graph API
- [ ] Publish carousel to Instagram (carousel container) and Facebook (attached_media)
- [ ] Re-host Ideogram images in Azure Blob Storage before Meta calls
- [ ] Wizard asks publish time (now or specific hour today/tomorrow)
- [ ] n8n Wait node queues post until scheduled time
- [ ] Retry logic on Meta publish failures with backoff
- [ ] WhatsApp success notification with post URLs (IG + FB)
- [ ] WhatsApp failure notification with error details
- [ ] Google Sheets log updated with published URLs (not just generation success)

### Out of Scope

- Frontend/dashboard UI — separate project
- Video slides — static images only
- Manual text editing per slide in Wizard — AI decides all content
- Mobile app — server-side pipeline only

## Context

- **Codebase:** Wizard (wizard/run.js) + n8n workflow on Azure Container Apps (`propulsar-n8n` resource group `propulsar-production`, westeurope)
- **n8n version 2.14.2 quirks:**
  - IF v2 and Switch v3 condition evaluation is broken — always routes to TRUE/first-output. Use IF v1 with string comparisons for all routing.
  - SplitInBatches Done branch cannot reference loop body nodes via `$()`. Removed entirely — n8n processes N items sequentially natively when feeding an HTTP Request node.
  - No `$env` access in Code nodes for API keys (allowed via HTTP Request headers).
  - Code nodes cannot `require()` modules — use `$helpers.httpRequest` for HTTP.
- **Deployment pattern:** workflow.json uploaded via n8n API (`N8N_API_KEY` in .env). Credentials (OpenAI, Google Sheets, Supabase) require manual linking after each upload — API does not handle credential binding.
- **Ideogram ephemeral URLs:** Signed URLs with `?exp=&sig=` query params. Expire in 1-24h. NEVER strip query params from these URLs. For publishing (v1.1+), must download and re-host images before sending to Meta Graph API.
- **Visual brand:** dark background `#1a1a2e`, purple-magenta gradient accents, bold readable Spanish typography — applied to every image prompt.

## Constraints

- **n8n restrictions:** No `$env` in Code nodes, no `require()`. Use HTTP Request nodes or `$helpers.httpRequest`.
- **Conditional routing:** Only IF v1 with string comparisons works reliably in n8n 2.14.2.
- **API costs per carousel:** $0.06 per Ideogram image × N slides. A 7-slide carousel ≈ $0.42.
- **WhatsApp:** YCloud sends images one at a time — carousel preview is N separate messages (expected).
- **Credentials:** Each workflow upload requires manual OpenAI credential linking in n8n UI.
- **Meta token lifetime:** The Page Access Token is long-lived but depends on Susana maintaining admin role on the Propulsar AI Facebook page. If she loses admin, token stops working.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Ideogram v3 as default for carousels | 90-95% text-in-image accuracy, essential for slide overlays | ✓ Good — all v1.0 carousels used Ideogram successfully |
| AI decides slide structure | Full automation, user never selects narrative/listicle/steps | ✓ Good — GPT-4o chooses structure per topic/type |
| Both single and carousel available | Not all content needs to be carousel | ✓ Good — format selector in Wizard works |
| 3-10 slides range | Instagram allows up to 10, 3 is minimum for meaningful carousel | ✓ Good |
| Sequential Ideogram generation (not parallel) | Safer with rate limits, simpler loop pattern | ✓ Good — no rate limit errors in testing |
| Ideogram v3 auto-set for carousels, user can't override | Only model that does reliable text-in-image | ✓ Good |
| `...(isCarousel && {...})` spread for brief JSON | Zero extra fields for single-post, 14 fields for carousel | ✓ Good — single-post JSON unchanged |
| Carousel GPT-4o call includes captions + all prompts in one call | One API call is faster and cheaper than N | ✓ Good |
| Each slide prompt self-contained with Propulsar style | GPT-4o only called once, so each prompt must carry all style constraints | ✓ Good |
| n8n workflow uploaded via API (not manual export/import) | Faster iteration, scriptable, version-controllable | ✓ Good — but credentials still manual |
| YCloud `/whatsapp/messages` endpoint (not `sendDirectly`) | Used by working text node, consistent behavior across image/text | ✓ Good |
| Preparar mensaje WA reads from multiple upstream nodes via try/catch | Handles 3 paths: carousel, single-post generated, custom image | ✓ Good |
| IF v1 with string comparisons everywhere | IF v2/Switch v3 routing broken in n8n 2.14.2 | ⚠ Workaround — needed until n8n version upgrade |
| SplitInBatches removed from loops | n8n natively processes N items sequentially in HTTP Request nodes; SplitInBatches Done branch can't reference loop body | ⚠ Workaround — needed until n8n version upgrade |
| Meta tokens generated from Susana's account, not Felix | Susana is direct admin of Propulsar page; Felix's Graph API calls returned empty `data` arrays | ✓ Good — tokens verified working 2026-04-10 |

---
*Last updated: 2026-04-10 — v1.1 Automatic Publishing milestone started*
