# Pitfalls Research

**Domain:** Automatic social media publishing — Meta Graph API + Azure Blob Storage + n8n Wait node scheduling
**Researched:** 2026-04-10
**Confidence:** HIGH (Meta official docs verified) / HIGH (n8n community confirmed) / HIGH (Azure confirmed)
**Scope:** Adding v1.1 publishing features to the existing Propulsar Content Engine pipeline

---

## Critical Pitfalls

### Pitfall 1: Retrying the publish endpoint double-posts

**What goes wrong:**
The two-step Meta publish flow has asymmetric idempotency. `POST /<IG_ID>/media` (container creation) is safe to retry — same parameters return the same container ID. `POST /<IG_ID>/media_publish` is NOT idempotent — calling it twice on the same container produces two separate live posts.

**Why it happens:**
Network timeouts in n8n HTTP Request nodes trigger automatic retries by default. If the first publish call succeeds but the response gets lost (timeout, Azure Container Apps cold-start delay), n8n retries and publishes again.

**How to avoid:**
- Disable HTTP Request node retries for the `media_publish` call specifically (set `Retry on Fail` = off).
- Before retrying on any publish error, check the container status via `GET /<container_id>?fields=status_code`. If status is `PUBLISHED`, the post is live — do not retry.
- Store the container ID in Supabase immediately after creation (before publish). On retry, look up the stored ID and check its status before attempting publish again.

**Warning signs:**
- Duplicate posts appearing on Instagram/Facebook during testing.
- n8n execution history showing two successful HTTP calls to `media_publish` for one workflow run.

**Phase to address:** Publishing phase (Meta Graph API integration node build)

---

### Pitfall 2: Publishing a carousel before all child containers reach FINISHED

**What goes wrong:**
Creating the carousel parent container while one or more child containers are still `IN_PROGRESS` returns an API error and the carousel publish fails entirely. The error message is cryptic: `(#9007) The provided image URL is not accessible`.

**Why it happens:**
Each Ideogram image URL must be cURL'd by Meta's servers. Meta fetches images asynchronously after the child container is created. The fetch can take 5–60 seconds. If you chain child creation → parent creation → publish in a single n8n path with no wait, child containers will not be FINISHED.

**How to avoid:**
- After creating all child containers, poll each one: `GET /<container_id>?fields=status_code` once per minute, max 5 minutes.
- Only proceed to parent container creation when ALL children return `status_code=FINISHED`.
- If any child returns `ERROR` or never reaches `FINISHED` after 5 minutes, abort the entire carousel and send a WhatsApp failure notification.
- In n8n 2.14.2 with IF v1 constraints: use a Code node with `$helpers.httpRequest` to implement the polling loop, since a true loop in n8n requires SplitInBatches (which has the known Done-branch reference bug). Alternatively, implement a short fixed 30s Wait node after all child containers are created — acceptable for images, not for videos.

**Warning signs:**
- `(#9007)` errors from Meta API.
- Carousel publishes succeed in testing (where images are small/fast) but fail in production (larger Ideogram files).

**Phase to address:** Publishing phase — carousel-specific branch of the n8n workflow

---

### Pitfall 3: Ideogram ephemeral URLs expire before Meta fetches them

**What goes wrong:**
Meta fetches the `image_url` parameter asynchronously after container creation. If the Ideogram signed URL has expired by the time Meta's servers attempt to fetch it, the container enters `ERROR` state and the post cannot be published. This is the primary reason v1.1 requires Azure Blob Storage re-hosting.

**Why it happens:**
Ideogram URLs include `?exp=&sig=` query parameters. These are time-limited signed URLs. If the scheduling delay between Wizard approval and actual publish is more than 1–2 hours, the URL will be expired. Even for "publish now" flows, Ideogram URLs can expire if the n8n workflow has intermediate delays (approval wait, image generation pipeline).

**How to avoid:**
- ALWAYS download the Ideogram image and re-host it in Azure Blob Storage before sending any URL to Meta.
- Never pass an Ideogram URL directly to `image_url` in Meta API calls.
- The Azure Blob URL (public container or long-lived SAS) must remain valid for the entire scheduling window (max 24h in scope).
- When downloading Ideogram images via n8n HTTP Request node: preserve the full URL including query params. Never strip `?exp=` or `?sig=`.

**Warning signs:**
- Container status stuck at `IN_PROGRESS` then transitioning to `ERROR`.
- Works in testing (immediate publish) but fails for scheduled posts.

**Phase to address:** Azure Blob Storage re-hosting phase (must be built before Meta publishing phase can be tested end-to-end)

---

