---
phase: 03-n8n-image-generation-whatsapp-preview
plan: "03"
subsystem: n8n
tags: [n8n, ideogram, whatsapp, ycloud, carousel, workflow-validation]

# Dependency graph
requires:
  - phase: 03-02
    provides: "Carousel image generation loop and WhatsApp sending loop nodes"
provides:
  - "Fully validated n8n workflow.json (29 nodes) passing structural and live verification"
  - "test-webhook.js with carousel test mode (3-slide payload)"
  - "n8n 2.14.2 compatibility fixes: IF v1 nodes, no SplitInBatches, correct URL handling"
  - "Single-post image preview via Enviar preview imagen node"
affects: [n8n, scripts, workflow]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "n8n 2.14.2: IF v2 and Switch v3 are broken — always use IF v1 with string comparisons"
    - "n8n 2.14.2: SplitInBatches Done branch cannot reference loop body nodes via $() — remove SplitInBatches, n8n processes N items sequentially natively"
    - "Ideogram URLs include ephemeral ?exp=&sig= query params — do NOT strip them"
    - "YCloud: use JSON.stringify() when embedding dynamic text in expression strings to handle newlines"

key-files:
  created: []
  modified:
    - n8n/workflow.json
    - scripts/test-webhook.js

key-decisions:
  - "n8n 2.14.2 IF v2 and Switch v3 have routing bug (always TRUE/first-output) — downgraded all to IF v1 with string comparisons"
  - "SplitInBatches removed from both loops — n8n processes N items sequentially natively without it"
  - "Ideogram ephemeral URLs must preserve ?exp=&sig= params — Collect Image URLs updated to keep full URLs"
  - "Added Enviar preview imagen node to single-post flow — original path never sent image preview to WhatsApp"

patterns-established:
  - "n8n compatibility: always test conditional routing live — static JSON validation alone is insufficient"
  - "WhatsApp newlines: wrap dynamic text in JSON.stringify() inside n8n expressions"

# Metrics
duration: 60min
completed: "2026-04-06"
---

# Phase 3 Plan 03: Structural Validation and End-to-End Verification Summary

**n8n 2.14.2 routing bugs discovered and fixed live: all IF nodes downgraded to v1, SplitInBatches removed, both carousel and single-post paths verified end-to-end via WhatsApp**

## Performance

- **Duration:** ~60 min (including debugging n8n version-specific bugs)
- **Started:** 2026-04-06
- **Completed:** 2026-04-06
- **Tasks:** 3 (2 auto + 1 human-verify checkpoint)
- **Files modified:** 2

## Accomplishments

- Structural validation passed and all broken node selectors (empty `$('')`) fixed in Preparar mensaje WA
- test-webhook.js updated with carousel test mode (`--carousel` flag, 3-slide ideogram payload)
- Live n8n execution revealed and resolved 6 critical bugs from n8n 2.14.2 version-specific behavior
- Both carousel and single-post paths verified working end-to-end (WhatsApp preview + SI/NO approval)
- Phase 3 complete — full pipeline from Wizard brief to WhatsApp-approved Instagram + Facebook post

## Task Commits

1. **Task 1: Structural validation + fix empty node selectors** — `5fe9ee6` (fix)
2. **Task 2: Update test-webhook.js with carousel test payload** — `e44eb58` (feat)
3. **Task 3 + Post-verification fixes: n8n 2.14.2 bug fixes** — `db0195b` (fix)

## Files Created/Modified

- `n8n/workflow.json` — 29-node workflow, fully validated and live-verified; IF v1 nodes throughout; SplitInBatches removed; single-post image preview added
- `scripts/test-webhook.js` — Added `--carousel` flag with 3-slide ideogram payload; corrected single-post brief fields

## Decisions Made

- **IF v1 over v2:** n8n 2.14.2 IF v2 always evaluates to TRUE regardless of condition. Downgraded every IF node to v1 with explicit string comparisons (`"carousel" == "carousel"` style).
- **Remove SplitInBatches:** SplitInBatches Done branch cannot read data from nodes inside the loop body via `$('node-name')` — they return empty. n8n processes N incoming items sequentially without needing the loop construct.
- **Keep Ideogram URL query params:** Ideogram returns ephemeral signed URLs with `?exp=&sig=` params. Collect Image URLs was stripping them. Fixed to preserve full URL.
- **Add single-post image preview:** The original single-post path sent text+approval but no image preview. Added Enviar preview imagen node between Normalizar URL and Preparar mensaje WA.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Empty node selectors in Preparar mensaje WA**
- **Found during:** Task 1 (structural validation)
- **Issue:** `$('')` selectors with empty string caused node reference failures
- **Fix:** Replaced with correct node names from workflow
- **Files modified:** n8n/workflow.json
- **Verification:** Structural validation script passed all checks
- **Committed in:** 5fe9ee6

