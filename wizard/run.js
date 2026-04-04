#!/usr/bin/env node

/**
 * Propulsar Content Engine — Wizard v3
 * Router inteligente de modelos de imagen: Flux 2 Pro / Ideogram v3 / Nano Banana Pro
 * Todos vía FAL.AI con una sola API key.
 */

const readline = require("readline");
const https = require("https");
const http = require("http");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

const C = {
  reset:"\x1b[0m", bright:"\x1b[1m", purple:"\x1b[35m",
  cyan:"\x1b[36m", green:"\x1b[32m", yellow:"\x1b[33m",
  red:"\x1b[31m",  gray:"\x1b[90m",  magenta:"\x1b[95m",
  blue:"\x1b[34m",
};
const c = (col, txt) => `${C[col]}${txt}${C.reset}`;
const div = (char = "━", len = 54) => console.log(c("purple", char.repeat(len)));

// ─── Configuración de modelos ──────────────────────────────
const IMAGE_MODELS = {
  flux: {
    id:          "flux",
    name:        "Flux 2 Pro",
    provider:    "FAL.AI",
    cost:        "$0.03/img",
    speed:       "~5s",
    strength:    "Fotorrealismo premium, iluminación perfecta",
    bestFor:     ["educational", "authority"],
    bestForLabel:"Posts educativos y de autoridad",
    emoji:       "⚡",
    falModel:    "fal-ai/flux-pro/v1.1",
  },
  ideogram: {
    id:          "ideogram",
    name:        "Ideogram v3",
    provider:    "FAL.AI",
    cost:        "$0.06/img",
    speed:       "~8s",
    strength:    "Texto legible en imagen, 90-95% de precisión tipográfica",
    bestFor:     ["educational"],
    bestForLabel:"Posts con estadísticas, datos o texto visible en imagen",
    emoji:       "🔤",
    falModel:    "fal-ai/ideogram/v3",
  },
  nanoBanana: {
    id:          "nanoBanana",
    name:        "Nano Banana Pro",
    provider:    "FAL.AI / Google",
    cost:        "$0.15/img",
    speed:       "~10s",
    strength:    "Razonamiento visual, 4K, comprende contexto complejo",
    bestFor:     ["case_study", "authority"],
    bestForLabel:"Posts de alto impacto, casos de éxito, autoridad de marca",
    emoji:       "🍌",
    falModel:    "fal-ai/nano-banana",
  },
};

// Sugerencia automática de modelo según tipo de post y presencia de texto
function suggestModel(postType, hasTextInImage) {
  if (hasTextInImage) return IMAGE_MODELS.ideogram;
  if (postType === "case_study") return IMAGE_MODELS.nanoBanana;
  if (postType === "authority") return IMAGE_MODELS.nanoBanana;
  return IMAGE_MODELS.flux; // educational por defecto
}

// ─── HTTP helper ───────────────────────────────────────────
function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const p = new URL(url);
    const isHttps = p.protocol === "https:";
    const client = isHttps ? https : http;
    const buf = Buffer.from(body, "utf8");
    const req = client.request({
      hostname: p.hostname,
      port:     p.port || (isHttps ? 443 : 80),
      path:     p.pathname + (p.search || ""),
      method:   "POST",
      headers:  { ...headers, "Content-Length": buf.length },
    }, (res) => {
      let d = "";
      res.on("data", chunk => d += chunk);
      res.on("end", () => {
        try { resolve(JSON.parse(d)); }
        catch { reject(new Error(`JSON error: ${d.substring(0, 200)}`)); }
      });
    });
    req.on("error", reject);
    req.write(buf);
    req.end();
  });
}

