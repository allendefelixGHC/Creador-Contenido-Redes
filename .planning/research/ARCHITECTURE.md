# Architecture Research

**Domain:** n8n social-media publishing pipeline (v1.1 automatic publishing)
**Researched:** 2026-04-10
**Confidence:** HIGH — based on direct inspection of workflow.json + verified Meta Graph API docs + n8n official docs

---

## System Overview

### Current State (v1.0 — end of post-approval flow)

```
[Webhook Trigger] ──► [🔀 ¿Carrusel?]
                           │ TRUE (carousel)          │ FALSE (single)
                           ▼                          ▼
               [GPT-4o Carrusel]           [GPT-4o Texto]
                           │                          │
               [Parse + Explode Slides]    [Parse contenido]
                           │                          │
               [Ideogram — Slide × N]      [¿Imagen propia?]
                           │                   │ NO
               [Collect Image URLs]        [¿Ideogram?/¿Nano?/Flux]
                           │                          │
               [Split URLs WA]         [Normalizar URL imagen]
                           │                          │
               [Enviar imagen WA × N]  [Enviar preview imagen]
                           │                          │
                           └──────────┬───────────────┘
                                      ▼
                           [Preparar mensaje WA]
                                      │
                           [Enviar WhatsApp (text)]
                                      │
                           [Webhook — Reply WA]
                                      │
                           [¿Aprobado? (IF v1)]
                              │ TRUE         │ FALSE
                              ▼             ▼
                [Recuperar sesión Supabase]  [Loguear rechazo]
                              │
                [📊 Google Sheets Log]   ◄─── PIPELINE ENDS HERE IN v1.0
```

Key node IDs for attachment points:
- `"id": "retrieve-session"` — last node on the approved branch before Sheets
- `"id": "log-sheets"` — current terminal node (approved path), outputs: `{ topic, type, platforms, image_model, final_image_url, ... }`
- `"id": "log-rejected"` — terminal node (rejected path)

---

## v1.1 Extension: Where New Nodes Attach

### Single Point of Connection

The ENTIRE publishing sub-flow attaches at ONE point: between `🔍 Recuperar sesión Supabase` (id: `retrieve-session`) and `📊 Google Sheets Log` (id: `log-sheets`).

Current connection to break:
```json
"🔍 Recuperar sesión Supabase" → "📊 Google Sheets Log"
```

Replace with:
```
"🔍 Recuperar sesión Supabase"
         │
         ▼
[🕐 ¿Programado?]  (IF v1 — string compare publish_at vs "now")
    │ TRUE                    │ FALSE
    ▼                         ▼
[⏳ Wait Until]         [proceed directly]
    │                         │
    └─────────┬───────────────┘
              ▼
   [🔀 ¿Carrusel o Single?]  (IF v1)
       │ TRUE                   │ FALSE
       ▼                        ▼
   [Carousel publish path]   [Single publish path]
       │                        │
       └────────┬───────────────┘
                ▼
   [✅ WA success notify]
                │
   [📊 Google Sheets Log]  (updated — adds IG URL, FB URL, publish_status)
```

---

## Detailed Node Sequence

### Foundation Nodes (added once, reused by both paths)

#### Node: `🕐 ¿Programado?` (IF v1)
```
id: check-scheduled
type: n8n-nodes-base.if
typeVersion: 1
condition: String($json.publish_at) !== "now"
value1: ={{ String($json.publish_at) }}
value2: now
operation: notEqual
```
- TRUE output → Wait node
- FALSE output → routing IF

#### Node: `⏳ Wait Until`
```
id: wait-until-publish
type: n8n-nodes-base.wait
resume: specificTime
dateTime: ={{ $json.publish_at }}
```
`publish_at` must be ISO 8601 string (e.g., `"2026-04-11T09:00:00.000Z"`).
The Wait node persists execution state to n8n's SQLite/Postgres DB — no Supabase needed.
Wait node output passes through `$json` unchanged.

**Known limitation (MEDIUM confidence):** GitHub issue #14723 reports "At Specified Time" can misfire in some n8n versions. Test this carefully in 2.14.2 with a 2-minute test wait before trusting production schedules.

---

### Single-Post Publishing Path

