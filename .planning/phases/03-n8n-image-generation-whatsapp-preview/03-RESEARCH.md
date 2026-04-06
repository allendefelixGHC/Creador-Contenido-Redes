# Phase 3: n8n Image Generation + WhatsApp Preview — Research

**Researched:** 2026-04-06
**Domain:** n8n loop patterns, Ideogram v3 API (v3 endpoint), YCloud WhatsApp image messages
**Confidence:** HIGH (APIs verified via official docs; loop patterns verified via n8n docs + community)

---

## Summary

Phase 3 connects the carousel image prompts produced by Phase 2 to actual image generation and WhatsApp delivery. The core challenge is that n8n is a node-based system without native for-loops: to call Ideogram once per slide, a `Loop Over Items (Split in Batches)` node with batch size 1 is required. This node splits the `image_prompts` array (one item per slide) and feeds each item individually to an HTTP Request node targeting Ideogram. After all slides are generated, a Code node on the "Done" branch collects all URLs. WhatsApp delivery then iterates the URL array and sends each image as a separate message via YCloud's `sendDirectly` endpoint.

**Critical discovery:** The existing `🔤 Ideogram v3` node in the workflow uses the **v2 endpoint** (`api.ideogram.ai/generate` with `model: "V_2"`). The true Ideogram v3 endpoint is `api.ideogram.ai/v1/ideogram-v3/generate` and uses `multipart/form-data` content-type with a different parameter set. Phase 3 must decide whether to keep using the v2 endpoint (simpler JSON, already working) or upgrade to v3. Given that v2 is already confirmed working in Phase 2's single-post path and carousels only use Ideogram, keeping v2 is lower risk unless v3 offers something critical for this phase.

**Primary recommendation:** Use `SplitInBatches` (batch size 1) → HTTP Request (Ideogram) → Code node (collect URLs) → second `SplitInBatches` → HTTP Request (YCloud image) for the carousel image generation and preview loop. Then merge all session data before the existing approval gate.

---

## Standard Stack

### Core (no new npm packages — all via n8n nodes)

| Component | Type | Purpose | Notes |
|-----------|------|---------|-------|
| `n8n-nodes-base.splitInBatches` | n8n node | Loop over `image_prompts` array one slide at a time | typeVersion 3, batchSize: 1 |
| `n8n-nodes-base.httpRequest` | n8n node | Call Ideogram API per slide | Already exists; typeVersion 4.2 |
| `n8n-nodes-base.code` | n8n node | Collect all image URLs after loop finishes | `runOnceForAllItems` mode |
| `n8n-nodes-base.httpRequest` | n8n node | Send each image to WhatsApp via YCloud | Second instance in send loop |

### No New External Dependencies

This phase adds zero new npm packages. All execution happens through n8n's built-in nodes calling external APIs via HTTP.

---

## Architecture Patterns

### Recommended n8n Workflow Structure

```
[🔧 Parsear prompts carrusel]
        │
        ▼
[🔄 Split Slides (SplitInBatches, batchSize=1)]
        │ output 0 (loop — one slide at a time)
        ▼
[🔤 Ideogram v2 per Slide (HTTP Request)]
        │
        ▼
[🔁 back to Split Slides] ← loop connection
        │ output 1 (done — all slides processed)
        ▼
[🗂️ Collect Image URLs (Code node)]
        │
        ▼
[🔄 Split Send WA (SplitInBatches, batchSize=1)]
        │ output 0 (loop — one image at a time)
        ▼
[📤 Enviar imagen WA (HTTP Request → YCloud sendDirectly)]
        │
        ▼
[🔁 back to Split Send WA] ← loop connection
        │ output 1 (done — all images sent)
        ▼
[📱 Preparar mensaje WA (texto resumen + aprobación)]
        │
        ▼
[existing approval gate: send-whatsapp → webhook-reply → check-approval]
```

### Pattern 1: SplitInBatches for Sequential Ideogram Calls