// ─── Trending topics via Perplexity ───────────────────────
async function getTrendingTopics() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  const FALLBACK = [
    "Agentes de IA autónomos: qué pueden hacer hoy por tu negocio",
    "El error más caro al implementar automatizaciones en PYMEs",
    "WhatsApp Business API vs. bots tradicionales: cuál elegir",
    "CRM + IA: automatizar el seguimiento sin perder el trato humano",
    "5 procesos que toda PYME debería automatizar antes de fin de año",
  ];
  if (!apiKey) return FALLBACK;
  console.log(c("gray", "  🔍 Buscando trending topics..."));
  try {
    const data = await httpPost(
      "https://api.perplexity.ai/chat/completions",
      JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "Responde SOLO con un JSON array de 5 strings. Sin markdown." },
          { role: "user",   content: "5 temas trending ahora sobre IA/automatización/WhatsApp Business para dueños de PYMEs en España y Latinoamérica. Array JSON de strings < 15 palabras cada uno." },
        ],
        max_tokens: 300,
      }),
      { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }
    );
    const txt = data.choices?.[0]?.message?.content || "";
    return JSON.parse(txt.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim());
  } catch {
    console.log(c("yellow", "  ⚠ Usando temas de respaldo"));
    return FALLBACK;
  }
}

// ─── Sugerencia de ángulos via Claude ─────────────────────
async function suggestAngles(topic, postType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const FALLBACK = [
    { angle:"El costo oculto de no automatizar esto",       why:"Dolor/pérdida — máxima conversión",          emoji:"💸" },
    { angle:"Caso real: resultado concreto en números",     why:"Prueba social — genera confianza",           emoji:"✅" },
    { angle:"Guía paso a paso para implementarlo hoy",      why:"Educativo accionable — máximo guardado",     emoji:"🛠️" },
  ];
  if (!apiKey) return FALLBACK;
  console.log(c("gray", "  🧠 Analizando ángulos ganadores..."));
  try {
    const typeCtx = {
      educational: "post educativo accionable",
      authority:   "post de autoridad sobre tendencia",
      case_study:  "post de caso de éxito con resultados reales",
    };
    const data = await httpPost(
      "https://api.anthropic.com/v1/messages",
      JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 600,
        messages: [{
          role: "user",
          content: `Estratega de contenido de Propulsar.ai (agencia automatizaciones IA para PYMEs).

Tema: "${topic}"
Tipo: ${typeCtx[postType] || typeCtx.educational}
Audiencia: dueños de PYMEs (talleres, inmobiliarias, clínicas) España y Latam.

3 ángulos ganadores rankeados por engagement en Instagram/Facebook.
Solo este JSON array sin markdown:
[{"angle":"max 10 palabras","why":"1 frase","emoji":"🎯"},{"angle":"...","why":"...","emoji":"📊"},{"angle":"...","why":"...","emoji":"💡"}]`,
        }],
      }),
      { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
    );
    const txt = data.content?.[0]?.text || "";
    return JSON.parse(txt.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim());
  } catch {
    return FALLBACK;
  }
}

// ─── Sugerencia de cantidad de slides via Claude ──────────
async function suggestSlideCount(topic, postType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const FALLBACK = { count: 5, reason: "Cantidad estándar para carruseles educativos" };
  if (!apiKey) return FALLBACK;
  try {
    const typeCtx = {
      educational: "post educativo accionable",
      authority:   "post de autoridad sobre tendencia",
      case_study:  "post de caso de éxito con resultados reales",
    };
    const data = await httpPost(
      "https://api.anthropic.com/v1/messages",
      JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 100,
        messages: [{
          role: "user",
          content: `Eres estratega de contenido para Instagram. Para un ${typeCtx[postType] || typeCtx.educational} sobre "${topic}", ¿cuántos slides tiene el carrusel ideal? Rango: 3-10. Solo JSON sin markdown: {"count": 5, "reason": "1 frase"}`,
        }],
      }),
      { "x-api-key": apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" }
    );
    const txt = data.content?.[0]?.text || "";
    const parsed = JSON.parse(txt.replace(/```json\n?/g,"").replace(/```\n?/g,"").trim());
    const count = Math.min(10, Math.max(3, parseInt(parsed.count) || 5));
    return { count, reason: parsed.reason || "" };
  } catch {
    return FALLBACK;
  }
}

