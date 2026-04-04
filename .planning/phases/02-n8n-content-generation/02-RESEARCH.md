# Phase 2: n8n Content Generation - Research

**Researched:** 2026-04-04
**Domain:** n8n workflow extension — conditional branching, GPT-4o structured JSON generation, carousel prompt engineering
**Confidence:** HIGH

---

## Summary

Phase 2 extends the existing `n8n/workflow.json` to detect carousel briefs and run them through a dedicated GPT-4o call that returns N image prompts (one per slide), each with slide text overlay and visual direction. Single-post briefs bypass this entirely — the existing flow is unchanged.

The detection mechanism is clean: the webhook body contains `format: "carousel"` and `num_images: N` only for carousel briefs (via the conditional spread added in Phase 1). The n8n IF node checks `$json.body.format === "carousel"` and routes to one of two paths. The carousel path adds one new GPT-4o OpenAI node (same node type as the existing text-generation node) with a structured system prompt that instructs the model to return a JSON array of exactly `num_images` prompt objects. A subsequent Code node parses that JSON and injects the `image_prompts` array back into the working data object for downstream use in Phase 3.

The key architectural insight is that **the existing single-post flow must not be touched**. The IF node branches early, and both branches converge at Phase 3's image generation step (or at the "Parsear contenido" Code node for single posts). Style enforcement (dark background #1a1a2e, purple-magenta gradient, bold Spanish text) must be embedded in the GPT-4o system prompt for carousel generation — not left to the individual image generation calls — because Phase 3 will call Ideogram in a loop and cannot easily inject style from the brief.

**Primary recommendation:** Insert one IF node immediately after the Webhook Trigger + Respond node fan-out. The carousel branch runs: new GPT-4o carousel node → new Code node (parse + assemble prompts). The single-post branch runs the existing "GPT-4o — Texto" node unchanged. The carousel path replaces the existing single-post GPT-4o + subsequent nodes for carousel briefs only.

---

## Standard Stack

### Core

| Library / Node | Version | Purpose | Why Standard |
|----------------|---------|---------|--------------|
| `n8n-nodes-base.if` | typeVersion 2 | Binary branch on `format === "carousel"` | Already used in workflow (`check-own-image`, `check-approval`) |
| `@n8n/n8n-nodes-langchain.openAi` | typeVersion 1.4 | GPT-4o carousel prompt generation | Identical to existing "GPT-4o — Texto" node — same credentials, same type |
| `n8n-nodes-base.code` | typeVersion 2 | Parse GPT-4o JSON array → inject `image_prompts` | Used throughout workflow (4 existing Code nodes) |

### Supporting

| Library / Node | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| No new node types | — | — | Phase 2 uses only existing node types already present in the workflow |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Existing OpenAI node (typeVersion 1.4) | HTTP Request to OpenAI directly | HTTP Request avoids credential requirement but adds manual auth header management; OpenAI node is cleaner and already configured |
| IF node for carousel detection | Switch node | IF is sufficient for binary branch (carousel vs not); Switch would add unnecessary complexity |
| Code node to parse GPT-4o output | Set node + Edit Fields | Code node is already established pattern in this workflow; gives full JSON parsing control with regex cleanup |

**Installation:** No new node types, no new dependencies, no new credentials beyond OpenAI (already manually linked).

---

## Architecture Patterns

### Existing Workflow Structure (n8n/workflow.json, confirmed by reading)

```
🎯 Webhook Trigger
  ├── ✅ Responder al Wizard       (immediate HTTP 200 response)
  └── 🤖 GPT-4o — Texto           (generates instagram + facebook captions)
        └── 🔧 Parsear contenido  (Code: parse OpenAI response + assemble data obj)
              └── 🖼️ ¿Imagen propia? (IF: has_own_image true/false)
                    ├── TRUE  → 📎 Imagen propia → 📱 Preparar mensaje WA
                    └── FALSE → 🎨 Router — Modelo de imagen (Switch: flux/ideogram/nanoBanana)
                                  → image generation nodes → 🔗 Normalizar URL imagen
                                       └── 📱 Preparar mensaje WA
                                             └── 📤 Enviar WhatsApp → [approval flow]
```

