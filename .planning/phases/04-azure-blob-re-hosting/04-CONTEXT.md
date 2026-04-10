# Phase 4: Azure Blob Re-hosting - Context

**Gathered:** 2026-04-10
**Status:** Ready for planning

<domain>
## Phase Boundary

Download images from Ideogram/FAL temporary URLs and re-host them to permanent, public Azure Blob URLs before any Meta Graph API call. The sub-flow is triggered after SI approval in WhatsApp. Output: one or more permanent blob URLs (no expiry, browser-fetchable without auth) ready to be consumed by downstream publishing phases (5-7).

Publishing to Meta, scheduling, and blob cleanup are out of scope — they belong to Phases 5-9.

</domain>

<decisions>
## Implementation Decisions

### Upload strategy (method, structure, auth, transfer)
- **Auth against Azure Blob: SAS token** — reuse existing `AZURE_SAS_PARAMS` already configured in the Container App. Zero infra changes.
- Upload method (HTTP Request + SAS vs Code node + SDK): **Claude's discretion** during research/planning
- Structure (sub-workflow vs inline): **Claude's discretion** — but keep in mind it must be reusable for both single-post (Phases 5-6) and carousel (Phase 7), so a sub-workflow pattern is likely the natural choice
- Download transfer (buffer vs stream): **Claude's discretion** — evaluate typical image sizes from Ideogram/FAL during research

### Naming and structure
- **Naming convention: date-prefixed UUID** — format `YYYY/MM/DD/<uuid>.<ext>` (e.g., `2026/04/10/a3f2b1c9-....jpg`)
  - Enables easy auditing and future cleanup by date
  - UUID guarantees no collisions
- **Single container** — reuse the existing `AZURE_CONTAINER` for all posts (single + carousel, IG + FB). One config, simpler.
- Content-type / extension: **Claude's discretion** — investigate what Ideogram and FAL return and what Meta accepts reliably (likely detect from source Content-Type, but Claude should verify during research)
- Blob name predictability (random vs reconstructible from post_id): **Claude's discretion**

### Carousel handling (N images)
- **Upload order: strict** — slide 1 must map to blob 1, slide 2 to blob 2, etc. The re-hosting step MUST track and preserve the slide index explicitly; the downstream IG/FB carousel phases rely on correct ordering.
- **Partial failure policy: retry the failed image** — if image 3 of 5 fails, retry that specific image 2-3 times. If it still fails after retries → abort the entire post and notify the user.
  - Do NOT publish a partial carousel (would silently change the brief the user approved).
- Concurrency (sequential vs parallel SplitInBatches): **Claude's discretion** — evaluate Azure rate limits and typical carousel sizes (3-7 slides) during research
- Orphan blob cleanup on abort: **Claude's discretion** — either clean up immediately here or defer to Phase 9 (which already includes blob cleanup in error hardening). Claude should pick whichever keeps Phase 4 scope tight while still meeting success criteria.

### Verification post-upload
- Whether to do a HEAD request to confirm public fetchability before handoff to Meta: **Claude's discretion**
- Retry policy on verification failure (404/403 from HEAD): **Claude's discretion**
- How to verify Success Criterion 3 from roadmap ("blob accessible 2 hours after creation"): **Claude's discretion** — could be a one-time manual verification during phase sign-off, or an explicit delayed-check task in the plan
- Blob URL tracking for downstream cleanup (execution data vs Supabase): **Claude's discretion** — evaluate against existing Supabase usage in the pipeline

### Claude's Discretion (summary)
Claude has flexibility during research/planning on:
- Upload method (HTTP Request+SAS vs SDK)
- Sub-workflow vs inline (lean toward sub-workflow for reusability)
- Stream vs buffer transfer
- Content-type handling (detect vs force JPG)
- Blob name predictability
- Sequential vs parallel carousel uploads
- Orphan blob cleanup timing (Phase 4 now vs Phase 9 later)
- HEAD verification policy and retries
- 2-hour persistence verification approach
- Blob URL tracking storage (execution data vs Supabase)

</decisions>

<specifics>
## Specific Ideas

- Must reuse the existing env vars (`AZURE_STORAGE_ACCOUNT`, `AZURE_CONTAINER`, `AZURE_SAS_PARAMS`) — Success Criterion 5 locks this
- No `$env` inside Code nodes — env vars must be read via n8n expressions/credentials, not `process.env` inside JS code
- Carousel support is first-class from day one (Criterion 4: "a 5-slide carousel → all 5 re-hosted sequentially" — note roadmap says "sequentially" but it's describing the requirement of having all 5 ready, not mandating sequential execution; Claude has room to choose concurrency)
- The sub-flow must be designed with the knowledge that Phases 5, 6, and 7 will all consume its output — API shape matters

</specifics>

<deferred>
## Deferred Ideas

- **Orphan blob cleanup on success** → Phase 9 (already scoped there: "after a successful publish, the Azure Blob files for that post are deleted")
- **Publishing to Meta (IG/FB single + carousel)** → Phases 5, 6, 7
- **Scheduling / Wait node in front of re-hosting** → Phase 8
- **OAuthException 190 / token expiry alerts** → Phase 9
- **Failure logging row in Sheets** → Phase 9

</deferred>

---

*Phase: 04-azure-blob-re-hosting*
*Context gathered: 2026-04-10*
