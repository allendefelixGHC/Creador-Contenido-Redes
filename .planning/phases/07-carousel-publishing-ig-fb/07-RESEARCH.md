# Phase 7: Carousel Publishing (IG + FB) — Research

**Researched:** 2026-04-17
**Domain:** Meta Graph API v22 (IG carousel 3-step flow + FB `attached_media` multi-photo), n8n loop/aggregation patterns, Supabase schema extension
**Confidence:** HIGH (IG carousel flow from official Meta docs + cross-verified with Phase 5 patterns), MEDIUM (FB `attached_media` JSON body format — Meta official docs show form-encoded examples; exact JSON body shape in n8n HTTP Request node inferred from community + field naming), HIGH (n8n patterns from project history)

---

## User Constraints

No `CONTEXT.md` exists for Phase 7. Per phase-context instructions, **all areas are Claude's Discretion** — research options and recommend. Hard constraints come from REQUIREMENTS.md + prior-phase decisions in STATE.md.

### Locked by Requirements (NOT negotiable)

- **IGPUB-02**: IG carousel via 3-step flow — N child containers (`is_carousel_item=true`) → parent carousel container → `media_publish`
- **FBPUB-02**: FB carousel via `attached_media` — N × `POST /{PAGE_ID}/photos?published=false` → single `POST /{PAGE_ID}/feed` with `attached_media[]` array
- **FBPUB-04**: `attached_media` array constructed dynamically in a Code node, not hardcoded
- **IG carousel Success Criterion 3**: 30-second Wait after child container creation must be visible in n8n execution trace
- **IG carousel Success Criterion 4**: FB Code node is dynamic — 3-slide brief → `attached_media[0..2]`, 7-slide → `attached_media[0..6]`
- `media_publish` retry MUST be disabled — not idempotent (Phase 5 established rule, carries forward)
- All new IF nodes must use typeVersion 1 (IF v2/Switch v3 broken in n8n 2.14.2)
- Azure Blob public-access container for reads; SAS only for writes
- n8n Code node sandbox blocks `require()`, `fetch()`, `$helpers` — use HTTP Request nodes for external calls
- Execute Workflow `typeVersion: 1.2` with `mode:list + cachedResultName` for `__rl` workflow references
- Google Sheets node v4.4 requires `documentId` and `sheetName` in `__rl` object format
- Set v3 silently drops cross-node `.item.json.*` assignments in fan-out chains — use Code node when crossing node references after fan-out
- FB: Publish nodes placed sequentially (not parallel) to avoid Set v3 fan-out pitfall
- `retryOnFail=false` on both IG `media_publish` and FB post-to-feed nodes
- Phase 05 Plan 01 carousel guard: `🔧 Prep Re-host Input` currently throws for `format=carousel` — Phase 7 removes this guard
- Supabase `content_sessions` table lacks `format` and `image_urls` columns — Phase 7 must extend schema

### Claude's Discretion (decide + recommend)

- How many n8n plans to split Phase 7 into (recommend 2: plan 01 = workflow.json edits, plan 02 = deploy + E2E)
- Whether to add a carousel-specific `format` column to Supabase in a dedicated pre-task or inline in plan 01
- Whether the IG carousel loop uses n8n's SplitInBatches node (already used in the workflow) or a Code node + sequential HTTP calls pattern (already used for Ideogram slide generation)
- Whether `image_urls` are passed directly from `Merge Rehost Output` or a new dedicated Code node assembles them
- Whether to keep the single-post and carousel paths in the same Sheets Log node or add carousel-specific columns
- Exact n8n node layout of the carousel publish sub-chain

### Out of Scope (Phases 8–9 or v2+)

- First-comment hashtag posting (Phase 9)
- Error output branching on all Meta nodes (Phase 9)
- Scheduling (Phase 8)
- Status polling instead of 30s Wait (v2+, HARD-03)
- OAuthException 190 alert (Phase 9)

---

## Summary

Phase 7 is the most complex phase in v1.1. It requires two separate multi-step Meta API flows — one for Instagram (3-step with N sequential child container POSTs, parent container creation, and a 30-second Wait before `media_publish`) and one for Facebook (N sequential `POST /{PAGE_ID}/photos?published=false` calls to collect photo IDs, then a single `POST /{PAGE_ID}/feed` with a dynamically constructed `attached_media` array). The workflow already has carousel image generation and WhatsApp preview working end-to-end (Phases 1-3). Phase 7 closes the loop on the approval side.

The critical design decision is **how to loop over N slides in n8n** for both the IG child container creation and the FB unpublished photo uploads. The workflow already uses the pattern of fanning out via a Code node (returning N items, one per slide) and feeding into a single HTTP Request node — this was done for Ideogram slide generation (`🎠 Explode Slides` → `🔤 Ideogram — Slide` → `🗂️ Collect Image URLs`). The same pattern works for the IG child container creation loop and for the FB photo upload loop. Using SplitInBatches is an alternative but the existing project pattern (fan-out Code + HTTP Request + aggregate Code) is simpler and already proven.

The second major concern is **Supabase schema extension**. The current `content_sessions` table does not have `format` or `image_urls` columns. The carousel approval flow (WA reply → retrieve session → `Prep Re-host Input`) depends on the session having `image_urls` (array) and `format='carousel'` so that `Prep Re-host Input` can build the correct input for the re-host sub-workflow. This schema gap must be fixed before Phase 7 end-to-end tests can run. The fix is minimal: two `ALTER TABLE` SQL calls via the Supabase REST API.

