# Phase 9: Error Hardening + Hashtags + Token Alerts — Research

**Researched:** 2026-04-17
**Domain:** Meta Graph API error handling, IG comments endpoint, Azure Blob deletion, n8n error output branch pattern
**Confidence:** HIGH (workflow code verified directly; Meta API verified via official docs; Azure REST verified via official docs)

---

## Summary

Phase 9 has five independent concerns that layer onto the existing 60-node workflow: (1) wiring n8n HTTP Request error output branches so Meta API failures route to a WhatsApp notification node instead of silently aborting; (2) detecting OAuthException code 190 specifically and sending a Spanish-language token-expired alert; (3) posting hashtags as a first comment on the published IG post via `POST /<media_id>/comments`; (4) logging failure rows to Google Sheets so the audit trail is complete even when publishing fails; and (5) deleting Azure Blob files after a successful publish or confirmed failure to avoid storage cost accumulation.

The existing workflow already has all five Meta HTTP Request nodes that touch publishing (`IG: Create Container`, `IG: media_publish`, `IG: Get Permalink`, `FB: Publish Photo`, and their carousel equivalents). Every one of these nodes currently uses `typeVersion: 4.2` with `onError: "stopWorkflow"` — meaning on failure, the entire execution halts and no cleanup or notification runs. The core architectural change for this phase is switching those nodes from `onError: "stopWorkflow"` to `onError: "continueErrorOutput"`, connecting the error output branch to a shared error-handling subgraph. The error subgraph inspects the Meta error JSON, branches on code 190, sends the appropriate WhatsApp message, writes a `Publish_Status=failed` row to Sheets, then deletes Azure Blobs.

The hashtag comment is independent: it fires after a successful `IG: media_publish` (or `IG: Carousel media_publish`), uses `POST /v22.0/<media_id>/comments` with `message=<hashtag_block>`, and the media_id comes directly from the `media_publish` response `{ id }`.

**Primary recommendation:** Build a single shared Code node that extracts the Meta error JSON, identifies code 190, and emits a structured error context object. Feed that into a WhatsApp notify node (reuse YCloud pattern), a Sheets fail-log node, and a Blob cleanup chain. Wire all Meta HTTP Request error outputs to this subgraph. Add the hashtag comment as a new node immediately after each `media_publish` success output.

---

## Standard Stack

### Core (all already in workflow)
| Component | Version/ID | Purpose | Notes |
|-----------|-----------|---------|-------|
| n8n HTTP Request | typeVersion 4.2 | Meta API calls with error output branch | `onError: "continueErrorOutput"` enables error output |
| YCloud WhatsApp API | `api.ycloud.com/v2/whatsapp/messages` | Send error alert | Same node pattern as `📤 Enviar WhatsApp` |
| Google Sheets node | typeVersion 4.4 | Log failed publish rows | Same credentials + schema as existing log nodes |
| Azure Blob Storage REST | DELETE verb | Remove blobs after publish/failure | HTTP Request node; SAS must include `d` (delete) permission |
| Meta Graph API | v22.0 | Post hashtag comment | `POST /v22.0/<media_id>/comments?message=...` |

### Supporting
| Component | Purpose | When to Use |
|-----------|---------|-------------|
| n8n IF node (typeVersion 1) | Branch on error.code === 190 | Route token-expired vs generic errors |
| n8n Code node (typeVersion 2) | Parse Meta error JSON from error output | Extract code, message, fbtrace_id, platform |

---

## Architecture Patterns

### Pattern 1: n8n HTTP Request Error Output Branch
**What:** When `onError: "continueErrorOutput"` is set on an HTTP Request node (typeVersion 4.2), errors produce output on a second branch (index 1 / "Error" output) instead of halting execution. The error item has shape `{ error: { message, code, type, ... } }` — but for HTTP responses the actual Meta error JSON lands at `$json.error` nested inside the error item.

**Verified from workflow inspection:** The sub-workflow already uses `onError: "continueErrorOutput"` on `📤 HTTP PUT — Upload to Azure Blob` (id: `http-put-blob`). This is the existing pattern to follow exactly.

