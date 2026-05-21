// Orchestrator vidéo : Replicate (Luma Ray Flash 2) → fallback Pexels.
// Renvoie { mediaPath, mediaType: "video", brief, source }.

import path from "node:path";
import { generateVideo, hasReplicateToken } from "./replicate.js";
import { pickVideoPrompt } from "./prompts.js";
import { searchVideos, pickFreshVideo, markUsed, pickBestVideoFile, downloadFile, queryForTheme, hasPexelsKey } from "../social/pexels.js";

/**
 * Génère une vidéo IA pour un theme + species donné.
 * @returns {{ mediaPath, mediaType, brief, source }}
 */
export async function generateThemedReel(config, runDir, { theme, species = null, fallbackOk = true }) {
  // 1. Essai Replicate (modèle vidéo IA) — seulement si activé dans config + token présent.
  // Désactivé par défaut : qualité 2026 insuffisante. Réactiver via config.aiVideo.enabled = true.
  const aiVideoEnabled = config.aiVideo?.enabled === true;
  if (aiVideoEnabled && hasReplicateToken()) {
    try {
      const promptObj = pickVideoPrompt(theme, species);
      console.log(`[video] generating Reel via Replicate (${promptObj.title}, ${promptObj.duration}s)...`);
      const outputPath = path.join(runDir, `ai-reel-${Date.now()}.mp4`);
      const result = await generateVideo({
        prompt: promptObj.prompt,
        aspectRatio: "9:16",
        duration: promptObj.duration,
        outputPath,
      });
      console.log(`[video]   ✓ ${result.path} (${(result.bytes / 1024 / 1024).toFixed(1)} MB, ${result.elapsedSec}s)`);
      return {
        mediaPath: result.path,
        mediaType: "video",
        source: "ai-video-replicate",
        brief: {
          type: "ai-video",
          scenario: promptObj.title,
          model: result.model,
          species: promptObj.species,
          mediaType: "video",
        },
      };
    } catch (err) {
      console.log(`[video]   ⚠ Replicate failed: ${err.message}`);
      if (!fallbackOk) throw err;
    }
  } else if (!aiVideoEnabled) {
    console.log(`[video]   AI video disabled in config — using Pexels stock directly`);
  } else {
    console.log(`[video]   (no REPLICATE_API_TOKEN, falling back to Pexels)`);
  }

  // 2. Fallback Pexels
  if (hasPexelsKey() && fallbackOk) {
    try {
      const query = queryForTheme(theme, species);
      console.log(`[video]   fallback: Pexels query="${query}"`);
      const videos = await searchVideos(query, { perPage: 20, orientation: "portrait" });
      const video = pickFreshVideo(config, videos);
      if (!video) return null;
      const file = pickBestVideoFile(video);
      if (!file) return null;
      const destPath = path.join(runDir, `pexels-${video.id}.mp4`);
      await downloadFile(file.link, destPath);
      markUsed(config, "video", video.id);
      return {
        mediaPath: destPath,
        mediaType: "video",
        source: "pexels-fallback",
        brief: {
          type: "pexels",
          query,
          description: video.url,
          photographer: video.user?.name,
          mediaType: "video",
        },
      };
    } catch (err) {
      console.log(`[video]   ⚠ Pexels failed: ${err.message}`);
    }
  }

  return null;
}
