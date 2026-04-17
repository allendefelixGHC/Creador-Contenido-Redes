---
phase: 09-error-hardening-hashtags-token-alerts
plan: 03
subsystem: api
tags: [n8n, meta-graph-api, error-handling, azure-storage, whatsapp, google-sheets, e2e-testing]

# Dependency graph
requires:
  - phase: 09-02
    provides: "73-node workflow with error handler subgraph; Tag IG/FB Error Set nodes; Parse Meta Error Code node; Sheets Fail Log; blob cleanup chain"
  - phase: 09-01
    provides: "Hashtag comment nodes; Azure SAS with delete permission"
provides:
  - "Deployed 73-node workflow on n8n-azure with all Phase 9 features active"
  - "Error handler verified end-to-end: error_code, error_message, fbtrace_id, platform all extracted correctly"
  - "Sheets Fail Log writes Publish_Status=failed + Error_Msg with error details"
  - "Blob cleanup confirmed on error path (blob URL returns 404 after failed publish)"
  - "WA error notification confirmed sent to approval number with correct content"
  - "Test C (token expired path) structurally verified — code correct, contains 'Susana'"
affects:
  - "Production n8n-azure workflow — final v1.1 state"

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Tag IG/FB Error as Code nodes (not Set nodes) — Set v3.4 drops 'error' JSON key even with includeOtherFields=true; Code node with spread operator explicitly preserves all fields"
    - "Two-stage JSON decode for AxiosError messages: JSON.parse twice — first to unwrap the quoted JSON string, then to parse the inner object"
    - "Sheets Fail Log cross-references Parse Meta Error node — after WA notification fires, $json context is WA API response, not error data; cross-ref is required"

key-files:
  created: []
  modified:
    - "n8n/workflow.json"

key-decisions:
  - "Tag IG/FB Error nodes changed from Set v3.4 to Code nodes — Set node with includeOtherFields=true silently drops the 'error' JSON key that HTTP Request nodes add on continueErrorOutput; Code node spread operator (const item = {...$input.item.json}) preserves all keys"
  - "Parse Meta Error uses two-stage JSON decode — AxiosError wraps Meta API 400 response as a double-encoded JSON string ('400 - \\\"<json>\\\"'); single JSON.parse fails; need to extract the quoted string first, then parse it"
  - "Sheets Fail Log uses $('Parse Meta Error').item.json cross-ref — WA API response replaces $json after notification node fires; cross-reference is the only way to access the original error data at Sheets logging time"
  - "Hashtag comment permission (instagram_manage_comments) not in current Meta token scopes — Success Criteria 2 (hashtag comment on IG post) cannot be verified without adding this scope to the Facebook App and regenerating the token"
  - "Comment failures route through error handler by design (from Plan 01/02) — this means comment failures trigger WA error alert and Sheets fail log even though the post itself was published"
  - "No test posts created for cleanup — all Test B variants used invalid IG account ID 999999999999 which was rejected before any post was created"

patterns-established:
  - "Code node error tagger pattern: use Code node instead of Set node when preserving HTTP Request error output items; Set node drops reserved keys"
  - "Two-stage AxiosError decode: qStart=msg.indexOf('\"'); JSON.parse twice for nested JSON strings"
  - "Downstream node cross-refs after WA notification: all nodes after WA notification must cross-ref the data source node directly"

# Metrics
duration: ~3h (multiple E2E test iterations + 4 bug fixes)
completed: 2026-04-17
---

# Phase 9, Plan 03: Deploy + E2E Tests Summary

**Deployed 73-node workflow to n8n-azure and verified error handler end-to-end: error_code=100, fbtrace_id, platform extracted from Meta API failures; Sheets fail log populated; blobs deleted; 4 bugs fixed in error handler subgraph during live testing**

## Performance

- **Duration:** ~3h (deploy + multiple test iterations + 4 bug fixes)
- **Started:** 2026-04-17T18:30:00Z
- **Completed:** 2026-04-17T20:00:00Z
- **Tasks:** 3/3 complete (Task 3 = checkpoint:human-verify — APPROVED 2026-04-17)
- **Files modified:** 1

## Accomplishments

