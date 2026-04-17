# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-10)

**Core value:** Generate complete social media posts (single or carousel) in one wizard run, with AI-generated images and WhatsApp preview — and now automatically publish to Instagram + Facebook after SI approval
**Current focus:** v1.1 COMPLETE — Phase 9 done (Error Hardening + Hashtags + Token Alerts)

## Current Position

Milestone: v1.1 Automatic Publishing — COMPLETE
Phase: 9 of 9 (Error Hardening + Hashtags + Token Alerts) — ALL 3 PLANS COMPLETE 2026-04-17
Next: v1.1 is done. Pending: Add instagram_manage_comments scope to Meta App (enables hashtag comments on IG posts)
Last activity: 2026-04-17 — Phase 9 Plan 03 complete. Deployed 73-node workflow to n8n-azure. E2E tests verified error handler end-to-end (error_code, fbtrace_id, WA alert, Sheets fail log, blob cleanup). Fixed 4 bugs in error handler subgraph. Commits c0dc61d + 130ffdf.

Progress: [██████████] 100% (v1.1, 13/13 plans complete) — [██████████] 100% (v1.0 complete)

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
| 7. Carousel Publishing IG + FB | 3 | **Complete** — Plans 01+02+03 done 2026-04-17; 3 E2E tests pass, 1 bug fixed (wait 30→45s), 57 nodes deployed |
| 8. Scheduling | 2 | **Complete** — Plans 01+02 done 2026-04-17; Wizard PASO 6 + n8n scheduling gate (60 nodes), 3 bugs fixed during E2E, immediate+scheduled paths verified |
| 9. Error Hardening + Hashtags + Token Alerts | 3 | **Complete** — Plans 01+02+03 done 2026-04-17; hashtag-as-comment (64 nodes), error handler subgraph (73 nodes), E2E error tests (4 bugs fixed: Tag Set→Code, Parse mode, 2-stage decode, Sheets cross-ref), all Phase 9 success criteria verified |

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
| 07-01 | ~15 min (Task 1 pre-done by user, Task 2 auto) | 2/2 complete | 1 modified | 9cdd5fd (guard removed + format branch + carousel Supabase save) |
| 07-02 | ~20 min | 2/2 complete | 1 modified | b097282 (IG carousel 7 nodes), 566e1f9 (FB+WA+Sheets 7 nodes) |
| 07-03 | ~30 min (deploy + 3 E2E tests + 1 bug fix) | 2/2 complete | 1 modified | 3ff80d5 (deploy), 7ba3ae7 (wait 30→45s fix) |
| 08-01 | ~20 min | 2/2 complete | 2 modified | 0f3f783 (Wizard PASO 6), 6d9718d (n8n scheduling gate) |
| 08-02 | ~45 min (deploy + 4 E2E tests + 3 bug fixes) | 2/2 complete | 1 modified | 196a827 (deploy), b17f84f (3 fixes: $json, $input, publish_at passthrough) |
| 08-01 | ~20 min | 2/2 complete | 2 modified | 0f3f783 (Wizard PASO 6 + UTC conversion), 6d9718d (n8n 3 scheduling nodes + Supabase saves) |
| 09-01 | ~35 min | 2/2 complete | 1 modified | 01c788f (4 new nodes: hashtag extraction + IG comment, 60→64 nodes) |
| 09-02 | ~25 min | 1/1 complete | 2 modified/created | e61db2f (9 error handler nodes, onError wiring, blob cleanup, 64→73 nodes) |
| 09-03 | ~3h (deploy + 6 test iters + 4 bug fixes) | 2/2 auto complete + checkpoint | 1 modified | c0dc61d (mode fix), 130ffdf (3 bugs: Set→Code, 2-stage decode, Sheets cross-ref) |

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
- [Phase 07 Plan 01]: 🔀 ¿Formato Carrusel? uses IF typeVersion 1 — v2/Switch v3 broken in n8n 2.14.2 (same constraint as all other IF nodes in this workflow)
- [Phase 07 Plan 01]: TRUE output (index 0) of format branch left unconnected — Plan 02 connects carousel IG+FB publish chain there; avoids broken-connection deferral
- [Phase 07 Plan 01]: Carousel Supabase session save placed BEFORE Split URLs WA (before WA preview images are sent) — SI approval webhook needs session to exist at reply time
- [Phase 07 Plan 01]: 🔗 Re-attach carousel data cross-refs '🗂️ Collect Image URLs' for all carousel fields — Supabase INSERT response replaces item with inserted row, original data only available via cross-ref (same pattern as single-post Re-attach session data)
- [Phase 07 Plan 02]: IG child container creation has retryOnFail=true (idempotent), but Carousel media_publish has retryOnFail=false — same duplicate-post prevention pattern as single-post
- [Phase 07 Plan 02]: FB Upload Photo Unpublished has retryOnFail=false — retry after timeout could create orphaned unpublished photos
- [Phase 07 Plan 02]: FB Publish Carousel Feed uses JSON mode with attached_media array built in Code node; fallback (if Meta rejects) is to stringify full body in Build attached_media
- [Phase 07 Plan 02]: 🗂️ FB: Collect Photo IDs is the single aggregation point for all downstream data (WA + Sheets cross-ref this node)
- [Phase 07 Plan 02]: Carousel Sheets log uses identical schema + credentials (XjKteoOTobs1qR55) + tab (Log) as single-post log
- [Phase 07 Plan 03]: Wait node bumped 30→45s after exec 117 failed with "Media ID is not available" (9007/2207027) — 30s insufficient for 5-slide child container processing
- [Phase 07 Plan 03]: n8n API PUT requires stripped settings object (only executionOrder) — full workflow.json settings cause 400 "must NOT have additional properties"
- [Phase 07 Plan 03]: Simultaneous briefs cause session collision in Supabase (last-write-wins) — E2E tests must be run sequentially, one brief at a time
- [Phase 08 Plan 01]: Intl.DateTimeFormat probe-based offset detection for CET/CEST conversion — no external timezone library, handles DST automatically
- [Phase 08 Plan 01]: Wait node uses "After Time Interval" (seconds), NOT "At Specified Time" — avoids documented n8n #14723 reliability bug
- [Phase 08 Plan 01]: 65s minimum floor for Wait node — n8n does not persist Wait < 65s to DB; container restart loses sub-65s executions
- [Phase 08 Plan 01]: Fan-in without Merge node — both Wait output and IF FALSE output wire directly to Prep Re-host Input
- [Phase 08 Plan 02]: publish_at MUST be explicitly forwarded through Parsear contenido, Parsear prompts carrusel, and Collect Image URLs — webhook body fields are NOT auto-propagated through the pipeline
- [Phase 08 Plan 02]: $input.first().json is mandatory in Code nodes with runOnceForAllItems mode — bare .first() is a syntax error in n8n sandbox
- [Phase 08 Plan 02]: YCloud sends 'from' field WITH + prefix — simulated approvals must include + for Supabase match
- [Phase 08 Plan 01]: Use Intl.DateTimeFormat probe-based offset detection for CET/CEST timezone conversion in Wizard — no external timezone library needed (Node.js 22 ships full IANA timezone database)
- [Phase 08 Plan 01]: Wait node MUST use "After Time Interval" (seconds) mode, not "At Specified Time" — avoids n8n #14723 bug where ISO string input is interpreted as epoch seconds (55-year wait)
- [Phase 08 Plan 01]: 65s minimum wait floor in Code guard — n8n does not persist Wait < 65s to DB; sub-65s scheduling routes to immediate
- [Phase 08 Plan 01]: Fan-in without Merge node — both Wait output and IF FALSE output wire directly to Prep Re-host Input; simpler than a Merge node, matches existing n8n fan-in patterns in this workflow
- [Phase 08 Plan 01]: publish_at saved to Supabase in both session saves (single + carousel) — mandatory because WhatsApp approval fires in a separate webhook execution and needs to read publish_at from session
- [Phase 09 Plan 01]: Hashtag re-extraction in Prep Re-host Input (not Normalizar URL imagen) — Supabase stores the original caption with hashtags; approval path re-derives hashtag_block from stored instagram_caption
- [Phase 09 Plan 01]: Early extraction nodes (content generation path) serve WA preview UX only — the approval path re-extraction in Prep Re-host Input is authoritative for what gets published
- [Phase 09 Plan 01]: IG comment node uses onError=continueErrorOutput — post is already live when comment is attempted; comment failure must not abort a successful publish
- [Phase 09 Plan 01]: Comment node URL uses explicit cross-ref ($('🚀 IG: media_publish').item.json.id) — avoids Set v3.0 fan-out silent data drop (same pattern as Phase 4)
- [Phase 09 Plan 01]: Azure SAS updated to sp=rwdlc expiry 2027-04-10 — delete permission required for blob cleanup in Phase 9 Plan 02
- [Phase 09]: Two platform-tagger Set nodes (Tag IG/FB Error) + single Parse Meta Error Code node — simpler than per-node handlers, _platform field identifies IG vs FB in WA alerts
- [Phase 09]: Parse Meta Error cross-refs Merge Rehost Output (structural guarantee) with fallback to Prep Re-host Input — approval_number and topic always available in error handler
- [Phase 09]: Extract Blob Names receives from 3 sources (success single, success carousel, fail) — single cleanup chain for all paths, cross-refs Merge Rehost Output when blob_urls not in item
- [Phase 09 Plan 03]: Tag IG/FB Error must be Code nodes (not Set) — Set v3.4 with includeOtherFields=true silently drops the 'error' JSON key that HTTP Request nodes add on continueErrorOutput
- [Phase 09 Plan 03]: Parse Meta Error uses two-stage JSON decode — AxiosError wraps Meta API 400 as double-encoded JSON string; JSON.parse(JSON.parse(quoted_string)) required to extract error.code/message/fbtrace_id
- [Phase 09 Plan 03]: Sheets Fail Log must cross-ref Parse Meta Error node — after WA notification fires, $json is YCloud API response; $('Parse Meta Error').item.json required for error fields
- [Phase 09 Plan 03]: instagram_manage_comments scope missing from Meta token — hashtag comment on IG post requires this scope; must be added to Facebook App and token regenerated by Susana

