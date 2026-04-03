# CLAUDE.md — Propulsar Content Engine v3
# Instrucciones maestras para Claude Code en VS Code

---

## 🎯 MISIÓN DE ESTE PROYECTO

Generás y publicás contenido automático para las redes sociales de **Propulsar.ai**
(Instagram + Facebook) usando un pipeline IA → WhatsApp → publicación automática.

**Cuando el usuario te pida generar contenido, ejecutás el Wizard.**
**Cuando el usuario mencione un problema técnico, lo resolvés en el código.**
**Cuando el usuario pida cambiar algo del pipeline, editás los archivos correctos.**

---

## 🏢 QUIÉNES SOMOS

**Propulsar.ai** — agencia de automatizaciones con IA para PYMEs.
- Servicios: bots WhatsApp, workflows n8n, CRM, agentes IA
- Mercados: España, Argentina, México, Colombia
- Fundadores: Felix y Susana Cuevas
- Stack principal: n8n (Azure) + YCloud + GHL + Supabase

### Voz de marca (aplicar siempre al generar contenido)
- Profesional pero accesible — practitioners, no teóricos
- Directo al grano — los dueños de negocios no tienen tiempo
- Español latinoamericano (tuteo) para alcance regional
- Sin buzzwords: prohibido "revolutionario", "disruptivo", "sinergia", "delve"
- Emojis con moderación — máximo 3 por post, solo al inicio de línea

---

## 🏗️ ARQUITECTURA DEL SISTEMA

```
[Wizard — wizard/run.js]
         │
         │ 1. Busca trending topics (Perplexity API)
         │ 2. Sugiere ángulos ganadores (Claude API)
         │ 3. Sugiere modelo de imagen según tipo de post
         │
         ▼ POST webhook
[n8n en Azure — n8n-azure.propulsar.ai]
         │
         ├─ GPT-4o genera texto para Instagram + Facebook
         │
         ├─ Router de imagen (según image_model del brief):
         │   ├─ "flux"       → Flux 2 Pro via FAL.AI    ($0.03/img) — fotorrealismo
         │   ├─ "ideogram"   → Ideogram v3              ($0.06/img) — texto en imagen
         │   └─ "nanoBanana" → Nano Banana Pro via FAL.AI ($0.15/img) — alto impacto
         │
         ├─ Preview por WhatsApp (YCloud)
         │   └─ Usuario responde SI o NO
         │
         └─ Si SI: publica en Instagram + Facebook via Meta Graph API
            + loguea en Google Sheets
```

---

## 📁 ESTRUCTURA DEL PROYECTO

```
propulsar-content-engine/
├── CLAUDE.md                  ← Este archivo (instrucciones para vos)
├── README.md                  ← Arquitectura general
├── SETUP.md                   ← Guía de setup paso a paso
├── .env                       ← Variables de entorno (NUNCA commitear)
├── .env.example               ← Template de variables
├── package.json
├── wizard/
│   └── run.js                 ← Wizard interactivo (PUNTO DE ENTRADA)
├── n8n/
│   └── workflow.json          ← Importar en n8n de Azure
├── prompts/
│   └── brand-voice.md         ← Voz y tono de Propulsar
└── scripts/
    └── test-webhook.js        ← Test de conexión sin publicar
```

---

## ⚙️ VARIABLES DE ENTORNO NECESARIAS

Todas van en `.env` (copiar de `.env.example`):

| Variable | Para qué | Dónde obtenerla |
|----------|----------|-----------------|
| `WEBHOOK_URL` | URL del trigger en n8n | n8n → Workflow → Webhook node → copiar URL |
| `WHATSAPP_APPROVAL_NUMBER` | Número que recibe aprobaciones | Tu número (ej: 34612345678) |
| `ANTHROPIC_API_KEY` | Sugerencia de ángulos en Wizard | console.anthropic.com |
| `PERPLEXITY_API_KEY` | Trending topics en tiempo real | perplexity.ai/settings/api |
| `FAL_API_KEY` | Flux 2 Pro + Nano Banana Pro | fal.ai/dashboard/keys |
| `IDEOGRAM_API_KEY` | Ideogram v3 (texto en imagen) | ideogram.ai → API |
| `YCLOUD_API_KEY` | Envío de WhatsApp | app.ycloud.com → API Keys |
| `YCLOUD_WHATSAPP_NUMBER` | Número WA Business de Propulsar | app.ycloud.com |
| `OPENAI_API_KEY` | GPT-4o para texto (en n8n) | platform.openai.com |
| `META_PAGE_TOKEN` | Publicar en Instagram + Facebook | developers.facebook.com |
| `INSTAGRAM_ACCOUNT_ID` | ID cuenta IG Business | Meta Business Suite |
| `FACEBOOK_PAGE_ID` | ID página de Facebook | Página → Acerca de |
| `GOOGLE_SHEETS_ID` | Log de publicaciones | ID en URL del Sheet |
| `SUPABASE_URL` | Estado entre webhooks | app.supabase.com → Settings |
| `SUPABASE_ANON_KEY` | Auth Supabase | app.supabase.com → Settings |

---

## 🤖 MODELOS DE IMAGEN — LÓGICA DEL ROUTER

