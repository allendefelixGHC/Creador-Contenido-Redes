# Phase 6: Facebook Single-Photo Publishing — Research

**Researched:** 2026-04-17
**Domain:** Meta Graph API v22 (Facebook Pages photo publishing), n8n HTTP Request node, WhatsApp YCloud notification, Google Sheets logging
**Confidence:** HIGH (FB pages photo endpoint from official docs + community cross-verification), HIGH (post_id URL construction from multiple sources), HIGH (n8n patterns from Phase 5 proven patterns)

---

## Summary

Phase 6 extends the existing Instagram publish chain by inserting a Facebook photo publish step immediately after `✅ Notify WhatsApp Success` (or after `🔗 IG: Get Permalink`) and before `📊 Google Sheets Log`. The Facebook publish uses `POST /{FACEBOOK_PAGE_ID}/photos` via `graph.facebook.com/v22.0`, which is the same host already confirmed working in Phase 5. The endpoint accepts `url` (the same Azure Blob URL used for IG), `message` (the facebook_caption already stored in Merge Rehost Output), and `access_token`. It returns `{ id, post_id }` where `post_id` has the format `{page_id}_{photo_id}`. The public FB post URL is constructed without a second API call: `https://www.facebook.com/{post_id}` (redirect to canonical URL) or directly from the `post_id` components. A second GET call for `permalink_url` is possible but unnecessary.

The WhatsApp success message already exists as `✅ Notify WhatsApp Success` but currently only sends the IG URL. Phase 6 must update this node's `jsonBody` to include both IG URL and FB URL in a single message. The Google Sheets `FB_URL` column already exists (declared as empty string in Phase 5 per decision log) and only needs the expression value updated.

The entire phase adds exactly **2 new nodes** (FB publish HTTP Request + FB URL construction Code node OR inline expression) and **modifies 2 existing nodes** (Notify WhatsApp Success, Google Sheets Log). No new credentials, env vars, or external services are required.

**Primary recommendation:** Insert 1 new HTTP Request node (`🌐 FB: Publish Photo`) between `🔗 IG: Get Permalink` and `✅ Notify WhatsApp Success`. Update `✅ Notify WhatsApp Success` to cross-ref the FB post_id and construct the FB URL inline in the expression. Update `📊 Google Sheets Log` to populate `FB_URL`. Total: 1 new node + 2 node updates.

---

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| n8n HTTP Request node | typeVersion 4.2 | POST to Facebook Pages /photos endpoint | Already used for all Meta API calls throughout the workflow |
| Meta Graph API | v22.0 | Facebook photo publishing | Same version as IG (Phase 5), confirmed working with Susana's Page token |
| Host: `graph.facebook.com` | — | All Meta Graph API calls | Confirmed in Phase 5 Plan 02: graph.instagram.com rejects Page tokens (401) — must use graph.facebook.com |
| Azure Blob URL (from Phase 4) | — | `url` parameter for FB photo upload | Same permanent blob URL already used for IG container creation — no new upload needed |

### No New External Dependencies

Phase 6 adds zero new npm packages, zero new credentials, zero new env vars. All required env vars are already in the Azure Container App:
- `META_PAGE_TOKEN` — Page Access Token from Susana's account
- `FACEBOOK_PAGE_ID` — Facebook Page ID (declared in `.env.example`, must be set in n8n Container App env)
- `YCLOUD_API_KEY`, `YCLOUD_WHATSAPP_NUMBER`, `WHATSAPP_APPROVAL_NUMBER` — already used
- `GOOGLE_SHEETS_ID` — already used

**Critical pre-flight check:** Verify `FACEBOOK_PAGE_ID` is set in the n8n Azure Container App environment variables. It exists in `.env.example` but may not have been pushed to the Container App if it was only set up for IG in Phase 5.

---

## Architecture Patterns

### Recommended Node Layout for Phase 6

