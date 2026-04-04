# Roadmap: Propulsar Content Engine — Carousel Support

## Overview

This milestone extends the existing single-image pipeline to support Instagram carousel posts. The work moves in dependency order: first the Wizard gains carousel awareness (testable locally without touching n8n), then n8n learns to generate carousel-specific text and image prompts, then n8n generates all slide images sequentially and previews the full set via WhatsApp. The existing single-post flow is never broken.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Wizard Carousel Flow** - Add carousel format selection and slide configuration to wizard/run.js, keeping single-post flow intact (completed 2026-04-04)
- [ ] **Phase 2: n8n Content Generation** - Extend n8n to generate per-slide image prompts and choose carousel structure via GPT-4o
- [ ] **Phase 3: n8n Image Generation + WhatsApp Preview** - Generate all carousel images sequentially via Ideogram and send each one via WhatsApp for preview

## Phase Details

### Phase 1: Wizard Carousel Flow
**Goal**: Users can choose carousel format in the Wizard and configure the number of slides, with the correct brief JSON produced automatically — while single-post runs continue to work exactly as before
**Depends on**: Nothing (first phase — all changes are local to wizard/run.js)
**Requirements**: WIZ-01, WIZ-02, WIZ-03, WIZ-04, WIZ-05, WIZ-06
**Success Criteria** (what must be TRUE):
  1. Running `node wizard/run.js` presents a format choice between single post and carousel before any other carousel-specific question
  2. When carousel is chosen, the Wizard suggests an optimal slide count based on topic and type, and the user can accept or override (3-10 range)
  3. The brief JSON sent to the webhook includes `num_images` and an `image_prompts` array placeholder when carousel is selected, and `has_text_in_image: true` with `image_model: "ideogram"` automatically
  4. Running through the single-post flow produces exactly the same JSON as before (no new fields, no changed behavior)
**Plans**: TBD

Plans:
- [ ] 01-01: Add suggestSlideCount function, format selection step, and carousel image-model bypass to wizard/run.js
- [ ] 01-02: Update brief JSON with conditional spread for carousel fields, update summary screen, add suggest-slides to step.js

### Phase 2: n8n Content Generation
**Goal**: n8n receives a carousel brief and GPT-4o generates one contextual image prompt per slide, choosing the right carousel structure (narrative, listicle, step-by-step, etc.) and applying Propulsar's visual style to every prompt
**Depends on**: Phase 1
**Requirements**: GEN-01, GEN-02, GEN-03
**Success Criteria** (what must be TRUE):
  1. When n8n receives a carousel brief, GPT-4o returns exactly N image prompts (matching num_images), each containing the slide text overlay and visual direction
  2. The carousel structure type (narrative / listicle / step-by-step) is chosen by the AI based on the topic and post type — the user never selects it manually
  3. Every image prompt specifies Propulsar's visual identity: dark background #1a1a2e, purple-magenta gradient accents, bold Spanish text — no prompt omits these style constraints
**Plans**: TBD

Plans:
- [ ] 02-01: Add carousel branch in n8n workflow triggered by num_images > 1; build GPT-4o prompt that generates N image prompts with structure selection
- [ ] 02-02: Validate prompt outputs match num_images count; add style enforcement to system prompt; test with 3, 5, and 7 slide inputs

### Phase 3: n8n Image Generation + WhatsApp Preview
**Goal**: n8n generates all carousel images sequentially via Ideogram and delivers each image to WhatsApp as a preview, keeping the existing approval gate intact
**Depends on**: Phase 2
**Requirements**: IMG-01, IMG-02, WA-01, WA-02
**Success Criteria** (what must be TRUE):
  1. n8n generates exactly N Ideogram images (one per slide) sequentially, without skipping slides or duplicating any
  2. All image URLs are normalized and accessible before any WhatsApp message is sent
  3. Every carousel image arrives on WhatsApp as a separate message in order (slide 1 first, slide N last), so the user sees the full carousel before approving
  4. The SI/NO approval flow works identically to single-post: one approval gate, one response, no carousel-specific changes required from the user
**Plans**: TBD

Plans:
- [ ] 03-01: Build sequential image generation loop in n8n (HTTP Request to Ideogram per slide, collect URLs)
- [ ] 03-02: Normalize all image URLs; update WhatsApp send logic to iterate through image array and send each image individually
- [ ] 03-03: Verify approval flow works end-to-end with carousel; confirm single-post path is unaffected

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Wizard Carousel Flow | 0/2 | Complete    | 2026-04-04 |
| 2. n8n Content Generation | 0/2 | Not started | - |
| 3. n8n Image Generation + WhatsApp Preview | 0/3 | Not started | - |
