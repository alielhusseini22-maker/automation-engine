#!/usr/bin/env node
// Génère + schedule un post social — version "designed posts" (no more bad videos).
//
// 1 vidéo/jour, cycle 4 jours (modulo CYCLE_START_ISO) :
//   - J1 (jour 0) → montage émotion/produit (générateur "montage")
//   - J2 (jour 1) → humour 1 clip réel + texte viral ≤7 mots ("humor")
//   - J3 (jour 2) → "L'avis de Madame", format signature mascotte ("madame")
//   - jour 3      → PAUSE (aucun post)
//
// Si --day-type fourni explicitement (j1|j2|j3|pause), on l'utilise. Sinon on calcule
// la position dans le cycle 4 jours depuis CYCLE_START_ISO.
//
// Usage :
//   node commands/social.js --project poils-precieux                    (auto cycle)
//   node commands/social.js --project poils-precieux --day-type j2
//   node commands/social.js --project poils-precieux --day-type j1 --dry-run

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { loadProject, loadBrandCharter, parseArgs, runDir } from "../core/config.js";
import { uploadImageBuffer } from "../core/shopify/client.js";
import { uploadVideo as cloudinaryUploadVideo, hasCloudinaryCreds } from "../core/storage/cloudinary.js";
import { selectHashtags } from "../core/social/themes.js";
import { hasBufferToken, listProfiles, schedulePost } from "../core/social/buffer.js";
import { generateDesignedPost } from "../core/social/designed-post.js";
import { closeBrowser } from "../core/design/render.js";
import { animateCarousel, ffmpegAvailable, probeAudio } from "../core/design/animate.js";
import { pickMusicTrack, moodForContext } from "../core/design/music.js";
import { recordSocialUsage, recentMusic } from "../core/social/history.js";

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

// Ancre du cycle 4 jours J1/J2/J3/PAUSE. Modifier cette date pour réaligner le calendrier.
const CYCLE_START_ISO = "2026-06-01"; // ce jour-là = J1 (jour 0 du cycle)
const CYCLE = ["j1", "j2", "j3", "pause"];

function dayTypeForDate(date = new Date()) {
  const startMs = Date.parse(`${CYCLE_START_ISO}T00:00:00Z`);
  const nowMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  const daysSinceStart = Math.floor((nowMs - startMs) / 86400000);
  const pos = ((daysSinceStart % 4) + 4) % 4; // gère le cas où date < CYCLE_START
  return CYCLE[pos];
}

// Mapping type de jour → template à exécuter.
const TEMPLATE_FOR_DAY = { j1: "montage", j2: "humor", j3: "madame" };