**Error output item shape from Meta (HIGH confidence — verified via official docs):**
```json
{
  "error": {
    "message": "Invalid OAuth access token.",
    "type": "OAuthException",
    "code": 190,
    "error_subcode": 460,
    "error_user_title": "...",
    "error_user_msg": "...",
    "fbtrace_id": "EJplcsCHuLu"
  }
}
```
Access in Code node: `$json.error.code`, `$json.error.message`, `$json.error.fbtrace_id`, `$json.error.type`

**IMPORTANT — n8n error output item shape:** When an HTTP Request node fails with an HTTP error (4xx/5xx), the error output receives an item where `$json` IS the error object itself. However, the exact field path depends on whether n8n wraps the HTTP body or exposes it directly. Based on the pattern in `http-put-blob` and the node typeVersion 4.2, the Meta JSON body (including the `error` key) is available at `$json.error`. Verification via test execution recommended.

### Pattern 2: Shared Error Handler Subgraph
**What:** All Meta HTTP Request error outputs converge into a single "Parse Meta Error" Code node. This node extracts the structured error fields and adds a `platform` field indicating which node failed.

**Why single convergence point:** There are 10 Meta HTTP Request nodes across single-post and carousel paths. Wiring each to its own error handler would require 10 separate notification chains. A single Code node receiving all error outputs is simpler and more maintainable.

**Node to add:**
```javascript
// "🚨 Parse Meta Error" Code node
const err = $json.error || {};
const platform = $json._failed_node || 'unknown'; // set by caller via Set node prefix

return [{
  json: {
    error_code: err.code || 0,
    error_message: err.message || 'Unknown error',
    error_type: err.type || '',
    error_subcode: err.error_subcode || null,
    fbtrace_id: err.fbtrace_id || '',
    platform_failed: platform,
    is_token_expired: err.code === 190,
    approval_number: $('🔗 Merge Rehost Output').first().json.approval_number
      || $('🔧 Prep Re-host Input').first().json.approval_number
      || '',
    topic: $('🔗 Merge Rehost Output').first().json.topic || '',
  }
}];
```

**CAVEAT:** Cross-refs to `🔗 Merge Rehost Output` may not be available in all error paths (e.g., if the error fires before Merge Rehost Output ran). The Code node needs safe fallbacks. Consider passing `approval_number` and `topic` through a Set node before each Meta call so the error path always has them.

### Pattern 3: OAuthException Code 190 Detection
**What:** Meta returns `error.code === 190` for expired/revoked tokens with `error.type === "OAuthException"`. There is no reliable `error_subcode` distinction between "expired" and "revoked" in the public docs — both cases get the same human-readable alert.

**Exact alert text required (from requirements):**
> "Token Meta expirado — verificar que Susana sigue como admin de la página"

**IF node pattern (typeVersion 1, per project constraint):**
```json
{
  "conditions": {
    "string": [
      {
        "value1": "={{ String($json.error_code) }}",
        "value2": "190"
      }
    ]
  }
}
```

### Pattern 4: Hashtag Comment on IG Post
**What:** After `media_publish` succeeds (response: `{ id: "<media_id>" }`), call `POST /v22.0/<media_id>/comments` with the hashtag block as the `message` parameter.

**Verified endpoint (HIGH confidence — official IG API docs):**
```
POST https://graph.facebook.com/v22.0/<IG_MEDIA_ID>/comments
Body: { "message": "<hashtag text>", "access_token": "<META_PAGE_TOKEN>" }
Response: { "id": "<comment_id>" }
```

**Parameter name:** `message` (not `text`). Confirmed by official docs.

**Where to put hashtags:** The hashtag block currently lives inside `instagram_caption` (GPT-4o appends 8-12 hashtags there per system prompt). For Phase 9, the plan is:
- Keep the caption as-is in `instagram_caption` — GPT-4o already puts hashtags there
- The comment uses the SAME `instagram_caption` field as the `message` body, OR a separate hashtag-only extraction
- CLEANER approach: strip hashtags from caption, post clean caption to IG, post hashtags-only as first comment

