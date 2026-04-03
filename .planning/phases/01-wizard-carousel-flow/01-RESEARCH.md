# Phase 1: Wizard Carousel Flow - Research

**Researched:** 2026-04-03
**Domain:** Node.js CLI interactive wizard (readline), JSON schema extension, backward-compatible feature addition
**Confidence:** HIGH

---

## Summary

Phase 1 is a pure Node.js CLI modification — no new dependencies, no external APIs beyond what already exists. The entire scope lives in `wizard/run.js` (and mirrors in `wizard/step.js`). The task is to insert a format-selection step before the existing image-model step, branch the flow conditionally for carousel, add an AI slide count suggestion via the already-present Anthropic API call, and produce an extended brief JSON that n8n can act on in Phase 2.

The codebase uses Node.js built-ins only (`readline`, `https`, `http`, `dotenv`). No framework, no test runner, no TypeScript. All interactivity is handled through a homegrown `ask()` wrapper around `readline.question`. The existing `suggestAngles()` and `getTrendingTopics()` calls already demonstrate the API-call-then-fallback pattern that the slide-count suggestion should follow.

**Primary recommendation:** Insert a `PASO 1.5 — Formato` step after topic/type/angle are collected (so the AI slide count suggestion can be informed by topic and type) and before the image model step. For carousels, bypass the manual `hasTextInImage` question and the model selector entirely — Ideogram becomes fixed. For single posts, skip all carousel questions. The brief JSON gains `format`, `num_images`, and `image_prompts` fields only when `format === "carousel"`.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `readline` | built-in (Node ≥18) | Interactive terminal prompts | Already used via `ask()` helper |
| `dotenv` | ^16.4.5 (already installed) | Load `.env` into `process.env` | Already in package.json |
| `https` / `http` | built-in | HTTP calls to Anthropic/Perplexity | Already used via `httpPost()` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None needed | — | — | No new deps required for this phase |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Built-in readline + `ask()` | `inquirer`, `prompts`, `enquirer` | External libs would simplify multi-select/validation but add a dependency; existing pattern is consistent with the rest of the file and sufficient |
| Inline slide-count suggestion | Separate step.js command | step.js has a `suggest-model` command pattern; a `suggest-slides` command could be added for non-interactive use, but interactive wizard only needs it inline |

**Installation:** No new packages needed.

---

## Architecture Patterns

### Existing Flow Structure (wizard/run.js)

```
runWizard()
  ├── PASO 1 — Tema           (topic)
  ├── PASO 2 — Tipo           (type)
  ├── PASO 2.5 — Ángulos      (AI call → chosenAngle)
  ├── PASO 3 — Plataformas    (platforms)
  ├── PASO 4 — Imagen         (hasTextInImage → suggestModel → imageModel)
  ├── Resumen
  ├── Confirmar → sendWebhook(brief)
  └── brief = { topic, type, angle, platforms, image_model, fal_model_id,
                has_own_image, image_url, has_text_in_image,
                approval_number, timestamp }
```

### Pattern 1: Conditional Branch After Shared Steps

**What:** Insert format choice (single vs carousel) after PASO 2.5 (angle), so the suggestion can use `topic` and `type`. Branch the remaining flow based on `format`.

**When to use:** When a new feature reuses existing context (topic, type) to make a smart suggestion.

```javascript
// After chosenAngle is set:

// PASO 3 — FORMATO
div();
console.log(c("bright", "  PASO 3 — Formato\n"));
const fmtChoice = await ask(
  `  [1] Post normal     — 1 imagen, flujo actual\n` +
  `  [2] Carrusel        — múltiples slides con imagen por slide\n` +
  `  → `
);
const isCarousel = fmtChoice.trim() === "2";

let numImages = 1;
if (isCarousel) {
  // AI suggestion + user override (3-10)
  numImages = await pickSlideCount(topic, type);
}
```

**Note:** Renumber subsequent PASOs: current PASO 3 (plataformas) becomes PASO 4, current PASO 4 (imagen) becomes PASO 5 for single post only.

### Pattern 2: AI Slide Count Suggestion (mirrors suggestAngles)

