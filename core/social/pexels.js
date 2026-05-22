// Client Pexels — sourcing stock vidéo / photo (réels animaux, pas IA).
// Doc : https://www.pexels.com/api/documentation/
// Auth : header "Authorization: <PEXELS_API_KEY>"
// Free tier : 200/h, 20k/mois.
//
// Améliorations vs v1 : queries variées par theme, déduplication via cache local,
// scoring par durée/orientation pour Reels verticaux.

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
  const res = await fetch(url, { headers: { Authorization: key() } });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pexels ${res.status}: ${text.slice(0, 200)}`);
  }
  return await res.json();
}

export async function searchVideos(query, { perPage = 15, orientation = "portrait", size = "medium" } = {}) {
  const data = await pexelsFetch("/videos/search", { query, per_page: perPage, orientation, size });
  return data.videos || [];
}

export async function searchPhotos(query, { perPage = 15, orientation = "square" } = {}) {
  const data = await pexelsFetch("/v1/search", { query, per_page: perPage, orientation });
  return data.photos || [];
}

/**
 * Cache des IDs Pexels déjà utilisés (anti-doublon).
 */
function getUsageCachePath(config) {
  return path.join(config._projectDir, ".pexels-used.json");
}

function loadUsedIds(config) {
  const p = getUsageCachePath(config);
  if (!fs.existsSync(p)) return new Set();
  try {
    return new Set(JSON.parse(fs.readFileSync(p, "utf8")));
  } catch {
    return new Set();
  }
}

function saveUsedIds(config, idSet) {
  const p = getUsageCachePath(config);
  fs.writeFileSync(p, JSON.stringify([...idSet], null, 0));
}

/**
 * Score un asset Pexels selon nos critères (durée idéale 10-25s, vertical, qualité).
 */
function scoreVideo(video) {
  let s = 0;
  const d = video.duration || 0;
  if (d >= 8 && d <= 30) s += 30;       // Sweet spot Reel
  else if (d >= 4 && d <= 60) s += 15;
  if (video.height > video.width) s += 20; // Portrait préféré pour Reel
  if (video.width >= 1080) s += 10;        // HD
  // Variation par utilisateur (évite de prendre toujours le top 1 strict)
  s += Math.floor(Math.random() * 10);
  return s;
}

function scorePhoto(photo) {
  let s = 0;
  if (photo.width >= 1080) s += 10;
  if (photo.width === photo.height) s += 20; // Carré pour feed
  s += Math.floor(Math.random() * 10);
  return s;
}

/**
 * Sélection robuste : top scored + non déjà utilisé.
 */
export function pickFreshVideo(config, videos) {
  if (!videos?.length) return null;
  const used = loadUsedIds(config);
  const fresh = videos.filter((v) => !used.has(`v-${v.id}`));
  const ranked = (fresh.length ? fresh : videos).sort((a, b) => scoreVideo(b) - scoreVideo(a));
  return ranked[0] || null;
}

export function pickFreshPhoto(config, photos) {
  if (!photos?.length) return null;
  const used = loadUsedIds(config);
  const fresh = photos.filter((p) => !used.has(`p-${p.id}`));
  const ranked = (fresh.length ? fresh : photos).sort((a, b) => scorePhoto(b) - scorePhoto(a));
  return ranked[0] || null;
}

export function markUsed(config, kind, id) {
  const used = loadUsedIds(config);
  used.add(`${kind === "video" ? "v" : "p"}-${id}`);
  saveUsedIds(config, used);
}

export function pickBestVideoFile(video) {
  const files = video?.videoFiles || video?.video_files;
  if (!files?.length) return null;
  // Préfère HD portrait ≤ 1080p (compatible Reels Instagram + TikTok)
  const portraits = files.filter((f) => (f.height || 0) > (f.width || 0) && (f.height || 0) <= 1920);
  if (portraits.length) return portraits.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
  return files.sort((a, b) => (b.height || 0) - (a.height || 0))[0];
}

export async function downloadFile(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, buf);
  return destPath;
}

/**
 * Mots-clés Pexels par theme — riches et variés pour éviter de retomber sur les mêmes assets.
 * Chaque appel pioche aléatoirement parmi plusieurs queries possibles.
 */
const THEME_QUERIES = {
  tendresse: [
    "puppy sleeping owner",
    "cat purring close up",
    "small dog cuddle blanket",
    "kitten yawning",
    "golden retriever puppy paw",
    "cat licking owner hand",
    "shiba inu sleeping",
    "fluffy cat eyes",
  ],
  inspiration: [
    "cat sunbeam window",
    "dog cozy bed afternoon",
    "puppy stretching morning",
    "cat looking out window peaceful",
    "dog sleeping pillow soft light",
    "kitten morning sunlight",
  ],
  "behind-scenes": [
    "hands brushing dog fur",
    "pet grooming process",
    "wooden brush dog hair",
    "owner combing cat",
    "pet care routine home",
    "trimming dog nails close",
  ],
  astuce: [
    "dog drinking water bowl",
    "cat fountain water",
    "puppy training treat",
    "dog brushing teeth home",
    "cat using scratching post",
  ],
  "produit-usage": [
    "cat sleeping bed cozy",
    "dog leash walking park",
    "pet bowl food kitchen",
    "cooling mat dog summer",
    "cat tunnel play",
  ],
  guide: [
    "dog portrait studio beige",
    "cat portrait soft light",
    "groomer working dog",
    "long hair dog brushing",
  ],
  communaute: [
    "owner hugging dog smiling",
    "cat lap reading",
    "person petting cat soft",
    "dog walking owner park",
  ],
};

export function queryForTheme(theme, species = null) {
  const pool = THEME_QUERIES[theme] || THEME_QUERIES.tendresse;
  // Si species donné, biaise vers ce mot
  let candidates = pool;
  if (species === "chat") candidates = pool.filter((q) => q.includes("cat") || q.includes("kitten"));
  else if (species === "chien") candidates = pool.filter((q) => q.includes("dog") || q.includes("puppy"));
  if (candidates.length === 0) candidates = pool;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Queries Pexels orientées catalogue Poils Précieux : majoritairement TOILETTAGE / BROSSAGE / SOIN
 * (les catégories de la boutique). Queries FR + EN pour maximiser les bons résultats.
 *
 * weight = poids dans le random pick. Brossage / toilettage en gros = 70% des picks,
 * autres catégories pet care = 30%.
 */
const BRAND_RELEVANT_QUERIES = [
  // ── TOILETTAGE / BROSSAGE (priorité haute — 70% du temps) ──
  { query: "brossage chien", category: "toilettage", species: "chien", weight: 4 },
  { query: "brushing dog fur", category: "toilettage", species: "chien", weight: 4 },
  { query: "dog grooming brush", category: "toilettage", species: "chien", weight: 3 },
  { query: "long hair dog brushing", category: "toilettage", species: "chien", weight: 3 },
  { query: "toilettage chien", category: "toilettage", species: "chien", weight: 3 },
  { query: "groomer brushing golden retriever", category: "toilettage", species: "chien", weight: 2 },
  { query: "cocker spaniel grooming", category: "toilettage", species: "chien", weight: 2 },

  { query: "brossage chat", category: "toilettage", species: "chat", weight: 3 },
  { query: "cat grooming brush", category: "toilettage", species: "chat", weight: 3 },
  { query: "brushing cat fur", category: "toilettage", species: "chat", weight: 3 },
  { query: "toilettage chat", category: "toilettage", species: "chat", weight: 2 },

  // ── HYGIÈNE / SOIN (15%) ──
  { query: "trimming dog nails", category: "hygiene", species: "chien", weight: 2 },
  { query: "couper griffes chien", category: "hygiene", species: "chien", weight: 2 },
  { query: "dog teeth brushing", category: "hygiene", species: "chien", weight: 1 },
  { query: "cleaning dog paw", category: "hygiene", species: "chien", weight: 2 },
  { query: "dog bath shower", category: "hygiene", species: "chien", weight: 2 },
  { query: "cat nail clipping", category: "hygiene", species: "chat", weight: 1 },

  // ── ALIMENTATION / EAU (10%) ──
  { query: "dog drinking water fountain", category: "alimentation", species: "chien", weight: 1 },
  { query: "cat water fountain drinking", category: "alimentation", species: "chat", weight: 2 },
  { query: "dog eating ceramic bowl", category: "alimentation", species: "chien", weight: 1 },

  // ── COUCHAGE / CONFORT (5%) ──
  { query: "dog cozy bed sleeping", category: "couchage", species: "chien", weight: 1 },
  { query: "cat round bed cozy", category: "couchage", species: "chat", weight: 1 },
];

/**
 * Pioche une query au hasard pondérée par `weight`.
 * Toilettage/brossage = ~70% des picks pour rester ancré au catalogue boutique.
 */
export function pickBrandQuery({ preferSpecies = null } = {}) {
  let pool = BRAND_RELEVANT_QUERIES;
  if (preferSpecies) {
    const filtered = pool.filter((q) => !q.species || q.species === preferSpecies);
    if (filtered.length > 0) pool = filtered;
  }
  // Random pondéré par weight
  const totalWeight = pool.reduce((s, q) => s + (q.weight || 1), 0);
  let r = Math.random() * totalWeight;
  for (const q of pool) {
    r -= q.weight || 1;
    if (r <= 0) return q;
  }
  return pool[pool.length - 1]; // fallback (shouldn't happen)
}
