// J2 — "Humour réel" : UN seul clip Pexels d'animal drôle + UN texte viral ≤7 mots posé dessus,
// puis un sting wordmark Poils Précieux en outro. Pas d'IA pour la vidéo (les viewers détectent l'IA
// dans l'humour et ça tue le rire). Le clip DOIT être un vrai animal capté en caméra.
//
// Format final : ~10s, 9:16, musique upbeat avec fondu de sortie.
//
// Le sel du format = le TEXTE. Le clip est juste le décor du gag. Donc tout l'effort est dans le
// prompt Claude : 5 règles dures de viralité (cf. système ci-dessous) + exemples bons/mauvais.
//
// Anti-doublon : on s'appuie sur recentVideoIds() comme montage.js (cache persistant social-history.json).

import path from "node:path";
import fs from "node:fs";
import { claudeJSON } from "../claude/client.js";
import { renderHtmlToPng } from "../design/render.js";
import { buildHumorOverlay } from "../design/templates/humor-overlay.js";
import { buildHumorOutro } from "../design/templates/humor-outro.js";
import {
  searchVideos,
  pickFreshVideo,
  pickBestVideoFile,
  downloadFile,
  hasPexelsKey,
} from "./pexels.js";
import {
  buildSegmentWithOverlay,
  buildStillSegment,
  concatSegments,
  overlayMusicOnVideo,
  probeDurationSec,
  ffmpegAvailable,
} from "../design/animate.js";
import { pickMusicTrack } from "../design/music.js";
import { recentVideoIds, recentMusic } from "./history.js";

// Durées cibles. Si le clip Pexels est plus court, on s'adapte (clamp).
const CLIP_TARGET_SEC_MAX = 7.5;
const CLIP_TARGET_SEC_MIN = 5.0;
const OUTRO_DURATION_SEC = 2.5;

/**
 * Pool de queries Pexels orientées "moment animal capté drôle".
 * Volontairement absurdes / spécifiques pour maximiser les chances de tomber sur un clip avec
 * une vraie expression, un vrai geste, pas un beauty-shot ennuyeux.
 * Les bons clips ont une "tête" reconnaissable — c'est ce qui fait rire.
 */
const HUMOR_QUERIES = [
  "cat jumping scared",
  "cat side eye camera",
  "cat falling table funny",
  "cat zoomies sprint",
  "cat attacking own tail",
  "cat staring blank wall",
  "cat refusing move",
  "dog stealing food kitchen",
  "dog tilt head confused",
  "dog spinning chase tail",
  "dog stuck head jar",
  "dog dramatic limp",
  "dog watching tv attentive",
  "dog shaking water slow motion",
  "puppy zoomies running",
  "puppy howling first time",
  "kitten attacking foot",
  "dog stealing sock running",
  "cat knocking glass off table",
  "dog reaction food smell",
];

function pickHumorQuery() {
  const i = Math.floor(Math.random() * HUMOR_QUERIES.length);
  return HUMOR_QUERIES[i];
}

/**
 * Récupère un clip Pexels frais pour une query (portrait > landscape > tout).
 * Identique à la stratégie de montage.js — on veut un vrai animal capté en caméra.
 */
async function fetchHumorClip(config, query, usedIds) {
  let videos = await searchVideos(query, { perPage: 20, orientation: "portrait" });
  let video = pickFreshVideo(config, videos, usedIds);
  if (!video) {
    videos = await searchVideos(query, { perPage: 20, orientation: "landscape" });
    video = pickFreshVideo(config, videos, usedIds);
  }
  if (!video) {
    videos = await searchVideos(query, { perPage: 20 });
    video = pickFreshVideo(config, videos, usedIds);
  }
  return video;
}

/**
 * Tente plusieurs queries jusqu'à trouver un clip "frais" (pas déjà utilisé).
 * Retourne { query, video, file } ou null si rien trouvé.
 */
async function findFreshHumorClip(config) {
  const usedIds = recentVideoIds(config);
  // On mélange l'ordre et on essaie jusqu'à 8 queries — large filet pour ne jamais rater une diffusion.
  const shuffled = [...HUMOR_QUERIES].sort(() => Math.random() - 0.5).slice(0, 8);
  for (const query of shuffled) {
    let video;
    try {
      video = await fetchHumorClip(config, query, usedIds);
    } catch (err) {
      console.log(`[humor]   ⚠ query "${query}" failed: ${err.message}`);
      continue;
    }
    if (!video) {
      console.log(`[humor]   - no fresh clip for "${query}"`);
      continue;
    }
    const file = pickBestVideoFile(video);
    if (!file) {
      console.log(`[humor]   - no usable file for video ${video.id}`);
      continue;
    }
    return { query, video, file };
  }
  return null;
}

