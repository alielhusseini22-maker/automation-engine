#!/usr/bin/env node
// Génère + (optionnel) programme un post social.
//
// Stratégie par jour selon config.social.weeklySchedule[<day>].source :
//   - "queue"           → pioche un item dans content-queue/
//   - "shopify_product" → cherche un produit Shopify (nouveauté ou cas d'usage)
//   - "ai_or_queue"     → essaie queue d'abord, sinon génère image IA
//   - "pexels"          → fallback stock si queue/produit absent
//   - "skip"            → pas de post
//
// Le moteur écrit la caption AUTOUR du média (jamais d'histoire fictive).
//
// Usage :
//   node commands/social.js --project poils-precieux
//   node commands/social.js --project poils-precieux --dry-run
//   node commands/social.js --project poils-precieux --theme produit (force)

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { loadProject, loadBrandCharter, parseArgs, runDir } from "../core/config.js";
import { uploadImageBuffer } from "../core/shopify/client.js";
import { getDayTheme, selectHashtags } from "../core/social/themes.js";
import { captionFromBrief } from "../core/social/content.js";
import { hasBufferToken, listProfiles, schedulePost } from "../core/social/buffer.js";
import { listQueueItems, pickItemForDay, markConsumed } from "../core/social/queue.js";
import { hasPexelsKey, searchVideos, searchPhotos, pickFreshVideo, pickFreshPhoto, markUsed, pickBestVideoFile, downloadFile, queryForTheme } from "../core/social/pexels.js";
import { findNewProductToPromote, productPromoBrief } from "../core/social/promo.js";
import { generateImage } from "../core/images/openai.js";
import { generateThemedReel } from "../core/video/pipeline.js";

async function selectMediaAndBrief(config, dayTheme, dir, args) {
  const source = dayTheme.source || "ai_or_queue";
  const fallback = dayTheme.fallback || "skip";

  // 1. Queue d'abord pour les sources "queue" ou "ai_or_queue"
  if (source === "queue" || source === "ai_or_queue") {
    const item = pickItemForDay(config, { dayName: dayTheme.dayName, theme: dayTheme.theme });
    if (item) {
      console.log(`[social]   ▶ source: queue item "${item.id}"`);
      return {
        sourceType: "queue",
        mediaPath: item.mediaPath,
        mediaType: item.mediaType,
        item,
        brief: { type: "queue", meta: item.meta, mediaType: item.mediaType },
      };
    }
  }

  // 2. Shopify product (promo nouveauté / cas d'usage)
  if (source === "shopify_product") {
    const product = await findNewProductToPromote(config);
    if (product) {
      console.log(`[social]   ▶ source: shopify product "${product.title}"`);
      const briefBase = productPromoBrief(product);
      const briefType = dayTheme.theme === "produit" ? "shopify-product-promo" : "shopify-product-usage";
      // Pour cas d'usage, ajoute un angle factuel automatique
      const useCaseAngle = briefType === "shopify-product-usage"
        ? `Explique en quoi le ${product.productType || "produit"} est utile au quotidien.`
        : undefined;
      return {
        sourceType: "shopify",
        mediaUrl: briefBase.imageUrl,
        mediaType: "image",
        product,
        brief: { ...briefBase, type: briefType, useCaseAngle, mediaType: "image" },
      };
    }
    console.log(`[social]   ▶ source: shopify_product (none found, fallback ${fallback})`);
  }

  // 3. Fallback chain
  if (fallback === "pexels" && hasPexelsKey()) {
    return await fetchFromPexels(config, dayTheme, dir);
  }
  if (fallback === "ai_image") {
    return await generateAIImage(config, dayTheme, dir);
  }
  if (fallback === "skip") {
    return null;
  }
  return null;
}

async function fetchFromPexels(config, dayTheme, dir) {
  const isVideo = dayTheme.format === "reel";

  // Pour les Reels : on tente d'abord la vraie génération IA cinématographique (Luma Ray Flash 2)
  if (isVideo) {
    const reel = await generateThemedReel(config, dir, { theme: dayTheme.theme, species: null, fallbackOk: true });
    if (reel) return { sourceType: reel.source, ...reel };
    // Si le pipeline retourne null, on tombe sur le Pexels classique en image dessous
  }

  const query = queryForTheme(dayTheme.theme);
  console.log(`[social]   ▶ source: pexels (${isVideo ? "video" : "photo"}) query="${query}"`);

  if (isVideo) {
    const videos = await searchVideos(query, { perPage: 20, orientation: "portrait" });
    const video = pickFreshVideo(config, videos);
    if (!video) return null;
    const file = pickBestVideoFile(video);
    if (!file) return null;
    const destPath = path.join(dir, `pexels-${video.id}.mp4`);
    await downloadFile(file.link, destPath);
    markUsed(config, "video", video.id);
    return {
      sourceType: "pexels",
      mediaPath: destPath,
      mediaType: "video",
      brief: {
        type: "pexels",
        query,
        description: video.url,
        photographer: video.user?.name,
        mediaType: "video",
      },
    };
  } else {
    const photos = await searchPhotos(query, { perPage: 20 });
    const photo = pickFreshPhoto(config, photos);
    if (!photo) return null;
    const url = photo.src?.large || photo.src?.medium;
    const destPath = path.join(dir, `pexels-${photo.id}.jpg`);
    await downloadFile(url, destPath);
    markUsed(config, "photo", photo.id);
    return {
      sourceType: "pexels",
      mediaPath: destPath,
      mediaType: "image",
      brief: {
        type: "pexels",
        query,
        description: photo.alt || photo.url,
        photographer: photo.photographer,
        mediaType: "image",
      },
    };
  }
}

