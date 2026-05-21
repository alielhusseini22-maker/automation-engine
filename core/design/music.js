// Sélection d'une piste musicale libre de droit depuis assets/music/.
// Si le dossier est vide → renvoie null (vidéo générée sans audio, encore acceptable mais sub-optimal).

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR = path.join(__dirname, "..", "..", "assets", "music");

const AUDIO_EXTENSIONS = [".mp3", ".m4a", ".aac", ".wav"];

/**
 * Liste les pistes disponibles dans le dossier.
 */
export function listMusicTracks() {
  if (!fs.existsSync(MUSIC_DIR)) return [];
  return fs
    .readdirSync(MUSIC_DIR)
    .filter((f) => AUDIO_EXTENSIONS.includes(path.extname(f).toLowerCase()))
    .map((f) => path.join(MUSIC_DIR, f));
}

/**
 * Pioche une piste au hasard, avec un biais optionnel selon le mood/slot.
 * Convention de nommage suggérée : <mood>-<nom>.mp3
 *   ex: calm-piano-soft.mp3, upbeat-acoustic.mp3, intimate-warm.mp3
 *
 * Moods reconnus :
 *   - "calm"     → tip card, inspiration (slot evening or sunday)
 *   - "warm"     → produit highlight (slot evening)
 *   - "upbeat"   → hook carousel (slot morning) — mais sans casser le calme brand
 *   - "intimate" → behind-scenes, tendresse
 */
export function pickMusicTrack({ mood = null } = {}) {
  const all = listMusicTracks();
  if (all.length === 0) return null;

  if (mood) {
    const matched = all.filter((p) => path.basename(p).toLowerCase().startsWith(`${mood.toLowerCase()}-`));
    if (matched.length > 0) return matched[Math.floor(Math.random() * matched.length)];
  }
  return all[Math.floor(Math.random() * all.length)];
}

/**
 * Renvoie un mood suggéré selon slot + template type.
 */
export function moodForContext({ slot, templateType }) {
  if (templateType === "hook-carousel") return "warm";
  if (templateType === "tip-card") return "calm";
  if (templateType === "product-highlight") return "warm";
  return slot === "morning" ? "upbeat" : "calm";
}
