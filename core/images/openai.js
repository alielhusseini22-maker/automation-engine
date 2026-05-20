// Client OpenAI GPT-Image-1 — wrapper minimal (text-to-image et image-to-image).
// Réutilise la logique du tool poils-precieux-image-tool mais en mode lib.

import OpenAI, { toFile } from "openai";
import { createReadStream } from "node:fs";
import path from "node:path";

let _client = null;
function client(config) {
  if (_client) return _client;
  const apiKey = process.env[config.openai?.envKey || "OPENAI_API_KEY"];
  if (!apiKey) throw new Error("Missing OPENAI_API_KEY");
  _client = new OpenAI({ apiKey });
  return _client;
}

export async function generateImage(config, { prompt, quality = "high", size = "1024x1024", background = "auto" }) {
  const c = client(config);
  const response = await c.images.generate({
    model: "gpt-image-1",
    prompt,
    quality,
    size,
    background,
    output_format: "png",
    n: 1,
  });
  const item = response.data?.[0];
  if (!item?.b64_json) throw new Error("OpenAI returned no b64_json");
  return Buffer.from(item.b64_json, "base64");
}

export async function editImage(config, { imagePaths, prompt, quality = "high", size = "1024x1024", background = "auto" }) {
  const c = client(config);
  const files = await Promise.all(
    imagePaths.slice(0, 4).map(async (p) => {
      const ext = path.extname(p).slice(1).toLowerCase() || "jpg";
      const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
      return toFile(createReadStream(p), path.basename(p), { type: mime });
    })
  );
  const response = await c.images.edit({
    model: "gpt-image-1",
    image: files,
    prompt,
    quality,
    size,
    background,
    output_format: "png",
    n: 1,
  });
  const item = response.data?.[0];
  if (!item?.b64_json) throw new Error("OpenAI returned no b64_json");
  return Buffer.from(item.b64_json, "base64");
}

export function estimatedCostUSD({ quality = "high", size = "1024x1024" }) {
  const base = { low: 0.011, medium: 0.042, high: 0.167, auto: 0.042 }[quality] || 0.042;
  const multiplier = size === "1024x1024" || size === "auto" ? 1 : 1.5;
  return +(base * multiplier).toFixed(3);
}
