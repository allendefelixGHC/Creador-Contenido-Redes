---
phase: 04-azure-blob-re-hosting
plan: 02
subsystem: integration
tags: [n8n, execute-workflow, sub-workflow, main-workflow, approval-flow, azure-blob, google-sheets]

# Dependency graph
requires:
  - phase: 04-azure-blob-re-hosting
    plan: 01
    provides: "Sub-workflow n8n/subworkflow-rehost-images.json, live in n8n as workflow BIaG266Q6AZpv4Sq"
  - phase: 03-n8n-image-generation
    provides: "Existing approval chain (Recuperar sesion Supabase -> Google Sheets Log) that Plan 02 cuts into"
provides:
  - "Main workflow n8n/workflow.json v3.1 with re-host integration wired into the SI approval path"
  - "Execution data at Google Sheets Log contains blob_urls[] (from sub-workflow) alongside all original session fields (topic, type, angle, instagram, facebook, ...)"
  - "Contract for Phases 5-7: downstream Meta publish nodes can read $json.blob_urls from the merged item without any additional plumbing"
affects: [05-meta-single-publish, 06-meta-ig-carousel, 07-meta-fb-carousel, 09-error-hardening]

# Tech tracking
tech-stack:
  added:
    - "n8n Execute Workflow node (n8n-nodes-base.executeWorkflow typeVersion 1) with workflowInputs.mappingMode=passthrough"
  patterns:
    - "Parent-child workflow pattern: parent prep node normalizes input -> Execute Workflow (passthrough) -> Set node re-attaches original fields from prep node via $('...').item.json references"
    - "Defensive fallback in Google Sheets expressions: ($json.blob_urls && $json.blob_urls[0] && $json.blob_urls[0].url) || $json.final_image_url || ''"

key-files:
  created:
    - ".planning/phases/04-azure-blob-re-hosting/04-02-SUMMARY.md"
  modified:
    - "n8n/workflow.json (nodes: +3 new, 1 position shift; connections: 1 retargeted, 3 added; Google Sheets Log Imagen_URL expression updated)"

key-decisions:
  - "Execute Workflow workflowId uses the __rl object form with value=BIaG266Q6AZpv4Sq (n8n 2.14.2 accepts this shape); if UI-exported form differs, Felix can re-export after activating"
  - "mappingMode MUST be passthrough — the sub-workflow's Execute Sub-workflow Trigger uses inputSource passthrough, and defineBelow with empty value would send an empty object and the sub-flow's Explode node would throw"
  - "Merge Rehost Output uses a Set node (not Code) to avoid any $env concern and to keep field re-attachment declarative"
  - "Sheets Log Imagen_URL uses a defensive fallback to final_image_url even though normal Phase 4 flow aborts on re-host failure — protects against any future edge case where merge data is missing"
  - "Shifted Google Sheets Log x-position from 2840 to 3720 to avoid canvas overlap with the 3 new nodes (deviation from plan's literal positions — see Deviations below)"

# Integration points (resolved)
sub-workflow:
  n8n-id: "BIaG266Q6AZpv4Sq"
  name: "Re-host Images to Azure Blob"
  url: "https://n8n-azure.propulsar.ai/workflow/BIaG266Q6AZpv4Sq"
  imported-at: "2026-04-10T17:46:40Z"
  active: false
  called-by: "Execute Workflow node 'Re-host Images' in n8n/workflow.json"

# Metrics
duration: "~3min (Task 1 automated portion; Task 2 pending human verification)"
completed: "Task 1: 2026-04-10 — Task 2: pending Felix end-to-end verification"
---

# Phase 04 Plan 02: Wire Re-host Sub-workflow into Main Approval Path (Summary)

**Integracion del sub-workflow de re-hosting Azure (Plan 01) en el flujo principal: al aprobar con SI, el post pasa obligatoriamente por Azure Blob antes de llegar a Google Sheets Log o cualquier nodo de publicacion Meta.**

## Performance

- **Duration (Task 1 only):** ~3 min (automatable portion)
- **Started:** 2026-04-10T17:48:41Z
- **Task 1 committed:** 2026-04-10T17:51:32Z
- **Tasks:** 1/2 automatable; 1/2 pending human verification (Task 2 is checkpoint:human-verify)
- **Files created:** 1 (`.planning/phases/04-azure-blob-re-hosting/04-02-SUMMARY.md`)
- **Files modified:** 1 (`n8n/workflow.json`)

