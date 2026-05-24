// Mémoire persistante des contenus sociaux déjà publiés, pour éviter les doublons.
// CRITIQUE : sur GitHub Actions chaque run repart d'un dépôt propre. Le workflow
// social commit ce fichier après chaque exécution → la mémoire survit aux runs.
//
// Suivi : IDs vidéos Pexels, handles produits, pistes musicales, concepts (rotation).

import fs from "node:fs";
import path from "node:path";

const DEFAULT = { videos: [], products: [], music: [], concepts: [] };

function historyPath(config) {
  return path.join(config._projectDir, "social-history.json");
}

export function loadHistory(config) {
  try {
    return { ...DEFAULT, ...JSON.parse(fs.readFileSync(historyPath(config), "utf8")) };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveHistory(config, h) {
  fs.writeFileSync(historyPath(config), JSON.stringify(h, null, 2), "utf8");
}

// Place `val` en tête, dédoublonne, garde au plus `cap` éléments (mémoire glissante).
function pushCapped(arr, val, cap) {
  return [val, ...(arr || []).filter((x) => x !== val)].slice(0, cap);
}

/**
 * Enregistre ce qui vient d'être publié (appelé en fin de run social).
 */
export function recordSocialUsage(config, { videoId, productHandle, music, concept } = {}) {
  const h = loadHistory(config);
  if (videoId != null) h.videos = pushCapped(h.videos, `v-${videoId}`, 120);
  if (productHandle) h.products = pushCapped(h.products, productHandle, 15);
  if (music) h.music = pushCapped(h.music, music, 6);
  if (concept) h.concepts = pushCapped(h.concepts, concept, 8);
  saveHistory(config, h);
  return h;
}

/** IDs vidéos déjà utilisés (Set de "v-<id>"). */
export function recentVideoIds(config) {
  return new Set(loadHistory(config).videos || []);
}

/** Handles produits featurés récemment (les N derniers). */
export function recentProducts(config, n = 10) {
  return new Set((loadHistory(config).products || []).slice(0, n));
}

/** Pistes musicales utilisées récemment (les N dernières). */
export function recentMusic(config, n = 4) {
  return new Set((loadHistory(config).music || []).slice(0, n));
}

/** Concepts vidéo utilisés récemment (liste ordonnée, le + récent en tête). */
export function recentConcepts(config, n = 3) {
  return (loadHistory(config).concepts || []).slice(0, n);
}
