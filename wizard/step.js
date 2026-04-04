#!/usr/bin/env node

/**
 * Propulsar Content Engine — Step-by-step wizard (non-interactive)
 * Usage: node wizard/step.js <step> [args...]
 *
 * Steps:
 *   trending                       — Fetch trending topics
 *   angles <topic> <type>          — Get angle suggestions
 *   suggest-model <type> <hasText> — Get model recommendation
 *   suggest-slides <topic> <type>  — Get slide count recommendation
 *   send <briefJSON>               — Send brief to webhook
 */

const https = require("https");
const http = require("http");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

function httpPost(url, body, headers) {
  return new Promise((resolve, reject) => {
    const p = new URL(url);
    const isHttps = p.protocol === "https:";
    const client = isHttps ? https : http;
    const buf = Buffer.from(body, "utf8");
    const req = client.request({
      hostname: p.hostname,
      port: p.port || (isHttps ? 443 : 80),
      path: p.pathname + (p.search || ""),
      method: "POST",
      headers: { ...headers, "Content-Length": buf.length },
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

const IMAGE_MODELS = {
  flux: {
    id: "flux", name: "Flux 2 Pro", provider: "FAL.AI",
    cost: "$0.03/img", speed: "~5s",
    strength: "Fotorrealismo premium, iluminación perfecta",
    bestFor: ["educational", "authority"],
    bestForLabel: "Posts educativos y de autoridad",
    falModel: "fal-ai/flux-pro/v1.1",
  },
  ideogram: {
    id: "ideogram", name: "Ideogram v3", provider: "FAL.AI",
    cost: "$0.06/img", speed: "~8s",
    strength: "Texto legible en imagen, 90-95% de precisión tipográfica",
    bestFor: ["educational"],
    bestForLabel: "Posts con estadísticas, datos o texto visible en imagen",
    falModel: "fal-ai/ideogram/v3",
  },
  nanoBanana: {
    id: "nanoBanana", name: "Nano Banana Pro", provider: "FAL.AI / Google",
    cost: "$0.15/img", speed: "~10s",
    strength: "Razonamiento visual, 4K, comprende contexto complejo",
    bestFor: ["case_study", "authority"],
    bestForLabel: "Posts de alto impacto, casos de éxito, autoridad de marca",
    falModel: "fal-ai/nano-banana",
  },
};

function suggestModel(postType, hasTextInImage) {
  if (hasTextInImage) return IMAGE_MODELS.ideogram;
  if (postType === "case_study") return IMAGE_MODELS.nanoBanana;
  if (postType === "authority") return IMAGE_MODELS.nanoBanana;
  return IMAGE_MODELS.flux;
}

async function suggestSlideCount(topic, postType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const FALLBACK = { count: 5, reason: "Cantidad estándar para carruseles educativos", source: "fallback" };
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
    const parsed = JSON.parse(txt.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    const count = Math.min(10, Math.max(3, parseInt(parsed.count) || 5));
    return { count, reason: parsed.reason || "", source: "claude" };
  } catch (e) {
    return { count: 5, reason: "Cantidad estándar para carruseles educativos", source: "fallback", error: e.message };
  }
}

async function getTrendingTopics() {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  const FALLBACK = [
    "Agentes de IA autónomos: qué pueden hacer hoy por tu negocio",
    "El error más caro al implementar automatizaciones en PYMEs",
    "WhatsApp Business API vs. bots tradicionales: cuál elegir",
    "CRM + IA: automatizar el seguimiento sin perder el trato humano",
    "5 procesos que toda PYME debería automatizar antes de fin de año",
  ];
  if (!apiKey) return { topics: FALLBACK, source: "fallback" };
  try {
    const data = await httpPost(
      "https://api.perplexity.ai/chat/completions",
      JSON.stringify({
        model: "sonar",
        messages: [
          { role: "system", content: "Responde SOLO con un JSON array de 5 strings. Sin markdown." },
          { role: "user", content: "5 temas trending ahora sobre IA/automatización/WhatsApp Business para dueños de PYMEs en España y Latinoamérica. Array JSON de strings < 15 palabras cada uno." },
        ],
        max_tokens: 300,
      }),
      { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }
    );
    const txt = data.choices?.[0]?.message?.content || "";
    const topics = JSON.parse(txt.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    return { topics, source: "perplexity" };
  } catch (e) {
    return { topics: FALLBACK, source: "fallback", error: e.message };
  }
}

async function getAngles(topic, postType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const FALLBACK = [
    { angle: "El costo oculto de no automatizar esto", why: "Dolor/pérdida — máxima conversión", emoji: "💸" },
    { angle: "Caso real: resultado concreto en números", why: "Prueba social — genera confianza", emoji: "✅" },
    { angle: "Guía paso a paso para implementarlo hoy", why: "Educativo accionable — máximo guardado", emoji: "🛠️" },
  ];
  if (!apiKey) return { angles: FALLBACK, source: "fallback" };
  try {
    const typeCtx = {
      educational: "post educativo accionable",
      authority: "post de autoridad sobre tendencia",
      case_study: "post de caso de éxito con resultados reales",
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
    const angles = JSON.parse(txt.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim());
    return { angles, source: "claude" };
  } catch (e) {
    return { angles: FALLBACK, source: "fallback", error: e.message };
  }
}

async function sendWebhook(brief) {
  const webhookUrl = process.env.WEBHOOK_URL;
  if (!webhookUrl) return { success: false, error: "WEBHOOK_URL no configurado en .env" };
  try {
    const p = new URL(webhookUrl);
    const isHttps = p.protocol === "https:";
    const client = isHttps ? https : http;
    const buf = Buffer.from(JSON.stringify(brief), "utf8");
    return new Promise((resolve, reject) => {
      const req = client.request({
        hostname: p.hostname,
        port: p.port || (isHttps ? 443 : 80),
        path: p.pathname,
        method: "POST",
        headers: { "Content-Type": "application/json", "Content-Length": buf.length },
      }, (res) => {
        let d = "";
        res.on("data", chunk => d += chunk);
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true, status: res.statusCode });
          } else {
            resolve({ success: false, status: res.statusCode, body: d });
          }
        });
      });
      req.on("error", (e) => resolve({ success: false, error: e.message }));
      req.write(buf);
      req.end();
    });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function main() {
  const step = process.argv[2];

  if (step === "trending") {
    const result = await getTrendingTopics();
    console.log(JSON.stringify(result));

  } else if (step === "angles") {
    const topic = process.argv[3];
    const postType = process.argv[4] || "educational";
    const result = await getAngles(topic, postType);
    console.log(JSON.stringify(result));

  } else if (step === "suggest-model") {
    const postType = process.argv[3] || "educational";
    const hasText = process.argv[4] === "true";
    const model = suggestModel(postType, hasText);
    console.log(JSON.stringify({ recommended: model, all: IMAGE_MODELS }));

  } else if (step === "suggest-slides") {
    const topic    = process.argv[3];
    const postType = process.argv[4] || "educational";
    if (!topic) {
      console.log(JSON.stringify({ error: "Usage: node wizard/step.js suggest-slides <topic> [type]" }));
      process.exit(1);
    }
    const result = await suggestSlideCount(topic, postType);
    console.log(JSON.stringify(result));

  } else if (step === "send") {
    const brief = JSON.parse(process.argv[3]);
    const result = await sendWebhook(brief);
    console.log(JSON.stringify(result));

  } else {
    console.log(JSON.stringify({
      error: "Unknown step",
      usage: "node wizard/step.js <trending|angles|suggest-model|suggest-slides|send> [args...]"
    }));
    process.exit(1);
  }
}

main().catch(e => {
  console.log(JSON.stringify({ error: e.message }));
  process.exit(1);
});