Current end-chain (after Phase 5):
```
🔗 Merge Rehost Output
   → 📤 IG: Create Container
   → ⏳ Wait 30s (container ready)
   → 🚀 IG: media_publish
   → 🔗 IG: Get Permalink
   → ✅ Notify WhatsApp Success   [currently IG URL only]
   → 📊 Google Sheets Log         [FB_URL currently = ""]
```

Phase 6 becomes:
```
🔗 Merge Rehost Output
   → 📤 IG: Create Container
   → ⏳ Wait 30s (container ready)
   → 🚀 IG: media_publish
   → 🔗 IG: Get Permalink          [output: { id, permalink }]
   → 🌐 FB: Publish Photo  [NEW]   [output: { id, post_id }]
   → ✅ Notify WhatsApp Success   [UPDATED: includes both IG + FB URLs]
   → 📊 Google Sheets Log         [UPDATED: FB_URL = constructed from post_id]
```

**Why FB publish goes AFTER permalink GET (not in parallel):**
n8n's simple sequential chain is the most reliable pattern for this project. Parallelizing IG and FB publish (via a Split node) would require a Merge node to rejoin — and Set v3 cross-refs in fan-out chains have caused silent data drops (established pitfall from Phase 4). Sequential is safer, adds only ~1-2 seconds to total time, and keeps the chain auditable.

**Why FB publish goes BEFORE Notify WhatsApp:**
The WhatsApp success message must include BOTH URLs (success criterion 2). Therefore FB must complete before the notification fires. This is the only valid ordering.

### Pattern: Facebook Single-Photo Publish via /photos

**What:** POST to `/{PAGE_ID}/photos` with `url` (blob URL) + `message` (caption) + `access_token`
**When to use:** Any time a single-image post needs to publish to a Facebook Page
**Returns:** `{ id: "<photo_id>", post_id: "<page_id>_<photo_id>" }` where `post_id` is the feed post identifier

**Public URL construction (no extra API call needed):**
- `post_id` format: `{page_id}_{photo_id}` (e.g., `"546349135390552_1116692711689522"`)
- Canonical URL: `https://www.facebook.com/{post_id}` — Facebook redirects this to the full post URL
- Alternative direct format: `https://www.facebook.com/{page_id}/posts/{photo_id}` — also works
- **Recommended:** use `https://www.facebook.com/` + `$json.post_id` (simplest, no string splitting)

**No permalink_url GET needed:** Unlike IG's `media_publish` which returns only `{ id }` requiring a follow-up GET for the permalink, the FB `/photos` endpoint returns `post_id` directly in the publish response. The URL is constructable without a second API call.

### Anti-Patterns to Avoid

- **Parallelizing IG + FB publish with a Split node:** Requires a Merge node for rejoin; Set v3 fan-out cross-refs silently drop data (Phase 4 established pitfall). Not worth the 1-2s parallelism gain.
- **Using `graph.instagram.com` for the FB call:** Confirmed 401 in Phase 5 — always use `graph.facebook.com` for Page token calls.
- **Sending two separate WhatsApp messages (one for IG, one for FB):** Success criterion 2 requires ONE combined message. Update the existing `✅ Notify WhatsApp Success` node, do not add a second WA node.
- **Not logging `FB_URL` cross-referenced from the FB publish node:** The Sheets Log node's `$json` at execution time is the output of `📊 Google Sheets Log`'s upstream node (the WA notification response). Must use `$('🌐 FB: Publish Photo').item.json.post_id` cross-ref.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| FB URL construction | Custom URL builder script | Inline expression `'https://www.facebook.com/' + $json.post_id` | `post_id` from the /photos response already has `{page_id}_{photo_id}` format; simple string concat is sufficient |
| FB photo upload | Multipart form-data upload | `url` parameter (server-side fetch) | FB API fetches the image from the URL server-side — same pattern as IG container creation, no binary upload needed |
| FB post deduplication | Custom idempotency key | Rely on sequential execution + no retry on this call | Unlike `media_publish`, `/photos` with a duplicate `url` will create a NEW post (not idempotent) but retry risk is managed by disabling retryOnFail |

