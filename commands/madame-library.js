#!/usr/bin/env node
// Génère la LIBRAIRIE COMPLÈTE de clips Madame via Veo 3.1 (provider gagnant du bake-off).
//
// 16 clips (~$19.20 total, ~13 min de génération en série, 6s/clip @ $0.20/s) :
//   - 4 verdicts × 2 variantes (pour rotation anti-répétition côté J3 generator)
//   - 8 réactions neutres × 1 (cutaways / transitions / variations d'humeur)
//
// PROMPTS V2 (expressifs théâtraux) — feedback founder : "humaniser/accentuer plus,
// les expressions n'étaient pas lisibles en V1". On a basculé de "minimal motion"
// vers "expressive anthropomorphic motion, theatrical character animation" + bump 4s→6s
// pour laisser le temps de jouer chaque beat dramatique. NB : Veo 3.1 n'accepte que
// {4, 6, 8} pour duration → 6 est le palier suivant après 4 (5 invalide).
//
// Convention de nommage (lue par core/social/madame.js phase 2 future) :
//   assets/madame/clips/madame-<key>-<idx>.mp4
//
// Resume-able : si le fichier existe déjà, on saute (on peut donc relancer après un crash
// partiel sans tout regénérer).
//
// Usage :
//   node commands/madame-library.js --reference assets/madame/reference/madame-v1-c2.png
//   node commands/madame-library.js --reference <ref> --dry-run                 (juste estimer le coût)
//   node commands/madame-library.js --reference <ref> --only inacceptable,yawn  (subset)
//   node commands/madame-library.js --reference <ref> --force                   (régénère même si existant)

import dotenv from "dotenv";
dotenv.config({ override: true });
import fs from "node:fs";
import path from "node:path";
import { loadProject, parseArgs } from "../core/config.js";
import { hasReplicateToken, generateMadameClipVeo } from "../core/video/madame-clip.js";

// V2.2 (founder direction) — prompts COMPLETS self-contained par recette (plus de prefix/suffix).
// Chaque variant est un prompt Veo complet (setup + action + style). Permet une calibration
// fine par expression sans contraindre tout le monde au même squelette.
//
// MADAME_PERSONALITY = footer commun appendé à chaque prompt → réaffirme à Veo l'esprit du
// personnage à chaque génération (évite la dérive en cartoon/meme face).
const MADAME_PERSONALITY = `Madame's personality: a dramatic, elegant, slightly judgmental Persian cat who behaves like a luxury fashion editor. She never panics, never overreacts, never looks silly. Her humor comes from tiny facial movements, slow timing, silent judgment and aristocratic confidence.`;

// Negative prompt commun → blacklist explicite des dérives qu'on a observées V2/V2.1
// (open mouth, exaggerated emotion, meme face, etc.)
const MADAME_NEGATIVE_PROMPT = `cartoon, anime, human face, talking mouth, open mouth, teeth, distorted cat face, deformed eyes, extra ears, extra whiskers, aggressive expression, scary, low quality fur, blurry, shaky camera, fast movement, text, subtitles, watermark, logo, multiple animals, human hands, unrealistic anatomy, overacting, meme face, exaggerated emotion`;

