# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-03)

**Core value:** Generate complete carousel posts (multiple images + captions) in one wizard run, each slide with its own Ideogram-generated image with text overlay
**Current focus:** Phase 2 — n8n Content Generation

## Current Position

Phase: 2 of 3 (n8n Content Generation)
Plan: 2 of 3 in current phase
Status: In progress — plan 02-02 at checkpoint (Task 1 complete, awaiting human verify)
Last activity: 2026-04-04 — Plan 02-02 Task 1 executed (carousel test mode added to test-webhook.js)

Progress: [███░░░░░░░] 33%

## Performance Metrics

**Velocity:**
- Total plans completed: 3
- Average duration: 2.3 min
- Total execution time: 7 min

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| 01-wizard-carousel-flow | 2 | 3 min | 1.5 min |
| 02-n8n-content-generation | 1 | 4 min | 4 min |

**Recent Trend:**
- Last 5 plans: 2.3 min
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
- [Phase 01-wizard-carousel-flow]: Ideogram v3 auto-set for all carousel slides — user never selects model for carousel
- [Phase 01-wizard-carousel-flow]: Format step placed after PASO 2.5 so suggestSlideCount uses topic+type context
- [Phase 01-wizard-carousel-flow]: ...(isCarousel && {...}) spread as last item in brief — zero extra fields for single-post, 14 fields for carousel
- [Phase 01-wizard-carousel-flow]: step.js suggestSlideCount returns source field explicitly matching getTrendingTopics/getAngles convention
- [Phase 02-n8n-content-generation]: Carousel GPT-4o call includes captions + all slide prompts in one call — avoids extra LLM call in Phase 3
- [Phase 02-n8n-content-generation]: Each slide prompt is fully self-contained with all Propulsar style constraints — no cross-slide references

### Pending Todos

None yet.

### Blockers/Concerns

- n8n deploy: Each workflow upload requires manual OpenAI credential linking — must document in plan
- WhatsApp: YCloud sends images one at a time; carousel preview will be N separate messages (expected behavior, not a bug)

## Session Continuity

Last session: 2026-04-04
Stopped at: Checkpoint in 02-n8n-content-generation/02-02-PLAN.md — Task 2 requires human verification in n8n
Resume file: None