- Workflow deployed to n8n-azure: 73 nodes, active=true
- All 13 Phase 9 nodes confirmed present after deploy
- 4 bugs in error handler subgraph discovered and fixed during E2E testing
- Test B6 confirmed: error_code=100, error_message, fbtrace_id="AE0fpcPQCJeQn0L1NVpgNtw", platform=Instagram
- Sheets fail log row: Publish_Status=failed, Error_Msg="Unsupported post request...[fbtrace_id]"
- WA error notification sent (confirmed by YCloud API response id)
- Blob cleanup on error path: blob URL returns 404 after failed execution
- Test C (token expired) structurally verified: OAuthException code 190 → is_token_expired=true → WA alert with "Susana"

## Task Commits

1. **Task 1: Deploy workflow + verify Azure SAS** — `c0dc61d` (fix: initial mode bug found immediately during first deploy)
2. **Task 2: E2E tests + bug fixes** — `130ffdf` (fix: 3 additional bugs fixed after live testing)

## Files Created/Modified

- `n8n/workflow.json` — Tag IG/FB Error changed to Code nodes; Parse Meta Error fixed (mode + JSON decode); Sheets Fail Log cross-ref added

## Decisions Made

- **Tag IG/FB Error → Code nodes**: Set v3.4's `includeOtherFields: true` silently drops the `error` JSON key that n8n adds when HTTP Request nodes produce error output. Code node with spread is required to preserve it.
- **Two-stage JSON decode in Parse Meta Error**: AxiosError.message wraps the Meta API 400 response as a double-encoded JSON string (`"400 - \"<json_string>\""` where the inner value has escaped quotes). Single `JSON.parse` on the slice between `{}` fails because the inner quotes are backslash-escaped. Solution: extract the quoted string from `"..."` and call `JSON.parse` twice.
- **Sheets Fail Log cross-references**: After the WA error notification node fires, `$json` in the next node (Sheets) is the YCloud API response object (id, status, from, to...). The original Parse Meta Error output must be accessed via `$('🚨 Parse Meta Error').item.json`.
- **Hashtag comment requires instagram_manage_comments scope**: Current Meta token only has `instagram_content_publish` and related scopes. Success Criteria 2 (hashtag as first IG comment) cannot be verified until this scope is added to the Facebook App and the token is regenerated by Susana.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] parse-meta-error mode: runOnceForEachItem → runOnceForAllItems**
- **Found during:** Task 2, exec 147 (first approval attempt)
- **Issue:** Code node used `$input.first()` but mode was `runOnceForEachItem`. Error: "Can't use .first() here"
- **Fix:** Changed `mode: "runOnceForEachItem"` to `mode: "runOnceForAllItems"` in node parameters
- **Files modified:** n8n/workflow.json
- **Committed in:** c0dc61d

**2. [Rule 1 - Bug] Tag IG/FB Error Set nodes drop 'error' field**
- **Found during:** Task 2, execs 150-159 (error handler not extracting Meta error data)
- **Issue:** Set v3.4 with `includeOtherFields: true` silently drops the `error` JSON key even though it appears in the source item. Parse Meta Error received `{"_platform": "Instagram"}` only — all error data lost.
- **Fix:** Changed both Tag IG Error and Tag FB Error from Set v3.4 nodes to Code nodes using `const item = {...$input.item.json}; item._platform = '...'; return {json: item};`
- **Files modified:** n8n/workflow.json
- **Verification:** Exec 159+ shows Tag output has all keys including `error`
- **Committed in:** 130ffdf

**3. [Rule 1 - Bug] Parse Meta Error extracts wrong data from AxiosError message**
- **Found during:** Task 2, exec 162 (even after Tag fix, error_code=0 still)
- **Issue:** `rawErr.code` is `"ERR_BAD_REQUEST"` (string, truthy), causing early return with wrong object. Even with typeof check fix, the `JSON.parse(msg.slice(start, end+1))` failed because inner quotes are backslash-escaped — not valid JSON.
- **Fix:** Two-stage decode: `qStart = msg.indexOf('"')`, extract `msg.slice(qStart, qEnd+1)`, then `JSON.parse(JSON.parse(outer_string))`
- **Files modified:** n8n/workflow.json
- **Verification:** Exec 162 shows error_code=100, fbtrace_id="ANcSKc7hm_ZHfeSIQFGwzuf"
- **Committed in:** 130ffdf