// Recettes V2.2 — palette 4 verdicts distincts, 1 variant chacun, prompts complets fournis
// par le founder (voir docs/brainstorm si on garde une trace). Direction : SNOB FROID CONTRÔLÉ,
// bouche fermée, mouvements subtils, jamais d'overacting.
//
// Anciennes recettes (V1 mes-hommages, passable, 8 réactions) supprimées pour l'instant.
// On peut les rajouter plus tard si la palette à 4 verdicts est validée.
const CLIP_RECIPES = [
  {
    key: "inacceptable",
    category: "verdict",
    count: 1,
    variants: [
`Short cinematic close-up video of "Madame", a sophisticated Persian cat mascot for a premium pet grooming brand. Fluffy long cream fur, round expressive face, elegant slightly snobbish attitude, calm aristocratic energy. Static camera, tight close-up on the face and upper chest, soft studio lighting, shallow depth of field, premium clean background.

Madame holds a long unblinking stare of cold disapproval, mouth firmly closed, eyes slightly narrowed. After a short pause, she slowly turns her head to the side with dismissive disgust, ears tilting slightly backward, whiskers barely moving. Her expression feels like silent judgment, as if she has just rejected something completely unacceptable. Channeling Anna Wintour silently rejecting a terrible pitch, but as a Persian cat.

Very subtle movement, elegant timing, funny but refined, no exaggerated cartoon expression, no talking, no text, no camera movement.`,
    ],
  },
  {
    key: "evidemment",
    category: "verdict",
    count: 1,
    variants: [
`Short cinematic close-up video of "Madame", a sophisticated Persian cat mascot for a premium pet grooming brand. Fluffy long cream fur, round expressive face, elegant slightly snobbish attitude, calm aristocratic energy. Static camera, tight close-up on the face and upper chest, soft studio lighting, shallow depth of field, premium clean background.

Madame lifts her chin very slightly with a superior, self-satisfied gaze. Her mouth stays firmly closed in a tiny smug expression. She gives one slow confident blink, then a barely perceptible nod, as if the answer was obvious all along. Her face expresses: "Of course. I already knew that." Elegant, calm, aristocratic, quietly hilarious.

Minimal movement, refined timing, premium viral reaction video style, no exaggerated animation, no talking, no text, no camera movement.`,
    ],
  },
  {
    key: "tu-es-serieux",
    category: "verdict",
    count: 1,
    variants: [
`Short cinematic close-up video of "Madame", a sophisticated Persian cat mascot for a premium pet grooming brand. Fluffy long cream fur, round expressive face, elegant slightly snobbish attitude, calm aristocratic energy. Static camera, tight close-up on the face and upper chest, soft studio lighting, shallow depth of field, premium clean background.

Madame slowly narrows her eyes with skeptical disbelief. Her mouth remains firmly closed. She gives a long withering side-eye, then tilts her head slightly, as if silently asking: "Are you serious?" One ear subtly pulls back while the other stays still, creating a dry judgmental expression. The reaction should feel intelligent, sarcastic and quietly brutal, not angry.

Subtle facial acting, slow timing, refined humor, realistic cat anatomy, no exaggerated cartoon expression, no talking, no text, no camera movement.`,
    ],
  },
  {
    key: "surpris-etonne",
    category: "verdict",
    count: 1,
    variants: [
`Short cinematic close-up video of "Madame", a sophisticated Persian cat mascot for a premium pet grooming brand. Fluffy long cream fur, round expressive face, elegant slightly snobbish attitude, calm aristocratic energy. Static camera, tight close-up on the face and upper chest, soft studio lighting, shallow depth of field, premium clean background.

Madame's eyes widen just slightly in subtle surprise, but she keeps her mouth closed and her dignity intact. Her ears perk forward with renewed curiosity. She tilts her head gently to one side, as if she has just noticed something unexpectedly interesting. The expression should feel like a discerning critic suddenly paying attention, surprised but still elegant and controlled.

Soft subtle movement, charming curiosity, premium viral reaction style, no exaggerated cartoon expression, no talking, no text, no camera movement.`,
    ],
  },
];

const CLIPS_DIR = path.join(process.cwd(), "assets", "madame", "clips");
// Veo 3.1 n'accepte QUE ces durées (sinon 422 Unprocessable Entity). Validé empiriquement.
const VEO_VALID_DURATIONS = [4, 6, 8];
const DURATION_SEC = 6;     // V2 : bump 4s→6s pour laisser le temps de jouer chaque beat dramatique.
const RESOLUTION = "720p";  // bake-off OK en 720p ; remonter en 1080p coûterait 50% de plus pour peu de gain
const ASPECT_RATIO = "9:16";
const COST_PER_CLIP_USD = 0.2 * DURATION_SEC; // Veo no-audio = $0.20/s → 6s = $1.20/clip

