// J3 — "L'avis de Madame" : format SIGNATURE mascotte.
//
// FLOW (~8.5s total) :
//   1. [2.5s] Carte SET-UP plein cadre : "L'avis de Madame · Verdict n°47" + situation jugée
//   2. [4.0s] Clip Madame (librairie pré-générée Veo 3.1) + overlay verdict en Fraunces italique
//   3. [2.0s] Outro sting wordmark Poils Précieux (réutilise humor-outro)
//
// La SIGNATURE = la cohérence visuelle de Madame d'un post à l'autre + la typo Fraunces italique
// + (à terme) le motif clavecin 3 notes en audio. Le compteur "Verdict n°N" persistant donne
// un côté "rubrique mensuelle" qui retient l'audience.
//
// PRÉREQUIS pour qu'il marche :
//   1. assets/madame/clips/ — librairie ≥4 clips avec manifest.json
//      (généré par `node commands/madame-library.js --reference <ref>`)
//   2. (OPTIONNEL phase 2.5) assets/madame/audio/clavecin-3notes.mp3 — motif sonore.
//      Si absent → vidéo muette (acceptable, le visuel suffit en MVP).
//
// PERSISTANCE : projects/poils-precieux/madame-verdicts.json = compteur + historique des verdicts
// pour permettre la rotation anti-répétition (situations + verdicts récents).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { claudeJSON } from "../claude/client.js";
import { renderHtmlToPng } from "../design/render.js";
import { buildMadameSetupCard } from "../design/templates/madame-setup-card.js";
import { buildMadameVerdictOverlay } from "../design/templates/madame-verdict-overlay.js";
import { buildHumorOutro } from "../design/templates/humor-outro.js";
import {
  buildSegmentWithOverlay,
  buildStillSegment,
  concatSegments,
  overlayMusicOnVideo,
  probeDurationSec,
  ffmpegAvailable,
} from "../design/animate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIPS_DIR = path.join(__dirname, "..", "..", "assets", "madame", "clips");
const AUDIO_PATH = path.join(__dirname, "..", "..", "assets", "madame", "audio", "clavecin-3notes.mp3");

// Durées des 3 segments. Total ≈ 10.5s. CLIP_DURATION_SEC DOIT matcher madame-library.js
// DURATION_SEC (sinon ffmpeg coupe le clip prématurément et on perd la fin de l'expression).
// V2 : bumpé à 6s (Veo 3.1 n'accepte que 4/6/8) pour laisser le temps aux expressions théâtrales.
const SETUP_DURATION_SEC = 2.5;
const CLIP_DURATION_SEC = 6.0;
const OUTRO_DURATION_SEC = 2.0;

// V2.2 — palette pivot vers 4 expressions distinctes (founder direction).
// Anciennes (mes-hommages, passable) abandonnées pour l'instant — peuvent être rajoutées plus tard.
const VERDICT_KEYS = ["inacceptable", "evidemment", "tu-es-serieux", "surpris-etonne"];
const VERDICT_LABELS = {
  inacceptable: "Inacceptable.",
  evidemment: "Évidemment.",
  "tu-es-serieux": "Sérieusement ?",
  "surpris-etonne": "Tiens, tiens…",
};

// ─── Compteur / historique persistant ────────────────────────────────────────

function counterPath(config) {
  return path.join(config._projectDir, "madame-verdicts.json");
}

function loadCounter(config) {
  try {
    const data = JSON.parse(fs.readFileSync(counterPath(config), "utf8"));
    return {
      count: typeof data.count === "number" ? data.count : 0,
      history: Array.isArray(data.history) ? data.history : [],
    };
  } catch {
    return { count: 0, history: [] };
  }
}

function saveCounter(config, state) {
  fs.writeFileSync(counterPath(config), JSON.stringify(state, null, 2), "utf8");
}

// ─── Librairie de clips ──────────────────────────────────────────────────────

function loadManifest() {
  const manifestPath = path.join(CLIPS_DIR, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`manifest librairie manquant : ${manifestPath} — lance d'abord commands/madame-library.js`);
  }
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

/**
 * Pick un clip de la librairie pour le verdict donné, en évitant ceux utilisés récemment.
 * Fallback : si tous les variants ont été utilisés récemment, on accepte de réutiliser.
 */