/**
 * Génère un Reel humour : 1 clip Pexels + 1 texte viral + sting outro + musique.
 *
 * @param {object} config - config projet
 * @param {string} runDir - dossier de sortie
 * @returns {Promise<{ mediaPaths: string[], format: string, mediaType: string, brief: object, content: object }>}
 */
export async function generateHumorVideo(config, runDir) {
  if (!hasPexelsKey()) throw new Error("PEXELS_API_KEY required for humor video");
  if (!(await ffmpegAvailable())) throw new Error("ffmpeg required for humor video");

  // 1. Pick d'un clip frais
  const pick = await findFreshHumorClip(config);
  if (!pick) throw new Error("Aucun clip humour frais trouvé sur Pexels (toutes queries épuisées)");
  const { query, video, file } = pick;
  console.log(`[humor] clip = ${video.id} ("${query}", ${file.height || 0}p)`);

  // 2. Téléchargement + probe durée
  const rawPath = path.join(runDir, `humor-clip-${video.id}-raw.mp4`);
  console.log(`[humor]   downloading clip ${video.id}...`);
  await downloadFile(file.link, rawPath);

  const realDur = (await probeDurationSec(rawPath)) || video.duration || 0;
  if (realDur < 3.5) {
    throw new Error(`Clip ${video.id} trop court (${realDur.toFixed(1)}s) — minimum 3.5s requis`);
  }
  // Durée du segment clip : on prend toute la longueur dispo, plafonnée à CLIP_TARGET_SEC_MAX,
  // avec une petite marge de sécurité (-0.2s) pour éviter qu'ffmpeg coupe sur la dernière frame.
  const clipSegSec = Math.min(CLIP_TARGET_SEC_MAX, Math.max(CLIP_TARGET_SEC_MIN, realDur - 0.2));
  console.log(`[humor]   clip real duration = ${realDur.toFixed(2)}s → segment ${clipSegSec.toFixed(2)}s`);

  // 3. Claude génère LE texte humour (≤7 mots) + caption + hashtags
  const { data: content } = await claudeJSON(config, {
    system: `Tu écris UN SEUL TEXTE À L'ÉCRAN pour un Reel humour de Poils Précieux (marque française premium chiens & chats). Ce texte sera posé en GROS sur 1 clip vidéo d'un vrai animal capté en caméra. C'est LE seul mot que le viewer lira — il doit faire rire ou intriguer immédiatement.

RÈGLES DURES — JAMAIS enfreindre :
- MAX 7 mots. Compte. Recompte. Cible 4-6.
- ZÉRO émoji. ZÉRO point d'exclamation. ZÉRO MAJUSCULES qui crient.
- ZÉRO "POV :", ZÉRO "Quand…", ZÉRO formule TikTok cliché.
- FRANÇAIS parlé, naturel. Pas de marketing-speak.
- AUCUNE mention de Poils Précieux, du produit, de la marque ici. C'est de l'humour PUR. Le branding arrive en outro.
- AUCUNE invention de chiffre invérifiable concernant la marque ; les chiffres concrets ("47 jours", "trois pas", "11h32") doivent rester dans l'observation comique de l'animal, jamais en stat produit.

LES 5 LOIS DE VIRALITÉ (toutes doivent peser dans la phrase) :
1. SPÉCIFICITÉ BRUTALE — chiffres précis, durées exactes, détails concrets. "47 jours" > "longtemps". "11h32" > "le matin".
2. LOOP OUVERTE — donne envie de regarder la fin. Exemples : "Attendez la 4e seconde.", "Regardez sa tête.", "Il pense que personne ne voit."
3. TWIST — la fin retourne le début. Construction setup→retournement en une seule phrase si possible.
4. TON SMS À UN POTE — pas un copywriter, pas une marque. Le texte se lit comme une vanne tapée au clavier à un ami.
5. PHRASE À VOLER — finis sur une formule mémorable que quelqu'un pourrait reposter telle quelle.

EXEMPLES — BONS (✓) vs MAUVAIS (✗) :
✗ "POV : ton chien quand tu manges"       → cliché TikTok, vague, mou
✓ "Personne ne mange seul dans cette maison."  → spécifique, complice, phrase à voler

✗ "Mon chat est trop drôle 😂"             → mou, émoji, zéro info
✓ "Il dort dedans depuis 47 jours."        → spécifique chiffré, raconte une histoire

✗ "Les chiens et l'eau, c'est compliqué !" → générique, exclamation pub
✓ "Trois pas. C'est son record."           → numéro précis, twist sec

✗ "Quand ton chat veut sortir"             → cliché, mou
✓ "Sa stratégie : me culpabiliser jusqu'à la mort." → langage parlé, exagération drôle

✗ "Mon chien est trop intelligent"         → vide, brag
✓ "Il a compris le frigo avant moi."       → spécifique, twist`,
    user: `Le clip vidéo : query Pexels = "${query}". C'est un vrai animal capté en caméra. Imagine ce que l'animal fait visiblement (tête, geste, action) à partir de cette query et écris LE texte humour qui va le mieux avec.

Écris :
- overlayText : LE texte humour (max 7 mots, applique TOUTES les 5 lois ci-dessus)
- captionForPost : caption Reel FR 40-80 mots, ton complice "à un pote", sans émoji, sans "Lien en bio". Première phrase courte qui plante la scène. Termine par UNE seule question ouverte d'engagement (qui pousse au commentaire).
- captionHashtags : 6-8 hashtags FR (commence par #poilsprecieux, #poilsprecieuxfr, puis pertinents humour/chien/chat).
- altText : 1 phrase FR décrivant le clip.

Return JSON :
{
  "overlayText": "le texte humour (max 7 mots)",
  "captionForPost": "...",
  "captionHashtags": ["#poilsprecieux", "#poilsprecieuxfr", "..."],
  "altText": "..."
}`,
    maxTokens: 1000,
  });

  const overlayText = (content.overlayText || "").trim();
  if (!overlayText) throw new Error("Claude n'a pas renvoyé d'overlayText");
  // Garde-fou : si Claude dépasse les 7 mots, on coupe net.
  const words = overlayText.split(/\s+/);
  const finalText = words.length > 7 ? words.slice(0, 7).join(" ") : overlayText;
  if (words.length > 7) console.log(`[humor]   ⚠ overlayText tronqué de ${words.length} à 7 mots`);
  console.log(`[humor] overlayText = "${finalText}"`);

  // 4. Render overlay PNG transparent + carte outro
  const overlayPngPath = path.join(runDir, "humor-overlay.png");
  await renderHtmlToPng({
    ...buildHumorOverlay({ text: finalText }),
    outputPath: overlayPngPath,
  });

  const outroPngPath = path.join(runDir, "humor-outro.png");
  await renderHtmlToPng({
    ...buildHumorOutro({}),
    outputPath: outroPngPath,
  });

  // 5. Build segment clip + segment outro
  const clipSegPath = path.join(runDir, "humor-seg-clip.mp4");
  await buildSegmentWithOverlay({
    clipPath: rawPath,
    overlayPngPath,
    durationSec: clipSegSec,
    videoFadeOutSec: 0.4, // fondu vidéo→noir avant l'outro pour enchaîner en douceur
    outputPath: clipSegPath,
  });

  const outroSegPath = path.join(runDir, "humor-seg-outro.mp4");
  await buildStillSegment({
    imagePath: outroPngPath,
    durationSec: OUTRO_DURATION_SEC,
    fadeInSec: 0.4,
    fadeOutSec: 0.6,
    outputPath: outroSegPath,
  });

  // 6. Concat
  const noAudioPath = path.join(runDir, "humor_noaudio.mp4");
  await concatSegments({ segmentPaths: [clipSegPath, outroSegPath], outputPath: noAudioPath });
  console.log(`[humor] concatenated 2 segments (clip + outro)`);

  // 7. Musique upbeat avec fondu de sortie
  const music = pickMusicTrack({ mood: "upbeat", exclude: recentMusic(config) });
  if (music) console.log(`[humor] music: ${path.basename(music)} (mood=upbeat)`);
  else console.log(`[humor] ⚠ no music track found, humor reel will be silent`);

  const finalPath = path.join(runDir, `humor-${video.id}-${Date.now()}.mp4`);
  if (music) {
    const realFinalDur = (await probeDurationSec(noAudioPath)) || clipSegSec + OUTRO_DURATION_SEC;
    await overlayMusicOnVideo({
      videoPath: noAudioPath,
      audioPath: music,
      outputPath: finalPath,
      recodeVideo: false, // segments déjà 1080x1920 H.264 → copy stream vidéo, mux audio
      audioFadeOutSec: 1.4,
      videoDurationSec: realFinalDur,
    });
  } else {
    fs.copyFileSync(noAudioPath, finalPath);
  }
  console.log(`[humor] ✓ final MP4 ready: ${path.basename(finalPath)}`);

  return {
    mediaPaths: [finalPath],
    format: "reel",
    mediaType: "video",
    brief: {
      type: "humor",
      templateType: "humor",
      pexelsQuery: query,
      clipId: video.id,
      clipSourceUrl: video.url,
      clipDurationSec: realDur,
      overlayText: finalText,
      music: music ? path.basename(music) : null,
      content,
    },
    content,
  };
}
