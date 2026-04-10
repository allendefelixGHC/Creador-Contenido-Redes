# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** Generate complete social media posts (single or carousel) in one wizard run, with AI-generated images and WhatsApp preview — and now automatically publish to Instagram + Facebook after SI approval
**Current focus:** v1.1 — Phase 4: Azure Blob Re-hosting

## Current Position

Milestone: v1.1 Automatic Publishing
Phase: 4 of 9 (Azure Blob Re-hosting)
Plan: 1 of 2 complete — Plan 02 Task 1 done (23d195d), Task 2 is checkpoint:human-verify awaiting Felix end-to-end tests
Status: In progress (Plan 04-02 in human-verify checkpoint)
Last activity: 2026-04-10 — Plan 04-02 Task 1 executed; main workflow.json wired to sub-workflow BIaG266Q6AZpv4Sq

Progress: [█░░░░░░░░░] ~8% (v1.1, 1/12 plans) — [██████████] 100% (v1.0 complete)

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

**By Phase (v1.1):**

| Phase | Plans | Status |
|-------|-------|--------|
| 4. Azure Blob Re-hosting | 2 | 1/2 complete — Plan 01 done (sub-workflow built + Azure verified); Plan 02 Task 1 done, Task 2 human-verify checkpoint pending |

**Plan execution history (v1.1):**

| Plan | Duration | Tasks | Files | Commits |
|------|----------|-------|-------|---------|
| 04-01 | ~4 min | 2 | 1 created | d41167d (Task 1, Azure pre-resolved), 052d129 (Task 2, sub-workflow JSON) |
| 04-02 | ~3 min (Task 1 only) | 1/2 (Task 2 pending human-verify) | 1 modified | 23d195d (Task 1, wire re-host sub-workflow BIaG266Q6AZpv4Sq into main) |

## Accumulated Context

### Decisions

Full decision log in PROJECT.md Key Decisions table.

Recent decisions relevant to v1.1:
- Meta tokens generated from Susana's account (not Felix) — Felix's Graph API returned empty `data` arrays
- All new IF nodes must use typeVersion 1 (IF v2/Switch v3 broken in n8n 2.14.2)
- `media_publish` retry MUST be disabled — not idempotent, retry creates duplicate live post
- Azure Blob public-access container (not SAS for reads) — SAS expiry breaks scheduled posts
- Azure prerequisites provisioned via Azure CLI + Azure MCP instead of Portal clicks (faster, reproducible, auto-verified) — Plan 04-01
- Azure SAS is container-scoped (`sr=c`) with `sp=cw`, expiry 2027-04-10, so one token covers all random UUID blob names — Plan 04-01
- Sub-workflow Build blob URL uses a Set node (not Code) to keep `{{ $env.* }}` references in expression fields — required by `N8N_BLOCK_ENV_ACCESS_IN_NODE=true` on the n8n Container App — Plan 04-01
- After creating an Azure storage account, rotate the primary key before signing SAS tokens (initial key fails with `Signature did not match`) — Plan 04-01
- [Phase 04]: Plan 04-02 uses Execute Workflow with mappingMode=passthrough (not defineBelow) because sub-workflow BIaG266Q6AZpv4Sq trigger uses inputSource=passthrough
- [Phase 04]: Merge Rehost Output uses Set node (not Code) to keep field re-attachment declarative and sidestep any $env-in-jsCode concern
- [Phase 04]: Execute Workflow node workflowId uses `__rl` object form (not plain string) — matches n8n 2.14.2 UI default export shape for reproducibility
- [Phase 04]: Sub-workflow imported via n8n public API (POST /api/v1/workflows) instead of manual UI import — orchestrator resolved the blocked SUBFLOW_ID dependency programmatically

### Pending Todos

None.

### Blockers/Concerns

- **Phase 8 prerequisite:** `min-replicas=1` must be verified in Azure Container Apps BEFORE Phase 8 is tested — scale-to-zero kills Wait node executions silently
- **Meta token lifetime:** Depends on Susana maintaining admin role on the Propulsar AI Facebook page
- **Azure AllowBlobPublicAccess:** RESOLVED 2026-04-10 — storage account `propulsarcontent`, container `posts`, SAS `sp=cw sr=c se=2027-04-10`, smoke-tested PUT 201 + anonymous GET 200
- **Plan 04-01 manual follow-up:** RESOLVED 2026-04-10 — orchestrator imported `n8n/subworkflow-rehost-images.json` via n8n public API, ID `BIaG266Q6AZpv4Sq` baked into main workflow.json in commit `23d195d`.
- **Plan 04-02 human-verify checkpoint (Task 2):** Felix must (1) import the updated `n8n/workflow.json` via n8n UI and activate, (2) run Test A (single post + 2h persistence re-check), (3) run Test B (5-slide carousel ordering), (4) run Test C (SAS-tampering abort path) — all three mandatory. Checklist with fields to fill in is in `.planning/phases/04-azure-blob-re-hosting/04-02-SUMMARY.md`. Phase 4 is NOT complete until all three tests are marked PASS.

## Session Continuity

Last session: 2026-04-10
Stopped at: Plan 04-02 Task 1 committed (23d195d). Task 2 is checkpoint:human-verify — Felix must import workflow.json, activate, and run Tests A+B+C end-to-end before Plan 04-02 and Phase 4 can be marked complete.
Resume file: .planning/phases/04-azure-blob-re-hosting/04-02-SUMMARY.md (fill in test results) then orchestrator can mark Phase 4 complete