**What:** SplitInBatches with `batchSize: 1` turns the `image_prompts` array into one item per execution cycle. Each cycle calls Ideogram once, returns the URL, and feeds back into the loop node. The loop node's output 1 (Done) fires only after all items are exhausted.

**Connection trick:** The HTTP Request output must connect BACK to the SplitInBatches input (the loop connection). This is what makes it actually loop — without this back-edge, it only processes the first item.

**n8n JSON node structure:**
```json
{
  "id": "split-slides",
  "name": "🔄 Split Slides",
  "type": "n8n-nodes-base.splitInBatches",
  "typeVersion": 3,
  "parameters": {
    "batchSize": 1,
    "options": {}
  },
  "position": [1080, 520]
}
```

**Connection pattern in workflow JSON:**
```json
"🔄 Split Slides": {
  "main": [
    [{ "node": "🔤 Ideogram — Slide", "type": "main", "index": 0 }],
    [{ "node": "🗂️ Collect Image URLs", "type": "main", "index": 0 }]
  ]
},
"🔤 Ideogram — Slide": {
  "main": [[{ "node": "🔄 Split Slides", "type": "main", "index": 0 }]]
}
```

Output 0 = loop body (goes to Ideogram). Output 1 = done (goes to Collect URLs). The HTTP Request loops back to input of SplitInBatches.

### Pattern 2: Ideogram HTTP Request per Slide

**What:** One HTTP Request node configured with the per-slide prompt extracted from the current item in the loop.

**Key expressions inside the loop:**
- `$json.prompt` — the current slide's image prompt (since SplitInBatches outputs one item at a time, each item IS one slide object)
- The carousel metadata (topic, num_images, etc.) is accessible via `$('🔧 Parsear prompts carrusel').first().json`

**Using v2 endpoint (recommended — already confirmed working):**
```json
{
  "method": "POST",
  "url": "https://api.ideogram.ai/generate",
  "headerParameters": {
    "parameters": [
      { "name": "Api-Key", "value": "={{ $env.IDEOGRAM_API_KEY }}" },
      { "name": "Content-Type", "value": "application/json" }
    ]
  },
  "jsonBody": "={\n  \"image_request\": {\n    \"prompt\": \"{{ $json.prompt }}\",\n    \"aspect_ratio\": \"ASPECT_1_1\",\n    \"model\": \"V_2\",\n    \"magic_prompt_option\": \"AUTO\",\n    \"style_type\": \"DESIGN\"\n  }\n}"
}
```

**Response URL extraction:** `$json.data[0].url` — same as existing single-post Ideogram node.

**If upgrading to v3 endpoint (optional — higher risk):**
- Endpoint: `POST https://api.ideogram.ai/v1/ideogram-v3/generate`
- Content-Type: `multipart/form-data` (n8n HTTP Request node supports this via `specifyBody: "form"`)
- Different parameters: `rendering_speed`, no `model` param, `magic_prompt` instead of `magic_prompt_option`
- Response format is identical: `data[0].url`

**Decision:** Keep v2 endpoint for Phase 3. It is confirmed working, already in the workflow, and carousel slides are functionally identical to single-post slides for Ideogram.

### Pattern 3: Collecting URLs After the Loop

**What:** A Code node on SplitInBatches output 1 (Done). When all iterations finish, this output receives ALL items that passed through the loop (n8n accumulates them). A Code node in `runOnceForAllItems` mode can map them into an array.

**Code node — Collect Image URLs:**
```javascript
// $input.all() contains one item per slide (each from Ideogram response)
// Each item has $json.data[0].url from the Ideogram response
// We also need the carousel metadata from the parser node

const carousel = $('🔧 Parsear prompts carrusel').first().json;
const imageItems = $input.all();

const imageUrls = imageItems.map(item => {
  return item.json.data?.[0]?.url || null;
}).filter(url => url !== null);

if (imageUrls.length !== carousel.num_images) {
  console.warn(`⚠ Se generaron ${imageUrls.length} imágenes, se esperaban ${carousel.num_images}`);
}

return [{
  json: {
    ...carousel,
    image_urls: imageUrls,           // array of N image URLs
    final_image_url: imageUrls[0],   // first slide for backwards compat
  }
}];
```