async function generateAIImage(config, dayTheme, dir) {
  console.log(`[social]   ▶ source: AI image (last-resort fallback)`);
  const prompt = `Premium editorial photography for a French pet brand named Poils Précieux. Style: Scandinavian minimalism, warm beige tones, single subject, no text overlay. Theme: ${dayTheme.theme}.`;
  const buf = await generateImage(config, { prompt, quality: "high", size: "1024x1024", background: "opaque" });
  const destPath = path.join(dir, `ai-${dayTheme.theme}.png`);
  fs.writeFileSync(destPath, buf);
  return {
    sourceType: "ai-image",
    mediaPath: destPath,
    mediaType: "image",
    brief: { type: "queue", meta: { context: `Generated image for ${dayTheme.theme}` }, mediaType: "image" },
  };
}

async function publicizeMedia(config, source, dir) {
  if (source.mediaUrl) return source.mediaUrl;
  const buffer = fs.readFileSync(source.mediaPath);
  const ext = path.extname(source.mediaPath).slice(1);
  const mime = ext === "mp4" ? "video/mp4" : ext === "png" ? "image/png" : "image/jpeg";
  const filename = `social-${new Date().toISOString().slice(0, 10)}-${path.basename(source.mediaPath)}`;
  return await uploadImageBuffer(config, { buffer, filename, mimeType: mime });
}

function scheduleTime(config) {
  const now = new Date();
  const [hh, mm] = (config.social?.publishTime || "18:00").split(":").map(Number);
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project);
  const dir = runDir(config, "social");
  const brand = loadBrandCharter(config);

  // En mode manuel : default fallback = "pexels" (qui tente Replicate AI video en premier pour les Reels).
  // Overridable via --source xxx / --fallback xxx
  const dayTheme = args.theme && args.format
    ? {
        dayName: "manual",
        theme: args.theme,
        format: args.format,
        source: args.source || "queue",
        fallback: args.fallback || "pexels",
      }
    : getDayTheme(config);

  console.log(`[social] project=${config.project.id} day=${dayTheme.dayName} theme=${dayTheme.theme} format=${dayTheme.format}`);

  // Step 1 — choisir la source du media
  console.log(`[social] Step 1/4 — selecting media source`);
  const source = await selectMediaAndBrief(config, dayTheme, dir, args);
  if (!source) {
    console.log(`[social] No source available today (queue empty, no shopify match, no fallback). Skipping post.`);
    fs.writeFileSync(path.join(dir, "skip.json"), JSON.stringify({ reason: "no-source", dayTheme }, null, 2));
    return;
  }

  // Step 2 — générer la caption ADAPTÉE au media
  console.log(`[social] Step 2/4 — generating caption (Claude, no fiction)`);
  const content = await captionFromBrief(config, brand, { dayTheme, brief: source.brief });
  console.log(`[social]   hook: ${content.hook}`);
  fs.writeFileSync(path.join(dir, "content.json"), JSON.stringify({ source: source.brief, content }, null, 2), "utf8");

  if (args.dryRun) {
    console.log(`[social] DRY RUN — skipping publish.\n${content.caption}\n\n${content.hashtags.join(" ")}\n`);
    return;
  }

  // Step 3 — rendre l'URL publique
  console.log(`[social] Step 3/4 — uploading media (or reusing existing URL)`);
  const mediaUrl = await publicizeMedia(config, source, dir);
  console.log(`[social]   → ${mediaUrl}`);

  // Step 4 — schedule sur Buffer
  const captionFull = `${content.caption}\n\n${content.hashtags.join(" ")}`;
  const manifest = {
    timestamp: new Date().toISOString(),
    sourceType: source.sourceType,
    dayTheme,
    content,
    mediaUrl,
    scheduledFor: scheduleTime(config).toISOString(),
    bufferStatus: "pending",
  };

  if (hasBufferToken(config)) {
    console.log(`[social] Step 4/4 — scheduling via Buffer`);
    try {
      const profiles = await listProfiles(config);
      const desired = config.social?.platforms || [];
      const targets = profiles.filter((p) => desired.includes(p.service));
      if (targets.length === 0) {
        throw new Error(`No Buffer profile matches platforms ${desired.join(",")} (connected: ${profiles.map((p) => p.service).join(", ")})`);
      }
      const scheduledAt = scheduleTime(config);
      const posts = [];
      for (const p of targets) {
        const post = await schedulePost(config, {
          profileId: p.id,
          service: p.service,
          format: dayTheme.format,
          text: captionFull,
          imageUrl: mediaUrl,
          scheduledAt,
        });
        posts.push({ profile: p.service, id: post?.id || null });
      }
      manifest.bufferStatus = "scheduled";
      manifest.bufferPosts = posts;
      console.log(`[social]   ✓ scheduled on ${posts.map((p) => p.profile).join(", ")}`);
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

  // Consume queue item if used
  if (source.sourceType === "queue" && source.item && manifest.bufferStatus === "scheduled" && !args.dryRun) {
    const newPath = markConsumed(config, source.item);
    console.log(`[social]   ✓ queue item moved to ${newPath}`);
  }

  console.log(`\n[social] ✓ done — manifest: ${path.join(dir, "manifest.json")}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
