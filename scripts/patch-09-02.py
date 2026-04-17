"""
Phase 09-02: Error Handler Subgraph
Patches n8n/workflow.json to:
1. Change onError on all 12 Meta HTTP Request nodes -> continueErrorOutput
2. Set retryOnFail=true/maxTries=2 on idempotent container nodes
3. Build 9-node error handler subgraph:
   tag-ig-error, tag-fb-error, parse-meta-error, check-token-expired,
   wa-token-expired, wa-error-publish, sheets-fail-log, extract-blob-names, delete-azure-blob
4. Wire error outputs from Meta nodes -> tag-ig-error / tag-fb-error
5. Add Error_Msg column to success Sheets logs (schema consistency)
6. Wire success Sheets logs -> extract-blob-names (blob cleanup on success)
"""

import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

with open('n8n/workflow.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

nodes_list = wf['nodes']
nodes = {n['id']: n for n in nodes_list}
conns = wf.get('connections', {})

# =========================================================================
# PART A: Change onError on all 10 publish Meta HTTP Request nodes
# (comment nodes already have continueErrorOutput from Plan 01)
# =========================================================================
meta_publish_ids = [
    'ig-create-container',
    'ig-media-publish',
    'ig-get-permalink',
    'fb-publish-photo',
    'ig-create-child-container',
    'ig-create-parent-container',
    'ig-carousel-media-publish',
    'ig-get-carousel-permalink',
    'fb-upload-photo-unpublished',
    'fb-publish-carousel-feed',
]

for nid in meta_publish_ids:
    nodes[nid]['onError'] = 'continueErrorOutput'
    print(f'OK: {nid} -> onError=continueErrorOutput')

# =========================================================================
# PART A2: Set retryOnFail=true, maxTries=2, waitBetweenTries=3000
# on idempotent container creation nodes
# =========================================================================
idempotent_ids = [
    'ig-create-container',
    'ig-create-child-container',
    'ig-create-parent-container',
    'fb-upload-photo-unpublished',
]

for nid in idempotent_ids:
    nodes[nid]['retryOnFail'] = True
    nodes[nid]['maxTries'] = 2
    nodes[nid]['waitBetweenTries'] = 3000
    print(f'OK: {nid} -> retryOnFail=true, maxTries=2')

# Note: ig-media-publish, ig-carousel-media-publish, fb-publish-photo, fb-publish-carousel-feed
# keep retryOnFail=false (not idempotent - duplicate post risk)

# =========================================================================
# PART B: Add Error_Msg column to success Sheets log nodes
# =========================================================================
for nid in ['log-sheets', 'log-sheets-carousel']:
    cols = nodes[nid]['parameters']['columns']
    cols['value']['Error_Msg'] = ''
    # Add to schema
    cols['schema'].append({
        'id': 'Error_Msg',
        'displayName': 'Error_Msg',
        'required': False,
        'defaultMatch': False,
        'display': True,
        'type': 'string',
        'canBeUsedToMatch': True,
    })
    print(f'OK: {nid} -> added Error_Msg column')

# =========================================================================
# PART C: Build 9-node error handler subgraph
# Layout: error nodes go below the main workflow (y~900+)
# Positioning: start from x=4200 (roughly midpoint of Meta node range)
# =========================================================================

# Positions
TAG_IG_X, TAG_IG_Y = 4500, 900
TAG_FB_X, TAG_FB_Y = 5500, 900
PARSE_ERR_X, PARSE_ERR_Y = 5000, 1100
CHECK_TOKEN_X, CHECK_TOKEN_Y = 5000, 1300
WA_TOKEN_X, WA_TOKEN_Y = 4600, 1500
WA_ERROR_X, WA_ERROR_Y = 5400, 1500
SHEETS_FAIL_X, SHEETS_FAIL_Y = 5000, 1700
EXTRACT_BLOB_X, EXTRACT_BLOB_Y = 5000, 1900
DELETE_BLOB_X, DELETE_BLOB_Y = 5000, 2100

# Node 1: Tag IG Error (Set node)
tag_ig_error = {
    'parameters': {
        'mode': 'manual',
        'duplicateItem': False,
        'assignments': {
            'assignments': [
                {
                    'id': 'tag-ig-platform',
                    'name': '_platform',
                    'type': 'string',
                    'value': 'Instagram',
                }
            ]
        },
        'options': {'includeOtherFields': True},
    },
    'id': 'tag-ig-error',
    'name': '🏷️ Tag IG Error',
    'type': 'n8n-nodes-base.set',
    'typeVersion': 3.4,
    'position': [TAG_IG_X, TAG_IG_Y],
    'notes': 'Receives error outputs from IG Meta nodes. Adds _platform=Instagram for Parse Meta Error.',
}

# Node 2: Tag FB Error (Set node)
tag_fb_error = {
    'parameters': {
        'mode': 'manual',
        'duplicateItem': False,
        'assignments': {
            'assignments': [
                {
                    'id': 'tag-fb-platform',
                    'name': '_platform',
                    'type': 'string',
                    'value': 'Facebook',
                }
            ]
        },
        'options': {'includeOtherFields': True},
    },
    'id': 'tag-fb-error',
    'name': '🏷️ Tag FB Error',
    'type': 'n8n-nodes-base.set',
    'typeVersion': 3.4,
    'position': [TAG_FB_X, TAG_FB_Y],
    'notes': 'Receives error outputs from FB Meta nodes. Adds _platform=Facebook for Parse Meta Error.',
}

# Node 3: Parse Meta Error (Code node)
parse_meta_error_code = r"""const raw = $input.first().json;
let err = {};
try {
  err = raw.error || {};
  if (!err.code && raw.cause && raw.cause.response && raw.cause.response.body) {
    const parsed = JSON.parse(raw.cause.response.body);
    err = parsed.error || err;
  }
} catch(e) {}

// Primary: Merge Rehost Output (structural guarantee: always runs before Meta calls)
// Fallback: Prep Re-host Input (runs even earlier)
let mergeData = {};
try { mergeData = $('🔗 Merge Rehost Output').first().json; } catch(e) {
  try { mergeData = $('🔧 Prep Re-host Input').first().json; } catch(e2) {}
}

return [{
  json: {
    error_code: err.code || 0,
    error_message: err.message || 'Error desconocido de Meta API',
    error_type: err.type || '',
    fbtrace_id: err.fbtrace_id || '',
    platform_failed: raw._platform || 'Meta',
    is_token_expired: (err.type === 'OAuthException' && err.code === 190),
    approval_number: mergeData.approval_number || '',
    topic: mergeData.topic || '',
    blob_urls: mergeData.blob_urls || [],
  }
}];"""

parse_meta_error = {
    'parameters': {
        'jsCode': parse_meta_error_code,
        'mode': 'runOnceForEachItem',
    },
    'id': 'parse-meta-error',
    'name': '🚨 Parse Meta Error',
    'type': 'n8n-nodes-base.code',
    'typeVersion': 2,
    'position': [PARSE_ERR_X, PARSE_ERR_Y],
    'notes': 'Extracts structured error info from Meta HTTP error response. Cross-refs Merge Rehost Output for approval_number, topic, blob_urls. _platform comes from Tag IG/FB Error nodes.',
}

# Node 4: IF ¿Token Expirado? (IF node typeVersion 1)
check_token_expired = {
    'parameters': {
        'conditions': {
            'string': [
                {
                    'value1': '={{ String($json.is_token_expired) }}',
                    'value2': 'true',
                }
            ]
        }
    },
    'id': 'check-token-expired',
    'name': '⚠️ ¿Token Expirado?',
    'type': 'n8n-nodes-base.if',
    'typeVersion': 1,
    'position': [CHECK_TOKEN_X, CHECK_TOKEN_Y],
    'notes': 'Routes OAuthException code 190 (expired token) to specific WA alert mentioning Susana. FALSE output -> generic WA error.',
}

# Node 5: WA Token Expirado (HTTP Request)
wa_token_expired_body = json.dumps({
    'from': '={{ $env.YCLOUD_WHATSAPP_NUMBER }}',
    'to': '={{ $json.approval_number }}',
    'type': 'text',
    'text': {
        'body': (
            '\u26a0\ufe0f *Token Meta expirado* \u2014 verificar que Susana sigue como admin de la p\u00e1gina\n\n'
            'Tema: {{ $json.topic }}\n'
            'Plataforma: {{ $json.platform_failed }}\n'
            'fbtrace_id: {{ $json.fbtrace_id }}'
        )
    },
})

wa_token_expired = {
    'parameters': {
        'method': 'POST',
        'url': 'https://api.ycloud.com/v2/whatsapp/messages',
        'sendHeaders': True,
        'headerParameters': {
            'parameters': [
                {'name': 'X-API-Key', 'value': '={{ $env.YCLOUD_API_KEY }}'},
                {'name': 'Content-Type', 'value': 'application/json'},
            ]
        },
        'sendBody': True,
        'specifyBody': 'json',
        'jsonBody': '={{ JSON.stringify({ from: $env.YCLOUD_WHATSAPP_NUMBER, to: $json.approval_number, type: "text", text: { body: "\u26a0\ufe0f *Token Meta expirado* \u2014 verificar que Susana sigue como admin de la p\u00e1gina\\n\\nTema: " + $json.topic + "\\nPlataforma: " + $json.platform_failed + "\\nfbtrace_id: " + $json.fbtrace_id } }) }}',
        'options': {},
    },
    'id': 'wa-token-expired',
    'name': '📤 WA: Token Expirado',
    'type': 'n8n-nodes-base.httpRequest',
    'typeVersion': 4.2,
    'position': [WA_TOKEN_X, WA_TOKEN_Y],
    'onError': 'continueErrorOutput',
    'notes': 'Sends WhatsApp alert for expired Meta token (OAuthException code 190). Mentions Susana as admin. onError=continueErrorOutput so WA failure does not block Sheets fail log.',
}

# Node 6: WA Error Publicacion (HTTP Request)
wa_error_publish = {
    'parameters': {
        'method': 'POST',
        'url': 'https://api.ycloud.com/v2/whatsapp/messages',
        'sendHeaders': True,
        'headerParameters': {
            'parameters': [
                {'name': 'X-API-Key', 'value': '={{ $env.YCLOUD_API_KEY }}'},
                {'name': 'Content-Type', 'value': 'application/json'},
            ]
        },
        'sendBody': True,
        'specifyBody': 'json',
        'jsonBody': '={{ JSON.stringify({ from: $env.YCLOUD_WHATSAPP_NUMBER, to: $json.approval_number, type: "text", text: { body: "\u274c *Error publicando en " + $json.platform_failed + "*\\n\\nC\u00f3digo: " + $json.error_code + "\\nMensaje: " + $json.error_message + "\\nTrace ID: " + $json.fbtrace_id + "\\nTema: " + $json.topic } }) }}',
        'options': {},
    },
    'id': 'wa-error-publish',
    'name': '📤 WA: Error Publicación',
    'type': 'n8n-nodes-base.httpRequest',
    'typeVersion': 4.2,
    'position': [WA_ERROR_X, WA_ERROR_Y],
    'onError': 'continueErrorOutput',
    'notes': 'Sends generic WhatsApp error alert with error_code, error_message, fbtrace_id, platform. onError=continueErrorOutput so WA failure does not block Sheets fail log.',
}

# Node 7: Sheets Fail Log (Google Sheets)
sheets_fail_log = {
    'parameters': {
        'documentId': {
            '__rl': True,
            'mode': 'id',
            'value': '={{ $env.GOOGLE_SHEETS_ID }}',
        },
        'sheetName': {
            '__rl': True,
            'mode': 'name',
            'value': 'Log',
        },
        'columns': {
            'mappingMode': 'defineBelow',
            'value': {
                'Fecha': '={{ new Date().toISOString() }}',
                'Tema': '={{ $json.topic }}',
                'Tipo': '',
                'Angulo': '',
                'Plataformas': '={{ $json.platform_failed }}',
                'Modelo_Imagen': '',
                'Imagen_URL': '',
                'Estado': 'Error',
                'IG_URL': '',
                'FB_URL': '',
                'Publicado_En': '={{ new Date().toISOString() }}',
                'Publish_Status': 'failed',
                'Error_Msg': '={{ $json.error_message + " [" + $json.fbtrace_id + "]" }}',
            },
            'schema': [
                {'id': 'Fecha', 'displayName': 'Fecha', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'Tema', 'displayName': 'Tema', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'Tipo', 'displayName': 'Tipo', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'Angulo', 'displayName': 'Angulo', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'Plataformas', 'displayName': 'Plataformas', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'Modelo_Imagen', 'displayName': 'Modelo_Imagen', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'Imagen_URL', 'displayName': 'Imagen_URL', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'Estado', 'displayName': 'Estado', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'IG_URL', 'displayName': 'IG_URL', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'FB_URL', 'displayName': 'FB_URL', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'Publicado_En', 'displayName': 'Publicado_En', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'Publish_Status', 'displayName': 'Publish_Status', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
                {'id': 'Error_Msg', 'displayName': 'Error_Msg', 'required': False, 'defaultMatch': False, 'display': True, 'type': 'string', 'canBeUsedToMatch': True},
            ],
        },
        'operation': 'append',
        'resource': 'sheet',
    },
    'id': 'sheets-fail-log',
    'name': '📊 Sheets Fail Log',
    'type': 'n8n-nodes-base.googleSheets',
    'typeVersion': 4.4,
    'position': [SHEETS_FAIL_X, SHEETS_FAIL_Y],
    'credentials': {
        'googleSheetsOAuth2Api': {
            'id': 'XjKteoOTobs1qR55',
            'name': 'Google Sheets account',
        }
    },
    'notes': 'Logs publish failures with Publish_Status=failed + Error_Msg. Same credentials and sheet as success log. Receives from both WA: Token Expirado and WA: Error Publicacion (and their error outputs).',
}

# Node 8: Extract Blob Names (Code node)
extract_blob_names_code = r"""const data = $input.first().json;
let blobUrls = data.blob_urls || [];
if (blobUrls.length === 0) {
  try { blobUrls = $('🔗 Merge Rehost Output').first().json.blob_urls || []; } catch(e) {}
}
if (blobUrls.length === 0) return [{ json: { ...data, has_blobs: 'false' } }];
const prefix = 'https://propulsarcontent.blob.core.windows.net/posts/';
return blobUrls.map(entry => ({
  json: {
    current_blob_name: (entry.url || entry).replace(prefix, '').split('?')[0],
    approval_number: data.approval_number || '',
  }
}));"""

extract_blob_names = {
    'parameters': {
        'jsCode': extract_blob_names_code,
        'mode': 'runOnceForAllItems',
    },
    'id': 'extract-blob-names',
    'name': '🧹 Extract Blob Names',
    'type': 'n8n-nodes-base.code',
    'typeVersion': 2,
    'position': [EXTRACT_BLOB_X, EXTRACT_BLOB_Y],
    'notes': 'Extracts blob names from blob_urls for DELETE. Receives from success Sheets logs AND Sheets Fail Log. Falls back to Merge Rehost Output cross-ref if blob_urls not in item.',
}

# Node 9: Delete Azure Blob (HTTP Request)
delete_azure_blob = {
    'parameters': {
        'method': 'DELETE',
        'url': '=https://{{ $env.AZURE_STORAGE_ACCOUNT }}.blob.core.windows.net/{{ $env.AZURE_CONTAINER }}/{{ $json.current_blob_name }}?{{ $env.AZURE_SAS_PARAMS }}',
        'sendHeaders': True,
        'headerParameters': {
            'parameters': [
                {'name': 'x-ms-version', 'value': '2020-10-02'},
                {'name': 'x-ms-date', 'value': '={{ new Date().toUTCString() }}'},
            ]
        },
        'options': {},
    },
    'id': 'delete-azure-blob',
    'name': '🗑️ Delete Azure Blob',
    'type': 'n8n-nodes-base.httpRequest',
    'typeVersion': 4.2,
    'position': [DELETE_BLOB_X, DELETE_BLOB_Y],
    'retryOnFail': True,
    'maxTries': 2,
    'waitBetweenTries': 2000,
    'onError': 'continueErrorOutput',
    'notes': 'Deletes Azure Blob file. DELETE is idempotent (404 = already deleted, acceptable). retryOnFail=true. onError=continueErrorOutput so 404 does not block execution.',
}

# Add new nodes to workflow
new_nodes = [
    tag_ig_error, tag_fb_error, parse_meta_error, check_token_expired,
    wa_token_expired, wa_error_publish, sheets_fail_log, extract_blob_names, delete_azure_blob
]
nodes_list.extend(new_nodes)
print(f'\nAdded {len(new_nodes)} new error handler nodes')

# =========================================================================
# PART D: Wire error outputs from Meta nodes
# Error output = connection index 1 in n8n (main[1])
# IG nodes -> Tag IG Error
# FB nodes -> Tag FB Error
# =========================================================================

ig_error_node_ids = [
    'ig-create-container', 'ig-media-publish', 'ig-get-permalink',
    'ig-create-child-container', 'ig-create-parent-container',
    'ig-carousel-media-publish', 'ig-get-carousel-permalink',
    # Also wire comment nodes (already have continueErrorOutput from Plan 01)
    'ig-post-hashtag-comment', 'ig-post-carousel-hashtag-comment',
]

fb_error_node_ids = [
    'fb-publish-photo', 'fb-upload-photo-unpublished', 'fb-publish-carousel-feed',
]

def add_error_connection(conns, source_name, target_name):
    """Add error output connection (index 1) from source to target."""
    if source_name not in conns:
        conns[source_name] = {'main': []}

    main = conns[source_name]['main']
    # Ensure we have at least 2 slots: main[0] = normal output, main[1] = error output
    while len(main) < 2:
        main.append([])

    # Check if already connected
    for existing in main[1]:
        if existing.get('node') == target_name:
            return  # Already wired

    main[1].append({'node': target_name, 'type': 'main', 'index': 0})

nodes_by_id = {n['id']: n for n in nodes_list}

for nid in ig_error_node_ids:
    source_name = nodes_by_id[nid]['name']
    add_error_connection(conns, source_name, '🏷️ Tag IG Error')
    print(f'OK: {nid} ({source_name}) -> error -> Tag IG Error')

for nid in fb_error_node_ids:
    source_name = nodes_by_id[nid]['name']
    add_error_connection(conns, source_name, '🏷️ Tag FB Error')
    print(f'OK: {nid} ({source_name}) -> error -> Tag FB Error')

# =========================================================================
# PART E: Wire internal error handler subgraph connections
# =========================================================================

# Tag IG Error -> Parse Meta Error
if '🏷️ Tag IG Error' not in conns:
    conns['🏷️ Tag IG Error'] = {'main': [[]]}
else:
    while len(conns['🏷️ Tag IG Error']['main']) < 1:
        conns['🏷️ Tag IG Error']['main'].append([])
conns['🏷️ Tag IG Error']['main'][0].append({'node': '🚨 Parse Meta Error', 'type': 'main', 'index': 0})

# Tag FB Error -> Parse Meta Error
if '🏷️ Tag FB Error' not in conns:
    conns['🏷️ Tag FB Error'] = {'main': [[]]}
else:
    while len(conns['🏷️ Tag FB Error']['main']) < 1:
        conns['🏷️ Tag FB Error']['main'].append([])
conns['🏷️ Tag FB Error']['main'][0].append({'node': '🚨 Parse Meta Error', 'type': 'main', 'index': 0})

# Parse Meta Error -> IF Token Expirado
conns['🚨 Parse Meta Error'] = {'main': [[{'node': '⚠️ ¿Token Expirado?', 'type': 'main', 'index': 0}]]}

# IF Token Expirado: TRUE (index 0) -> WA Token Expirado, FALSE (index 1) -> WA Error Publicacion
conns['⚠️ ¿Token Expirado?'] = {
    'main': [
        [{'node': '📤 WA: Token Expirado', 'type': 'main', 'index': 0}],   # TRUE
        [{'node': '📤 WA: Error Publicación', 'type': 'main', 'index': 0}], # FALSE
    ]
}

# WA Token Expirado -> Sheets Fail Log (main output + error output)
conns['📤 WA: Token Expirado'] = {
    'main': [[{'node': '📊 Sheets Fail Log', 'type': 'main', 'index': 0}]],
}
# Also wire WA token expired error output to Sheets Fail Log (so WA failure still logs)
conns['📤 WA: Token Expirado']['main'].append([{'node': '📊 Sheets Fail Log', 'type': 'main', 'index': 0}])

# WA Error Publicacion -> Sheets Fail Log
conns['📤 WA: Error Publicación'] = {
    'main': [[{'node': '📊 Sheets Fail Log', 'type': 'main', 'index': 0}]],
}
conns['📤 WA: Error Publicación']['main'].append([{'node': '📊 Sheets Fail Log', 'type': 'main', 'index': 0}])

# Sheets Fail Log -> Extract Blob Names
conns['📊 Sheets Fail Log'] = {'main': [[{'node': '🧹 Extract Blob Names', 'type': 'main', 'index': 0}]]}

# Extract Blob Names -> Delete Azure Blob
conns['🧹 Extract Blob Names'] = {'main': [[{'node': '🗑️ Delete Azure Blob', 'type': 'main', 'index': 0}]]}

print('\nOK: Internal error handler subgraph wired')

# =========================================================================
# PART F: Wire success Sheets logs -> Extract Blob Names (blob cleanup on success)
# =========================================================================

# log-sheets (📊 Google Sheets Log) is connected FROM notify-wa-success
# We add log-sheets -> extract-blob-names
conns['📊 Google Sheets Log'] = {'main': [[{'node': '🧹 Extract Blob Names', 'type': 'main', 'index': 0}]]}
conns['📊 Google Sheets Log (Carousel)'] = {'main': [[{'node': '🧹 Extract Blob Names', 'type': 'main', 'index': 0}]]}

print('OK: Success Sheets logs -> Extract Blob Names (blob cleanup on success)')

# =========================================================================
# Save
# =========================================================================
wf['connections'] = conns
wf['nodes'] = nodes_list

with open('n8n/workflow.json', 'w', encoding='utf-8') as f:
    json.dump(wf, f, ensure_ascii=False, indent=2)

print(f'\nDone. Total nodes: {len(nodes_list)}')
print('Workflow saved to n8n/workflow.json')