## Accomplishments

- **Sub-workflow ID resuelto e integrado.** El orquestador importo `n8n/subworkflow-rehost-images.json` via la API publica de n8n (`POST /api/v1/workflows`) y entrego el ID `BIaG266Q6AZpv4Sq` al ejecutor, desbloqueando el Task 1 que el agente anterior habia dejado pausado por falta del ID.
- **Tres nodos nuevos en `n8n/workflow.json`** insertados entre `🔍 Recuperar sesión Supabase` y `📊 Google Sheets Log`:
  1. `🔧 Prep Re-host Input` (Code, runOnceForAllItems) — normaliza briefs single-post (`final_image_url`) y carousel (`image_urls[]`) en la forma que espera el sub-workflow: `{ image_urls: [{index, url}], post_id, approval_number }`, pasando todos los campos upstream (topic, type, angle, instagram/facebook, ...) mediante spread para que los nodos downstream los conserven.
  2. `🔁 Re-host Images` (Execute Workflow, typeVersion 1) — llama al sub-workflow `BIaG266Q6AZpv4Sq` con `workflowInputs.mappingMode: passthrough` (unica forma compatible con el Execute Sub-workflow Trigger `inputSource: passthrough` del Plan 01). `options.waitForSubWorkflow: true` asegura que el padre espera la respuesta.
  3. `🔗 Merge Rehost Output` (Set node, typeVersion 3.4) — re-adjunta los campos de la sesion original (`topic`, `type`, `angle`, `platforms`, `image_model`, `instagram`, `facebook`, `final_image_url`, `format`, `approval_number`) al output del sub-workflow (`blob_urls`, `post_id`), produciendo un item unico que Google Sheets Log (y futuros nodos Meta) pueden consumir sin ninguna plomeria adicional.
- **Conexiones re-cableadas** en `workflow.json`:
  - `🔍 Recuperar sesión Supabase` -> `🔧 Prep Re-host Input` (antes apuntaba directamente a Google Sheets Log)
  - `🔧 Prep Re-host Input` -> `🔁 Re-host Images` (nueva)
  - `🔁 Re-host Images` -> `🔗 Merge Rehost Output` (nueva)
  - `🔗 Merge Rehost Output` -> `📊 Google Sheets Log` (nueva)
- **Google Sheets Log `Imagen_URL` actualizado** de `{{ $json.final_image_url || '' }}` a `{{ ($json.blob_urls && $json.blob_urls[0] && $json.blob_urls[0].url) || $json.final_image_url || '' }}` — prefiere la URL permanente de Azure y cae al URL original solo como guarda defensiva.
- **Rama de rechazo intacta.** `❌ Loguear rechazo` sigue conectado directamente a la salida falsa de `✅ ¿Aprobado?`, sin pasar por el re-host. Verificado programaticamente.
- **Rama de preview pre-aprobacion intacta.** `📤 Enviar preview imagen`, `📱 Preparar mensaje WA`, `📤 Enviar WhatsApp`, la rama de carousel split-and-preview — todo sin tocar. Las imagenes se previsualizan con sus URLs originales de Ideogram/FAL antes del re-host (las URLs temporales aguantan los pocos minutos del ciclo de aprobacion).
- **Versionado:** `_meta.version` se mantiene en `3.1` — el bump a 4.0 corresponde al final de la Fase 4 cuando los Tests A/B/C esten verdes.

## Task Commits

1. **Task 1: Insert Prep-Input + Execute-Workflow nodes into main workflow.json** — `23d195d` (feat)
   - 167 inserciones, 2 borrados en `n8n/workflow.json`
   - Ver verificaciones abajo (9/9 OK automatizados)
2. **Task 2: End-to-end verification — single post + 5-slide carousel + failure path** — **PENDIENTE** (checkpoint:human-verify)

## Files Created/Modified

### `n8n/workflow.json`
Estado antes: 29 nodos. Estado despues: 32 nodos (29 preservados + 3 nuevos, todos con IDs y nombres unicos verificados programaticamente). `connections` ahora tiene 4 entradas adicionales / modificadas. Todas las otras ramas del workflow (webhooks, generacion de texto/imagen, preview WA, rama de rechazo, `_meta`) quedaron exactamente como estaban en el commit previo (57bd4ac).