```
[🔀 ¿Carrusel?] FALSE branch
         │
[🔽 Descargar imagen]   HTTP Request GET — downloads final_image_url as binary
         │
[☁️ Upload Azure Blob]  HTTP Request PUT — uploads binary to Azure Blob
         │
[🔗 Obtener URL pública] Code node — constructs public blob URL from container + filename
         │
[📸 Meta IG: Crear container] HTTP Request POST /{ig-user-id}/media
         │
[📘 FB: Upload foto (unpublished)] HTTP Request POST /{page-id}/photos?published=false
         │
[📸 Meta IG: Publicar]  HTTP Request POST /{ig-user-id}/media_publish
         │
[📘 FB: Publicar post]  HTTP Request POST /{page-id}/feed with attached_media
         │
[✅ WA éxito] → [📊 Sheets Log]
```

#### Node: `🔽 Descargar imagen` (HTTP Request)
```
id: download-image
method: GET
url: ={{ $json.final_image_url }}
responseFormat: file
```
Downloads Ideogram/FAL image as binary data (n8n binary item).

#### Node: `☁️ Upload Azure Blob` (HTTP Request)
```
id: upload-azure-blob
method: PUT
url: https://{account}.blob.core.windows.net/{container}/propulsar-{{ $json.session_id }}-single.jpg?{{ $env.AZURE_SAS_PARAMS }}
sendHeaders: true
headers:
  x-ms-blob-type: BlockBlob
  Content-Type: image/jpeg
sendBody: true
bodyType: binaryData
inputDataField: data
```
**Pattern:** SAS token is stored as n8n credential or env var. PUT the binary directly. Azure Blob returns 201 on success, no body. Public URL is constructed as `https://{account}.blob.core.windows.net/{container}/propulsar-{session_id}-single.jpg` (no SAS params needed if container is public-read).

**Constraint:** No `$env` in Code nodes — but HTTP Request nodes CAN use `$env` in header/URL fields. Store `AZURE_STORAGE_ACCOUNT`, `AZURE_CONTAINER`, and `AZURE_SAS_PARAMS` (the SAS query string without `?`) as n8n environment variables in Azure Container App.

#### Node: `🔗 Obtener URL pública` (Code node)
```javascript
const sessionId = $('🔍 Recuperar sesión Supabase').first().json.session_id
  || `session_${Date.now()}`;
const account = $env.AZURE_STORAGE_ACCOUNT;   // NOT in Code node — use workaround below
const container = 'propulsar-content';
const filename = `propulsar-${sessionId}-single.jpg`;
// Workaround: pass account/container as fields from prior node, not $env
const publicUrl = `https://${$json._azure_account}.blob.core.windows.net/${$json._azure_container}/${filename}`;
return [{ json: { ...$json, azure_public_url: publicUrl } }];
```
**Constraint workaround:** Since `$env` is unavailable in Code nodes, a prior HTTP Request node that reads from `$env` (e.g., the upload node's URL) can pass account/container as output fields. Alternatively, hardcode non-secret values (account name, container name) directly in Code node strings — they are not secrets.

#### Node: `📸 Meta IG: Crear container` (HTTP Request)
```
id: meta-ig-create-container
method: POST
url: https://graph.facebook.com/v19.0/{{ $env.INSTAGRAM_ACCOUNT_ID }}/media
sendBody: true
bodyType: json
body:
  image_url: ={{ $json.azure_public_url }}
  caption: ={{ $json.instagram?.caption }}
  access_token: ={{ $env.META_PAGE_TOKEN }}
```
Returns `{ id: "<container_id>" }`.

**Token approach:** Use `$env.META_PAGE_TOKEN` in HTTP Request URL/body parameters — this works because `$env` is only blocked in Code nodes. Alternative: create a "Header Auth" or "Generic Credential" in n8n credentials store and reference it via the `credentials` property. The credential approach is preferred for secrets (token won't appear in logs), but `$env` in HTTP Request params is acceptable for this self-hosted pipeline.

#### Node: `📸 Meta IG: Publicar` (HTTP Request)
```
id: meta-ig-publish
method: POST
url: https://graph.facebook.com/v19.0/{{ $env.INSTAGRAM_ACCOUNT_ID }}/media_publish
body:
  creation_id: ={{ $json.id }}   (container_id from previous step)
  access_token: ={{ $env.META_PAGE_TOKEN }}