if (!VEO_VALID_DURATIONS.includes(DURATION_SEC)) {
  // Garde-fou : échoue en 1ms au lieu de tourner 13 min à vide si quelqu'un met une durée invalide.
  throw new Error(`DURATION_SEC=${DURATION_SEC} invalide — Veo 3.1 n'accepte que ${VEO_VALID_DURATIONS.join(", ")}`);
}

function expandRecipes() {
  // Aplatit les variantes en une liste linéaire d'items {key, idx, prompt, category}
  // V2.2 : chaque variant est un prompt COMPLET. On lui append juste MADAME_PERSONALITY
  // en footer commun pour réaffirmer l'esprit du perso à chaque génération.
  const out = [];
  for (const r of CLIP_RECIPES) {
    for (let i = 0; i < r.count; i++) {
      const variant = r.variants[i];
      if (!variant) throw new Error(`Recette ${r.key} : variante ${i + 1} manquante`);
      out.push({
        key: r.key,
        idx: i + 1,
        category: r.category,
        prompt: `${variant.trim()}\n\n${MADAME_PERSONALITY}`,
        filename: `madame-${r.key}-${i + 1}.mp4`,
      });
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project || "poils-precieux");

  // 1. Référence
  const refRelative = args.reference;
  if (!refRelative) throw new Error("--reference <path> requis (ex: assets/madame/reference/madame-v1-c2.png)");
  const refAbs = path.isAbsolute(refRelative) ? refRelative : path.join(process.cwd(), refRelative);
  if (!fs.existsSync(refAbs)) throw new Error(`Reference introuvable : ${refAbs}`);

  // 2. Subset filter (--only key1,key2)
  const onlyKeys = args.only ? args.only.split(",").map((s) => s.trim()).filter(Boolean) : null;

  // 3. Replicate token
  if (!hasReplicateToken()) {
    throw new Error("REPLICATE_API_TOKEN manquant dans .env");
  }

  fs.mkdirSync(CLIPS_DIR, { recursive: true });

  const items = expandRecipes().filter((it) => !onlyKeys || onlyKeys.includes(it.key));

  // 4. Décide quoi générer (skip existants sauf --force)
  const toGenerate = [];
  const skipped = [];
  for (const it of items) {
    const outPath = path.join(CLIPS_DIR, it.filename);
    if (fs.existsSync(outPath) && !args.force) {
      skipped.push(it.filename);
    } else {
      toGenerate.push({ ...it, outPath });
    }
  }

  console.log(`[madame-lib] referee = ${path.basename(refAbs)}`);
  console.log(`[madame-lib] résolution = ${RESOLUTION}, durée = ${DURATION_SEC}s, aspect = ${ASPECT_RATIO}`);
  console.log(`[madame-lib] librairie cible : ${items.length} clips (${items.filter((i) => i.category === "verdict").length} verdicts + ${items.filter((i) => i.category === "reaction").length} réactions)`);
  console.log(`[madame-lib] à générer : ${toGenerate.length}, à sauter (déjà existants) : ${skipped.length}`);
  console.log(`[madame-lib] coût estimé : ${toGenerate.length} × $${COST_PER_CLIP_USD.toFixed(2)} = $${(toGenerate.length * COST_PER_CLIP_USD).toFixed(2)}`);
  console.log(`[madame-lib] temps estimé : ~${Math.ceil((toGenerate.length * 40) / 60)} min`);

  if (args.dryRun) {
    console.log(`\n[madame-lib] DRY RUN — liste des prompts qui auraient été envoyés à Veo :\n`);
    for (const it of toGenerate) {
      console.log(`  ${it.filename}  [${it.category}]`);
      console.log(`    ${it.prompt}`);
    }
    return;
  }

  // 5. Génère en SÉRIE (Replicate facture pareil en parallèle, et la série évite de saturer le compte)
  const results = [];
  for (const [i, it] of toGenerate.entries()) {
    console.log(`\n[madame-lib] (${i + 1}/${toGenerate.length}) ${it.filename}  [${it.category}]`);
    try {
      const r = await generateMadameClipVeo({
        prompt: it.prompt,
        negativePrompt: MADAME_NEGATIVE_PROMPT,
        refImagePath: refAbs,
        outputPath: it.outPath,
        durationSec: DURATION_SEC,
        resolution: RESOLUTION,
        aspectRatio: ASPECT_RATIO,
      });
      results.push({ ok: true, key: it.key, idx: it.idx, category: it.category, filename: it.filename, prompt: it.prompt, bytes: r.bytes, elapsedSec: r.elapsedSec, costEstimateUsd: r.costEstimateUsd });
    } catch (err) {
      console.log(`[madame-lib]   ✗ FAILED : ${err.message}`);
      results.push({ ok: false, key: it.key, idx: it.idx, filename: it.filename, error: err.message });
    }
  }

  // 6. Manifest cumulatif (merge avec ce qui existait déjà pour ne pas perdre l'histoire)
  const manifestPath = path.join(CLIPS_DIR, "manifest.json");
  let existing = { clips: [] };
  if (fs.existsSync(manifestPath)) {
    try { existing = JSON.parse(fs.readFileSync(manifestPath, "utf8")); } catch { /* keep default */ }
  }
  // Re-scan le disque : la vérité = fichiers présents (manifest = index par-dessus)
  const onDisk = fs.readdirSync(CLIPS_DIR).filter((f) => f.endsWith(".mp4"));
  const indexed = onDisk.map((filename) => {
    // Reconstruit key + idx depuis le nom de fichier : madame-<key>-<idx>.mp4
    const m = filename.match(/^madame-(.+)-(\d+)\.mp4$/);
    const key = m ? m[1] : "unknown";
    const idx = m ? parseInt(m[2], 10) : 0;
    // Cherche la recette correspondante pour récupérer la category
    const recipe = CLIP_RECIPES.find((r) => r.key === key);
    const category = recipe?.category || "unknown";
    // Cherche dans les résultats du run pour récupérer prompt + bytes
    const fromRun = results.find((r) => r.ok && r.filename === filename);
    const fromExisting = existing.clips?.find((c) => c.filename === filename);
    return {
      filename,
      key,
      idx,
      category,
      prompt: fromRun?.prompt || fromExisting?.prompt || null,
      bytes: fromRun?.bytes || fromExisting?.bytes || null,
    };
  });
  const manifest = {
    referencePath: path.basename(refAbs),
    promptPrefix: PROMPT_PREFIX,
    promptSuffix: PROMPT_SUFFIX,
    resolution: RESOLUTION,
    durationSec: DURATION_SEC,
    aspectRatio: ASPECT_RATIO,
    generatedAt: new Date().toISOString(),
    totalClips: indexed.length,
    clipsByCategory: {
      verdict: indexed.filter((c) => c.category === "verdict").length,
      reaction: indexed.filter((c) => c.category === "reaction").length,
    },
    clips: indexed.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.idx - b.idx)),
  };
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");

  // 7. Résumé final
  const okCount = results.filter((r) => r.ok).length;
  const koCount = results.filter((r) => !r.ok).length;
  const totalCost = +(results.filter((r) => r.ok).reduce((s, r) => s + (r.costEstimateUsd || 0), 0)).toFixed(2);
  console.log(`\n[madame-lib] ✓ terminé — ${okCount} OK, ${koCount} KO, coût réel ~$${totalCost}`);
  console.log(`[madame-lib] librairie totale sur disque : ${indexed.length} clips → ${CLIPS_DIR}`);
  console.log(`[madame-lib] manifest : ${manifestPath}`);
  if (koCount > 0) {
    console.log(`\n[madame-lib] ⚠ ${koCount} clip(s) à régénérer (relancer la commande, les OK seront sautés) :`);
    for (const r of results.filter((r) => !r.ok)) console.log(`  ${r.filename} : ${r.error}`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
