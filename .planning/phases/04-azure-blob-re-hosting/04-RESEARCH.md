# Phase 4: Azure Blob Re-hosting - Research

**Researched:** 2026-04-10
**Domain:** Azure Blob Storage REST API, n8n binary HTTP, sub-workflow patterns
**Confidence:** HIGH (Azure), MEDIUM (n8n binary internals — docs incomplete, pattern verified from existing workflow)

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- **Auth against Azure Blob: SAS token** — reuse existing `AZURE_SAS_PARAMS` already configured in the Container App. Zero infra changes.
- **Naming convention: date-prefixed UUID** — format `YYYY/MM/DD/<uuid>.<ext>` (e.g., `2026/04/10/a3f2b1c9-....jpg`)
- **Single container** — reuse the existing `AZURE_CONTAINER` for all posts
- **Upload order: strict** — slide 1 must map to blob 1. Downstream phases rely on correct ordering.
- **Partial failure policy: retry the failed image** — retry 2-3 times. If still fails → abort entire post and notify user. No partial carousel publishing.
- Must reuse env vars: `AZURE_STORAGE_ACCOUNT`, `AZURE_CONTAINER`, `AZURE_SAS_PARAMS`
- No `$env` inside Code nodes — env vars must be read via n8n expressions (e.g., `{{ $env.AZURE_STORAGE_ACCOUNT }}`)

### Claude's Discretion
- Upload method (HTTP Request+SAS vs SDK in Code node)
- Sub-workflow vs inline
- Stream vs buffer transfer
- Content-type handling (detect vs force JPG)
- Blob name predictability
- Sequential vs parallel carousel uploads
- Orphan blob cleanup timing (Phase 4 now vs Phase 9 later)
- HEAD verification policy and retries
- 2-hour persistence verification approach
- Blob URL tracking storage (execution data vs Supabase)

### Deferred Ideas (OUT OF SCOPE)
- Orphan blob cleanup on success → Phase 9
- Publishing to Meta (IG/FB single + carousel) → Phases 5, 6, 7
- Scheduling / Wait node in front of re-hosting → Phase 8
- OAuthException 190 / token expiry alerts → Phase 9
- Failure logging row in Sheets → Phase 9
</user_constraints>

---

## Summary

Phase 4 downloads images from Ideogram/FAL temporary URLs and re-hosts them to permanent public Azure Blob URLs. The flow must be callable from both single-post (Phases 5-6) and carousel (Phase 7) paths, making a reusable sub-workflow the natural architecture.

The Azure Blob Storage REST API "Put Blob" operation is straightforward over HTTP: a single authenticated PUT with three required headers (`x-ms-blob-type: BlockBlob`, `x-ms-version`, `Content-Length`) plus a SAS token appended to the URL as a query string. The SAS token is the existing `AZURE_SAS_PARAMS` variable — it contains the full query string (everything after `?`), so the upload URL is simply `https://<account>.blob.core.windows.net/<container>/<blob-name>?<AZURE_SAS_PARAMS>`. The SAS must have Write (`w`) or Create (`c`) permission in its `sp` field.

For public anonymous reads, Azure has TWO independent settings that must both be enabled: (1) `AllowBlobPublicAccess = true` on the storage account (disabled by default post-2023), and (2) the container's access level set to "Blob" (not "Container", not "Private"). Felix must verify both in Azure Portal BEFORE this phase is testable — this is a hard prerequisite and known blocker (already noted in STATE.md).

**Primary recommendation:** Use n8n HTTP Request node (not SDK) for both download and upload. Download image as binary (`Response Format: File`), then upload via PUT with `Send Binary Data = true`. No SDK, no extra dependencies, fully within n8n's existing capabilities. Wrap in a sub-workflow for reuse. Process carousel images sequentially (one by one) to preserve order and simplify error isolation.

---

## Standard Stack

### Core
| Component | Version | Purpose | Why Standard |
|-----------|---------|---------|--------------|
| n8n HTTP Request node | typeVersion 4.2 (current in project) | Download image binary + PUT to Azure | Already used in workflow, no new nodes needed |
| Azure Blob Storage REST API | `x-ms-version: 2020-10-02` | Put Blob operation | Official REST, no SDK required |
| n8n Execute Workflow node | typeVersion 1 | Invoke the re-hosting sub-workflow | Native n8n sub-workflow pattern |
| n8n Execute Sub-workflow Trigger | typeVersion 1 | Entry point of the re-hosting sub-workflow | Native n8n pattern |
| n8n Code node | typeVersion 2 | UUID generation, URL assembly, array aggregation | Already used extensively in project |