**This is a scope decision for the planner to make.** Two options:
- Option A (simpler): Post full `instagram_caption` as comment without modifying caption. Caption stays as-is (with hashtags). Comment adds redundant hashtags. Does NOT satisfy "caption remains clean."
- Option B (correct per IGPUB-06): Modify the GPT-4o parser output or add a Code node that splits the `instagram_caption` into `caption_clean` (text only) and `hashtag_block` (only hashtag lines). Use `caption_clean` in `IG: Create Container` body, and `hashtag_block` as the comment `message`. This matches the requirement "caption remains clean."

**Option B is required by IGPUB-06.** The hashtag extraction logic should be a Code node placed after `🔧 Parsear contenido` (single-post) and after `🔧 Parsear prompts carrusel` (carousel). Extract hashtag lines (lines starting with `#`) into a separate field.

**HTTP Request node for comment (pattern from existing YCloud/Meta calls):**
```json
{
  "method": "POST",
  "url": "=https://graph.facebook.com/v22.0/{{ $json.media_id }}/comments",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({ message: $json.hashtag_block, access_token: $env.META_PAGE_TOKEN }) }}"
}
```
`media_id` comes from `IG: media_publish` response field `id`.

**Retry:** Safe to retry (idempotent in practice — worst case: duplicate comment, low risk). Set `retryOnFail=true, maxTries=2`.

### Pattern 5: Azure Blob Deletion After Publish
**What:** After successful publish OR confirmed failure, DELETE each blob by name.

**Verified endpoint (HIGH confidence — official Azure REST docs):**
```
DELETE https://<account>.blob.core.windows.net/<container>/<blob_name>?<SAS_PARAMS>
x-ms-version: 2020-10-02
x-ms-date: <RFC1123 UTC date>
Response: 202 Accepted (success), 404 Not Found (already deleted, treat as success)
```

**CRITICAL CONSTRAINT — Current SAS does NOT include delete permission:**
The existing SAS token has `sp=cw` (service + write, where `c` = create, `w` = write). The delete permission requires `sp=d` or `sp=cwd`. **A new SAS token must be generated with `sp=cwrd` or the existing SAS must be regenerated with `d` permission added.**

Azure SAS permission codes: `r`=read, `w`=write, `c`=create, `d`=delete. Current: `sp=cw sr=c se=2027-04-10`. Required for delete: `sp=cwrd sr=c se=2027-04-10` (or similar — adding `d`).

**HTTP Request node pattern:**
```json
{
  "method": "DELETE",
  "url": "=https://{{ $env.AZURE_STORAGE_ACCOUNT }}.blob.core.windows.net/{{ $env.AZURE_CONTAINER }}/{{ $json.blob_name }}?{{ $env.AZURE_SAS_PARAMS }}",
  "sendHeaders": true,
  "headerParameters": [
    { "name": "x-ms-version", "value": "2020-10-02" },
    { "name": "x-ms-date", "value": "={{ new Date().toUTCString() }}" }
  ]
}
```

**Blob names are stored in `blob_urls` array as `{ index, url }`.** The blob name must be extracted from the URL path (strip `https://<account>.blob.core.windows.net/<container>/`). A Code node does this extraction.

**What to delete:** All blobs in the `blob_urls` array for the post. On success path: delete after Sheets log (last step). On failure path: delete after Sheets fail-log.

**Soft-delete concern:** The storage account `propulsarcontent` may have soft-delete enabled. Check Azure portal. If enabled, deleted blobs are soft-deleted and not immediately removed but stop being publicly reachable. For the cost concern this is acceptable.

### Pattern 6: Failure Sheets Log (LOG-03)
**What:** A Google Sheets append node that writes `Publish_Status=failed` + error message. Uses the same credentials and schema as the existing `📊 Google Sheets Log` nodes.

**Required columns to populate:**
- `Fecha`, `Tema`, `Tipo`, `Angulo`, `Plataformas`, `Modelo_Imagen`, `Imagen_URL` — from session data
- `Estado`: "Fallido"
- `Publish_Status`: "failed"
- `Error_Msg`: `$json.error_message` (new column — needs to be added to the Sheets schema)

