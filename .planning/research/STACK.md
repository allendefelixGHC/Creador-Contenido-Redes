# Stack Research

**Domain:** Social media auto-publishing — Meta Graph API + Azure Blob Storage + n8n scheduling
**Researched:** 2026-04-10
**Confidence:** HIGH (all critical claims verified against official Meta docs and n8n docs/GitHub)
**Milestone:** v1.1 — Automatic Publishing to Instagram + Facebook

---

## Context

This is an additive research file. The existing stack (Node.js Wizard, n8n 2.14.2 on Azure Container Apps,
GPT-4o, Flux/Ideogram/Nano Banana, YCloud WhatsApp, Supabase, Google Sheets) is validated and
out-of-scope here. This document covers only the NEW components needed to extend the pipeline
after the SI approval gate: image re-hosting → scheduling → publishing → notify.

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Meta Graph API | v22.0 (use v22, not v25) | Instagram + Facebook publishing | v22 is stable; v25 is latest but churning. Use explicit version in all URLs to avoid silent breaking changes when Meta sunsets versions. |
| n8n Azure Storage node | Built-in (`n8n-nodes-base.azurestorage`) | Upload AI-generated images to Azure Blob | Native node avoids the HTTP Request complexity. Confirmed to support blob create/get/delete operations. Account Key auth works out-of-the-box. |
| n8n Wait node (At Specified Time) | n8n 2.14.2+ | Schedule deferred publishing | As of n8n 2.16.0 (Apr 2026), Wait node is fully durable — persists to DB for ALL durations. On 2.14.2 waits > 65s persist to DB and survive restarts. Waits < 65s on 2.14.2 are in-memory only (pre-durability fix). |

### Supporting Configuration

| Item | Value | Purpose | Notes |
|------|-------|---------|-------|
| Azure Blob container public access | `Blob` level (not `Container`) | Meta needs a public HTTPS URL to ingest the image | Set `AllowBlobPublicAccess = true` at storage account level first, then container permission = `Blob`. Meta fetches and caches the image; after ~24h the blob can be deleted. |
| Meta token type | Long-lived Page Access Token | Authenticate all Graph API calls | Page tokens do NOT expire by time. They are invalidated only by: password change, suspicious activity flag, admin role loss, or explicit revocation. No cron refresh needed. |
| Required IG permissions | `instagram_business_content_publish`, `instagram_business_basic` | Publish to Instagram via Facebook Login path | The older `instagram_content_publish` scope still works but is the legacy Facebook Login path. Use `instagram_business_*` for new integrations. |
| Required FB permissions | `pages_manage_posts`, `pages_read_engagement`, `pages_show_list` | Publish to Facebook Page | All three required for page-level publishing. |

---

## API Endpoints — Complete Reference

### Instagram Single Photo Publish (2-step)

```
Step 1 — Create container:
POST https://graph.instagram.com/v22.0/{IG_USER_ID}/media
  ?image_url={PUBLIC_HTTPS_URL}
  &caption={CAPTION_TEXT}
  &access_token={PAGE_ACCESS_TOKEN}

Returns: { "id": "<CONTAINER_ID>" }

Wait ~30s for container to be ready (check with GET /<CONTAINER_ID>?fields=status_code)

Step 2 — Publish container:
POST https://graph.instagram.com/v22.0/{IG_USER_ID}/media_publish
  ?creation_id={CONTAINER_ID}
  &access_token={PAGE_ACCESS_TOKEN}

Returns: { "id": "<IG_MEDIA_ID>" }
```

### Instagram Carousel Publish (3-step)

```
Step 1 — Create a child container for EACH image (loop, max 10):
POST https://graph.instagram.com/v22.0/{IG_USER_ID}/media
  ?image_url={PUBLIC_HTTPS_URL_FOR_IMAGE_N}
  &is_carousel_item=true
  &access_token={PAGE_ACCESS_TOKEN}

Returns: { "id": "<CHILD_CONTAINER_ID_N>" }

Step 2 — Create parent carousel container:
POST https://graph.instagram.com/v22.0/{IG_USER_ID}/media
  ?media_type=CAROUSEL
  &caption={CAPTION_TEXT}
  &children={CHILD_ID_1},{CHILD_ID_2},...
  &access_token={PAGE_ACCESS_TOKEN}

Returns: { "id": "<CAROUSEL_CONTAINER_ID>" }

Step 3 — Publish carousel:
POST https://graph.instagram.com/v22.0/{IG_USER_ID}/media_publish
  ?creation_id={CAROUSEL_CONTAINER_ID}
  &access_token={PAGE_ACCESS_TOKEN}
```