### Supporting
| Component | Version | Purpose | When to Use |
|-----------|---------|---------|-------------|
| crypto (Node.js built-in) | — | UUID generation in Code node | Available inside n8n Code nodes via `require('crypto')` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| HTTP Request (binary) | Code node + `@azure/storage-blob` SDK | SDK would require installing npm pkg in n8n container — complexity not worth it for a simple PUT |
| Sequential processing | SplitInBatches (parallel, batchSize=1) | Sequential via array iteration is simpler, preserves order explicitly, easier to abort on failure |

---

## Architecture Patterns

### Recommended Sub-Workflow Structure

```
[Main Workflow]
    └─ ✅ Check Approval (SI)
         └─ 🔁 Execute Sub-Workflow: "Re-host Images"
                  │  Input: { image_urls: [{index, url}], post_id }
                  │  Output: { blob_urls: [{index, url}] }
                  │
                  └─ [Sub-Workflow: "Re-host Images"]
                       ├─ Execute Sub-Workflow Trigger (receives input)
                       ├─ 🔧 Code: Extract array + prepare loop
                       ├─ Loop over images (sequential):
                       │   ├─ 📥 HTTP GET: Download image binary
                       │   ├─ 🔧 Code: Build blob name (YYYY/MM/DD/<uuid>.<ext>)
                       │   └─ 📤 HTTP PUT: Upload to Azure Blob
                       ├─ 🔧 Code: Aggregate blob_urls array (preserve index)
                       └─ Return: { blob_urls: [{index, url}] }
```

The main workflow calls the sub-workflow from the post-approval path. All three downstream phases (5: IG single, 6: FB single, 7: IG+FB carousel) consume the sub-workflow's output blob_urls array identically.

### Pattern 1: Azure Blob PUT via SAS Token

**What:** PUT Blob request with SAS authentication via query string
**When to use:** Always — the only upload method needed

```
// Source: https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob

PUT https://<AZURE_STORAGE_ACCOUNT>.blob.core.windows.net/<AZURE_CONTAINER>/<blob-name>?<AZURE_SAS_PARAMS>

Required headers:
  x-ms-blob-type: BlockBlob
  x-ms-version: 2020-10-02
  Content-Type: image/jpeg   (or image/png — see content-type section)
  Content-Length: <bytes>    (n8n sets this automatically when sendBinaryData=true)

Success response: 201 Created
```

**n8n HTTP Request node configuration:**
- Method: PUT
- URL: `=https://{{ $env.AZURE_STORAGE_ACCOUNT }}.blob.core.windows.net/{{ $env.AZURE_CONTAINER }}/{{ $json.blob_name }}?{{ $env.AZURE_SAS_PARAMS }}`
- Body Content Type: Binary
- Input Data Field Name: `data` (the field where the previous GET node stored the binary)
- Additional Headers:
  - `x-ms-blob-type`: `BlockBlob`
  - `x-ms-version`: `2020-10-02`
  - `Content-Type`: `{{ $json.content_type }}` (passed from download step)

**Critical note on URL encoding:** `AZURE_SAS_PARAMS` should be stored as the raw query string (e.g., `sv=2022-11-02&se=...&sp=w&sr=c&sig=...`). Do NOT double-encode. The `?` separator is added manually in the URL — the SAS params string should NOT start with `?`.

### Pattern 2: Download Image as Binary

**What:** HTTP GET with `Response Format: File` to capture binary data
**When to use:** Downloading Ideogram/FAL images before upload

```
// n8n HTTP Request node:
Method: GET
URL: {{ $json.image_url }}   // full URL including exp/sig params (already preserved in workflow)
Response Format: File
Put Output in Field: data    // stores binary in item.binary.data
```

The binary object is then referenced in the PUT node via `Input Data Field Name: data`.

### Pattern 3: Sequential Loop with Index Preservation

**What:** Process an array sequentially using a Code node loop, collecting results
**When to use:** Carousel upload where order matters and partial failure requires abort

```javascript
// Source: existing project pattern from 🎠 Explode Slides + 🗂️ Collect Image URLs

// STEP 1: In a Code node (runOnceForAllItems), prepare items with index
const imageUrls = $input.first().json.image_urls; // [{index, url}]
return imageUrls.map((item) => ({
  json: {
    slide_index: item.index,  // carry index explicitly
    image_url:   item.url,
    // ... other data needed downstream
  }
}));

// STEP 2: Items flow through HTTP GET → Code (build blob name) → HTTP PUT
// Each item processed individually since n8n processes array items sequentially by default

// STEP 3: In a final Code node (runOnceForAllItems), aggregate results
const items = $input.all();
const blobUrls = items.map(item => ({
  index: item.json.slide_index,
  url:   item.json.blob_url,
}));
// Sort by index to guarantee order
blobUrls.sort((a, b) => a.index - b.index);
return [{ json: { blob_urls: blobUrls } }];
```

