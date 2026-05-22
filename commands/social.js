#!/usr/bin/env node
// Génère + schedule un post social — version "designed posts" (no more bad videos).
//
// 2 slots/jour :
//   - morning (matin)  → contenu éducatif designed (hook carousel ou tip card)
//   - evening (soir)   → product highlight designed (vraie photo produit + CTA)
//
// Si --slot fourni explicitement, on l'utilise. Sinon on déduit de l'heure courante.
//
// Usage :
//   node commands/social.js --project poils-precieux              (auto slot selon heure)
//   node commands/social.js --project poils-precieux --slot evening
//   node commands/social.js --project poils-precieux --slot morning --dry-run

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

const DAY_NAMES = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function detectSlot(date = new Date()) {
  const h = date.getHours();
  if (h < 14) return "morning";
  return "evening";
}

function scheduleTimeForSlot(slot, baseDate = new Date()) {
  const target = new Date(baseDate);
  if (slot === "morning") {
    target.setHours(10, 0, 0, 0);
  } else {
    target.setHours(19, 0, 0, 0);
  }
  if (target <= baseDate) target.setDate(target.getDate() + 1);
  return target;
}

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

  const slot = args.slot || detectSlot();
  const dayName = DAY_NAMES[new Date().getDay()];
  console.log(`[social] project=${config.project.id} slot=${slot} day=${dayName}`);

  // Step 1 — générer le designed post (template + content + rendu PNG)
  console.log(`[social] Step 1/3 — generating designed post`);
  const post = await generateDesignedPost(config, dir, { slot, dayName });
  console.log(`[social]   ✓ ${post.mediaPaths.length} slide(s) rendered → ${post.format}`);

  // Save content metadata
  fs.writeFileSync(path.join(dir, "content.json"), JSON.stringify({
    slot, dayName,
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
  const productHandle = post.brief?.product?.handle || null;
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

  // Step 2 — upload toutes les slides PNG vers Shopify CDN (pour Insta/FB carousel)
  console.log(`[social] Step 2/4 — uploading ${post.mediaPaths.length} slide(s) to Shopify CDN`);
  const imageUrls = await uploadAllSlides(config, post.mediaPaths);
  for (const u of imageUrls) console.log(`  → ${u}`);

  // Step 3 — animer en vidéo MP4 pour TikTok (Ken Burns + musique)
  // Seulement si TikTok est dans les targets ET ffmpeg disponible
  let videoUrl = null;
  const profiles = hasBufferToken(config) ? await listProfiles(config) : [];
  const desiredPlatforms = config.social?.platforms || [];
  const targets = profiles.filter((p) => desiredPlatforms.includes(p.service));
  const tiktokTarget = targets.find((p) => p.service === "tiktok");
  console.log(`[social] Buffer profiles fetched : ${profiles.map(p => `${p.service}:${p.name || "?"}`).join(", ") || "(none)"}`);
  console.log(`[social] Desired platforms (config) : ${desiredPlatforms.join(", ")}`);
  console.log(`[social] Final targets after filter : ${targets.map(p => p.service).join(", ") || "(none)"}`);

  const ffmpegOk = await ffmpegAvailable();
  console.log(`[social] ffmpeg available: ${ffmpegOk}, tiktok target: ${!!tiktokTarget}`);
  if (tiktokTarget && ffmpegOk) {
    console.log(`[social] Step 3/4 — animating carousel into MP4 for TikTok`);
    try {
      const mood = moodForContext({ slot, templateType: post.brief.templateType });
      const audioPath = pickMusicTrack({ mood });
      console.log(`  music: ${audioPath ? path.basename(audioPath) : "(no track found, silent video)"}`);
      const animatedPath = path.join(dir, `animated-${Date.now()}.mp4`);
      await animateCarousel({
        slidePaths: post.mediaPaths,
        audioPath,
        outputPath: animatedPath,
        slideDurationSec: post.mediaPaths.length >= 5 ? 3 : 4, // carousel 5 slides → 15s, single → 4s
      });
      console.log(`  ✓ animated MP4 generated`);
      // Diagnostic : vérifier que l'audio est bien dans le MP4
      const audioInfo = await probeAudio(animatedPath);
      console.log(`  audio probe: ${audioInfo.replace(/\n/g, " | ")}`);

      if (!hasCloudinaryCreds()) {
        throw new Error("CLOUDINARY_* env vars missing — TikTok video upload requires Cloudinary (Shopify Files refuses vertical Reels).");
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

  // Step 4 — schedule via Buffer (asset différencié par plateforme)
  const scheduledAt = scheduleTimeForSlot(slot);
  const manifest = {
    timestamp: new Date().toISOString(),
    slot,
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
      // Loop résiliente : on essaie chaque plateforme indépendamment
      // pour qu'un échec sur l'une ne bloque pas les autres + log précis.
      for (const p of targets) {
        const isTikTok = p.service === "tiktok";
        const useVideo = isTikTok && videoUrl;
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
  await closeBrowser();
}

main().catch((err) => {
  console.error("FATAL:", err);
  closeBrowser().catch(() => {});
  process.exit(1);
});
