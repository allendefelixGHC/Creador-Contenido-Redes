#!/usr/bin/env node

/**
 * Test del webhook de n8n — NO publica en redes
 *
 * Usage:
 *   node scripts/test-webhook.js                       — test single post (default)
 *   node scripts/test-webhook.js --carousel            — test carousel (3 slides default, $0.18)
 *   node scripts/test-webhook.js --carousel --slides 5 — test carousel with 5 slides
 */

const https = require("https");
const http = require("http");
require("dotenv").config({ path: require("path").join(__dirname, "../.env") });

// --- CLI flags ---
const isCarousel = process.argv.includes("--carousel");
const slidesIndex = process.argv.indexOf("--slides");
const numSlides = slidesIndex !== -1 ? parseInt(process.argv[slidesIndex + 1]) || 3 : 3;

// --- Single-post brief (original, unchanged) ---
const singlePostBrief = {
  topic: "TEST — Cómo automatizar el seguimiento de clientes con WhatsApp",
  type: "educational",
  platforms: ["instagram", "facebook"],
  angle: "enfocado en PYMEs de servicios",
  has_image: false,
  image_url: null,
  approval_number: process.env.WHATSAPP_APPROVAL_NUMBER,
  timestamp: new Date().toISOString(),
  _test: true, // Flag para que n8n pueda detectar que es un test
};

// --- Carousel brief (14 fields matching exact Phase 1 schema) ---
// Uses num_images: 3 by default — smallest practical carousel, cheaper for testing ($0.18 total)
const carouselBrief = {
  topic: "5 herramientas IA que todo negocio necesita en 2026",
  type: "educational",
  angle: "Herramientas prácticas con resultados medibles",
  platforms: ["instagram", "facebook"],
  format: "carousel",
  num_images: numSlides,
  image_model: "ideogram",
  fal_model_id: null,
  has_own_image: false,
  image_url: null,
  has_text_in_image: true,
  approval_number: process.env.WHATSAPP_APPROVAL_NUMBER || "34612345678",
  timestamp: new Date().toISOString(),
};

// --- Select brief based on mode ---
const brief = isCarousel ? carouselBrief : singlePostBrief;

async function testWebhook() {
  const webhookUrl = process.env.WEBHOOK_URL;

  if (!webhookUrl) {
    console.error("❌ ERROR: WEBHOOK_URL no configurado en .env");
    process.exit(1);
  }

  console.log(`\n🧪 Testing ${isCarousel ? `CAROUSEL (${numSlides} slides)` : "SINGLE POST"} webhook...\n`);
  console.log("Propulsar Content Engine — Test de Webhook");
  console.log("━".repeat(50));
  console.log("📡 URL:", webhookUrl);
  console.log("📦 Brief:", JSON.stringify(brief, null, 2));
  console.log("━".repeat(50));
  console.log("⏳ Enviando...\n");

  try {
    const url = new URL(webhookUrl);
    const isHttps = url.protocol === "https:";
    const client = isHttps ? https : http;
    const body = JSON.stringify(brief);

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
    };

    await new Promise((resolve, reject) => {
      const req = client.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          console.log(`✅ Status HTTP: ${res.statusCode}`);
          console.log("📥 Respuesta de n8n:");
          try {
            console.log(JSON.stringify(JSON.parse(data), null, 2));
          } catch {
            console.log(data);
          }
          console.log("\n🎉 Webhook funcionando correctamente!");
          console.log("ℹ️  El workflow en n8n debería haberse ejecutado.");
          console.log("   Revisá la pestaña Executions en n8n para ver el resultado.");
          resolve();
        });
      });

      req.on("error", (err) => {
        console.error("❌ Error de conexión:", err.message);
        console.log("\nPosibles causas:");
        console.log("  - n8n no está corriendo");
        console.log("  - WEBHOOK_URL incorrecto");
        console.log("  - El workflow no está activo en n8n");
        reject(err);
      });

      req.write(body);
      req.end();
    });
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

testWebhook();
