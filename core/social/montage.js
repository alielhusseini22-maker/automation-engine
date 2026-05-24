// Montage vidéo multi-clips — évolution du single-clip Pexels (cf core/social/designed-post.js).
//
// Principe : 3 clips stock réels (Pexels) enchaînés, chacun avec un overlay texte branded animé,
// puis une piste musicale par-dessus. Découpé par "concept" (emotion / astuce / relatable) qui
// pilote les queries Pexels, le mood musical, et le style des textes à l'écran.
//
// NOTE : module ADDITIF. N'est PAS branché sur le pipeline quotidien ni Buffer. Utilisé par
// commands/social-sample.js (commande SAMPLE standalone).

import path from "node:path";
import fs from "node:fs";
import { claudeJSON } from "../claude/client.js";
import { renderHtmlToPng } from "../design/render.js";
import { buildVideoOverlay } from "../design/templates/video-overlay.js";
import {
  searchVideos,
  pickFreshVideo,
  pickBestVideoFile,
  downloadFile,
  hasPexelsKey,
} from "./pexels.js";
import {
  buildSegmentWithOverlay,
  concatSegments,
  overlayMusicOnVideo,
  ffmpegAvailable,
} from "../design/animate.js";
import { pickMusicTrack } from "../design/music.js";
import { recentVideoIds, recentConcepts, recentMusic } from "./history.js";

const SEGMENT_DURATION_SEC = 3.8;

/**
 * Concepts disponibles pour le montage. Chacun pilote queries Pexels + mood musical + style des textes.
 */
const CONCEPTS = {
  emotion: {
    key: "emotion",
    label: "Émotion / moments tendres",
    clipQueries: [
      "puppy sleeping cozy",
      "cat purring close up",
      "dog resting soft light",
      "kitten yawning blanket",
      "cat sunbeam window peaceful",
    ],
    musicMood: "calm",
    textStyle: "Lignes poétiques très courtes, tendres et posées. Évoque le calme, la confiance, le lien. Statement, jamais une question. Exemple de registre : « Un moment suspendu. », « La confiance, sans un mot. »",
  },
  astuce: {
    key: "astuce",
    label: "Astuce / soin en action",
    clipQueries: [
      "brushing dog fur",
      "trimming dog nails",
      "cat grooming brush",
      "long hair dog brushing",
      "cleaning dog paw close",
    ],
    musicMood: "warm",
    textStyle: "Lignes punchy façon astuce/étape, ton expert et bienveillant. Verbe d'action ou principe concret. Exemple de registre : « Brossez dans le sens du poil. », « Cinq minutes suffisent. »",
  },
  relatable: {
    key: "relatable",
    label: "Complice / quotidien drôle",
    clipQueries: [
      "dog shaking water wet",
      "cat knocking object table",
      "dog begging food",
      "cat zoomies playful",
      "dog stealing sock",
    ],
    musicMood: "upbeat",
    textStyle: "One-liners drôles et complices sur le quotidien proprio-animal. Ton léger, jamais méchant, jamais d'émoji. Exemple de registre : « Toujours le mauvais moment. », « Il a décidé. Pas vous. »",
  },
};

/**
 * Choisit un concept non utilisé récemment (fallback : n'importe lequel).
 */
function pickConcept(config, forced = null) {
  if (forced && CONCEPTS[forced]) return CONCEPTS[forced];
  const recent = recentConcepts(config); // liste ordonnée des derniers concepts
  const all = Object.keys(CONCEPTS);
  const fresh = all.filter((k) => !recent.includes(k));
  const pool = fresh.length ? fresh : all;
  const key = pool[Math.floor(Math.random() * pool.length)];
  return CONCEPTS[key];
}

/**
 * Récupère un clip Pexels frais pour une query : portrait → landscape → no-orientation (comme generatePexelsVideo).
 */
