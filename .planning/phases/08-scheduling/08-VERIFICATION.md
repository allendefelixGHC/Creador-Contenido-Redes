---
phase: 08-scheduling
verified: 2026-04-17T18:00:00Z
status: passed
score: 5/5 must-haves verified
---

# Phase 8: Scheduling Verification Report

**Phase Goal:** Users can choose to publish immediately or at a specific time today or tomorrow (max 24h ahead), and n8n holds the execution safely until that time
**Verified:** 2026-04-17T18:00:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Entering "ahora" sends `publish_at: "now"` and post publishes immediately without Wait node delay | VERIFIED | `parsePublishTime('ahora')` returns `{publish_at:'now'}`; Wizard sends `publish_at:'now'` in brief JSON; Compute wait_seconds routes to `scheduled=false`; Exec 133 confirmed Wait node absent in trace |
| 2 | Entering "hoy 15:30" (CET) sends UTC ISO string in `publish_at`; n8n pauses at Wait node and publishes at correct local time | VERIFIED | `madridLocalToUTC()` uses probe-based Intl.DateTimeFormat offset (no external dep); Wizard sends UTC ISO; Compute wait_seconds node computes wait_seconds and sets `scheduled=true`; IF routes to Wait node (`amount={{ $json.wait_seconds }}`); Exec 139 confirmed `wait_seconds=233`, Wait node present in trace, published after wait |
| 3 | Past-time input triggers Wizard warning and forces user to "ahora" or future time — brief never sent with past timestamp | VERIFIED | `parsePublishTime` returns `{error:"La hora está en el pasado."}` for past times; Wizard validation loop re-prompts until valid; "ahora" accepted as escape; Test C confirmed with `hoy 03:00` |
| 4 | If past timestamp reaches n8n, Code node guard before Wait node reroutes to immediate publishing — execution does not hang | VERIFIED | Compute wait_seconds: `if (diffMs > 65000 && diffMs <= 86400000)` — past time leaves `scheduled=false`, routes to FALSE path (direct to Prep Re-host Input); also handles >24h ceiling with same fallback |
| 5 | `min-replicas=1` in Azure Container Apps confirmed before testing; 2-min-ahead scheduled post survives container idle | VERIFIED | Azure `propulsar-n8n` Container App confirmed min-replicas=1 (no change needed); Exec 139 survived 233s wait with published result |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Provides | Status | Details |
|----------|----------|--------|---------|
| `wizard/run.js` — `madridLocalToUTC()` | CET/CEST probe-based UTC conversion | VERIFIED | Lines 211-229; uses `Intl.DateTimeFormat` probe method, no external deps |
| `wizard/run.js` — `parsePublishTime()` | Input parsing + validation + 24h ceiling | VERIFIED | Lines 231-276; handles ahora/hoy HH:MM/manana+mañana HH:MM; past-time guard at `diffMs <= 0`; 24h ceiling at `diffMs > 86400000` |
| `wizard/run.js` — PASO 6 block | User-facing scheduling prompt in Wizard | VERIFIED | Lines 436-478; appears between PASO 5 and RESUMEN FINAL; options [1] Ahora [2] Hoy [3] Mañana; validation loop with re-prompt |
| `wizard/run.js` — `publish_at` in brief JSON | publish_at field sent to n8n webhook | VERIFIED | Line 519: `publish_at: publishAt` in the JSON body sent to webhook |
| `n8n/workflow.json` — `🕐 Compute wait_seconds` (id: compute-wait-seconds) | Code guard computing wait_seconds with 65s floor and 24h ceiling | VERIFIED | Exists; 60 total nodes; code: `diffMs > 65000 && diffMs <= 86400000`; spreads all data fields via `{...data, scheduled, wait_seconds}`; uses `$input.first().json` (Bug 2 fix applied) |
| `n8n/workflow.json` — `⏰ ¿Programado?` (id: check-scheduled) | IF router scheduling vs immediate paths | VERIFIED | typeVersion 1 (correct for n8n 2.14.2); condition `$json.scheduled == "true"` |
| `n8n/workflow.json` — `⏳ Wait — Scheduled Publish` (id: wait-scheduled-publish) | Wait node holding execution | VERIFIED | `amount={{ $json.wait_seconds }}`, `unit="seconds"` — uses "After Time Interval" mode (not "At Specified Time"), avoids n8n #14723 |
| `n8n/workflow.json` — `publish_at` in both Supabase save nodes | publish_at survives webhook hop | VERIFIED | Both `💾 Guardar sesión Supabase` and `💾 Guardar sesión Supabase (Carousel)` have `publish_at: $json.publish_at || 'now'` (Bug 1 fix applied) |
| `n8n/workflow.json` — `publish_at` forwarded in parse nodes | publish_at not lost mid-pipeline | VERIFIED | `🔧 Parsear contenido`: `publish_at: b.publish_at || 'now'`; `🔧 Parsear prompts carrusel`: same; `🗂️ Collect Image URLs`: `publish_at: carousel.publish_at || 'now'` (Bug 3 fix applied) |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `🔍 Recuperar sesión Supabase` | `🕐 Compute wait_seconds` | direct connection | WIRED | Confirmed in connections map |
| `🕐 Compute wait_seconds` | `⏰ ¿Programado?` | direct connection | WIRED | Confirmed in connections map |
| `⏰ ¿Programado?` TRUE output | `⏳ Wait — Scheduled Publish` | IF output index 0 | WIRED | Confirmed: TRUE → Wait |
| `⏰ ¿Programado?` FALSE output | `🔧 Prep Re-host Input` | IF output index 1 | WIRED | Confirmed: FALSE → Prep Re-host (fan-in) |
| `⏳ Wait — Scheduled Publish` | `🔧 Prep Re-host Input` | direct connection | WIRED | Confirmed: Wait → Prep Re-host (fan-in) |
| Wizard `parsePublishTime()` | brief JSON `publish_at` | return value assigned to `publishAt` | WIRED | Line 466: `publishAt = result.publish_at`; line 519: `publish_at: publishAt` |