```
Returns `{ id: "<ig_post_id>" }`.

#### Node: `📘 FB: Upload foto` (HTTP Request)
```
id: fb-upload-photo
method: POST
url: https://graph.facebook.com/v19.0/{{ $env.FACEBOOK_PAGE_ID }}/photos
body:
  url: ={{ $json.azure_public_url }}
  published: false
  access_token: ={{ $env.META_PAGE_TOKEN }}
```
Returns `{ id: "<photo_id>" }`. Run this IN PARALLEL with IG container creation (both need only `azure_public_url`).

#### Node: `📘 FB: Publicar post` (HTTP Request)
```
id: fb-publish-post
method: POST
url: https://graph.facebook.com/v19.0/{{ $env.FACEBOOK_PAGE_ID }}/feed
body:
  message: ={{ $json.facebook?.caption }}
  attached_media[0]: ={{ JSON.stringify({ media_fbid: $json.fb_photo_id }) }}
  access_token: ={{ $env.META_PAGE_TOKEN }}
```
Returns `{ id: "<page_post_id>" }`.

---

### Carousel Publishing Path

Instagram carousel requires 3 API calls per run:
1. N × child container POST (one per image)
2. 1 × carousel container POST
3. 1 × media_publish POST

Facebook carousel uses the `attached_media` multi-photo pattern (N unpublished photo uploads + 1 feed post).

```
[🔀 ¿Carrusel?] TRUE branch
         │
[🗂️ Explode carousel for upload]   Code node — array of image_urls as N items
         │
[🔽 Descargar imagen (carousel)]   HTTP Request GET — binary per item
         │
[☁️ Upload Azure Blob (carousel)]  HTTP Request PUT per item
         │
[🔗 Collect Azure URLs]            Code node — gather N public URLs into array
         │
[📸 IG child containers loop]      HTTP Request POST × N — one container per image
         │
[📘 FB photo uploads loop]         HTTP Request POST × N — unpublished photos
         │
[🔗 Collect container IDs]         Code node — gather IG container IDs, FB photo IDs
         │
[📸 IG: Crear carrusel container]  HTTP Request POST — media_type=CAROUSEL, children=ids
         │
[📸 IG: Publicar carrusel]         HTTP Request POST — media_publish
         │
[📘 FB: Publicar carrusel post]    HTTP Request POST — /feed with N attached_media
         │
[✅ WA éxito] → [📊 Sheets Log]
```

#### Node: `🗂️ Explode carousel for upload` (Code node)
```javascript
const d = $input.first().json;
return (d.image_urls || []).map((url, idx) => ({
  json: {
    image_url: url,
    slide_index: idx + 1,
    _parent: d,   // carry full session data
  }
}));
```

#### Nodes: download + Azure upload (same pattern as single, different filename)
Filename template: `propulsar-{{ $json._parent.session_id }}-slide-{{ $json.slide_index }}.jpg`

#### Node: `🔗 Collect Azure URLs` (Code node — runOnceForAllItems)
```javascript
const items = $input.all();
const parent = items[0].json._parent;
const azureUrls = items.map(i => i.json.azure_public_url);
return [{ json: { ...parent, azure_urls: azureUrls } }];
```

#### IG child containers: feed `azure_urls` as N items → HTTP Request POST × N
n8n processes N items against one HTTP Request node sequentially (same pattern as Ideogram slide generation — already proven in v1.0). Each returns `{ id }`.

#### Node: `🔗 Collect container IDs` (Code node — runOnceForAllItems)
```javascript
const items = $input.all();
const igIds = items.map(i => i.json.id);
const parent = $('🗂️ Explode carousel for upload').first().json._parent;
return [{ json: { ...parent, ig_child_ids: igIds } }];
```

**Note:** Accessing `$('node-name')` from collect nodes is the proven pattern from v1.0 (`🗂️ Collect Image URLs` uses `$('🔧 Parsear prompts carrusel').first().json`).

#### Node: `📸 IG: Crear carrusel container` (HTTP Request)
```
body:
  media_type: CAROUSEL
  children: ={{ $json.ig_child_ids.join(',') }}
  caption: ={{ $json.instagram?.caption }}
  access_token: ={{ $env.META_PAGE_TOKEN }}
