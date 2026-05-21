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
import { selectHashtags } from "../core/social/themes.js";
import { hasBufferToken, listProfiles, schedulePost } from "../core/social/buffer.js";
import { generateDesignedPost } from "../core/social/designed-post.js";
import { closeBrowser } from "../core/design/render.js";
import { animateCarousel, ffmpegAvailable } from "../core/design/animate.js";
import { pickMusicTrack, moodForContext } from "../core/design/music.js";
import path from "node:path";

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
  const captionFull = `${captionRaw}\n\n${hashtags.join(" ")}`;

  if (args.dryRun) {
    console.log(`\n[social] DRY RUN — skipping upload + schedule.`);
    console.log(`Caption:\n${captionRaw}\n\nHashtags:\n${hashtags.join(" ")}\n`);
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

  if (tiktokTarget && (await ffmpegAvailable())) {
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
      const buf = (await import("node:fs")).readFileSync(animatedPath);
      videoUrl = await uploadImageBuffer(config, {
        buffer: buf,
        filename: `social-tiktok-${path.basename(animatedPath)}`,
        mimeType: "video/mp4",
      });
      console.log(`  → ${videoUrl}`);
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
      for (const p of targets) {
        // Per-platform routing :
        //   - TikTok : vidéo MP4 si dispo + mode notification (tu pickes le son trending dans l'app)
        //   - Insta + FB : carrousel images, mode automatic (publication full auto)
        const isTikTok = p.service === "tiktok";
        const useVideo = isTikTok && videoUrl;
        const schedulingType = isTikTok ? "notification" : "automatic";
        const bp = await schedulePost(config, {
          profileId: p.id,
          service: p.service,
          format: useVideo ? "reel" : post.format,
          text: captionFull,
          mediaUrls: useVideo ? [videoUrl] : imageUrls,
          mediaType: useVideo ? "video" : "image",
          scheduledAt,
          schedulingType,
        });
        posts.push({
          profile: p.service,
          type: useVideo ? "video" : "carousel",
          mode: schedulingType,
          id: bp?.id || null,
        });
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
