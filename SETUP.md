# 🛠️ SETUP GUIDE — Propulsar Content Engine

Guía completa para dejar el sistema funcionando desde cero.
Tiempo estimado: 2-3 horas la primera vez.

---

## FASE 1 — Setup local (VS Code)

### 1.1 Clonar/copiar el proyecto
```bash
cd /tu/directorio/de/proyectos
# Si está en GitHub:
git clone https://github.com/propulsar/content-engine.git
cd propulsar-content-engine

# O simplemente copiar la carpeta generada
```

### 1.2 Instalar dependencias
```bash
npm install
```

### 1.3 Configurar variables de entorno
```bash
cp .env.example .env
# Editar .env con tus credenciales reales
```

---

## FASE 2 — Credenciales necesarias

### 2.1 Meta (Instagram + Facebook)

1. Ir a https://developers.facebook.com
2. Crear una App → Business → conectar tu página de Facebook
3. En Graph API Explorer:
   - Seleccionar tu App
   - Generar User Access Token con permisos:
     - `pages_manage_posts`
     - `pages_read_engagement`
     - `instagram_basic`
     - `instagram_content_publish`
4. Convertir a **Page Access Token** (sin vencimiento):
   ```
   GET /{page-id}?fields=access_token&access_token={user-token}
   ```
5. Obtener Instagram Account ID:
   ```
   GET /me/accounts → ver id de tu página
   GET /{page-id}?fields=instagram_business_account
   ```

### 2.2 YCloud (WhatsApp)

1. Ir a https://app.ycloud.com
2. Settings → API Keys → Crear nueva API key
3. Configurar webhook de incoming messages:
   - URL: `https://n8n-azure.propulsar.ai/webhook/propulsar-whatsapp-reply`
   - Events: `whatsapp.inbound.messages`
4. Anotar tu número de WhatsApp Business (el que envía mensajes)

### 2.3 OpenAI

1. Ir a https://platform.openai.com/api-keys
2. Create new secret key
3. Verificar que tu cuenta tiene créditos para DALL-E 3

### 2.4 Google Sheets (log)

1. Crear una nueva hoja en Google Sheets
2. Primera fila (headers):
   ```
   Fecha | Tema | Tipo | Plataformas | Estado | Instagram_URL | Facebook_URL | Imagen_URL
   ```
3. Copiar el ID de la URL
4. En n8n, configurar credenciales de Google OAuth2

---

## FASE 3 — Configurar n8n

### 3.1 Importar workflow
1. n8n → Workflows → Import from file
2. Seleccionar `n8n/workflow.json`
3. El workflow se importa con todos los nodos

### 3.2 Configurar credenciales en n8n
Para cada nodo que lo requiera:
- **OpenAI**: Settings → Credentials → New → OpenAI API
- **Google Sheets**: Settings → Credentials → New → Google Sheets OAuth2
- **HTTP Request (YCloud)**: Las credenciales van en variables de entorno de n8n

### 3.3 Configurar variables de entorno en n8n (Azure)
En Azure Container Apps → tu container de n8n → Environment Variables:
```
YCLOUD_API_KEY=tu_api_key
YCLOUD_WHATSAPP_NUMBER=tu_numero
META_PAGE_TOKEN=tu_page_token
INSTAGRAM_ACCOUNT_ID=tu_instagram_id
FACEBOOK_PAGE_ID=tu_facebook_id
GOOGLE_SHEETS_ID=tu_sheets_id
```

### 3.4 Activar el workflow
- Toggle "Active" en la esquina superior derecha
- Copiar la URL del Webhook Trigger (primer nodo)
- Pegarla en tu `.env` local como `WEBHOOK_URL`

### 3.5 Configurar webhook de aprobación en YCloud
- En YCloud → Webhooks → añadir:
  - URL: `https://n8n-azure.propulsar.ai/webhook/propulsar-whatsapp-reply`

---

## FASE 4 — Estado entre webhooks (Supabase)

El flujo de aprobación tiene dos webhooks separados:
1. El wizard dispara el primero → n8n genera contenido y envía WhatsApp
2. YCloud dispara el segundo → n8n recibe la respuesta (SI/NO)

**El problema**: n8n no recuerda el contenido entre dos ejecuciones distintas.
**La solución**: guardar el contenido en Supabase entre los dos webhooks.

### 4.1 Crear tabla en Supabase
```sql
CREATE TABLE content_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id TEXT UNIQUE NOT NULL,
  topic TEXT,
  type TEXT,
  platforms TEXT[],
  instagram_caption TEXT,
  facebook_caption TEXT,
  image_url TEXT,
  approval_number TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.2 Actualizar el nodo "Recuperar contenido aprobado" en n8n
Reemplazar el código placeholder con:
```javascript
// Buscar en Supabase el contenido pendiente por número de teléfono
const phone = $json.body.message?.from;
const supabaseUrl = $env.SUPABASE_URL;
const supabaseKey = $env.SUPABASE_ANON_KEY;

// Hacer GET a Supabase REST API
const response = await $http.get(
  `${supabaseUrl}/rest/v1/content_sessions?approval_number=eq.${phone}&status=eq.pending&order=created_at.desc&limit=1`,
  { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
);

return [{ json: response.data[0] }];
```

---

## FASE 5 — Test end-to-end

```bash
# 1. Testear que el webhook responde
node scripts/test-webhook.js

# 2. Si funciona, ejecutar el wizard completo
npm run wizard
# → Elegir opciones de prueba
# → Confirmar envío
# → Revisar en n8n que la ejecución se disparó
# → Recibir preview por WhatsApp
# → Responder SI
# → Verificar que se logueó en Google Sheets
```

---

## Problemas comunes

| Error | Causa | Solución |
|-------|-------|---------|
| `WEBHOOK_URL no configurado` | Falta en .env | Copiar URL del nodo Webhook en n8n |
| `HTTP 404 del webhook` | Workflow inactivo | Activar el workflow en n8n |
| `OpenAI no devolvió JSON válido` | Temperature muy alta | Bajar a 0.5 en el nodo de OpenAI |
| `No recibo WhatsApp` | Número mal formateado | Usar formato: código país + número sin + |
| `Error Meta API` | Token vencido | Renovar Page Access Token |