**IMPORTANT:** The existing schema does not have an `Error_Msg` column. Either add it to the Sheets template and to the node schema, or write error text into an existing unused column.

### Anti-Patterns to Avoid
- **onError: "stopWorkflow" on any Meta HTTP Request node**: Blocks ALL error recovery. Must change to `continueErrorOutput`.
- **Retrying media_publish on error output**: Never reconnect the error output of media_publish back to a retry — it is not idempotent.
- **Accessing approval_number via cross-ref in error paths**: The cross-ref node (`🔗 Merge Rehost Output`) may not have run if the error fires early in the chain. Pass `approval_number` forward explicitly through a Set node prefix before each risky Meta call.
- **SAS without delete permission for blob cleanup**: Current `sp=cw` SAS cannot DELETE. Must regenerate SAS.
- **Posting hashtags in caption AND as comment**: Creates duplicate hashtags. Must strip from caption before posting to IG.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Detecting token expiry | Custom JWT decode / token introspection | Check `error.code === 190` in error response | Meta always returns code 190 for expired/revoked tokens — no pre-flight check needed |
| Azure Blob deletion | Azure SDK / npm package | HTTP Request node with DELETE + SAS | Matches existing pattern; no extra deps; sandbox allows HTTP Request nodes |
| Hashtag extraction from caption | Complex regex library | Simple JS split/filter in Code node | Hashtags are always `#word` at start of line or after newline in GPT-4o output |
| Error notification routing | Complex Switch node | IF typeVersion 1 on error_code === "190" | Project constraint: IF v1 only (Switch v3 broken in n8n 2.14.2) |

---

## Common Pitfalls

### Pitfall 1: Error Output Item Shape Ambiguity
**What goes wrong:** The error output item from an HTTP Request node may wrap the HTTP response body in a different field than expected. If Meta returns `{ "error": { "code": 190 } }` in the body but n8n wraps it in `{ "error": { "message": "...", "cause": { "response": { "body": "..." } } } }`, the Code node extracting `$json.error.code` gets `undefined`.
**Why it happens:** n8n typeVersion 4.2 error output behavior changed between versions. The project is on n8n 2.14.2.
**How to avoid:** In the "Parse Meta Error" Code node, try multiple paths: `$json.error?.code || $json.cause?.response?.body && JSON.parse($json.cause.response.body)?.error?.code`. Add a `console.log(JSON.stringify($json))` line for the first test run to inspect the actual shape.
**Warning signs:** `error_code: 0` in test outputs — means extraction missed the correct path.

### Pitfall 2: Carousel Has Two media_publish Nodes
**What goes wrong:** Only wiring the single-post `🚀 IG: media_publish` error output while forgetting `🚀 IG: Carousel media_publish`. The carousel path has completely separate publish nodes.
**How to avoid:** Audit all Meta HTTP Request nodes in both single-post AND carousel paths. Full list below.

### Pitfall 3: approval_number Not Available in Error Path
**What goes wrong:** The error fires after `🔁 Re-host Images` but before `🔗 Merge Rehost Output`. The "Parse Meta Error" Code node tries to cross-ref `🔗 Merge Rehost Output` but gets a reference error because that node hasn't run.
**How to avoid:** Before each Meta HTTP Request node, insert a Set node that copies `approval_number` and `topic` into the current item. Then the error output item has those fields directly in `$json` without needing cross-refs to nodes that may not have run.

### Pitfall 4: Blob Deletion SAS Permission
**What goes wrong:** HTTP DELETE to Azure returns 403 Forbidden because `sp=cw` does not include delete (`d`) permission.
**How to avoid:** Regenerate SAS with `sp=cwrd`. Update `AZURE_SAS_PARAMS` env var in n8n Azure.
**Verification:** Test with a known blob name via curl before wiring into workflow.

