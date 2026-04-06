---
phase: 02-n8n-content-generation
verified: 2026-04-04T17:50:30Z
status: human_needed
score: 3/3 must-haves verified (code complete; runtime unverified)
re_verification: false
human_verification:
  - test: >-
      Run: node scripts/test-webhook.js --carousel --slides 5 against live n8n
      after uploading workflow.json and linking OpenAI credentials
    expected: >-
      n8n execution shows Carrusel? routes TRUE, GPT-4o returns JSON with
      estructura + 5 slides + instagram_caption + facebook_caption,
      Parsear prompts carrusel outputs image_prompts array with 5 items
      where each prompt contains style constraints (#1a1a2e, gradient)
    why_human: >-
      n8n execution requires a live instance with credentials. GPT-4o output
      shape and style injection cannot be verified programmatically.
  - test: >-
      Run: node scripts/test-webhook.js (no flags) after uploading the updated workflow
    expected: >-
      n8n routes through Carrusel? FALSE branch to GPT-4o Texto, then through
      the full existing downstream flow. No regression in single-post path.
    why_human: >-
      Regression test requires live n8n execution. Connection graph is correct
      in code but runtime behavior must be confirmed.
  - test: >-
      Open the GPT-4o Prompts Carrusel node in n8n Azure and link the OpenAI credential
    expected: >-
      Credential dropdown accepts the existing OpenAI credential. Node saves without error.
    why_human: >-
      Credential ID openai-credentials is a placeholder. Must be linked manually
      on the target n8n instance (credential IDs are instance-specific).
---

# Phase 02: n8n Content Generation Verification Report

**Phase Goal:** n8n receives a carousel brief and GPT-4o generates one contextual image prompt per slide, choosing the right carousel structure and applying Propulsar visual style to every prompt

**Verified:** 2026-04-04T17:50:30Z
**Status:** human_needed
**Re-verification:** No - initial verification

---

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | When n8n receives a carousel brief, GPT-4o returns exactly N image prompts (matching num_images), each containing slide text overlay and visual direction | UNCERTAIN | Code correct: Code node validates slide count with console.warn, maps slides[] to image_prompts[] with slide_num/texto_overlay/prompt. Runtime not verified. |
| 2 | Carousel structure type is chosen by AI and the user never selects manually | VERIFIED | System prompt lists 5 structure options (narrativo, listicle, paso-a-paso, antes-despues, pregunta-respuesta) with explicit instruction to choose. No user-facing selection in the code path. |
| 3 | Every image prompt specifies Propulsar visual identity (#1a1a2e, purple-magenta gradient, bold Spanish text) with no omissions | VERIFIED (code) | System prompt contains #1a1a2e, gradient #6B46C1 to #EC4899, bold Spanish typography. Rule 1 prohibits same-as-above shortcuts. Runtime compliance needs human spot-check. |

**Score:** 2/3 fully automated truths verified. 1/3 requires live n8n execution.

---

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------||
| n8n/workflow.json | IF node + GPT-4o carousel node + Code parser node | VERIFIED | 22 nodes total (19 original + 3 new). All 3 new nodes present with correct types and configurations. Valid JSON confirmed. |
| scripts/test-webhook.js | Carousel test mode with --carousel flag | VERIFIED | Syntax valid. --carousel flag selects 14-field carousel brief. --slides N overrides default of 5. Single-post mode unchanged (9 fields, no carousel fields). |

---

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------||
| Webhook Trigger | Carrusel? IF node | fan-out replacing direct GPT-4o link | WIRED | Webhook fans out to Responder al Wizard AND Carrusel?. Direct link to GPT-4o Texto removed. |
| Carrusel? TRUE output | GPT-4o Prompts Carrusel | IF true output main[0] | WIRED | main[0][0] confirmed in connections object. |
| Carrusel? FALSE output | GPT-4o Texto | IF false output main[1] | WIRED | main[1][0] confirmed. GPT-4o Texto to Parsear contenido also intact. |
| GPT-4o Prompts Carrusel | Parsear prompts carrusel | main connection | WIRED | main[0][0] confirmed. Terminal node - Phase 3 attachment point. |
| test-webhook.js --carousel | carousel brief schema | matches Phase 1 Wizard output | WIRED | Carousel brief has exactly 14 fields matching Wizard schema. |

---

### Requirements Coverage

| Requirement | Status | Blocking Issue |
|-------------|--------|----------------|
| GEN-01: GPT-4o returns exactly N image prompts per carousel | NEEDS RUNTIME | Code validates count via console.warn; GPT-4o compliance requires live test |
| GEN-02: AI chooses carousel structure autonomously | SATISFIED | System prompt enforces structure choice; no user selection exists in code |
| GEN-03: Every prompt includes Propulsar visual identity | SATISFIED (code) | Inline style constraints in system prompt; runtime compliance needs human spot-check |

---

### Anti-Patterns Found

| File | Location | Pattern | Severity | Impact |
|------|----------|---------|----------|--------|
| n8n/workflow.json | GPT-4o Prompts Carrusel credentials | Placeholder credential ID openai-credentials | Warning | Known pre-condition - requires manual credential linking in n8n after upload. Documented in PLAN and SUMMARY. Does not affect code correctness. |
| scripts/test-webhook.js | singlePostBrief | Uses has_image instead of has_own_image (naming inconsistency vs carousel brief) | Info | Not a blocker. Single-post brief predates carousel schema standardization. |

---

### Human Verification Required

#### 1. Carousel branch end-to-end in n8n

**Test:** Upload n8n/workflow.json to n8n Azure, link OpenAI credential to the GPT-4o Prompts Carrusel node, activate workflow, run: node scripts/test-webhook.js --carousel --slides 5

**Expected:** n8n execution shows Carrusel? routes TRUE, GPT-4o returns JSON with estructura, instagram_caption, facebook_caption, and slides array with exactly 5 items. Parsear prompts carrusel outputs image_prompts array with 5 items where each prompt contains #1a1a2e and gradient language.

**Why human:** Live n8n execution and GPT-4o API call required. Output schema compliance and per-prompt style enforcement cannot be verified without running the actual workflow.

#### 2. Single-post regression in n8n

**Test:** Run node scripts/test-webhook.js with no flags against the updated workflow.

**Expected:** Carrusel? routes to FALSE branch, GPT-4o Texto executes, full downstream flow (Parsear contenido to image generation to WhatsApp preview) works as before.

**Why human:** Regression requires live execution. Connection graph is correct in code but runtime must be confirmed before Phase 3 begins.

#### 3. OpenAI credential linking

**Test:** Open the GPT-4o Prompts Carrusel node in n8n Azure, select the OpenAI credential from the dropdown, save.

**Expected:** Node accepts credential, no credential error on execution.

**Why human:** The placeholder credential ID openai-credentials does not auto-resolve. n8n credential IDs are instance-specific and must be linked manually after upload.

---

### Gaps Summary

No code gaps. All three new nodes exist with correct configuration, all connections are wired as designed, and the test utility is complete and functional.

The only pending items are operational checks that require a live n8n instance:

1. The OpenAI credential must be manually linked after workflow upload (pre-condition documented in both PLAN and SUMMARY, known before execution began).
2. GPT-4o compliance with the exact-N-slides constraint and per-prompt style enforcement must be confirmed with a live execution.
3. Single-post path regression must be verified in the live instance.

These are not code defects. The phase goal is achievable once the credential is linked and both paths are smoke-tested.

---

_Verified: 2026-04-04T17:50:30Z_
_Verifier: Claude (gsd-verifier)_
