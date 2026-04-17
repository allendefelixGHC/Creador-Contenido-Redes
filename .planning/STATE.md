# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** Generate complete social media posts (single or carousel) in one wizard run, with AI-generated images and WhatsApp preview — and now automatically publish to Instagram + Facebook after SI approval
**Current focus:** v1.1 — Phase 6 complete (Plans 01+02); next is Phase 7 (Carousel Publishing IG + FB)

## Current Position

Milestone: v1.1 Automatic Publishing
Phase: 6 of 9 (Facebook Single-Photo Publishing) — COMPLETE 2026-04-17 (Plans 01+02)
Next: Phase 7 (Carousel Publishing IG + FB)
Last activity: 2026-04-17 — Phase 6 complete. Plan 06-01: added FB Publish Photo node (40 nodes). Plan 06-02: deployed + 6 E2E test executions, 3 bugs fixed (WA newlines, Sheets operation, Sheets column order). Final exec 111: all 14/14 nodes pass. Live FB post, combined WA notification, Sheets row with IG_URL+FB_URL. Commits a436122→8aaea68.

Progress: [██████░░░░] ~50% (v1.1, 6/12 plans — Phase 4-6 complete) — [██████████] 100% (v1.0 complete)

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
| 6. Facebook Single-Photo Publishing | 2 | **Complete** — Plans 01+02 done 2026-04-17; 6 E2E tests, 3 bugs fixed (WA newlines, Sheets op, Sheets col order) |

**Plan execution history (v1.1):**

| Plan | Duration | Tasks | Files | Commits |
|------|----------|-------|-------|---------|
| 04-01 | ~4 min | 2 | 1 created | d41167d (Task 1, Azure pre-resolved), 052d129 (Task 2, sub-workflow JSON) |
| 04-02 | ~3 min (Task 1) + ~30 min (Task 2 agent run, incl. 3 bug fixes) | 2/2 complete | 2 modified | 23d195d (Task 1, wire sub-workflow into main), TBD (Task 2 fixes to `subworkflow-rehost-images.json`) |
| 05-01 | ~15 min | 1/1 complete | 1 modified | 81d66e6 (Task 1, IG publish chain + guard + columns) |
| 05-02 | ~4h (multi-session, 10 bug fixes) | 3/3 complete | 1 modified (11 commits) | c75c34f→827af90 (10 workflow fixes); 2 live IG posts exec 90+93 |
| 06-01 | ~8 min | 1/1 complete | 1 modified | a436122 (FB node + rewire), 335dbb6 (summary) |
| 06-02 | ~40 min (6 E2E tests, 3 bug fixes) | 2/2 complete | 1 modified | 0d48d27 (deploy), 5d089a7 (3 fixes), 8aaea68 (summary) |
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

- ~~Verify Google Sheets row logging empirically~~ — RESOLVED 2026-04-17: Sheets node needed `operation:"append"` + `resource:"sheet"` + correct column schema order. Fixed in commit 5d089a7, verified in exec 111
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
Stopped at: Phase 6 complete — FB single-photo publishing E2E verified (exec 111, 14/14 nodes). 3 bugs fixed during deploy (WA newlines, Sheets operation, Sheets column order). Sheets logging empirically confirmed (closing Phase 5 gap). Next: Phase 7 (Carousel Publishing IG + FB).
Resume file: .planning/phases/06-facebook-single-photo-publishing/06-02-SUMMARY.md
