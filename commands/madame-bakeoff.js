#!/usr/bin/env node
// Bake-off vidéo Madame : génère le MÊME prompt sur Veo 3.1 + Hailuo 2.3, depuis la MÊME image
// de référence, pour comparer visuellement côte à côte avant de locker le provider qui produira
// la librairie complète Madame.
//
// Coût attendu : ~$1.30 total (Veo 4s ≈ $0.80 + Hailuo 6s 1080p ≈ $0.49).
//
// Usage :
//   node commands/madame-bakeoff.js --reference assets/madame/reference/madame-v1-c1.png
//   node commands/madame-bakeoff.js --reference <ref.png> --providers veo,hailuo
//   node commands/madame-bakeoff.js --reference <ref.png> --providers veo --prompt "Madame slow blinks once..."
//
// Outputs dans runs/poils-precieux/madame-bakeoff-<timestamp>/ :
//   - veo.mp4 (4s, 720p, 9:16)
//   - hailuo.mp4 (6s, 1080p)
//   - manifest.json (prompts, durations, coûts, paths)
//
// Pré-requis : REPLICATE_API_TOKEN dans .env (https://replicate.com/account/api-tokens).

import dotenv from "dotenv";
dotenv.config({ override: true });
import fs from "node:fs";
import path from "node:path";
import { loadProject, parseArgs, runDir } from "../core/config.js";
import { hasReplicateToken, generateMadameClipVeo, generateMadameClipHailuo } from "../core/video/madame-clip.js";

// Prompt par défaut du bake-off — pensé pour exposer ce qui compte :
//   - cohérence faciale avec la référence (visage Madame)
//   - subtilité d'expression (slow blink + side-eye = signature de Madame)
//   - tenue de cadre (la chatte ne doit pas se déformer / muter)
const DEFAULT_PROMPT = `The same Persian cat from the reference image, Madame, slowly blinks once and then turns her head slightly to give a disapproving side-eye look directly at the camera. Soft cinematic golden light from the left, warm beige background, shallow depth of field, premium magazine quality, photoreal, minimal motion, no text, no humans.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project || "poils-precieux");

  // 1. Reference image
  const refRelative = args.reference;
  if (!refRelative) {
    throw new Error("--reference <path> requis (ex: assets/madame/reference/madame-v1-c1.png)");
  }
  const refAbs = path.isAbsolute(refRelative) ? refRelative : path.join(process.cwd(), refRelative);
  if (!fs.existsSync(refAbs)) throw new Error(`Reference image introuvable : ${refAbs}`);

  // 2. Replicate token
  if (!hasReplicateToken()) {
    throw new Error("REPLICATE_API_TOKEN manquant dans .env — récupère un token sur https://replicate.com/account/api-tokens puis ajoute REPLICATE_API_TOKEN=r8_... dans .env");
  }

  // 3. Providers à tester (default = les deux)
  const providers = (args.providers || "veo,hailuo").split(",").map((s) => s.trim()).filter(Boolean);
  for (const p of providers) {
    if (!["veo", "hailuo"].includes(p)) throw new Error(`Provider inconnu : ${p} (veo|hailuo)`);
  }

  // 4. Prompt
  const prompt = args.prompt || DEFAULT_PROMPT;

  // 5. Output dir
  const dir = runDir(config, "madame-bakeoff");
  // Copie la référence dans le dossier de bake-off pour relecture facile a posteriori
  fs.copyFileSync(refAbs, path.join(dir, "reference.png"));
  console.log(`\n[bakeoff] referee = ${path.basename(refAbs)}`);
  console.log(`[bakeoff] providers = ${providers.join(", ")}`);
  console.log(`[bakeoff] prompt :\n  ${prompt}`);
  console.log(`[bakeoff] output → ${dir}\n`);

  // 6. Génère en SÉRIE (pas en parallèle — Replicate facture pareil et on évite la double cuisson
  // du débit si on a un seul compte free tier). Loop résiliente : un échec n'arrête pas l'autre.
  const results = [];
  for (const provider of providers) {
    const outPath = path.join(dir, `${provider}.mp4`);
    try {
      let r;
      if (provider === "veo") {
        r = await generateMadameClipVeo({
          prompt,
          refImagePath: refAbs,
          outputPath: outPath,
          durationSec: 4,
          resolution: "720p",
          aspectRatio: "9:16",
        });
      } else {
        // Hailuo : 6s minimum, on prend la résolution 1080p Pro pour comparer à la qualité Veo.
        r = await generateMadameClipHailuo({
          prompt,
          refImagePath: refAbs,
          outputPath: outPath,
          durationSec: 6,
          resolution: "1080p",
        });
      }
      results.push({ ok: true, ...r });
    } catch (err) {
      console.log(`[bakeoff][${provider}] ✗ ÉCHEC : ${err.message}`);
      results.push({ ok: false, provider, error: err.message });
    }
  }

  // 7. Manifest pour relecture
  const manifest = {
    timestamp: new Date().toISOString(),
    referencePath: path.basename(refAbs),
    prompt,
    results: results.map((r) => ({
      provider: r.provider,
      model: r.model || null,
      ok: !!r.ok,
      mp4: r.mp4Path ? path.basename(r.mp4Path) : null,
      bytes: r.bytes || null,
      elapsedSec: r.elapsedSec || null,
      costEstimateUsd: r.costEstimateUsd || null,
      error: r.error || null,
    })),
    totalCostEstimateUsd: +(results.reduce((s, r) => s + (r.costEstimateUsd || 0), 0)).toFixed(2),
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");

  // 8. Résumé final lisible
  console.log(`\n[bakeoff] ✓ terminé — coût total estimé : ~$${manifest.totalCostEstimateUsd}`);
  for (const r of results) {
    if (r.ok) console.log(`  ${r.provider.padEnd(7)} → ${r.mp4Path}  (${(r.bytes / 1024 / 1024).toFixed(2)} MB, ~$${r.costEstimateUsd})`);
    else console.log(`  ${r.provider.padEnd(7)} → ✗ ${r.error}`);
  }
  console.log(`\nÉtape suivante : ouvre les 2 vidéos côte-à-côte, vérifie :`);
  console.log(`  1. Madame ressemble-t-elle à la référence ? (lock visuel)`);
  console.log(`  2. L'expression slow-blink + side-eye est-elle lisible ?`);
  console.log(`  3. La fourrure / l'éclairage ont-ils l'air premium photoréaliste ?`);
  console.log(`Puis dis-moi le gagnant → je code la génération de la librairie complète (15-20 clips) sur ce provider.`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
