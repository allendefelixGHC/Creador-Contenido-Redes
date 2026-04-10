# Requirements: Propulsar Content Engine — v1.1 Automatic Publishing

**Defined:** 2026-04-10
**Core Value:** Generate complete social media posts (single or carousel) in one wizard run, with AI-generated images and WhatsApp preview — and now automatically publish to Instagram + Facebook after SI approval

## v1.1 Requirements

Requirements for the Automatic Publishing milestone. Each maps to roadmap phases.

### Image Re-hosting (Azure Blob)

Gating dependency for all Meta API work. Ideogram URLs are ephemeral and Meta fetches asynchronously — passing signed URLs directly causes silent failures.

- [ ] **REHOST-01**: Sistema descarga imagen desde URL de Ideogram (preservando query params `exp`/`sig`) como binario en n8n
- [ ] **REHOST-02**: Sistema sube la imagen a Azure Blob Storage con nombre único (UUID o timestamp) vía HTTP Request PUT
- [ ] **REHOST-03**: Container público permite lectura anónima sin expiración (no SAS de solo lectura)
- [ ] **REHOST-04**: Sistema construye URL pública permanente `https://<storage>.blob.core.windows.net/<container>/<blob>` y la propaga al resto del flujo
- [ ] **REHOST-05**: Para carruseles, sistema re-hostea las N imágenes secuencialmente antes de cualquier llamada a Meta
- [ ] **REHOST-06**: Blobs viejos se limpian tras publicación exitosa o fallo confirmado (evita acumulación de costos)

### Instagram Publishing

Meta Graph API v22 — `graph.instagram.com` endpoints with long-lived Page Access Token.

- [ ] **IGPUB-01**: Sistema publica post single-image a Instagram via 2-step flow: `POST /<IG_ID>/media` (container) → `POST /<IG_ID>/media_publish`
- [ ] **IGPUB-02**: Sistema publica carrusel a Instagram via 3-step flow: N child containers (`is_carousel_item=true`) → parent carousel container → `media_publish`
- [ ] **IGPUB-03**: Sistema verifica que cada container IG llegue a estado `FINISHED` antes de publicar (polling `GET /<container_id>?fields=status_code` o Wait fijo de 30s)
- [ ] **IGPUB-04**: El nodo `media_publish` tiene "Retry on Fail" deshabilitado (no es idempotente, un reintento tras timeout genera post duplicado en vivo)
- [ ] **IGPUB-05**: Sistema obtiene el `permalink` del post publicado para incluirlo en la notificación de éxito
- [ ] **IGPUB-06**: Tras publicar, sistema postea el bloque de hashtags como primer comentario (`POST /<media_id>/comments`), manteniendo el caption limpio de hashtags

### Facebook Publishing

Meta Graph API v22 — `graph.facebook.com` Pages endpoints.

- [ ] **FBPUB-01**: Sistema publica post single-image a Facebook via `POST /<PAGE_ID>/photos` con el URL de Azure Blob, devolviendo `post_id`
- [ ] **FBPUB-02**: Sistema publica carrusel a Facebook via patrón `attached_media`: subir cada imagen como `/photos?published=false` → `POST /<PAGE_ID>/feed` con `attached_media[]` array
- [ ] **FBPUB-03**: Sistema construye la URL del post FB a partir del `post_id` devuelto para la notificación de éxito
- [ ] **FBPUB-04**: El array `attached_media` se construye dinámicamente en un Code node de n8n y se pasa al HTTP Request node como body JSON crudo

### Scheduling

Publicación inmediata por defecto; opcional hora específica dentro de las próximas 24h.

- [ ] **WIZ-07**: Wizard pregunta al final del brief: "¿publicar ahora o programar hora?" (ahora / hoy HH:MM / mañana HH:MM)
- [ ] **WIZ-08**: Wizard convierte la hora local (CET/CEST) a ISO UTC antes de enviar en el brief JSON como campo `publish_at` ("now" | ISO string)
- [ ] **WIZ-09**: Wizard valida que la hora programada no esté en el pasado; si lo está, avisa al usuario y fuerza "ahora" o pide hora nueva
- [ ] **SCHED-01**: n8n nodo IF v1 `check-scheduled` compara `publish_at` contra "now" para rutear entre path inmediato y path programado
- [ ] **SCHED-02**: Path programado usa n8n Wait node "At Specified Time" con `publish_at` como timestamp
- [ ] **SCHED-03**: Code node guard antes del Wait verifica `publish_at > Date.now()`; si no, rutea a publicación inmediata (protección contra Wait node colgándose en fechas pasadas)
- [ ] **SCHED-04**: Ventana de scheduling limitada a 24 horas máximo desde el momento del brief (previene ejecuciones multi-día y riesgo de scale-to-zero)

### Notifications

Confirmación por WhatsApp del resultado final. Ningún post sale sin confirmación visible al usuario.

- [ ] **NOTIF-01**: Tras publicación exitosa, sistema envía mensaje WhatsApp al número de aprobación con: "✓ Publicado" + URL de IG + URL de FB + timestamp
- [ ] **NOTIF-02**: Si la publicación falla tras reintentos (excepto en `media_publish`), sistema envía mensaje WhatsApp con: código de error Meta, mensaje legible, `fbtrace_id`, y plataforma afectada (IG/FB/ambas)
- [ ] **NOTIF-03**: Sistema detecta `OAuthException` código 190 (token expirado) y envía alerta WhatsApp específica: "Token Meta expirado — verificar que Susana sigue como admin de la página"