```

---

### Error Handling Pattern

n8n 2.14.2 has no try/catch across nodes. Use the "On Error" output of HTTP Request nodes (typeVersion 4.2 supports error output branch). Route error output to a dedicated error handling sub-flow.

```
[Meta IG: Publicar]
       │ SUCCESS          │ ERROR (node error branch)
       ▼                  ▼
[continue]         [🔧 Preparar error WA]
                          │
                   [📤 WA: Notificar error]
                          │
                   [📊 Sheets: Loguear error]
```

#### Node: `🔧 Preparar error WA` (Code node)
```javascript
const err = $input.first().json;
const session = $('🔍 Recuperar sesión Supabase').first().json;
const msg = `❌ *Error publicando en Meta*\n\nTema: ${session.topic || 'N/A'}\nError: ${err.message || JSON.stringify(err).substring(0, 200)}\n\nVerificar token o permisos en Meta Business Suite.`;
return [{ json: { ...session, error_message: msg } }];
```

**Important:** Each n8n execution is isolated — a failure in execution A cannot block execution B. No queuing concern.

---

### WhatsApp Success Notification

```javascript
// 📱 Preparar WA éxito
const d = $input.first().json;
const igUrl = `https://www.instagram.com/p/${d.ig_post_id}/`;
const fbUrl = `https://www.facebook.com/${d.fb_post_id}`;
const msg = `✅ *Post publicado exitosamente*\n\n📌 Tema: ${d.topic}\n\n📸 Instagram: ${igUrl}\n👥 Facebook: ${fbUrl}`;
return [{ json: { ...d, success_wa_message: msg } }];
```

---

### Google Sheets Log — Schema Update

Current columns: `Fecha, Tema, Tipo, Angulo, Plataformas, Modelo_Imagen, Imagen_URL, Estado`

New columns to add: `IG_URL, FB_URL, Publicado_En` (ISO timestamp of actual publish)

Sheets node update strategy: modify the existing `log-sheets` node `columns.value` mapping — add three new fields. For failed rows, set `Estado: "Error"`, leave IG_URL/FB_URL blank, add error summary.

---

### Scheduling UX — Wizard Integration

Wizard collects one new field at the end of the brief flow:

```javascript
// wizard/run.js — new prompt after angle selection
const publishChoice = await inquirer.prompt([{
  type: 'list',
  name: 'publish_when',
  message: '¿Cuándo publicar?',
  choices: [
    { name: 'Ahora mismo', value: 'now' },
    { name: 'Hoy a una hora específica', value: 'today' },
    { name: 'Mañana a una hora específica', value: 'tomorrow' },
  ]
}]);