### `.planning/phases/04-azure-blob-re-hosting/04-02-SUMMARY.md`
Este archivo.

## Decisions Made

- **Execute Workflow con `workflowId` en forma `__rl` objeto (no string plano).** El plan dejaba libre eleccion entre `{"__rl": true, "mode": "id", "value": "<ID>"}` y `"workflowId": "<ID>"` plano. Use la forma objeto porque es la que n8n 2.14.2 genera por default cuando se arrastra un sub-workflow desde la UI, y eso hace el re-export futuro de Felix reproducible. Si n8n 2.14.2 rechaza esta forma al import, el fallback es trivial: reemplazar el objeto por el string plano.
- **`mappingMode: passthrough` (no `defineBelow`).** El sub-workflow del Plan 01 usa `inputSource: passthrough` en su trigger, asi que el item del padre llega directo al nodo `🔧 Explode image_urls`. Con `defineBelow` + valor vacio n8n manda `{}` y el Explode lanza "no image_urls found". Esto esta documentado en los `notes` del nodo.
- **Merge via Set node en lugar de Code.** Un Code node seria mas corto (`return [{ json: { ...$('🔧 Prep Re-host Input').item.json, blob_urls: $json.blob_urls, post_id: $json.post_id } }]`), pero violaria el principio de "declarative > imperative" y metedria jsCode en la ruta critica por nada. El Set node expone cada campo explicitamente, y si el Wizard agrega un campo nuevo al brief, la adicion en el Merge es visible en el diff.
- **Sheets Log `Imagen_URL` con fallback.** Bajo flujo normal de la Fase 4, si el re-host falla, el sub-workflow lanza `Stop And Error` y el padre aborta antes de llegar a Sheets Log — asi que `blob_urls[0].url` siempre estara presente cuando este nodo se ejecute. El fallback `|| final_image_url || ''` es defensivo para cubrir cualquier edge case futuro (por ejemplo, si se relaja la politica de abort en la Fase 9).
- **Posicion del Google Sheets Log movida de `[2840, 380]` a `[3720, 380]`.** El plan especificaba posiciones `[2400/2620/2840, 380]` para los 3 nodos nuevos, pero `[2620, 380]` ya era la posicion del existente `🔍 Recuperar sesión Supabase` y `[2840, 380]` era la de `📊 Google Sheets Log`. Mantener las posiciones literales del plan producia un caos visual con 4 nodos apilados. Opte por correr los nodos nuevos a `[3060/3280/3500, 380]` y mover el Sheets Log a `[3720, 380]` — deviacion de layout, cero impacto en comportamiento runtime. Documentado en Deviations abajo.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking UX] Colisiones de posicion en el canvas n8n**

- **Found during:** Task 1, al leer las posiciones literales del plan `[2400, 380]`, `[2620, 380]`, `[2840, 380]`.
- **Issue:** `[2620, 380]` era la posicion del existente `🔍 Recuperar sesión Supabase` y `[2840, 380]` la del `📊 Google Sheets Log`. Insertar los 3 nodos nuevos con esas posiciones produciria 4 nodos superpuestos en el mismo punto del canvas, haciendo imposible para Felix auditar visualmente el re-cableado tras el import.
- **Fix:** Shifteo los 3 nodos nuevos a `[3060, 380]`, `[3280, 380]`, `[3500, 380]` y movi el Google Sheets Log existente a `[3720, 380]`. El flujo de aprobacion ahora fluye linealmente de izquierda a derecha en el canvas: Recuperar(2620) -> Prep(3060) -> Re-host(3280) -> Merge(3500) -> Sheets(3720).
- **Files modified:** `n8n/workflow.json` (4 campos `position` tocados — los 3 nodos nuevos y el existente Sheets Log).
- **Behavioral impact:** Cero. n8n ejecuta por conexiones, no por posicion en el canvas. Posicion solo afecta el rendering de la UI.
- **Committed in:** `23d195d` (Task 1 commit).

---

**Total deviations:** 1 auto-fix (Rule 3 — evita caos visual en canvas sin tocar runtime).
**Impact on plan:** Nulo a nivel funcional. Reportado aqui para trazabilidad.

