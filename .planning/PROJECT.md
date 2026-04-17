# Propulsar Content Engine

## What This Is

AI-powered content generation and publishing engine for Propulsar.ai's social media (Instagram + Facebook). Interactive Wizard (wizard/run.js) + 73-node n8n workflow on Azure generate posts — both single images and multi-slide carousels — with AI-generated text and images in Propulsar's visual identity. Content is previewed via WhatsApp, approved with SI/NO, and automatically published to Instagram and Facebook with scheduling support, error handling, and full audit trail in Google Sheets.

**Shipped as of v1.1:** Full automated publishing pipeline — Wizard → n8n → GPT-4o text → Ideogram/Flux/Nano Banana images → Azure Blob re-hosting → WhatsApp preview → SI approval → IG + FB publish (single + carousel) → WhatsApp success notification → Sheets log. Scheduling (CET/CEST, max 24h). Error handler with WA alerts + Sheets fail log + blob cleanup.

## Core Value

Generate and publish complete social media posts (single or carousel) in one wizard run, each with AI-generated images that include readable Spanish text overlays following Propulsar's brand — previewed via WhatsApp, approved with SI, and automatically published to Instagram + Facebook.

## Current State

**v1.1 shipped 2026-04-17.** Full pipeline live: Wizard → n8n webhook → GPT-4o text → Ideogram/Flux/Nano Banana images → Azure Blob re-hosting → WhatsApp preview → SI/NO approval → Instagram + Facebook publish (single + carousel) → WhatsApp success notification → Google Sheets log. Scheduling via Wait node. Error handler with WA alerts, Sheets fail log, and blob cleanup.

**Stack:** Node.js 22 Wizard (1,751 LOC), n8n 2.14.2 on Azure Container Apps (`propulsar-n8n`, 73 nodes), Ideogram v3 / Flux 2 Pro / Nano Banana Pro APIs, Meta Graph API v22, YCloud WhatsApp, Supabase (session state), Azure Blob Storage (image re-hosting), Google Sheets (audit log).

**Known gap:** `instagram_manage_comments` scope missing from Meta token — hashtag comments on IG posts blocked until Susana adds scope to Facebook App and regenerates token.

## Requirements

### Validated

- ✓ Single-image post generation via Wizard + n8n — pre-v1.0
- ✓ GPT-4o text generation for Instagram + Facebook captions — pre-v1.0
- ✓ Image generation via Flux 2 Pro, Ideogram v3, Nano Banana Pro — pre-v1.0
- ✓ WhatsApp preview and approval flow — pre-v1.0
- ✓ Webhook communication between Wizard and n8n — pre-v1.0
- ✓ Wizard format selector (single post vs carousel) — v1.0
- ✓ Carousel brief with per-slide Ideogram prompts from GPT-4o — v1.0
- ✓ Sequential image generation with Propulsar visual identity — v1.0
- ✓ Individual WhatsApp image previews per slide — v1.0
- ✓ Azure Blob re-hosting (ephemeral URLs → permanent public blobs) — v1.1
- ✓ Instagram single-photo + carousel publishing via Meta Graph API — v1.1
- ✓ Facebook single-photo + carousel publishing via Meta Graph API — v1.1
- ✓ CET/CEST scheduling with Wizard PASO 6 + n8n Wait node — v1.1
- ✓ WhatsApp success notification with IG + FB URLs — v1.1
- ✓ WhatsApp error notification with Meta error details — v1.1
- ✓ Google Sheets log with IG_URL, FB_URL, Publish_Status — v1.1
- ✓ Hashtags as first IG comment (caption stays clean) — v1.1
- ✓ Token-expired WA alert mentioning Susana — v1.1
- ✓ Azure blob cleanup after publish or failure — v1.1
- ✓ Duplicate post prevention (media_publish retry disabled) — v1.1

### Active

(None — define with `/gsd:new-milestone`)

### Out of Scope

