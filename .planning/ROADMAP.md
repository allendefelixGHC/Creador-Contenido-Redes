# Roadmap: Propulsar Content Engine

## Milestones

- ✅ **v1.0 Carousel Support** — Phases 1-3 (shipped 2026-04-10) → [archive](milestones/v1.0-ROADMAP.md)
- 🚧 **v1.1 Automatic Publishing** — Phases 4-9 (in progress)

## Phases

<details>
<summary>✅ v1.0 Carousel Support (Phases 1-3) — SHIPPED 2026-04-10</summary>

- [x] Phase 1: Wizard Carousel Flow (2/2 plans) — completed 2026-04-04
- [x] Phase 2: n8n Content Generation (2/2 plans) — completed 2026-04-06
- [x] Phase 3: n8n Image Generation + WhatsApp Preview (3/3 plans) — completed 2026-04-06

See [v1.0-ROADMAP.md](milestones/v1.0-ROADMAP.md) for full phase details.

</details>

### 🚧 v1.1 Automatic Publishing (In Progress)

**Milestone Goal:** Close the loop — after SI approval, automatically publish single posts and carousels to Instagram and Facebook via Meta Graph API, with scheduling, re-hosting, retry logic, and WhatsApp confirmations.

#### Phase 4: Azure Blob Re-hosting

- [x] **Phase 4: Azure Blob Re-hosting** — Completed 2026-04-16 (Tests A/B/C PASS; 3 sub-workflow bugs patched during Task 2)

#### Phase 5: Instagram Single-Photo Publishing

- [ ] **Phase 5: Instagram Single-Photo Publishing** — Full IG single-post pipeline: re-hosted image → container → media_publish (no retry) → permalink → WhatsApp success notification → Sheets log

#### Phase 6: Facebook Single-Photo Publishing

- [ ] **Phase 6: Facebook Single-Photo Publishing** — FB single-post via `/photos` endpoint running in parallel with IG, both URLs in the same WhatsApp success message

#### Phase 7: Carousel Publishing (IG + FB)

- [ ] **Phase 7: Carousel Publishing (IG + FB)** — N-child-container IG carousel and `attached_media` FB carousel, both built on top of the proven single-post patterns

#### Phase 8: Scheduling

- [ ] **Phase 8: Scheduling** — Wizard publish-time prompt + CET/CEST → UTC conversion + n8n Wait node gate; past-time guard in both Wizard and n8n

#### Phase 9: Error Hardening + Hashtags + Token Alerts

- [ ] **Phase 9: Error Hardening + Hashtags + Token Alerts** — Error output branches on all Meta nodes, first-comment hashtag posting, OAuthException 190 alert, blob cleanup, failure logging

## Phase Details

### Phase 4: Azure Blob Re-hosting
**Goal**: Any Ideogram/FAL image URL can be downloaded and re-hosted to a permanent public Azure Blob URL that Meta Graph API can fetch reliably
**Depends on**: Phase 3 (v1.0 pipeline — existing WhatsApp approval gate)
**Requirements**: REHOST-01, REHOST-02, REHOST-03, REHOST-04, REHOST-05
**Success Criteria** (what must be TRUE):
  1. Approving SI in WhatsApp triggers the re-host sub-flow; the original Ideogram URL is fetched as binary and a new blob appears in Azure Blob Storage
  2. The blob URL (`https://<storage>.blob.core.windows.net/<container>/<uuid>`) is accessible from a browser without authentication, with no expiry
  3. Fetching the blob URL 2 hours after creation returns the full image (proves it is not an ephemeral signed URL)
  4. For a 5-slide carousel, all 5 images are re-hosted sequentially and 5 distinct blob URLs are available before any Meta call begins
  5. Azure environment variables (`AZURE_STORAGE_ACCOUNT`, `AZURE_CONTAINER`, `AZURE_SAS_PARAMS`) are confirmed present in the Container App — no `$env` used inside Code nodes
**Plans**: TBD

### Phase 5: Instagram Single-Photo Publishing
**Goal**: After SI approval, a single-photo post is published to Instagram and the user receives a WhatsApp message with the live IG permalink and a Google Sheets row is created
**Depends on**: Phase 4 (permanent blob URLs required for Meta container creation)
**Requirements**: IGPUB-01, IGPUB-03, IGPUB-04, IGPUB-05, ERR-02, NOTIF-01, LOG-01, LOG-02
**Success Criteria** (what must be TRUE):
  1. Approving SI on a single-photo brief results in a live Instagram post visible on the Propulsar profile within 90 seconds
  2. The WhatsApp approval number receives a success message containing "Publicado" plus the live IG permalink URL
  3. Manually killing the publish network call mid-flight does NOT create a duplicate post on Instagram (confirms `media_publish` retry is disabled)
  4. The Google Sheets log gains `IG_URL` and `Publicado_En` columns; the new row contains the permalink and publication timestamp
  5. The n8n execution shows a 30-second Wait between container creation and `media_publish`, confirming the container readiness guard is in place
**Plans**: 2 plans
- [ ] 05-01-PLAN.md — Add IG publish chain (5 new nodes + carousel guard + Sheets Log cross-refs) to n8n/workflow.json
- [ ] 05-02-PLAN.md — Deploy to n8n-azure, add Sheet columns, run Tests A (happy path) + B (duplicate prevention) + C (30s Wait trace)