## Issues Encountered

- **Agente ejecutor previo pausado correctamente.** Un gsd-executor anterior llego a Task 1 y se detuvo porque el plan prohibia explicitamente usar placeholders `<SUBFLOW_ID>` y el ID del sub-workflow aun no existia. Era un checkpoint valido (dependencia externa faltante). El orquestador resolvio la dependencia via API publica de n8n (`POST /api/v1/workflows` con el JSON de `n8n/subworkflow-rehost-images.json`), obtuvo el ID `BIaG266Q6AZpv4Sq`, y spawneo este agente con el ID inyectado en `provided_dependencies`. Cero retrabajo: el agente anterior no habia committeado nada, asi que el estado inicial del Task 1 era limpio.
- **Colisiones de posicion.** Ver Deviation #1.

## Verification Evidence

**Automated checks (Task 1 `<verify>` block):**

| # | Check | Expected | Actual | Result |
|---|-------|----------|--------|--------|
| 1 | `JSON.parse('n8n/workflow.json')` valido | valid | valid (32 nodos) | OK |
| 2 | `grep -c '"name": "🔧 Prep Re-host Input"'` | 1 | 1 | OK |
| 3 | `grep -c '"name": "🔁 Re-host Images"'` | 1 | 1 | OK |
| 4 | `grep -c '"name": "🔗 Merge Rehost Output"'` | 1 | 1 | OK |
| 5 | `grep -c 'executeWorkflow'` | >= 1 | 1 | OK |
| 6 | Sheets Log `Imagen_URL` contiene `blob_urls[0]` | yes | yes (linea 519) | OK |
| 7 | `🔍 Recuperar sesión Supabase` ya NO apunta directo a `📊 Google Sheets Log` | false | false | OK |
| 8 | `grep -c '<SUBFLOW_ID>'` | 0 | 0 | OK |
| 9 | `grep -c '"mappingMode": "passthrough"'` | >= 1 | 1 | OK |

**Integridad estructural adicional (script node-based):**

- JSON parsea sin errores
- 32 nodos totales (29 previos + 3 nuevos)
- IDs de nodos todos unicos (sin duplicados)
- Nombres de nodos todos unicos (sin duplicados)
- Todas las referencias de `connections` apuntan a nodos que existen
- Cadena de aprobacion verificada programaticamente: `🔍 Recuperar sesión Supabase -> 🔧 Prep Re-host Input -> 🔁 Re-host Images -> 🔗 Merge Rehost Output -> 📊 Google Sheets Log`
- Execute Workflow parametros: `workflowId.value = "BIaG266Q6AZpv4Sq"`, `mappingMode = "passthrough"`, `waitForSubWorkflow = true`
- `🔀 ¿Carrusel?` sigue con `typeVersion: 1` (cumple la regla "IF v1 solo en n8n 2.14.2")
- `❌ Loguear rechazo` sigue conectado a la salida falsa de `✅ ¿Aprobado?` (rama de rechazo intacta)

**Manual end-to-end verification (Task 2 — pendiente Felix):**

Ver seccion "Pending Manual Verification" abajo. No fabrique resultados de Tests A/B/C porque son externos e imposibles de simular desde el agente (requieren Wizard CLI + YCloud WhatsApp + Azure Portal inspection + SAS tampering + container app restart).

## Pending Manual Verification (Task 2 — checkpoint:human-verify)

Plan 04-02 Task 2 es un checkpoint de verificacion humana end-to-end que prueba los 5 success criteria de la Fase 4 de golpe. Felix debe ejecutar **los tres tests** antes de poder marcar la Fase 4 como completa. Ninguno puede ser skippeado o marcado N/A.

### Pre-flight (Felix debe confirmar antes de empezar los tests)

1. [ ] Importar `n8n/workflow.json` actualizado (commit `23d195d`) en n8n via UI (Workflows -> Import from File) y **activar** el workflow. Verificar que el canvas muestra la cadena: `Recuperar sesion -> Prep Re-host Input -> Re-host Images -> Merge Rehost Output -> Google Sheets Log`.
2. [ ] Confirmar que el sub-workflow `Re-host Images to Azure Blob` (`BIaG266Q6AZpv4Sq`) existe en n8n (ya importado por el orquestador el 2026-04-10T17:46:40Z). No necesita estar activo — Execute Workflow lo llama independientemente.
3. [ ] Confirmar env vars en Container App `propulsar-n8n` revision `--0000006`: `AZURE_STORAGE_ACCOUNT=propulsarcontent`, `AZURE_CONTAINER=posts`, `AZURE_SAS_PARAMS=<SAS valido>`. (Ya provisionados por el Plan 01, revision corriendo y sana.)