### Pitfall 4: Azure SAS URL expires before Meta fetches the image

**What goes wrong:**
If Azure Blob Storage is configured with private access and SAS URLs, and the SAS token is generated with a short expiry (e.g., 1 hour), the URL may expire before Meta's servers fetch the image — especially for scheduled posts.

**Why it happens:**
SAS tokens have explicit expiry timestamps. A post scheduled for "tomorrow 09:00" needs the image URL to remain valid 12–24 hours after the SAS is generated.

**How to avoid:**
- Use a public container in Azure Blob Storage (no SAS needed, URLs are permanent until blob is deleted). This is appropriate for temporary image staging — blobs are cleaned up after publishing.
- If a private container is required for any reason, generate SAS tokens with expiry of at least `scheduling_delay + 2 hours` buffer.
- Recommended approach: public container + UUID filename + cleanup job after publish confirmation.

**Warning signs:**
- Meta returns `(#9007) The provided image URL is not accessible` for scheduled posts but not immediate ones.
- Azure portal shows the blob exists but Meta cannot fetch it.

**Phase to address:** Azure Blob Storage re-hosting phase

---

### Pitfall 5: n8n Wait node gets stuck when scheduled time is in the past

**What goes wrong:**
If the Wizard generates an ISO datetime string that has already passed (e.g., user says "today at 09:00" and it is already 09:05), the n8n Wait node does not fire immediately — it gets stuck indefinitely and the execution hangs.

