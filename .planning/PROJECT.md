# Propulsar Content Engine — Carousel Support

## What This Is

Extension of the existing Propulsar Content Engine v3 to support Instagram carousel posts (multi-image). The Wizard and n8n workflow currently generate single-image posts. This adds the ability to generate carousels with 1-10 slides, each with its own AI-generated image with text overlay, following Propulsar's visual identity (dark backgrounds, purple-magenta gradients, bold Spanish text).

## Core Value

Generate complete carousel posts (multiple images + captions) in one wizard run, with each slide having a unique AI-generated image with contextual text overlay — ready for Instagram publication.

## Requirements

### Validated

- ✓ Single-image post generation via Wizard + n8n — existing
- ✓ GPT-4o text generation for Instagram + Facebook captions — existing
- ✓ Image generation via Flux 2 Pro, Ideogram v3, Nano Banana Pro — existing
- ✓ WhatsApp preview and approval flow — existing
- ✓ Webhook communication between Wizard and n8n — existing

### Active

- [ ] Wizard asks format: single post or carousel
- [ ] Wizard asks number of slides for carousel (3-10, default 5)
- [ ] For carousels, has_text_in_image is always true (Ideogram default)
- [ ] GPT-4o generates one image prompt per slide with text overlay content
- [ ] AI chooses carousel structure based on topic/type (narrative, listicle, step-by-step, etc.)
- [ ] n8n generates N images in parallel or sequence (one per slide)
- [ ] All carousel images sent via WhatsApp as preview
- [ ] Brief JSON includes num_images and image_prompts array
- [ ] Single post flow remains unchanged (backward compatible)

### Out of Scope

- Frontend/dashboard UI — separate project, will be built after
- Instagram API carousel publishing — requires separate Meta API integration
- Video slides — only static images for now
- Manual text editing per slide in Wizard — AI decides all content

## Context

- Existing codebase: Wizard (wizard/run.js) + n8n workflow on Azure Container App
- n8n 2.14.2 blocks $env access and require('https') in Code nodes — all API calls must use HTTP Request nodes with hardcoded keys or this.helpers.httpRequest
- Propulsar visual style: dark background #1a1a2e, purple-magenta gradients, bold readable typography in Spanish
- Ideogram v3 is best for text-in-image (90-95% accuracy) — default for carousels
- Current workflow ID in n8n changes with each upload (API deploy pattern)
- OpenAI credential must be manually linked after each workflow upload

## Constraints

- **n8n restrictions**: No $env, no require() in Code nodes. Use HTTP Request nodes or this.helpers.httpRequest
- **API costs**: Each carousel image costs $0.06 (Ideogram). A 7-slide carousel = ~$0.42
- **WhatsApp**: YCloud API sends images one at a time, no native carousel preview
- **n8n deploy**: Each workflow upload requires manual OpenAI credential linking

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Ideogram as default for carousels | Best text-in-image accuracy (90-95%), essential for slides with overlay text | — Pending |
| AI decides slide structure | User wants full automation, AI chooses narrative/listicle/steps based on topic | — Pending |
| Both single and carousel available | User wants flexibility, not all content needs to be carousel | — Pending |
| 3-10 slides range | Instagram allows up to 10, minimum 3 for meaningful carousel | — Pending |

---
*Last updated: 2026-04-03 after initialization*
