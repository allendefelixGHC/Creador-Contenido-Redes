# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03)

**Core value:** Generate complete carousel posts (multiple images + captions) in one wizard run, each slide with its own Ideogram-generated image with text overlay
**Current focus:** Phase 3 — n8n Image Generation + WhatsApp Preview

## Current Position

Phase: 3 of 3 (n8n Image Generation + WhatsApp Preview)
Plan: 1 of 3 in current phase
Status: In progress
Last activity: 2026-04-06 — Plan 03-01 complete: Ideogram carousel loop (4 nodes + connections)

Progress: [███████░░░] 70%

## Performance Metrics

**Velocity:**
- Total plans completed: 5
- Average duration: 2.6 min
- Total execution time: 13 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-wizard-carousel-flow | 2 | 3 min | 1.5 min |
| 02-n8n-content-generation | 2 | 8 min | 4 min |
| 03-n8n-image-generation-whatsapp-preview | 1 | 2 min | 2 min |

**Recent Trend:**
- Last 5 plans: 2.6 min
- Trend: baseline

*Updated after each plan completion*

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Project init: Ideogram v3 is default for all carousel slides (text-in-image accuracy 90-95%)
- Project init: AI decides carousel structure (narrative/listicle/step-by-step) — user never selects it
- Project init: Sequential image generation chosen over parallel (safer with rate limits)
- Project init: n8n 2.14.2 — no $env, no require() in Code nodes; must use HTTP Request nodes
- [Phase 01]: Ideogram v3 auto-set for all carousel slides — user never selects model for carousel
- [Phase 01]: Format step placed after PASO 2.5 so suggestSlideCount uses topic+type context
- [Phase 01]: ...(isCarousel && {...}) spread — zero extra fields for single-post, 14 fields for carousel
- [Phase 02]: Carousel GPT-4o call includes captions + all slide prompts in one call
- [Phase 02]: Each slide prompt is fully self-contained with all Propulsar style constraints
- [Phase 02]: Webhook path is /webhook/propulsar-content (not propulsar-content-v3)
- [Phase 02]: n8n workflow ID: Qql7mvYRxKBsPZ5t — uploaded via API, credentials linked manually
- [Phase 03-01]: SplitInBatches batchSize=1 — sequential Ideogram calls, loop back-edge is the key n8n loop pattern
- [Phase 03-01]: Collect Image URLs validates slide count vs num_images, strips query params from Ideogram URLs

### Pending Todos

None yet.

### Blockers/Concerns

- WhatsApp: YCloud sends images one at a time; carousel preview will be N separate messages (expected behavior, not a bug)
- n8n workflow updates can be pushed via API (N8N_API_KEY in .env) — credentials still require manual linking

## Session Continuity

Last session: 2026-04-06
Stopped at: Completed 03-01-PLAN.md — carousel Ideogram loop in workflow.json
Resume file: None
