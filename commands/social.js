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

  // Step 2 — upload toutes les slides vers Shopify CDN
  console.log(`[social] Step 2/3 — uploading ${post.mediaPaths.length} slide(s) to Shopify CDN`);
  const mediaUrls = await uploadAllSlides(config, post.mediaPaths);
  for (const u of mediaUrls) console.log(`  → ${u}`);

  // Step 3 — schedule via Buffer
  const scheduledAt = scheduleTimeForSlot(slot);
  const manifest = {
    timestamp: new Date().toISOString(),
    slot,
    dayName,
    format: post.format,
    brief: post.brief,
    content: post.content,
    mediaUrls,
    scheduledFor: scheduledAt.toISOString(),
    bufferStatus: "pending",
  };

  if (hasBufferToken(config)) {
    console.log(`[social] Step 3/3 — scheduling via Buffer for ${scheduledAt.toISOString()}`);
    try {
      const profiles = await listProfiles(config);
      const desired = config.social?.platforms || [];
      const targets = profiles.filter((p) => desired.includes(p.service));
      if (targets.length === 0) {
        throw new Error(`No Buffer profile matches platforms ${desired.join(",")} (connected: ${profiles.map((p) => p.service).join(", ")})`);
      }
      const posts = [];
      for (const p of targets) {
        const bp = await schedulePost(config, {
          profileId: p.id,
          service: p.service,
          format: post.format,
          text: captionFull,
          mediaUrls,
          mediaType: post.mediaType,
          scheduledAt,
        });
        posts.push({ profile: p.service, id: bp?.id || null });
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
    console.log(`[social] Step 3/3 — no Buffer token, manifest only`);
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