async function fetchClipForQuery(config, query, usedIds) {
  let videos = await searchVideos(query, { perPage: 15, orientation: "portrait" });
  let video = pickFreshVideo(config, videos, usedIds);
  if (!video) {
    videos = await searchVideos(query, { perPage: 15, orientation: "landscape" });
    video = pickFreshVideo(config, videos, usedIds);
  }
  if (!video) {
    videos = await searchVideos(query, { perPage: 15 });
    video = pickFreshVideo(config, videos, usedIds);
  }
  return video;
}

/**
 * Génère une vidéo montage multi-clips branded.
 *
 * @param {object} config - config projet (loadProject)
 * @param {string} runDir - dossier de sortie
 * @param {object} [opts]
 * @param {string|null} [opts.concept=null] - clé de concept forcée (emotion|astuce|relatable)
 * @returns {Promise<{ mediaPaths: string[], format: string, mediaType: string, brief: object, content: object }>}
 */
export async function generateMontageVideo(config, runDir, { concept = null } = {}) {
  if (!hasPexelsKey()) throw new Error("PEXELS_API_KEY required for montage video");
  if (!(await ffmpegAvailable())) throw new Error("ffmpeg required for montage video");

  // 1. Concept
  const chosen = pickConcept(config, concept);
  console.log(`[montage] concept = ${chosen.key} (${chosen.label})`);

  // 2. Fetch 3 clips depuis 3 queries DISTINCTES du concept
  const usedIds = recentVideoIds(config);
  const usedThisRun = new Set(); // évite de réutiliser le même clip pour 2 queries dans le même run
  const queries = [...chosen.clipQueries];
  // Mélange léger pour varier les picks d'un run à l'autre
  queries.sort(() => Math.random() - 0.5);

  const clips = [];
  for (const query of queries) {
    if (clips.length >= 3) break;
    let video;
    try {
      video = await fetchClipForQuery(config, query, usedIds);
    } catch (err) {
      console.log(`[montage]   ⚠ query "${query}" failed: ${err.message}`);
      continue;
    }
    if (!video || usedThisRun.has(video.id)) {
      console.log(`[montage]   - skip query "${query}" (no fresh clip)`);
      continue;
    }
    const file = pickBestVideoFile(video);
    if (!file) {
      console.log(`[montage]   - skip query "${query}" (no usable file)`);
      continue;
    }
    usedThisRun.add(video.id);
    const rawPath = path.join(runDir, `montage-clip-${video.id}-raw.mp4`);
    console.log(`[montage]   downloading clip ${video.id} for "${query}" (${file.height || 0}p)...`);
    await downloadFile(file.link, rawPath);
    clips.push({ id: video.id, query, rawPath, durationSec: video.duration, sourceUrl: video.url });
  }

  if (clips.length < 2) {
    throw new Error(`Montage needs at least 2 clips, only found ${clips.length} for concept "${chosen.key}"`);
  }
  console.log(`[montage] ${clips.length} clips ready`);

  // 3. Claude génère les textes à l'écran (1 ligne + sub optionnel par clip) + la caption du post
  const { data: content } = await claudeJSON(config, {
    system: `Tu écris les TEXTES À L'ÉCRAN et la caption d'une vidéo sociale (Reel/TikTok) pour Poils Précieux, marque française premium pour chiens & chats. La vidéo est un MONTAGE de ${clips.length} plans stock réels enchaînés, avec un texte court posé sur chaque plan.

RÈGLES ABSOLUES — JAMAIS enfreindre :
- ZÉRO émoji nulle part (ni dans les overlays, ni dans la caption). Pas de pictogramme décoratif. C'est ce qui fait premium.
- Les textes à l'écran sont COURTS : 5 à 7 mots MAXIMUM par ligne (ils s'affichent en gros sur la vidéo). Le sous-titre est optionnel, encore plus court.
- Caption : pas de "Lien en bio" ni URL (le système ajoute le CTA par plateforme). Pas de hashtags inline (séparés dans captionHashtags).
- Ne PAS inventer de client, témoignage, ni nom d'animal. Observation universelle uniquement.
- FRANÇAIS.`,
    user: `Concept de la vidéo : ${chosen.label}.
Style attendu des textes à l'écran : ${chosen.textStyle}

Les ${clips.length} plans (dans l'ordre) montrent :
${clips.map((c, i) => `${i + 1}. ${c.query}`).join("\n")}

Écris, dans cet ordre :
- overlays : un tableau de ${clips.length} objets { "line": "...", "sub": "..." | null } — un par plan. "line" = 5-7 mots max, sans émoji, qui colle au plan ET au concept. "sub" = sous-titre court optionnel (ou null). L'ensemble doit se lire comme une mini-narration cohérente sur ${clips.length} plans.
- captionForPost : caption FR 60-100 mots, sans émoji, sans "Lien en bio". Première phrase courte qui plante le moment. Développe l'observation. Termine par UNE seule accroche d'engagement (question ouverte).
- captionHashtags : 6-8 hashtags (commence par #poilsprecieux et #poilsprecieuxfr, puis FR pet pertinents au concept).
- altText : 1 phrase FR décrivant la vidéo.

Return JSON :
{
  "overlays": [ { "line": "...", "sub": "..." }, ... ${clips.length} éléments ],
  "captionForPost": "...",
  "captionHashtags": ["#poilsprecieux", "#poilsprecieuxfr", "..."],
  "altText": "..."
}`,
    maxTokens: 1800,
  });

  const overlays = Array.isArray(content.overlays) ? content.overlays : [];
  if (overlays.length < clips.length) {
    throw new Error(`Claude returned ${overlays.length} overlays for ${clips.length} clips`);
  }

  // 4. Render des overlays PNG transparents
  const segmentPaths = [];
  for (let i = 0; i < clips.length; i++) {
    const ov = overlays[i] || {};
    const overlayPngPath = path.join(runDir, `montage-overlay-${i + 1}.png`);
    await renderHtmlToPng({
      ...buildVideoOverlay({ line: ov.line || "", sub: ov.sub || null, position: "lower" }),
      outputPath: overlayPngPath,
    });

    // 5. Build du segment (clip + overlay animé)
    const segPath = path.join(runDir, `montage-seg-${i + 1}.mp4`);
    console.log(`[montage]   segment ${i + 1}/${clips.length}: "${ov.line || ""}"`);
    await buildSegmentWithOverlay({
      clipPath: clips[i].rawPath,
      overlayPngPath,
      durationSec: SEGMENT_DURATION_SEC,
      outputPath: segPath,
    });
    segmentPaths.push(segPath);
  }

  // 6. Concat des segments → vidéo sans audio
  const noAudioPath = path.join(runDir, "montage_noaudio.mp4");
  await concatSegments({ segmentPaths, outputPath: noAudioPath });
  console.log(`[montage] concatenated ${segmentPaths.length} segments`);

  // 7. Musique selon le mood du concept
  const music = pickMusicTrack({ mood: chosen.musicMood, exclude: recentMusic(config) });
  if (music) console.log(`[montage] music: ${path.basename(music)} (mood=${chosen.musicMood})`);
  else console.log(`[montage] ⚠ no music track found, montage will be silent`);

  const finalPath = path.join(runDir, `montage-${chosen.key}-${Date.now()}.mp4`);
  if (music) {
    await overlayMusicOnVideo({
      videoPath: noAudioPath,
      audioPath: music,
      outputPath: finalPath,
      recodeVideo: false, // segments déjà en 1080x1920 H.264 → copy stream vidéo, mux audio
    });
  } else {
    fs.copyFileSync(noAudioPath, finalPath);
  }
  console.log(`[montage] ✓ final MP4 ready: ${path.basename(finalPath)}`);

  return {
    mediaPaths: [finalPath],
    format: "reel",
    mediaType: "video",
    brief: {
      type: "montage",
      templateType: "montage",
      concept: chosen.key,
      clipIds: clips.map((c) => c.id),
      clips: clips.map((c) => ({ id: c.id, query: c.query, durationSec: c.durationSec, sourceUrl: c.sourceUrl })),
      music: music ? path.basename(music) : null,
      content,
    },
    content,
  };
}