**Key insight from existing workflow:** The project already uses this "Explode → process → Collect" pattern for carousel image generation (🎠 Explode Slides → 🔤 Ideogram — Slide → 🗂️ Collect Image URLs). Phase 4 follows the SAME pattern. No new looping primitives needed.

### Pattern 4: Sub-Workflow Input/Output Contract

**What:** The API shape that Phases 5, 6, 7 will consume
**When to use:** Designing the sub-workflow's trigger and return value

```javascript
// Sub-workflow INPUT (passed by Execute Workflow node):
{
  "image_urls": [             // ordered array
    { "index": 1, "url": "https://ideogram.ai/assets/...?exp=...&sig=..." },
    { "index": 2, "url": "https://cdn.fal.ai/..." }
  ],
  "post_id": "propulsar_1712790000000",  // from session_id in main workflow
  "approval_number": "34612345678"       // for failure notification
}

// Sub-workflow OUTPUT (returned to Execute Workflow node):
{
  "blob_urls": [              // same length, same order as input
    { "index": 1, "url": "https://<account>.blob.core.windows.net/<container>/2026/04/10/<uuid>.jpg" },
    { "index": 2, "url": "https://<account>.blob.core.windows.net/<container>/2026/04/10/<uuid>.jpg" }
  ],
  "post_id": "propulsar_1712790000000"   // pass-through for downstream phases
}
```

**For single-post:** Pass `image_urls` with one item (`index: 1`). Output `blob_urls` has one item. Phases 5/6 consume `blob_urls[0].url`.
**For carousel:** Pass 3-7 items. Output has same count. Phase 7 consumes full array.

### Pattern 5: Partial Failure → Abort with WhatsApp Notification

**What:** Clean abort if any image fails after retries
**When to use:** After retry attempts exhausted for one image

```javascript
// In a Code node on the error branch after HTTP PUT failure:
throw new Error(`Re-hosting failed for slide ${$json.slide_index} after retries. Post aborted.`);

// The thrown error stops execution. Wire a separate error branch to:
// 1. Send WhatsApp "No se pudo publicar — falla en imagen X" via YCloud
// 2. Optionally: delete already-uploaded blobs (orphan cleanup)
```

### Anti-Patterns to Avoid
- **Using `$env` inside Code nodes:** n8n Code nodes do not have access to `process.env` from the container — env vars in Code nodes must come from upstream node data or n8n expressions. Access them as `{{ $env.AZURE_STORAGE_ACCOUNT }}` in the URL/header fields of HTTP Request nodes, not inside `jsCode`.
- **Hardcoding `x-ms-version: 2015-02-21`:** While valid, use `2020-10-02` or newer to support full blob features. The sample requests in Azure docs use old versions as examples only.
- **Missing `x-ms-blob-type` header:** This is REQUIRED for block blobs. Omitting it returns `400 Bad Request` with a cryptic error about invalid request format.
- **Using SAS for public reads:** The SAS token is for WRITE only (upload). Public reads are anonymous — no SAS token in the read URL. This is already a locked decision.
- **Retrying `media_publish` operations in downstream phases:** This lesson from STATE.md applies to Meta calls in Phases 5-7, not to blob upload. Blob PUT IS idempotent — retrying a PUT with the same blob name overwrites and succeeds. Safe to retry.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| UUID generation | Custom random string | `require('crypto').randomUUID()` in Code node | Built-in Node.js, no collisions, standard format |
| Binary download+upload | Custom streaming pipeline | n8n HTTP Request (GET binary → PUT binary) | n8n buffers the binary in the item — no custom piping needed |
| Retry logic | Manual retry counter in Code node | HTTP Request node's built-in "Retry On Fail" | Native, handles delays, no extra nodes |
| Error notification | Complex error flow | Single HTTP Request to YCloud WhatsApp API | Same pattern already used in the workflow |

---

## Common Pitfalls