### Test A — Single-image post (Flux o Ideogram)

**Objetivo:** Verificar Success Criteria 1, 2, 3 (re-host single post + blob publico + persistencia 2h).

**Timestamp de ejecucion (ISO 8601 — a rellenar por Felix):** _______________

**Pasos:**
1. [ ] `node wizard/run.js` desde la raiz del proyecto.
2. [ ] Elegir cualquier trending topic, tipo educativo (para Flux) o con texto en imagen (para Ideogram).
3. [ ] Target 1 plataforma (ej: Instagram solo).
4. [ ] Aceptar el modelo sugerido o elegir Flux explicitamente.
5. [ ] Esperar preview en WhatsApp.
6. [ ] Responder `SI`.
7. [ ] Observar el history de ejecucion en n8n:
   - [ ] `🔧 Prep Re-host Input` corrio y produjo `image_urls: [{ index: 1, url: "https://..." }]`
   - [ ] `🔁 Re-host Images` invoco el sub-workflow exitosamente
   - [ ] Sub-workflow history: 1 HTTP GET + 1 HTTP PUT + 1 HTTP HEAD, todos 2xx
   - [ ] `📊 Google Sheets Log` corrio y escribio una fila
8. [ ] Abrir Azure Portal -> Storage Account `propulsarcontent` -> Containers -> `posts`. Confirmar blob nuevo bajo `YYYY/MM/DD/<uuid>.<ext>` **(Success Criterion 1)**.
9. [ ] Abrir el Google Sheets log. La columna `Imagen_URL` de la fila nueva contiene un `https://propulsarcontent.blob.core.windows.net/...`. Abrir en navegador -> 200 OK mostrando la imagen. **(Success Criterion 2)**
10. [ ] Apuntar el URL y el timestamp exactos. **Esperar 2+ horas.** Re-abrir el mismo URL. Aun 200 OK. **(Success Criterion 3)**

**Blob URL para persistencia check:** _______________
**Upload timestamp:** _______________
**Re-fetch timestamp (2h+):** _______________
**Re-fetch HTTP status:** _______________

**Test A RESULT:** [ ] PASS  [ ] FAIL

---

### Test B — 5-slide carousel

**Objetivo:** Verificar Success Criterion 4 (5 blob URLs distintas, orden correcto) + contrato con Phases 5-7.

**Timestamp de ejecucion (ISO 8601 — a rellenar por Felix):** _______________

**Pasos:**
1. [ ] `node wizard/run.js` otra vez, flujo carousel (o POSTear el webhook manualmente con `format: "carousel", num_images: 5` si el Wizard no expone carousel directo — ver brief JSON en CLAUDE.md).
2. [ ] Aprobar con `SI`.
3. [ ] Observar n8n execution history:
   - [ ] `🔧 Prep Re-host Input` produjo `image_urls` array de length 5, indices 1..5
   - [ ] `🔁 Re-host Images` sub-workflow: 5 HTTP GET + 5 HTTP PUT + 5 HTTP HEAD, todos 2xx
   - [ ] Sub-workflow output `blob_urls` tiene 5 items, todos `https://propulsarcontent.blob.core.windows.net/...`, ordenados por index 1..5
4. [ ] Azure Portal -> container `posts`. Confirmar 5 blobs nuevos bajo el prefijo de fecha. **(Success Criterion 4)**
5. [ ] Abrir los 5 URLs en navegador — todos 200 OK, contenido correcto.
6. [ ] Confirmar mapping 1:1 de los 5 URLs a los 5 slides originales en el orden correcto (comparar visualmente contra lo que el Wizard genero).

**Los 5 blob URLs (slide 1..5):**
1. _______________
2. _______________
3. _______________
4. _______________
5. _______________

**Test B RESULT:** [ ] PASS  [ ] FAIL

---

### Test C — Failure path (OBLIGATORIO — locked abort policy)