### Target Workflow Structure After Phase 2

```
🎯 Webhook Trigger
  ├── ✅ Responder al Wizard       (unchanged)
  └── 🔀 ¿Carrusel?               (NEW: IF node — format === "carousel")
        ├── TRUE  → 🎠 GPT-4o — Prompts Carrusel (NEW OpenAI node)
        │             └── 🔧 Parsear prompts carrusel (NEW Code node)
        │                   └── [connects to Phase 3 image loop]
        └── FALSE → 🤖 GPT-4o — Texto (unchanged, existing single-post path)
                      └── 🔧 Parsear contenido (unchanged, existing)
                            └── [existing image + WhatsApp flow unchanged]
```

### Pattern 1: Carousel Detection via IF Node

**What:** The IF node checks `$json.body.format` against the string `"carousel"`.
**When to use:** Immediately after Webhook Trigger (parallel to "Responder al Wizard"), so the single-post path is not modified at all.

```json
{
  "id": "check-carousel",
  "name": "🔀 ¿Carrusel?",
  "type": "n8n-nodes-base.if",
  "typeVersion": 2,
  "parameters": {
    "conditions": {
      "conditions": [{
        "leftValue":  "={{ $json.body.format }}",
        "rightValue": "carousel",
        "operator": { "type": "string", "operation": "equals" }
      }]
    }
  }
}
```

**Critical:** The webhook data is under `$json.body` (not `$json`). This is the established pattern throughout the existing workflow (e.g., `$json.body?.message?.text?.body` in the approval check).

### Pattern 2: GPT-4o Carousel Prompt Generation Node

**What:** A new OpenAI node (same type/version as existing "GPT-4o — Texto") with a system prompt that:
1. Instructs GPT-4o to choose the carousel structure type autonomously (narrative, listicle, step-by-step, etc.)
2. Generates exactly `num_images` prompt objects
3. Enforces Propulsar visual identity in every prompt

**Node configuration pattern** (mirrors existing "GPT-4o — Texto" node):

```json
{
  "id": "openai-carousel",
  "name": "🎠 GPT-4o — Prompts Carrusel",
  "type": "@n8n/n8n-nodes-langchain.openAi",
  "typeVersion": 1.4,
  "parameters": {
    "model": "gpt-4o",
    "messages": {
      "values": [
        {
          "role": "system",
          "content": "[SYSTEM PROMPT — see Pattern 3 below]"
        },
        {
          "role": "user",
          "content": "=Tema: \"{{ $json.body.topic }}\"\nTipo: {{ $json.body.type }}\n{% if $json.body.angle %}Ángulo: {{ $json.body.angle }}\n{% endif %}Slides requeridos: {{ $json.body.num_images }}\n\nElige la estructura del carrusel apropiada y genera exactamente {{ $json.body.num_images }} prompts de imagen."
        }
      ]
    },
    "options": { "temperature": 0.7 }
  },
  "credentials": {
    "openAiApi": { "id": "openai-credentials", "name": "OpenAI" }
  }
}
```

**Note on credentials:** The `id` value `"openai-credentials"` is a placeholder — the actual credential ID changes per n8n instance and must be manually linked after each workflow upload. This is a known blocker documented in STATE.md.

### Pattern 3: GPT-4o System Prompt for Carousel Prompts

**What:** The system prompt must accomplish all three requirements (GEN-01, GEN-02, GEN-03) in a single call.

