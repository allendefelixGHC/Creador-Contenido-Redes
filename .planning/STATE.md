# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** Generate complete social media posts (single or carousel) in one wizard run, with AI-generated images and WhatsApp preview — and now automatically publish to Instagram + Facebook after SI approval
**Current focus:** v1.1 — Phase 5 complete (Plans 01+02); next is Phase 6 (Facebook single-photo publishing)

## Current Position

Milestone: v1.1 Automatic Publishing
Phase: 6 of 9 (Facebook Single-Photo Publishing) — IN PROGRESS (Plan 01 complete)
Next: Phase 6 Plan 02 (deploy FB publish chain to n8n-azure + E2E test)
Last activity: 2026-04-17 — Plan 06-01 executed: added FB: Publish Photo node to workflow.json (39→40 nodes), rewired IG Get Permalink → FB Publish Photo → WA Notify chain, updated WA message to include both IG+FB URLs, updated Sheets FB_URL from empty to post_id expression. Commit a436122.

Progress: [█████░░░░░] ~42% (v1.1, 5/12 plans — Phase 4 complete, Phase 5 complete, Phase 6 Plan 01 complete) — [██████████] 100% (v1.0 complete)

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
| 5. Instagram Single-Photo Publishing | 2 | **Complete** — Plans 01+02 done 2026-04-16; 2 live IG posts verified, 10 bugs fixed during deploy |

**Plan execution history (v1.1):**

| Plan | Duration | Tasks | Files | Commits |
|------|----------|-------|-------|---------|
| 04-01 | ~4 min | 2 | 1 created | d41167d (Task 1, Azure pre-resolved), 052d129 (Task 2, sub-workflow JSON) |
| 04-02 | ~3 min (Task 1) + ~30 min (Task 2 agent run, incl. 3 bug fixes) | 2/2 complete | 2 modified | 23d195d (Task 1, wire sub-workflow into main), TBD (Task 2 fixes to `subworkflow-rehost-images.json`) |
| 05-01 | ~15 min | 1/1 complete | 1 modified | 81d66e6 (Task 1, IG publish chain + guard + columns) |
| 05-02 | ~4h (multi-session, 10 bug fixes) | 3/3 complete | 1 modified (11 commits) | c75c34f→827af90 (10 workflow fixes); 2 live IG posts exec 90+93 |
| 06-01 | ~8 min | 1/1 complete | 1 modified | a436122 (FB publish node + rewire + WA update + Sheets FB_URL) |

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
- [Phase 05 Plan 01]: IG publish chain uses $json.instagram.caption (not $json.instagram) — GPT-4o parser returns instagram as an object {caption, image_prompt}, RESEARCH.md snippet was incorrect on this point.
- [Phase 05 Plan 01]: FB_URL declared as empty string in Sheets Log to lock column order; Phase 6 only changes the expression value, not the column structure.
- [Phase 05 Plan 01]: carousel guard added to Prep Re-host Input — throws for format=carousel. Phase 7 removes this guard when carousel publish ships.
- [Phase 05 Plan 01]: media_publish node has retryOnFail=false, maxTries=1 — it is the ONLY node in the workflow with retry explicitly disabled. This is the duplicate-post defense (IGPUB-04/ERR-02).
- [Phase 05 Plan 02]: graph.facebook.com required for all Meta API calls — Page tokens rejected by graph.instagram.com (401)
- [Phase 05 Plan 02]: YCloud inbound webhook must be explicitly pointed at the active approval workflow — silent failure if pointed at wrong workflow (chatbot)
- [Phase 05 Plan 02]: Supabase INSERT node is mandatory before WA preview send — approval gate is non-functional without a session to look up
- [Phase 05 Plan 02]: n8n Code node sandbox blocks require(), fetch(), and $helpers — use HTTP Request nodes for any external calls from within workflows
- [Phase 05 Plan 02]: Execute Workflow typeVersion must be 1.2 with mode:list + cachedResultName for __rl workflow references in n8n 2.14.2
- [Phase 05 Plan 02]: Google Sheets node v4.4 requires documentId and sheetName in __rl object format — plain strings fail silently or throw parse errors
- [Phase 05 Plan 02]: Test B (duplicate prevention) verified structurally (retryOnFail=false + single runData entry per exec) — forced-timeout empirical test deferred
- [Phase 05 Plan 02]: Supabase session status never set to "consumed" after publish — duplicate risk if SI sent twice; deferred to Phase 9
- [Phase 06 Plan 01]: FB: Publish Photo placed sequentially after IG: Get Permalink (not parallel) — avoids Set v3 fan-out cross-ref silent data drop pitfall from Phase 4
- [Phase 06 Plan 01]: retryOnFail=false on FB: Publish Photo — POST /{PAGE_ID}/photos is not idempotent, retry creates duplicate live FB post (same pattern as IG media_publish)
- [Phase 06 Plan 01]: FB URL constructed inline as 'https://www.facebook.com/' + post_id — /photos response includes post_id directly, no second GET needed