### Pitfall 5: Hashtag Block Is Part of Caption String
**What goes wrong:** The GPT-4o output puts hashtags at the end of `instagram_caption` as part of the same string (not a separate field). Stripping them requires parsing the caption string in a Code node.
**How to avoid:** In the Code node, split caption on newlines, filter lines starting with `#`, rejoin the rest as clean caption, rejoin the `#` lines as hashtag_block.
**Edge case:** GPT-4o sometimes puts hashtags inline (e.g., `Great #AI tips`). Stripping only `#word` at start of line is safer than stripping all `#word` occurrences (which would corrupt inline hashtag use in body text). For this project, the GPT-4o system prompt explicitly says "hashtags at end of caption," so line-start filter is sufficient.

### Pitfall 6: Two Carousel Sheets Log Nodes Need Same Fail Row
**What goes wrong:** The workflow has two Sheets log nodes (`📊 Google Sheets Log` for single-post, `📊 Google Sheets Log (Carousel)` for carousel). A single "fail log" node can serve both paths if they converge before it, but the error paths are structurally separate.
**How to avoid:** Add one fail-log Sheets node per path (single-post fail log + carousel fail log), or make the error subgraph determine format and use a single node. Simpler: two parallel fail-log nodes sharing the same Sheets credentials and schema.

---

## Code Examples

### Extract Hashtags from Caption (Code node)
```javascript
// Source: project pattern + JS standard library
// Place after 🔧 Parsear contenido (single-post) and 🔧 Parsear prompts carrusel (carousel)
const data = $input.first().json;
const igCaption = data.instagram?.caption || data.instagram_caption || '';

const lines = igCaption.split('\n');
const hashtagLines = lines.filter(l => l.trim().startsWith('#'));
const cleanLines = lines.filter(l => !l.trim().startsWith('#'));

// Remove trailing empty lines from clean caption
const cleanCaption = cleanLines.join('\n').trimEnd();
const hashtagBlock = hashtagLines.join(' ').trim(); // space-separated for comment

return [{
  json: {
    ...data,
    instagram: {
      ...(data.instagram || {}),
      caption: cleanCaption,
      caption_original: igCaption,
    },
    instagram_caption: cleanCaption,
    hashtag_block: hashtagBlock,
  }
}];
```

### Post Hashtag Comment (HTTP Request node)
```json
{
  "method": "POST",
  "url": "=https://graph.facebook.com/v22.0/{{ $('🚀 IG: media_publish').item.json.id }}/comments",
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={{ JSON.stringify({ message: $('🔗 Merge Rehost Output').item.json.hashtag_block || '', access_token: $env.META_PAGE_TOKEN }) }}",
  "typeVersion": 4.2,
  "retryOnFail": true,
  "maxTries": 2,
  "waitBetweenTries": 2000,
  "onError": "continueErrorOutput"
}
```
Note: `hashtag_block` must be threaded through `🔗 Merge Rehost Output` (add as a new assignment). If `hashtag_block` is empty, skip the comment node via an IF check.

### Parse Meta Error JSON (Code node)
```javascript
// "🚨 Parse Meta Error" — receives error output item from any Meta HTTP Request node
// n8n HTTP Request error output in typeVersion 4.2: error body at $json.error
// Fallback paths handle different n8n versions / error wrapping styles
const raw = $json;
let err = {};
try {
  err = raw.error || {};
  // Some n8n versions wrap HTTP body in cause.response.body (string)
  if (!err.code && raw.cause?.response?.body) {
    const parsed = JSON.parse(raw.cause.response.body);
    err = parsed.error || err;
  }
} catch(e) {}

// Platform context injected by upstream Set node (before each Meta call)
const platform = raw._platform || 'unknown';

return [{
  json: {
    error_code: err.code || 0,
    error_message: err.message || 'Error desconocido de Meta API',
    error_type: err.type || '',
    error_subcode: err.error_subcode || null,
    fbtrace_id: err.fbtrace_id || '',
    platform_failed: platform,
    is_token_expired: err.type === 'OAuthException' && err.code === 190,
    approval_number: raw.approval_number || '',
    topic: raw.topic || '',
    blob_names: raw.blob_names || [],
  }
}];
```

