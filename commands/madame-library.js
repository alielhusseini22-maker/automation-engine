#!/usr/bin/env node
// Génère la LIBRAIRIE COMPLÈTE de clips Madame via Veo 3.1 (provider gagnant du bake-off).
//
// 16 clips (~$16.00 total, ~13 min de génération en série, 5s/clip @ $0.20/s) :
//   - 4 verdicts × 2 variantes (pour rotation anti-répétition côté J3 generator)
//   - 8 réactions neutres × 1 (cutaways / transitions / variations d'humeur)
//
// PROMPTS V2 (expressifs théâtraux) — feedback founder : "humaniser/accentuer plus,
// les expressions n'étaient pas lisibles en V1". On a basculé de "minimal motion"
// vers "expressive anthropomorphic motion, theatrical character animation" + bump 4s→5s
// pour laisser le temps de jouer chaque beat dramatique.
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
// V2 : suffixe basculé en mode EXPRESSIF (anciennement "minimal motion" qui bridait Veo).
const PROMPT_PREFIX = "The same Persian cat from the reference image, Madame, ";
const PROMPT_SUFFIX = ". Soft cinematic golden light from the left, warm beige background, shallow depth of field, premium photoreal magazine quality, expressive anthropomorphic motion, theatrical character animation, clearly readable emotion, no text, no humans visible, no other animals.";

// Recettes de la librairie V2. count = nombre de variantes du même key (pour rotation côté J3).
// Chaque action est calibrée pour LISIBILITÉ INSTANTANÉE de l'émotion (test : un viewer doit
// "lire" le verdict de Madame en 0.5 seconde). Référence mentale : Maggie Smith dans Downton
// Abbey + énergie d'une comédie virale TikTok. Les "Channeling [...]" guident Veo sur l'intention.
const CLIP_RECIPES = [
  // ── VERDICTS (8 clips : 4 × 2 variantes) ──
  {
    key: "inacceptable",
    category: "verdict",
    count: 2,
    variants: [
      "stares directly into the camera with wide outraged eyes and mouth slightly open in visible shock, then slowly and deliberately closes her eyes in long-suffering exasperation, ears flattening back in clear disgust. Theatrical anthropomorphic expression. Channeling a grand dame who has just witnessed unspeakable bad taste",
      "slowly turns her head away from the camera with a dramatic offended huff, eyes closing in indignant dismissal, then briefly opens one eye to glare back with theatrical disdain. Channeling outraged aristocratic refusal to acknowledge",
    ],
  },
  {
    key: "evidemment",
    category: "verdict",
    count: 2,
    variants: [
      "tilts her chin upward with smug satisfaction, gives a slow theatrical blink while looking down her nose at the camera, then ends with a tiny self-satisfied huff. Channeling a queen who has been proven right yet again",
      "gives the camera a long knowing stare, then slowly closes her eyes with absolute certainty and the smallest possible nod of confirmation, as if to say obviously. Channeling unshakeable confident superiority",
    ],
  },
  {
    key: "mes-hommages",
    category: "verdict",
    count: 2,
    variants: [
      "looks at the camera with warm wide eyes of genuine admiration, gives a slow visible nod of deep respect, then closes her eyes savoring excellence. Like a discerning critic finally finding something worth her attention",
      "softens her expression dramatically, eyes warming and half-closing in genuine approval, then bows her head slowly in a small reverent gesture of respect. Channeling a grand connoisseur recognizing rare quality",
    ],
  },
  {
    key: "passable",
    category: "verdict",
    count: 2,
    variants: [
      "slowly turns her head to deliver a long withering side-eye to the camera, mouth pursing slightly, one ear flicking back in dismissal. Theatrical sassy expression. Channeling an unimpressed grand dame mid-tea",
      "looks the camera up and down slowly with a skeptical assessing gaze, mouth twitching as if suppressing a sigh, then a tiny shrug-like shoulder movement of indifference. Channeling polite but visibly unimpressed evaluation",
    ],
  },

  // ── RÉACTIONS NEUTRES (8 clips × 1 variante) — utilisées en cutaways / set-ups ──
  {
    key: "slow-blink",
    category: "reaction",
    count: 1,
    variants: [
      "performs a single very slow deliberate blink with dramatic timing, eyes closing fully for a full beat then reopening with renewed intensity. Expressive theatrical pause",
    ],
  },
  {
    key: "ear-flick",
    category: "reaction",
    count: 1,
    variants: [
      "flicks one ear sharply in clear annoyance the way someone might roll their eyes, head tilting slightly in dismissal. Expressive anthropomorphic gesture of dismissal",
    ],
  },
  {
    key: "side-eye",
    category: "reaction",
    count: 1,
    variants: [
      "snaps her gaze sharply to the side without moving her head, holds a long withering side-eye toward the camera, mouth pursing slightly. Theatrical sassy unimpressed expression",
    ],
  },
  {
    key: "head-tilt",
    category: "reaction",
    count: 1,
    variants: [
      "tilts her head sharply and theatrically to the side with wide curious eyes, ears perking forward in clear what-is-this attention. Expressive anthropomorphic curiosity",
    ],
  },
  {
    key: "yawn",
    category: "reaction",
    count: 1,
    variants: [
      "opens her mouth wide in an elegant theatrical yawn revealing small white teeth, eyes closing in dramatic boredom, then settles back with composed indifference. Expressive bored aristocratic gesture",
    ],
  },
  {
    key: "paw-lick",
    category: "reaction",
    count: 1,
    variants: [
      "lifts one front paw with deliberate elegance, gives it a single delicate but theatrical lick while keeping intense eye contact with the camera, then sets it down with poise. Expressive anthropomorphic grooming",
    ],
  },
  {
    key: "look-up",
    category: "reaction",
    count: 1,
    variants: [
      "slowly raises her chin dramatically to gaze upward with serene regality, eyes half-closing in deep philosophical contemplation. Theatrical aristocratic pose",
    ],
  },
  {
    key: "nose-wrinkle",
    category: "reaction",
    count: 1,
    variants: [
      "dramatically wrinkles her nose in clear disgust as if detecting something deeply unpleasant in the air, head pulling back slightly with visible offense. Expressive anthropomorphic reaction",
    ],
  },
];

const CLIPS_DIR = path.join(process.cwd(), "assets", "madame", "clips");
const DURATION_SEC = 5;     // V2 : bump 4s→5s pour laisser le temps de jouer chaque beat dramatique (slow blink + nod = 2.5s, etc.)
const RESOLUTION = "720p";  // bake-off OK en 720p ; remonter en 1080p coûterait 50% de plus pour peu de gain
const ASPECT_RATIO = "9:16";
const COST_PER_CLIP_USD = 0.2 * DURATION_SEC; // Veo no-audio = $0.20/s → 5s = $1.00/clip

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