### Pending Todos

- Verify Google Sheets row logging empirically at the start of Phase 6 (config correct after 827af90 but no execution completed with that fix in place)
- Address Supabase session status update (set to "consumed" after publish) — deferred to Phase 9

### Blockers/Concerns

- **Phase 8 prerequisite:** `min-replicas=1` must be verified in Azure Container Apps BEFORE Phase 8 is tested — scale-to-zero kills Wait node executions silently
- **Meta token lifetime:** Depends on Susana maintaining admin role on the Propulsar AI Facebook page
- **Azure AllowBlobPublicAccess:** RESOLVED 2026-04-10 — storage account `propulsarcontent`, container `posts`, SAS `sp=cw sr=c se=2027-04-10`, smoke-tested PUT 201 + anonymous GET 200
- **Plan 04-01 manual follow-up:** RESOLVED 2026-04-10 — orchestrator imported `n8n/subworkflow-rehost-images.json` via n8n public API, ID `BIaG266Q6AZpv4Sq` baked into main workflow.json in commit `23d195d`.
- **Plan 04-02 human-verify checkpoint (Task 2):** RESOLVED 2026-04-16 — agent executed Tests A+B+C end-to-end via direct sub-workflow invocation (temp test branch inserted into main, tests run, branch removed). All 3 tests PASS. 3 pre-existing bugs in the sub-workflow were discovered and patched during execution (see Deviations in 04-02-SUMMARY.md).
- **Supabase session schema gap:** The `content_sessions` table lacks `format` and `image_urls` columns, so the end-to-end approval flow (main webhook -> Supabase insert -> WA preview -> SI reply -> resumption -> re-host) only works for single-post. Carousel flow needs a schema extension before a publishing phase can run carousels end-to-end. This did not block Phase 4 verification (agent bypassed via direct sub-workflow invocation) but is now a known concern for Phases 5-7.
- **Phase 05 Plan 02 E2E:** RESOLVED 2026-04-16 — 10 bugs fixed during deployment, 2 live IG posts published (exec 90: /p/DXNT9PRlxCf, exec 93: /p/DXNUaGHFx9O), 30s wait confirmed at 30.238s, retry-disabled proven structurally. Google Sheets row logging config correct after 827af90 but not empirically confirmed — verify at Phase 6 start.
- **Supabase session status not consumed after publish:** KNOWN GAP — session stays "pending" after publish. Deferred to Phase 9 (error handling). Low risk in practice (WA previews are one-off interactions).

## Session Continuity

Last session: 2026-04-17
Stopped at: Completed 06-01-PLAN.md — FB publish node added to workflow.json (39→40 nodes), chain rewired, WA+Sheets updated. Commit a436122. Next: Phase 6 Plan 02 (deploy to n8n-azure + E2E test).
Resume file: .planning/phases/06-facebook-single-photo-publishing/06-01-SUMMARY.md