- Frontend/dashboard UI — separate project
- Video slides — static images only
- Manual text editing per slide in Wizard — AI decides all content
- Mobile app — server-side pipeline only
- IG Insights analytics — requires 24h post-publish; separate workflow
- A/B testing of captions — requires analytics layer first
- Story publishing — different aspect ratio + ephemeral; separate milestone
- Multi-account publishing — requires multi-tenant token management
- Scheduling beyond 24h — Azure Container Apps scale-to-zero risk
- IG native `publish_at` parameter — doesn't exist in IG Graph API
- FB `scheduled_publish_time` — would create two parallel scheduling paths

## Context

- **Codebase:** Wizard (wizard/run.js, 1,751 LOC JS) + n8n workflow (73 nodes, 3,306 LOC JSON) on Azure Container Apps
- **n8n version 2.14.2 quirks:** IF v2/Switch v3 broken (use IF v1); no `$env` in Code nodes; no `require()` in sandbox; Set v3.0 silently drops cross-node refs in fan-out chains
- **Deployment:** workflow.json via n8n API PUT. Credentials (OpenAI, Google Sheets, Supabase) require manual linking after upload.
- **Azure Blob:** Storage account `propulsarcontent`, container `posts`, SAS `sp=rwdlc sr=c se=2027-04-10`. Public access for reads, SAS for writes + deletes.
- **Meta tokens:** Generated from Susana's admin account. Depend on her maintaining admin role on Propulsar AI Facebook page.
- **Visual brand:** dark background `#1a1a2e`, purple-magenta gradient accents, bold readable Spanish typography.

## Constraints

- **n8n restrictions:** No `$env` in Code nodes, no `require()`. Use HTTP Request nodes or `$helpers.httpRequest`.
- **Conditional routing:** Only IF v1 with string comparisons works reliably in n8n 2.14.2.
- **API costs per carousel:** $0.06 per Ideogram image × N slides. A 7-slide carousel ≈ $0.42.
- **WhatsApp:** YCloud sends images one at a time — carousel preview is N separate messages.
- **Credentials:** Each workflow upload requires manual OpenAI credential linking in n8n UI.
- **Meta token lifetime:** Depends on Susana maintaining admin role.
- **Wait node minimum:** 65s floor — n8n doesn't persist sub-65s waits to DB.
- **Scheduling window:** Max 24h — Azure Container Apps min-replicas=1 but longer waits are risky.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Ideogram v3 as default for carousels | 90-95% text-in-image accuracy | ✓ Good |
| AI decides slide structure | Full automation, user never selects | ✓ Good |
| Sequential Ideogram generation | Safer with rate limits, simpler loop | ✓ Good |
| IF v1 everywhere | IF v2/Switch v3 broken in n8n 2.14.2 | ⚠ Workaround until n8n upgrade |
| Meta tokens from Susana's account | Felix's Graph API returned empty data | ✓ Good — tokens verified working |
| Azure Blob public-access container | SAS expiry breaks scheduled posts | ✓ Good |
| Azure SAS container-scoped (sr=c, sp=rwdlc) | One token covers all UUID blob names | ✓ Good |
| Sub-workflow for re-hosting | Clean separation, reusable across single + carousel | ✓ Good |
| media_publish retryOnFail=false | Not idempotent — retry creates duplicate live post | ✓ Good — no duplicates observed |
| Wait "After Time Interval" (seconds) | "At Specified Time" has n8n bug #14723 | ✓ Good — scheduling works |
| 65s minimum wait floor | n8n doesn't persist sub-65s to DB | ✓ Good — prevents lost executions |
| 45s container wait (not 30s) | 30s insufficient for 5-slide carousel | ✓ Good — fixed after exec 117 failure |
| Hashtags as first comment (not caption) | Clean captions, hashtags still discoverable | ✓ Good |
| Tag Error = Code nodes (not Set) | Set v3.4 drops 'error' key from continueErrorOutput | ✓ Good |
| Two-stage JSON decode for Meta errors | AxiosError double-encodes Meta API responses | ✓ Good |
| Fan-in without Merge node | Both Wait and IF FALSE wire to same target | ✓ Good — simpler |

---
*Last updated: 2026-04-17 after v1.1 milestone*