### Instagram Rate Limit Check

```
GET https://graph.instagram.com/v22.0/{IG_USER_ID}/content_publishing_limit
  ?fields=config,quota_usage
  &access_token={PAGE_ACCESS_TOKEN}

Limit: 100 API-published posts per 24-hour rolling window.
Carousels count as 1 post (not per image).
```

### Facebook Single Photo Publish

```
POST https://graph.facebook.com/v22.0/{PAGE_ID}/photos
  ?url={PUBLIC_HTTPS_URL}
  &caption={CAPTION_TEXT}
  &published=true
  &access_token={PAGE_ACCESS_TOKEN}

Returns: { "id": "<PHOTO_ID>", "post_id": "<POST_ID>" }
```

### Facebook Carousel Publish (multi-photo post)

```
Step 1 — Upload each photo as unpublished:
POST https://graph.facebook.com/v22.0/{PAGE_ID}/photos
  ?url={PUBLIC_HTTPS_URL_FOR_IMAGE_N}
  &published=false
  &access_token={PAGE_ACCESS_TOKEN}

Returns: { "id": "<PHOTO_FB_ID_N>" }

Step 2 — Create feed post with attached_media:
POST https://graph.facebook.com/v22.0/{PAGE_ID}/feed
  ?message={CAPTION_TEXT}
  &attached_media[0]={"media_fbid":"<PHOTO_FB_ID_1>"}
  &attached_media[1]={"media_fbid":"<PHOTO_FB_ID_2>"}
  ...
  &access_token={PAGE_ACCESS_TOKEN}
```

---

## n8n Wait Node — Scheduling Behavior on Azure Container Apps

### How it works

The Wait node in "At Specified Time" mode pauses execution, serializes state to the n8n database (PostgreSQL/SQLite), and resumes when the target timestamp is reached via a polling loop.

**Critical threshold on n8n 2.14.2:**
- Waits > 65 seconds: persisted to DB → survive n8n restarts
- Waits < 65 seconds: in-memory only via `setTimeout` → lost on restart

The full durability fix (all durations to DB) merged in n8n v2.16.0 (released 2026-04-07). Since the project runs 2.14.2, scheduling windows > 65 seconds are safe.

**Practical implication:** For scheduling social posts (e.g., "publish tomorrow at 9am"), the wait duration will always be >>65s. The 65s threshold is not a real-world concern.

### Execution timeout — does it conflict?

n8n environment variable `EXECUTIONS_TIMEOUT` defaults to `-1` (unlimited). An execution in "waiting" state is NOT counted against the workflow timeout — it is suspended in DB, not running. The timeout only applies to the active computation phases (before and after the wait). This means a workflow can wait indefinitely (days, weeks) without hitting timeout.

**Action required:** Verify `EXECUTIONS_TIMEOUT` is `-1` (or unset) in the Azure Container Apps environment variables for propulsar-n8n. If someone set it to a low value (e.g., 300s), the execution would be killed while in waiting state.

### Azure Container Apps — no special timeout concern

Azure Container Apps does not impose HTTP request timeouts on background n8n queue workers. The timeout concern only applies to inbound HTTP triggers (webhook responses). A scheduled execution sleeping in the DB is not affected by ACA request timeout policies.

---

## Azure Blob Storage — Integration Strategy

### Recommended approach: n8n Azure Storage node (native)

Use the built-in `n8n-nodes-base.azurestorage` node instead of HTTP Request + manual SAS construction.

**Supported operations (confirmed):**
- Blob: Create, Get, Delete, Get Many
- Container: Create, Delete, Get, Get Many

**Authentication:** Account Key (from Azure Portal → Storage Account → Access Keys). Store in n8n credentials, not hardcoded.

**Why not SAS tokens:** n8n community confirmed SAS token support is not native in the Azure Storage node — it requires embedding the SAS in the HTTP Request URL manually. Account Key via the native node is simpler and equally secure for a self-hosted internal workflow.

**Why not Managed Identity:** Azure Container Apps can use Managed Identity, but the n8n Azure Storage node credential dialog expects Account Name + Account Key. Managed Identity would require the HTTP Request node approach. Not worth the complexity.

### Public URL strategy

Meta's Graph API requires a publicly accessible HTTPS URL when creating an IG media container. The workflow to achieve this with Azure Blob:

1. Upload blob to Azure Storage container named `content-images` (or similar)
2. Container access level: `Blob` (not `Container`) — individual blobs are public, container listing is private
3. The resulting public URL format: `https://{STORAGE_ACCOUNT}.blob.core.windows.net/content-images/{BLOB_NAME}`
4. Pass this URL to the IG/FB Graph API endpoints
5. After 24 hours (Meta has ingested and cached), delete the blob via a cleanup step or Azure lifecycle policy

**Storage account setup (one-time, in Azure Portal):**
1. Storage account → Configuration → "Allow Blob anonymous access" → Enabled
2. Container → Change Access Level → "Blob (anonymous read access for blobs only)"

**WARNING:** New Azure storage accounts created after 2023 have `AllowBlobPublicAccess = false` by default as a security hardening measure. You must explicitly enable it. This is a known gotcha when provisioning new storage.

### Blob naming convention

```
{timestamp}-{post_type}-{image_index}.jpg
Example: 20260410T090000-carousel-01.jpg
```

Avoids collisions, easy to sort, easy to set lifecycle deletion rules on.

---

## Meta Token Management

### Long-lived Page Access Token — current understanding

| Property | Value |
|----------|-------|
| Token type | Long-lived Page Access Token |
| Expiration | Does NOT expire by time |
| How to generate | Exchange short-lived user token → long-lived user token (60 days) → derive page token (permanent) |
| When it's invalidated | Password change, suspicious activity, admin role removal, explicit revocation via Meta API/UI |
| Stored in | n8n credential (HTTP Request header) or as environment variable in Azure Container Apps |

### What breaks if Susana loses admin role

If Susana is removed as admin of the Propulsar Facebook Page, the Page Access Token derived from her user session is immediately invalidated. ALL Graph API calls (IG + FB publishing) will return `OAuthException: Error validating access token`.

**Mitigation:** Create a Meta System User (Business Manager → System Users) tied to the Propulsar Business Manager account, not a personal profile. System User tokens are not tied to any individual's employment or admin status. This is the production-grade approach. However, current tokens (already verified working per memory) are derived from Susana's session — this is acceptable for v1.1 but flag for future hardening.

**Detection in n8n:** Any Graph API HTTP Request node should have error handling that sends a Telegram/WhatsApp alert if it receives `OAuthException` error code, to avoid silent publishing failures.

---

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| n8n Azure Storage node (native) | HTTP Request + SAS token | SAS token not natively supported in credential UI; embedding in URL works but requires manual SAS generation logic in Code node (no `require()` in n8n 2.14.2 Code nodes) |
| n8n Azure Storage node (native) | Cloudinary / Imgur for temp image hosting | Third-party services add a dependency that can change pricing, TOS, or availability; Azure is already in the infrastructure |
| Wait node "At Specified Time" | Separate scheduling database + cron trigger | Over-engineered; Wait node persists to DB and survives restarts for durations we'll use (minutes to hours); Supabase already used but adding scheduler logic there is unnecessary complexity |
| Graph API v22 | Graph API v25 (latest) | v25 is current but very new; v22 is stable and supported through at least 2026. Always pin explicit version in URLs. |
| Long-lived Page Token | Short-lived token + OAuth refresh flow | Short-lived tokens expire in 1 hour; n8n has no built-in Meta OAuth refresh mechanism; Page tokens are permanent when derived correctly |
| Meta System User token (future) | Susana's personal admin token (current) | System User tokens are not tied to personal admin status — preferred for production. Current approach acceptable for v1.1. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Midjourney API | No official API exists; third-party wrappers violate TOS and risk account ban | Already using Flux/Ideogram/Nano Banana — no change needed |
| `graph.facebook.com` for Instagram publishing | Works but deprecated path; IG Graph API moved to `graph.instagram.com` | Use `graph.instagram.com/v22.0/{IG_USER_ID}/media` |
| Unsigned Azure Blob URLs from private containers | Meta will get 403 trying to fetch the image | Use public-access-level container or SAS URL with sufficient expiry |
| n8n Wait node for waits < 65 seconds on v2.14.2 | Sub-65s waits are in-memory only on this version and lost on restart | Only use for durations > 65 seconds, which all scheduling use cases will be |
| Anonymous (`Container` level) access on Azure Blob | Exposes container blob listing — unnecessary surface | Use `Blob` level access only — blobs are public, listing is private |
| Separate Node.js microservice for publishing | Adds infrastructure complexity; everything must stay in n8n per project constraints | All logic via n8n HTTP Request + Azure Storage + Wait nodes |