**Primary recommendation:** Split Phase 7 into 2 plans. Plan 01: (a) extend Supabase schema, (b) update `💾 Guardar sesión Supabase` to write `format` + `image_urls`, (c) remove carousel guard from `🔧 Prep Re-host Input`, (d) add IG carousel publish chain (fan-out Code → N child container HTTP POSTs → aggregate Code → parent container HTTP POST → 30s Wait → `media_publish` → permalink GET), (e) add FB carousel publish chain (fan-out Code → N unpublished photo upload HTTP POSTs → aggregate Code → dynamic `attached_media` Code node → `POST /{PAGE_ID}/feed`), (f) add carousel-aware format branch (IF node) after `🔗 Merge Rehost Output` to route to either single-post chain or carousel chain. Plan 02: deploy to n8n-azure + E2E carousel tests.

---

## Standard Stack

### Core

| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| n8n HTTP Request node | typeVersion 4.2 | IG child container POSTs, parent container POST, `media_publish`, FB unpublished photo uploads, FB feed POST | Project standard for all API calls |
| n8n Code node | typeVersion 2 | Fan-out N slides, aggregate N container IDs, build `attached_media` array dynamically | Code node is the only way to produce N items from 1 and aggregate N items to 1 without fan-out cross-ref pitfalls |
| n8n Wait node | typeVersion 1 | 30s wait between child container creation and parent container POST | Phase 5 established pattern; carousel containers have same readiness model as single-photo |
| Meta Graph API | v22.0 | IG carousel + FB multi-photo publishing | Project baseline; v21 deprecated Sep 2025 |
| Host: `graph.facebook.com` | — | All Meta API calls | Confirmed in Phase 5 Plan 02 — Page tokens rejected by `graph.instagram.com` |
| Supabase REST API | — | Schema extension + session data for carousel | Already used in workflow; needs 2 new columns |

### Supporting

| Component | Purpose | When to Use |
|-----------|---------|-------------|
| Azure Blob permanent URLs (from Phase 4) | `image_url` param for IG child containers and `url` param for FB photo uploads | Same blob URLs already used for single-post; carousel just needs N of them via `blob_urls[i].url` |
| YCloud WhatsApp API | Combined success notification with IG carousel permalink + FB post URL | Already used in Phases 5-6; same pattern, update message text |
| Google Sheets v4.4 | Log carousel publish with slide count + both platform URLs | Existing Sheets Log node; add `Num_Slides` column or reuse `Imagen_URL` as first slide URL |

### No New External Dependencies

Phase 7 adds zero new npm packages, zero new credentials, and zero new env vars beyond what Phase 6 established.

---

## Architecture Patterns

### Pattern 1: IG Carousel 3-Step Flow

**Official endpoints (Meta Graph API v22, `graph.facebook.com`):**

#### Step 1a — Create N Child Containers (one POST per slide)

```
POST https://graph.facebook.com/v22.0/{INSTAGRAM_ACCOUNT_ID}/media
Content-Type: application/json

{
  "image_url": "<azure_blob_url_for_slide_N>",
  "is_carousel_item": true,
  "access_token": "<META_PAGE_TOKEN>"
}
```

- `is_carousel_item: true` is REQUIRED — without it, the container is treated as a single-post container and will fail when added to a carousel parent
- NO `caption` on child containers — only the parent accepts `caption`
- Returns: `{ "id": "<child_container_id>" }`
- Idempotent — retry is safe on child creation

#### Step 1b — Wait 30 Seconds

Fixed Wait node (typeVersion 1, 30s) after ALL child containers are created. This mirrors the single-post pattern (IGPUB-03). The readiness window for carousel children is the same as single photos.

#### Step 2 — Create Parent Carousel Container

```
POST https://graph.facebook.com/v22.0/{INSTAGRAM_ACCOUNT_ID}/media
Content-Type: application/json

{
  "media_type": "CAROUSEL",
  "children": "<child_id_1>,<child_id_2>,...,<child_id_N>",
  "caption": "<instagram_caption>",
  "access_token": "<META_PAGE_TOKEN>"
}
```

- `children`: comma-separated string of up to 10 child container IDs (in slide order)
- `caption`: ONLY on parent, not children — max 2,200 chars, 30 hashtags, 20 @mentions
- Returns: `{ "id": "<parent_carousel_container_id>" }`
- Max 10 slides per carousel (Meta hard limit)

#### Step 3 — Publish Carousel

```
POST https://graph.facebook.com/v22.0/{INSTAGRAM_ACCOUNT_ID}/media_publish
Content-Type: application/json

{
  "creation_id": "<parent_carousel_container_id>",
  "access_token": "<META_PAGE_TOKEN>"
}
```

- `retryOnFail: false` — identical to single-post `media_publish` (not idempotent, duplicate risk)
- Returns: `{ "id": "<published_carousel_media_id>" }`
- Permalink GET: same as single-post — `GET /v22.0/{media_id}?fields=permalink` returns the carousel post's permalink

> Sources: [Meta — IG Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing) · [Meta — POST /{IG_ID}/media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media)

---

### Pattern 2: FB Multi-Photo Post via `attached_media`

**Two-step process — both steps use `graph.facebook.com`:**

#### Step 1 — Upload N Photos as Unpublished (one POST per slide)

