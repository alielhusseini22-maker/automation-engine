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
import { buildVideoOutro } from "../design/templates/video-outro.js";
import { shopifyQuery } from "../shopify/client.js";
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
import { recentVideoIds, recentConcepts, recentMusic, recentProducts } from "./history.js";

const SEGMENT_DURATION_SEC = 3.8;
const OUTRO_DURATION_SEC = 3.6;

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

function stripHtml(html) {
  return String(html || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/**
 * Récupère les produits candidats pour la carte produit de fin (outro).
 * Produits actifs avec image, en écartant ceux featurés récemment (mémoire anti-doublon).
 * Retourne une liste compacte (Claude choisira celui le + en lien avec le concept).
 *
 * @returns {Promise<Array<{id,handle,title,productType,shortDescription,price,imageUrl}>>}
 */
async function fetchOutroProductCandidates(config) {
  const data = await shopifyQuery(
    config,
    `query {
      products(first: 40, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id title handle productType descriptionHtml
          featuredMedia { preview { image { url } } }
          priceRangeV2 { minVariantPrice { amount } }
        }
      }
    }`
  );
  const withImg = (data?.products?.nodes || []).filter((p) => p.featuredMedia?.preview?.image?.url);
  if (!withImg.length) return [];
  // Anti-répétition : écarte les produits récents, mais garde un pool suffisant pour le choix.
  const recent = recentProducts(config);
  const fresh = withImg.filter((p) => !recent.has(p.handle));
  const pool = fresh.length >= 6 ? fresh : withImg;
  return pool.map((p) => ({
    id: p.id,
    handle: p.handle,
    title: p.title,
    productType: p.productType || "",
    shortDescription: stripHtml(p.descriptionHtml).slice(0, 160),
    price: parseFloat(p.priceRangeV2?.minVariantPrice?.amount || "0").toFixed(2).replace(".", ","),
    imageUrl: p.featuredMedia.preview.image.url,
  }));
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

  // 3. Produits candidats pour la carte produit de fin (best-effort : n'empêche pas la vidéo si Shopify échoue)
  let productCandidates = [];
  try {
    productCandidates = await fetchOutroProductCandidates(config);
    console.log(`[montage] ${productCandidates.length} produits candidats pour l'outro`);
  } catch (err) {
    console.log(`[montage]   ⚠ fetch produits échoué (${err.message}) — carte produit ignorée`);
  }
  const hasProducts = productCandidates.length > 0;

  const productPromptBlock = hasProducts
    ? `

La vidéo se termine par une CARTE PRODUIT (fin "pub douce" : photo + nom + prix). Choisis LE produit ci-dessous le plus en lien avec le concept et les plans, puis écris une courte accroche de transition vers ce produit.
Produits disponibles (choisis-en UN seul) :
${productCandidates.map((p) => `- handle:${p.handle} | ${p.title} | ${p.productType || "—"} | ${p.shortDescription}`).join("\n")}`
    : "";

  const productJsonFields = hasProducts
    ? `,
  "productHandle": "le handle EXACT d'UN produit de la liste, le plus en lien avec la vidéo",
  "outroTagline": "accroche de transition FR, 4-8 mots, sans émoji, HONNÊTE (aucune promesse ni stat inventée), qui relie le moment de la vidéo au produit"`
    : "";

  // 4. Claude génère les textes à l'écran (1 ligne + sub optionnel par clip) + la caption + le choix produit
  const { data: content } = await claudeJSON(config, {
    system: `Tu écris les TEXTES À L'ÉCRAN et la caption d'une vidéo sociale (Reel/TikTok) pour Poils Précieux, marque française premium pour chiens & chats. La vidéo est un MONTAGE de ${clips.length} plans stock réels enchaînés, avec un texte court posé sur chaque plan.

RÈGLES ABSOLUES — JAMAIS enfreindre :
- ZÉRO émoji nulle part (ni dans les overlays, ni dans la caption, ni dans l'accroche produit). Pas de pictogramme décoratif. C'est ce qui fait premium.
- Les textes à l'écran sont COURTS : 5 à 7 mots MAXIMUM par ligne (ils s'affichent en gros sur la vidéo). Le sous-titre est optionnel, encore plus court.
- Caption : pas de "Lien en bio" ni URL (le système ajoute le CTA par plateforme). Pas de hashtags inline (séparés dans captionHashtags).
- Ne PAS inventer de client, témoignage, ni nom d'animal. Observation universelle uniquement.
- HONNÊTETÉ : aucune promesse, certification, origine, pourcentage ou statistique inventés nulle part.
- FRANÇAIS.`,
    user: `Concept de la vidéo : ${chosen.label}.
Style attendu des textes à l'écran : ${chosen.textStyle}

Les ${clips.length} plans (dans l'ordre) montrent :
${clips.map((c, i) => `${i + 1}. ${c.query}`).join("\n")}${productPromptBlock}

Écris, dans cet ordre :
- overlays : un tableau de ${clips.length} objets { "line": "...", "sub": "..." | null } — un par plan. "line" = 5-7 mots max, sans émoji, qui colle au plan ET au concept. "sub" = sous-titre court optionnel (ou null). L'ensemble doit se lire comme une mini-narration cohérente sur ${clips.length} plans.
- captionForPost : caption FR 60-100 mots, sans émoji, sans "Lien en bio". Première phrase courte qui plante le moment. Développe l'observation. Termine par UNE seule accroche d'engagement (question ouverte).
- captionHashtags : 6-8 hashtags (commence par #poilsprecieux et #poilsprecieuxfr, puis FR pet pertinents au concept).
- altText : 1 phrase FR décrivant la vidéo.${hasProducts ? "\n- productHandle + outroTagline : choisis le produit le plus pertinent et écris l'accroche de transition (honnête, sans émoji)." : ""}

Return JSON :
{
  "overlays": [ { "line": "...", "sub": "..." }, ... ${clips.length} éléments ],
  "captionForPost": "...",
  "captionHashtags": ["#poilsprecieux", "#poilsprecieuxfr", "..."],
  "altText": "..."${productJsonFields}
}`,
    maxTokens: 1800,
  });

  const overlays = Array.isArray(content.overlays) ? content.overlays : [];
  if (overlays.length < clips.length) {
    throw new Error(`Claude returned ${overlays.length} overlays for ${clips.length} clips`);
  }

  // 5. Résout le produit de fin choisi par Claude (fallback : 1er candidat si handle inconnu)
  let outroProduct = null;
  let outroTagline = "";
  if (hasProducts) {
    const wanted = typeof content.productHandle === "string" ? content.productHandle.trim() : "";
    outroProduct = productCandidates.find((p) => p.handle === wanted) || productCandidates[0];
    outroTagline = (typeof content.outroTagline === "string" ? content.outroTagline : "").trim();
    console.log(`[montage] outro produit = ${outroProduct.handle} ("${outroTagline}")`);
  }

  // 6. Render des overlays PNG transparents + build des segments clips
  const segmentPaths = [];
  for (let i = 0; i < clips.length; i++) {
    const ov = overlays[i] || {};
    const overlayPngPath = path.join(runDir, `montage-overlay-${i + 1}.png`);
    await renderHtmlToPng({
      ...buildVideoOverlay({ line: ov.line || "", sub: ov.sub || null, position: "lower" }),
      outputPath: overlayPngPath,
    });

    // Dernier clip : fondu vidéo vers le noir — court (0.4s) pour enchaîner vers la carte produit,
    // ou plus long (0.8s) pour finir la vidéo en douceur s'il n'y a pas de carte produit.
    const isLast = i === clips.length - 1;
    const videoFadeOutSec = isLast ? (outroProduct ? 0.4 : 0.8) : 0;

    const segPath = path.join(runDir, `montage-seg-${i + 1}.mp4`);
    console.log(`[montage]   segment ${i + 1}/${clips.length}: "${ov.line || ""}"`);
    await buildSegmentWithOverlay({
      clipPath: clips[i].rawPath,
      overlayPngPath,
      durationSec: SEGMENT_DURATION_SEC,
      videoFadeOutSec,
      outputPath: segPath,
    });
    segmentPaths.push(segPath);
  }

  // 7. Carte produit de fin (outro) : fondu d'entrée depuis le noir + fondu de sortie vers le noir
  if (outroProduct) {
    const outroPngPath = path.join(runDir, "montage-outro.png");
    await renderHtmlToPng({
      ...buildVideoOutro({
        productImageUrl: outroProduct.imageUrl,
        productName: outroProduct.title.replace(/\s*[—–]\s*.*$/s, "").trim(),
        tagline: outroTagline || "À découvrir sur notre boutique.",
        price: `${outroProduct.price}€`,
      }),
      outputPath: outroPngPath,
    });
    const outroSegPath = path.join(runDir, "montage-seg-outro.mp4");
    await buildStillSegment({
      imagePath: outroPngPath,
      durationSec: OUTRO_DURATION_SEC,
      fadeInSec: 0.5,
      fadeOutSec: 0.8,
      outputPath: outroSegPath,
    });
    segmentPaths.push(outroSegPath);
    console.log(`[montage]   + carte produit outro (${outroProduct.handle})`);
  }

  // 8. Concat des segments → vidéo sans audio
  const noAudioPath = path.join(runDir, "montage_noaudio.mp4");
  await concatSegments({ segmentPaths, outputPath: noAudioPath });
  console.log(`[montage] concatenated ${segmentPaths.length} segments`);

  // 9. Musique selon le mood du concept, AVEC fondu de sortie (corrige la coupure nette finale)
  const music = pickMusicTrack({ mood: chosen.musicMood, exclude: recentMusic(config) });
  if (music) console.log(`[montage] music: ${path.basename(music)} (mood=${chosen.musicMood})`);
  else console.log(`[montage] ⚠ no music track found, montage will be silent`);

  const finalPath = path.join(runDir, `montage-${chosen.key}-${Date.now()}.mp4`);
  if (music) {
    // Durée RÉELLE (les clips Pexels peuvent être plus courts que la durée nominale) pour caler le fondu musical.
    const realDur =
      (await probeDurationSec(noAudioPath)) ||
      clips.length * SEGMENT_DURATION_SEC + (outroProduct ? OUTRO_DURATION_SEC : 0);
    await overlayMusicOnVideo({
      videoPath: noAudioPath,
      audioPath: music,
      outputPath: finalPath,
      recodeVideo: false, // segments déjà en 1080x1920 H.264 → copy stream vidéo, mux audio
      audioFadeOutSec: 1.6,
      videoDurationSec: realDur,
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
      outroProduct: outroProduct
        ? { handle: outroProduct.handle, title: outroProduct.title, price: outroProduct.price }
        : null,
      outroTagline: outroProduct ? outroTagline : null,
      content,
    },
    content,
  };
}
