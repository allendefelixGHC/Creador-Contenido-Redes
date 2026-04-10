# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** Generate complete social media posts (single or carousel) in one wizard run, with AI-generated images and WhatsApp preview before publication
**Current focus:** Planning v1.1 — Automatic Publishing to Instagram + Facebook

## Current Position

Milestone: v1.0 Carousel Support → SHIPPED 2026-04-10
Next: v1.1 Automatic Publishing (planning)

Status: Ready for `/gsd:new-milestone`

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.

### Pending Todos

None.

### Blockers/Concerns

- **Meta token lifetime:** The Page Access Token depends on Susana maintaining admin role on the Propulsar AI Facebook page. If she loses admin, token stops working.
- **Ideogram ephemeral URLs:** Images expire in 1-24h. v1.1 publishing must re-host images before calling Meta Graph API, otherwise posts will 404.

## Session Continuity

Last session: 2026-04-10
Stopped at: v1.0 milestone archived, ready to plan v1.1 (Automatic Publishing)
Resume file: None