| Modelo | Cuándo sugerirlo | Costo | Fortaleza |
|--------|-----------------|-------|-----------|
| **Flux 2 Pro** | Posts educativos, sin texto en imagen | $0.03 | Fotorrealismo premium |
| **Ideogram v3** | Cualquier post con texto/datos/stats visibles | $0.06 | Texto legible 90-95% |
| **Nano Banana Pro** | Casos de éxito, autoridad, alto impacto | $0.15 | Razonamiento visual, 4K |
| **Custom** | El usuario pega una URL propia | $0 | — |

> ⚠️ **Midjourney NO está incluido** — no tiene API oficial.
> Los servicios de terceros violan sus TOS y pueden banear la cuenta.
> Flux + Ideogram + Nano Banana cubren todos los casos de uso con APIs oficiales.

---

## 🧙 COMANDOS DEL WIZARD

Cuando el usuario diga cualquiera de estas cosas, ejecutar el Wizard:

```bash
node wizard/run.js
```

**Frases que activan el Wizard:**
- "generar contenido" / "crear post" / "nuevo post"
- "quiero publicar" / "post para hoy"
- "contenido para Instagram" / "contenido para Facebook"

**El Wizard hace esto en orden:**
1. Busca trending topics con Perplexity (o usa fallback curado)
2. El usuario elige el tema
3. El usuario elige el tipo (educativo / autoridad / caso de éxito)
4. Claude sugiere 3 ángulos ganadores rankeados
5. El usuario elige el ángulo
6. El usuario elige plataformas
7. El sistema sugiere el modelo de imagen óptimo (con explicación)
8. El usuario puede aceptar la sugerencia o elegir otro
9. Se muestra el resumen y se envía el webhook a n8n

---

## 🔧 OTROS COMANDOS

| El usuario dice | Qué hacer |
|----------------|-----------|
| "testear webhook" / "probar conexión" | `node scripts/test-webhook.js` |
| "instalar dependencias" | `npm install` |
| "ver variables de entorno" | Mostrar `.env.example` con explicación |
| "actualizar brand voice" | Editar `prompts/brand-voice.md` |
| "ver logs de publicaciones" | Indicar que están en Google Sheets |
| "agregar modelo de imagen" | Editar `wizard/run.js` → objeto `IMAGE_MODELS` + nodo en `n8n/workflow.json` |
| "cambiar el prompt de texto" | Editar el nodo "GPT-4o — Texto" en `n8n/workflow.json` |

---

## ⚠️ REGLAS CRÍTICAS

1. **NUNCA publicar sin aprobación por WhatsApp** — es un requisito no negociable
2. **NUNCA commitear `.env`** — solo `.env.example` va al repo
3. **NUNCA usar Midjourney** — no tiene API oficial, riesgo de ban
4. **Los posts deben sonar humanos** — si suena a IA genérica, regenerar
5. **Siempre verificar que WEBHOOK_URL esté en `.env`** antes de enviar
6. Si el webhook falla, primero correr `node scripts/test-webhook.js` para diagnosticar

---

## 🐛 DIAGNÓSTICO DE ERRORES COMUNES

| Error | Causa más probable | Solución |
|-------|--------------------|---------|
| `WEBHOOK_URL no configurado` | Falta en `.env` | Copiar URL del nodo Webhook en n8n |
| `HTTP 404 del webhook` | Workflow inactivo en n8n | Activar el workflow (toggle en n8n) |
| `JSON inválido de OpenAI` | Temperature muy alta | Bajar a 0.5 en el nodo de OpenAI |
| `No recibo WhatsApp` | Número mal formateado | Formato: código país + número sin + ni espacios |
| `FAL.AI 401` | API key incorrecta | Verificar `FAL_API_KEY` en `.env` de n8n |
| `Ideogram 403` | API key incorrecta | Verificar `IDEOGRAM_API_KEY` |
| `No se pudo extraer URL de imagen` | Cambio en respuesta de la API | Ver log en n8n → nodo "Normalizar URL imagen" |

---

## 📋 BRIEF JSON QUE ENVÍA EL WIZARD

El webhook recibe exactamente esto:

```json
{
  "topic": "string — el tema del post",
  "type": "educational | authority | case_study",
  "angle": "string | null — el ángulo elegido",
  "platforms": ["instagram", "facebook"],
  "image_model": "flux | ideogram | nanoBanana | custom",
  "fal_model_id": "fal-ai/flux-pro/v1.1 | fal-ai/nano-banana | null",
  "has_own_image": false,
  "image_url": "null | string",
  "has_text_in_image": false,
  "approval_number": "34612345678",
  "timestamp": "2025-01-01T12:00:00.000Z"
}
```

---

## 🚀 PRIMER USO — SETUP RÁPIDO

Si es la primera vez que se corre este proyecto:

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar variables de entorno
cp .env.example .env
# Editar .env con las credenciales reales

# 3. Importar el workflow en n8n
# → n8n → Workflows → Import → subir n8n/workflow.json

# 4. Activar el workflow en n8n y copiar la URL del Webhook Trigger
# → Pegar en .env como WEBHOOK_URL

# 5. Testear la conexión
node scripts/test-webhook.js

# 6. Si el test pasa, ejecutar el Wizard
node wizard/run.js
```

Para el setup completo de credenciales (Meta, YCloud, Supabase), ver `SETUP.md`.