### Logging

Extender el log de Google Sheets para cerrar el audit trail desde generación hasta publicación.

- [ ] **LOG-01**: Sheet agrega columnas `IG_URL`, `FB_URL`, `Publicado_En`, `Publish_Status` (success | failed | scheduled)
- [ ] **LOG-02**: Tras publicación exitosa, sistema actualiza o appendea fila con las URLs finales y timestamp real de publicación
- [ ] **LOG-03**: Tras fallo, sistema loguea fila con `Publish_Status=failed` y el mensaje de error para auditoría posterior

### Error Handling

Retry policies y manejo robusto, respetando la no-idempotencia de `media_publish`.

- [ ] **ERR-01**: Llamadas a container creation (IG/FB) tienen retry habilitado (son idempotentes)
- [ ] **ERR-02**: Llamadas a `media_publish` tienen retry deshabilitado; si falla una vez, se notifica inmediatamente sin reintentar
- [ ] **ERR-03**: Antes de reintentar cualquier operación, sistema verifica estado del container/post para evitar duplicados
- [ ] **ERR-04**: Todos los HTTP Request nodes a Meta usan `typeVersion: 4.2` con error output branch conectada al flujo de notificación de fallo

## v2+ Requirements

Deferred to future releases. Tracked but not in current roadmap.

### Analytics

- **ANLY-01**: Workflow scheduled que consulta IG Insights 24h después de publicar y actualiza Sheets con engagement metrics
- **ANLY-02**: Dashboard de métricas acumuladas por tipo de post (single vs carousel, educativo vs autoridad vs caso de éxito)

### Advanced Publishing

- **ADV-01**: Story publishing (9:16, caption diferente, pipeline separado)
- **ADV-02**: Video carousel support (requiere pipeline de generación de video)
- **ADV-03**: A/B testing de captions (requiere analytics primero)
- **ADV-04**: Multi-account publishing (multi-tenant para uso de agencia)

### Hardening

- **HARD-01**: Meta System User token (vs personal admin token de Susana) para evitar dependencia de admin individual
- **HARD-02**: Full exponential backoff retry logic (más allá del retry simple actual)
- **HARD-03**: Status polling pattern en lugar de Wait fijo de 30s para container readiness

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| IG Insights analytics en v1.1 | Requiere mínimo 24h post-publish para datos significativos; merece workflow separado |
| A/B testing de captions | Requiere capa de analytics primero; bloqueado por ANLY-01 |
| Story publishing | Pipeline de contenido distinto (aspect 9:16, efímero); merece milestone propio |
| Video en carruseles | No hay pipeline de generación de video; fuera del stack actual |
| Editar caption manualmente antes de publicar | Rompe el modelo de full-automation; si el caption es malo, arreglar prompt GPT-4o |
| Multi-account publishing | Requiere gestión multi-token y routing de aprobación por cuenta; milestone multi-tenant separado |
| IG native `publish_at` parameter | No existe en la API de IG Graph; Wait node es el patrón correcto |
| FB `scheduled_publish_time` en v1.1 | Crearía dos code paths paralelos de scheduling (FB-native vs Wait node para IG); contradice principio DRY |
| Scheduling más allá de 24h | Riesgo de scale-to-zero en Azure Container Apps, complejidad de timezone/DST |
| Native n8n Azure Storage node con SAS | Soporte SAS no confirmado en 2.14.2; patrón HTTP Request PUT es más robusto y portable |

## Traceability

Empty initially. Updated during roadmap creation by gsd-roadmapper.

| Requirement | Phase | Status |
|-------------|-------|--------|
| REHOST-01 | — | Pending |
| REHOST-02 | — | Pending |
| REHOST-03 | — | Pending |
| REHOST-04 | — | Pending |
| REHOST-05 | — | Pending |
| REHOST-06 | — | Pending |
| IGPUB-01 | — | Pending |
| IGPUB-02 | — | Pending |
| IGPUB-03 | — | Pending |
| IGPUB-04 | — | Pending |
| IGPUB-05 | — | Pending |
| IGPUB-06 | — | Pending |
| FBPUB-01 | — | Pending |
| FBPUB-02 | — | Pending |
| FBPUB-03 | — | Pending |
| FBPUB-04 | — | Pending |
| WIZ-07 | — | Pending |
| WIZ-08 | — | Pending |
| WIZ-09 | — | Pending |
| SCHED-01 | — | Pending |
| SCHED-02 | — | Pending |
| SCHED-03 | — | Pending |
| SCHED-04 | — | Pending |
| NOTIF-01 | — | Pending |
| NOTIF-02 | — | Pending |
| NOTIF-03 | — | Pending |
| LOG-01 | — | Pending |
| LOG-02 | — | Pending |
| LOG-03 | — | Pending |
| ERR-01 | — | Pending |
| ERR-02 | — | Pending |
| ERR-03 | — | Pending |
| ERR-04 | — | Pending |

**Coverage:**
- v1.1 requirements: 32 total
- Mapped to phases: 0 (filled by roadmapper)
- Unmapped: 32 ⚠️

---
*Requirements defined: 2026-04-10*
*Last updated: 2026-04-10 after initial v1.1 definition*