**Key insight:** The `/photos` endpoint is simpler than IG's 2-step flow. Single call, single response with the post_id. No container, no wait, no separate permalink GET.

---

## Common Pitfalls

### Pitfall 1: `$json.post_id` is undefined in the Sheets Log node
**What goes wrong:** `FB_URL` column in Sheet logs as blank/undefined.
**Why it happens:** At `📊 Google Sheets Log`, `$json` is the output of `✅ Notify WhatsApp Success` (the YCloud API response), NOT the FB publish response. The `post_id` is not in `$json`.
**How to avoid:** Use a cross-node reference: `$('🌐 FB: Publish Photo').item.json.post_id` in the `FB_URL` expression of the Sheets Log node.
**Warning signs:** `FB_URL` column is empty despite FB publish succeeding; no error thrown.

### Pitfall 2: `$json.post_id` is undefined in the Notify WhatsApp node
**What goes wrong:** WhatsApp success message says "undefined" for FB URL.
**Why it happens:** If FB publish node is wired AFTER Notify WhatsApp, `$json` at the WA node is the IG permalink response — no `post_id` present.
**How to avoid:** Wire FB publish BEFORE Notify WhatsApp (mandatory per success criterion 2). Use `$('🌐 FB: Publish Photo').item.json.post_id` cross-ref in the WA jsonBody expression.
**Warning signs:** WhatsApp message contains "undefined" or is missing the FB URL entirely.

### Pitfall 3: `FACEBOOK_PAGE_ID` not in n8n Container App env vars
**What goes wrong:** `{{ $env.FACEBOOK_PAGE_ID }}` resolves to empty string at runtime; FB publish POST goes to `graph.facebook.com/v22.0//photos` (double slash, 404).
**Why it happens:** `FACEBOOK_PAGE_ID` exists in `.env.example` but may not have been pushed to the Azure Container App env during Phase 5 setup (Phase 5 only needed IG-specific env vars).
**How to avoid:** Verify env var presence BEFORE running Phase 6 E2E test. Run `az containerapp show --name n8n --resource-group <rg> --query "properties.template.containers[0].env[?name=='FACEBOOK_PAGE_ID']"` or check Azure Portal.
**Warning signs:** HTTP 404 from graph.facebook.com on the FB publish call; URL in n8n execution trace shows empty segment.

### Pitfall 4: Retry enabled on FB photo publish causes duplicate FB posts
**What goes wrong:** Two identical photos appear on the Propulsar Facebook page.
**Why it happens:** `POST /{PAGE_ID}/photos` is NOT idempotent — the same URL + message creates a new post on each call. If n8n retries after a timeout where Meta already processed the request, a duplicate live post is created.
**How to avoid:** Set `retryOnFail: false` on the FB publish node (same reasoning as `media_publish` for IG). This is the non-negotiable safety constraint.
**Warning signs:** Two posts with same caption and image appear on Facebook page.

### Pitfall 5: `facebook_caption` is null/undefined in Merge Rehost Output
**What goes wrong:** FB post publishes with no caption (empty `message` field).
**Why it happens:** The GPT-4o content parser (`🔧 Parsear contenido`) sets `facebook: parsed.facebook || null`. The `Guardar sesión Supabase` saves `facebook_caption: ($json.facebook && $json.facebook.caption) || null`. The `🔗 Re-attach session data` restores `facebook: <object>`. The `🔗 Merge Rehost Output` propagates `facebook_caption` from `Prep Re-host Input`. This chain works correctly IF GPT-4o returns a `facebook` key in its JSON response. If the GPT-4o prompt doesn't request a `facebook` field, it will be null throughout.
**How to avoid:** Verify the GPT-4o system prompt in the `🤖 GPT-4o — Texto` node requests both `instagram` and `facebook` objects. Also verify `Merge Rehost Output` has `facebook_caption` in its assignments (it does — confirmed in workflow.json inspection). For the FB publish node, use a fallback: `$('🔗 Merge Rehost Output').item.json.facebook_caption || $('🔗 Merge Rehost Output').item.json.instagram_caption || ''`.
**Warning signs:** FB post publishes with no caption; Sheet row has empty `facebook_caption` but non-empty `instagram_caption`.