```
Eres un director creativo de Propulsar.ai especializado en carruseles de Instagram.

Tu tarea: dado un tema, tipo de post y número de slides, generar los prompts de imagen para cada slide del carrusel.

ESTRUCTURA DEL CARRUSEL (elige tú, el usuario nunca elige):
- narrativo: historia con inicio-desarrollo-conclusión
- listicle: lista de N items independientes (uno por slide)
- paso-a-paso: proceso secuencial con pasos numerados
- antes-después: contraste o transformación
- pregunta-respuesta: hook con pregunta, slides con respuestas

Elige la estructura más apropiada según el tema y tipo de post.

IDENTIDAD VISUAL (OBLIGATORIO en cada prompt):
- Fondo oscuro #1a1a2e
- Acentos con gradiente de púrpura a magenta (#6B46C1 → #EC4899)
- Tipografía bold en español, altamente legible, sin sombra difusa
- Diseño de redes sociales profesional, formato cuadrado 1:1

REGLAS:
- Devuelve SOLO JSON válido, sin markdown
- El array debe tener EXACTAMENTE el número de slides solicitado
- Cada prompt está en inglés (para el modelo de imagen), pero el texto_overlay es en español
- El campo "texto_overlay" es el texto que aparecerá físicamente en la imagen
- El campo "prompt" es la instrucción completa para el generador de imágenes (incluye texto_overlay Y estilo visual)

FORMATO DE RESPUESTA:
{
  "estructura": "narrativo | listicle | paso-a-paso | antes-después | pregunta-respuesta",
  "slides": [
    {
      "slide_num": 1,
      "texto_overlay": "Texto en español que irá en la imagen",
      "prompt": "Full image generation prompt in English: [visual description], bold Spanish text overlay reading '[texto_overlay]', dark background #1a1a2e, purple to magenta gradient accents (#6B46C1 to #EC4899), professional social media design, square format 1:1, high contrast, clean typography"
    }
  ]
}
```

**Key design decisions in this prompt:**
- `estructura` field is chosen by AI autonomously (satisfies GEN-02)
- `texto_overlay` is in Spanish (readable in WhatsApp preview)
- `prompt` field includes ALL style constraints inline (satisfies GEN-03 — no prompt omits style)
- `prompt` is in English (required for Ideogram v3 best results)
- Response is pure JSON without markdown (same approach as "GPT-4o — Texto" node)

### Pattern 4: Code Node to Parse Carousel Prompts

**What:** Parses the GPT-4o JSON response, validates slide count matches `num_images`, assembles the complete data object for Phase 3.

```javascript
// "Run Once for All Items" mode
const raw = $input.first().json.message.content;
const b = $('🎯 Webhook Trigger').first().json.body;

let parsed;
try {
  parsed = JSON.parse(raw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim());
} catch(e) {
  throw new Error('JSON inválido de GPT-4o (carrusel): ' + raw.substring(0, 200));
}

const slides = parsed.slides || [];

// Validate count matches request
if (slides.length !== b.num_images) {
  console.warn(`⚠ GPT-4o devolvió ${slides.length} slides, se esperaban ${b.num_images}`);
}

return [{
  json: {
    // Brief fields (passthrough)
    topic:           b.topic,
    type:            b.type,
    angle:           b.angle || null,
    platforms:       b.platforms,
    image_model:     'ideogram',
    fal_model_id:    null,
    has_own_image:   false,
    image_url:       null,
    has_text_in_image: true,
    approval_number: b.approval_number,
    timestamp:       b.timestamp,
    // Carousel fields
    format:          'carousel',
    num_images:      b.num_images,
    estructura:      parsed.estructura || 'listicle',
    // Generated prompts — ready for Phase 3
    image_prompts:   slides.map(s => ({
      slide_num:     s.slide_num,
      texto_overlay: s.texto_overlay,
      prompt:        s.prompt,
    })),
  }
}];
```

**Access pattern note:** `$('🎯 Webhook Trigger').first().json.body` — uses node-reference by name (same pattern as existing "Parsear contenido" Code node: `$('🎯 Webhook Trigger').first().json.body`). Confirmed HIGH confidence — identical pattern already proven in production.

### Anti-Patterns to Avoid

