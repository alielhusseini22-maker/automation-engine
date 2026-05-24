#!/usr/bin/env node
// Onboarding auto des produits fraîchement importés (via DSERS).
// Détecte les produits tagués "nouveau-produit" PAS ENCORE traités (tag "auto-onboarded"),
// applique : 1) polish (variantes/options/dimensions) 2) régénération images IA.
// Puis tague "auto-onboarded" pour ne pas retraiter.
//
// → Ton seul geste après import DSERS : ajouter le tag "nouveau-produit" sur Shopify.
//   Le reste (polish + images premium) se fait tout seul au prochain run de ce workflow.
//
// Usage : node commands/product-onboarding.js --project poils-precieux

import dotenv from "dotenv";
// override: true → le .env local l'emporte sur une variable shell vide/obsolète
// (sans effet en CI, où il n'y a pas de .env et où les secrets sont injectés).
dotenv.config({ override: true });
import fs from "node:fs";
import path from "node:path";
import { loadProject, parseArgs, runDir } from "../core/config.js";
import { listProductsForImages, addProductTag } from "../core/shopify/client.js";
import {
  fetchProductForPolish,
  planPolish,
  executePolish,
  generateProductPolishAI,
  applyAIPolish,
  fetchCollections,
} from "../core/polish/product.js";
import { regenerateProductImages } from "../core/images/product-regen.js";

const ONBOARDED_TAG = "auto-onboarded";

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project);
  const dir = runDir(config, "onboarding");

  // Produits tagués nouveau-produit, PAS encore onboardés
  const query = `status:active AND tag:'nouveau-produit' AND -tag:'${ONBOARDED_TAG}'`;
  const products = await listProductsForImages(config, { searchQuery: query, limit: 20 });
  console.log(`[onboarding] ${products.length} new product(s) to process`);

  if (products.length === 0) {
    console.log(`[onboarding] nothing to do (no products tagged 'nouveau-produit' without '${ONBOARDED_TAG}')`);
    return;
  }

  // Collections de la boutique (pour rattachement par catégorie, résolu côté Claude)
  let collections = [];
  try {
    collections = await fetchCollections(config);
  } catch (err) {
    console.log(`[onboarding] ⚠ couldn't fetch collections: ${err.message}`);
  }

  const results = [];
  for (const p of products) {
    console.log(`\n[onboarding] ▶ ${p.title} (${p.handle})`);

    // 1. POLISH
    let polishResults = [];
    try {
      const full = await fetchProductForPolish(config, p.id);
      const plan = planPolish(full, config.polish);
      console.log(`  polish: ${plan.actions.length} action(s)`);
      if (!args.dryRun && plan.actions.length) {
        polishResults = await executePolish(config, p.id, plan);
        for (const r of polishResults) console.log(`    ${r.ok ? "✓" : "✗"} ${r.action}`);
      }
    } catch (err) {
      console.log(`  ✗ polish failed: ${err.message}`);
    }

    // 2. POLISH IA : titre FR + description conforme, élagage variantes (AVANT images), collections
    let aiPlan = null;
    try {
      const full2 = await fetchProductForPolish(config, p.id);
      aiPlan = await generateProductPolishAI(config, full2, {
        collectionTitles: collections.map((c) => c.title),
        maxColors: config.polish?.maxColors || 6,
      });
      console.log(`  ai-polish → "${aiPlan.title}"`);
      const aiLog = await applyAIPolish(config, full2, aiPlan, { collections, dryRun: args.dryRun });
      for (const line of aiLog) console.log(`    ✓ ${line}`);
    } catch (err) {
      console.log(`  ✗ ai-polish failed: ${err.message}`);
    }

    // 3. IMAGES (re-fetch après polish car variantes ont pu changer)
    let imgResult = { generated: 0, deleted: 0, log: [] };
    if (!args.dryRun) {
      try {
        const [fresh] = await listProductsForImages(config, { searchQuery: `handle:${p.handle}`, limit: 1 });
        if (fresh) {
          imgResult = await regenerateProductImages(config, fresh, {
            quality: config.images?.quality || "high",
            size: config.images?.size || "1024x1024",
            background: config.images?.background || "white",
            replace: config.images?.removeOldImages !== false,
          });
          for (const line of imgResult.log) console.log(`    ${line}`);
        }
      } catch (err) {
        console.log(`  ✗ images failed: ${err.message}`);
      }
    }

    // 3. Tag auto-onboarded (ne pas retraiter)
    if (!args.dryRun) {
      try {
        await addProductTag(config, p.id, ONBOARDED_TAG);
        console.log(`  ✓ tagged '${ONBOARDED_TAG}'`);
      } catch (err) {
        console.log(`  ⚠ tag failed: ${err.message}`);
      }
    }

    results.push({ handle: p.handle, title: p.title, polish: polishResults.length, images: imgResult.generated });
  }

  fs.writeFileSync(path.join(dir, "onboarding-results.json"), JSON.stringify(results, null, 2), "utf8");
  console.log(`\n[onboarding] ✓ done — ${results.length} product(s) onboarded`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
