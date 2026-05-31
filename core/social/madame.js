// J3 — "L'avis de Madame" : format SIGNATURE mascotte.
//
// CONCEPT (validé par le founder) :
//   - Madame = chatte Persan chic, "Directrice des Standards de Poils Précieux".
//   - 5-8s : un produit/situation est présentée → Madame rend son verdict ("Inacceptable.",
//     "Évidemment.", "Mes hommages.", "Passable.") avec un compteur récurrent ("Verdict n°47").
//   - Identité audio : motif clavecin 3 notes qui sonne avant le verdict (sting reconnaissable).
//   - Identité visuelle : Madame est toujours la même chatte (clip IA réutilisé d'une librairie
//     pré-générée de 10-20 réactions), texte verdict en Fraunces italique, sting wordmark en fin.
//
// CETTE FONCTION EST UN SCAFFOLD. La librairie de clips Madame + le motif clavecin 3 notes ne
// sont PAS encore générés (phase 2 du chantier). Tant qu'ils ne sont pas là, on JETTE une erreur
// claire — le dispatcher dans designed-post.js l'attrape et retombe sur humor pour ne pas sauter
// un jour de cycle.
//
// PRÉREQUIS PHASE 2 (à débloquer avant d'activer ce générateur) :
//   1. assets/madame/clips/ — 10-20 MP4 1080×1920 de Madame réagissant (IA Sora/Veo/Kling),
//      chacun nommé madame-<emotion>-<numéro>.mp4 (ex: madame-inacceptable-01.mp4).
//   2. assets/madame/audio/clavecin-3notes.mp3 — sting audio 1.2-1.5s.
//   3. assets/madame/products/ — pas un nouveau dossier : on réutilisera Shopify pour les "objets
//      jugés" (cartes produit) OU on génèrera des set-ups texte purs ("Brosse #47").
//   4. projects/poils-precieux/madame-verdicts.json — compteur persistant (n° verdict +1 à chaque post).
//
// Une fois ces 4 assets prêts, remplacer le throw par la vraie implémentation
// (voir TODO interne ci-dessous).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CLIPS_DIR = path.join(__dirname, "..", "..", "assets", "madame", "clips");
const AUDIO_PATH = path.join(__dirname, "..", "..", "assets", "madame", "audio", "clavecin-3notes.mp3");

/**
 * Génère un Reel "L'avis de Madame" — phase 2 (scaffold).
 *
 * Jette `new Error("madame library not ready: <raison>")` tant que les assets ne sont pas en place,
 * pour que le dispatcher tombe en fallback humor sans casser le cycle.
 *
 * @param {object} _config - config projet (réservé phase 2)
 * @param {string} _runDir - dossier de sortie (réservé phase 2)
 * @returns {Promise<{ mediaPaths: string[], format: string, mediaType: string, brief: object, content: object }>}
 */
export async function generateMadameVideo(_config, _runDir) {
  const missing = [];
  // 1. Librairie de clips Madame
  if (!fs.existsSync(CLIPS_DIR)) {
    missing.push(`dossier clips manquant (${CLIPS_DIR})`);
  } else {
    const clips = fs.readdirSync(CLIPS_DIR).filter((f) => f.toLowerCase().endsWith(".mp4"));
    if (clips.length < 4) missing.push(`<4 clips Madame dans ${CLIPS_DIR} (${clips.length} trouvés, minimum 4 pour rotation)`);
  }
  // 2. Motif sonore clavecin
  if (!fs.existsSync(AUDIO_PATH)) {
    missing.push(`motif audio manquant (${AUDIO_PATH})`);
  }

  if (missing.length) {
    throw new Error(`madame library not ready: ${missing.join(" | ")}`);
  }

  // TODO phase 2 — implémentation :
  //   1. Lire/incrémenter projects/poils-precieux/madame-verdicts.json (compteur persistant).
  //   2. Tirer un set-up (produit Shopify OU situation textuelle) — éviter répétition récente.
  //   3. claudeJSON : générer { situation, verdict ∈ ["Inacceptable.", "Évidemment.", ...],
  //      caption, hashtags }. Système : ton snob bienveillant, FR, 4-6 mots verdict, zéro émoji.
  //   4. Picker clip Madame correspondant au verdict (ex: verdict=Inacceptable → madame-inacceptable-*.mp4).
  //   5. Render PNG : "Verdict n°<N>" header + situation overlay 2s.
  //   6. ffmpeg : [PNG set-up 2s] → [motif clavecin 1.3s overlay sur frame "préparation"] →
  //      [clip Madame avec verdict en overlay 3s] → [sting wordmark outro 2s]. Total ~8s.
  //   7. Persister le verdict (n°, situation, verdict choisi) dans madame-verdicts.json + history.
  throw new Error("madame implementation pending (phase 2) — assets présents mais générateur pas encore branché");
}
