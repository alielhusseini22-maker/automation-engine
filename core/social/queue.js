// Content queue : lit les items prêts à poster depuis projects/<projet>/content-queue/
// Chaque item = un sous-dossier avec media.{mp4,jpg,png} + meta.json
// Après consommation : déplacé dans _done/<date>-<nom>/

import fs from "node:fs";
import path from "node:path";

const QUEUE_DIRNAME = "content-queue";
const DONE_DIRNAME = "_done";

function queueDir(config) {
  return path.join(config._projectDir, QUEUE_DIRNAME);
}

function doneDir(config) {
  return path.join(queueDir(config), DONE_DIRNAME);
}

/**
 * Trouve le fichier media (mp4 / jpg / png) dans un dossier d'item.
 */
function findMedia(itemDir) {
  const extensions = [".mp4", ".mov", ".webm", ".jpg", ".jpeg", ".png"];
  for (const f of fs.readdirSync(itemDir)) {
    if (extensions.includes(path.extname(f).toLowerCase())) {
      return path.join(itemDir, f);
    }
  }
  return null;
}

function readMeta(itemDir) {
  const p = path.join(itemDir, "meta.json");
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf8"));
  } catch {
    return {};
  }
}

/**
 * Liste tous les items disponibles dans la queue, dans l'ordre alphabétique.
 * Skip les sous-dossiers commençant par "_" (réservés : _done, _drafts, etc.).
 */
export function listQueueItems(config) {
  const dir = queueDir(config);
  if (!fs.existsSync(dir)) return [];

  const items = [];
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.startsWith("_")) continue;
    if (name === "README.md") continue;
    const itemDir = path.join(dir, name);
    if (!fs.statSync(itemDir).isDirectory()) continue;

    const mediaPath = findMedia(itemDir);
    if (!mediaPath) continue; // Pas de média = item invalide, skip

    const meta = readMeta(itemDir);
    items.push({
      id: name,
      itemDir,
      mediaPath,
      mediaType: getMediaType(mediaPath),
      meta,
    });
  }
  return items;
}

/**
 * Sélectionne le prochain item à utiliser pour un theme/jour donné.
 * Priorité :
 *   1. items dont `preferredDays` contient le jour courant
 *   2. items dont `theme` matche le theme attendu
 *   3. n'importe quel item disponible (ordre alphabétique)
 */
export function pickItemForDay(config, { dayName, theme }) {
  const items = listQueueItems(config);
  if (items.length === 0) return null;

  // 1. preferred day exact
  const byDay = items.find((it) => Array.isArray(it.meta.preferredDays) && it.meta.preferredDays.includes(dayName));
  if (byDay) return byDay;

  // 2. theme match
  const byTheme = items.find((it) => it.meta.theme === theme);
  if (byTheme) return byTheme;

  // 3. premier disponible
  return items[0];
}

/**
 * Marque un item comme consommé : déplace dossier vers _done/<date>-<id>/.
 */
export function markConsumed(config, item) {
  const done = doneDir(config);
  if (!fs.existsSync(done)) fs.mkdirSync(done, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const target = path.join(done, `${stamp}-${item.id}`);
  fs.renameSync(item.itemDir, target);
  return target;
}

function getMediaType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if ([".mp4", ".mov", ".webm"].includes(ext)) return "video";
  if ([".jpg", ".jpeg", ".png"].includes(ext)) return "image";
  return "unknown";
}