### Requirements Coverage

| Requirement | Status | Notes |
|-------------|--------|-------|
| WIZ-07: Scheduling prompt in Wizard | SATISFIED | PASO 6 implemented |
| WIZ-08: CET/CEST → UTC conversion | SATISFIED | `madridLocalToUTC()` with probe method |
| WIZ-09: Past-time guard in Wizard | SATISFIED | `parsePublishTime` validation loop |
| SCHED-01: IF router in n8n | SATISFIED | `⏰ ¿Programado?` node wired |
| SCHED-02: Wait node (seconds mode) | SATISFIED | `⏳ Wait — Scheduled Publish` |
| SCHED-03: Code guard with 65s floor | SATISFIED | `🕐 Compute wait_seconds` |
| SCHED-04: publish_at in Supabase | SATISFIED | Both session save nodes updated |

### Anti-Patterns Found

No blockers or warnings found.

- Validation loop in Wizard is substantive (not stub) — it re-prompts until valid or "ahora"
- All three Code nodes that forward `publish_at` use `|| 'now'` fallback (safe default)
- Wait node correctly uses "After Time Interval" mode, not "At Specified Time" (n8n #14723 avoided)
- 65s floor prevents silent loss of sub-65s wait executions on container restart

### Human Verification (Already Completed — E2E Evidence)

The following were verified via live E2E tests before this verification:

1. **Test A — Immediate publish (exec 133):** `scheduled=false`, `wait_seconds=0`, Wait node absent in trace, post published to IG+FB immediately.
2. **Test B — Scheduled publish (exec 139):** `scheduled=true`, `wait_seconds=233`, `⏳ Wait — Scheduled Publish` present in trace, post published after ~3.9 min wait to IG+FB.
3. **Test C — Past-time guard:** `parsePublishTime('hoy 03:00')` returns `{error:"La hora está en el pasado."}` — no brief sent.
4. **Azure min-replicas:** `propulsar-n8n` Container App confirmed at min-replicas=1 — Wait node persistence safe.

### Gaps Summary

No gaps. All 5 success criteria verified against actual code. The three bugs found during E2E (missing `$json` prefix, missing `$input`, `publish_at` pipeline passthrough) were all fixed and committed before this verification. The 60-node workflow is deployed and active on n8n-azure.

---

_Verified: 2026-04-17T18:00:00Z_
_Verifier: Claude (gsd-verifier)_
