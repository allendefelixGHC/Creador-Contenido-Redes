# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** Generate complete social media posts (single or carousel) in one wizard run, with AI-generated images and WhatsApp preview — and now automatically publish to Instagram + Facebook after SI approval
**Current focus:** v1.1 — Phase 4: Azure Blob Re-hosting

## Current Position

Milestone: v1.1 Automatic Publishing
Phase: 4 of 9 (Azure Blob Re-hosting)
Plan: — (not yet planned)
Status: Ready to plan
Last activity: 2026-04-10 — v1.1 roadmap created (Phases 4-9)

Progress: [░░░░░░░░░░] 0% (v1.1) — [██████████] 100% (v1.0 complete)

## Performance Metrics

**Velocity (v1.0):**
- Total plans completed: 7
- v1.0 timeline: 2026-04-03 → 2026-04-06 (3 days)

**By Phase (v1.0):**

| Phase | Plans | Status |
|-------|-------|--------|
| 1. Wizard Carousel Flow | 2 | Complete |
| 2. n8n Content Generation | 2 | Complete |
| 3. n8n Image Generation + WA Preview | 3 | Complete |

*v1.1 metrics will populate as phases complete*

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.

Recent decisions relevant to v1.1:
- Meta tokens generated from Susana's account (not Felix) — Felix's Graph API returned empty `data` arrays
- All new IF nodes must use typeVersion 1 (IF v2/Switch v3 broken in n8n 2.14.2)
- `media_publish` retry MUST be disabled — not idempotent, retry creates duplicate live post
- Azure Blob public-access container (not SAS for reads) — SAS expiry breaks scheduled posts

### Pending Todos

None.

### Blockers/Concerns

- **Phase 8 prerequisite:** `min-replicas=1` must be verified in Azure Container Apps BEFORE Phase 8 is tested — scale-to-zero kills Wait node executions silently
- **Meta token lifetime:** Depends on Susana maintaining admin role on the Propulsar AI Facebook page
- **Azure AllowBlobPublicAccess:** Azure storage accounts created post-2023 have this disabled by default — must enable explicitly in Azure Portal before Phase 4

## Session Continuity

Last session: 2026-04-10
Stopped at: v1.1 roadmap created — 6 phases (4-9) defined, all 33 requirements mapped, ready to plan Phase 4
Resume file: None