```
POST https://graph.facebook.com/v22.0/{FACEBOOK_PAGE_ID}/photos
Content-Type: application/json

{
  "url": "<azure_blob_url_for_slide_N>",
  "published": false,
  "access_token": "<META_PAGE_TOKEN>"
}
```

- `published: false` — CRITICAL — tells FB not to publish immediately; instead return a photo ID for later use in `attached_media`
- Returns: `{ "id": "<photo_id>", "post_id": "<page_id>_<photo_id>" }` — the `id` (not `post_id`) is what goes into `attached_media`
- These unpublished photos are **temporary** (last ~24h) — if the carousel publish fails, the photo slots expire and must be re-uploaded
- Retry is NOT safe after a timeout — could create orphaned unpublished photos (low risk since they expire, but duplication is possible). Recommend `retryOnFail: false` consistent with other publish nodes.

#### Step 2 — Publish Multi-Photo Feed Post

```
POST https://graph.facebook.com/v22.0/{FACEBOOK_PAGE_ID}/feed
Content-Type: application/json

{
  "message": "<facebook_caption>",
  "attached_media": [
    { "media_fbid": "<photo_id_1>" },
    { "media_fbid": "<photo_id_2>" },
    ...
    { "media_fbid": "<photo_id_N>" }
  ],
  "access_token": "<META_PAGE_TOKEN>"
}
```

- `attached_media`: JSON array of objects, each with `media_fbid` pointing to the photo ID from Step 1
- `media_fbid` (NOT `id`, NOT `media_id`) — this field name is specific to the `attached_media` context
- Array order = slide order on Facebook
- Returns: `{ "id": "<page_post_id>" }` — this is the feed post ID (format: `{page_id}_{post_id}`)
- Public URL: `https://www.facebook.com/{page_post_id}` — same construction as single-photo Phase 6

**Confidence note on JSON body format:** Meta's official docs show `attached_media` primarily in form-encoded (curl `-d`) examples. The JSON body equivalent (`specifyBody: "json"` in n8n HTTP Request v4.2) uses the array-of-objects format shown above. This is MEDIUM confidence — verified via community sources and the structure matches Meta's documented field names, but an exact official JSON body example was not found. **If this fails in testing, the fallback is to use `specifyBody: "string"` with a raw JSON string built by the Code node.**