### Phase 6: Facebook Single-Photo Publishing
**Goal**: After SI approval, the same single-photo post is also published to Facebook and both the IG and FB URLs appear together in the WhatsApp success message
**Depends on**: Phase 5 (IG publish verified; shared blob URL reused for FB)
**Requirements**: FBPUB-01, FBPUB-03
**Success Criteria** (what must be TRUE):
  1. Approving SI on a single-photo brief results in a live Facebook post on the Propulsar page within 90 seconds of the IG post
  2. The WhatsApp success message contains both the IG permalink and the FB post URL (not two separate messages — one combined message)
  3. The Google Sheets row contains both `IG_URL` and `FB_URL` columns populated after a successful publish
**Plans**: TBD

### Phase 7: Carousel Publishing (IG + FB)
**Goal**: Approving a multi-slide carousel brief publishes the full carousel to both Instagram and Facebook with all slides in correct order
**Depends on**: Phase 6 (single-post IG + FB verified; blob re-hosting for N images from Phase 4)
**Requirements**: IGPUB-02, FBPUB-02, FBPUB-04
**Success Criteria** (what must be TRUE):
  1. Approving SI on a 5-slide carousel results in a live IG carousel post with all 5 slides in the correct order, visible on the Propulsar profile
  2. The same approval creates a FB multi-photo post with all 5 images visible on the Propulsar page
  3. The IG carousel uses the correct 3-step flow (N child containers → parent carousel container → `media_publish`); a 30-second Wait after child container creation is present in the execution trace
  4. The FB carousel body is constructed dynamically from N blob URLs in a Code node (not hardcoded); a brief with 3 slides produces `attached_media[0..2]` and a brief with 7 slides produces `attached_media[0..6]`
**Plans**: TBD

### Phase 8: Scheduling
**Goal**: Users can choose to publish immediately or at a specific time today or tomorrow (max 24h ahead), and n8n holds the execution safely until that time
**Depends on**: Phase 7 (full publish pipeline verified for both single and carousel before adding a Wait node in front of it)
**Requirements**: WIZ-07, WIZ-08, WIZ-09, SCHED-01, SCHED-02, SCHED-03, SCHED-04
**Success Criteria** (what must be TRUE):
  1. The Wizard presents a publish-time prompt after the brief is built; entering "ahora" sends `publish_at: "now"` in the JSON and the post publishes immediately without any Wait node delay
  2. Entering "hoy 15:30" (CET) sends a UTC ISO string in `publish_at`; the n8n execution pauses at the Wait node and the post publishes at the correct local time
  3. Entering a time that is already in the past triggers a Wizard warning and forces the user to choose "ahora" or enter a future time — the brief is never sent with a past timestamp
  4. If a past timestamp somehow reaches n8n, the Code node guard before the Wait node reroutes to immediate publishing — the execution does not hang
  5. Verifying `min-replicas=1` in Azure Container Apps is confirmed as a prerequisite before this phase is tested; a 2-minute-ahead scheduled post survives container idle state
**Plans**: TBD

### Phase 9: Error Hardening + Hashtags + Token Alerts
**Goal**: All Meta API failures surface to the user via WhatsApp with actionable details, hashtags post as first comments, expired tokens are detected immediately, and orphaned blobs are cleaned up
**Depends on**: Phase 8 (full pipeline including scheduling verified)
**Requirements**: IGPUB-06, NOTIF-02, NOTIF-03, LOG-03, ERR-01, ERR-03, ERR-04, REHOST-06
**Success Criteria** (what must be TRUE):
  1. Simulating a Meta API failure (invalid token or network error) sends a WhatsApp message containing the error code, human-readable message, `fbtrace_id`, and which platform failed (IG/FB/both)
  2. After a successful IG publish, a first comment appears on the post containing the hashtag block (not in the caption — caption remains clean)
  3. Using an expired or revoked Meta token sends a specific WhatsApp alert: "Token Meta expirado — verificar que Susana sigue como admin de la página" (not a generic error)
  4. A publish failure creates a Google Sheets row with `Publish_Status=failed` and the error message — the audit trail is complete even when publishing does not succeed
  5. After a successful publish, the Azure Blob files for that post are deleted; after a confirmed failure, blobs are also cleaned up — no orphaned storage accumulates
**Plans**: TBD

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Wizard Carousel Flow | v1.0 | 2/2 | Complete | 2026-04-04 |
| 2. n8n Content Generation | v1.0 | 2/2 | Complete | 2026-04-06 |
| 3. n8n Image Generation + WhatsApp Preview | v1.0 | 3/3 | Complete | 2026-04-06 |
| 4. Azure Blob Re-hosting | v1.1 | 0/? | Not started | - |
| 5. Instagram Single-Photo Publishing | v1.1 | 0/2 | Not started | - |
| 6. Facebook Single-Photo Publishing | v1.1 | 0/? | Not started | - |
| 7. Carousel Publishing (IG + FB) | v1.1 | 0/? | Not started | - |
| 8. Scheduling | v1.1 | 0/? | Not started | - |
| 9. Error Hardening + Hashtags + Token Alerts | v1.1 | 0/? | Not started | - |
