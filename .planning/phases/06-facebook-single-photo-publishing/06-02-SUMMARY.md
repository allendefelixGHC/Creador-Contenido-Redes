---
phase: 06-facebook-single-photo-publishing
plan: 02
status: complete
started: 2026-04-17
completed: 2026-04-17
---

# Summary: 06-02 Deploy + E2E Verification

## What was done

Deployed the updated workflow (40 nodes) to n8n-azure and ran E2E tests to verify the complete IG+FB single-photo publish pipeline.

### Task 1: Pre-flight checks and deploy
- Confirmed `FACEBOOK_PAGE_ID=981931321668013` present in Azure Container App `propulsar-n8n`
- Pre-flight API check passed: page name "Propulsar AI Inteligencia Artificial"
- Workflow deployed via PUT /api/v1/workflows and activated
- `🌐 FB: Publish Photo` node confirmed present with `retryOnFail: false`
- Commit: 0d48d27

### Task 2: E2E verification (6 test executions)
Required 6 test runs to resolve 3 bugs discovered during deployment:

| Exec | Status | Issue Found |
|------|--------|-------------|
| 96 | error | WA jsonBody had literal newlines — n8n expression parser rejects multi-line |
| 99 | success | WA fixed, but Sheets returned `[[]]` — node had no `operation` field |
| 102 | error | Added `operation:"append"` but node needs `columns.schema` |
| 105 | error | Schema column order didn't match actual Sheet (Estado at col H, not last) |
| 108 | error | Schema matched but `FB_URL\r` had carriage return in Sheet header cell |
| 111 | success | All 14/14 nodes pass — full pipeline verified |

**Bugs fixed (commit 5d089a7):**
1. **WA jsonBody newlines** — replaced literal `\n` with `\\n` escape sequences
2. **Sheets missing operation** — added `operation: "append"` + `resource: "sheet"`
3. **Sheets column order** — reordered `columns.value` and `columns.schema` to match actual Google Sheet header order (Estado at col H)
4. **Sheet header cleanup** — user removed `\r` from FB_URL cell J1

### E2E Results (exec 111)
- **IG post:** `https://www.instagram.com/p/DXO8iARF3_s/` ✓
- **FB post:** `post_id: 981931321668013_122119222677238849` ✓
- **WA notification:** Combined message with both IG+FB URLs ✓
- **Google Sheets:** Row with all 12 columns populated (IG_URL + FB_URL) ✓

## Deviations

- **3 additional bugs found** beyond Plan 06-01 scope: WA newlines, Sheets operation, Sheets column order. All were pre-existing from Phase 5 (Sheets node was never empirically tested).
- **6 test executions** instead of planned 1 — each iteration fixed one bug
- **Sheet header `FB_URL\r`** — carriage return in Google Sheet header cell, manually cleaned by user
- **IG post deletion** — META_PAGE_TOKEN lacks `instagram_content_publish` delete scope; 4 IG test posts require manual deletion by user

## Key files

- Modified: `n8n/workflow.json` (3 fixes in commit 5d089a7)

## Commits

| Commit | Description |
|--------|-------------|
| 0d48d27 | docs(06-02): deploy workflow + pre-flight checks |
| 5d089a7 | fix(06): fix WA notification newlines and Sheets append config |