**What:** Call Anthropic API with topic + type, ask for optimal slide count (integer 3-10) with reasoning. Fall back to 5 if call fails.

```javascript
async function suggestSlideCount(topic, postType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const FALLBACK = { count: 5, reason: "Cantidad estándar para carruseles educativos" };
  if (!apiKey) return FALLBACK;
  try {
    const data = await httpPost(
      "https://api.anthropic.com/v1/messages",
      JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        messages: [{
          role: "user",
          content: `Eres estratega de contenido para Instagram. Para un post "${postType}" sobre "${topic}", ¿cuántos slides tiene el carrusel ideal? Rango: 3-10. Solo JSON: {"count": 5, "reason": "1 frase"}`
        }]
      }),
      { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
    );
    const txt = data.content?.[0]?.text || "";
    const parsed = JSON.parse(txt.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim());
    const count = Math.min(10, Math.max(3, parseInt(parsed.count) || 5));
    return { count, reason: parsed.reason || "" };
  } catch {
    return FALLBACK;
  }
}
```

### Pattern 3: Carousel Branch — Skip Image Model Step

**What:** When `isCarousel === true`, skip the `hasTextInImage` question and model selector entirely. Set `image_model: "ideogram"`, `has_text_in_image: true`, `fal_model_id: "fal-ai/ideogram/v3"` automatically.

```javascript
let imageModel, falModelId, hasTextInImage, imageUrl, hasOwnImage;

if (isCarousel) {
  // Fixed per project decision: Ideogram v3 for all carousel slides
  imageModel     = "ideogram";
  falModelId     = "fal-ai/ideogram/v3";
  hasTextInImage = true;
  hasOwnImage    = false;
  imageUrl       = null;
  console.log(c("green", "\n  ✓ Modelo fijo para carruseles: 🔤 Ideogram v3 (texto en imagen)"));
  console.log(c("gray",  "     Precisión tipográfica 90-95% — ideal para slides con texto\n"));
} else {
  // Existing PASO 4 logic verbatim (no changes)
  // ...
}
```

### Pattern 4: Brief JSON Extension (carousel only)

**What:** Add carousel-specific fields to the brief JSON only when `format === "carousel"`. Single-post brief is structurally identical to today — no extra fields.

```javascript
const brief = {
  topic,
  type,
  angle: chosenAngle,
  platforms,
  image_model:       imageModel,
  fal_model_id:      falModelId,
  has_own_image:     hasOwnImage,
  image_url:         imageUrl,
  has_text_in_image: hasTextInImage,
  approval_number:   process.env.WHATSAPP_APPROVAL_NUMBER,
  timestamp:         new Date().toISOString(),
  // Carousel-only fields (absent for single post):
  ...(isCarousel && {
    format:         "carousel",
    num_images:     numImages,
    image_prompts:  [],   // placeholder; Phase 2 (n8n GPT-4o) fills this
  }),
};
```

For single post, the spread `...(false && {...})` produces nothing — JSON remains exactly as before.

### Pattern 5: step.js Parallel Update

**What:** `wizard/step.js` is the non-interactive API twin of `run.js`. It needs a `suggest-slides <topic> <type>` command added, mirroring the `suggest-model` command. This keeps the two files in sync for testing and future UI use.

```javascript
} else if (step === "suggest-slides") {
  const topic    = process.argv[3];
  const postType = process.argv[4] || "educational";
  const result   = await suggestSlideCount(topic, postType);
  console.log(JSON.stringify(result));
}
```

### Anti-Patterns to Avoid

- **Modifying the single-post brief shape:** Never add `format: "single"`, `num_images: 1`, or `image_prompts: []` to single-post briefs. n8n Phase 2 must distinguish by presence/absence of `format` field, not by value.
- **Asking `hasTextInImage` for carousel:** The decision is already locked — always `true`. Don't ask.
- **Enforcing slide count via hard-coded ranges in multiple places:** Keep the `Math.min(10, Math.max(3, ...))` clamp in one helper function. The ask prompt should mention the range, but validation lives in one spot.
- **Duplicating IMAGE_MODELS between run.js and step.js:** Both files currently duplicate this object. Don't extract to a shared module in this phase — that's a separate refactor and adds risk to a working system.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Clamping user input to integer range | Custom regex parser | `Math.min(10, Math.max(3, parseInt(input) || 5))` | One line, handles NaN/empty/out-of-range |
| Retry on Anthropic API failure | Retry loop | `try/catch` → return fallback | The existing pattern (getTrendingTopics, suggestAngles) proves this is sufficient |
| Validating webhook JSON | Schema library | Manual field check before `sendWebhook` | No new library needed for 2 fields |