### Pitfall 1: Missing `AllowBlobPublicAccess` on Storage Account
**What goes wrong:** Blob PUT succeeds (201 Created), but GET returns 403 Forbidden — the blob is not publicly readable even though the container has "Blob" access set.
**Why it happens:** Azure introduced `AllowBlobPublicAccess = false` as the DEFAULT for new storage accounts post-2023. The container-level setting only matters if the account-level flag is enabled first.
**How to avoid:** Felix must explicitly go to Azure Portal → Storage Account → Configuration → set "Allow Blob anonymous access" = Enabled BEFORE testing Phase 4.
**Warning signs:** Success Criterion 2 fails (blob URL returns 403 in browser even after upload succeeds).

### Pitfall 2: Wrong SAS Permissions (`sp` field)
**What goes wrong:** HTTP PUT returns 403 Forbidden with "AuthorizationFailed" or "SignedPermissions" error.
**Why it happens:** The `AZURE_SAS_PARAMS` was generated with read-only permissions (`sp=r`) instead of write/create permissions (`sp=w` or `sp=c`).
**How to avoid:** Verify the `sp` parameter in `AZURE_SAS_PARAMS` includes `w` (write) or `c` (create). For a new upload (creating a blob), `c` is sufficient. For overwriting, `w` is required. Recommended: `sp=cw` to cover both.
**Warning signs:** `$env.AZURE_SAS_PARAMS` contains `sp=r` or `sp=rl`.

### Pitfall 3: SAS Token with Expired `se` Parameter
**What goes wrong:** Uploads fail with 403 "Signature not valid" after the SAS expiry date.
**Why it happens:** The `AZURE_SAS_PARAMS` value has a `se=` (signed expiry) timestamp that has passed.
**How to avoid:** The SAS token stored in `AZURE_SAS_PARAMS` should have a long expiry (e.g., 1-2 years from creation). Regenerate if expired. Container App env vars are updated without code changes.
**Warning signs:** Upload worked yesterday but fails today; check the `se=` date in the SAS params string.

### Pitfall 4: Binary Field Name Mismatch Between Nodes
**What goes wrong:** The PUT upload node throws "Binary property 'data' does not exist" even though the GET node downloaded the image.
**Why it happens:** The HTTP Request GET node stores binary in a field name (e.g., `data`). The PUT node's "Input Data Field Name" must match exactly. If the GET node uses the default field name, verify it's `data`.
**How to avoid:** Explicitly set `Put Output in Field: data` on the GET node and `Input Data Field Name: data` on the PUT node.

### Pitfall 5: Blob Name URL-Encoding
**What goes wrong:** Blob created with URL-encoded path separators (`2026%2F04%2F10%2Fuuid.jpg`) instead of the intended path (`2026/04/10/uuid.jpg`).
**Why it happens:** When building the URL in an n8n expression, forward slashes in the blob name get double-encoded.
**How to avoid:** Azure Blob Storage allows forward slashes in blob names as virtual directory separators. They should NOT be URL-encoded in the path. In n8n, include the blob name directly in the URL path — n8n HTTP Request does not URL-encode path segments.
**Warning signs:** Blobs appear with `%2F` in their names in the Azure portal.

### Pitfall 6: Orphaned Blobs from Failed Carousel
**What goes wrong:** Images 1-3 of a 5-slide carousel are uploaded, image 4 fails after retries. Abort message is sent, but blobs 1-3 remain in Azure Blob forever.
**Why it happens:** Phase 4 aborts on failure but doesn't clean up already-uploaded blobs.
**How to avoid:** This is a DEFERRED concern per the locked decisions — Phase 9 handles orphan cleanup. The planner should add a note that blob URLs from failed uploads should be included in the failure notification payload so Phase 9 can clean them up. For Phase 4 scope, just abort and notify.

---

## Code Examples

### Building the Blob URL After Upload (Code Node)
```javascript
// Source: Azure Blob REST API docs + standard pattern
// Runs AFTER the PUT succeeds for each image

const storageAccount = $('Execute Sub-workflow Trigger').first().json._azure_account;
// ↑ Note: env vars passed INTO the sub-workflow via the trigger, not $env inside code

const container  = $('Execute Sub-workflow Trigger').first().json._azure_container;
const blobName   = $json.blob_name;  // YYYY/MM/DD/<uuid>.jpg — already computed

const blobUrl = `https://${storageAccount}.blob.core.windows.net/${container}/${blobName}`;

return [{ json: { ...$json, blob_url: blobUrl } }];
```

**Alternative (using $env in HTTP Request URL field, not code):**
The cleaner approach is to build the final URL in the HTTP Request node's URL field using expressions (`{{ $env.AZURE_STORAGE_ACCOUNT }}`), so the Code node only handles blob name generation.

### Generating the Blob Name (Code Node)
```javascript
// Source: Node.js crypto module (built-in)
const { randomUUID } = require('crypto');

