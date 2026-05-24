// Régénération d'images produit en mode image-to-image (GPT-Image-1 edit).
// Pour chaque couleur de variante : génère 1 image premium (angle intelligent selon productType),
// upload + lie aux variantes, optionnellement supprime les anciennes.
// Porté depuis poils-precieux-image-tool/regenerate.js pour tourner dans GitHub Actions.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { editImage } from "./openai.js";
import { attachImageBuffer, linkMediaToVariants, deleteProductMedia } from "../shopify/client.js";
import { buildEditPrompt, groupVariantsByColor, findColorOptionName, shotsForProduct } from "./product-prompts.js";

/**
 * Télécharge une image URL vers un fichier temporaire local.
 */
async function downloadToTemp(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`download ${res.status} for ${url.slice(0, 80)}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const ext = (path.extname(new URL(url).pathname).split("?")[0] || ".jpg").toLowerCase();
  const safeExt = [".png", ".jpg", ".jpeg", ".webp"].includes(ext) ? ext : ".jpg";
  const tmp = path.join(os.tmpdir(), `srcimg-${Date.now()}-${Math.random().toString(36).slice(2)}${safeExt}`);
  fs.writeFileSync(tmp, buf);
  return tmp;
}

/**
 * Sélectionne jusqu'à `n` URLs source (dédupliquées).
 */
function selectSources(urls, n) {
  return [...new Set(urls.filter(Boolean))].slice(0, n);
}

function pickSourcesForColorGroup(group, productMediaUrls) {
  if (group.variantImageUrls?.length) {
    const variantImgs = selectSources(group.variantImageUrls, 2);
    const productImgs = selectSources(productMediaUrls.filter((u) => !variantImgs.includes(u)), 2);
    return [...variantImgs, ...productImgs].slice(0, 4);
  }
  return selectSources(productMediaUrls, 4);
}

/**
 * Régénère les images d'UN produit.
 * @param {object} args
 * @param {"high"|"medium"|"low"} [args.quality="high"]
 * @param {"white"|"transparent"} [args.background="white"]
 * @param {boolean} [args.replace=true] - supprime les anciennes images après génération
 * @returns {{ generated: number, deleted: number, log: string[] }}
 */
export async function regenerateProductImages(config, product, { quality = "high", size = "1024x1024", background = "white", replace = true } = {}) {
  const log = [];
  const groups = groupVariantsByColor(product);
  const shots = shotsForProduct(product.productType);
  const colorOption = findColorOptionName(product);
  log.push(`${product.title}: ${groups.length} color group(s), ${shots.length} shot(s) [${product.productType || "?"}]`);

  if (!product.mediaUrls?.length && !product.variants.some((v) => v.imageUrl)) {
    log.push(`  ⚠ no source images — skip`);
    return { generated: 0, deleted: 0, log };
  }

  const newMediaIds = [];
  for (const group of groups) {
    const label = group.color || "default";
    const sources = pickSourcesForColorGroup(group, product.mediaUrls);
    if (!sources.length) {
      log.push(`  ${label}: no source, skip`);
      continue;
    }
    const groupMediaIds = [];
    for (const shotVariant of shots) {
      const { name, prompt } = buildEditPrompt({ product, colorName: group.color, shotVariant, backgroundMode: background });
      try {
        const localPaths = [];
        for (const url of sources) localPaths.push(await downloadToTemp(url));
        const buf = await editImage(config, {
          imagePaths: localPaths,
          prompt,
          quality,
          size,
          background: background === "transparent" ? "transparent" : "opaque",
        });
        const filename = `${product.handle}-${name}.png`;
        const altText = group.color ? `${product.title} — ${group.color}` : product.title;
        const { mediaId } = await attachImageBuffer(config, { productId: product.id, buffer: buf, filename, altText });
        if (mediaId) {
          groupMediaIds.push(mediaId);
          newMediaIds.push(mediaId);
          log.push(`  ✓ ${label} · ${shotVariant.name} (${buf.length} bytes)`);
        }
        // cleanup temp
        for (const p of localPaths) { try { fs.unlinkSync(p); } catch {} }
      } catch (err) {
        log.push(`  ✗ ${label} · ${shotVariant.name}: ${err.message}`);
      }
    }
    // Lie l'image hero de la couleur aux variantes
    if (group.color && groupMediaIds.length && group.variantIds.length) {
      try {
        await linkMediaToVariants(config, { productId: product.id, variantIds: group.variantIds, mediaId: groupMediaIds[0] });
        log.push(`  ✓ linked hero to ${group.variantIds.length} variant(s) "${group.color}"`);
      } catch (err) {
        log.push(`  ⚠ link failed: ${err.message}`);
      }
    }
  }

  // Replace : supprime les anciennes images (garde uniquement les nouvelles)
  let deleted = 0;
  if (replace && newMediaIds.length && product.mediaIds.length) {
    const toDelete = product.mediaIds.filter((id) => !newMediaIds.includes(id));
    if (toDelete.length) {
      try {
        const del = await deleteProductMedia(config, { productId: product.id, mediaIds: toDelete });
        deleted = del.length;
        log.push(`  ✓ removed ${deleted} old media (kept ${newMediaIds.length} new)`);
      } catch (err) {
        log.push(`  ✗ delete old media failed: ${err.message}`);
      }
    }
  }

  return { generated: newMediaIds.length, deleted, log };
}