**Key insight:** The codebase has zero dependencies beyond `dotenv`. Adding any new dependency for a 3-plan CLI addition would be disproportionate.

---

## Common Pitfalls

### Pitfall 1: Backward Compatibility Regression

**What goes wrong:** Adding `format: "single"` or `num_images: 1` to single-post briefs causes n8n Phase 2 to misroute (or requires a second condition check instead of a simple presence check on `format`).

**Why it happens:** Instinct to "make the schema complete" by always including all fields.

**How to avoid:** Use conditional spread `...(isCarousel && {...})`. Test with `node scripts/test-webhook.js` after changes — verify the JSON in output contains none of the carousel keys.

**Warning signs:** Brief JSON for single post has more than 10 keys.

### Pitfall 2: Step Numbering Inconsistency

**What goes wrong:** Inserting a new "PASO 3 — Formato" step but leaving existing "PASO 3 — Plataformas" and "PASO 4 — Imagen" labels as-is produces confusing UI (two PASO 3s).

**Why it happens:** Adding a step without renumbering subsequent ones.

**How to avoid:** When inserting format step after PASO 2.5, shift: old PASO 3 → PASO 4, old PASO 4 → PASO 5 (single) / skip (carousel shows a different path).

**Warning signs:** Console output shows duplicate PASO numbers.

### Pitfall 3: Slide Count Validation Gap

**What goes wrong:** User types "2" or "11" or "abc" — slide count goes outside 3-10, which breaks Phase 2 n8n logic (loops sized on this number).

**Why it happens:** Trusting `parseInt` without clamping.

**How to avoid:** Always clamp: `Math.min(10, Math.max(3, parseInt(input) || suggestedCount))`. Use suggested count as fallback when input is invalid (not hardcoded 5, so the AI suggestion is honored on bad input).

**Warning signs:** `numImages` is 0, NaN, or >10 in the brief JSON.

### Pitfall 4: API Key Absent = Hard Crash

**What goes wrong:** `ANTHROPIC_API_KEY` is missing → `suggestSlideCount` throws before reaching the fallback.

**Why it happens:** Forgetting to gate the API call behind `if (!apiKey) return FALLBACK`.

**How to avoid:** Follow the exact same guard pattern used in `suggestAngles()` and `getTrendingTopics()`.

**Warning signs:** Wizard crashes at slide-count step when running without `.env`.

### Pitfall 5: Summary Screen Missing Carousel Fields

**What goes wrong:** The summary block before "¿Generar y enviar?" doesn't show carousel info (slides count, model lock), so user can't review what they're sending.

**Why it happens:** Summary block isn't updated to branch on `isCarousel`.

**How to avoid:** Add carousel block to summary:
```javascript
if (isCarousel) {
  console.log(`  📊 Formato:     Carrusel — ${numImages} slides`);
  console.log(`  🖼️  Modelo:      🔤 Ideogram v3 (fijo para carruseles)`);
} else {
  // existing model line
}
```

---

## Code Examples

### Current brief JSON (single post — must remain unchanged)

```json
{
  "topic": "Agentes de IA autónomos",
  "type": "educational",
  "angle": "Guía paso a paso para implementarlo hoy",
  "platforms": ["instagram", "facebook"],
  "image_model": "flux",
  "fal_model_id": "fal-ai/flux-pro/v1.1",
  "has_own_image": false,
  "image_url": null,
  "has_text_in_image": false,
  "approval_number": "34612345678",
  "timestamp": "2026-04-03T10:00:00.000Z"
}
```

### Target brief JSON (carousel)