let publishAt = 'now';
if (publishChoice.publish_when !== 'now') {
  // prompt for hour (0-23), build ISO string in Spain timezone
  const hour = await promptHour();
  const d = publishChoice.publish_when === 'tomorrow'
    ? new Date(Date.now() + 86400000)
    : new Date();
  d.setHours(hour, 0, 0, 0);
  publishAt = d.toISOString();
}
```

Brief JSON gains one field: `"publish_at": "now" | "<ISO timestamp>"`

n8n side: `🕐 ¿Programado?` IF node checks `String($json.publish_at) !== 'now'`.

**Max scheduling window:** 24h (enforced in Wizard by capping to today or tomorrow). Avoids Meta token expiry concerns (long-lived Page tokens are valid 60 days; 24h window is well within that).

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| Wizard (wizard/run.js) | Collect brief + publish_at, POST to webhook | n8n webhook trigger |
| n8n — generation sub-flow | GPT-4o text, image generation, WA preview | Ideogram/FAL/OpenAI APIs, YCloud |
| n8n — approval gate | Receive SI/NO, retrieve session | YCloud webhook, Supabase |
| n8n — publishing sub-flow (NEW) | Re-host images, schedule, publish, notify | Azure Blob, Meta Graph API, YCloud |
| Azure Blob Storage (NEW) | Serve stable public image URLs to Meta | n8n HTTP Request PUT, Meta Graph API GET |
| Meta Graph API (NEW) | Publish to Instagram + Facebook | n8n HTTP Request POST |
| Google Sheets | Log generations + publish results | n8n Sheets node |
| Supabase | Session state between webhook executions | n8n Code nodes via $helpers.httpRequest |

---

## Architectural Patterns

### Pattern 1: N-item sequential HTTP execution (proven in v1.0)

**What:** Feed N items into a single HTTP Request node. n8n processes them sequentially without SplitInBatches.
**When to use:** All carousel loops — image download, Azure upload, IG child container creation, FB photo upload.
**Why it works:** SplitInBatches Done branch has a known bug in 2.14.2; the native N-item approach (proven in Ideogram slide generation) is more reliable and simpler.

### Pattern 2: Collect-after-loop via $() reference (proven in v1.0)

**What:** After processing N items, a `runOnceForAllItems` Code node calls `$('upstream-node').all()` to gather all outputs.
**When to use:** Collecting Azure URLs after N uploads, collecting IG container IDs after N child container POSTs.
**Precedent:** `🗂️ Collect Image URLs` (id: `collect-carousel-urls`) uses exactly this — `$('🔧 Parsear prompts carrusel').first().json` for metadata.

### Pattern 3: IF v1 string comparison routing (required for 2.14.2)

**What:** All IF nodes must use typeVersion 1 with string comparisons.
**Why:** IF v2 / Switch v3 always routes to TRUE branch in 2.14.2.
**Applies to:** `🕐 ¿Programado?`, `🔀 ¿Carrusel o Single?`, error branch routing.

### Pattern 4: $env in HTTP Request parameters, not Code nodes

**What:** API keys and environment variables are accessible in HTTP Request node URL/header/body fields via `$env.VAR_NAME`, but NOT inside Code node jsCode.
**Implication for publishing:** All Meta token usage (`META_PAGE_TOKEN`, `INSTAGRAM_ACCOUNT_ID`, `FACEBOOK_PAGE_ID`) goes in HTTP Request parameters directly. Azure SAS params go in the HTTP Request URL field. Non-secret config (account name, container name) can be hardcoded in Code node strings.

---

## Build Order for Phases

Dependencies determine strict ordering. Each phase must be fully working before starting the next.

### Phase 1 — Foundation: Azure Blob + Token credential + dry-run

**Why first:** Publishing to Meta requires stable public image URLs. Azure Blob solves Ideogram URL expiry. Without working re-hosting, nothing else can be validated.

Tasks:
1. Create Azure Storage Account + Container in Azure Portal (or reuse existing `propulsar-n8n` resource group)
2. Generate SAS token (write + read, 1 year), store as `AZURE_SAS_PARAMS` env var in Azure Container App
3. Add `AZURE_STORAGE_ACCOUNT`, `AZURE_CONTAINER` env vars to Container App
4. Add publishing env vars: `META_PAGE_TOKEN`, `INSTAGRAM_ACCOUNT_ID`, `FACEBOOK_PAGE_ID` (already in .env from 2026-04-10)
5. Build download + upload nodes in a test workflow, verify a public URL is accessible
6. Build single dry-run IG container creation (returns container_id without publishing)

**Deliverable:** Can take any Ideogram URL → Azure Blob public URL → verified accessible from public internet.

### Phase 2 — Single-post publishing

**Why second:** Simpler than carousel (1 image, no loops). Validates Meta Graph API integration end-to-end before adding carousel complexity.

Tasks:
1. Attach to existing `retrieve-session` → (cut Sheets) → download → Azure upload → construct URL
2. IG container + publish (returns ig_post_id)
3. FB photo upload (unpublished) + feed post with attached_media (returns fb_post_id)
4. WA success notification
5. Update Sheets log (add IG_URL, FB_URL columns)
6. Error branch: Meta publish failure → WA error notification → Sheets error row

**Deliverable:** Full single-post publish flow tested end-to-end from WA approval to live post.

### Phase 3 — Carousel publishing

**Why third:** Builds directly on Phase 2 patterns (Azure upload, Meta HTTP patterns). Adds N-item loops and the 3-step IG carousel API sequence.

Tasks:
1. Explode carousel for upload (N items from image_urls array)
2. Download × N + Azure upload × N (sequential, same pattern as Ideogram slides)
3. Collect Azure URLs
4. IG child container POST × N + collect container IDs
5. FB photo upload × N (unpublished) + collect FB photo IDs
6. IG carousel container POST + IG media_publish
7. FB feed post with N attached_media entries
8. WA success notification (same node as single — re-use)
9. Error branches per phase (IG container creation failure, publish failure)

**Deliverable:** Carousel post published to IG + FB end-to-end.

### Phase 4 — Scheduling layer

**Why fourth:** Scheduling is a pure addition to the already-working publish flow. No publishing logic changes.

Tasks:
1. Add `publish_at` field to Wizard brief prompts (today/tomorrow hour picker)
2. Add `🕐 ¿Programado?` IF node after `retrieve-session`
3. Add `⏳ Wait Until` node on TRUE branch
4. Test with 2-minute future time (validate n8n 2.14.2 Wait behavior)
5. Test with 1-hour future time

**Deliverable:** Post scheduled via Wizard, published automatically at specified time.

### Phase 5 — Error handling hardening (can overlap with Phase 4)

**Why last:** Error paths are secondary flows. Core success path must be solid first.

Tasks:
1. Add error output branches to all Meta HTTP Request nodes
2. `🔧 Preparar error WA` + `📤 WA: Notificar error` nodes
3. Sheets error row logging
4. Test with invalid token to verify error path fires correctly

---

## Data Flow — Post-Approval (v1.1)

```
[Recuperar sesión Supabase]
    outputs: { topic, type, platforms, image_model, final_image_url,
               image_urls (carousel), instagram, facebook,
               approval_number, session_id, publish_at }
         │