### WhatsApp Error Alert Messages
```javascript
// Token expired alert (NOTIF-03)
const tokenExpiredMsg = `⚠️ *Token Meta expirado* — verificar que Susana sigue como admin de la página`;

// Generic failure alert (NOTIF-02)
const genericFailMsg =
  `❌ *Error publicando en ${platform_failed}*\n\n` +
  `Código: ${error_code}\n` +
  `Mensaje: ${error_message}\n` +
  `Trace ID: ${fbtrace_id}\n` +
  `Plataforma: ${platform_failed}`;
```

### Azure Blob DELETE (HTTP Request node)
```json
{
  "method": "DELETE",
  "url": "=https://{{ $env.AZURE_STORAGE_ACCOUNT }}.blob.core.windows.net/{{ $env.AZURE_CONTAINER }}/{{ $json.current_blob_name }}?{{ $env.AZURE_SAS_PARAMS }}",
  "sendHeaders": true,
  "headerParameters": [
    { "name": "x-ms-version", "value": "2020-10-02" },
    { "name": "x-ms-date", "value": "={{ new Date().toUTCString() }}" }
  ],
  "typeVersion": 4.2,
  "retryOnFail": false,
  "onError": "continueErrorOutput"
}
```
404 on DELETE = blob already gone, treat as success (no special handling needed).

### Extract Blob Name from URL (Code node)
```javascript
// Extracts YYYY/MM/DD/<uuid>.<ext> from full Azure blob URL
// blob_urls is [{ index, url }, ...]
const data = $input.first().json;
const blobUrls = data.blob_urls || [];
const account = 'propulsarcontent'; // or derive from url
const container = 'posts';
const prefix = `https://${account}.blob.core.windows.net/${container}/`;