---

## Stack Patterns by Variant

**If publishing a single photo post:**
- Upload 1 blob → get public URL → single `POST /{IG_USER_ID}/media` → wait ~30s → `POST /media_publish` → `POST /{PAGE_ID}/photos`
- Use a single n8n "HTTP Request" node per API call

**If publishing a carousel post (2-10 images):**
- Upload N blobs → get N public URLs → loop with n8n "Loop Over Items" creating N child IG containers → create parent carousel container → publish → create FB carousel via `attached_media` array
- The FB carousel step requires the "Code" node to build the `attached_media` array dynamically (no native FB carousel node in n8n)

**If post is scheduled (future publish time):**
- Insert n8n "Wait" node (At Specified Time) between approval and publishing steps
- Dynamic timestamp from the brief JSON field `scheduled_at` (ISO 8601)
- Ensure `EXECUTIONS_TIMEOUT=-1` in Azure Container Apps env vars

**If token becomes invalid:**
- Graph API returns HTTP 400 with `OAuthException`
- n8n workflow should have error branch → YCloud WhatsApp alert to Felix → manual token refresh flow documented in SETUP.md

---

## Version Compatibility

| Component | Version | Compatible With | Notes |
|-----------|---------|-----------------|-------|
| n8n | 2.14.2 | Azure Storage node (built-in) | Full compatibility; Azure Storage node is a core built-in |
| n8n | 2.14.2 | Wait node "At Specified Time" | Works; waits >65s persist to DB and survive restarts |
| n8n | 2.14.2 | HTTP Request node for Graph API | Full compatibility; use Headers for auth token |
| Meta Graph API | v22.0 | n8n HTTP Request node | No SDK needed; pure REST calls |
| Azure Blob REST API | 2024-08-04 (latest) | n8n Azure Storage node | Node handles API versioning internally |

---

## No New npm Packages Required

The entire v1.1 publishing pipeline runs entirely within n8n using:
- Built-in Azure Storage node
- Built-in HTTP Request node
- Built-in Wait node
- Built-in Code node (for dynamic `attached_media` array construction)

No new Node.js packages are needed in `wizard/run.js` or any `scripts/` file. The Wizard already sends the brief webhook — v1.1 adds a `scheduled_at` field to the brief JSON (optional, defaults to immediate publish if absent).

---

## Sources

- [Meta Instagram Content Publishing Docs](https://developers.facebook.com/docs/instagram-platform/content-publishing/) — endpoint reference, permissions, rate limits (HIGH confidence, official)
- [Meta Graph API Page Photos Reference](https://developers.facebook.com/docs/graph-api/reference/page/photos/) — FB page photo publish + carousel `attached_media` (HIGH confidence, official)
- [Meta Long-Lived Token Guide](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/) — page token lifetime and invalidation conditions (HIGH confidence, official)
- [n8n PR #27066 — Wait Node Full Durability](https://github.com/n8n-io/n8n/pull/27066) — confirmed v2.16.0 merges full DB persistence for all wait durations; v2.14.2 behavior (65s threshold) documented (HIGH confidence, official GitHub)
- [n8n Executions env vars docs](https://docs.n8n.io/hosting/configuration/environment-variables/executions/) — `EXECUTIONS_TIMEOUT` defaults to -1 (unlimited) (MEDIUM confidence, WebSearch confirmed)
- [Azure Blob Anonymous Access Configure](https://learn.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-configure) — public blob URL setup, account-level AllowBlobPublicAccess requirement (HIGH confidence, official Microsoft Learn, updated 2025-03-04)
- [n8n Azure Storage node docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.azurestorage/) — supported operations confirmed (MEDIUM confidence, WebSearch + community)
- [n8n community: Azure Blob SAS token thread](https://community.n8n.io/t/azure-blob-storage-support-for-sas-tokens/112080) — SAS not natively supported in credential UI (MEDIUM confidence, community)
- [n8n workflow template: Schedule & publish all Instagram content types](https://n8n.io/workflows/4498-schedule-and-publish-all-instagram-content-types-with-facebook-graph-api/) — confirms Graph API approach in n8n (MEDIUM confidence, community template)
- [Meta Graph API v22 Changelog](https://developers.facebook.com/docs/graph-api/changelog/version22.0) — version reference (HIGH confidence, official)

---

*Stack research for: Propulsar Content Engine v1.1 — Automatic Publishing*
*Researched: 2026-04-10*