[¿Programado?] ──► (if YES) [Wait Until publish_at]
         │
[¿Carrusel?]
    │ YES                              │ NO
[Explode × N]                   [Download image]
[Download × N]                  [Azure PUT single]
[Azure PUT × N]                 [Construct URL]
[Collect Azure URLs]                   │
[IG child POST × N]             [IG container POST]
[FB photo POST × N]             [FB photo POST]
[Collect IDs]                         │
[IG carousel POST]              [IG publish]
[IG publish]                    [FB feed POST]
[FB feed with N attached_media]        │
         │                            │
         └──────────┬─────────────────┘
                    │
              [Preparar WA éxito]
                    │
              [Enviar WA éxito]
                    │
              [Google Sheets Log]  (adds IG_URL, FB_URL, Publicado_En)
```

---

## Integration Points

### Azure Blob Storage
| Concern | Detail |
|---------|--------|
| Auth method | SAS token in URL query string (no shared key header needed for PUT) |
| Node type | HTTP Request typeVersion 4.2, PUT method, binaryData body |
| Public access | Container must be set to "Blob (anonymous read)" or "Container" level |
| Filename collision | Use `session_id` + slide index in filename — guaranteed unique per execution |
| SAS expiry | Generate 1-year SAS at setup. Store as `AZURE_SAS_PARAMS` in Container App env. |

### Meta Graph API — Instagram
| Concern | Detail |
|---------|--------|
| Base URL | `https://graph.facebook.com/v19.0/` |
| Token | Long-lived Page token, ~60 day expiry — stored as `META_PAGE_TOKEN` env var |
| IG single publish | 2 calls: create container → media_publish |
| IG carousel publish | N+2 calls: N child containers → carousel container → media_publish |
| Rate limit | 100 API-published posts per 24h (carousels count as 1) |
| Image requirement | Must be publicly accessible URL (Azure Blob satisfies this) |
| Confidence | HIGH — verified against official Meta developer docs |

### Meta Graph API — Facebook
| Concern | Detail |
|---------|--------|
| FB single photo | 2 calls: POST /photos (published=false) → POST /feed with attached_media |
| FB carousel | N+1 calls: N × POST /photos (published=false) → POST /feed with N attached_media |
| Token | Same `META_PAGE_TOKEN` — Page token grants both IG + FB page access |
| Permission required | pages_manage_posts, pages_read_engagement, pages_show_list |
| Confidence | HIGH — verified against official Graph API docs |