async function uploadAllSlides(config, mediaPaths) {
  const urls = [];
  for (const p of mediaPaths) {
    const buffer = fs.readFileSync(p);
    const filename = `social-${new Date().toISOString().slice(0, 10)}-${path.basename(p)}`;
    const url = await uploadImageBuffer(config, { buffer, filename, mimeType: "image/png" });
    urls.push(url);
  }
  return urls;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project);
  const dir = runDir(config, "social");

  const dayType = args.dayType || dayTypeForDate();
  const dayName = DAY_NAMES[new Date().getDay()];
  console.log(`[social] project=${config.project.id} cycle=${dayType} (${dayName})`);

  if (dayType === "pause") {
    console.log(`[social] PAUSE day — aucun post aujourd'hui (cycle 3+1). Sortie.`);
    return;
  }

  const templateType = TEMPLATE_FOR_DAY[dayType];
  if (!templateType) throw new Error(`Type de jour inconnu : ${dayType} (attendu j1|j2|j3|pause)`);

  // Step 1 — générer le designed post (template + content + rendu)
  console.log(`[social] Step 1/3 — generating ${templateType}`);
  const post = await generateDesignedPost(config, dir, { templateType, dayName });
  console.log(`[social]   ✓ ${post.mediaPaths.length} slide(s) rendered → ${post.format}`);

  // Save content metadata
  fs.writeFileSync(path.join(dir, "content.json"), JSON.stringify({
    dayType, dayName,
    format: post.format,
    brief: post.brief,
    content: post.content,
    slides: post.mediaPaths,
  }, null, 2), "utf8");

  // Caption + hashtags depuis content
  const captionRaw = post.content.captionForPost || "";
  const hashtags = (post.content.captionHashtags && post.content.captionHashtags.length >= 4)
    ? post.content.captionHashtags
    : selectHashtags(config, { count: 7 });

  // CTA différencié par plateforme construit plus tard, juste avant schedulePost.
  // Montage : le produit mis en avant est celui de la carte de fin (outroProduct).
  const productHandle = post.brief?.product?.handle || post.brief?.outroProduct?.handle || null;
  const productUrl = productHandle
    ? `https://${config.project.domain}/products/${productHandle}`
    : `https://${config.project.domain}`;

  function buildCaptionFor(service) {
    let cta;
    if (service === "facebook") {
      // FB : URL clickable dans la caption, sans émoji
      cta = `\n\n→ ${productUrl}`;
    } else {
      // Insta + TikTok : lien en bio, sans émoji
      cta = `\n\n→ Lien en bio.`;
    }
    return `${captionRaw}${cta}\n\n${hashtags.join(" ")}`;
  }

  if (args.dryRun) {
    console.log(`\n[social] DRY RUN — skipping upload + schedule.`);
    console.log(`Base caption:\n${captionRaw}\n\nHashtags:\n${hashtags.join(" ")}\n`);
    console.log(`Product URL : ${productUrl}\n`);
    console.log(`FB caption preview :\n${buildCaptionFor("facebook")}\n`);
    console.log(`Insta caption preview :\n${buildCaptionFor("instagram")}\n`);
    console.log(`Slides preview:`);
    for (const p of post.mediaPaths) console.log(`  ${p}`);
    await closeBrowser();
    return;
  }

  // Musique réellement utilisée (pour l'historique anti-répétition). Pexels-video la fixe déjà.
  let usedMusic = post.brief?.music || null;

  // Détection : post de type vidéo (pexels-video) vs post de type image (carousel/tip/product)
  const isVideoPost = post.mediaType === "video";

  // Buffer profiles + targets
  const profiles = hasBufferToken(config) ? await listProfiles(config) : [];
  const desiredPlatforms = config.social?.platforms || [];
  const targets = profiles.filter((p) => desiredPlatforms.includes(p.service));
  const tiktokTarget = targets.find((p) => p.service === "tiktok");
  console.log(`[social] Buffer profiles fetched : ${profiles.map(p => `${p.service}:${p.name || "?"}`).join(", ") || "(none)"}`);
  console.log(`[social] Final targets after filter : ${targets.map(p => p.service).join(", ") || "(none)"}`);
  console.log(`[social] Post is ${isVideoPost ? "VIDEO" : "IMAGE-based"} (${post.brief?.templateType || "unknown"})`);

  let imageUrls = [];
  let videoUrl = null;

  if (isVideoPost) {
    // Branche vidéo (pexels-video) : upload direct Cloudinary, toutes les plateformes reçoivent la vidéo
    console.log(`[social] Step 2/4 — uploading pexels-video to Cloudinary`);
    if (!hasCloudinaryCreds()) {
      throw new Error("CLOUDINARY_* env vars missing — video posts require Cloudinary.");
    }
    const cloudResult = await cloudinaryUploadVideo(post.mediaPaths[0]);
    videoUrl = cloudResult.url;
    console.log(`  → ${videoUrl} (${(cloudResult.bytes / 1024 / 1024).toFixed(1)} MB, ${cloudResult.duration}s)`);
  } else {
    // Branche image (carousel/tip/product) : upload slides Shopify CDN
    console.log(`[social] Step 2/4 — uploading ${post.mediaPaths.length} slide(s) to Shopify CDN`);
    imageUrls = await uploadAllSlides(config, post.mediaPaths);
    for (const u of imageUrls) console.log(`  → ${u}`);

    // TikTok obtient une vidéo animée (Ken Burns + musique) à partir du carrousel
    const ffmpegOk = await ffmpegAvailable();
    console.log(`[social] ffmpeg available: ${ffmpegOk}, tiktok target: ${!!tiktokTarget}`);
    if (tiktokTarget && ffmpegOk) {
      console.log(`[social] Step 3/4 — animating carousel into MP4 for TikTok`);
      try {
        // moodForContext n'utilise que templateType depuis le passage au cycle 4 jours.
        const mood = moodForContext({ templateType: post.brief.templateType });
        const audioPath = pickMusicTrack({ mood, exclude: recentMusic(config) });
        if (audioPath) usedMusic = path.basename(audioPath);
        console.log(`  music: ${audioPath ? path.basename(audioPath) : "(no track found, silent video)"}`);
        const animatedPath = path.join(dir, `animated-${Date.now()}.mp4`);
        await animateCarousel({
          slidePaths: post.mediaPaths,
          audioPath,
          outputPath: animatedPath,
          slideDurationSec: post.mediaPaths.length >= 5 ? 3 : 4,
        });
        console.log(`  ✓ animated MP4 generated`);
        const audioInfo = await probeAudio(animatedPath);
        console.log(`  audio probe: ${audioInfo.replace(/\n/g, " | ")}`);

        if (!hasCloudinaryCreds()) {
          throw new Error("CLOUDINARY_* env vars missing — TikTok video upload requires Cloudinary.");
        }
        console.log(`  uploading to Cloudinary...`);
        const cloudResult = await cloudinaryUploadVideo(animatedPath);
        videoUrl = cloudResult.url;
        console.log(`  → ${videoUrl} (${(cloudResult.bytes / 1024 / 1024).toFixed(1)} MB, ${cloudResult.duration}s)`);
      } catch (err) {
        console.log(`  ⚠ Animation failed: ${err.message}`);
        console.log(`  TikTok will receive the image carousel (sub-optimal but works)`);
      }
    } else if (tiktokTarget) {
      console.log(`[social] Step 3/4 — ffmpeg unavailable, TikTok gets image carousel (sub-optimal)`);
    }
  }

  // Step 4 — schedule via Buffer (asset différencié par plateforme)
  // Publication quasi-immédiate (cron du jour = post du jour). Buffer exige dueAt > now ;
  // on garde 10 min de marge pour absorber le temps de génération + traitement Buffer.
  const scheduledAt = new Date(Date.now() + 10 * 60 * 1000);
  const manifest = {
    timestamp: new Date().toISOString(),
    dayType,
    dayName,
    format: post.format,
    brief: post.brief,
    content: post.content,
    imageUrls,
    videoUrl,
    scheduledFor: scheduledAt.toISOString(),
    bufferStatus: "pending",
  };

  if (hasBufferToken(config)) {
    console.log(`[social] Step 4/4 — scheduling via Buffer for ${scheduledAt.toISOString()}`);
    try {
      if (targets.length === 0) {
        throw new Error(`No Buffer profile matches platforms ${desiredPlatforms.join(",")} (connected: ${profiles.map((p) => p.service).join(", ")})`);
      }
      const posts = [];
      // Loop résiliente : un échec n'arrête pas la suite.
      for (const p of targets) {
        // Logique :
        //   - Si isVideoPost (pexels-video) → toutes les plateformes reçoivent la vidéo
        //   - Sinon (carousel/tip/product) → TikTok reçoit la vidéo animée si dispo,
        //     Insta + FB reçoivent le carrousel images
        const isTikTok = p.service === "tiktok";
        const useVideo = isVideoPost || (isTikTok && videoUrl);
        try {
          const captionForThisPlatform = buildCaptionFor(p.service);
          const bp = await schedulePost(config, {
            profileId: p.id,
            service: p.service,
            format: useVideo ? "reel" : post.format,
            text: captionForThisPlatform,
            mediaUrls: useVideo ? [videoUrl] : imageUrls,
            mediaType: useVideo ? "video" : "image",
            scheduledAt,
          });
          posts.push({
            profile: p.service,
            type: useVideo ? "video" : "carousel",
            id: bp?.id || null,
            ok: true,
          });
          console.log(`[social]     ✓ ${p.service} (${useVideo ? "video" : "carousel"})`);
        } catch (err) {
          console.log(`[social]     ✗ ${p.service} FAILED: ${err.message}`);
          posts.push({
            profile: p.service,
            type: useVideo ? "video" : "carousel",
            ok: false,
            error: err.message,
          });
        }
      }
      manifest.bufferStatus = "scheduled";
      manifest.bufferPosts = posts;
      console.log(`[social]   ✓ scheduled : ${posts.map((p) => `${p.profile}(${p.type})`).join(", ")}`);
    } catch (err) {
      console.log(`[social]   ⚠ Buffer scheduling failed: ${err.message}`);
      manifest.bufferStatus = "failed";
      manifest.bufferError = err.message;
    }
  } else {
    console.log(`[social] Step 4/4 — no Buffer token, manifest only`);
    manifest.bufferStatus = "manual";
  }

  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\n[social] ✓ done — manifest: ${path.join(dir, "manifest.json")}`);

  // Mémoire anti-doublon (vidéo + produit + musique + concept) — commitée par le workflow CI.
  try {
    // Montage : enregistre TOUS les clips utilisés (sinon ils pourraient se répéter d'un run à l'autre).
    const montageClipIds = Array.isArray(post.brief?.clipIds) ? post.brief.clipIds : [];
    for (const cid of montageClipIds) {
      recordSocialUsage(config, { videoId: cid });
    }
    recordSocialUsage(config, {
      // pexels-video → brief.pexelsVideo.id ; humor → brief.clipId ; montage → déjà loopé ci-dessus
      videoId: post.brief?.pexelsVideo?.id || post.brief?.clipId || null,
      productHandle: post.brief?.product?.handle || post.brief?.outroProduct?.handle || null,
      music: usedMusic,
      // montage → brief.concept (emotion|astuce|relatable) ; designed posts → templateType
      concept: post.brief?.concept || post.brief?.templateType || null,
    });
    console.log(`[social] historique mis à jour (social-history.json)`);
  } catch (err) {
    console.log(`[social] ⚠ historique non enregistré : ${err.message}`);
  }

  await closeBrowser();
}

main().catch((err) => {
  console.error("FATAL:", err);
  closeBrowser().catch(() => {});
  process.exit(1);
});
