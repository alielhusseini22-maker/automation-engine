// Convertit une suite de slides PNG en une vidéo MP4 9:16 avec Ken Burns + musique.
// Utilise FFmpeg (préinstallé sur ubuntu-latest GH Actions, à installer en local sur Windows).
//
// Output : MP4 H.264 1080×1920, 25 fps, AAC audio, prêt pour TikTok/Reels.

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

/**
 * Anime un carrousel PNG → MP4 9:16 avec effet Ken Burns et musique optionnelle.
 *
 * @param {object} args
 * @param {string[]} args.slidePaths - chemins absolus des slides PNG (carré 1080x1080 idéalement)
 * @param {string|null} args.audioPath - chemin musique MP3/M4A (optionnel)
 * @param {string} args.outputPath - chemin sortie MP4
 * @param {number} [args.slideDurationSec=4] - durée par slide
 * @param {1080|720} [args.targetWidth=1080]
 * @param {1920|1280} [args.targetHeight=1920]
 * @returns {Promise<string>} outputPath
 */
export async function animateCarousel({
  slidePaths,
  audioPath = null,
  outputPath,
  slideDurationSec = 4,
  targetWidth = 1080,
  targetHeight = 1920,
}) {
  if (!slidePaths?.length) throw new Error("animateCarousel: no slides provided");
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }

  const slideCount = slidePaths.length;
  const fps = 25;
  const frames = slideDurationSec * fps;
  const totalDurationSec = slideCount * slideDurationSec;

  // Inputs : chaque PNG en boucle pendant slideDurationSec
  const args = [];
  for (const p of slidePaths) {
    args.push("-loop", "1", "-t", String(slideDurationSec), "-i", p);
  }
  if (audioPath) {
    args.push("-i", audioPath);
  }

  // Filter complex : pour chaque slide, scale+pad au format vertical 9:16 puis zoompan (Ken Burns).
  // L'image carrée 1080x1080 doit être centrée verticalement sur fond beige (#F4EDE3) pour préserver
  // la composition du design.
  const PAD_COLOR = "0xF4EDE3"; // beige Poils Précieux
  const parts = [];
  for (let i = 0; i < slideCount; i++) {
    // 1. scale au format vertical, pad avec fond beige si carré
    // 2. zoompan : zoom de 1.0 à 1.08 sur la durée (très subtil pro film look)
    parts.push(
      `[${i}:v]` +
        `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=${PAD_COLOR},` +
        `zoompan=z='if(eq(on,0),1.0,min(zoom+0.0008,1.08))':d=${frames}:s=${targetWidth}x${targetHeight}:fps=${fps}` +
        `[v${i}]`
    );
  }
  // Concat
  parts.push(
    `${Array.from({ length: slideCount }, (_, i) => `[v${i}]`).join("")}concat=n=${slideCount}:v=1:a=0[outv]`
  );

  args.push("-filter_complex", parts.join(";"));
  args.push("-map", "[outv]");

  if (audioPath) {
    // Map audio : index = slideCount (inputs vidéo viennent avant audio)
    // Loop + trim à la durée vidéo + fade in/out
    args.push(
      "-map", `${slideCount}:a`,
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "-af", `aloop=loop=-1:size=2e+09,atrim=duration=${totalDurationSec},afade=t=in:st=0:d=0.5,afade=t=out:st=${(totalDurationSec - 0.5).toFixed(2)}:d=0.5`
    );
  }

  args.push(
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", "fast",
    "-crf", "20",
    "-r", String(fps),
    "-movflags", "+faststart",
    "-y",
    outputPath
  );

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", (err) => reject(new Error(`ffmpeg spawn failed: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) {
        resolve(outputPath);
      } else {
        reject(new Error(`ffmpeg exited ${code}. Last stderr:\n${stderr.slice(-1500)}`));
      }
    });
  });
}

/**
 * Vérifie qu'ffmpeg est disponible dans le PATH.
 */
export async function ffmpegAvailable() {
  return new Promise((resolve) => {
    const proc = spawn("ffmpeg", ["-version"], { windowsHide: true });
    proc.on("error", () => resolve(false));
    proc.on("close", (code) => resolve(code === 0));
  });
}
