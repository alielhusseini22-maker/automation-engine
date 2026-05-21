// Client Replicate — génération vidéo IA via modèles hébergés.
// Modèle par défaut : luma/ray-flash-2-720p (5-9s clips, ~$0.20, qualité photoréaliste, rapide).
// Alternatives : luma/dream-machine, minimax/video-01, kling-ai/kling-v1.5-pro
// Doc : https://replicate.com/docs/get-started/nodejs

import Replicate from "replicate";
import fs from "node:fs";
import path from "node:path";

let _client = null;
function client() {
  if (_client) return _client;
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("Missing REPLICATE_API_TOKEN env var");
  }
  _client = new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
  return _client;
}

export function hasReplicateToken() {
  return !!process.env.REPLICATE_API_TOKEN;
}

const DEFAULT_MODEL = "luma/ray-flash-2-720p";

/**
 * Génère une vidéo via Replicate et la télécharge localement.
 * @returns { path, model, prompt }
 */
export async function generateVideo({ prompt, aspectRatio = "9:16", duration = 5, model = DEFAULT_MODEL, outputPath }) {
  const c = client();
  const t0 = Date.now();
  const input = {
    prompt,
    aspect_ratio: aspectRatio,
    duration: String(duration),
  };

  const output = await c.run(model, { input });

  // Replicate v1+ : output is a FileOutput (web ReadableStream).
  // Two paths : direct stream, or { url() } method, or array.
  let stream = null;
  if (Array.isArray(output) && output[0]) {
    stream = await fetch(typeof output[0] === "string" ? output[0] : output[0].url()).then((r) => r.body);
  } else if (output?.url) {
    const url = typeof output.url === "function" ? output.url() : output.url;
    stream = await fetch(url).then((r) => r.body);
  } else if (typeof output === "string") {
    stream = await fetch(output).then((r) => r.body);
  } else if (output && typeof output.getReader === "function") {
    stream = output;
  } else {
    throw new Error(`Unexpected Replicate output type: ${typeof output}`);
  }

  // Pipe to file
  const buf = await streamToBuffer(stream);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);

  return {
    path: outputPath,
    model,
    prompt,
    bytes: buf.length,
    elapsedSec: ((Date.now() - t0) / 1000).toFixed(1),
  };
}

async function streamToBuffer(stream) {
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  return Buffer.concat(chunks.map((c) => Buffer.from(c)));
}