- **Modifying "GPT-4o — Texto" or "Parsear contenido" for carousel:** These nodes must remain untouched. Carousel gets its own GPT-4o node.
- **Putting style constraints only in the system prompt without repeating them per slide:** GPT-4o sometimes ignores system prompt constraints at slide level. Each `prompt` field must embed style inline.
- **Asking GPT-4o to return `num_images` as a count check:** It will sometimes return N-1 or N+1 if the system prompt has competing instructions. Instruct it to return EXACTLY N and validate in the Code node.
- **Using n8n expressions (`{{ }}`) inside Code node JS code:** Only valid in node parameter fields (like the OpenAI node user message). Code nodes use plain JavaScript.
- **Using `$env` in Code nodes:** n8n 2.14.2 blocks `$env` in Code nodes. Not needed here since Code nodes don't call APIs — only the HTTP Request and OpenAI nodes do.
- **Using `require()` in Code nodes:** Blocked in n8n 2.14.2. Not needed since no HTTP calls happen in Code nodes.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| JSON parsing with markdown strip | Custom parser | `raw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim()` | Identical pattern proven in existing "Parsear contenido" Code node — already handles GPT-4o quirk of wrapping JSON in code blocks |
| Style enforcement per slide | Per-slide Set node | Inline in system prompt + Code node assembles | GPT-4o generates style-aware prompts in one call; no need for post-processing |
| Slide count validation | Separate IF node | `console.warn` in Code node + proceed with whatever slides exist | Hard failure on count mismatch creates brittle workflows; a warn + proceed is more resilient for a preview-and-approve flow |

**Key insight:** GPT-4o occasionally returns N±1 items. The Code node should warn but not throw — the user sees the preview via WhatsApp and can reject if slides look wrong.

---

## Common Pitfalls

### Pitfall 1: Credential ID Mismatch After Upload

**What goes wrong:** After uploading the updated `workflow.json` to n8n Azure, the new "GPT-4o — Prompts Carrusel" node shows "OpenAI credential not found" — the workflow runs but the carousel branch throws.

**Why it happens:** n8n credential IDs are instance-specific. The `id` in `"credentials": {"openAiApi": {"id": "openai-credentials"}}` doesn't match the actual ID in the Azure n8n instance.

**How to avoid:** After upload, manually open the new carousel GPT-4o node and select the OpenAI credential from the dropdown. This is the same step required for the existing node and is already documented as a known blocker in STATE.md.

**Warning signs:** Carousel execution fails immediately at the GPT-4o node with a credentials error.

### Pitfall 2: IF Node Receives Webhook Data Directly

**What goes wrong:** The IF node is connected to the Webhook Trigger but the data is at `$json.body.format`, not `$json.format`. The node always routes to FALSE.

**Why it happens:** Webhook node wraps POST body under `.body`. Every node in this workflow already uses `$json.body.*` — but it's easy to forget when writing a new IF condition.

**How to avoid:** Condition must be `leftValue: "={{ $json.body.format }}"` — with `.body.` in the path. Verify by testing with a carousel brief from `test-webhook.js` and checking execution data in n8n.

**Warning signs:** All carousel briefs route to the single-post branch.

### Pitfall 3: GPT-4o Returns Wrong Slide Count

**What goes wrong:** User requested 7 slides; GPT-4o returns 5 or 8. Phase 3 generates wrong number of images.

**Why it happens:** GPT-4o sometimes summarizes or expands content. The `num_images` constraint in the user message alone may not be sufficient.

**How to avoid:**
1. State the count constraint in BOTH the system prompt (general rule) and the user message (specific value).
2. Code node validates count and logs a warning.
3. Use `slides.length` from parsed output as the actual loop count in Phase 3 — not `b.num_images`. This makes Phase 3 resilient to off-by-one.

**Warning signs:** `image_prompts.length !== num_images` in the Code node output.

### Pitfall 4: Carousel Path Breaks Single-Post Flow

**What goes wrong:** Adding the IF node changes the connection from "Webhook Trigger" to "GPT-4o — Texto" — the single-post flow stops working.

**Why it happens:** IF node is inserted in-line and disconnects the existing direct connection.