### Pitfall 6: Google Sheets row logging still empirically unconfirmed from Phase 5
**What goes wrong:** Sheets logging may silently fail on the first Phase 6 run, continuing a known gap.
**Why it happens:** Phase 5 Plan 02 SUMMARY notes that "no execution completed with the fully corrected Sheets config" (after 827af90 fix). The structural config is correct but live row creation was not observed.
**How to avoid:** Make the first Phase 6 test run specifically verify that a row appears in the Sheet. If it fails, diagnose the Sheets node error in the n8n execution trace before declaring Phase 6 complete.
**Warning signs:** Phase 6 E2E test shows IG post + FB post + WA message all succeeded, but no new row in the Sheet.

---

## Per-Question Research Answers

### Q1: Facebook Pages photo publish endpoint — exact spec

**Confidence:** HIGH (official Meta Graph API docs)

```
POST https://graph.facebook.com/v22.0/{FACEBOOK_PAGE_ID}/photos
Content-Type: application/json
```

**Required parameters:**
- `url` — publicly accessible URL of the image (use Azure Blob URL — same as IG container creation)
- `access_token` — Page Access Token (Susana's `META_PAGE_TOKEN`)
- Either `url` OR multipart upload — use `url` (no binary upload complexity)

**Optional but useful:**
- `message` — the caption text (use `facebook_caption` from `Merge Rehost Output`)
- `published` — defaults to `true` (publish immediately). Use default — no scheduling in Phase 6.

**Response:**
```json
{
  "id": "1116692661689527",
  "post_id": "546349135390552_1116692711689522"
}
```
- `id` — the Photo object ID (not the feed post)
- `post_id` — the feed Post object ID in format `{page_id}_{photo_id}` — use this for the URL

**Required permissions on the Page Access Token:**
- `pages_manage_posts` — to create posts
- `pages_read_engagement` — to read page info
- `pages_show_list` — for Page visibility

Susana's long-lived Page Access Token from Phase 5 already covers these permissions (same token used for IG content publishing). Confirm with a cheap pre-flight call if in doubt.

**Image format requirements:**
- `.jpeg`, `.bmp`, `.png`, `.gif`, `.tiff`
- Max 4 MB (FB limit; Azure Blob images generated by Flux/Ideogram/Nano Banana are JPEG, well under 4 MB)
- FB resizes and strips EXIF metadata before publishing

> Sources: [Meta Graph API — Page /photos](https://developers.facebook.com/docs/graph-api/reference/page/photos/) · [Meta Graph API — Photo object](https://developers.facebook.com/docs/graph-api/reference/photo/)

---

### Q2: Constructing the FB post public URL

**Confidence:** HIGH (multiple cross-verified sources)

The `post_id` returned by `POST /{PAGE_ID}/photos` follows the format `{page_id}_{photo_id}`.

**URL construction (choose one — all work):**

1. **Simplest (recommended):** `https://www.facebook.com/{post_id}` — FB redirects to canonical URL
   - n8n expression: `'https://www.facebook.com/' + $json.post_id`
   - Example: `https://www.facebook.com/546349135390552_1116692711689522`

2. **Direct format:** `https://www.facebook.com/{page_id}/posts/{photo_id}` — canonical URL, no redirect
   - Requires splitting `post_id` on `_`: `post_id.split('_')[0]` and `post_id.split('_')[1]`
   - n8n expression: `'https://www.facebook.com/' + $json.post_id.split('_')[0] + '/posts/' + $json.post_id.split('_')[1]`
   - More complex, same result — not recommended

**No additional GET call needed.** Unlike IG's `media_publish` which only returns `{ id }` (requiring a follow-up GET for `permalink`), the FB `/photos` endpoint includes `post_id` in the publish response. The URL is constructable immediately.

**Confirmed post_id format from community:**
> `"post_id":"546349135390552_1116692711689522"` — from verified Graph API response example

> Sources: n8n community thread "Facebook API: How to Get Post URL with Post ID Only?" · Meta Graph API Post object reference · WebSearch cross-verification

---

### Q3: Caption source — which field to use

**Confidence:** HIGH (verified from workflow.json inspection)

At the time the FB publish node executes, `$json` is the output of `🔗 IG: Get Permalink` = `{ id, permalink }`. The caption data lives in `🔗 Merge Rehost Output`.

**Expression for FB publish node `message` field:**
```
$('🔗 Merge Rehost Output').item.json.facebook_caption || $('🔗 Merge Rehost Output').item.json.instagram_caption || ''
```

**Why the fallback chain:**
- `facebook_caption` is the primary source — it's generated by GPT-4o specifically for Facebook (different tone/format than IG)
- `instagram_caption` fallback — if GPT-4o didn't generate a facebook field, IG caption is better than nothing
- `''` final fallback — publish succeeds even with no caption (valid API call)

**Data flow verified:**
- `🔧 Parsear contenido` sets `facebook: parsed.facebook || null` (object with `caption` key)
- `💾 Guardar sesión Supabase` saves `facebook_caption: ($json.facebook && $json.facebook.caption) || null`
- `🔗 Re-attach session data` restores `facebook` object
- `🔧 Prep Re-host Input` spreads `...data` passing all fields including `facebook_caption` from Supabase
- `🔗 Merge Rehost Output` explicitly assigns `facebook_caption` field (confirmed in workflow.json assignments)

---

### Q4: Updated WhatsApp success notification

**Confidence:** HIGH (existing pattern from Phase 5, verified from workflow.json)

The existing `✅ Notify WhatsApp Success` node currently sends:
```
✓ Publicado en Instagram
Tema: <topic>
URL: <ig_permalink>
Hora: <timestamp>
```

Phase 6 must update it to include BOTH URLs in ONE message (success criterion 2):
```
✓ Publicado en Instagram y Facebook
Tema: <topic>
Instagram: <ig_permalink>
Facebook: <fb_url>
Hora: <timestamp>
```

**Updated jsonBody expression for `✅ Notify WhatsApp Success`:**
```
={{ JSON.stringify({
  from: $env.YCLOUD_WHATSAPP_NUMBER,
  to: $('🔗 Merge Rehost Output').item.json.approval_number,
  type: 'text',
  text: {
    body: '✓ Publicado en Instagram y Facebook\n\nTema: ' +
          $('🔗 Merge Rehost Output').item.json.topic +
          '\nInstagram: ' + $('🔗 IG: Get Permalink').item.json.permalink +
          '\nFacebook: https://www.facebook.com/' + $('🌐 FB: Publish Photo').item.json.post_id +
          '\nHora: ' + new Date().toISOString()
  }
}) }}
```

**Key cross-ref points:**
- `$('🔗 Merge Rehost Output').item.json.approval_number` — recipient number
- `$('🔗 Merge Rehost Output').item.json.topic` — post topic
- `$('🔗 IG: Get Permalink').item.json.permalink` — IG URL (already in chain)
- `$('🌐 FB: Publish Photo').item.json.post_id` — FB post_id for URL construction

This uses the established `JSON.stringify({...})` pattern from Phase 5 to avoid double-quote escaping issues (commit `effab36` lesson).

---

### Q5: Google Sheets Log update

**Confidence:** HIGH (verified from workflow.json inspection)

The `📊 Google Sheets Log` node currently has `"FB_URL": ""` (empty string). Phase 6 changes this expression to:

```json
"FB_URL": "={{ 'https://www.facebook.com/' + $('🌐 FB: Publish Photo').item.json.post_id }}"
```

**Full updated columns.value context (only FB_URL changes):**
```json
{
  "Fecha": "={{ new Date().toISOString() }}",
  "Tema": "={{ $('🔗 Merge Rehost Output').item.json.topic }}",
  "Tipo": "={{ $('🔗 Merge Rehost Output').item.json.type }}",
  "Angulo": "={{ $('🔗 Merge Rehost Output').item.json.angle || '' }}",
  "Plataformas": "={{ Array.isArray($('🔗 Merge Rehost Output').item.json.platforms) ? $('🔗 Merge Rehost Output').item.json.platforms.join(', ') : '' }}",
  "Modelo_Imagen": "={{ $('🔗 Merge Rehost Output').item.json.image_model }}",
  "Imagen_URL": "={{ ($('🔗 Merge Rehost Output').item.json.blob_urls && $('🔗 Merge Rehost Output').item.json.blob_urls[0] && $('🔗 Merge Rehost Output').item.json.blob_urls[0].url) || $('🔗 Merge Rehost Output').item.json.final_image_url || '' }}",
  "IG_URL": "={{ $('🔗 IG: Get Permalink').item.json.permalink }}",
  "FB_URL": "={{ 'https://www.facebook.com/' + $('🌐 FB: Publish Photo').item.json.post_id }}",
  "Publicado_En": "={{ new Date().toISOString() }}",
  "Publish_Status": "success",
  "Estado": "Publicado"
}
```

No column structure changes needed — `FB_URL` column already exists in the Sheet (added by Felix in Phase 5 Task 1).

---

### Q6: Node configuration — retry policy

**Confidence:** HIGH (same reasoning as IG `media_publish`, confirmed from REQUIREMENTS.md)

`POST /{PAGE_ID}/photos` is **NOT idempotent**. If Meta processes the request but n8n times out before receiving the response, a retry will create a second live Facebook post. Same risk as `IG: media_publish`.

| Setting | Value | Reason |
|---------|-------|--------|
| `retryOnFail` | `false` | NOT idempotent — retry creates duplicate FB post |
| `maxTries` | `1` | Safety belt |
| `waitBetweenTries` | `0` | N/A |
| `onError` | `stopWorkflow` | Phase 9 adds error branching (ERR-04); Phase 6 aborts on error |
| `typeVersion` | `4.2` | Project standard for HTTP Request nodes |

**REQUIREMENTS.md traceability:**
- `FBPUB-01` — single-image photo to FB via `/photos` — this node
- `FBPUB-03` — FB URL from `post_id` — constructed in Notify WA + Sheets Log expressions
- `ERR-02` — retry disabled on media_publish equivalent — this node's `retryOnFail: false`

---

### Q7: Node insertion point in workflow.json

**Confidence:** HIGH (verified from connection map inspection)

Current connection: `🔗 IG: Get Permalink → ✅ Notify WhatsApp Success`

Phase 6 inserts the FB publish node between these two:
1. Remove connection: `IG: Get Permalink → Notify WhatsApp Success`
2. Add connection: `IG: Get Permalink → FB: Publish Photo`
3. Add connection: `FB: Publish Photo → Notify WhatsApp Success`

The rest of the chain (`Notify WhatsApp Success → Google Sheets Log`) stays unchanged.

**Exact connections update in workflow.json:**

Change `"🔗 IG: Get Permalink"` connections from:
```json
{"main": [[{"node": "✅ Notify WhatsApp Success", "type": "main", "index": 0}]]}
```
To:
```json
{"main": [[{"node": "🌐 FB: Publish Photo", "type": "main", "index": 0}]]}
```

Add new connection for `"🌐 FB: Publish Photo"`:
```json
{"main": [[{"node": "✅ Notify WhatsApp Success", "type": "main", "index": 0}]]}
```

---

### Q8: Complete FB Publish Photo node config (copy-paste ready)

**Confidence:** HIGH (based on confirmed patterns from Phase 5 IG nodes + official FB API)

```json
{
  "parameters": {
    "method": "POST",
    "url": "=https://graph.facebook.com/v22.0/{{ $env.FACEBOOK_PAGE_ID }}/photos",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "Content-Type", "value": "application/json" }
      ]
    },
    "sendBody": true,
    "specifyBody": "json",
    "jsonBody": "={{ JSON.stringify({ url: $('🔗 Merge Rehost Output').item.json.blob_urls[0].url, message: $('🔗 Merge Rehost Output').item.json.facebook_caption || $('🔗 Merge Rehost Output').item.json.instagram_caption || '', access_token: $env.META_PAGE_TOKEN }) }}",
    "options": {}
  },
  "id": "fb-publish-photo",
  "name": "🌐 FB: Publish Photo",
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2,
  "retryOnFail": false,
  "maxTries": 1,
  "waitBetweenTries": 0,
  "onError": "stopWorkflow",
  "notes": "CRITICAL: Retry DISABLED (FBPUB-01, ERR-02 equivalent). POST /{PAGE_ID}/photos is NOT idempotent — retry after timeout where Meta already processed creates a duplicate live FB post. Input: blob_urls[0].url from Merge Rehost Output. Output: { id: <photo_id>, post_id: '<page_id>_<photo_id>' }. Post_id used to construct FB_URL as 'https://www.facebook.com/' + post_id."
}
```

**Key design choice on `jsonBody`:** The `url` parameter cross-refs `$('🔗 Merge Rehost Output').item.json.blob_urls[0].url` because at this point `$json` contains `{ id, permalink }` from IG: Get Permalink. The blob URL is not in `$json` — it must be cross-referenced.

---

### Q9: Pre-flight verification before Phase 6 E2E test

**Confidence:** HIGH (from Phase 5 lessons + project constraints)

Before running the first end-to-end test, verify:

1. **`FACEBOOK_PAGE_ID` env var in n8n Container App:**
   ```bash
   az containerapp show --name n8n --resource-group <rg> \
     --query "properties.template.containers[0].env[?name=='FACEBOOK_PAGE_ID'].value"
   ```
   If missing, push it via `az containerapp update`.

2. **Page token has `pages_manage_posts` permission on the Propulsar page:**
   ```bash
   curl "https://graph.facebook.com/v22.0/me/permissions?access_token=$META_PAGE_TOKEN"
   ```
   Verify `pages_manage_posts` is in the response with `status: granted`.

3. **Google Sheets logging (pending empirical confirmation from Phase 5):**
   The first Phase 6 test run is also the first empirical test of Sheets logging after the 827af90 fix. If the Sheets node fails, diagnose before declaring Phase 6 complete.

4. **Cheap FB page access pre-flight:**
   ```bash
   curl "https://graph.facebook.com/v22.0/$FACEBOOK_PAGE_ID?fields=id,name&access_token=$META_PAGE_TOKEN"
   ```
   Expected: `{ "id": "...", "name": "Propulsar AI" }`. If 400/403, the token doesn't have FB Page access.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| POST to /feed with `link` parameter | POST to /{PAGE_ID}/photos with `url` | N/A — /photos is the correct endpoint for image posts | /photos returns `post_id` directly; /feed with link parameter doesn't publish images |
| Polling for FB post status | No polling needed | Phase 6 design | /photos is synchronous — response includes `post_id` immediately on success |
| Separate GET for FB permalink | URL construction from `post_id` | Phase 6 design | Saves one API call; `post_id` format `{page_id}_{photo_id}` is sufficient to build the URL |
| graph.instagram.com | graph.facebook.com | Phase 5 discovery | Page tokens rejected by graph.instagram.com — must use graph.facebook.com for all Meta calls |

**Key difference from IG flow:**

| Aspect | Instagram (Phase 5) | Facebook (Phase 6) |
|--------|--------------------|--------------------|
| Steps | 2 (container + publish) | 1 (direct publish) |
| Readiness wait | 30 seconds (container processing) | None (synchronous) |
| URL retrieval | Extra GET for permalink | Inline — `post_id` in publish response |
| Idempotency | Not idempotent (`media_publish`) | Not idempotent (`/photos`) |
| Retry policy | DISABLED | DISABLED |

---

## Open Questions

1. **Is `FACEBOOK_PAGE_ID` already set in the n8n Azure Container App env?**
   - What we know: It exists in `.env.example`. Phase 5 work focused on IG-specific vars.
   - What's unclear: Whether it was pushed to the Container App during Phase 5 or Phase 4 setup.
   - Recommendation: **Planner must include a pre-flight task to verify and push if missing.** This is a hard blocker for Phase 6.

2. **Does the `facebook_caption` field propagate correctly through the Supabase session round-trip?**
   - What we know: `facebook_caption` is saved to Supabase on INSERT and is present in `Merge Rehost Output` assignments. The GPT-4o parser extracts `facebook: parsed.facebook || null`.
   - What's unclear: Whether the GPT-4o prompt actually generates a `facebook` key in its JSON response consistently.
   - Recommendation: Planner should include a verification step — inspect `🔗 Merge Rehost Output` output in a test execution to confirm `facebook_caption` is non-null.

3. **Should Phase 6 add a `platforms` guard (publish to FB only if `platforms` includes `"facebook"`)?**
   - What we know: The Wizard lets users choose `["instagram"]` or `["instagram","facebook"]` or `["facebook"]`. Phase 5 published to IG regardless of platforms.
   - What's unclear: Whether the Phase 5 IG nodes also lack this guard (they appear to — no IF check on platforms before IG: Create Container).
   - Recommendation: Add a platforms check IF Phase 6 planner has clean scope for it. Wrap the FB publish in an IF node checking `$('🔗 Merge Rehost Output').item.json.platforms.includes('facebook')`. This prevents unwanted FB posts when user chose IG-only. Use `typeVersion: 1` on the IF node (v2 broken in n8n 2.14.2). This is LOW urgency since Propulsar currently always publishes to both platforms.

4. **Empirical Google Sheets logging verification (from Phase 5 gap):**
   - What we know: Phase 5 left Sheets logging structurally correct but empirically unconfirmed.
   - What's unclear: Whether there are additional __rl or credential issues that will surface on first live execution.
   - Recommendation: Treat the first Phase 6 E2E run as the Sheets logging acceptance test. If it fails, diagnose immediately — it's a blocker for Phase 6 success criterion 3.

---

## Sources

### Primary (HIGH confidence)
- [Meta Graph API — Page /photos reference](https://developers.facebook.com/docs/graph-api/reference/page/photos/) — endpoint, parameters, response format, permissions
- [Meta Graph API — Photo object](https://developers.facebook.com/docs/graph-api/reference/photo/) — readable fields including `link`
- [Meta Graph API — Post object](https://developers.facebook.com/docs/graph-api/reference/post/) — `permalink_url` field format
- Project `n8n/workflow.json` — verified node configs, data flow, connection map
- Project `.planning/STATE.md` — locked decisions (graph.facebook.com, IF v1, Sheets __rl format, etc.)
- Project `.planning/phases/05-instagram-single-photo-publishing/05-02-SUMMARY.md` — 10 bugs and patterns from Phase 5 deploy

### Secondary (MEDIUM confidence)
- n8n Community: "Facebook API: How to Get Post URL with Post ID Only?" — confirms `https://www.facebook.com/{post_id}` URL construction pattern
- WebSearch cross-verification of `post_id` format `{page_id}_{photo_id}` from multiple developer blog posts

### Tertiary (LOW confidence — informational only)
- Medium post on automating FB uploads with Python — confirms response format but older API version

---

## Metadata

**Confidence breakdown:**
- FB API endpoint + parameters: HIGH — verified from official docs
- `post_id` format + URL construction: HIGH — cross-verified from official Post object docs + community sources
- n8n node configuration: HIGH — directly derived from Phase 5 proven patterns in workflow.json
- Caption data flow: HIGH — traced through workflow.json node by node
- `FACEBOOK_PAGE_ID` availability: MEDIUM — declared in .env.example but Container App push unconfirmed
- `facebook_caption` non-null at runtime: MEDIUM — depends on GPT-4o prompt behavior not directly verified

**Research date:** 2026-04-17
**Valid until:** 2026-09-01 (or when Meta deprecates v22 — same cadence as Phase 5 research)
