# Milestones

## v1.0 Carousel Support (Shipped: 2026-04-10)

**Phases:** 3 | **Plans:** 7 | **Timeline:** 2026-04-03 → 2026-04-06 (3 days)

**Delivered:** Multi-slide Instagram carousel support with AI-generated images, text overlays, and WhatsApp preview — while preserving the existing single-post pipeline untouched.

**Key accomplishments:**
1. Wizard format selector (single post vs carousel) with suggested slide count based on topic/type
2. Carousel-specific brief JSON with `num_images` and per-slide Ideogram prompts from GPT-4o
3. AI-chosen carousel structure (narrative/listicle/step-by-step) — user never selects manually
4. Sequential Ideogram v3 generation with Propulsar visual identity embedded in every slide prompt
5. Individual WhatsApp image previews (one message per slide) + text summary with SI/NO approval
6. Single-post path now also sends image preview before text (quality improvement discovered during verification)
7. Full workaround suite for n8n 2.14.2 bugs: IF v1 chains instead of IF v2/Switch v3, SplitInBatches removed

**Archive:** [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) | [v1.0-REQUIREMENTS.md](milestones/v1.0-REQUIREMENTS.md)

---
