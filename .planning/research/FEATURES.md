# Feature Research

**Domain:** Automatic social media publishing — Instagram + Facebook via Meta Graph API
**Milestone:** v1.1 Automatic Publishing (adds to v1.0 content generation pipeline)
**Researched:** 2026-04-10
**Confidence:** HIGH (core publishing sequences verified against official Meta docs; scheduling and error patterns verified against official Graph API docs + n8n community)

---

## Context: What Already Exists (v1.0)

This research focuses exclusively on what v1.1 needs to add. v1.0 already delivers:
- Wizard generates content briefs (single post or carousel)
- GPT-4o generates captions for IG + FB
- Ideogram/Flux/Nano Banana generate images (URLs are ephemeral, expire in 1-24h)
- WhatsApp previews all images to Felix
- SI/NO approval gate
- Google Sheets logs generation

v1.1 must close the loop: when Felix responds SI, the content actually gets published.

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Single-photo publish to Instagram | Core promise of v1.1 | LOW | 2-step: create container → media_publish. Endpoint: `POST /<IG_ID>/media` then `POST /<IG_ID>/media_publish` |
| Single-photo publish to Facebook | Core promise of v1.1 | LOW | `POST /<PAGE_ID>/photos` with `url` param; returns `post_id` |
| Carousel publish to Instagram | Carousel support shipped in v1.0; publishing it is the natural next step | MEDIUM | 3-step: create N child containers → create parent CAROUSEL container → media_publish. Max 10 items. All cropped to first image aspect ratio (already 1:1) |
| Carousel publish to Facebook | Parity with IG; FB supports multi-image posts | MEDIUM | Use `attached_media` param with array of `media_fbid` objects. Must upload each image separately to FB first via `/photos?published=false` |
| Image re-hosting before Meta calls | Ideogram URLs are signed/ephemeral — Meta will reject them during container polling | HIGH | Must download image binary and upload to permanent public URL before creating IG/FB containers. Azure Blob Storage is already in the infrastructure (same Azure resource group). Use `PUT` blob via HTTP Request node + SAS URL. Return permanent `https://<storage>.blob.core.windows.net/<container>/<blob>` URL |
| Container readiness polling | IG container creation is async — publishing before `FINISHED` status causes errors | MEDIUM | Poll `GET /<container_id>?fields=status_code` up to 5 times, 1 request/minute. If `FINISHED`, proceed. If `ERROR` or `EXPIRED`, abort and notify. n8n Wait node (15-30s intervals) handles this without external cron |
| WhatsApp success notification | User expects confirmation that post went live, not silence | LOW | Send WhatsApp message with IG permalink + FB post URL after successful publish. IG permalink: `GET /<media_id>?fields=permalink`. FB: construct from post_id |
| WhatsApp failure notification | User must know if publish failed — content is time-sensitive | LOW | Send WhatsApp message with error code + human-readable reason + instructions for manual retry |
| Google Sheets log update | v1.0 logs generation; v1.1 should add published_url + publish_status columns | LOW | Update the existing row (matched by timestamp or content ID) OR append new row with publish outcome |
| Scheduling: "publish now" path | Default path — user expects immediate publish after SI | LOW | No scheduling parameter in IG API. "Now" = publish immediately after approval webhook fires. No Wait node needed for this path |
| Scheduling: "specific time" path | Power user behavior; avoids publishing at odd hours | MEDIUM | Wizard asks for time ("09:00 today" or "18:00 tomorrow"). Wizard converts to UTC offset from CET/CEST. n8n Wait node holds execution until target UTC time. After Wait, proceeds to publish. Max 24h ahead is sufficient for daily content ops |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| First-comment hashtag posting | Industry best practice: caption stays clean, algorithm still picks up hashtags posted as first comment | LOW | After media_publish returns media_id, immediately `POST /<media_id>/comments` with message = hashtag block. Removes hashtags from main caption entirely. One extra API call per post | 
| CET/CEST-aware scheduling UX | User is in Spain; forcing UTC input creates cognitive overhead and timezone errors | LOW | Wizard accepts "09:00" and converts to UTC using Spain timezone offset (CET=+1, CEST=+2 April-October). Single conversion in wizard/run.js before sending to n8n. n8n receives a Unix timestamp, no timezone ambiguity |
| Publish status in Sheets with permalink | Closes audit trail: generation event + publish event in one row | LOW | Already planning to log; differentiator is including the live permalink so Felix can click directly from Sheets to view the post |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Native IG scheduling via API `publish_at` param | Seems like the right tool for scheduling | Does not exist. IG Graph API has no `publish_at` or `scheduled_publish_time` parameter on the media container endpoint. Confirmed in official docs. | Use n8n Wait node to hold execution until the target time, then publish. This is the correct pattern — already in the v1.1 plan |
| FB page scheduling via `scheduled_publish_time` | FB Pages API does support scheduling (min 10min, max 30 days, unix timestamp) | Adds a parallel scheduling code path for FB only, while IG uses Wait node. Two different patterns for one "schedule" concept creates bugs. | Keep both platforms on the same n8n Wait node path. Simpler, consistent. FB `scheduled_publish_time` is strictly optional value-add for v2+ |
| Analytics hooks at publish time | "We should track engagement while we're at it" | IG Insights API has a minimum wait of ~24h before engagement data is meaningful. Attaching analytics to the publish step adds latency and returns empty data. | Defer analytics to a separate scheduled workflow that runs 24h after publish. Flag for v1.2+ |
| A/B testing caption variants | "Let's test two versions" | Doubles complexity: two containers, two publishes, comparison logic. No good automated way to evaluate winner without analytics layer. | Build analytics first (v1.2), then A/B testing (v1.3). Do not include in v1.1 |
| Story publishing | "While we're publishing, Stories too" | Stories are ephemeral (24h), require different UX framing, and the Wizard generates Feed-optimized content. Stories require separate brief, different aspect ratio (9:16), different prompts. | Separate wizard flow for Stories. New milestone after v1.1 |
| Video support in carousels | "Can we mix images and video?" | IG carousel supports video but Ideogram generates images only. Video pipeline (generation, encoding, upload) is a separate project. | Image-only carousels for v1.1. Flag video as a future milestone |
| Manual caption editing before publish | "I want to tweak the text" | Creates interactive pause between SI approval and publish, breaking the full-automation model. Re-introduces human bottleneck. If content isn't good enough, regenerate with new angle in Wizard | If caption quality is the problem, improve GPT-4o prompt. Do not add editing step to publish pipeline |
| Multi-account publishing | "Can we publish to client accounts too?" | Requires managing multiple tokens, multiple account IDs, and approval routing per account. Not a single-pipeline concern. | Separate multi-tenant milestone. Out of scope for v1.1 |

