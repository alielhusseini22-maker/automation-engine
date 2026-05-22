// Client Cloudinary — upload vidéo MP4 → URL publique CDN.
// Utilisé pour les Reels TikTok/Insta (Shopify Files ne supporte pas les Reels 9:16).
// Free tier : 25 GB storage + 25 GB bandwidth/mo. Largement suffisant.

import { v2 as cloudinary } from "cloudinary";
import fs from "node:fs";

let _configured = false;
function ensureConfigured() {
  if (_configured) return;
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary credentials missing. Need CLOUDINARY_CLOUD_NAME + CLOUDINARY_API_KEY + CLOUDINARY_API_SECRET.");
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
  _configured = true;
}

export function hasCloudinaryCreds() {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
}

/**
 * Upload un fichier vidéo local vers Cloudinary.
 * @param {string} filePath - chemin local de la vidéo MP4
 * @param {string} [folder="poils-precieux/social"] - dossier Cloudinary
 * @returns {Promise<{ url: string, publicId: string, duration: number, bytes: number }>}
 */
export async function uploadVideo(filePath, folder = "poils-precieux/social") {
  ensureConfigured();
  if (!fs.existsSync(filePath)) throw new Error(`Video file not found: ${filePath}`);

  // upload_large = chunked upload, supporte fichiers > 10 MB
  // (upload_stream classique a une limite de 10MB sur le tier gratuit Cloudinary)
  return new Promise((resolve, reject) => {
    cloudinary.uploader.upload_large(
      filePath,
      {
        resource_type: "video",
        folder,
        use_filename: true,
        unique_filename: true,
        overwrite: false,
        chunk_size: 6 * 1024 * 1024, // 6 MB chunks
      },
      (error, result) => {
        if (error) return reject(new Error(`Cloudinary upload error: ${error.message || JSON.stringify(error)}`));
        if (!result?.secure_url) return reject(new Error("Cloudinary returned no secure_url"));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          duration: result.duration,
          bytes: result.bytes,
          format: result.format,
        });
      }
    );
  });
}

/**
 * Upload depuis Buffer (sans passer par un fichier).
 */
export async function uploadVideoBuffer(buffer, filename = "video.mp4", folder = "poils-precieux/social") {
  ensureConfigured();
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        resource_type: "video",
        folder,
        public_id: filename.replace(/\.[^.]+$/, ""),
        overwrite: false,
      },
      (error, result) => {
        if (error) return reject(new Error(`Cloudinary upload error: ${error.message}`));
        if (!result?.secure_url) return reject(new Error("Cloudinary returned no secure_url"));
        resolve({
          url: result.secure_url,
          publicId: result.public_id,
          duration: result.duration,
          bytes: result.bytes,
        });
      }
    );
    stream.end(buffer);
  });
}
