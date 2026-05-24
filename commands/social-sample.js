#!/usr/bin/env node
// SAMPLE standalone — génère une vidéo MONTAGE multi-clips branded et l'upload sur Cloudinary.
//
// NE TOUCHE PAS Buffer. N'enregistre PAS l'historique (recordSocialUsage) : c'est un échantillon de
// validation, pas une publication. Sert à valider le rendu FFmpeg sur CI (ffmpeg indispo en local).
//
// Usage :
//   node commands/social-sample.js --project poils-precieux
//   node commands/social-sample.js --project poils-precieux --concept emotion
//   node commands/social-sample.js --project poils-precieux --concept astuce
//   node commands/social-sample.js --project poils-precieux --concept relatable

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { loadProject, parseArgs, runDir } from "../core/config.js";
import { generateMontageVideo } from "../core/social/montage.js";
import { uploadVideo, hasCloudinaryCreds } from "../core/storage/cloudinary.js";
import { closeBrowser } from "../core/design/render.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project);
  const dir = runDir(config, "social-sample");
  const concept = typeof args.concept === "string" ? args.concept : null;

  console.log(`[social-sample] project=${config.project.id} concept=${concept || "(auto)"}`);

  // 1. Générer le montage
  console.log(`[social-sample] Step 1/2 — generating montage video`);
  const post = await generateMontageVideo(config, dir, { concept });
  const finalPath = post.mediaPaths[0];
  console.log(`[social-sample]   ✓ montage ready: ${finalPath}`);

  // Sauvegarde brief + caption dans le runDir
  const captionRaw = post.content?.captionForPost || "";
  const hashtags = post.content?.captionHashtags || [];
  fs.writeFileSync(
    path.join(dir, "sample.json"),
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        concept: post.brief?.concept || concept,
        format: post.format,
        mediaType: post.mediaType,
        brief: post.brief,
        content: post.content,
        mediaPath: finalPath,
      },
      null,
      2
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(dir, "caption.txt"),
    `${captionRaw}\n\n${hashtags.join(" ")}\n`,
    "utf8"
  );
  console.log(`[social-sample]   brief → ${path.join(dir, "sample.json")}`);

  // 2. Upload Cloudinary (pas de Buffer, pas d'historique)
  if (!hasCloudinaryCreds()) {
    throw new Error("CLOUDINARY_* env vars missing — sample upload requires Cloudinary.");
  }
  console.log(`[social-sample] Step 2/2 — uploading sample to Cloudinary`);
  const cloudResult = await uploadVideo(finalPath, "poils-precieux/social-sample");
  console.log(`[social-sample]   (${(cloudResult.bytes / 1024 / 1024).toFixed(1)} MB, ${cloudResult.duration}s)`);

  // URL publique mise en évidence pour la validation
  console.log(`\nSAMPLE_VIDEO_URL: ${cloudResult.url}\n`);

  await closeBrowser();
}

main().catch((err) => {
  console.error("FATAL:", err);
  closeBrowser().catch(() => {});
  process.exit(1);
});
