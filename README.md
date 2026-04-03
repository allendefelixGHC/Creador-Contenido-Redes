# Propulsar Content Engine v3

Pipeline automatizado de generacion y publicacion de contenido para Instagram + Facebook.

Genera texto con IA, crea imagenes, envia preview por WhatsApp para aprobacion y publica automaticamente.

## Como funciona

```
Wizard (wizard/run.js)
  1. Busca trending topics (Perplexity API)
  2. Sugiere angulos ganadores (Claude API)
  3. Sugiere modelo de imagen segun tipo de post
  4. Envia brief al webhook de n8n
        |
n8n (workflow en tu instancia)
  5. GPT-4o genera texto para Instagram + Facebook
  6. Genera imagen (Flux / Ideogram / Nano Banana)
  7. Envia preview por WhatsApp (YCloud)
  8. Espera respuesta: SI o NO
        |
  9. SI -> publica en Instagram + Facebook (Meta Graph API)
 10. Loguea en Google Sheets
```

## Quick Start

```bash
# 1. Clonar el repo
git clone https://github.com/allendefelixGHC/Creador-Contenido-Redes.git
cd Creador-Contenido-Redes

# 2. Instalar dependencias
npm install

# 3. Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales reales (ver seccion Credenciales)

# 4. Importar el workflow en n8n
#    n8n -> Workflows -> Import from file -> seleccionar n8n/workflow.json
#    Configurar credenciales de OpenAI en el nodo "GPT-4o — Texto"
#    Activar el workflow (toggle arriba a la derecha)
#    Copiar la URL del Webhook Trigger -> pegar en .env como WEBHOOK_URL

# 5. Testear la conexion
node scripts/test-webhook.js

# 6. Crear contenido
node wizard/run.js
```

## Estructura del proyecto

```
├── wizard/run.js          <- Wizard interactivo (PUNTO DE ENTRADA)
├── n8n/workflow.json      <- Workflow para importar en n8n
├── scripts/test-webhook.js <- Test de conexion sin publicar
├── prompts/brand-voice.md <- Voz y tono de marca
├── .env.example           <- Template de variables de entorno
├── CLAUDE.md              <- Instrucciones para Claude Code
├── SETUP.md               <- Guia detallada de setup
└── README.md              <- Este archivo
```

## Credenciales necesarias (.env)

| Variable | Para que | Donde obtenerla |
|----------|----------|-----------------|
| `WEBHOOK_URL` | Trigger del workflow n8n | n8n -> Workflow -> Webhook node -> copiar URL |
| `WHATSAPP_APPROVAL_NUMBER` | Numero que recibe aprobaciones | Tu numero (ej: 34612345678) |
| `ANTHROPIC_API_KEY` | Sugerencia de angulos en Wizard | console.anthropic.com |
| `PERPLEXITY_API_KEY` | Trending topics (opcional) | perplexity.ai/settings/api |
| `OPENAI_API_KEY` | GPT-4o para texto (en n8n) | platform.openai.com |
| `FAL_API_KEY` | Flux 2 Pro + Nano Banana Pro | fal.ai/dashboard/keys |
| `IDEOGRAM_API_KEY` | Ideogram v3 (texto en imagen) | ideogram.ai -> API |
| `YCLOUD_API_KEY` | Envio de WhatsApp | app.ycloud.com -> API Keys |
| `YCLOUD_WHATSAPP_NUMBER` | Numero WA Business | app.ycloud.com |
| `META_PAGE_TOKEN` | Publicar en IG + FB | developers.facebook.com |
| `INSTAGRAM_ACCOUNT_ID` | ID cuenta IG Business | Meta Business Suite |
| `FACEBOOK_PAGE_ID` | ID pagina de Facebook | Pagina -> Acerca de |
| `GOOGLE_SHEETS_ID` | Log de publicaciones | ID en URL del Sheet |
| `SUPABASE_URL` | Estado entre webhooks | app.supabase.com |
| `SUPABASE_ANON_KEY` | Auth Supabase | app.supabase.com -> Settings -> API |

## Modelos de imagen

| Modelo | Cuando usarlo | Costo |
|--------|--------------|-------|
| **Flux 2 Pro** | Posts educativos, sin texto en imagen | $0.03/img |
| **Ideogram v3** | Posts con texto/datos visibles | $0.06/img |
| **Nano Banana Pro** | Casos de exito, alto impacto | $0.15/img |

## Notas importantes

- **NUNCA publicar sin aprobacion por WhatsApp** — requisito no negociable
- **NUNCA commitear `.env`** — solo `.env.example` va al repo
- Si el webhook falla, correr `node scripts/test-webhook.js` para diagnosticar
- Para setup completo de credenciales (Meta, YCloud, Supabase), ver `SETUP.md`
