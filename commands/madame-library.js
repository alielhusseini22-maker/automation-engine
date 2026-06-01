#!/usr/bin/env node
// Génère la LIBRAIRIE COMPLÈTE de clips Madame via Veo 3.1 (provider gagnant du bake-off).
//
// 16 clips (~$12.80 total, ~10 min de génération en série) :
//   - 4 verdicts × 2 variantes (pour rotation anti-répétition côté J3 generator)
//   - 8 réactions neutres × 1 (cutaways / transitions / variations d'humeur)
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

// Préfixe commun à TOUS les prompts pour verrouiller le personnage + le style brand.
// Le [action] varie par recette. Le préfixe garantit cohérence visuelle inter-clips.
const PROMPT_PREFIX = "The same Persian cat from the reference image, Madame, ";
const PROMPT_SUFFIX = ". Soft cinematic golden light from the left, warm beige background, shallow depth of field, premium magazine quality, photoreal, minimal motion, no text, no humans, no other animals.";

// Recettes de la librairie. count = nombre de variantes du même key (pour rotation côté J3).
const CLIP_RECIPES = [
  // ── VERDICTS (8 clips : 4 × 2 variantes) ──
  {
    key: "inacceptable",
    category: "verdict",
    count: 2,
    variants: [
      "stares directly into the camera with a long unblinking disapproving gaze, then slowly closes her eyes in clear disgust, ears tilting slightly back",
      "turns her head sharply away from the camera with visible disdain, refusing to acknowledge, ears flattening for a brief moment",
    ],
  },
  {
    key: "evidemment",
    category: "verdict",
    count: 2,
    variants: [
      "performs a single confident slow blink, chin held high, with a knowing satisfied expression as if the answer was always obvious",
      "lifts her chin slightly, gives a brief steady look at the camera, then closes her eyes for a beat in absolute certainty",
    ],
  },
  {
    key: "mes-hommages",
    category: "verdict",
    count: 2,
    variants: [
      "gives a soft warm gaze toward the camera, eyes slowly half-closing in genuine approval, head gently lowering one inch in a small respectful acknowledgement",
      "tilts her head graciously to the side, eyes warm and half-closed, in a regal nod of approval",
    ],
  },
  {
    key: "passable",
    category: "verdict",
    count: 2,
    variants: [
      "gives a sideways sceptical glance to the camera, one ear slightly back, neutral but visibly unimpressed",
      "slowly looks the camera up and down with a mildly assessing expression, ending on a tiny sniff",
    ],
  },

  // ── RÉACTIONS NEUTRES (8 clips × 1 variante) — utilisées en cutaways / set-ups ──
  {
    key: "slow-blink",
    category: "reaction",
    count: 1,
    variants: [
      "performs a single very slow deliberate blink, eyes closing fully for one full second then reopening, otherwise still",
    ],
  },
  {
    key: "ear-flick",
    category: "reaction",
    count: 1,
    variants: [
      "twitches one ear sharply as if dismissing an annoyance, the rest of the body remaining still",
    ],
  },
  {
    key: "side-eye",
    category: "reaction",
    count: 1,
    variants: [
      "shifts her gaze sharply to the side without moving her head, a quick sceptical sideways glance to the camera",
    ],
  },
  {
    key: "head-tilt",
    category: "reaction",
    count: 1,
    variants: [
      "tilts her head slightly to the left in mild distinguished curiosity, eyes wide and attentive",
    ],
  },
  {
    key: "yawn",
    category: "reaction",
    count: 1,
    variants: [
      "opens her mouth in an elegant slow yawn revealing a hint of small teeth, then settles back into composure",
    ],
  },
  {
    key: "paw-lick",
    category: "reaction",
    count: 1,
    variants: [
      "lifts one front paw and grooms it with a single delicate lick, then sets it down with poise",
    ],
  },
  {
    key: "look-up",
    category: "reaction",
    count: 1,
    variants: [
      "slowly raises her chin to gaze upward with serene regality, eyes half-closed in contemplation",
    ],
  },
  {
    key: "nose-wrinkle",
    category: "reaction",
    count: 1,
    variants: [
      "subtly wrinkles her nose as if she has just detected something faintly unpleasant in the air",
    ],
  },
];

const CLIPS_DIR = path.join(process.cwd(), "assets", "madame", "clips");
const DURATION_SEC = 4;     // 4s = sweet spot pour réactions Madame (assez pour blink+turn, pas plus)
const RESOLUTION = "720p";  // bake-off OK en 720p ; remonter en 1080p coûterait 50% de plus pour peu de gain
const ASPECT_RATIO = "9:16";
const COST_PER_CLIP_USD = 0.2 * DURATION_SEC; // Veo no-audio = $0.20/s

function expandRecipes() {
  // Aplatit les variantes en une liste linéaire d'items {key, idx, action, category}
  const out = [];
  for (const r of CLIP_RECIPES) {
    for (let i = 0; i < r.count; i++) {
      const action = r.variants[i];
      if (!action) throw new Error(`Recette ${r.key} : variante ${i + 1} manquante`);
      out.push({
        key: r.key,
        idx: i + 1, // 1-indexé pour les noms de fichier
        category: r.category,
        action,
        prompt: `${PROMPT_PREFIX}${action}${PROMPT_SUFFIX}`,
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