---

## Feature Dependencies

```
[Image re-hosting to Azure Blob]
    └──required-by──> [IG container creation]
    └──required-by──> [FB photo upload]

[IG container creation]
    └──required-by──> [Container readiness polling]
                          └──required-by──> [IG publish (single)]
                          └──required-by──> [IG carousel publish]

[FB photo upload (published=false)]
    └──required-by──> [FB carousel post (attached_media)]

[IG publish] ──returns media_id──> [First-comment hashtag posting] (differentiator)
[IG publish] ──returns media_id──> [IG permalink retrieval]
[FB publish] ──returns post_id──> [FB URL construction]

[IG permalink + FB URL]
    └──required-by──> [WhatsApp success notification]
    └──required-by──> [Google Sheets log update with permalink]

[Wizard scheduling input (HH:MM)]
    └──required-by──> [CET/CEST → UTC conversion]
                          └──required-by──> [n8n Wait node target time]
                                                └──gates──> [Image re-hosting → publish chain]
```

### Dependency Notes

- **Image re-hosting must happen before any Meta API call** — Ideogram signed URLs expire and Meta containers poll the URL asynchronously. If the URL expires during polling, the container status goes to ERROR. Re-host first, use permanent URL in all subsequent API calls.
- **FB carousel needs a different upload pattern than IG** — FB does not have the same `is_carousel_item` pattern. Each image must be uploaded as an unpublished photo first (`/photos?published=false`), then the page post references them via `attached_media`. This is a separate code path in n8n from the IG carousel path.
- **First-comment hashtags is optional but order-sensitive** — must run immediately after `media_publish` returns, before the post appears in feeds, to ensure the comment is truly "first." If it fails, it fails silently (don't block the success notification).
- **Scheduling path merges into publishing path** — the Wait node is the only difference between "now" and "scheduled." After the Wait fires, the identical publish chain runs. Design the n8n workflow with this merge point explicit.

---

## MVP Definition (v1.1)

### Launch With

- [ ] **Image re-hosting to Azure Blob** — gating dependency for everything else. Without this, Meta rejects Ideogram URLs during container polling.
- [ ] **IG single-photo publish** — table stakes; simplest Meta API path.
- [ ] **IG carousel publish** — v1.0 generates carousels; v1.1 must publish them.
- [ ] **FB single-photo publish** — parity with IG; same content, different endpoint pattern.
- [ ] **FB carousel publish** — via `attached_media` pattern; needed for carousel parity.
- [ ] **Container readiness polling** — prevents premature publish attempts on async IG containers.
- [ ] **WhatsApp success notification** with IG permalink + FB URL — user needs confirmation.
- [ ] **WhatsApp failure notification** with error code and reason — user needs to know if something broke.
- [ ] **Google Sheets log update** — audit trail with publish status + permalink.
- [ ] **Scheduling: now path** — immediate publish after SI approval.
- [ ] **Scheduling: specific time path** — with CET/CEST → UTC conversion in Wizard + n8n Wait node.

### Add After Validation (v1.x)

- [ ] **First-comment hashtag posting** — move hashtags from caption to first comment. Low complexity, high SEO/algorithmic value. Add in v1.1 patch or v1.2 once core publish is stable.
- [ ] **Retry logic with exponential backoff** — v1.1 can start with single retry + notify on failure. Full 3-attempt backoff adds robustness; add after first real-world failure patterns are observed.

### Future Consideration (v2+)

- [ ] **IG Insights analytics** — requires 24h post-publish wait; build as separate scheduled workflow.
- [ ] **A/B caption testing** — requires analytics layer first.
- [ ] **Story publishing** — separate Wizard flow, different aspect ratio, different brief.
- [ ] **FB `scheduled_publish_time` native scheduling** — only valuable if n8n Wait node approach proves unreliable (it won't).
- [ ] **Multi-account publishing** — separate milestone for agency use case.
- [ ] **Video carousel support** — requires video generation pipeline.

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Image re-hosting (Azure Blob) | HIGH | MEDIUM | P1 |
| IG single-photo publish | HIGH | LOW | P1 |
| IG carousel publish | HIGH | MEDIUM | P1 |
| FB single-photo publish | HIGH | LOW | P1 |
| FB carousel publish | HIGH | MEDIUM | P1 |
| Container readiness polling | HIGH | LOW | P1 |
| WhatsApp success notification | HIGH | LOW | P1 |
| WhatsApp failure notification | HIGH | LOW | P1 |
| Google Sheets log update | MEDIUM | LOW | P1 |
| Scheduling: now path | HIGH | LOW | P1 |
| Scheduling: specific time path | MEDIUM | MEDIUM | P1 |
| First-comment hashtags | MEDIUM | LOW | P2 |
| Full retry logic (3 attempts) | MEDIUM | MEDIUM | P2 |
| Analytics hooks | LOW | HIGH | P3 |
| A/B testing | LOW | HIGH | P3 |
| Story publishing | LOW | HIGH | P3 |

---

## Key API Facts (verified against official Meta docs)

### Instagram Graph API — Publishing

- **Single photo:** `POST /<IG_ID>/media` (image_url, caption) → `POST /<IG_ID>/media_publish` (creation_id)
- **Carousel child:** `POST /<IG_ID>/media` (image_url, is_carousel_item=true) — no caption on children
- **Carousel parent:** `POST /<IG_ID>/media` (media_type=CAROUSEL, children=[ids], caption)
- **Publish:** `POST /<IG_ID>/media_publish` (creation_id) — same endpoint for all types
- **Container status:** `GET /<container_id>?fields=status_code` — poll until FINISHED or ERROR
- **Status codes:** FINISHED, IN_PROGRESS, EXPIRED (>24h), ERROR, PUBLISHED
- **Rate limit:** 100 published posts per 24h (carousel = 1 post)
- **Permalink after publish:** `GET /<media_id>?fields=permalink` — returns direct URL
- **No native scheduling** — `publish_at` does not exist on this API
- **First comment:** `POST /<media_id>/comments` with `message` param — works immediately after publish

### Facebook Pages API — Publishing

- **Single photo:** `POST /<PAGE_ID>/photos` (url, caption) — immediate publish
- **Unpublished photo (for carousel):** `POST /<PAGE_ID>/photos` (url, published=false) → returns `id` (media_fbid)
- **Multi-image post:** `POST /<PAGE_ID>/feed` (message, attached_media=[{media_fbid:...},...])
- **Scheduled post:** `POST /<PAGE_ID>/feed` (message, published=false, scheduled_publish_time=unix_timestamp) — min 10min, max 30 days ahead. Do NOT use in v1.1 — use Wait node instead for consistency
- **Permalink:** `GET /<post_id>?fields=permalink_url` — or construct as `https://www.facebook.com/<post_id>`

### Error Codes to Handle

| Code | Meaning | Action |
|------|---------|--------|
| 1 | API Unknown / temporary downtime | Retry with backoff |
| 2 | API Service unavailable | Retry with backoff |
| 4 | Too many API calls | Retry after delay |
| 17 | User rate limit | Retry after delay |
| 190 | Access token expired | Abort, notify Felix immediately — token needs refresh |
| 200-299 | Permission error | Abort, notify — permissions misconfigured |
| 506 | Duplicate post | Abort — content already published (usually from double-tap SI) |

---

## Pipeline Integration Map

| Feature | Connects To (existing) | New Component Needed |
|---------|------------------------|----------------------|
| Image re-hosting | n8n workflow (after image generation nodes) | Azure Blob Storage account + container. HTTP Request node with PUT + SAS URL |
| IG/FB publish | n8n workflow (after SI approval webhook) | New n8n nodes: HTTP Request × 3-5 per platform per post type |
| Container polling | n8n workflow | Wait node (15-30s) + IF loop checking status_code |
| Scheduling | Wizard (wizard/run.js) prompts for time | Time input → UTC conversion in Wizard → Wait node in n8n |
| Success notification | YCloud WhatsApp (existing node) | New message template with permalink URLs |
| Failure notification | YCloud WhatsApp (existing node) | New message template with error details |
| Sheets log | Google Sheets node (existing) | New columns: publish_status, ig_permalink, fb_url, published_at |

---

## Sources

- [Instagram Content Publishing — Meta Developer Docs](https://developers.facebook.com/docs/instagram-platform/content-publishing/) — HIGH confidence
- [IG User Media endpoint — Meta Developer Docs](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/) — HIGH confidence
- [IG Media reference — Meta Developer Docs](https://developers.facebook.com/docs/instagram-platform/reference/instagram-media/) — HIGH confidence
- [Facebook Pages API Posts — Meta Developer Docs](https://developers.facebook.com/docs/pages-api/posts/) — HIGH confidence (scheduling params verified)
- [Graph API Error Handling — Meta Developer Docs](https://developers.facebook.com/docs/graph-api/guides/error-handling/) — HIGH confidence
- [n8n workflow: Instagram carousel + Graph API (template 3693)](https://n8n.io/workflows/3693-create-and-publish-instagram-carousel-posts-with-gpt-41-mini-imgur-and-graph-api/) — MEDIUM confidence (pattern verified)
- [n8n workflow: Schedule + publish all IG types (template 4498)](https://n8n.io/workflows/4498-schedule-and-publish-all-instagram-content-types-with-facebook-graph-api/) — MEDIUM confidence
- [Azure Blob Storage REST API — Microsoft Learn](https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob) — HIGH confidence
- [n8n Azure Storage node docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.azurestorage/) — MEDIUM confidence (existence verified, SAS support unclear — HTTP Request node fallback confirmed)

---

*Feature research for: Instagram + Facebook automatic publishing pipeline*
*Milestone: v1.1 of Propulsar Content Engine*
*Researched: 2026-04-10*
