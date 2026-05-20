// Client Buffer — publication unifiée Instagram + TikTok via Buffer API.
// Docs: https://buffer.com/developers/api
//
// Workflow:
//   1. Upload image vers Buffer (ou utiliser un URL public — on uploadera via Shopify CDN ou imgur)
//   2. Créer un "update" (post) sur chaque profil avec scheduledAt
//
// Note : pour MVP, on génère un manifest JSON localement et on fait l'upload via Buffer
// que si BUFFER_ACCESS_TOKEN est défini. Sans token = on output juste le manifest pour
// review manuelle / post manuel.

const BUFFER_API = "https://api.bufferapp.com/1";

export function hasBufferToken(config) {
  const envName = config.buffer?.envToken;
  if (!envName) return false;
  return !!process.env[envName];
}

function token(config) {
  const v = process.env[config.buffer.envToken];
  if (!v) throw new Error(`Missing ${config.buffer.envToken}`);
  return v;
}

export async function bufferRequest(config, method, path, body) {
  const t = token(config);
  const url = `${BUFFER_API}${path}?access_token=${t}`;
  const opts = { method };
  if (body) {
    opts.headers = { "Content-Type": "application/x-www-form-urlencoded" };
    opts.body = new URLSearchParams(body).toString();
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Buffer ${method} ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  }
  return await res.json();
}

/**
 * Liste les profiles Buffer connectés (pour identifier instagram_id, tiktok_id).
 */
export async function listProfiles(config) {
  return await bufferRequest(config, "GET", "/profiles.json");
}

/**
 * Crée un post programmé sur un profil (Instagram, TikTok, etc.).
 * Buffer accepte text + media URL.
 *
 * @param {object} args
 * @param {string} args.profileId - id du profile Buffer
 * @param {string} args.text - caption complet
 * @param {string} args.imageUrl - URL publique de l'image
 * @param {Date} args.scheduledAt - date de publication
 */
export async function schedulePost(config, { profileId, text, imageUrl, scheduledAt }) {
  return await bufferRequest(config, "POST", "/updates/create.json", {
    "profile_ids[]": profileId,
    text,
    "media[picture]": imageUrl,
    "media[thumbnail]": imageUrl,
    scheduled_at: Math.floor(scheduledAt.getTime() / 1000),
  });
}