### n8n Wait Node (scheduling)
| Concern | Detail |
|---------|--------|
| Mode | "At Specified Time" (`specificTime`) |
| Input format | ISO 8601 string in `$json.publish_at` field |
| State persistence | Execution data stored in n8n DB (SQLite on Azure Container App) — survives restarts |
| Known issue | GitHub issue #14723: "At Specified Time" broken in some versions. Must test in 2.14.2 specifically. |
| Timezone | n8n server time is used regardless of workflow timezone setting. Wizard must generate UTC ISO strings. |
| Confidence | MEDIUM — official docs confirm feature exists; 2.14.2-specific behavior needs validation |

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Sending Ideogram URLs directly to Meta Graph API

**What people do:** Skip Azure re-hosting, pass `final_image_url` (Ideogram CDN) directly to IG container POST.
**Why it's wrong:** Ideogram CDN URLs expire within hours and include auth parameters (`exp`, `sig`). Meta's servers fetch the image asynchronously, often minutes after the API call. Expired URL = failed container creation with cryptic "media URL invalid" error.
**Do this instead:** Always re-host via Azure Blob before any Meta API call.

### Anti-Pattern 2: Using SplitInBatches for the carousel upload loops

**What people do:** Wrap download + upload in SplitInBatches to process N slides.
**Why it's wrong:** n8n 2.14.2 bug — SplitInBatches Done branch cannot reference loop body nodes via `$()`. Already hit this in v1.0.
**Do this instead:** Feed N items directly into HTTP Request node. n8n processes sequentially. Already proven pattern in Ideogram slide generation.

### Anti-Pattern 3: Using IF v2 or Switch v3 for routing

**What people do:** Use the default (latest) version when adding new IF nodes.
**Why it's wrong:** Always routes to TRUE branch in 2.14.2, ignoring conditions.
**Do this instead:** Explicitly set `"typeVersion": 1` on all IF nodes. Use string comparisons as conditions.

### Anti-Pattern 4: Reading env vars in Code nodes

**What people do:** `const token = $env.META_PAGE_TOKEN;` in a Code node jsCode block.
**Why it's wrong:** `$env` is not available in Code nodes in 2.14.2. Silent `undefined`.
**Do this instead:** Read `$env.META_PAGE_TOKEN` directly in HTTP Request node body/header fields. Pass any computed non-secret values (like constructed public URLs) through `$json` between nodes.

### Anti-Pattern 5: Hardcoding Meta API version in base URL

**What people do:** Use `v17.0` or `v18.0` from old examples.
**Why it's wrong:** Old API versions get deprecated. The carousel endpoint behavior can change.
**Do this instead:** Use `v19.0` (current stable as of 2026-04-10). Verify in Meta Graph API Explorer before changing.

---

## New Environment Variables Required

| Variable | Purpose | Where to Set |
|----------|---------|--------------|
| `AZURE_STORAGE_ACCOUNT` | Storage account name | Azure Container App env + .env |
| `AZURE_CONTAINER` | Blob container name | Azure Container App env + .env |
| `AZURE_SAS_PARAMS` | SAS query string (no `?`) for write access | Azure Container App env + .env |
| `META_PAGE_TOKEN` | Long-lived Page token for IG + FB | Already in .env since 2026-04-10 |
| `INSTAGRAM_ACCOUNT_ID` | IG Business Account ID | Already in .env since 2026-04-10 |
| `FACEBOOK_PAGE_ID` | FB Page ID | Already in .env since 2026-04-10 |

---

## Sources

- Meta Graph API — Instagram Content Publishing: https://developers.facebook.com/docs/instagram-platform/content-publishing/
- Meta Graph API — Facebook Page Photos: https://developers.facebook.com/docs/graph-api/reference/page/photos/
- n8n Wait node documentation: https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.wait/
- n8n Wait "At Specified Time" broken issue: https://github.com/n8n-io/n8n/issues/14723
- Azure Blob Storage SAS PUT pattern (n8n community): https://community.n8n.io/t/azure-blob-storage-support-for-sas-tokens/112080
- n8n Instagram carousel workflow template: https://n8n.io/workflows/3693-create-and-publish-instagram-carousel-posts-with-gpt-41-mini-imgur-and-graph-api/
- Existing workflow.json — direct inspection of all 27 nodes and connection map
- PROJECT.md — v1.1 requirements and confirmed env vars

---
*Architecture research for: Propulsar Content Engine v1.1 automatic publishing*
*Researched: 2026-04-10*