**Note:** n8n does NOT automatically pass context from pre-loop nodes into the Done branch. You MUST use `$('node-name').first().json` to access upstream data. The `$input.all()` on the Done branch DOES contain accumulated loop results.

### Pattern 4: Sending N WhatsApp Image Messages

**What:** A second SplitInBatches loop iterates over `image_urls` array. Before that, a Code node must split the array into individual items (one URL per item) because the collected result is a single item with an array field.

**Split URLs Code node (before second loop):**
```javascript
const data = $input.first().json;
const urls = data.image_urls;

return urls.map((url, idx) => ({
  json: {
    ...data,
    current_image_url: url,
    slide_index: idx + 1,
  }
}));
```

**YCloud image message — HTTP Request body:**
```json
{
  "from": "{{ $env.YCLOUD_WHATSAPP_NUMBER }}",
  "to": "{{ $json.approval_number }}",
  "type": "image",
  "image": {
    "link": "{{ $json.current_image_url }}",
    "caption": "Slide {{ $json.slide_index }} de {{ $json.num_images }}"
  }
}
```

**Endpoint:** `POST https://api.ycloud.com/v2/whatsapp/messages/sendDirectly`
**Header:** `X-API-Key: {{ $env.YCLOUD_API_KEY }}` (same key as existing `📤 Enviar WhatsApp` node)

### Pattern 5: Keeping the Approval Gate Intact

**What:** After all images are sent, the text summary message goes through the existing `📱 Preparar mensaje WA` node and `📤 Enviar WhatsApp` node unchanged. The approval webhook (`📨 Webhook — Reply WA`) and `✅ ¿Aprobado?` are not modified.

**Session storage issue:** The existing `🔍 Recuperar sesión Supabase` node tries to retrieve session data from Supabase after the user responds SI. For carousels, the session data must include `image_urls` (array) not just `final_image_url`. This means the Code node that stores session to Supabase (if implemented) needs to handle the array. If Supabase is in "testing mode" (skipped), this is not a blocker for Phase 3.

**Confirmed:** YCloud sends images one at a time. The user will receive N image messages followed by one text summary. All arrive via same WhatsApp thread. This is expected behavior.

### Anti-Patterns to Avoid

- **Parallel Ideogram calls via runOnceForEachItem:** Do NOT use Code node mode `runOnceForEachItem` to output multiple items and pipe them all into one HTTP Request node. n8n executes HTTP Request for each input item, but may parallelize them — violating the sequential requirement and risking Ideogram rate limits.
- **Generating all images in a single Code node with `require('https')`:** n8n 2.14.2 does NOT support `require()` in Code nodes. All HTTP calls must go through HTTP Request nodes.
- **Using `$node` context for loop-accumulated data:** Inside the loop, `$input` gives only the CURRENT item. For pre-loop data, always use `$('node-name').first().json`.
- **Connecting Done output of first loop directly to send-whatsapp:** The Done branch output contains one item per slide with the Ideogram response format. You must normalize/collect first before iterating for WhatsApp sending.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Sequential HTTP loop | Custom polling Code node with setTimeout | `SplitInBatches` node (batchSize=1) | n8n handles state, retry, and error boundaries per iteration |
| HTTP calls from Code node | `require('https')` or `fetch()` in Code | HTTP Request node | n8n 2.14.2 bans `require()` in Code nodes |
| URL array iteration | Complex recursive Code logic | Second SplitInBatches loop | Same proven pattern, clean visual flow |
| Ideogram v3 migration | Rewrite all existing Ideogram calls | Keep v2 endpoint | Already working, v3 adds no value for carousel text-overlay use case |