```json
{
  "topic": "Agentes de IA autónomos",
  "type": "educational",
  "angle": "Guía paso a paso para implementarlo hoy",
  "platforms": ["instagram", "facebook"],
  "image_model": "ideogram",
  "fal_model_id": "fal-ai/ideogram/v3",
  "has_own_image": false,
  "image_url": null,
  "has_text_in_image": true,
  "approval_number": "34612345678",
  "timestamp": "2026-04-03T10:00:00.000Z",
  "format": "carousel",
  "num_images": 5,
  "image_prompts": []
}
```

`image_prompts` is an empty array here — Phase 2 (n8n GPT-4o) fills it. The field must be present so n8n can detect carousel intent even before prompts are generated.

### Anthropic API call signature (already used in codebase)

```javascript
// Source: existing wizard/run.js suggestAngles()
const data = await httpPost(
  "https://api.anthropic.com/v1/messages",
  JSON.stringify({
    model: "claude-sonnet-4-20250514",
    max_tokens: 100,
    messages: [{ role: "user", content: "..." }],
  }),
  { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
);
const txt = data.content?.[0]?.text || "";
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| N/A — this is new functionality | Conditional spread for backward compatibility | Phase 1 | n8n doesn't need to change to handle old briefs |

**No deprecated patterns apply** — this phase adds to an existing, working flow without replacing anything.

---

## Open Questions

1. **Where in the flow should format be asked?**
   - What we know: Format choice needs topic + type to power the AI slide count suggestion. It must come before the image model step.
   - What's unclear: Should it come before or after the angle step (PASO 2.5)? Angle doesn't affect slide count, so format could go before or after it.
   - Recommendation: Place format after PASO 2.5 (angle already uses topic + type, and the slide count suggestion reuses the same context). This keeps all AI-call steps grouped together and avoids making the user choose format before seeing angle options.

2. **Should `image_prompts: []` be present in the carousel brief, or absent?**
   - What we know: Phase 2 (n8n) needs to know it's a carousel. It can detect via `format === "carousel"` OR via presence of `image_prompts`.
   - What's unclear: Which detection method Phase 2 will use.
   - Recommendation: Include `image_prompts: []` as an explicit empty array. Phase 2 can populate it. Detection via `format` field is cleaner, but the array signals intent explicitly and allows n8n to check both.

3. **Does step.js need the `suggest-slides` command for Phase 1 to succeed?**
   - What we know: Phase 1 success criteria only reference `wizard/run.js`. step.js is the non-interactive twin used for testing/future integrations.
   - What's unclear: Whether the plans (01-01, 01-02, 01-03) scope step.js updates.
   - Recommendation: Update step.js in the same plan that adds `suggestSlideCount` to run.js (plan 01-02). It's a 10-line addition and prevents the two files from diverging. Treat it as part of the same atomic task.

---

## Sources

### Primary (HIGH confidence)

- Direct codebase analysis: `wizard/run.js` — full read, all 391 lines (confirmed patterns, existing API calls, brief schema)
- Direct codebase analysis: `wizard/step.js` — full read, all 223 lines (confirmed step command pattern)
- `.planning/PROJECT.md` — confirmed constraints, key decisions, out-of-scope items
- `.planning/ROADMAP.md` — confirmed phase plans and success criteria
- `package.json` — confirmed Node ≥18 requirement, no relevant existing dependencies

### Secondary (MEDIUM confidence)

- Anthropic API: `https://api.anthropic.com/v1/messages` endpoint behavior confirmed by existing working code in `suggestAngles()` — same endpoint will be used for `suggestSlideCount()`

### Tertiary (LOW confidence)

- None — all findings derive from codebase inspection and confirmed working patterns

---

## Metadata

**Confidence breakdown:**
- Standard Stack: HIGH — no new dependencies; existing stack confirmed by working code
- Architecture: HIGH — insertion pattern is identical to existing PASO 2.5 addition; confirmed by codebase analysis
- Pitfalls: HIGH — derived from actual code patterns and the stated backward-compatibility requirement
- Brief schema: HIGH — current shape confirmed by reading sendWebhook call in run.js

**Research date:** 2026-04-03
**Valid until:** Stable — 90 days (pure local Node.js, no external API changes affect this phase)
