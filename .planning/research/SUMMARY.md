# Project Research Summary

**Project:** Propulsar Content Engine — v1.1 Automatic Publishing
**Domain:** Social media auto-publishing via Meta Graph API + Azure Blob + n8n scheduling
**Researched:** 2026-04-10
**Confidence:** HIGH

## Executive Summary

v1.1 is a publishing pipeline extension to the existing v1.0 content generation system. The existing stack (Node.js Wizard, n8n 2.14.2 on Azure Container Apps, GPT-4o, Flux/Ideogram/Nano Banana, YCloud WhatsApp, Supabase, Google Sheets) is proven and requires no changes. The new work adds exactly three components after the SI approval gate: Azure Blob Storage for image re-hosting, Meta Graph API v22 calls for IG and FB publishing, and an n8n Wait node for optional scheduling. All four researchers independently converged on the same phase build order — foundation/re-host first, then IG single, then FB single, then carousels, then scheduling, then error hardening — because each phase is a direct dependency of the next.

The recommended approach is entirely within n8n using built-in nodes: HTTP Request node for Azure Blob PUT (SAS pattern) and Meta Graph API calls, Wait node for scheduling, and Code nodes for dynamic array construction (FB carousel `attached_media`). No new npm packages are needed. The entire new sub-flow attaches at one point in the existing workflow: between `retrieve-session` and `log-sheets`. Meta tokens (already confirmed working since 2026-04-10) are long-lived Page tokens that do not expire by time, eliminating any refresh complexity for v1.1.

The three critical risks are: (1) passing Ideogram ephemeral URLs directly to Meta — they expire before Meta fetches them, making Azure re-hosting non-negotiable; (2) calling `media_publish` more than once (not idempotent — produces duplicate live posts); (3) using IF v2 or Switch v3 nodes, which always route to TRUE in n8n 2.14.2. A secondary infrastructure risk is Azure Container Apps scale-to-zero behavior killing Wait node executions — verifying min-replicas=1 must happen before the scheduling phase goes live.

## Key Findings

### Recommended Stack

The v1.1 stack additions are minimal and leverage existing infrastructure. No new services are required beyond Azure Blob Storage (already in the Azure resource group) and Meta Graph API access (tokens already verified). The existing n8n 2.14.2 instance on Azure Container Apps supports all required nodes natively.

**Core technology additions:**

- **Meta Graph API v22.0**: IG + FB publishing — v22 is stable; avoid v25 (too new, churning). Use `graph.instagram.com` for IG calls (not the deprecated `graph.facebook.com` IG path). Pin the version explicitly in all URLs.
- **n8n Azure Storage node / HTTP Request PUT + SAS**: Image re-hosting — the native Azure Storage node supports blob create/delete. For SAS-based uploads, the HTTP Request node PUT pattern works directly. Use public-access-level container to eliminate SAS expiry risk for the blob serve URL.
- **n8n Wait node (At Specified Time)**: Scheduling — on v2.14.2, waits >65s persist to DB and survive restarts. All real scheduling use cases (minutes to 24h ahead) are well above the threshold. Full durability fix landed in v2.16.0 (April 2026), but the current version is safe for production scheduling windows.
- **Long-lived Page Access Token**: Authentication — does not expire by time; invalidated only by password change, admin role removal, or explicit revocation. No refresh cron needed. Current tokens from Susana's session are confirmed working.

**New environment variables required:** `AZURE_STORAGE_ACCOUNT`, `AZURE_CONTAINER`, `AZURE_SAS_PARAMS` (write SAS for uploads). `META_PAGE_TOKEN`, `INSTAGRAM_ACCOUNT_ID`, `FACEBOOK_PAGE_ID` are already in `.env` since 2026-04-10.

### Expected Features

All researchers agreed on the same MVP scope. The key dependency insight: image re-hosting must happen before any Meta API call, making Azure Blob the gating dependency for the entire pipeline.