> Sources: [Meta — POST /photos (published=false)](https://developers.facebook.com/docs/graph-api/reference/page/photos/) · [Meta — POST /feed](https://developers.facebook.com/docs/graph-api/reference/page/feed/) · Community verification of `media_fbid` field name

---

### Recommended n8n Node Layout for Phase 7

Current state after Phase 6 (single-post path, from `🔗 Merge Rehost Output` onward):

```
🔗 Merge Rehost Output
   → 📤 IG: Create Container (single)
   → ⏳ Wait 30s
   → 🚀 IG: media_publish
   → 🔗 IG: Get Permalink
   → 🌐 FB: Publish Photo
   → ✅ Notify WhatsApp Success
   → 📊 Google Sheets Log
```

Phase 7 adds a format-branch immediately after `🔗 Merge Rehost Output`:

```
🔗 Merge Rehost Output
   ↓
[NEW] 🔀 ¿Formato Carrusel? (IF v1 — $json.format === 'carousel')
   │
   ├── [TRUE] CAROUSEL PATH ──────────────────────────────────────────
   │
   │   [NEW] 🎠 IG: Explode Carousel Slides (Code node)
   │          ↓ (N items, one per slide)
   │   [NEW] 🖼️ IG: Create Child Container (HTTP Request, retryOnFail=true)
   │          ↓ (N items, one per child container ID)
   │   [NEW] 🗂️ IG: Collect Child IDs + Wait Data (Code node — aggregate N→1)
   │          ↓ (1 item: { child_ids: [...], ...session_data })
   │   [NEW] ⏳ IG: Wait 30s Carousel (Wait node v1)
   │          ↓
   │   [NEW] 🎠 IG: Create Parent Container (HTTP Request, retryOnFail=true)
   │          ↓ ({ id: <parent_carousel_id> })
   │   [NEW] 🚀 IG: Carousel media_publish (HTTP Request, retryOnFail=FALSE)
   │          ↓ ({ id: <published_media_id> })
   │   [NEW] 🔗 IG: Get Carousel Permalink (HTTP Request, retryOnFail=true)
   │          ↓ ({ id, permalink })
   │
   │   [NEW] 🖼️ FB: Explode Carousel Slides (Code node)
   │          ↓ (N items, one per slide)
   │   [NEW] 📤 FB: Upload Photo Unpublished (HTTP Request, retryOnFail=false)
   │          ↓ (N items, one per photo ID)
   │   [NEW] 🗂️ FB: Collect Photo IDs (Code node — aggregate N→1)
   │          ↓ (1 item: { photo_ids: [...], ...session_data })
   │   [NEW] 🔧 FB: Build attached_media (Code node — dynamic array)
   │          ↓ ({ attached_media: [{media_fbid:...}, ...], message: ... })
   │   [NEW] 🌐 FB: Publish Carousel Feed (HTTP Request, retryOnFail=FALSE)
   │          ↓ ({ id: <post_id> })
   │
   │   [NEW] ✅ IG+FB: Notify WhatsApp Carousel (HTTP Request)
   │          ↓
   │   [EXISTING — update] 📊 Google Sheets Log
   │
   └── [FALSE] SINGLE-POST PATH (unchanged — existing chain)
       → 📤 IG: Create Container (single)
       → ⏳ Wait 30s
       → 🚀 IG: media_publish
       → 🔗 IG: Get Permalink
       → 🌐 FB: Publish Photo
       → ✅ Notify WhatsApp Success
       → 📊 Google Sheets Log
```

**Key design notes:**

1. **Two separate fan-out/aggregate loops**: IG child containers and FB unpublished photos are separate loops. IG must complete first (need IG permalink for the WA notification); FB can then run sequentially after.

2. **The `🗂️ IG: Collect Child IDs + Wait Data` Code node is critical**: After fanning out N child container HTTP requests, n8n produces N items. The aggregate Code node must collect all N container IDs AND re-attach session data (topic, instagram_caption, blob_urls, etc.) into a single item before the Wait node. Without this, the Wait node would execute N times instead of once.

3. **`🗂️ FB: Collect Photo IDs` Code node**: Same pattern — aggregate N photo IDs from N HTTP Request outputs back into a single item with session data before building `attached_media`.

4. **The `🔧 FB: Build attached_media` Code node** (FBPUB-04): Dynamically builds the array from N photo IDs:
   ```javascript
   const data = $input.first().json;
   const photoIds = data.photo_ids; // array of photo id strings
   const attachedMedia = photoIds.map(id => ({ media_fbid: id }));
   return [{ json: { ...data, attached_media: attachedMedia } }];
   ```

5. **Session data chain**: After fan-out loops, `$json` at the carousel publish nodes will be the aggregated output. All session fields (topic, captions, approval_number, etc.) must be collected in the aggregate Code nodes from `$('🔗 Merge Rehost Output').all()` cross-ref to avoid silent drops.

6. **Separate WA notification for carousel**: The existing `✅ Notify WhatsApp Success` is wired into the single-post path. The carousel path gets its own WA notification node (same YCloud pattern, different message mentioning "carrusel" + slide count).

7. **Google Sheets Log — carousel**: Both carousel and single-post chains converge at `📊 Google Sheets Log`. The node already cross-refs `🔗 IG: Get Permalink` and `🌐 FB: Publish Photo` — for carousel, cross-refs must be updated to `🔗 IG: Get Carousel Permalink` and `🌐 FB: Publish Carousel Feed`. **Resolution**: Create a separate Sheets Log entry at the end of each path (carousel has its own Sheets node cross-referencing carousel nodes), OR use a single Sheets node with conditional expressions. Recommend separate nodes to avoid brittle conditional logic — simpler, more auditable.

---

### Pattern 3: Supabase Schema Extension

The `content_sessions` table currently stores single-post data. For carousel approval flow, it needs:

```sql
ALTER TABLE content_sessions ADD COLUMN format TEXT DEFAULT 'single';
ALTER TABLE content_sessions ADD COLUMN image_urls JSONB;
```

**How to run in n8n**: via HTTP Request to Supabase REST API with the `Content-Profile: pg_catalog` approach, OR via `POST /rest/v1/rpc/` calling a stored procedure, OR (simplest for a one-time migration) by running the SQL directly in the Supabase dashboard SQL editor as a manual step.

**Recommendation**: Treat the schema extension as a manual pre-flight step in Plan 01 task list (user runs 2 SQL statements in Supabase dashboard), then the Code task updates `💾 Guardar sesión Supabase` to include `format` and `image_urls` in the INSERT body.

**Updated `💾 Guardar sesión Supabase` INSERT body** for carousel briefs:
```json
{
  "session_id": "propulsar_<timestamp>",
  "approval_number": "<number>",
  "topic": "<topic>",
  "type": "<type>",
  "angle": "<angle>",
  "platforms": ["instagram", "facebook"],
  "image_model": "ideogram",
  "format": "carousel",
  "image_urls": ["<url1>", "<url2>", ...],
  "instagram_caption": "<caption>",
  "facebook_caption": "<caption>",
  "status": "pending"
}
```

For single-post briefs, `format: 'single'` (default) and `image_urls: null` (unchanged from Phase 5 schema — the existing `final_image_url` field covers single posts; no need to write `image_urls` for single posts).

**CRITICAL PATH NOTE**: The current `💾 Guardar sesión Supabase` node sits in the SINGLE-POST path only (after `🔗 Normalizar URL imagen` → `💾 Guardar sesión Supabase`). The CAROUSEL path (after `🗂️ Collect Image URLs`) currently bypasses this node and goes directly to `📱 Preparar mensaje WA`. Phase 7 needs to add a Supabase session INSERT on the carousel path too, before the WhatsApp preview is sent — otherwise when SI arrives, `🔍 Recuperar sesión Supabase` returns a 406 (no pending session found).

Looking at the workflow connections:
- `🗂️ Collect Image URLs` → `📨 Split URLs WA` → `📤 Enviar imagen WA` → `📱 Preparar mensaje WA` → `📤 Enviar WhatsApp`
- The carousel path saves **no session to Supabase** — this is a known schema gap (STATE.md)
- Phase 7 must insert a `💾 Guardar sesión Supabase (Carousel)` node in the carousel path before the WA preview send

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| N→1 aggregation after fan-out | Custom Merge/Join node logic | Code node (`runOnceForAllItems`) + `$input.all()` | Already proven in project: `🗂️ Collect blob_urls` in sub-workflow uses exactly this pattern |
| Loop over N slides | SplitInBatches node | Fan-out Code node (return N items) + HTTP Request + aggregate Code | `SplitInBatches` adds complexity (batch counter, Done/Current outputs); the existing project pattern (Explode → HTTP → Collect) is simpler and already used for Ideogram slides |
| Checking slide count | Custom validation loop | Throw in aggregate Code if `items.length !== expected` | Already done in `🗂️ Collect Image URLs`: `if (imageUrls.length !== carousel.num_images) throw new Error(...)` |
| FB `attached_media` format | Hardcoded array | Code node dynamically mapping `photo_ids.map(id => ({ media_fbid: id }))` | Required by FBPUB-04; also handles 3-slide and 7-slide briefs identically |

**Key insight:** The project already has the exact fan-out/aggregate pattern proven in `🎠 Explode Slides` → `🔤 Ideogram — Slide` → `🗂️ Collect Image URLs` (image generation) and in the sub-workflow's `🔧 Explode image_urls` → `📥 HTTP GET` → `📤 HTTP PUT` → `🗂️ Collect blob_urls` (blob re-hosting). Phase 7 applies the same pattern two more times.

---

## Common Pitfalls

### Pitfall 1: Carousel guard still active in `🔧 Prep Re-host Input`
**What goes wrong:** Phase 7 carousel brief hits the guard and throws immediately after session retrieval.
**Why it happens:** Phase 5 Plan 01 deliberately added `if (format === 'carousel') throw new Error(...)` as a guard.
**How to avoid:** Remove the carousel guard in Phase 7 Plan 01 — this is explicitly listed in the success criteria.
**Warning signs:** n8n execution shows error at `🔧 Prep Re-host Input` with message "Carousel publishing not yet supported".

### Pitfall 2: Child containers created WITHOUT `is_carousel_item: true`
**What goes wrong:** Parent container creation fails — Meta returns an error saying the containers cannot be used as carousel items.
**Why it happens:** Omitting `is_carousel_item: true` creates a standard single-image container, which is not a valid carousel child.
**How to avoid:** Every child container POST body MUST include `"is_carousel_item": true`.
**Warning signs:** Parent carousel container POST fails with error code `9007` or similar; Meta error message mentions "invalid container type".

### Pitfall 3: Caption on child containers (not just parent)
**What goes wrong:** Meta API may return error or silently ignore the caption on child containers.
**Why it happens:** Caption is only supported on the parent carousel container. Putting `caption` on child containers is invalid per Meta docs.
**How to avoid:** Fan-out Code node for child containers includes `image_url`, `is_carousel_item: true`, and `access_token` ONLY — no `caption`.
**Warning signs:** API error on child container creation mentioning unsupported fields.

### Pitfall 4: `children` field is a JSON array instead of comma-separated string
**What goes wrong:** Parent container creation fails — Meta expects a comma-separated string, not a JSON array.
**Why it happens:** Instinct to use `["id1","id2"]` (JSON array) instead of `"id1,id2"` (string).
**How to avoid:** Aggregate Code node builds `child_ids.join(',')` before passing to parent container POST.
**Warning signs:** Meta API 400 error on parent container POST with "Invalid parameter: children".

### Pitfall 5: `attached_media` in n8n JSON body — nested array serialization
**What goes wrong:** FB feed POST fails because `attached_media` is not properly serialized.
**Why it happens:** n8n's `specifyBody: "json"` with `jsonBody` as a template expression may have trouble serializing nested arrays. The safe pattern is `JSON.stringify({...})` in the expression.
**How to avoid:** Use `JSON.stringify` in the FB feed POST `jsonBody`: `={{ JSON.stringify({ message: ..., attached_media: $json.attached_media, access_token: $env.META_PAGE_TOKEN }) }}`. This is the established project pattern (Phase 5 established JSON.stringify wrapper for all HTTP Request bodies).
**Warning signs:** FB feed POST receives a 400 with "Invalid parameter: attached_media" or empty array.

### Pitfall 6: Session INSERT missing on carousel path before WhatsApp preview
**What goes wrong:** SI reply from WhatsApp → `🔍 Recuperar sesión Supabase` returns 406 (no session found) → execution aborts before reaching carousel publish.
**Why it happens:** The carousel path (`🗂️ Collect Image URLs` → WA preview) bypasses `💾 Guardar sesión Supabase` entirely (it's only wired into the single-post path).
**How to avoid:** Add `💾 Guardar sesión Supabase (Carousel)` node in the carousel path, inserting `format=carousel` + `image_urls=<array>` before the WA preview. This is the carousel equivalent of what the single-post path does.
**Warning signs:** `🔍 Recuperar sesión Supabase` returns a 406 or empty result when carousel SI is sent.

### Pitfall 7: Supabase schema migration not done before E2E test
**What goes wrong:** `💾 Guardar sesión Supabase (Carousel)` node fails with PostgreSQL error "column 'format' does not exist".
**Why it happens:** The `ALTER TABLE` migration was not run before testing.
**How to avoid:** Plan 01 task list must include the manual schema migration as the FIRST task (before any workflow.json changes). Include exact SQL to run in Supabase dashboard.
**Warning signs:** n8n execution fails at Supabase INSERT with a 400/409 error mentioning unknown column.

### Pitfall 8: Aggregate Code node losing session data after fan-out
**What goes wrong:** Carousel publish chain has child_ids but is missing `topic`, `instagram_caption`, `blob_urls`, etc. — WA notification sends "undefined" for topic, Sheets log is blank.
**Why it happens:** After fan-out (Explode → HTTP Request for each slide), each item only has the HTTP response (`{ id: <child_container_id> }`). The aggregate Code node must explicitly fetch session data from the upstream anchor node.
**How to avoid:** Aggregate Code nodes use `$('🔗 Merge Rehost Output').first().json` to pull session metadata, exactly as the single-post chain does via cross-node references.
**Warning signs:** WA carousel notification contains "undefined" for topic; Sheets carousel row has blank columns.

### Pitfall 9: IG `media_publish` on carousel — retry NOT disabled
**What goes wrong:** Duplicate live carousel on Instagram profile (two carousel posts with identical slides).
**Why it happens:** Applying `retryOnFail: true` to the carousel `media_publish` node, thinking it's different from single-post.
**How to avoid:** `retryOnFail: false` on BOTH `🚀 IG: media_publish` (single, already done) AND `🚀 IG: Carousel media_publish` (new node). Same rule, same risk.
**Warning signs:** Two identical carousel posts appear on `instagram.com/propulsar.ai`.

### Pitfall 10: FB carousel `POST /feed` — retry NOT disabled  
**What goes wrong:** Duplicate FB multi-photo post.
**Why it happens:** `POST /{PAGE_ID}/feed` with `attached_media` is NOT idempotent — each call creates a new post.
**How to avoid:** `retryOnFail: false` on `🌐 FB: Publish Carousel Feed` node.

### Pitfall 11: `blob_urls` index vs slide order
**What goes wrong:** Carousel slides appear in wrong order on Instagram or Facebook.
**Why it happens:** The re-host sub-workflow returns `blob_urls` sorted by `slide_index` (confirmed in `🗂️ Collect blob_urls` code). If the fan-out Code node iterates without respecting this sort order, child containers are created in wrong order.
**How to avoid:** Explode Code nodes use `.sort((a,b) => a.index - b.index)` before mapping to items, or simply iterate `blob_urls` in order (it's already sorted by the sub-workflow).

---

## Code Examples

### Code Node 1: IG Carousel Explode (fan-out)

```javascript
// 🎠 IG: Explode Carousel Slides — runs once for all items
const data = $('🔗 Merge Rehost Output').first().json;
const blobUrls = data.blob_urls || [];

if (blobUrls.length === 0) {
  throw new Error('IG Carousel Explode: no blob_urls found in Merge Rehost Output');
}
if (blobUrls.length > 10) {
  throw new Error('IG Carousel Explode: carousel exceeds 10-slide Meta limit (' + blobUrls.length + ' slides)');
}

return blobUrls.map((entry, i) => ({
  json: {
    slide_index: entry.index || (i + 1),
    blob_url: entry.url,
    num_images: blobUrls.length,
    // carry minimal session fields for the HTTP Request
    access_token_placeholder: true, // access_token set via $env in HTTP node
  }
}));
```

**HTTP Request node after this** — Body (JSON.stringify pattern):
```
={{ JSON.stringify({
  image_url: $json.blob_url,
  is_carousel_item: true,
  access_token: $env.META_PAGE_TOKEN
}) }}
```

---

### Code Node 2: IG Aggregate Child Container IDs

```javascript
// 🗂️ IG: Collect Child IDs + Wait Data — runs once for all items
const items = $input.all();
const session = $('🔗 Merge Rehost Output').first().json;

const childIds = items
  .map(it => it.json.id)
  .filter(Boolean);

if (childIds.length !== session.blob_urls.length) {
  throw new Error(
    'IG Carousel: expected ' + session.blob_urls.length +
    ' child containers, got ' + childIds.length
  );
}

return [{
  json: {
    // Sub-workflow session data re-attached from anchor node
    topic:              session.topic,
    type:               session.type,
    angle:              session.angle || null,
    platforms:          session.platforms,
    image_model:        session.image_model,
    instagram_caption:  session.instagram_caption,
    facebook_caption:   session.facebook_caption,
    blob_urls:          session.blob_urls,
    approval_number:    session.approval_number,
    format:             session.format,
    num_images:         session.blob_urls.length,
    // Carousel-specific
    child_ids:          childIds,
    children_csv:       childIds.join(','),  // comma-sep string for Meta API
  }
}];
```

---

### Code Node 3: FB Aggregate Photo IDs

```javascript
// 🗂️ FB: Collect Photo IDs — runs once for all items
const items = $input.all();
const session = $('🔗 Merge Rehost Output').first().json;

// FB /photos?published=false returns { id, post_id }
// We need `id` (the Photo object ID, NOT post_id) for attached_media
const photoIds = items
  .map(it => it.json.id)
  .filter(Boolean);

if (photoIds.length !== session.blob_urls.length) {
  throw new Error(
    'FB Carousel: expected ' + session.blob_urls.length +
    ' unpublished photos, got ' + photoIds.length
  );
}

return [{
  json: {
    photo_ids: photoIds,
    facebook_caption: session.facebook_caption || session.instagram_caption || '',
    instagram_permalink: $('🔗 IG: Get Carousel Permalink').first().json.permalink,
    approval_number: session.approval_number,
    topic: session.topic,
    num_images: session.blob_urls.length,
  }
}];
```

---

### Code Node 4: Build `attached_media` Dynamically (FBPUB-04)

```javascript
// 🔧 FB: Build attached_media — runs once for all items
const data = $input.first().json;
const photoIds = data.photo_ids;

if (!Array.isArray(photoIds) || photoIds.length === 0) {
  throw new Error('FB Build attached_media: no photo_ids found');
}

const attachedMedia = photoIds.map(id => ({ media_fbid: id }));

return [{
  json: {
    ...data,
    attached_media: attachedMedia,
  }
}];
```

**HTTP Request node after this** — Body (JSON.stringify pattern — CRITICAL for nested arrays):
```
={{ JSON.stringify({
  message: $json.facebook_caption,
  attached_media: $json.attached_media,
  access_token: $env.META_PAGE_TOKEN
}) }}
```

---

### Code Node 5: FB Explode for Unpublished Upload

```javascript
// 🖼️ FB: Explode Carousel Slides — runs once for all items
const session = $('🔗 Merge Rehost Output').first().json;
const blobUrls = session.blob_urls || [];

return blobUrls.map((entry, i) => ({
  json: {
    slide_index: entry.index || (i + 1),
    blob_url: entry.url,
  }
}));
```

**HTTP Request node after this** — Body:
```
={{ JSON.stringify({
  url: $json.blob_url,
  published: false,
  access_token: $env.META_PAGE_TOKEN
}) }}
```

---

## Supabase Schema Extension

### SQL to run in Supabase Dashboard (one-time migration):

```sql
ALTER TABLE content_sessions ADD COLUMN IF NOT EXISTS format TEXT DEFAULT 'single';
ALTER TABLE content_sessions ADD COLUMN IF NOT EXISTS image_urls JSONB;
```

### Updated Supabase INSERT body for carousel path (`💾 Guardar sesión Supabase (Carousel)`):

```javascript
// In the jsonBody expression:
={{ JSON.stringify({
  session_id: 'propulsar_' + Date.now(),
  approval_number: $json.approval_number,
  topic: $json.topic,
  type: $json.type,
  angle: $json.angle || null,
  platforms: $json.platforms || [],
  image_model: $json.image_model || 'ideogram',
  format: 'carousel',
  image_urls: $json.image_urls,
  instagram_caption: ($json.instagram && $json.instagram.caption) || null,
  facebook_caption: ($json.facebook && $json.facebook.caption) || null,
  status: 'pending'
}) }}
```

**Placement**: The `💾 Guardar sesión Supabase (Carousel)` node must be inserted on the carousel path between `🗂️ Collect Image URLs` and the WhatsApp preview sequence. Looking at the current carousel flow:

```
🗂️ Collect Image URLs → 📨 Split URLs WA → 📤 Enviar imagen WA → 📱 Preparar mensaje WA → 📤 Enviar WhatsApp
```

Must become:

```
🗂️ Collect Image URLs
   → [NEW] 💾 Guardar sesión Supabase (Carousel)
   → [NEW] 🔗 Re-attach carousel session data   ← Set node to re-attach after Supabase INSERT replaces $json
   → 📨 Split URLs WA
   → 📤 Enviar imagen WA
   → 📱 Preparar mensaje WA
   → 📤 Enviar WhatsApp
```

**Note**: `💾 Guardar sesión Supabase` replaces the item with the INSERT response (the inserted row). The existing single-post path has `🔗 Re-attach session data` immediately after Supabase for this reason. The carousel path needs the same pattern.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact on Phase 7 |
|--------------|------------------|--------------|-------------------|
| Status polling for carousel readiness | Fixed 30s Wait (per IGPUB-03 decision) | Phase 5 design choice | Same 30s Wait pattern applies to carousel; polling deferred to HARD-03 (v2+) |
| Direct multipart image upload to Meta | Server-side fetch via `image_url` / `url` parameter | Meta IG API launch | Phase 7 uses same Azure Blob URLs — no binary upload needed |
| Carousel child containers via batch API | Individual sequential POSTs per child | Current Meta API | N sequential POSTs is the documented approach; batch API has different semantics |
| `graph.instagram.com` for IG calls | `graph.facebook.com` for ALL Meta calls | Phase 5 Plan 02 | Phase 7 uses `graph.facebook.com` for both IG carousel and FB carousel |
| Carousel in separate workflow | Inline in main workflow | Project design decision | All Phase 7 nodes go into `n8n/workflow.json` |

**Deprecated / do not use:**
- `graph.instagram.com` — Page tokens rejected (Phase 5 confirmed)
- `is_carousel_item` on the PARENT container — only on children
- JSON array for `children` parameter — must be comma-separated string
- `post_id` (from `/photos` response) in `attached_media` — must use `id` (the Photo object ID)

---

## Open Questions

1. **FB `attached_media` JSON body format — confirmed?**
   - What we know: Meta official docs show form-encoded examples (`-d "attached_media[0]=..."`) and the `/page/feed` JSON reference does not explicitly document `attached_media` as a JSON body parameter
   - What's unclear: Whether `specifyBody: "json"` with `JSON.stringify({...attached_media: [...]})` works, or whether n8n needs to use `specifyBody: "string"` with a raw JSON string
   - **Recommendation**: Plan 02 E2E test should specifically test this — if `attached_media` as a JSON array fails, fall back to raw string body. The Code node building the body can switch to `JSON.stringify(...)` producing the complete request body string, and the HTTP node uses `specifyBody: "string"` receiving `$json.request_body` as a pre-serialized string.

2. **Supabase re-attach pattern on carousel path — node ordering**
   - What we know: `🗂️ Collect Image URLs` currently outputs directly to `📨 Split URLs WA`. Inserting Supabase INSERT + Re-attach before the WA split requires adjusting 3 connection pairs.
   - What's unclear: Whether `📨 Split URLs WA` (which reads `$json.image_urls`) still works correctly after the Re-attach Set node modifies the item.
   - **Recommendation**: In the Re-attach Set node on the carousel path, explicitly include `image_urls` in the assignments (from `$('🗂️ Collect Image URLs').first().json.image_urls`) so downstream `📨 Split URLs WA` still has access to it.

3. **Plan count — 2 plans enough?**
   - What we know: Phase 7 adds ~12 new nodes, removes 1 guard, extends Supabase schema, and modifies 3 existing nodes.
   - What's unclear: Whether plan 01 (all workflow.json changes + schema) is too large for one task.
   - **Recommendation**: 2 plans. Plan 01 = schema migration + all workflow.json changes. Plan 02 = deploy + E2E carousel tests (Tests A = 5-slide IG+FB, B = 3-slide IG+FB, C = single-post still works). If plan 01 proves too large during execution, split carousel graph changes (IG vs FB) into separate sub-tasks within the same plan.

4. **Sheets Log — shared vs separate for carousel**
   - What we know: `📊 Google Sheets Log` cross-refs `🔗 IG: Get Permalink` and `🌐 FB: Publish Photo` (single-post nodes). Carousel has different node names.
   - What's unclear: Whether to update the shared Sheets Log with conditional expressions or add a `📊 Google Sheets Log (Carousel)` node.
   - **Recommendation**: Add a separate `📊 Google Sheets Log (Carousel)` node at the end of the carousel path. Cross-refs are simpler when specific to one path. The two Sheets nodes can share the same credentials and sheet configuration (just different cross-ref node names). Optional: add a `Num_Slides` column for carousel rows.

5. **`image_urls` field name consistency**
   - What we know: `🗂️ Collect Image URLs` outputs `image_urls: [string, string, ...]` (array of raw URL strings, confirmed from Code node source). The `💾 Guardar sesión Supabase (Carousel)` INSERT body needs `image_urls` as an array.
   - What's unclear: Whether the JSONB column in Supabase handles a JavaScript string array natively.
   - **Recommendation**: Pass `image_urls: $json.image_urls` directly — PostgreSQL JSONB accepts any valid JSON, and `JSON.stringify` of a string array produces `["url1","url2",...]` which is valid JSONB.

---

## Sources

### Primary (HIGH confidence)
- [Meta — IG Content Publishing (carousel flow)](https://developers.facebook.com/docs/instagram-platform/content-publishing) — 3-step carousel flow, `is_carousel_item`, `media_type=CAROUSEL`, `children` comma-separated
- [Meta — POST /{IG_ID}/media reference](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media) — child vs parent container parameters, caption placement
- [Meta — POST /page/photos (published=false)](https://developers.facebook.com/docs/graph-api/reference/page/photos/) — `published: false` for FB unpublished photo upload, response `{ id, post_id }`
- [Meta — IG Container status codes](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-container) — `IN_PROGRESS`, `FINISHED`, `ERROR`, `EXPIRED`, 24h expiry
- Project `n8n/workflow.json` — current node patterns, fan-out/aggregate code, existing connections
- Project `n8n/subworkflow-rehost-images.json` — proven N→1 aggregate pattern in `🗂️ Collect blob_urls`
- Project `.planning/STATE.md` — all prior decisions, Supabase schema gap, known constraints
- Project `.planning/phases/05-instagram-single-photo-publishing/05-RESEARCH.md` — single-post IG patterns carried forward
- Project `.planning/phases/06-facebook-single-photo-publishing/06-RESEARCH.md` — single-post FB patterns + `attached_media` FBPUB-02 context

### Secondary (MEDIUM confidence)
- [Meta — POST /page/feed (attached_media)](https://developers.facebook.com/docs/graph-api/reference/page/feed/) — `attached_media` parameter confirmed as a valid field; JSON body format inferred from form-encoded examples
- Community verification of `media_fbid` field name in `attached_media` array objects
- Meta documentation confirming `attached_media[0]={"media_fbid":"..."}` format (form-encoded examples from official docs; JSON equivalent inferred)

### Tertiary (LOW confidence — flag for validation)
- Exact JSON serialization behavior of `attached_media` nested array in n8n HTTP Request `specifyBody: "json"` — needs empirical confirmation in Plan 02 E2E test

---

## Metadata

**Confidence breakdown:**
- IG carousel API flow (3-step, child/parent containers): HIGH — official Meta docs clearly document all parameters
- FB multi-photo `attached_media` flow: MEDIUM — official docs confirm the two-step concept and `media_fbid` field name; JSON body serialization in n8n is inferred, not directly documented
- n8n fan-out/aggregate pattern: HIGH — proven in the project's own sub-workflow
- Supabase schema extension: HIGH — straightforward `ALTER TABLE IF NOT EXISTS` SQL
- Node layout / connection plan: HIGH — follows established project patterns exactly

**Research date:** 2026-04-17
**Valid until:** 2026-09-01 (or when Meta deprecates v22 — ~Sep 2026 per changelog cadence)

---

## RESEARCH COMPLETE
