#!/usr/bin/env node
// Génère la(les) image(s) de référence de MADAME (le personnage signature de J3).
//
// Madame = chatte Persan chic, "Directrice des Standards" — incarnation visuelle de la marque.
// Le prompt est VERROUILLÉ ici : c'est ce qui garantit que Madame ressemble TOUJOURS à elle-même
// d'une session de génération à l'autre, et que les clips vidéo générés (Veo / Hailuo en image-to-video)
// partent tous d'une référence cohérente.
//
// Sortie : assets/madame/reference/madame-vN-cN.png
//   v = version du prompt (v1 = prompt initial)
//   c = candidate index (on génère 3 variantes pour avoir le choix)
//
// Coût : ~$0.50 (3 images × $0.167 en quality=high 1024×1024)
//
// Usage :
//   node commands/madame-reference.js                  → 3 candidats v1
//   node commands/madame-reference.js --count 1        → 1 seul candidat
//   node commands/madame-reference.js --count 5        → 5 candidats (~$0.83)

import dotenv from "dotenv";
dotenv.config({ override: true });
import fs from "node:fs";
import path from "node:path";
import { loadProject, parseArgs } from "../core/config.js";
import { generateImage, estimatedCostUSD } from "../core/images/openai.js";

// VERSION 1 du prompt Madame. À modifier en bumpant le tag "v1" → "v2" si on itère.
const MADAME_PROMPT_VERSION = "v1";
const MADAME_PROMPT = `Editorial close-up portrait photograph of a chic adult Persian cat with long silky cream-white fur, perfectly groomed, bright copper-amber eyes with a haughty side-eye expression, sitting upright with regal posture against a soft warm beige studio background, soft golden hour light from the left, shallow depth of field, premium magazine cover quality, no text, no humans, no logos, ultra detailed fur texture, photoreal, 35mm film grain, cinematic.`;

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project || "poils-precieux");
  const count = Number.parseInt(args.count || "3", 10);
  if (!Number.isFinite(count) || count < 1 || count > 10) {
    throw new Error(`--count doit être entre 1 et 10 (reçu : ${args.count})`);
  }

  const outDir = path.join(process.cwd(), "assets", "madame", "reference");
  fs.mkdirSync(outDir, { recursive: true });

  const size = "1024x1024";
  const quality = "high";
  const unitCost = estimatedCostUSD({ quality, size });
  console.log(`[madame-ref] generating ${count} candidate(s) — prompt version ${MADAME_PROMPT_VERSION}`);
  console.log(`[madame-ref] estimated cost: ${count} × $${unitCost.toFixed(3)} = $${(count * unitCost).toFixed(3)}`);
  console.log(`[madame-ref] prompt :\n  ${MADAME_PROMPT}\n`);

  const generated = [];
  for (let i = 1; i <= count; i++) {
    console.log(`[madame-ref] candidate ${i}/${count}…`);
    const t0 = Date.now();
    let buffer;
    try {
      buffer = await generateImage(config, { prompt: MADAME_PROMPT, quality, size });
    } catch (err) {
      console.log(`[madame-ref]   ✗ FAILED: ${err.message}`);
      continue;
    }
    const filename = `madame-${MADAME_PROMPT_VERSION}-c${i}.png`;
    const filepath = path.join(outDir, filename);
    fs.writeFileSync(filepath, buffer);
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[madame-ref]   ✓ ${filename} (${(buffer.length / 1024).toFixed(0)} KB, ${elapsed}s)`);
    generated.push(filepath);
  }

  console.log(`\n[madame-ref] ✓ done — ${generated.length}/${count} candidate(s) generated`);
  console.log(`[madame-ref] choisis la meilleure puis dis-moi le chemin → on locke et on lance le bake-off vidéo.`);
  for (const p of generated) console.log(`  ${p}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