**How to avoid:** The Webhook Trigger currently fans out to TWO nodes: "Responder al Wizard" AND "GPT-4o — Texto". After Phase 2, it fans out to "Responder al Wizard" AND "🔀 ¿Carrusel?". The IF node's FALSE output connects to "GPT-4o — Texto" (unchanged). Test single-post flow explicitly after adding the IF node.

**Warning signs:** Single-post webhook submissions don't produce WhatsApp previews.

### Pitfall 5: Style Constraints Omitted From Some Slides

**What goes wrong:** Slides 1 and N have correct Propulsar style in prompts, but middle slides have generic or empty style descriptions.

**Why it happens:** GPT-4o optimizes token output and sometimes abbreviates repeated constraints in middle array items with "same style as above" or similar shortcuts.

**How to avoid:** System prompt must explicitly forbid abbreviation: "Each `prompt` field must be fully self-contained and include ALL visual style constraints. Do NOT use 'same as above' or similar shortcuts." Test with 7-slide input to verify all prompts have `#1a1a2e` and `gradient` mentioned.

**Warning signs:** Some `prompt` fields are significantly shorter than others (< 50 chars vs > 150 chars).

---

## Code Examples

Verified patterns from existing codebase (HIGH confidence — read from actual workflow.json):

### Accessing Webhook Body in Code Nodes

```javascript
// Source: existing "Parsear contenido" Code node in workflow.json
const b = $('🎯 Webhook Trigger').first().json.body;
// Access fields: b.topic, b.type, b.num_images, b.format, etc.
```

### JSON Parse with Markdown Strip (GPT-4o output)

