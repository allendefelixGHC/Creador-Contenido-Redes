# 🚀 Propulsar Content Engine

Sistema de generación y publicación automática de contenido para redes sociales de Propulsar.ai.

## Stack

```
[Claude Code Wizard (VS Code)]
        ↓ webhook
[n8n en Azure]
        ↓
[OpenAI → genera texto + imagen]
        ↓
[YCloud → aprobación por WhatsApp]
        ↓ aprobado
[Meta Graph API → Instagram + Facebook]
        ↓
[Google Sheets → log]
```

## Estructura del proyecto

```
propulsar-content-engine/
├── README.md
├── CLAUDE.md                    ← Instrucciones para Claude Code
├── .env.example                 ← Variables de entorno necesarias
├── wizard/
│   └── run.js                   ← Wizard interactivo (punto de entrada)
├── n8n/
│   └── workflow.json            ← Template del workflow n8n (importar directo)
├── prompts/
│   ├── brand-voice.md           ← Voz y tono de Propulsar
│   ├── instagram.md             ← Instrucciones específicas Instagram
│   └── facebook.md              ← Instrucciones específicas Facebook
└── scripts/
    └── test-webhook.js          ← Test del webhook sin publicar
```

## Setup rápido

### 1. Variables de entorno
```bash
cp .env.example .env
# Completar con tus credenciales reales
```

### 2. Instalar dependencias
```bash
npm install
```

### 3. Importar workflow en n8n
- Ir a n8n → Workflows → Import
- Subir `n8n/workflow.json`
- Configurar credenciales (ver sección Credenciales)

### 4. Ejecutar el Wizard
```bash
node wizard/run.js
# O desde Claude Code: "Run the content wizard"
```

## Credenciales necesarias

| Servicio | Dónde conseguirlo |
|----------|------------------|
| `WEBHOOK_URL` | n8n → tu workflow → Webhook node → URL |
| `OPENAI_API_KEY` | platform.openai.com |
| `YCLOUD_API_KEY` | app.ycloud.com → API |
| `META_PAGE_TOKEN` | developers.facebook.com → Graph API Explorer |
| `INSTAGRAM_ACCOUNT_ID` | Meta Business Suite → Configuración |
| `FACEBOOK_PAGE_ID` | Tu página de Facebook → Acerca de |
| `WHATSAPP_APPROVAL_NUMBER` | Tu número para recibir aprobaciones (ej: 34612345678) |
| `GOOGLE_SHEETS_ID` | ID de la hoja de log (de la URL de Google Sheets) |

## Flujo de aprobación

1. Wizard genera el brief → dispara webhook
2. n8n genera texto + imagen con OpenAI
3. n8n envía preview por WhatsApp via YCloud
4. Vos respondés **"SI"** o **"NO"** al mensaje
5. Si "SI" → publica en Instagram y Facebook
6. Si "NO" → cancela y loguea como rechazado
