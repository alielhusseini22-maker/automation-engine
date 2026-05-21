// Client Pexels — sourcing de stock vidéo / photo libre de droit (vrais animaux, pas IA).
// Doc : https://www.pexels.com/api/documentation/
// Auth : header "Authorization: <PEXELS_API_KEY>"
// Free tier : 200 requêtes/heure, 20 000/mois — largement suffisant.

import fs from "node:fs";
import path from "node:path";

const PEXELS_API = "https://api.pexels.com";

export function hasPexelsKey() {
  return !!process.env.PEXELS_API_KEY;
}

function key() {
  const k = process.env.PEXELS_API_KEY;
  if (!k) throw new Error("Missing PEXELS_API_KEY");
  return k;
}

async function pexelsFetch(endpoint, params = {}) {
  const url = new URL(`${PEXELS_API}${endpoint}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, {
    headers: { Authorization: key() },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pexels ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

/**
 * Cherche des vidéos sur Pexels.
 * @param {string} query - mots-clés en anglais (Pexels indexe principalement en anglais)
 * @param {object} [opts]
 * @param {number} [opts.perPage=15]
 * @param {"portrait"|"landscape"|"square"} [opts.orientation]
 * @param {string} [opts.size="medium"]
 * @returns Array<{ id, url, duration, width, height, image, videoFiles }>
 */
export async function searchVideos(query, { perPage = 15, orientation = "portrait", size = "medium" } = {}) {
  const data = await pexelsFetch("/videos/search", { query, per_page: perPage, orientation, size });
  return data.videos || [];
}

/**
 * Cherche des photos sur Pexels.
 */
export async function searchPhotos(query, { perPage = 15, orientation = "square" } = {}) {
  const data = await pexelsFetch("/v1/search", { query, per_page: perPage, orientation });
  return data.photos || [];
}

/**
 * Pioche aléatoirement parmi les top résultats pour varier.
 */
export function pickRandom(items) {
  if (!items?.length) return null;
  return items[Math.floor(Math.random() * Math.min(items.length, 10))];
}

/**
 * Pour une vidéo Pexels, choisit le meilleur fichier mp4 pour notre usage social
 * (orientation portrait + résolution raisonnable).
 */
export function pickBestVideoFile(video) {
  if (!video?.videoFiles?.length && !video?.video_files?.length) return null;
  const files = video.videoFiles || video.video_files;
  // Préfère HD portrait ≤ 1080p
  const portraits = files.filter((f) => f.width < f.height && f.height <= 1920);
  if (portraits.length) return portraits.sort((a, b) => b.height - a.height)[0];
  return files.sort((a, b) => (a.width || 0) - (b.width || 0))[0];
}

/**
 * Télécharge une vidéo / photo Pexels localement.
 */
export async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return destPath;
}

/**
 * Construit des mots-clés Pexels selon le theme.
 */
export function queryForTheme(theme, species = null) {
  const speciesEN = species === "chat" ? "cat" : species === "chien" ? "dog" : "pet";
  const map = {
    tendresse: `cute ${speciesEN}`,
    inspiration: `${speciesEN} sleeping cozy`,
    "behind-scenes": `pet grooming hand`,
    astuce: `${speciesEN} home`,
    "produit-usage": `${speciesEN} accessory`,
    guide: `${speciesEN} portrait`,
    communaute: `${speciesEN} owner`,
  };
  return map[theme] || `cute ${speciesEN}`;
}
