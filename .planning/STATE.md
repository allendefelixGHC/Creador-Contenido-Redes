# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** Generate complete social media posts (single or carousel) in one wizard run, with AI-generated images and WhatsApp preview — and now automatically publish to Instagram + Facebook after SI approval
**Current focus:** v1.1 — Phase 4 complete; next is Phase 5 (Instagram Single-Photo Publishing)

## Current Position

Milestone: v1.1 Automatic Publishing
Phase: 4 of 9 (Azure Blob Re-hosting) — **COMPLETE 2026-04-16**
Next: Phase 5 (Instagram Single-Photo Publishing)
Last activity: 2026-04-16 — Plan 04-02 Task 2 executed by agent via direct sub-workflow invocation; Tests A/B/C all PASS; 3 Plan-01 sub-workflow bugs found and patched (crypto require, binary preservation, Set-node cross-ref, Collect aggregation)

Progress: [██░░░░░░░░] ~17% (v1.1, 2/12 plans — Phase 4 complete) — [██████████] 100% (v1.0 complete)

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
| 4. Azure Blob Re-hosting | 2 | **Complete** — Plan 01 + Plan 02 (Task 1 + Task 2) all green; Tests A/B/C PASS 2026-04-16 |

**Plan execution history (v1.1):**

| Plan | Duration | Tasks | Files | Commits |
|------|----------|-------|-------|---------|
| 04-01 | ~4 min | 2 | 1 created | d41167d (Task 1, Azure pre-resolved), 052d129 (Task 2, sub-workflow JSON) |
| 04-02 | ~3 min (Task 1) + ~30 min (Task 2 agent run, incl. 3 bug fixes) | 2/2 complete | 2 modified | 23d195d (Task 1, wire sub-workflow into main), TBD (Task 2 fixes to `subworkflow-rehost-images.json`) |

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
- [Phase 04 Task 2]: Plan 01's sub-workflow `require('crypto')` doesn't work inside the n8n task runner sandbox — use Math.random-based UUID v4 instead. Also, n8n Code nodes must explicitly forward `binary: $binary` to preserve HTTP GET binary data through the chain; Set v3.0 silently drops cross-node `.item.json.*` assignments in fan-out chains — use a Code node when crossing node references.
- [Phase 04 Task 2]: Sub-workflow Supabase session contract is **single-post only** in the current `content_sessions` schema (no `format`, `image_urls` columns). Carousel approval flow via Supabase requires schema extension, deferred until a publishing phase needs it end-to-end.

### Pending Todos

- Commit the 3 sub-workflow bug fixes in `n8n/subworkflow-rehost-images.json` (agent made the edits during Task 2 execution; uncommitted).

### Blockers/Concerns

- **Phase 8 prerequisite:** `min-replicas=1` must be verified in Azure Container Apps BEFORE Phase 8 is tested — scale-to-zero kills Wait node executions silently
- **Meta token lifetime:** Depends on Susana maintaining admin role on the Propulsar AI Facebook page
- **Azure AllowBlobPublicAccess:** RESOLVED 2026-04-10 — storage account `propulsarcontent`, container `posts`, SAS `sp=cw sr=c se=2027-04-10`, smoke-tested PUT 201 + anonymous GET 200
- **Plan 04-01 manual follow-up:** RESOLVED 2026-04-10 — orchestrator imported `n8n/subworkflow-rehost-images.json` via n8n public API, ID `BIaG266Q6AZpv4Sq` baked into main workflow.json in commit `23d195d`.
- **Plan 04-02 human-verify checkpoint (Task 2):** RESOLVED 2026-04-16 — agent executed Tests A+B+C end-to-end via direct sub-workflow invocation (temp test branch inserted into main, tests run, branch removed). All 3 tests PASS. 3 pre-existing bugs in the sub-workflow were discovered and patched during execution (see Deviations in 04-02-SUMMARY.md).
- **Supabase session schema gap:** The `content_sessions` table lacks `format` and `image_urls` columns, so the end-to-end approval flow (main webhook -> Supabase insert -> WA preview -> SI reply -> resumption -> re-host) only works for single-post. Carousel flow needs a schema extension before a publishing phase can run carousels end-to-end. This did not block Phase 4 verification (agent bypassed via direct sub-workflow invocation) but is now a known concern for Phases 5-7.

## Session Continuity

Last session: 2026-04-16
Stopped at: Phase 4 complete. Tests A/B/C passed. Sub-workflow bug fixes committed to local file `n8n/subworkflow-rehost-images.json` (uncommitted as of writing). Next logical action: commit the fixes, then `/gsd:plan-phase 5` to start Instagram Single-Photo Publishing.
Resume file: .planning/phases/04-azure-blob-re-hosting/04-02-SUMMARY.md (Task 2 Results section)