**Why it happens:**
Known n8n bug (tracked as issue #14198 / #15123 duplicate). The Wait node's "Wait Until" mode does not handle past timestamps gracefully. It neither errors nor fires immediately — the execution enters a zombie waiting state.

**How to avoid:**
- In the Wizard (wizard/run.js), before sending the webhook: if `scheduledTime` is in the past (even by 1 minute), override to "publish now" mode and log a warning to the user.
- In the n8n workflow: add a Code node before the Wait node that compares the scheduled datetime to `new Date()`. If `scheduledTime <= now`, skip the Wait node by outputting a flag, then use IF v1 to branch around the Wait node.
- Never trust user input for scheduled times without validation.

**Warning signs:**
- n8n execution stuck in "waiting" state indefinitely with no timeout.
- Executions panel shows the workflow running but no new activity for hours.

**Phase to address:** Scheduling phase (Wizard scheduling input + n8n Wait node setup)

---

### Pitfall 6: n8n Wait node timeout interaction on Azure Container Apps

**What goes wrong:**
n8n's `EXECUTIONS_TIMEOUT` environment variable defaults to `-1` (no timeout). However, if the Azure Container App is configured with an HTTP request timeout or the container is restarted (scale-to-zero, maintenance, deployment), executions waiting in the Wait node are lost. The workflow does not resume after container restart.

**Why it happens:**
Wait node "Wait Until" stores the resumption time in the n8n database (SQLite/PostgreSQL). On container restart, n8n should resume waiting executions — but this requires the webhook server to be running. If Azure Container Apps scales the instance to zero during a long wait (e.g., overnight scheduling), the Wait node may not be resumed on wakeup.

**How to avoid:**
- Verify the Azure Container App for `propulsar-n8n` has min replicas = 1 (no scale-to-zero). Check in the Azure portal under Container Apps → Scale and replicas.
- Use the n8n Supabase state pattern already in the project: store `{ container_id, scheduled_time, status: "pending" }` in Supabase at the moment of scheduling. Add a separate n8n Schedule Trigger workflow (runs every 5 minutes) that queries Supabase for pending posts whose `scheduled_time <= now` and publishes them. This is more resilient than relying on Wait node persistence.
- The Supabase polling approach decouples scheduling from execution continuity.

**Warning signs:**
- Scheduled posts silently never publish after Azure maintenance windows.
- n8n logs show no execution activity for a workflow that had pending Wait nodes.

**Phase to address:** Scheduling phase — architecture decision (Wait node vs Supabase polling scheduler)

---

### Pitfall 7: n8n IF node regression — new branches must use IF v1

**What goes wrong:**
Every new conditional branch added for v1.1 (publish success/failure routing, scheduled vs immediate path, single vs carousel publish path) that uses IF v2 or Switch v3 will silently route to TRUE/first-output regardless of the actual condition. This reproduces the same bug that caused the v1.0 IF routing debug session.

**Why it happens:**
Confirmed bug in n8n 2.14.2: IF v2 condition evaluation is broken. Switch v3 also affected. This is documented in PROJECT.md from the v1.0 experience.

**How to avoid:**
- Every new conditional node must use IF v1 (typeVersion: 1) with string comparisons.
- When uploading the updated workflow.json via API, verify that no IF nodes have `typeVersion` > 1 in the JSON.
- Add a pre-upload check in the deploy script: `grep -n '"typeVersion"' n8n/workflow.json | grep -v ': 1'` to catch any non-v1 IF/Switch nodes.
- Never accept auto-generated workflow.json from n8n UI export without checking IF node versions — the UI defaults to the latest broken version.

**Warning signs:**
- Approval routing always goes to "published" branch even when Meta returns an error.
- Scheduled vs immediate branching always takes the same path.
- The symptom is always "condition check silently passes/fails wrong" with no error message.

**Phase to address:** All phases that add new routing branches

---

### Pitfall 8: Credential re-linking required after every workflow.json upload

**What goes wrong:**
After uploading the updated workflow.json via the n8n API, all nodes that use n8n credentials (OpenAI, Google Sheets, Supabase) lose their credential binding. The workflow silently fails on those nodes with "Credentials not found" or uses no credentials at all.

**Why it happens:**
The n8n API does not bind credentials from JSON — it only stores the credential name/ID reference. If the target n8n instance has credentials stored under different internal IDs than the exported JSON expects, nodes become unlinked. This is a known limitation documented in n8n's export/import docs.

**How to avoid:**
- After every workflow upload, manually open each credential-dependent node in n8n UI and reselect the credential from the dropdown. This is a required manual step — not automatable with the current n8n API.
- Document the list of nodes requiring credential re-linking in the deployment runbook (SETUP.md). For v1.1, this will include any new Google Sheets log nodes and the Azure Blob upload HTTP Request node (if using n8n Azure Storage credentials).
- For the Meta token: store it as an n8n credential (Header Auth type: `Authorization: Bearer <token>`), not as a hardcoded value in the HTTP Request node body or URL. This prevents token leakage in workflow.json git commits.

**Warning signs:**
- "Credentials not found" errors in n8n execution log immediately after deployment.
- HTTP Request nodes returning 401 for APIs that were working before the upload.

**Phase to address:** All deployment steps — this is a known workflow, document and follow it

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcode Meta token directly in HTTP Request node URL | Faster to test | Token leaks in workflow.json if committed to git; token rotation requires manual workflow edit | Never — use n8n Header Auth credential |
| Skip polling child container status, use fixed 30s Wait | Simpler workflow | Fails when Ideogram is slow; fails in production with larger images | Only for single-image posts (not carousels) |
| Skip Azure Blob re-hosting, pass Ideogram URL directly to Meta | Saves Azure setup | Scheduled posts always fail; even immediate posts fail if pipeline takes >1h | Never — required for any scheduling scenario |
| Keep SplitInBatches removed (current approach) | Avoids Done-branch bug | Cannot build true polling loops in n8n natively | Acceptable in n8n 2.14.2 — use Code node with $helpers.httpRequest for polling |
| Single workflow for both scheduling and publishing | Simpler architecture | Wait node persistence depends on container uptime | Acceptable only if min-replicas=1 is confirmed |
| Use IF v2 because n8n UI defaults to it | Marginally faster to drag | Routing silently broken | Never — always downgrade to IF v1 |

---

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Meta Graph API | Passing Ideogram signed URL directly as `image_url` | Download and re-host in Azure Blob first, pass the Azure URL |
| Meta Graph API | Calling `media_publish` without checking child container `status_code=FINISHED` | Poll all child containers; only publish parent when all are FINISHED |
| Meta Graph API | Calling `media_publish` twice on network error (double-post) | Disable retries on publish node; check container status before any retry |
| Meta Graph API | Using User access token instead of Page access token for FB page | Use Page access token (token obtained from Susana's admin session — already done for v1.0) |
| Meta Graph API (Facebook) | Posting carousel as IG carousel to FB (wrong endpoint) | FB carousel uses `/{page-id}/photos` with `published=false` per image, then `/{page-id}/feed` with `attached_media[n]` |
| Meta Graph API | Caption > 2200 chars on Instagram (silently truncates or errors) | GPT-4o prompt must cap IG captions at 2200 chars; FB has no practical limit |
| Meta Graph API | > 30 hashtags in IG caption (post may fail or hashtags stripped) | Prompt GPT-4o to include max 20-25 hashtags for safety margin |
| Azure Blob Storage | Uploading image without setting `Content-Type: image/jpeg` header | Always set `x-ms-blob-type: BlockBlob` AND `Content-Type: image/jpeg` in PUT request headers |
| Azure Blob Storage | Using same filename for concurrent posts (filename collision) | Use UUID or `{timestamp}_{post_topic_slug}` as blob name |
| Azure Blob Storage | Orphaned blobs accumulating cost after failed/cancelled posts | Add cleanup step in success and failure branches: DELETE blob after publish confirmation |
| n8n Wait node | Setting scheduled time as Spain local time without UTC conversion | n8n runs UTC internally; convert with `DateTime.fromISO(localTime, {zone: 'Europe/Madrid'}).toUTC().toISO()` in Wizard before sending webhook |
| n8n HTTP Request | Uploading binary image data as JSON body | Use Body Content Type = Binary Data; source = the binary output from the image download HTTP Request node |
| YCloud WhatsApp | Sending publish success notification before verifying Meta returned a media ID | Check that `media_publish` response contains `id` field before sending success WA message |

---

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Sequential Ideogram generation + sequential child container creation + polling each child | Carousel publish flow takes 3-5 minutes per post | Acceptable at current scale (1-5 posts/day) | If scaling to 20+ posts/day, parallelize container creation |
| Fetching container status once and proceeding | Passes in dev (fast Meta servers), fails in production | Poll with retry loop, not a one-shot check | First time Meta servers are slow (common under load) |
| Azure Blob blobs never deleted | Storage cost grows unbounded | Delete blob after confirmed publish | After ~1000 posts with no cleanup (~$0.05 accumulated) |
| n8n execution history filling up | n8n UI becomes slow, database grows | Configure `EXECUTIONS_DATA_PRUNE=true` and `EXECUTIONS_DATA_MAX_AGE=168` (7 days) in Azure Container App env vars | After ~500 executions with debug logging on |

---

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Committing Meta Page Token to git (in workflow.json or .env) | Token exposed in repo history; bad actor can post to Propulsar's social accounts | Store as n8n Header Auth credential; never hardcode in workflow.json; .env is in .gitignore (verify) |
| Storing Azure Blob storage account key in workflow.json | Full storage account compromise | Use n8n Azure Storage credential type OR environment variable in Azure Container App (not in workflow.json) |
| Public Azure Blob container without lifecycle cleanup | Old images publicly accessible indefinitely; minor privacy concern for client content | Add automated cleanup on publish confirmation; acceptable if content is already public (social posts) |
| Susana losing Facebook page admin silently killing token | Posts stop publishing with no alert | Add error handler: if Meta returns `OAuthException` code 190, send WhatsApp alert to Felix with exact error. Check admin status monthly. |

---

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Felix schedules post for 09:00, it publishes at 07:00 (UTC) | Wrong time in Spain (summer: UTC+2 difference) | Wizard shows confirmation "Will publish at 09:00 Spain time (07:00 UTC)" before sending webhook |
| No WhatsApp confirmation when post is actually live | Felix doesn't know if it published | Send WA message with IG URL + FB URL after successful `media_publish` |
| Error message from Meta lost in n8n Code node try/catch | Felix gets "something failed" with no useful debug info | Always include Meta error `message`, `type`, `code`, and `fbtrace_id` in WhatsApp failure notification |
| Scheduling "today at 09:00" at 08:59 → publishes 1 min late or gets stuck | Frustrating timing UX | Enforce 5-minute minimum scheduling window; if < 5 min away, default to "now" |
| Published post URL not shown | Felix must manually find the post to verify it looks right | WhatsApp success notification must include both `https://www.instagram.com/p/{shortcode}` and the FB post URL |

---

## "Looks Done But Isn't" Checklist

- [ ] **Meta publishing:** Container created but never published — verify `media_publish` call exists and returns a media `id`, not just a container `id`
- [ ] **Carousel:** Child containers created but parent carousel never assembled — verify the `media_type=CAROUSEL` step and `children` array exist in workflow
- [ ] **Facebook:** Instagram published but Facebook skipped — verify FB `/{page-id}/photos` + `/{page-id}/feed` branch exists separately from IG branch
- [ ] **Image re-hosting:** Azure upload HTTP Request node built but `Content-Type` header missing — Meta will reject as "unsupported format"
- [ ] **Scheduling:** Wait node added but no past-time guard — test with a time 1 minute in the past to confirm it doesn't hang
- [ ] **Token:** Meta token stored as n8n credential — verify workflow.json contains credential reference (not the raw token string) before committing
- [ ] **Error handling:** Failure branch exists — verify that a Meta 4xx/5xx response routes to WhatsApp error notification, not silently dropped
- [ ] **Blob cleanup:** Blob deletion step exists in BOTH success and failure branches — not just success
- [ ] **Credential re-linking:** After workflow upload, manually relink all credential-dependent nodes before first production test

---

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Double-post (publish called twice) | MEDIUM | Manually delete duplicate post via Meta Business Suite; check Supabase state to understand which container ID was published; add dedup guard before next deploy |
| Wait node stuck (past time) | LOW | Delete the stuck execution in n8n UI; rerun Wizard with corrected future time; no data lost |
| All child containers ERROR (carousel failed) | LOW | Check n8n execution log for Meta error code; regenerate images if URL expired; rerun full Wizard for that post |
| Meta token OAuthException code 190 (token invalid) | HIGH | Susana must re-authenticate via Meta Business Suite and generate new Page Access Token; update n8n credential; update Azure Container App env var `META_PAGE_TOKEN` |
| Azure Blob URL inaccessible (SAS expired or container private) | LOW | Change container to public access in Azure portal; regenerate blob URL; rerun publish step |
| Credential unlinked after workflow upload | LOW | Open n8n UI, relink credential in each affected node; 5-10 minute manual task per deployment |

---

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Double-post on retry | Phase: Meta publishing node build | Run publish node, simulate network error, verify no duplicate appears on IG |
| Carousel child not FINISHED before parent | Phase: Carousel publishing branch | Test with simulated slow image fetch (large file); verify polling loop waits |
| Ideogram URL expiry | Phase: Azure Blob re-hosting | Verify no `cdn.ideogram.ai` URLs reach Meta API calls in workflow |
| Azure SAS expiry | Phase: Azure Blob re-hosting | Check container access level is public before first end-to-end test |
| Wait node stuck on past time | Phase: Scheduling (Wizard + n8n) | Test: send webhook with `scheduledTime = now - 5 minutes`, verify immediate publish or graceful fallback |
| Azure Container App scale-to-zero | Phase: Scheduling | Verify min-replicas=1 in Azure portal before scheduling feature goes live |
| IF v1 regression (new branches) | Every phase adding routing | Pre-upload grep check for `typeVersion > 1` in workflow.json |
| Credential re-linking after upload | Every deployment | Post-deploy checklist item in SETUP.md |
| Meta token silent expiry | Ongoing operations | Add OAuthException 190 → WhatsApp alert handler in error branch |
| Carousel aspect ratio mismatch | Phase: Image generation (already solved in v1.0 with Ideogram consistent prompting) | Verify all N Ideogram outputs use same aspect ratio (1080x1080 square or 1080x1350) |

---

## Sources

- [Meta Graph API: Content Publishing](https://developers.facebook.com/docs/instagram-platform/content-publishing/) — rate limits (50 posts/24h), carousel steps, polling recommendation
- [Meta Graph API: IG Container status codes](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-container/) — FINISHED/IN_PROGRESS/ERROR/EXPIRED/PUBLISHED
- [Meta Graph API: IG User Media](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media/) — JPEG only, 8MB max, 320-1440px width, 4:5 to 1.91:1 aspect ratio, sRGB
- [Meta Graph API: Media Publish](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/media_publish/) — 50 posts/24h confirmed, response format
- [Meta Graph API: Content Publishing Limit](https://developers.facebook.com/docs/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit/) — how to check quota usage
- [Meta Graph API: Facebook Page Photos](https://developers.facebook.com/docs/graph-api/reference/page/photos/) — FB carousel via attached_media + published=false pattern
- [n8n Community: Wait node stuck on past time](https://community.n8n.io/t/wait-node-stuck-on-execution-when-time-is-in-the-past/45890) — confirmed bug, stuck indefinitely
- [n8n GitHub Issue #15123](https://github.com/n8n-io/n8n/issues/15123) — Wait node timeout interaction bug, tracked as duplicate of #14198
- [n8n Community: Long Wait node marks execution failed](https://community.n8n.io/t/long-wait-node-time-marks-the-execution-as-failed-although-it-succeeded/43759) — Wait node reliability issues
- [n8n Docs: Execution timeout config](https://docs.n8n.io/hosting/configuration/configuration-examples/execution-timeout/) — EXECUTIONS_TIMEOUT defaults to -1
- [n8n Community: Credential unavailable for workflows created via API](https://community.n8n.io/t/credentials-unavailable-for-workflows-created-via-n8ns-api/183099) — confirms credential re-linking is required after API upload
- [PROJECT.md — Propulsar Content Engine](..%2FPROJECT.md) — IF v2/Switch v3 bug in n8n 2.14.2 (Felix's own verified experience), SplitInBatches Done-branch reference bug, credential re-linking pattern, Ideogram ephemeral URL behavior

---
*Pitfalls research for: Propulsar Content Engine v1.1 Automatic Publishing*
*Researched: 2026-04-10*