**Objetivo:** Verificar que el re-host abort-on-retry-exhaustion funciona end-to-end: Sheets NO se escribe, blobs NO quedan creados, WhatsApp abort notification llega, ejecucion queda en error. Este test es **no opcional** porque la politica partial-failure-retry-then-abort es una decision de fase bloqueada; la Fase 4 no se marca completa sin este test pasando.

**Timestamp de ejecucion (ISO 8601 — a rellenar por Felix):** _______________

**Pasos:**
1. [ ] Editar temporalmente `AZURE_SAS_PARAMS` en el Container App `propulsar-n8n` a un valor invalido (ej: cambiar `sig=` a un string basura). Reiniciar la revision.
2. [ ] Correr el Wizard, aprobar un post (single o carousel, da igual).
3. [ ] Expected: el HTTP PUT del sub-workflow reintenta 2-3x, falla, `📱 Notify Abort WA` manda el mensaje "Error al re-alojar imagen", `🛑 Stop And Error` detiene la ejecucion.
4. [ ] Confirmar TODOS los siguientes:
   - [ ] Google Sheets Log NO se escribio (sin fila nueva)
   - [ ] Sin blobs nuevos en el container `posts` bajo el prefijo de hoy
   - [ ] WhatsApp abort notification llego a `approval_number`, incluye el slide_index del que fallo
   - [ ] n8n execution history muestra el main workflow terminado en estado `error`, NO `success`
5. [ ] Restaurar el `AZURE_SAS_PARAMS` valido, reiniciar la revision, y re-correr un Test A smoke para confirmar que el rollback fue limpio.

**Test C RESULT:** [ ] PASS  [ ] FAIL

---

### Success Criterion 5 verification (env vars via expressions, no $env in Code)

Ya verificado programaticamente en Plan 01 (`052d129`). Re-verificar rapido despues de activar el workflow:

```bash
grep -n 'process.env\|\$env\..*\.blob\.core' n8n/subworkflow-rehost-images.json
```

Expected: cero matches dentro de campos `jsCode`. Referencias `$env` solo deben aparecer en campos `url` / `value` / `jsonBody` de nodos HTTP Request / Set. **Verificado en 04-01-SUMMARY.md (PASS).**

---

## Next Phase Readiness

- **Si los tres tests (A, B, C) pasan:** la Fase 4 queda funcionalmente completa. Los Planes 05/06/07 pueden consumir `$json.blob_urls` del item mergeado sin ninguna plomeria adicional. El contrato es estable: tras `🔗 Merge Rehost Output`, el item tiene `blob_urls: [{index, url}]` ordenado + todos los campos de sesion originales.
- **Si algun test falla:** no marcar la Fase 4 como completa. Reportar el fallo exacto (cual test, cual check, que se observo) y el orquestador abrira un hotfix o rollback.
- **Pendientes documentados de Plan 01 que se cierran aqui (al pasar los tests):**
  - 2-hour persistence re-check (Success Criterion 3) -> Test A step 10
  - 5-slide ordering sanity check -> Test B steps 4-6
  - Error branch sanity check -> Test C completo

## User Setup Required

Felix debe:
1. Importar `n8n/workflow.json` actualizado (commit `23d195d`) via la UI de n8n.
2. Activar el workflow principal.
3. Ejecutar Tests A + B + C segun el checklist arriba.
4. Rellenar timestamps, URLs y marcar PASS/FAIL en este SUMMARY.
5. Cuando los tres tests esten en PASS, notificar al orquestador para que marque Plan 04-02 y Fase 4 como completos.

## Self-Check: PASSED

**Files:**
- `.planning/phases/04-azure-blob-re-hosting/04-02-SUMMARY.md` — FOUND (este archivo)
- `n8n/workflow.json` — FOUND (modificado)

**Commits:**
- `23d195d` (Task 1: feat(04-02): wire re-host sub-workflow into main approval path) — FOUND in git log

**Automated verifications (9/9):** todas PASS (ver tabla Verification Evidence)

**Task 2 status:** checkpoint:human-verify — no fabricado, marcado como pending y documentado con checklist completo para Felix.

---
*Phase: 04-azure-blob-re-hosting*
*Plan: 02*
*Task 1 completed: 2026-04-10*
*Task 2 pending: Felix end-to-end verification (Tests A + B + C)*