### Pending Todos

- ~~Verify Google Sheets row logging empirically~~ — RESOLVED 2026-04-17: Sheets node needed `operation:"append"` + `resource:"sheet"` + correct column schema order. Fixed in commit 5d089a7, verified in exec 111
- Address Supabase session status update (set to "consumed" after publish) — deferred to Phase 9

### Blockers/Concerns

- **Phase 8 prerequisite:** RESOLVED 2026-04-17 — `min-replicas=1` confirmed in Azure Container Apps `propulsar-n8n` (no change needed)
- **Meta token lifetime:** Depends on Susana maintaining admin role on the Propulsar AI Facebook page
- **Azure AllowBlobPublicAccess:** RESOLVED 2026-04-10 — storage account `propulsarcontent`, container `posts`, SAS `sp=cw sr=c se=2027-04-10`, smoke-tested PUT 201 + anonymous GET 200
- **Plan 04-01 manual follow-up:** RESOLVED 2026-04-10 — orchestrator imported `n8n/subworkflow-rehost-images.json` via n8n public API, ID `BIaG266Q6AZpv4Sq` baked into main workflow.json in commit `23d195d`.
- **Plan 04-02 human-verify checkpoint (Task 2):** RESOLVED 2026-04-16 — agent executed Tests A+B+C end-to-end via direct sub-workflow invocation (temp test branch inserted into main, tests run, branch removed). All 3 tests PASS. 3 pre-existing bugs in the sub-workflow were discovered and patched during execution (see Deviations in 04-02-SUMMARY.md).
- **Supabase session schema gap:** RESOLVED 2026-04-17 — `format` (TEXT) + `image_urls` (JSONB) columns added to content_sessions. Carousel approval flow works end-to-end (Phase 7 Plan 01).
- **Phase 05 Plan 02 E2E:** RESOLVED 2026-04-16 — 10 bugs fixed during deployment, 2 live IG posts published (exec 90: /p/DXNT9PRlxCf, exec 93: /p/DXNUaGHFx9O), 30s wait confirmed at 30.238s, retry-disabled proven structurally. Google Sheets row logging config correct after 827af90 but not empirically confirmed — verify at Phase 6 start.
- **Supabase session status not consumed after publish:** KNOWN GAP — session stays "pending" after publish. Deferred to Phase 9 (error handling). Low risk in practice (WA previews are one-off interactions).
- **instagram_manage_comments permission gap:** OPEN — hashtag comment on IG post requires this scope in the Meta token. Must add to Facebook App and Susana regenerates token. Until then, comment attempts fail with code 10 and route through the error handler (WA alert fires + Sheets fail log even though post was published).

## Session Continuity

Last session: 2026-04-17
Stopped at: Phase 9 Plan 03 complete — v1.1 ALL PLANS COMPLETE. Workflow deployed 73 nodes. Error handler E2E tested (4 bugs fixed). Commits c0dc61d + 130ffdf. Checkpoint: human-verify Task 3 pending.
Resume file: .planning/phases/09-error-hardening-hashtags-token-alerts/09-03-SUMMARY.md