---

## Common Pitfalls

### Pitfall 1: Loop Back-Edge Missing
**What goes wrong:** SplitInBatches only processes the first slide — then stops. The workflow appears to complete successfully but only one image is generated.
**Why it happens:** The connection from HTTP Request back to SplitInBatches input is missing. Without this "loop back" connection, n8n has no way to know to re-enter the loop.
**How to avoid:** In workflow JSON, ensure the Ideogram HTTP Request node has a connection back to the SplitInBatches node (input index 0). This is the defining characteristic of a loop in n8n.
**Warning signs:** Only one image URL in collected results regardless of num_images.

### Pitfall 2: Ideogram URL Expiry
**What goes wrong:** Images are generated but become inaccessible by the time the user approves and the workflow tries to publish.
**Why it happens:** Ideogram explicitly states "Images links are available for a limited period of time." The exact TTL is not documented (typically 1-24 hours based on community reports).
**How to avoid:** For Phase 3, this is acceptable — the preview flow is fast enough. Flag for Phase 4 (publishing): download and re-host images before publishing to Instagram.
**Warning signs:** 403 errors when Meta Graph API tries to fetch the image URL.

### Pitfall 3: SplitInBatches Input Must Be Array of Items, Not Single Item with Array Field
**What goes wrong:** The Code node outputs one item with `image_prompts: [...]` array. SplitInBatches treats it as a single item and loops only once.
**Why it happens:** SplitInBatches splits n8n ITEMS (rows), not JavaScript arrays within items. The array must be "exploded" into individual n8n items first.
**How to avoid:** Before the first SplitInBatches, add a Code node (or use n8n's built-in `Split Out` node) that maps `image_prompts` array into individual items — one item per slide prompt object.
**Warning signs:** Loop runs exactly once regardless of array length.

### Pitfall 4: Referencing Upstream Data Inside the Loop
**What goes wrong:** Inside the loop, expressions like `$json.approval_number` are undefined because `$json` refers to the current loop item (slide prompt object), not the carousel metadata.
**Why it happens:** In n8n, `$json` inside a node always refers to the direct input of that node. Inside a loop, that's the current batch item.
**How to avoid:** Reference carousel metadata with `$('🔧 Parsear prompts carrusel').first().json.approval_number`. Include any fields needed inside the loop in the per-slide items output by the Code node that explodes the array.
**Warning signs:** `Cannot read property 'approval_number' of undefined` errors.

### Pitfall 5: YCloud Image Link vs Ideogram URL Stability
**What goes wrong:** YCloud rejects the Ideogram URL with an error about invalid media.
**Why it happens:** Ideogram URLs may require specific headers or may expire before YCloud can fetch them. YCloud fetches the image from the URL server-side.
**How to avoid:** Test immediately after generation. If URLs expire in testing, consider passing the slide caption as the WhatsApp `caption` field to identify which slide is which.
**Warning signs:** YCloud returns error on message send despite URL appearing valid in browser.

---

## Code Examples

### Explode image_prompts Array into n8n Items (Code node before first loop)
```javascript
// Source: n8n Code node pattern — runOnceForAllItems
// Input: single item from 🔧 Parsear prompts carrusel
const data = $input.first().json;
const prompts = data.image_prompts; // array of { slide_num, texto_overlay, prompt }

return prompts.map(slide => ({
  json: {
    // Pass ALL fields needed inside the loop as part of each item
    slide_num:       slide.slide_num,
    texto_overlay:   slide.texto_overlay,
    prompt:          slide.prompt,
    // Carousel metadata needed inside loop
    approval_number: data.approval_number,
    num_images:      data.num_images,
    topic:           data.topic,
    type:            data.type,
  }
}));
```

### Ideogram HTTP Request — per Slide (v2 endpoint, JSON body)
```json
{
  "method": "POST",
  "url": "https://api.ideogram.ai/generate",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      { "name": "Api-Key",      "value": "={{ $env.IDEOGRAM_API_KEY }}" },
      { "name": "Content-Type", "value": "application/json" }
    ]
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={\n  \"image_request\": {\n    \"prompt\": \"{{ $json.prompt }}\",\n    \"aspect_ratio\": \"ASPECT_1_1\",\n    \"model\": \"V_2\",\n    \"magic_prompt_option\": \"AUTO\",\n    \"style_type\": \"DESIGN\"\n  }\n}"
}
```

### Collect Image URLs (Code node — Done branch of first SplitInBatches)
```javascript
// Source: n8n Code node — runOnceForAllItems
// $input.all() = all items that passed through the loop (one per slide)
const carousel = $('🔧 Parsear prompts carrusel').first().json;
const loopItems = $input.all();

const imageUrls = loopItems.map(item => {
  // Ideogram v2 response: { data: [{ url, prompt, seed }] }
  return item.json.data?.[0]?.url || null;
}).filter(Boolean);

return [{
  json: {
    // Spread full carousel data
    instagram:       carousel.instagram,
    facebook:        carousel.facebook,
    topic:           carousel.topic,
    type:            carousel.type,
    angle:           carousel.angle,
    platforms:       carousel.platforms,
    image_model:     'ideogram',
    approval_number: carousel.approval_number,
    timestamp:       carousel.timestamp,
    format:          'carousel',
    num_images:      carousel.num_images,
    // New fields
    image_urls:      imageUrls,
    final_image_url: imageUrls[0] || null,
  }
}];
```

### Split URLs for Second Loop (Code node before second SplitInBatches)
```javascript
// Source: n8n Code node — runOnceForAllItems
const data = $input.first().json;

return data.image_urls.map((url, idx) => ({
  json: {
    current_image_url: url,
    slide_index:       idx + 1,
    num_images:        data.num_images,
    approval_number:   data.approval_number,
    // Keep full data for final message prep (only first iteration needs it,
    // but we include it in all for simplicity)
    _carousel_data: data,
  }
}));
```

### YCloud Send Image — HTTP Request
```json
{
  "method": "POST",
  "url": "https://api.ycloud.com/v2/whatsapp/messages/sendDirectly",
  "sendHeaders": true,
  "headerParameters": {
    "parameters": [
      { "name": "X-API-Key",    "value": "={{ $env.YCLOUD_API_KEY }}" },
      { "name": "Content-Type", "value": "application/json" }
    ]
  },
  "sendBody": true,
  "specifyBody": "json",
  "jsonBody": "={\n  \"from\": \"{{ $env.YCLOUD_WHATSAPP_NUMBER }}\",\n  \"to\":   \"{{ $json.approval_number }}\",\n  \"type\": \"image\",\n  \"image\": {\n    \"link\": \"{{ $json.current_image_url }}\",\n    \"caption\": \"Slide {{ $json.slide_index }} de {{ $json.num_images }}\"\n  }\n}"
}
```

### Prepare Final WhatsApp Approval Message (modified for carousel)

The existing `📱 Preparar mensaje WA` node must be updated to:
1. Reference `carousel.image_urls.length` instead of checking `final_image_url`
2. Show "N imágenes generadas" rather than "1 imagen generada"
3. Keep the SI/NO prompt unchanged

The node reads carousel data from the second SplitInBatches Done branch. The item at Done branch is the last item in the URL array. Use `$('Collect Image URLs node name').first().json` to get full carousel data.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| Ideogram v2 (`/generate`) | Ideogram v3 (`/v1/ideogram-v3/generate`) | v3 adds multipart/form-data, rendering_speed, character references — no benefit for carousel text-overlay |
| Parallel HTTP calls (n8n default for multiple items) | SplitInBatches batchSize=1 (sequential) | Required for Ideogram rate limits and correct slide ordering |
| Single image URL stored | Array of image URLs | New data model for carousel |

**Not deprecated:**
- YCloud `/v2/whatsapp/messages` and `/v2/whatsapp/messages/sendDirectly` — both current. Use `sendDirectly` for synchronous confirmation.
- Ideogram v2 endpoint — still fully operational, not deprecated as of 2026-04.

---

## Open Questions

1. **Does n8n's Done branch of SplitInBatches accumulate ALL items from the loop?**
   - What we know: Community posts confirm that the Done output contains the items that passed through the loop. Multiple community posts show `$input.all()` on Done branch returns all accumulated items.
   - What's unclear: Whether this is guaranteed in n8n 2.14.2 specifically, or whether the typeVersion of SplitInBatches affects this behavior.
   - Recommendation: Test in n8n with a minimal 2-item loop before building the full carousel flow. Verify `$input.all()` length equals `num_images`.

2. **Ideogram URL expiry for WhatsApp preview**
   - What we know: Ideogram docs say URLs are "available for a limited period." Typical is 1-24h.
   - What's unclear: Whether the preview-to-approval window (minutes) will always be within the valid period.
   - Recommendation: Treat as acceptable risk for Phase 3. Add note to Phase 3 verification checklist. Flag for future phase if users report broken images.

3. **YCloud image size limit vs Ideogram output**
   - What we know: YCloud accepts images up to 5MB. Ideogram v2 DESIGN style generates 1024x1024 PNG.
   - What's unclear: Exact file size of Ideogram output. PNG at 1024x1024 can be 2-4MB typical.
   - Recommendation: Test and log. If size is an issue, use `rendering_speed: "FLASH"` or reduce quality in v3. v2 doesn't expose this control.

4. **Session data for Supabase with carousel**
   - What we know: Current `🔍 Recuperar sesión Supabase` code retrieves a session by `approval_number`. For carousels, the session must contain `image_urls` array.
   - What's unclear: Whether Supabase session storage is even active (code has a "testing mode" bypass).
   - Recommendation: Phase 3 plan should note this dependency. If Supabase is active, the session write must include `image_urls`. If in testing mode, skip. Treat as a deferred concern unless publishing (Phase 4) requires it.

---

## Sources

### Primary (HIGH confidence)
- `https://developer.ideogram.ai/api-reference/api-reference/generate-v3` — v3 endpoint, content-type, parameters, response format
- `https://developer.ideogram.ai/ideogram-api/api-overview` — endpoint URL confirmation
- `https://docs.ycloud.com/reference/whatsapp-messaging-examples` — YCloud image message format, sendDirectly endpoint
- `https://docs.ycloud.com/reference/whatsapp-message-sending-guide` — YCloud endpoint options, media constraints

### Secondary (MEDIUM confidence)
- `https://docs.n8n.io/flow-logic/looping/` — loop patterns confirmed via WebFetch (partial content)
- `https://community.n8n.io/t/how-to-merge-output-of-multiple-split-in-batches-runs/19138` — Done branch accumulation pattern
- `https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.splitinbatches/` — SplitInBatches node reference
- Project CLAUDE.md + workflow.json — confirmed n8n 2.14.2 constraints, existing node patterns

### Tertiary (LOW confidence)
- Latenode blog on n8n loop performance — general observations, not n8n official
- Multiple community posts on merging SplitInBatches results — consistent pattern observed

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new packages, all n8n built-in nodes
- Architecture: HIGH — SplitInBatches loop pattern is the standard n8n approach; verified via docs and community
- Ideogram API (v2): HIGH — already working in production in Phase 2
- Ideogram API (v3 endpoint): MEDIUM — documented officially but not yet tested in this project
- YCloud image send: HIGH — official docs confirm `sendDirectly` with `type: "image"` and `image.link`
- Pitfalls: HIGH — loop back-edge, require() ban, and item vs array distinction are well-documented

**Research date:** 2026-04-06
**Valid until:** 2026-07-06 (stable APIs; n8n loop pattern won't change between minor versions)