**Must have (table stakes — v1.1 MVP):**
- Image re-hosting to Azure Blob — gating dependency; Ideogram signed URLs expire and Meta rejects them
- IG single-photo publish (2-step: create container → media_publish)
- FB single-photo publish (`POST /{page-id}/photos`)
- IG carousel publish (3-step: N child containers → parent carousel container → media_publish)
- FB carousel publish (`attached_media` pattern with N unpublished photos)
- Container readiness polling — IG containers are async; publish before FINISHED causes cryptic errors
- WhatsApp success notification with IG permalink + FB post URL
- WhatsApp failure notification with error code and reason
- Google Sheets log update (add `IG_URL`, `FB_URL`, `Publicado_En` columns)
- Scheduling: publish now path (default — no Wait node needed)
- Scheduling: specific time path (Wizard CET/CEST → UTC → n8n Wait node)

**Should have (add after core validation — v1.1 patch or v1.2):**
- First-comment hashtag posting — low complexity, high algorithmic value; `POST /{media_id}/comments` immediately after media_publish
- Full retry logic with exponential backoff — start with single retry + notify; full backoff after observing real failure patterns

**Defer to v2+:**
- IG Insights analytics (requires 24h post-publish; build as separate scheduled workflow)
- A/B caption testing (requires analytics layer first)
- Story publishing (separate Wizard flow, 9:16 aspect ratio, different brief)
- Multi-account publishing (multi-tenant milestone for agency use)
- Video carousel support (requires separate video generation pipeline)
- Native FB `scheduled_publish_time` (only if Wait node proves unreliable, which it won't)

**Anti-features confirmed (do not build):**
- IG native `publish_at` API param — does not exist on IG Graph API
- Manual caption editing before publish — breaks full-automation model; improve the GPT-4o prompt instead
- FB `scheduled_publish_time` in v1.1 — creates two scheduling code paths for one concept

### Architecture Approach

The new sub-flow attaches at a single point in the existing workflow (between `retrieve-session` and `log-sheets`), following a linear sequence: check-scheduled → (optional Wait) → check-carousel → two parallel paths (single vs carousel) → success/error notification → Sheets log. All n8n patterns from v1.0 carry forward directly: N-item sequential HTTP execution (no SplitInBatches), collect-after-loop via `$()` reference, IF v1 string comparison routing, and `$env` in HTTP Request parameters (not Code nodes).

**Major components:**

1. **Wizard (wizard/run.js)** — gains one new prompt (publish_when: now / today / tomorrow) and CET/CEST → UTC conversion; adds `publish_at` field to brief JSON
2. **n8n scheduling gate** — `check-scheduled` IF v1 node + `wait-until-publish` Wait node; merges back into publish chain after Wait fires
3. **Azure Blob re-hosting sub-flow** — download image as binary (HTTP Request GET) → PUT to Azure Blob (HTTP Request PUT with SAS) → construct public URL (Code node hardcoding non-secret values)
4. **IG publishing sub-flow** — `POST /{ig-user-id}/media` → (30s Wait or status poll) → `POST /{ig-user-id}/media_publish`; carousel variant adds N child container loop + `Collect container IDs` Code node before parent container creation
5. **FB publishing sub-flow** — `POST /{page-id}/photos?published=false` → `POST /{page-id}/feed` with `attached_media`; carousel uses N unpublished photo uploads then `attached_media[N]` array built in Code node
6. **Notification + log sub-flow** — `Preparar WA éxito` Code node → YCloud WA send → Google Sheets log update; error branches use HTTP Request node error output (typeVersion 4.2) → `Preparar error WA` → WA send → Sheets error row

**Key constraint:** `$env` is not accessible inside Code node jsCode in n8n 2.14.2. All `META_PAGE_TOKEN`, `INSTAGRAM_ACCOUNT_ID`, `FACEBOOK_PAGE_ID`, and `AZURE_SAS_PARAMS` values must be referenced in HTTP Request node URL/body/header fields only. Non-secret config (storage account name, container name) can be hardcoded in Code node strings.

### Critical Pitfalls

1. **`media_publish` is not idempotent — disable retries on that node.** Calling it twice (e.g., after a timeout where the first call actually succeeded) produces two live posts. Disable "Retry on Fail" specifically on the publish node. Before any retry, check `GET /{container_id}?fields=status_code` — if status is PUBLISHED, do not retry.

2. **Ideogram URLs expire before Meta fetches them — re-host first, always.** Never pass a `cdn.ideogram.ai` URL directly to any Meta API call. Meta fetches asynchronously and signed URLs can expire in 1–2 hours. Azure Blob re-hosting is a non-negotiable gating step, not an optimization.

3. **IF v2 / Switch v3 always routes to TRUE in n8n 2.14.2 — all new IF nodes must use typeVersion 1.** This is a confirmed bug from v1.0. Every new conditional node (`check-scheduled`, `check-carousel`, error branch routing) must be explicitly set to `typeVersion: 1` with string comparisons. Add a pre-upload grep check: no `typeVersion` > 1 in workflow.json.

4. **Carousel child containers must reach FINISHED before creating the parent — poll or use a fixed Wait.** Creating the parent container while children are IN_PROGRESS returns `(#9007) The provided image URL is not accessible`. Use a fixed 30s Wait node after child container creation (acceptable for single images; implement status polling for production carousels).

5. **n8n Wait node gets stuck indefinitely if the scheduled time is in the past.** Known bug (issue #14198/#15123). Add a past-time guard in the Wizard: if `scheduledTime <= now`, override to "publish now" and warn the user. Add a secondary guard in n8n: Code node before the Wait node compares `publish_at` to `Date.now()`.

6. **Azure Container App scale-to-zero kills Wait node executions.** Verify `min-replicas=1` in Azure Portal before the scheduling phase goes live. Without this, scheduled posts silently never publish after idle scale-down.

7. **Credential re-linking required after every workflow.json upload.** Known n8n API limitation: credential bindings break on import. After every deployment, manually relink all credential-dependent nodes in the n8n UI. Document the node list in SETUP.md.

## Implications for Roadmap

All four research files independently converged on the same phase ordering based on hard dependencies. The build order below is not a preference — it is dictated by what each phase requires from the prior one.

### Phase 1 — Foundation: Azure Blob Re-hosting

**Rationale:** Image re-hosting is the gating dependency for ALL Meta API work. Without stable public URLs, no IG or FB container creation can be tested end-to-end. Ideogram ephemeral URLs cannot be used in any subsequent phase. Building this first also validates the Azure Blob setup (SAS params, public access level, Content-Type headers) in isolation before Meta API complexity is added.

**Delivers:** Any Ideogram/FAL URL can be downloaded as binary and re-hosted to a permanent Azure Blob public URL. Verified accessible from the public internet. Azure environment variables confirmed in Container App.

**Addresses:** Image re-hosting (table stakes P1), blob naming convention, Azure SAS write access setup, public container access level configuration.

**Avoids:** Pitfall 3 (Ideogram URL expiry), Pitfall 4 (SAS URL expiry for scheduled posts). Also validates `$env` is not used in Code nodes (establishes the correct architecture pattern for all subsequent phases).

**Research flag:** Standard patterns — Azure Blob SAS PUT is well-documented. No additional research needed. One-time Azure portal setup required (AllowBlobPublicAccess, container access level).

### Phase 2 — IG Single-Photo Publishing

**Rationale:** Simpler than carousel (1 image, no loops). Validates the full Meta Graph API integration end-to-end — re-host → create container → poll status → media_publish → retrieve permalink — before adding carousel complexity. Establishes the HTTP Request node patterns (token in URL/body params, `$env` usage, error output branching) that Phase 3 and 4 will reuse.

**Delivers:** Full single-post IG publish flow from WA approval to live IG post. WhatsApp success + failure notifications. Google Sheets log update with IG permalink.

**Addresses:** IG single-photo publish (P1), container readiness polling (P1), WhatsApp success notification (P1), WhatsApp failure notification (P1), Google Sheets log update (P1).

**Avoids:** Pitfall 1 (idempotency — disable retries on media_publish), Pitfall 3 (Ideogram URL expiry — resolved by Phase 1), Pitfall 7 (IF v1 for error branch routing).

**Research flag:** Standard patterns — well-documented 2-step IG container → publish flow. All endpoints verified against official Meta docs. No additional research needed.

### Phase 3 — FB Single-Photo Publishing

**Rationale:** FB single photo uses a different endpoint pattern than IG (`POST /{page-id}/photos` instead of the 2-step container flow). Validate it separately before merging with carousel complexity. Same Azure Blob URL from Phase 1 is reused. Same Meta token works for both platforms.

**Delivers:** FB single-photo publish working in parallel with IG publish (both triggered from same approval gate, sharing the same Azure Blob URL). Full audit trail (both IG + FB URLs in Sheets log, both in WA success notification).

**Addresses:** FB single-photo publish (P1), WhatsApp success notification updated with FB URL (P1).

**Avoids:** FB carousel `attached_media` anti-pattern (not needed here — that comes in Phase 4).

**Research flag:** Standard patterns — single API call. No additional research needed.

### Phase 4 — Carousel Publishing (IG + FB)

**Rationale:** Builds directly on the Azure upload and Meta HTTP patterns from Phases 1-3. Adds N-item loops using the proven v1.0 pattern (sequential HTTP execution, collect-after-loop via `$()`). IG and FB carousel have different API flows and must be built as separate code paths. This is the most complex phase.

**Delivers:** Both IG carousel (3-step: N child containers → parent carousel container → media_publish) and FB carousel (`attached_media` multi-photo pattern) working end-to-end from WA approval.

**Addresses:** IG carousel publish (P1), FB carousel publish (P1), Code node for dynamic `attached_media` array construction.

**Avoids:** Pitfall 2 (child containers not FINISHED before parent — use 30s Wait after child container loop), SplitInBatches anti-pattern (use N-item sequential HTTP execution as proven in v1.0 Ideogram slide generation), IF v1 requirement for `check-carousel` routing node.

**Research flag:** Needs attention during planning — the FB carousel `attached_media` array construction in n8n Code node and the IG child container collection pattern are the two most complex pieces. Both have verified solutions in ARCHITECTURE.md (Code node snippets included) but require careful implementation. Recommend `/gsd:research-phase` if the FB `attached_media` Code node construction is unclear.

### Phase 5 — Scheduling

**Rationale:** Scheduling is a pure addition to the already-working publish flow. No publishing logic changes — only a new Wizard prompt + UTC conversion + `check-scheduled` IF v1 node + Wait node inserted before the re-hosting step. Phases 1-4 must be solid before adding a time delay into the execution chain.

**Delivers:** Wizard accepts "publish now / today at HH:MM / tomorrow at HH:MM" input, converts to UTC, sends in `publish_at` brief field. n8n holds execution until target time, then runs identical publish chain.

**Addresses:** Scheduling: specific time path (P1), CET/CEST → UTC conversion in Wizard (differentiator).

**Avoids:** Pitfall 5 (Wait node stuck on past time — add Wizard guard + n8n Code node guard before Wait), Pitfall 6 (scale-to-zero — verify min-replicas=1 BEFORE this phase goes live).

**Research flag:** Verify min-replicas=1 as a prerequisite check at the start of this phase. The Wait node "At Specified Time" behavior on n8n 2.14.2 specifically must be tested with a 2-minute window before trusting production schedules (known issue #14723).

### Phase 6 — Error Handling Hardening

**Rationale:** Error paths are secondary flows. Core success path must be solid first. Once Phases 1-5 are validated, add error branches to all Meta HTTP Request nodes, ensure every failure surfaces via WhatsApp, and add the `OAuthException 190` → WhatsApp alert for token expiry detection.

**Delivers:** All Meta API error codes handled. WhatsApp failure notifications include `message`, `type`, `code`, and `fbtrace_id`. Sheets error rows logged. Token expiry detected and alerted immediately.

**Addresses:** WhatsApp failure notification (P1 — partially in Phase 2, hardened here), full retry logic (P2), OAuthException detection (ongoing operations).

**Avoids:** Pitfall 1 mitigation (verify disable-retries on media_publish held through all prior phases), credential re-linking documentation updated for all new nodes.

**Research flag:** Standard patterns — n8n HTTP Request node error output (typeVersion 4.2) is well-documented. No additional research needed.

### Phase Ordering Rationale

- **Foundation first**: Azure Blob (Phase 1) is a hard prerequisite for every Meta API call. No subsequent phase can be tested end-to-end without it.
- **Simple before complex**: IG single (Phase 2) → FB single (Phase 3) → carousels (Phase 4) follows increasing API call complexity. Each phase reuses the patterns validated in the prior one.
- **Platforms separated**: IG and FB have meaningfully different API patterns (2-step container vs direct photos, carousel child vs attached_media). Testing them in separate phases isolates failures.
- **Scheduling last before hardening**: Scheduling adds only a Wait node — it does not change publishing logic. Adding it after publishing is stable avoids debugging time-delay issues while the core flow is unvalidated.
- **Error hardening at end**: Success path confidence required before investing in failure path complexity.

### Research Flags

Phases needing extra attention during planning:
- **Phase 4 (Carousels):** FB `attached_media` array construction in Code node and IG child container collection pattern are implementation-sensitive. ARCHITECTURE.md includes complete Code node snippets — use them verbatim.
- **Phase 5 (Scheduling):** Must verify `min-replicas=1` in Azure Container Apps before this phase is tested. Must validate Wait node behavior with a 2-minute test window on n8n 2.14.2 before trusting longer schedules.

Phases with standard patterns (research-phase not needed):
- **Phase 1 (Azure Blob):** One-time Azure portal configuration + standard HTTP Request PUT pattern.
- **Phase 2 (IG Single):** Well-documented 2-step Meta container flow. Official docs confirm all endpoint details.
- **Phase 3 (FB Single):** Single API call. No ambiguity.
- **Phase 6 (Error Handling):** Standard n8n error output branching pattern.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All critical claims verified against official Meta docs, n8n GitHub PRs, and Azure official docs. Long-lived token behavior and Wait node DB persistence confirmed at source level. |
| Features | HIGH | IG and FB publishing flows verified against official Meta developer docs. No native IG `publish_at` confirmed (docs absence confirmed). FB `scheduled_publish_time` exists but explicitly deferred. |
| Architecture | HIGH | Based on direct inspection of existing workflow.json (27 nodes) + official API docs. All node patterns (N-item sequential HTTP, collect-after-loop, IF v1) are proven in v1.0. |
| Pitfalls | HIGH | IF v2 bug, SplitInBatches bug, credential re-linking — all from v1.0 lived experience (PROJECT.md). `media_publish` idempotency and Wait node stuck-on-past-time are confirmed in Meta official docs and n8n GitHub issues respectively. |

**Overall confidence:** HIGH

### Gaps to Address

- **Azure SAS vs public container decision:** ARCHITECTURE.md recommends SAS for writes and public access for reads. PITFALLS.md warns that SAS expiry breaks scheduled posts. The recommended resolution (public container for serving, SAS only for write operations) should be confirmed during Phase 1 setup by checking whether the Azure storage account created in 2025/2026 has `AllowBlobPublicAccess` disabled by default (it does for accounts created post-2023 — must explicitly enable in Azure Portal).

- **n8n 2.14.2 Wait node "At Specified Time" specific behavior (issue #14723):** ARCHITECTURE.md flags this with MEDIUM confidence. The past-time guard (Pitfall 5) is designed and documented, but the exact behavior on 2.14.2 must be validated with a live 2-minute test in Phase 5 before production scheduling is trusted.

- **FB carousel `attached_media[N]` syntax in n8n HTTP Request node:** The `attached_media[0]={"media_fbid":"..."}` array format requires special handling in n8n's HTTP Request body. The Code node approach (build the feed POST body in a Code node and pass it to HTTP Request as raw JSON) is the documented workaround, but this exact pattern should be tested early in Phase 4 to avoid late-phase surprises.

- **Blob cleanup strategy:** All researchers flag orphaned blob accumulation but none define the exact cleanup timing. Recommend: delete blob in both success and failure branches immediately after publish confirmation (or failure logging). Add to Phase 6 scope.

## Sources

### Primary (HIGH confidence)

- [Meta Instagram Content Publishing Docs](https://developers.facebook.com/docs/instagram-platform/content-publishing/) — endpoint reference, permissions, rate limits, container status codes
- [Meta Graph API Page Photos Reference](https://developers.facebook.com/docs/graph-api/reference/page/photos/) — FB page photo publish + carousel `attached_media`
- [Meta Long-Lived Token Guide](https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived/) — page token lifetime and invalidation conditions
- [Meta Graph API v22 Changelog](https://developers.facebook.com/docs/graph-api/changelog/version22.0) — version reference
- [n8n PR #27066 — Wait Node Full Durability](https://github.com/n8n-io/n8n/pull/27066) — v2.16.0 merges full DB persistence; v2.14.2 behavior (65s threshold) documented
- [Azure Blob Anonymous Access Configure](https://learn.microsoft.com/en-us/azure/storage/blobs/anonymous-read-access-configure) — public blob URL setup, account-level AllowBlobPublicAccess requirement
- [Meta Graph API Error Handling](https://developers.facebook.com/docs/graph-api/guides/error-handling/) — error codes and actions
- [Existing workflow.json](../../n8n/workflow.json) — direct inspection of all 27 nodes and connection map
- [PROJECT.md](../PROJECT.md) — IF v2/Switch v3 bug confirmed from v1.0 experience; SplitInBatches bug confirmed; credential re-linking pattern confirmed

### Secondary (MEDIUM confidence)

- [n8n Azure Storage node docs](https://docs.n8n.io/integrations/builtin/app-nodes/n8n-nodes-base.azurestorage/) — supported operations confirmed
- [n8n community: Azure Blob SAS token thread](https://community.n8n.io/t/azure-blob-storage-support-for-sas-tokens/112080) — SAS not natively supported in credential UI; HTTP Request PUT workaround confirmed
- [n8n workflow template 4498](https://n8n.io/workflows/4498-schedule-and-publish-all-instagram-content-types-with-facebook-graph-api/) — confirms Graph API approach in n8n
- [n8n workflow template 3693](https://n8n.io/workflows/3693-create-and-publish-instagram-carousel-posts-with-gpt-41-mini-imgur-and-graph-api/) — carousel pattern verified
- [n8n GitHub Issue #14723](https://github.com/n8n-io/n8n/issues/14723) — Wait "At Specified Time" broken in some versions
- [n8n Community: Credential unavailable after API upload](https://community.n8n.io/t/credentials-unavailable-for-workflows-created-via-n8ns-api/183099) — credential re-linking confirmed
- [n8n Community: Wait node stuck on past time](https://community.n8n.io/t/wait-node-stuck-on-execution-when-time-is-in-the-past/45890) — stuck indefinitely confirmed

---
*Research completed: 2026-04-10*
*Ready for roadmap: yes*