**2. [Rule 1 - Bug] n8n 2.14.2 IF v2 routing bug — always routes to TRUE**
- **Found during:** Task 3 (live verification via `--carousel` test)
- **Issue:** IF v2 nodes in n8n 2.14.2 always evaluate condition as TRUE regardless of actual values. ¿Carrusel? always routed to carousel branch even for single-post briefs.
- **Fix:** Downgraded all IF nodes to IF v1 with string-based comparisons
- **Files modified:** n8n/workflow.json
- **Verification:** Both `--carousel` and single-post test-webhook runs routed correctly in live n8n
- **Committed in:** db0195b

**3. [Rule 1 - Bug] n8n 2.14.2 Switch v3 routing bug — always routes to first output**
- **Found during:** Task 3 (live verification)
- **Issue:** Switch v3 node (Router — ¿Qué modelo?) always activated first output (flux) regardless of image_model value
- **Fix:** Replaced Switch v3 with chained IF v1 nodes (¿Es Ideogram? → ¿Es NanoBanana? → default Flux)
- **Files modified:** n8n/workflow.json
- **Verification:** Ideogram path activated correctly for carousel test (image_model=ideogram)
- **Committed in:** db0195b

**4. [Rule 1 - Bug] SplitInBatches Done branch cannot reference loop body nodes**
- **Found during:** Task 3 (live verification)
- **Issue:** From the Done output of SplitInBatches, `$('Ideogram — Slide')` returned empty — nodes inside the loop body are not accessible from Done branch
- **Fix:** Removed SplitInBatches from both loops. n8n natively processes N incoming items one at a time. Collect Image URLs accumulates results from all N Ideogram calls via input items.
- **Files modified:** n8n/workflow.json
- **Verification:** 3 Ideogram API calls executed, 3 URLs collected, 3 WhatsApp messages sent
- **Committed in:** db0195b

**5. [Rule 1 - Bug] Ideogram ephemeral URL params stripped by Collect Image URLs**
- **Found during:** Task 3 (live verification)
- **Issue:** Collect Image URLs was stripping query params from image URLs. Ideogram returns signed ephemeral URLs with `?exp=...&sig=...` — stripping them caused 403 when YCloud tried to fetch the image
- **Fix:** Updated Collect Image URLs to preserve full URL including query string
- **Files modified:** n8n/workflow.json
- **Verification:** YCloud received images successfully (no 403 errors)
- **Committed in:** db0195b

**6. [Rule 2 - Missing Critical] Added single-post image preview to WhatsApp**
- **Found during:** Task 3 (live verification — single-post regression test)
- **Issue:** Original single-post flow sent text summary and SI/NO approval but no image preview. User was approving without seeing the generated image.
- **Fix:** Added Enviar preview imagen node between Normalizar URL imagen and Preparar mensaje WA. Sends image message first, then text summary.
- **Files modified:** n8n/workflow.json
- **Verification:** Single-post test received image message followed by text + SI/NO prompt
- **Committed in:** db0195b

---

**Total deviations:** 6 auto-fixed (4 bugs from n8n 2.14.2, 1 URL handling bug, 1 missing critical feature)
**Impact on plan:** All fixes necessary for correct operation. n8n version bugs were the primary blocker — could not have been detected via static JSON validation alone. No scope creep.

## Issues Encountered

- n8n 2.14.2 has undocumented breaking changes in IF v2 and Switch v3 condition evaluation. Static JSON validation (Task 1) passed cleanly, but live execution revealed both routing nodes were broken. This is a platform-level regression requiring awareness in all future n8n workflows.
- SplitInBatches pattern from Phase 03-01 planning (batchSize=1 loop with back-edge) was architecturally correct but incompatible with n8n's actual data scoping rules. The simpler native sequential approach works better.

## Next Phase Readiness

Phase 3 is the final phase of this project. The complete pipeline is live and verified:

- Wizard → n8n webhook → GPT-4o text → Ideogram images → WhatsApp preview → SI/NO approval → Instagram + Facebook publish → Google Sheets log
- Both carousel (N slides) and single-post formats fully working
- No remaining blockers

**Project complete.** For future maintenance:
- If upgrading n8n beyond 2.14.2, re-test all IF and Switch routing nodes
- Ideogram URLs are ephemeral (expire ~1h) — publish must complete within the session

---
*Phase: 03-n8n-image-generation-whatsapp-preview*
*Completed: 2026-04-06*