const now = new Date();
const year  = now.getUTCFullYear();
const month = String(now.getUTCMonth() + 1).padStart(2, '0');
const day   = String(now.getUTCDate()).padStart(2, '0');
const uuid  = randomUUID();

// Detect extension from Content-Type or default to jpg
const contentType = $json.content_type || 'image/jpeg';
const ext = contentType.includes('png') ? 'png' : 'jpg';

const blobName = `${year}/${month}/${day}/${uuid}.${ext}`;

return [{ json: { ...$json, blob_name: blobName, content_type: contentType } }];
```

### HTTP Request PUT Node Configuration (n8n JSON)
```json
{
  "parameters": {
    "method": "PUT",
    "url": "=https://{{ $env.AZURE_STORAGE_ACCOUNT }}.blob.core.windows.net/{{ $env.AZURE_CONTAINER }}/{{ $json.blob_name }}?{{ $env.AZURE_SAS_PARAMS }}",
    "sendHeaders": true,
    "headerParameters": {
      "parameters": [
        { "name": "x-ms-blob-type", "value": "BlockBlob" },
        { "name": "x-ms-version",   "value": "2020-10-02" },
        { "name": "Content-Type",   "value": "={{ $json.content_type }}" }
      ]
    },
    "sendBody": true,
    "contentType": "binaryData",
    "inputDataFieldName": "data",
    "options": {
      "retry": {
        "enabled": true,
        "maxTries": 3,
        "waitBetweenTries": 2000
      }
    }
  },
  "type": "n8n-nodes-base.httpRequest",
  "typeVersion": 4.2
}
```

### Abort + Notify Pattern (Error Branch Code Node)
```javascript
// On the error output of the PUT node (after retries exhausted):
const slideIndex = $json.slide_index || 'unknown';
const approvalNumber = $json.approval_number;

