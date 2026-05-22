// Convertit une suite de slides PNG en une vidéo MP4 9:16 avec Ken Burns + musique.
// Utilise FFmpeg (préinstallé sur ubuntu-latest GH Actions, à installer en local sur Windows).
//
// Output : MP4 H.264 1080×1920, 25 fps, AAC audio, prêt pour TikTok/Reels.

import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs";
import path from "node:path";

const execFileP = promisify(execFile);

/**
 * Inspect un MP4 et retourne info audio (codec, bitrate, channels).
 * Pour debug : confirme que l'audio est bien dans le fichier généré.
 */
export async function probeAudio(filePath) {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v", "error",
      "-select_streams", "a:0",
      "-show_entries", "stream=codec_name,bit_rate,channels,sample_rate,duration",
      "-of", "default=noprint_wrappers=1",
      filePath,
    ]);
    const out = stdout.trim();
    return out || "(no audio stream found)";
  } catch (err) {
    return `probe error: ${err.message}`;
  }
}

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
    // -stream_loop -1 fait reboucler l'audio à l'infini avant le mix.
    // Plus fiable que aloop dans filter_complex.
    args.push("-stream_loop", "-1", "-i", audioPath);
  }

  // Filter complex : pour chaque slide, scale+pad au format vertical 9:16 puis zoompan (Ken Burns).
  const PAD_COLOR = "0xF4EDE3"; // beige Poils Précieux
  const parts = [];
  for (let i = 0; i < slideCount; i++) {
    parts.push(
      `[${i}:v]` +
        `scale=${targetWidth}:${targetHeight}:force_original_aspect_ratio=decrease,` +
        `pad=${targetWidth}:${targetHeight}:(ow-iw)/2:(oh-ih)/2:color=${PAD_COLOR},` +
        `zoompan=z='if(eq(on,0),1.0,min(zoom+0.0008,1.08))':d=${frames}:s=${targetWidth}x${targetHeight}:fps=${fps}` +
        `[v${i}]`
    );
  }
  // Concat video
  parts.push(
    `${Array.from({ length: slideCount }, (_, i) => `[v${i}]`).join("")}concat=n=${slideCount}:v=1:a=0[outv]`
  );

  // Audio : on inclut DANS le filter_complex pour fiabilité (avec atrim explicite à la durée vidéo)
  if (audioPath) {
    parts.push(
      `[${slideCount}:a]atrim=duration=${totalDurationSec},asetpts=PTS-STARTPTS[outa]`
    );
  }

  args.push("-filter_complex", parts.join(";"));
  args.push("-map", "[outv]");

  if (audioPath) {
    args.push(
      "-map", "[outa]",
      "-c:a", "aac",
      "-b:a", "192k",
      "-ac", "2",
      "-ar", "44100"
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
 * Overlay une piste audio sur une vidéo existante (Pexels par exemple).
 * Garde la vidéo intacte (no re-encode), remplace l'audio par la piste musicale.
 *
 * @param {object} args
 * @param {string} args.videoPath - chemin vidéo source (Pexels MP4)
 * @param {string} args.audioPath - chemin piste musicale (MP3)
 * @param {string} args.outputPath - sortie MP4
 * @param {boolean} [args.recodeVideo=false] - si true, ré-encode la vidéo (utile si format pas standard)
 */
export async function overlayMusicOnVideo({ videoPath, audioPath, outputPath, recodeVideo = false }) {
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  }

  const args = [
    "-i", videoPath,
    "-stream_loop", "-1", "-i", audioPath,
  ];

  // Si recodeVideo : on reformate aussi en 1080x1920 vertical (scale + pad beige).
  // Indispensable pour les Reels TikTok/Insta si la vidéo source est landscape.
  if (recodeVideo) {
    args.push(
      "-filter_complex",
      "[0:v]scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xF4EDE3,setsar=1[outv]",
      "-map", "[outv]",
      "-map", "1:a:0",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-preset", "fast", "-crf", "20",
      "-r", "30"
    );
  } else {
    args.push(
      "-map", "0:v:0",
      "-map", "1:a:0",
      "-c:v", "copy"
    );
  }

  args.push(
    "-c:a", "aac",
    "-b:a", "192k",
    "-ac", "2",
    "-ar", "44100",
    "-shortest",
    "-movflags", "+faststart",
    "-y",
    outputPath
  );

  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, { windowsHide: true });
    let stderr = "";
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (err) => reject(new Error(`ffmpeg spawn failed: ${err.message}`)));
    proc.on("close", (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`ffmpeg exited ${code}. Last stderr:\n${stderr.slice(-1500)}`));
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