// ─── WIZARD PRINCIPAL ──────────────────────────────────────
async function runWizard() {
  console.log("\n");
  div();
  console.log(c("bright", c("purple", "  🚀 PROPULSAR CONTENT ENGINE  v3")));
  console.log(c("gray",   "  Router inteligente de modelos de imagen"));
  div();
  console.log();

  // PASO 1: TEMA
  console.log(c("bright", "  PASO 1 — Tema del post"));
  const topicChoice = await ask(`\n  [1] Buscar trending topics ahora (Perplexity)\n  [2] Escribir mi propio tema\n  → `);
  let topic;
  if (topicChoice.trim() === "1") {
    const topics = await getTrendingTopics();
    console.log(c("green", "\n  📡 Trending topics:\n"));
    topics.forEach((t, i) => console.log(`  [${i+1}] ${t}`));
    console.log(`  [0] Ninguno, escribo el mío\n`);
    const pick = await ask("  → Número: ");
    const idx = parseInt(pick.trim()) - 1;
    topic = (idx >= 0 && idx < topics.length) ? topics[idx] : (await ask("  → Tu tema: ")).trim();
  } else {
    topic = (await ask("\n  → Tu tema: ")).trim();
  }
  console.log(c("green", `\n  ✓ "${topic}"\n`));

  // PASO 2: TIPO
  div();
  console.log(c("bright", "  PASO 2 — Tipo de post\n"));
  const typeChoice = await ask(
    `  [1] Educativo     — enseña algo accionable        (lunes)\n` +
    `  [2] Autoridad     — opinión/tendencia de experto  (miércoles)\n` +
    `  [3] Caso de éxito — resultados reales             (viernes)\n` +
    `  → `
  );
  const typeMap   = { "1":"educational", "2":"authority", "3":"case_study" };
  const typeLabel = { educational:"Educativo", authority:"Autoridad", case_study:"Caso de éxito" };
  const type = typeMap[typeChoice.trim()] || "educational";
  console.log(c("green", `\n  ✓ ${typeLabel[type]}\n`));

  // PASO 2.5: ÁNGULOS
  div();
  console.log(c("bright", c("magenta", "  ✨ MÓDULO DE ÁNGULOS\n")));
  const angles = await suggestAngles(topic, type);
  console.log(c("green", "\n  🎯 Ángulos recomendados:\n"));
  angles.forEach((a, i) => {
    const medal = ["🥇","🥈","🥉"][i] || "  ";
    console.log(`  ${medal} [${i+1}]  ${a.emoji}  ${c("bright", a.angle)}`);
    console.log(c("gray", `           → ${a.why}\n`));
  });
  console.log(`  [4] Escribir mi propio ángulo\n  [0] Sin ángulo\n`);
  const anglePick = await ask("  → ¿Cuál? ");
  const ai = parseInt(anglePick.trim());
  let chosenAngle = null;
  if (ai >= 1 && ai <= angles.length) {
    chosenAngle = angles[ai-1].angle;
    console.log(c("green", `\n  ✓ "${chosenAngle}"`));
  } else if (ai === 4) {
    chosenAngle = (await ask("  → Tu ángulo: ")).trim() || null;
    if (chosenAngle) console.log(c("green", `\n  ✓ "${chosenAngle}"`));
  } else {
    console.log(c("gray", "\n  ✓ El AI definirá el ángulo"));
  }

  // PASO 3: FORMATO
  console.log();
  div();
  console.log(c("bright", "  PASO 3 — Formato\n"));
  const fmtChoice = await ask(
    `  [1] Post normal     — 1 imagen\n` +
    `  [2] Carrusel        — múltiples slides con texto en imagen\n` +
    `  → `
  );
  const isCarousel = fmtChoice.trim() === "2";

  let numImages = 1;
  if (isCarousel) {
    console.log(c("gray", "  Calculando slides ideales..."));
    const suggestion = await suggestSlideCount(topic, type);
    console.log(c("green", `\n  Sugerencia: ${c("bright", String(suggestion.count))} slides`));
    console.log(c("gray", `     ${suggestion.reason}\n`));
    const slideInput = await ask(`  ¿Cuántos slides? (3-10, Enter = ${suggestion.count}) → `);
    const parsedSlides = parseInt(slideInput.trim());
    numImages = slideInput.trim() === "" ? suggestion.count : Math.min(10, Math.max(3, parsedSlides || suggestion.count));
    console.log(c("green", `\n  ✓ Carrusel — ${numImages} slides\n`));
  } else {
    console.log(c("green", `\n  ✓ Post normal\n`));
  }

  // PASO 4: PLATAFORMAS
  div();
  console.log(c("bright", "  PASO 4 — Plataformas\n"));
  const platformChoice = await ask(
    `  [1] Instagram + Facebook (recomendado)\n  [2] Solo Instagram\n  [3] Solo Facebook\n  → `
  );
  const platformMap = { "1":["instagram","facebook"], "2":["instagram"], "3":["facebook"] };
  const platforms = platformMap[platformChoice.trim()] || ["instagram","facebook"];
  console.log(c("green", `\n  ✓ ${platforms.join(" + ")}\n`));

  // PASO 5: IMAGEN — ROUTER INTELIGENTE (solo para post normal)
  let imageModel;
  let imageUrl = null;
  let hasOwnImage = false;
  let hasTextInImage;

  if (isCarousel) {
    // Carousel: Ideogram v3 fijo — no preguntar
    imageModel    = "ideogram";
    imageUrl      = null;
    hasOwnImage   = false;
    hasTextInImage = true;
    console.log(c("green", "\n  ✓ Modelo fijo: 🔤 Ideogram v3 (texto en imagen para cada slide)"));
    console.log(c("gray",  "     Precisión tipográfica 90-95% — ideal para slides con texto\n"));
  } else {
    div();
    console.log(c("bright", c("blue", "  🎨 PASO 5 — Modelo de imagen\n")));

    // ¿Lleva texto en la imagen?
    const hasTextQ = await ask("  ¿Este post va a tener texto, datos o estadísticas visibles en la imagen? (s/n) → ");
    hasTextInImage = hasTextQ.trim().toLowerCase() === "s";

    // Sugerencia automática
    const suggested = suggestModel(type, hasTextInImage);
    console.log(c("green", `\n  💡 Recomendación para este post: ${suggested.emoji} ${c("bright", suggested.name)}`));
    console.log(c("gray",  `     ${suggested.strength}`));
    console.log(c("gray",  `     Costo: ${suggested.cost}  |  Velocidad: ${suggested.speed}\n`));

    // Tabla completa de opciones
    console.log(c("bright", "  Todos los modelos disponibles:\n"));
    Object.values(IMAGE_MODELS).forEach((m, i) => {
      const isRec = m.id === suggested.id;
      const tag = isRec ? c("green", " ← recomendado") : "";
      console.log(`  [${i+1}] ${m.emoji}  ${c("bright", m.name.padEnd(18))} ${c("gray", m.cost.padEnd(10))} ${c("gray", m.speed)}${tag}`);
      console.log(c("gray",`       ${m.strength}`));
      console.log(c("gray",`       Ideal para: ${m.bestForLabel}\n`));
    });
    console.log(`  [4] Imagen propia (pegar URL)`);
    console.log(`  [Enter] Usar recomendación (${suggested.name})\n`);

    const modelChoice = await ask("  → Elegí: ");
    const modelChoiceTrim = modelChoice.trim();
    const modelKeys = Object.keys(IMAGE_MODELS);

    if (modelChoiceTrim === "" || modelChoiceTrim === "0") {
      imageModel = suggested.id;
    } else if (modelChoiceTrim === "4") {
      imageUrl = (await ask("  → URL de tu imagen: ")).trim();
      imageModel = "custom";
      hasOwnImage = true;
    } else {
      const idx = parseInt(modelChoiceTrim) - 1;
      imageModel = (idx >= 0 && idx < modelKeys.length) ? modelKeys[idx] : suggested.id;
    }

    const selectedModel = IMAGE_MODELS[imageModel] || { name: "Imagen propia", emoji: "📎" };
    console.log(c("green", `\n  ✓ ${selectedModel.emoji} ${selectedModel.name || "Imagen propia"}\n`));
  }

  // RESUMEN
  div();
  console.log(c("bright", "  📋 RESUMEN FINAL"));
  div();
  console.log();
  console.log(`  📌 Tema:        ${c("bright", topic)}`);
  console.log(`  🏷️  Tipo:        ${typeLabel[type]}`);
  console.log(`  🎯 Ángulo:      ${chosenAngle ? c("bright", chosenAngle) : c("gray","(AI lo define)")}`);
  console.log(`  📱 Plataformas: ${platforms.join(" + ")}`);
  if (isCarousel) {
    console.log(`  📊 Formato:     ${c("bright", `Carrusel — ${numImages} slides`)}`);
    console.log(`  🖼️  Modelo:      🔤 Ideogram v3 (fijo para carruseles)`);
  } else {
    const selectedModel = IMAGE_MODELS[imageModel] || { name: "Imagen propia", emoji: "📎" };
    console.log(`  🖼️  Imagen:      ${selectedModel.emoji} ${selectedModel.name || "Imagen propia"}${selectedModel.cost ? c("gray"," · "+selectedModel.cost) : ""}`);
  }
  console.log();
  div();

  const confirm = await ask(c("bright", "\n  ¿Generar y enviar a n8n? (s/n) → "));
  if (confirm.toLowerCase() !== "s") {
    console.log(c("yellow", "\n  Cancelado.\n"));
    rl.close();
    return;
  }

  const brief = {
    topic,
    type,
    angle: chosenAngle,
    platforms,
    image_model:       imageModel,
    fal_model_id:      IMAGE_MODELS[imageModel]?.falModel || null,
    has_own_image:     hasOwnImage,
    image_url:         imageUrl,
    has_text_in_image: hasTextInImage,
    approval_number:   process.env.WHATSAPP_APPROVAL_NUMBER,
    timestamp:         new Date().toISOString(),
    ...(isCarousel && {
      format:        "carousel",
      num_images:    numImages,
      image_prompts: [],
    }),
  };

  await sendWebhook(brief);
  rl.close();
}