// The error will stop this branch. Wire to a WhatsApp node for notification.
// DO NOT throw here — let the error branch flow to the WA notification node.
return [{
  json: {
    error_message: `❌ Error al re-alojar imagen ${slideIndex}. Post cancelado.`,
    approval_number: approvalNumber,
    failed_slide: slideIndex,
    // Include already-uploaded blob URLs for Phase 9 orphan cleanup
    uploaded_blobs_before_failure: $('🗂️ Collect Blobs').all().map(i => i.json.blob_url).filter(Boolean),
  }
}];
```

---

## Recommendations (Claude's Discretion Items)

### 1. Upload Method: HTTP Request + SAS (vs SDK in Code node)
**Recommendation: HTTP Request node.**
Rationale: The project already uses HTTP Request for all external APIs (Ideogram, FAL, YCloud, Meta). No new packages to install in the n8n container. The Azure REST API is simple enough — a single PUT with three headers. SDK adds complexity with zero benefit for this use case.

### 2. Sub-workflow vs Inline
**Recommendation: Sub-workflow.**
Rationale: Phases 5, 6, and 7 all need re-hosting. Without a sub-workflow, the same GET→PUT→collect logic would be duplicated in three places. A sub-workflow means one place to fix bugs. The CONTEXT.md already leans this direction ("likely the natural choice").

### 3. Stream vs Buffer
**Recommendation: Buffer (n8n's default binary handling).**
Rationale: Typical Ideogram images are 500KB-2MB PNG/JPG. FAL images are similar. n8n buffers binary data in memory between nodes — this is the standard behavior and works within n8n's binary pipeline. No streaming infrastructure needed. n8n 2.14.2 supports binary up to 50MB by default; our images are well within this. Stream processing would require custom Code node logic with no practical benefit at these file sizes.

### 4. Content-Type: Preserve vs Force JPG
**Recommendation: Preserve the source Content-Type, default to `image/jpeg` if undetectable.**
Rationale: Ideogram returns PNG (1:1 format) with `Content-Type: image/png`. FAL Flux and Nano Banana return JPEG by default. Meta Graph API accepts both `image/jpeg` and `image/png` for the `media_type` field. Preserving the original Content-Type keeps blob metadata accurate and avoids re-encoding. The HTTP GET response headers contain the Content-Type — extract it and pass downstream. Default fallback: `image/jpeg`.
**Implementation:** In the GET node, capture the response headers. In n8n HTTP Request with `Response Format: File`, the content-type from the response is accessible via `$response.headers['content-type']` or falls back to the URL extension.

### 5. Blob Name Predictability (random UUID vs reconstructible from post_id)
**Recommendation: Pure date-prefixed UUID (random, not reconstructible).**
Rationale: Locked decision already specifies UUID. Reconstructible names from post_id add complexity with no clear benefit — the blob URL will be stored and passed through execution data anyway. UUID guarantees no collision. The date prefix enables manual auditing and batch cleanup by date in Phase 9.

### 6. Sequential vs Parallel (batch=1) for Carousels
**Recommendation: Sequential (implicit n8n item processing).**
Rationale: Carousels have 3-7 slides. Sequential upload of 3-7 images at ~100-500ms per upload adds 300ms-3.5s total — acceptable for a non-realtime workflow. Sequential processing makes error isolation trivial (which slide failed?) and avoids Azure rate limiting concerns. The existing project already uses this pattern (Explode Slides → Ideogram — Slide runs once per item). Parallel uploads would complicate abort logic significantly.

### 7. HEAD Verification Post-Upload: Yes or No?
**Recommendation: Yes, but lightweight — one HEAD request per image, no retry loop.**
Rationale: A HEAD request immediately after upload confirms (a) the URL is publicly reachable, and (b) detects the "AllowBlobPublicAccess disabled" blocker during development. Cost: one extra HTTP call per image (~50ms). Benefit: catches misconfiguration before Meta API tries to fetch the image and fails silently downstream. If HEAD returns non-200, fail fast with a clear error message. No retry on HEAD failure — a 403 HEAD means the container config is wrong, not a transient error.

### 8. Orphan Blob Cleanup on Abort: Phase 4 or Phase 9?
**Recommendation: Defer to Phase 9 (pass blob URLs in the abort notification payload).**
Rationale: Keeping Phase 4 scope tight. Phase 9 is explicitly scoped for cleanup. The abort notification payload should include the list of blob URLs uploaded before the failure — Phase 9 can use these to clean up. This avoids adding DELETE Blob API calls to Phase 4's scope while still enabling cleanup later.

### 9. Blob URL Tracking: Supabase or Execution Data?
**Recommendation: Execution data only (pass through the workflow as JSON).**
Rationale: Blob URLs are needed only for the immediate downstream phases (5, 6, 7) within the same execution. They don't need to survive between separate n8n executions. Supabase is used for cross-execution state (approval session lookup), but blob URLs within a single post flow are ephemeral — they flow from Phase 4's output directly into Phases 5-7 as JSON. Writing to Supabase would add latency and a dependency for something that doesn't need persistence. Phase 9 cleanup can get the blob URLs from the Sheets log (where publish success is already recorded) or from the abort notification payload.

---

## Azure Blob REST API — Verified Specifics

### Put Blob Endpoint
```
PUT https://<storageaccount>.blob.core.windows.net/<container>/<blobname>?<SAS_PARAMS>
```
- `<storageaccount>` = value of `AZURE_STORAGE_ACCOUNT`
- `<container>` = value of `AZURE_CONTAINER`
- `<blobname>` = e.g., `2026/04/10/a3f2b1c9-uuid.jpg` (forward slashes are virtual directories, not URL-encoded)
- `<SAS_PARAMS>` = value of `AZURE_SAS_PARAMS` (the full query string without leading `?`)

Source: https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob

### Required Headers for BlockBlob
| Header | Value | Notes |
|--------|-------|-------|
| `x-ms-blob-type` | `BlockBlob` | REQUIRED. Omitting returns 400. |
| `x-ms-version` | `2020-10-02` | Recommended current version. |
| `Content-Type` | `image/jpeg` or `image/png` | Optional per spec, but set it — Meta may inspect Content-Type. |
| `Content-Length` | `<bytes>` | Set automatically by n8n when using sendBinaryData/binaryData body. |

Source: https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob

### SAS Permissions Required for Upload
- `sp=c` (Create) — sufficient for creating new blobs
- `sp=w` (Write) — required for overwriting existing blobs
- Recommended: `sp=cw` in `AZURE_SAS_PARAMS`
- `sr=c` (signed resource = container) — allows operations on all blobs in the container

Source: https://learn.microsoft.com/en-us/rest/api/storageservices/create-service-sas

### Example SAS URI Format
```
https://myaccount.blob.core.windows.net/sascontainer/blob1.txt?sp=cw&st=2026-04-10T00:00:00Z&se=2027-04-10T00:00:00Z&spr=https&sv=2022-11-02&sr=b&sig=<signature>
```

Source: https://learn.microsoft.com/en-us/rest/api/storageservices/create-service-sas (example section)

### Success Response
- **201 Created** — blob created successfully
- Response headers include `ETag`, `Last-Modified`, `x-ms-request-id`
- No response body

---

## Public Access Prerequisites (Felix Must Verify)

Two independent settings must BOTH be enabled for anonymous public reads:

### Setting 1: Storage Account Level
**Azure Portal path:** Storage Account → Settings → Configuration → "Allow Blob anonymous access" = **Enabled**

This is the property `AllowBlobPublicAccess`. It is disabled by default on storage accounts created after November 2023.

Without this: container-level access setting has no effect. Blobs will be private regardless of container setting.

Source: https://learn.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-configure

### Setting 2: Container Level
**Azure Portal path:** Storage Account → Data storage → Containers → Select container → Change access level → **"Blob" (anonymous read access for blobs only)**

Three options:
- **Private** (default) — no anonymous access
- **Blob** — anonymous read for blobs, NOT container listing. **This is what we want.**
- **Container** — anonymous read AND container listing. Unnecessarily permissive.

Without this: even with account-level enabled, blobs require auth.

Source: https://learn.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-configure

**Felix Checklist (must complete BEFORE testing Phase 4):**
- [ ] Azure Portal → Storage Account `AZURE_STORAGE_ACCOUNT` → Configuration → Allow Blob anonymous access = Enabled
- [ ] Azure Portal → Containers → `AZURE_CONTAINER` → Change access level → Blob
- [ ] Verify `AZURE_SAS_PARAMS` contains `sp=cw` (or `sp=w`) — write permission for uploads
- [ ] Verify `se=` date in `AZURE_SAS_PARAMS` is in the future

---

## n8n Binary Data Handling

### Download Binary (HTTP GET → Binary)
The HTTP Request node with `Response Format: File` stores the downloaded binary in the item's binary property. Default field name is `data`.

Configuration in n8n node:
- `options.response.response.responseFormat`: `"file"`
- `options.response.response.outputPropertyName`: `"data"` (the field in `item.binary`)

After this node, downstream nodes access the binary via `$json.binary` (node expression) or the HTTP Request PUT node references it by field name.

### Upload Binary (HTTP PUT with Binary Body)
The HTTP Request node can send the binary from a previous node as the request body:
- Body Content Type: `Binary` (`contentType: "binaryData"`)
- Input Data Field Name: `data` (must match the field name from the GET node)

n8n handles `Content-Length` automatically when sending binary data.

Source: n8n docs (GitHub raw — verified via HTTP Request node documentation structure at https://raw.githubusercontent.com/n8n-io/n8n-docs/main/docs/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/index.md): "you can send the contents of a file stored in n8n as the body by entering the input data field name"

### Retry Configuration
HTTP Request node built-in retry:
- `options.retry.enabled`: `true`
- `options.retry.maxTries`: `3` (total attempts = 1 original + 2 retries)
- `options.retry.waitBetweenTries`: `2000` (ms between retries)

Blob PUT is idempotent — safe to retry. If the same blob name is used across retries, the last successful PUT wins (overwrite). Since we generate the UUID before the PUT loop, the same UUID is used on retry — this is correct behavior.

**Important distinction from STATE.md:** `media_publish` (Meta API) must NOT have retry enabled — it's non-idempotent and creates duplicate posts. Azure Blob PUT is idempotent — retry is safe and recommended.

---

## 2-Hour Persistence Verification (Success Criterion 3)

**Recommendation: One-time manual sign-off during phase testing, NOT an automated delayed check.**

Rationale: Success Criterion 3 ("Fetching the blob URL 2 hours after creation returns the full image") is testing that the blob has no expiry — i.e., that the public URL is truly permanent and not a CDN-signed URL with TTL. This is a property of Azure Blob's architecture (objects persist indefinitely by default unless explicitly deleted) combined with the public access configuration.

The verification is:
1. Upload a test image via the Phase 4 flow
2. Copy the blob URL
3. Check the URL in a browser immediately — should return 200
4. Check the URL again 2+ hours later — should still return 200

This is a one-time configuration verification, not a recurring automated test. Once confirmed, it doesn't need to be re-verified for every post. Add this as a manual verification step in the PLAN's acceptance criteria for the phase, not as an automated n8n node.

---

## Content-Type Evidence from Providers

### Ideogram v3
- Returns images as PNG by default for design/text outputs
- Content-Type response header: `image/png`
- Typical file size: 1-3 MB

### FAL.AI (Flux 2 Pro, Nano Banana Pro)
- Returns JPEG by default (`output_format` not specified in current workflow)
- The Nano Banana node in the project specifies `"output_format": "png"` — so it returns PNG
- Flux node does NOT specify output_format — defaults to JPEG
- Content-Type response header: `image/jpeg` or `image/png` depending on model

### Meta Graph API (downstream, Phases 5-7)
- Accepts both `image/jpeg` and `image/png` for image posts
- Maximum image size: 8 MB (JPEG), no stated limit for PNG but keep under 8 MB
- For carousel children: same limits apply per slide
- Recommendation: preserve original Content-Type; both formats are accepted

Source: Meta Graph API docs (from training data — MEDIUM confidence for Meta acceptance of both formats; HIGH confidence for Azure handling)

---

## Open Questions

1. **What is the exact format of `AZURE_SAS_PARAMS` stored in the Container App?**
   - What we know: It's an env var in the Azure Container App already. The locked decision says it's a SAS token.
   - What's unclear: Is it stored as the full query string (`sv=...&se=...&sp=...&sig=...`) or as a URL with `?` prepended? Does it include `sr=c` (container-scoped) or `sr=b` (blob-scoped)?
   - Recommendation: Felix should inspect the value in Azure Portal or via `az containerapp show` before the planner creates the PUT URL template. If it's container-scoped (`sr=c`), the URL works for any blob. If blob-scoped (`sr=b`), it only works for one specific blob name — which would break the pattern. **Most likely container-scoped**, but must verify.

2. **Does n8n 2.14.2 expose `$response.headers` after an HTTP GET?**
   - What we know: The HTTP Request node returns headers in some versions.
   - What's unclear: Whether `$response.headers['content-type']` is accessible in a downstream Code node in this specific n8n version.
   - Recommendation: If Content-Type headers aren't accessible from the HTTP GET response, fall back to inferring from the URL extension (`.jpg` → `image/jpeg`, `.png` → `image/png`). Most Ideogram/FAL URLs include the file extension.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Azure Blob anonymous access enabled by default | Disabled by default (opt-in required) | November 2023 | Must explicitly enable in Portal — common gotcha for new accounts |
| SAS tokens required for ALL reads | Public anonymous reads for configured containers | Always supported | No SAS needed in the public blob URL — just enable container access level |
| n8n SDK integrations for cloud storage | HTTP Request node for all external APIs | — | Simpler, no npm packages, consistent with project approach |

---

## Sources

### Primary (HIGH confidence)
- `https://learn.microsoft.com/en-us/rest/api/storageservices/put-blob` — Put Blob REST API: endpoint, headers, success codes, SAS usage (fetched 2026-04-10)
- `https://learn.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-configure` — Public access configuration: AllowBlobPublicAccess, container access levels (fetched 2026-04-10)
- `https://learn.microsoft.com/en-us/rest/api/storageservices/create-service-sas` — SAS token format, sp permissions, example URI (fetched 2026-04-10)
- `https://learn.microsoft.com/en-us/azure/storage/common/storage-sas-overview` — SAS overview, token query string parameters (fetched 2026-04-10)
- Project `n8n/workflow.json` — existing binary-free HTTP Request patterns, env var access via `$env.*`, Explode+Collect loop pattern (verified locally 2026-04-10)

### Secondary (MEDIUM confidence)
- `https://raw.githubusercontent.com/n8n-io/n8n-docs/main/docs/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/index.md` — n8n binary handling: "n8n Binary File" body type, Response Format File (fetched 2026-04-10; docs returned partial content)
- Azure Container Apps secrets docs — env vars available at runtime in container processes (fetched 2026-04-10)

### Tertiary (LOW confidence — needs validation)
- Meta Graph API image format acceptance (both JPEG and PNG) — from training data, not verified via current docs
- `$response.headers` accessibility in n8n 2.14.2 Code nodes — from training data; should be validated during implementation

---

## Metadata

**Confidence breakdown:**
- Azure Blob REST API (Put Blob, SAS, public access): HIGH — verified directly from official Microsoft docs
- n8n binary upload/download pattern: MEDIUM — docs returned partial content; pattern inferred from existing workflow + n8n GitHub docs
- Content-Type handling (Ideogram/FAL response headers): MEDIUM — inferred from provider behavior and existing workflow
- Meta image format acceptance: LOW — training data only

**Research date:** 2026-04-10
**Valid until:** 2026-10-10 (Azure REST API stable; n8n patterns stable for v2.14.x)