function pickClipForVerdict(manifest, verdictKey, recentFilenames) {
  const candidates = (manifest.clips || []).filter((c) => c.key === verdictKey);
  if (candidates.length === 0) {
    throw new Error(`Aucun clip pour le verdict "${verdictKey}" dans la librairie`);
  }
  const fresh = candidates.filter((c) => !recentFilenames.includes(c.filename));
  const pool = fresh.length ? fresh : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Générateur principal ────────────────────────────────────────────────────

/**
 * Génère un Reel "L'avis de Madame" complet.
 *
 * @param {object} config - config projet (loadProject)
 * @param {string} runDir - dossier de sortie
 * @returns {Promise<{ mediaPaths: string[], format: string, mediaType: string, brief: object, content: object }>}
 */
export async function generateMadameVideo(config, runDir) {
  if (!(await ffmpegAvailable())) throw new Error("ffmpeg required for madame video");

  // 1. Vérifie la librairie (au moins les 4 verdicts présents)
  const manifest = loadManifest();
  const verdictsCovered = new Set((manifest.clips || []).filter((c) => c.category === "verdict").map((c) => c.key));
  const missing = VERDICT_KEYS.filter((k) => !verdictsCovered.has(k));
  if (missing.length) {
    throw new Error(`librairie Madame incomplète — verdicts manquants : ${missing.join(", ")}`);
  }

  // 2. Compteur persistant + bump du n°
  const counter = loadCounter(config);
  const newNumber = counter.count + 1;
  console.log(`[madame] verdict n°${newNumber}`);

  // 3. Claude génère situation + verdict + caption
  // Anti-répétition : on file à Claude les derniers verdicts + situations utilisés.
  const recentVerdicts = counter.history.slice(0, 5).map((h) => h.verdictKey);
  const recentSituations = counter.history.slice(0, 8).map((h) => h.situation);
  const { data: content } = await claudeJSON(config, {
    system: `Tu rédiges le contenu d'un Reel "L'AVIS DE MADAME" pour Poils Précieux (marque française premium chiens & chats).

Madame = chatte Persan chic, "Directrice des Standards de Poils Précieux". Elle juge des trucs du monde animal (produits, comportements, tendances, gadgets, modes, prix excessifs). Ton aristocratique légèrement snob, JAMAIS méchant — c'est la légèreté qui rend ça drôle.

Elle a 4 verdicts possibles :
- inacceptable    → sévère, mépris distingué (gadgets ridicules, prix abusifs, pratiques moches)
- evidemment      → confiance hautaine, "l'évidence" (vérités universelles, bonnes pratiques de base)
- mes-hommages    → approbation rare, respect (très belles choses, gestes nobles)
- passable        → réserve, peu impressionnée (correct mais sans génie)

RÈGLES DURES :
- FRANÇAIS naturel, ton parlé léger.
- ZÉRO émoji NULLE PART.
- SITUATION = phrase courte (4-7 mots max), factuelle, SANS verbe de jugement (Madame juge, pas la situation). Exemples : "La brosse cire à 39€.", "Le pull en cachemire pour chat.", "Les noms en -ette pour mâles.", "Les colliers cloutés roses."
- Ne JAMAIS mentionner Poils Précieux dans la situation (elle juge des trucs externes/abstraits).
- Ne JAMAIS nommer de marque concurrente (citer une catégorie/concept au lieu d'une marque).
- Caption Reel 50-100 mots, ton snob léger, sans "Lien en bio", termine par UNE question ouverte qui pousse les commentaires.
- Évite les ?! exclamations cri ; Madame n'élève jamais la voix.`,
    user: `Numéro de verdict : ${newNumber}.
Verdicts récents (à éviter pour rotation) : ${recentVerdicts.join(", ") || "(aucun)"}.
Situations récentes (à éviter) : ${recentSituations.length ? recentSituations.map((s) => `"${s}"`).join(", ") : "(aucune)"}.

Pioche UNE nouvelle situation à juger (pas dans les récentes), décide le verdict qui colle vraiment, écris la caption.

Catégories d'inspiration pour la situation (varie d'un post à l'autre) :
  accessoires toilettage · comportements félins ou canins · modes/tendances pet · gadgets technologiques · alimentation premium ou kitsch · beauté animale · rituels du quotidien · prix excessifs sur le marché · accessoires ostentatoires · noms d'animaux.

Return JSON :
{
  "situation": "4-7 mots factuel sans émoji",
  "verdictKey": "inacceptable|evidemment|mes-hommages|passable",
  "captionForPost": "50-100 mots, ton snob léger, sans émoji, sans 'Lien en bio', termine par UNE question ouverte",
  "captionHashtags": ["#poilsprecieux", "#poilsprecieuxfr", "...6-8 hashtags FR pet pertinents..."],
  "altText": "1 phrase FR décrivant la vidéo"
}`,
    maxTokens: 1000,
  });

  const verdictKey = String(content.verdictKey || "").trim();
  if (!VERDICT_KEYS.includes(verdictKey)) {
    throw new Error(`verdictKey invalide : "${verdictKey}" (attendu ${VERDICT_KEYS.join("|")})`);
  }
  const verdictLabel = VERDICT_LABELS[verdictKey];
  const situation = (content.situation || "").trim();
  if (!situation) throw new Error("Situation absente de la réponse Claude");
  console.log(`[madame] situation: "${situation}" → verdict: ${verdictLabel}`);

  // 4. Pick un clip Madame correspondant au verdict (rotation anti-répétition)
  const recentClipFilenames = counter.history.slice(0, 4).map((h) => h.clipFilename);
  const clip = pickClipForVerdict(manifest, verdictKey, recentClipFilenames);
  const clipPath = path.join(CLIPS_DIR, clip.filename);
  if (!fs.existsSync(clipPath)) throw new Error(`Clip introuvable sur disque : ${clipPath}`);
  console.log(`[madame] clip = ${clip.filename}`);

  // 5. Render PNGs (setup card + verdict overlay transparent + outro sting wordmark)
  const setupPngPath = path.join(runDir, "madame-setup.png");
  await renderHtmlToPng({
    ...buildMadameSetupCard({ verdictNumber: newNumber, situation }),
    outputPath: setupPngPath,
  });

  const verdictPngPath = path.join(runDir, "madame-verdict.png");
  await renderHtmlToPng({
    ...buildMadameVerdictOverlay({ verdict: verdictLabel }),
    outputPath: verdictPngPath,
  });

  const outroPngPath = path.join(runDir, "madame-outro.png");
  await renderHtmlToPng({
    ...buildHumorOutro({}), // sting wordmark partagé avec J2 humor — cohérence brand
    outputPath: outroPngPath,
  });

  // 6. Build segments ffmpeg
  // 6a. Setup card : still image avec fondus
  const setupSegPath = path.join(runDir, "madame-seg-setup.mp4");
  await buildStillSegment({
    imagePath: setupPngPath,
    durationSec: SETUP_DURATION_SEC,
    fadeInSec: 0.4,
    fadeOutSec: 0.4,
    outputPath: setupSegPath,
  });

  // 6b. Madame clip + verdict overlay
  const clipSegPath = path.join(runDir, "madame-seg-clip.mp4");
  await buildSegmentWithOverlay({
    clipPath,
    overlayPngPath: verdictPngPath,
    durationSec: CLIP_DURATION_SEC,
    videoFadeOutSec: 0.4, // fade-to-black vers l'outro
    outputPath: clipSegPath,
  });

  // 6c. Outro sting wordmark
  const outroSegPath = path.join(runDir, "madame-seg-outro.mp4");
  await buildStillSegment({
    imagePath: outroPngPath,
    durationSec: OUTRO_DURATION_SEC,
    fadeInSec: 0.4,
    fadeOutSec: 0.5,
    outputPath: outroSegPath,
  });

  // 7. Concat 3 segments → vidéo sans audio
  const noAudioPath = path.join(runDir, "madame_noaudio.mp4");
  await concatSegments({
    segmentPaths: [setupSegPath, clipSegPath, outroSegPath],
    outputPath: noAudioPath,
  });
  console.log(`[madame] concat 3 segments → ${path.basename(noAudioPath)}`);

  // 8. Audio sting (OPTIONNEL — phase 2.5)
  // Si le motif clavecin existe → overlay. Sinon → vidéo muette.
  // NOTE : overlayMusicOnVideo loop l'audio. Pour un sting one-shot propre il faudrait un helper
  // dédié (TODO phase 2.5 : overlayStingOnVideo avec adelay + sans -stream_loop -1).
  // Pour le MVP, si le sting fait ~1.3s il loopera ~6× sur 8.5s — acceptable mais à raffiner.
  const finalPath = path.join(runDir, `madame-v${newNumber}-${verdictKey}-${Date.now()}.mp4`);
  if (fs.existsSync(AUDIO_PATH)) {
    const realDur =
      (await probeDurationSec(noAudioPath)) ||
      (SETUP_DURATION_SEC + CLIP_DURATION_SEC + OUTRO_DURATION_SEC);
    await overlayMusicOnVideo({
      videoPath: noAudioPath,
      audioPath: AUDIO_PATH,
      outputPath: finalPath,
      recodeVideo: false,
      audioFadeOutSec: 0.8,
      videoDurationSec: realDur,
    });
    console.log(`[madame] audio sting overlay (clavecin)`);
  } else {
    fs.copyFileSync(noAudioPath, finalPath);
    console.log(`[madame] ⚠ pas de sting audio (assets/madame/audio/clavecin-3notes.mp3 absent) — vidéo muette`);
  }
  console.log(`[madame] ✓ final MP4 ready: ${path.basename(finalPath)}`);

  // 9. Persiste compteur + historique (anti-répétition pour les prochains runs)
  const newHistory = [
    {
      number: newNumber,
      verdictKey,
      situation,
      clipFilename: clip.filename,
      generatedAt: new Date().toISOString(),
    },
    ...counter.history,
  ].slice(0, 50); // garde les 50 derniers (≈3 mois à 1/sem)
  saveCounter(config, { count: newNumber, history: newHistory });
  console.log(`[madame] compteur sauvegardé (n°${newNumber}, historique ${newHistory.length} entrées)`);

  return {
    mediaPaths: [finalPath],
    format: "reel",
    mediaType: "video",
    brief: {
      type: "madame",
      templateType: "madame",
      verdictNumber: newNumber,
      verdictKey,
      verdictLabel,
      situation,
      clipFilename: clip.filename,
      audioSting: fs.existsSync(AUDIO_PATH) ? "clavecin-3notes.mp3" : null,
      content,
    },
    content,
  };
}
