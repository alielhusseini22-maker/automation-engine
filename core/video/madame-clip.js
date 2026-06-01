// Génération de clips IA pour Madame (J3) via Replicate.
//
// Deux providers en parallèle pour le bake-off :
//   - Google Veo 3.1 (model: google/veo-3.1) — référence-to-video, jusqu'à 3 reference_images,
//     8s max, 720p/1080p, 9:16 natif. ~$0.40/s avec audio, $0.20/s sans, $0.10/s en Fast.
//   - MiniMax Hailuo 2.3 (model: minimax/hailuo-2.3) — image-to-video depuis une 1ère frame,
//     6 ou 10s, 768p/1080p. ~$0.28-$0.49/clip selon résolution.
//
// La référence Madame (PNG) est passée en base64 data URI : pas besoin de l'héberger.
// Si Replicate rejette le payload (trop gros), bascule sur upload Cloudinary → URL.
//
// Output uniforme : { provider, model, mp4Path, prompt, refImagePath, elapsedSec, costEstimateUsd }

import fs from "node:fs";
import path from "node:path";
import Replicate from "replicate";

function client() {
  if (!process.env.REPLICATE_API_TOKEN) {
    throw new Error("REPLICATE_API_TOKEN env var requis (https://replicate.com/account/api-tokens)");
  }
  return new Replicate({ auth: process.env.REPLICATE_API_TOKEN });
}

export function hasReplicateToken() {
  return !!process.env.REPLICATE_API_TOKEN;
}

/**
 * Convertit un PNG/JPG local en data URI base64 pour passer en input image.
 */
function fileToDataUri(filepath) {
  const buf = fs.readFileSync(filepath);
  const ext = path.extname(filepath).slice(1).toLowerCase();
  const mime = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  return `data:${mime};base64,${buf.toString("base64")}`;
}

/**
 * Récupère l'output de Replicate sous forme de Buffer (peu importe le format renvoyé).
 * Replicate renvoie soit une string URL, soit un objet FileOutput (web ReadableStream avec .url()),
 * soit un array de ces deux types. On normalise tout vers un Buffer.
 */
async function outputToBuffer(output) {
  if (Array.isArray(output) && output[0]) {
    const item = output[0];
    const url = typeof item === "string" ? item : (typeof item.url === "function" ? item.url() : item.url);
    return Buffer.from(await (await fetch(url)).arrayBuffer());
  }
  if (typeof output === "string") {
    return Buffer.from(await (await fetch(output)).arrayBuffer());
  }
  if (output?.url) {
    const url = typeof output.url === "function" ? output.url() : output.url;
    return Buffer.from(await (await fetch(url)).arrayBuffer());
  }
  if (output && typeof output.getReader === "function") {
    // Web ReadableStream direct
    const reader = output.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  }
  throw new Error(`Replicate output format inattendu : ${typeof output}`);
}

/**
 * Génère un clip via Veo 3.1 avec une image de référence (mode reference-to-video).
 *
 * @param {object} args
 * @param {string} args.prompt - texte décrivant le mouvement / l'action
 * @param {string} args.refImagePath - chemin local du PNG/JPG de référence (Madame)
 * @param {string} args.outputPath - chemin MP4 de sortie
 * @param {string} [args.negativePrompt] - liste de ce qu'on NE veut PAS voir (cf MADAME_NEGATIVE_PROMPT)
 * @param {number} [args.durationSec=4] - 4, 6 ou 8
 * @param {"720p"|"1080p"} [args.resolution="720p"]
 * @param {"9:16"|"16:9"} [args.aspectRatio="9:16"]
 * @returns {Promise<{ provider, model, mp4Path, prompt, refImagePath, elapsedSec, bytes, costEstimateUsd }>}
 */