**4. [Rule 1 - Bug] Sheets Fail Log Error_Msg shows "undefined [undefined]"**
- **Found during:** Task 2, execs 150-162 (Sheets row had wrong Error_Msg)
- **Issue:** After WA error notification fires, `$json` is the YCloud API response. Sheets Fail Log used `$json.error_message` and `$json.fbtrace_id` which resolved to `undefined`.
- **Fix:** Changed Sheets Fail Log Tema/Plataformas/Error_Msg expressions to cross-reference Parse Meta Error node: `$('🚨 Parse Meta Error').item.json.error_message`
- **Files modified:** n8n/workflow.json
- **Verification:** Exec 165 shows Error_Msg="Unsupported post request...[AE0fpcPQCJeQn0L1NVpgNtw]"
- **Committed in:** 130ffdf

---

**Total deviations:** 4 auto-fixed (4x Rule 1 bugs in error handler subgraph)
**Impact on plan:** All bugs were in Phase 9 Plan 02 code that couldn't be caught without live Meta API errors. The error handler now works correctly end-to-end.

## Issues Encountered

**1. Instagram comment permission (instagram_manage_comments) missing from Meta token**
- The `IG: Post Hashtag Comment` node returns code 10 ("Application does not have permission for this action")
- Current token scopes: `pages_show_list, instagram_basic, instagram_content_publish, pages_read_engagement, pages_manage_posts, public_profile`
- Missing: `instagram_manage_comments`
- Impact: Success Criteria 2 (hashtag as first IG comment) cannot be verified
- Resolution: Need to add `instagram_manage_comments` to the Facebook App, then Susana regenerates the token
- Comment failure currently routes to the error handler (Tag IG Error path) — this causes the error WA notification to fire even when the post itself was published. This is by design from Plan 01/02.

**2. Session approval_number format mismatch**
- First approval attempt routed to "Loguear rechazo" (rejection path)
- Root cause: Brief sent without `+` prefix, but Supabase match uses exact string comparison with YCloud `from` field which includes `+`
- Resolution: Added `+` prefix to approval_number in test brief; plan notes this in Phase 08 decisions
- This is a known decision, not a new bug

**3. Multiple Supabase pending sessions caused "Cannot coerce to single JSON object" error**
- After multiple test briefs, multiple pending sessions existed
- Supabase query with `limit=1` + `Accept: application/vnd.pgrst.object+json` fails with multiple rows
- Resolution: DELETE pending sessions before each test run
- This is a known decision from Phase 07-08 (tests must run sequentially)

## User Setup Required

**REQUIRED: Add instagram_manage_comments to Meta App**

To enable hashtag comments on published posts (Success Criteria 2):
1. Go to developers.facebook.com → Your App → "Propulsar Content Engine"
2. Add permission: `instagram_manage_comments`
3. Susana regenerates the token with the new scope (must be done from her account as Page admin)
4. Update `META_PAGE_TOKEN` in Azure Container Apps env vars for `propulsar-n8n`
5. Verify: Send a test post → approve → confirm hashtag comment appears on IG

## Success Criteria Status

| # | Criterion | Status | Exec |
|---|-----------|--------|------|
| 1 | Meta API failure → WA message with error_code, message, fbtrace_id, platform | PASS | exec 162, 165 |
| 2 | IG publish → first comment with hashtag block | BLOCKED (instagram_manage_comments missing) | exec 147 |
| 3 | Expired token → specific WA alert mentioning Susana | STRUCTURAL PASS | code verified |
| 4 | Publish failure → Sheets row with Publish_Status=failed + Error_Msg | PASS | exec 165 |
| 5 | Post-publish/post-failure → Azure Blobs deleted | PASS (error path) | exec 165, blob=404 |

## Next Phase Readiness

- v1.1 complete (Plans 01-03 done)
- Production workflow deployed and tested
- Remaining action item: Add `instagram_manage_comments` to Meta App for hashtag comment functionality
- No additional phases planned for v1.1

---
*Phase: 09-error-hardening-hashtags-token-alerts*
*Completed: 2026-04-17*
