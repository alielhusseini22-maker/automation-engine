#!/usr/bin/env node
// Régénère les images PREMIUM d'UN produit (image-to-image GPT-Image-1) à partir de sa/ses
// image(s) source actuelle(s). Utile après un re-sourcing/re-mapping DSERS : le produit a une
// photo brute (souvent basse résolution), on en sort une version branded propre 1024px.
//
// Le produit DOIT déjà avoir au moins une image source (le pipeline est image-to-image, pas
// génératif à partir de rien).
//
// Usage :
//   node commands/regen-images.js --project poils-precieux --handle coupe-griffes-clikko

import dotenv from "dotenv";
dotenv.config({ override: true });
import { loadProject, parseArgs } from "../core/config.js";
import { listProductsForImages } from "../core/shopify/client.js";
import { regenerateProductImages } from "../core/images/product-regen.js";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project || "poils-precieux");
  const handle = args.handle;
  if (!handle) throw new Error("--handle <product-handle> requis");

  const products = await listProductsForImages(config, { searchQuery: `handle:${handle}`, limit: 1 });
  const product = products[0];
  if (!product) throw new Error(`Produit introuvable pour le handle: ${handle}`);

  console.log(`[regen-images] ${product.title} (${product.handle})`);
  const result = await regenerateProductImages(config, product, {
    quality: config.images?.quality || "high",
    size: config.images?.size || "1024x1024",
    background: config.images?.background || "white",
    replace: !args.keepOld, // par défaut: remplace l'ancienne image (générée APRÈS, donc sans risque si l'IA échoue)
  });
  for (const line of result.log) console.log(line);
  console.log(`[regen-images] terminé — ${result.generated} générée(s), ${result.deleted} supprimée(s)`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