export async function generateMadameClipVeo({ prompt, refImagePath, outputPath, negativePrompt = null, durationSec = 4, resolution = "720p", aspectRatio = "9:16" }) {
  const c = client();
  const t0 = Date.now();
  const refDataUri = fileToDataUri(refImagePath);

  // Veo 3.1 schema (validé empiriquement) :
  //   - prompt (string)
  //   - reference_images (array of strings, URLs ou data URIs) → mode reference-to-video (notre cas)
  //   - negative_prompt (string, optional) → liste de ce qu'on évite (open mouth, cartoon, etc.)
  //   - aspect_ratio (string) : "9:16" | "16:9"
  //   - duration (number) : 4 | 6 | 8 (autres valeurs = 422)
  //   - resolution (string) : "720p" | "1080p"
  const input = {
    prompt,
    reference_images: [refDataUri],
    aspect_ratio: aspectRatio,
    duration: durationSec,
    resolution,
  };
  if (negativePrompt) input.negative_prompt = negativePrompt;

  console.log(`[madame-clip][veo] generating (${durationSec}s, ${resolution}, ${aspectRatio})…`);
  const output = await c.run("google/veo-3.1", { input });

  const buf = await outputToBuffer(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  const elapsedSec = (Date.now() - t0) / 1000;
  // Estimation prix Veo 3.1 sans audio : $0.20/s
  const costEstimateUsd = +(0.2 * durationSec).toFixed(2);

  console.log(`[madame-clip][veo]   ✓ ${path.basename(outputPath)} (${(buf.length / 1024 / 1024).toFixed(2)} MB, ${elapsedSec.toFixed(1)}s, ~$${costEstimateUsd})`);
  return {
    provider: "veo",
    model: "google/veo-3.1",
    mp4Path: outputPath,
    prompt,
    refImagePath,
    elapsedSec,
    bytes: buf.length,
    costEstimateUsd,
  };
}

/**
 * Génère un clip via Hailuo 2.3 avec une image comme première frame (mode image-to-video).
 *
 * @param {object} args
 * @param {string} args.prompt
 * @param {string} args.refImagePath
 * @param {string} args.outputPath
 * @param {6|10} [args.durationSec=6] - Hailuo accepte 6 ou 10
 * @param {"768p"|"1080p"} [args.resolution="1080p"]
 * @returns {Promise<{ provider, model, mp4Path, prompt, refImagePath, elapsedSec, bytes, costEstimateUsd }>}
 */
export async function generateMadameClipHailuo({ prompt, refImagePath, outputPath, durationSec = 6, resolution = "1080p" }) {
  const c = client();
  const t0 = Date.now();
  const refDataUri = fileToDataUri(refImagePath);

  // Hailuo 2.3 schema (best-effort, basé sur la doc Replicate) :
  //   - prompt (string)
  //   - image (string) → 1ère frame en URL ou data URI (active le mode image-to-video)
  //   - duration (number) : 6 | 10  (1080p plafonné à 6s d'après la doc)
  //   - resolution (string) : "768p" | "1080p"
  //   - prompt_optimizer (boolean) : true par défaut (Hailuo réécrit le prompt pour optimiser)
  // Note : Replicate utilise l'image en mode IMAGE-TO-VIDEO (start frame). Pour notre cas Madame
  // (cat parlant peu, mouvement faible), c'est ce qu'on veut → lock visuel maximum sur la référence.
  const input = {
    prompt,
    image: refDataUri,
    duration: durationSec,
    resolution,
    prompt_optimizer: true,
  };

  console.log(`[madame-clip][hailuo] generating (${durationSec}s, ${resolution})…`);
  const output = await c.run("minimax/hailuo-2.3", { input });

  const buf = await outputToBuffer(output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, buf);
  const elapsedSec = (Date.now() - t0) / 1000;
  // Estimation prix Hailuo 2.3 Pro 1080p : $0.49/clip 6s, $0.28 en Standard 768p
  const costEstimateUsd = resolution === "1080p" ? 0.49 : 0.28;

  console.log(`[madame-clip][hailuo]   ✓ ${path.basename(outputPath)} (${(buf.length / 1024 / 1024).toFixed(2)} MB, ${elapsedSec.toFixed(1)}s, ~$${costEstimateUsd})`);
  return {
    provider: "hailuo",
    model: "minimax/hailuo-2.3",
    mp4Path: outputPath,
    prompt,
    refImagePath,
    elapsedSec,
    bytes: buf.length,
    costEstimateUsd,
  };
}