// ─── ENVÍO WEBHOOK ─────────────────────────────────────────
async function sendWebhook(brief) {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) {
    console.log(c("red", "\n  ✗ WEBHOOK_URL no configurado en .env\n"));
    return;
  }
  console.log(c("cyan", "\n  ⏳ Enviando a n8n...\n"));
  try {
    const p = new URL(webhookUrl);
    const isHttps = p.protocol === "https:";
    const client = isHttps ? https : http;
    const buf = Buffer.from(JSON.stringify(brief), "utf8");
    await new Promise((resolve, reject) => {
      const req = client.request({
        hostname: p.hostname,
        port:     p.port || (isHttps ? 443 : 80),
        path:     p.pathname,
        method:   "POST",
        headers:  { "Content-Type":"application/json", "Content-Length": buf.length },
      }, (res) => {
        let d = "";
        res.on("data", chunk => d += chunk);
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(c("green", "  ✓ Enviado a n8n!"));
            console.log();
            div();
            console.log(c("cyan", "  📱 Preview en WhatsApp en ~60 segundos."));
            console.log(c("cyan", "  Respondé  SI  para publicar  |  NO  para cancelar"));
            div();
            console.log();
            resolve();
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${d}`));
          }
        });
      });
      req.on("error", reject);
      req.write(buf);
      req.end();
    });
  } catch (err) {
    console.log(c("red", `\n  ✗ Error: ${err.message}`));
    console.log(c("gray", "  Test: node scripts/test-webhook.js\n"));
  }
}

runWizard().catch(err => {
  console.error(c("red", `\nError: ${err.message}`));
  rl.close();
  process.exit(1);
});
