---
phase: 02-n8n-content-generation
plan: 01
subsystem: api
tags: [n8n, gpt-4o, workflow, carousel, ideogram, openai]

# Dependency graph
requires:
  - phase: 01-wizard-carousel-flow
    provides: "Wizard sends carousel briefs with format=carousel and num_images fields"
provides:
  - "IF node '🔀 ¿Carrusel?' detecting carousel vs single-post briefs"
  - "GPT-4o node generating per-slide image prompts with AI-chosen structure and Propulsar visual identity"
  - "Code node parsing carousel GPT output into image_prompts array + captions"
  - "Rewired connection graph: Webhook → IF → carousel path OR single-post path"
affects: [03-carousel-image-generation, 04-carousel-publish]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "IF node carousel detection using $json.body.format === 'carousel'"
    - "GPT-4o returning pure JSON with estructura + slides array + captions in one call"
    - "Code node uses $('🎯 Webhook Trigger') for original brief data access (same pattern as existing Parsear contenido)"
    - "Temperature 0.7 for carousel GPT-4o (slightly lower than 0.75 single-post to reduce JSON malformation)"

key-files:
  created: []
  modified:
    - n8n/workflow.json

key-decisions:
  - "All style constraints embedded inline in each slide prompt — no 'same as above' shortcuts (prevents prompt stacking failures)"
  - "console.warn (not throw) when slide count mismatches — preview-and-approve flow handles errors gracefully"
  - "Carousel Code node left as terminal (no outgoing connections) — Phase 3 will connect from here"
  - "Caption generation (instagram_caption + facebook_caption) included in carousel GPT-4o call — avoids extra LLM call in Phase 3"

patterns-established:
  - "Carousel GPT-4o output shape: { estructura, instagram_caption, facebook_caption, slides: [{slide_num, texto_overlay, prompt}] }"
  - "Carousel Code node output mirrors single-post Parsear contenido shape: instagram/facebook caption objects + extended fields"

# Metrics
duration: 4min
completed: 2026-04-04
---

# Phase 02 Plan 01: n8n Carousel Branch Summary

**IF + GPT-4o + Code nodes added to n8n workflow routing carousel briefs to per-slide prompt generation with AI structure selection, Propulsar visual identity, and captions in one call**

## Performance

- **Duration:** 4 min
- **Started:** 2026-04-04T15:00:04Z
- **Completed:** 2026-04-04T15:04:00Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Added 3 new nodes forming the complete carousel detection branch (IF, GPT-4o, Code)
- Rewired Webhook Trigger to fan out to IF node instead of directly to GPT-4o — Texto
- Single-post path (GPT-4o — Texto → Parsear contenido → downstream) left completely unchanged
- Carousel GPT-4o system prompt enforces per-slide prompt completeness, AI structure choice, Propulsar identity, and caption generation in a single LLM call

## Task Commits

Both tasks modified the same file and were committed atomically:

1. **Task 1 + Task 2: Add nodes and rewire connections** - `9cc3d27` (feat)

**Plan metadata:** (docs commit — created below)

## Files Created/Modified

- `n8n/workflow.json` - Added 3 nodes (IF carousel detection, GPT-4o carousel prompts, Code parser); rewired Webhook Trigger connection; version bumped to 3.1

## Decisions Made

- **Inline style in every prompt**: Each `prompt` field contains the full Propulsar visual identity specification. Alternative of referencing a shared style was rejected — GPT-4o sometimes ignores external context when generating arrays, leading to inconsistent slide images.
- **console.warn not throw for slide count mismatch**: The preview-and-approve WhatsApp flow means the user will see if the count is wrong and can reject. A hard throw would break the flow for no recoverable benefit.
- **Captions in carousel GPT-4o call**: Including `instagram_caption` and `facebook_caption` in the same call as slide prompts avoids a second LLM call in Phase 3 and keeps topic context fresh.
- **Terminal carousel Code node**: Phase 3 will add the image generation loop from here. Left disconnected deliberately so Phase 3 has a clean attachment point.

## Deviations from Plan

### Auto-fixed Issues

None — plan executed exactly as written.

### Note on Node Count

Plan predicted 15 original nodes + 3 = 18 total. Actual original was 19 nodes (plan referenced an older version count). Result: 22 nodes. All 3 new nodes added correctly; this is a documentation discrepancy, not an execution issue.

## Issues Encountered

None.

## User Setup Required

**External services require manual configuration after workflow upload to n8n Azure:**

1. Open n8n Azure workflow editor
2. Double-click the **"🎠 GPT-4o — Prompts Carrusel"** node
3. In the Credentials section, select your OpenAI credential from the dropdown
4. Save the node

This is the same credential linking step required for the existing "🤖 GPT-4o — Texto" node. The placeholder credential ID `"openai-credentials"` in the JSON will not auto-resolve on upload.

## Next Phase Readiness

- Carousel branch is complete through GPT-4o prompt generation
- "🔧 Parsear prompts carrusel" is terminal and ready for Phase 3 to connect image generation loop
- Output shape from carousel Code node: `{ instagram: {caption}, facebook: {caption}, image_prompts: [{slide_num, texto_overlay, prompt}], format: 'carousel', num_images, estructura, ... }`
- Phase 3 will iterate over `image_prompts` array to generate one Ideogram image per slide

## Self-Check: PASSED

- `n8n/workflow.json` — FOUND
- `.planning/phases/02-n8n-content-generation/02-01-SUMMARY.md` — FOUND
- Commit `9cc3d27` — FOUND

---
*Phase: 02-n8n-content-generation*
*Completed: 2026-04-04*