```javascript
// Source: existing "Parsear contenido" Code node in workflow.json
const raw = $input.first().json.message.content;
let parsed;
try {
  parsed = JSON.parse(raw.replace(/```json\n?/g,'').replace(/```\n?/g,'').trim());
} catch(e) {
  throw new Error('JSON inválido de OpenAI: ' + raw.substring(0,200));
}
```

### Existing IF Node Configuration (reference for carousel IF)

```json
// Source: "🖼️ ¿Imagen propia?" node in workflow.json
{
  "parameters": {
    "conditions": {
      "conditions": [{
        "leftValue":  "={{ $json.has_own_image }}",
        "rightValue": true,
        "operator": { "type": "boolean", "operation": "true" }
      }]
    }
  },
  "type": "n8n-nodes-base.if",
  "typeVersion": 2
}
```

For string equality (carousel detection):

```json
{
  "leftValue":  "={{ $json.body.format }}",
  "rightValue": "carousel",
  "operator": { "type": "string", "operation": "equals" }
}
```

### Existing OpenAI Node Configuration (reference for carousel GPT-4o node)

```json
// Source: "🤖 GPT-4o — Texto" node in workflow.json
{
  "type": "@n8n/n8n-nodes-langchain.openAi",
  "typeVersion": 1.4,
  "parameters": {
    "model": "gpt-4o",
    "messages": {
      "values": [
        { "role": "system", "content": "..." },
        { "role": "user",   "content": "=..." }
      ]
    },
    "options": { "temperature": 0.75 }
  },
  "credentials": {
    "openAiApi": { "id": "openai-credentials", "name": "OpenAI" }
  }
}
```

The carousel GPT-4o node uses `temperature: 0.7` (slightly lower than 0.75) to reduce creativity-induced slide count errors while maintaining content variety.

### n8n Expression Syntax in User Message (OpenAI node)

```
// n8n expressions work inside OpenAI node parameter strings
"=Tema: \"{{ $json.body.topic }}\"\nSlides: {{ $json.body.num_images }}"

// Note the "=" prefix — required for n8n to evaluate expressions
// Jinja-style {% if %} blocks work in the OpenAI node user message:
"{% if $json.body.angle %}Ángulo: {{ $json.body.angle }}\n{% endif %}"
```

This is confirmed from existing "GPT-4o — Texto" user message which uses the same `{% if %}` pattern.

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single GPT-4o call generates one instagram + facebook text | Two GPT-4o paths: existing (single post) + new carousel prompts path | Phase 2 | Single-post unchanged; carousel gets dedicated generation |
| image_prompts placeholder `[]` in brief | image_prompts populated with N slide objects | Phase 2 | Phase 3 can loop over image_prompts directly |

**No deprecated patterns** — Phase 2 adds a parallel path, never replacing existing nodes.

---

## Open Questions

1. **Where does the carousel path connect after "Parsear prompts carrusel"?**
   - What we know: Phase 3 will build a sequential image generation loop. The output of "Parsear prompts carrusel" needs to flow into Phase 3.
   - What's unclear: Phase 3's loop mechanism (n8n SplitInBatches? Loop node? Manual Code node loop?). This is out of Phase 2's scope.
   - Recommendation: Phase 2 ends at "Parsear prompts carrusel" with `image_prompts` array populated. Phase 3 connects from there. No placeholder connection needed — plan 02-02 should note this boundary explicitly.

2. **Should the carousel path also generate instagram + facebook captions?**
   - What we know: Phase 2 success criteria only require image prompts per slide. The existing single-post flow generates IG + FB captions.
   - What's unclear: Whether carousel posts also need a single IG caption (the carousel itself is one post, but the caption is global, not per-slide).
   - Recommendation: Add a second GPT-4o call (or extend the same call to return captions alongside image prompts) to generate a global IG caption + FB post for the carousel. This ensures the WhatsApp preview (Phase 3) can show the text alongside images. Flag this for plan 02-01 to include — it's likely needed for Phase 3 to work end-to-end.

3. **Temperature for carousel GPT-4o call?**
   - What we know: Existing text node uses 0.75. Higher temperature increases creativity but also increases JSON malformation risk.
   - What's unclear: Whether 0.7 is the right tradeoff.
   - Recommendation: Use 0.7 for initial implementation. If slide count errors appear in testing, drop to 0.5 (matching the troubleshooting guide in CLAUDE.md).

---

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis: `n8n/workflow.json` — full read, all 412 lines (confirmed node types, typeVersions, connection pattern, Code node patterns, OpenAI node configuration, IF node configuration, webhook body access pattern)
- Direct codebase analysis: `wizard/run.js` — confirmed brief JSON schema including carousel fields (`format`, `num_images`, `image_prompts`)
- `.planning/STATE.md` — confirmed decisions (sequential generation, Ideogram auto-set, n8n 2.14.2 restrictions)
- `.planning/PROJECT.md` — confirmed constraints (no $env in Code nodes, no require(), sequential over parallel)
- `.planning/ROADMAP.md` — confirmed Phase 2 success criteria and plan descriptions

### Secondary (MEDIUM confidence)

- n8n docs: IF node supports `string → equals` operator for `format === "carousel"` detection — confirmed from IF node documentation structure
- n8n community: JSON array extraction from OpenAI responses uses Code node with markdown strip regex — consistent with existing "Parsear contenido" implementation

### Tertiary (LOW confidence)

- GPT-4o behavior: 7-slide carousels may have style abbreviation in middle slides — based on known LLM behavior of compressing repeated constraints, not empirically tested in this codebase. Flagged as pitfall with mitigation.

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — all node types confirmed by reading actual workflow.json
- Architecture: HIGH — IF node branching pattern and Code node parsing patterns confirmed from existing nodes
- Pitfalls: HIGH (credential) / MEDIUM (GPT-4o slide count) / HIGH (IF data path) — credential issue confirmed from STATE.md blocker; slide count from LLM behavior patterns
- System prompt design: MEDIUM — structure and fields are well-reasoned, but actual GPT-4o compliance with exact slide count will need empirical validation in plan 02-02

**Research date:** 2026-04-04
**Valid until:** 2026-07-04 (90 days — n8n node types and OpenAI API stable; GPT-4o behavior may shift but core pattern won't)
