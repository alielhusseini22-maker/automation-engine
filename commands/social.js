#!/usr/bin/env node
// Génère un post (image + caption + hashtags) selon le thème du jour.
// Optionnel : si BUFFER_ACCESS_TOKEN défini, schedule sur Buffer pour publication auto.
// Sinon : output un manifest JSON à publier manuellement.
//
// Usage:
//   node commands/social.js --project poils-precieux
//   node commands/social.js --project poils-precieux --dry-run
//   node commands/social.js --project poils-precieux --theme produit --format single

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { loadProject, loadBrandCharter, parseArgs, runDir } from "../core/config.js";
import { uploadImageBuffer } from "../core/shopify/client.js";
import { getDayTheme, selectHashtags } from "../core/social/themes.js";
import { generatePostContent, generatePostImage } from "../core/social/content.js";
import { hasBufferToken, listProfiles, schedulePost } from "../core/social/buffer.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project);
  const dir = runDir(config, "social");
  const brand = loadBrandCharter(config);

  const dayTheme = args.theme && args.format
    ? { dayName: "manual", theme: args.theme, format: args.format }
    : getDayTheme(config);

  console.log(`[social] project=${config.project.id} day=${dayTheme.dayName} theme=${dayTheme.theme} format=${dayTheme.format}`);

  // Step 1 — generate content (caption + image prompt + hashtags)
  console.log(`[social] Step 1/4 — generating content (Claude)`);
  const { content } = await generatePostContent(config, brand, dayTheme);
  console.log(`[social]   hook: ${content.hook}`);

  // Re-select hashtags using project pool if Claude returned generic ones
  if (!content.hashtags || content.hashtags.length < 4) {
    content.hashtags = selectHashtags(config, { category: content.category, count: 7 });
  }

  fs.writeFileSync(path.join(dir, "content.json"), JSON.stringify(content, null, 2), "utf8");

  // Step 2 — generate image
  console.log(`[social] Step 2/4 — generating image (GPT-Image-1)`);
  const { buffer: imgBuf, size } = await generatePostImage(config, content, { format: dayTheme.format });
  const imgPath = path.join(dir, `post-${dayTheme.theme}.png`);
  fs.writeFileSync(imgPath, imgBuf);
  console.log(`[social]   → ${imgPath} (${imgBuf.length} bytes, ${size})`);

  if (args.dryRun) {
    console.log(`[social] DRY RUN — skipping upload + schedule`);
    console.log(`\n[social] Caption preview:\n${content.caption}\n\n${content.hashtags.join(" ")}\n`);
    return;
  }

  // Step 3 — upload image (Shopify CDN as public URL host)
  console.log(`[social] Step 3/4 — uploading image to Shopify CDN`);
  const imageUrl = await uploadImageBuffer(config, {
    buffer: imgBuf,
    filename: `social-${new Date().toISOString().slice(0, 10)}-${dayTheme.theme}.png`,
  });
  console.log(`[social]   → ${imageUrl}`);

  // Step 4 — schedule via Buffer if token present
  const captionFull = `${content.caption}\n\n${content.hashtags.join(" ")}`;
  const manifest = {
    timestamp: new Date().toISOString(),
    theme: dayTheme.theme,
    format: dayTheme.format,
    content,
    imageUrl,
    imagePath: imgPath,
    captionFull,
    scheduledFor: scheduleTime(config).toISOString(),
    bufferStatus: "pending",
  };

  if (hasBufferToken(config)) {
    console.log(`[social] Step 4/4 — scheduling via Buffer`);
    try {
      const profiles = await listProfiles(config);
      const igProfile = profiles.find((p) => p.service === "instagram");
      const ttProfile = profiles.find((p) => p.service === "tiktok");
      const targets = [igProfile, ttProfile].filter(Boolean);
      const scheduledAt = scheduleTime(config);
      const posts = [];
      for (const p of targets) {
        const r = await schedulePost(config, {
          profileId: p.id,
          text: captionFull,
          imageUrl,
          scheduledAt,
        });
        posts.push({ profile: p.service, id: r?.updates?.[0]?.id || null });
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
    console.log(`[social] Step 4/4 — Buffer token absent (${config.buffer.envToken}) — manifest only`);
    manifest.bufferStatus = "manual";
  }

  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
  console.log(`\n[social] ✓ done — manifest: ${path.join(dir, "manifest.json")}`);
  console.log(`[social] → To post manually: image at ${imgPath}, caption in content.json`);
}

function scheduleTime(config) {
  const now = new Date();
  const [hh, mm] = (config.social?.publishTime || "18:00").split(":").map(Number);
  const target = new Date(now);
  target.setHours(hh, mm, 0, 0);
  if (target <= now) target.setDate(target.getDate() + 1);
  return target;
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