return blobUrls.map(entry => ({
  json: {
    current_blob_name: entry.url.replace(prefix, '').split('?')[0],
    blob_url: entry.url,
    approval_number: data.approval_number,
    topic: data.topic,
    // pass error context through on failure path
    error_code: data.error_code || null,
    error_message: data.error_message || null,
  }
}));
```

---

## Inventory: Meta HTTP Request Nodes to Modify (onError: "continueErrorOutput")

All of these currently have `onError: "stopWorkflow"` and need to be changed:

| Node ID | Node Name | Path | Idempotent? | Current onError |
|---------|-----------|------|------------|----------------|
| `ig-create-container` | 📤 IG: Create Container | Single-post | YES | stopWorkflow |
| `ig-media-publish` | 🚀 IG: media_publish | Single-post | NO | stopWorkflow |
| `ig-get-permalink` | 🔗 IG: Get Permalink | Single-post | YES | stopWorkflow |
| `fb-publish-photo` | 🌐 FB: Publish Photo | Single-post | NO | stopWorkflow |
| `ig-create-child-container` | 🖼️ IG: Create Child Container | Carousel | YES | stopWorkflow |
| `ig-create-parent-container` | 🎠 IG: Create Parent Container | Carousel | YES | stopWorkflow |
| `ig-carousel-media-publish` | 🚀 IG: Carousel media_publish | Carousel | NO | stopWorkflow |
| `ig-get-carousel-permalink` | 🔗 IG: Get Carousel Permalink | Carousel | YES | stopWorkflow |
| `fb-upload-photo-unpublished` | 📤 FB: Upload Photo Unpublished | Carousel | NO | stopWorkflow |
| `fb-publish-carousel-feed` | 🌐 FB: Publish Carousel Feed | Carousel | NO | stopWorkflow |

Additionally, `notify-wa-success` and `notify-wa-carousel` currently use `onError: "stopWorkflow"` — these can remain as-is since they are not Meta API calls (they are YCloud calls after successful publish). But changing them to `continueErrorOutput` (and silently dropping the error) would make the Sheets log still run even if WA notification fails.

---

## Open Questions

1. **Does AZURE_SAS_PARAMS need regeneration with `d` permission?**
   - What we know: Current SAS is `sp=cw sr=c se=2027-04-10` — no delete permission
   - What's unclear: Whether regenerating SAS before expiry 2027-04-10 requires special steps or just a new `az storage account generate-sas` call
   - Recommendation: Plan must include a task to regenerate SAS with `sp=cwrd` and update the env var in n8n Azure Container App settings

2. **Exact n8n error output item shape for HTTP 4xx/5xx responses**
   - What we know: `onError: "continueErrorOutput"` is used in `http-put-blob` (sub-workflow). The "Parse Meta Error" Code node needs to be tested against a real 190 error to confirm field path.
   - What's unclear: Whether `$json.error.code` or `$json.cause.response.body` is the correct path in n8n 2.14.2 with typeVersion 4.2
   - Recommendation: First Plan should include a Test task that deliberately sends an invalid token to one Meta endpoint and inspects the error output item in n8n execution log before wiring up the full error handler.

3. **Should the `Error_Msg` column be added to the Google Sheets?**
   - What we know: Existing schema has 12 columns. Adding `Error_Msg` requires updating BOTH the Sheets document (add column) AND the node schema array in workflow.json.
   - Recommendation: Yes, add it. The audit trail requirement (LOG-03) explicitly needs the error message logged. Plan should include a task to add column to the Sheets document.

4. **Hashtag block: same for both single-post AND carousel?**
   - What we know: Single-post `instagram_caption` is generated by GPT-4o with hashtags. Carousel `instagram_caption` is generated by GPT-4o carousel prompt, also with hashtags.
   - What's unclear: The carousel caption path uses `🔧 Parsear prompts carrusel` which maps `parsed.instagram_caption`. The hashtag extraction Code node needs to be placed after BOTH parse nodes.
   - Recommendation: Two separate hashtag extraction nodes — one on single-post path (after `🔧 Parsear contenido`), one on carousel path (after `🔧 Parsear prompts carrusel`). Both produce `hashtag_block` field in same format.

5. **Platform context in error output items**
   - What we know: The error item from an HTTP Request node does NOT include which node fired the error (just the HTTP error details).
   - Recommendation: Before each Meta HTTP Request node, add a Set node injecting `_platform: "IG"` or `_platform: "FB"` and `_node_name: "..."` into the item. The error output inherits `$json` from the incoming item, making `_platform` available to the error handler.

---

## Sources

### Primary (HIGH confidence)
- Direct inspection of `n8n/workflow.json` (60 nodes, 2026-04-17) — node IDs, onError settings, typeVersions, existing error output pattern in sub-workflow
- Meta Graph API error handling docs — https://developers.facebook.com/docs/graph-api/guides/error-handling/ — error object structure, code 190
- IG Media Comments endpoint — https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-media/comments — POST endpoint, `message` parameter, response format
- Meta Graph API comments — https://developers.facebook.com/docs/graph-api/reference/v22.0/object/comments — `message` field confirmed, `pages_manage_engagement` permission
- Azure Blob Storage DELETE REST API — https://learn.microsoft.com/en-us/rest/api/storageservices/delete-blob — endpoint pattern, headers, SAS permissions, 202 success

### Secondary (MEDIUM confidence)
- `n8n/subworkflow-rehost-images.json` — `http-put-blob` node with `onError: "continueErrorOutput"` as existing pattern reference
- STATE.md accumulated decisions — n8n 2.14.2 constraints (IF v1, Code sandbox, env access)

---

## Metadata

**Confidence breakdown:**
- Meta error JSON structure: HIGH — verified via official docs
- IG comments endpoint + `message` param: HIGH — verified via two official doc pages
- Azure Blob DELETE pattern: HIGH — verified via official REST docs
- SAS delete permission gap: HIGH — verified by reading current SAS `sp=cw` against docs
- n8n error output item field path: MEDIUM — pattern confirmed from sub-workflow, exact field path for Meta 4xx responses needs one test run to confirm
- Hashtag extraction approach: HIGH — based on known GPT-4o output format per workflow system prompt

**Research date:** 2026-04-17
**Valid until:** 2026-07-17 (Meta API stable; Azure REST stable; n8n pinned to 2.14.2)
