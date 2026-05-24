#!/usr/bin/env node
// Réécrit les descriptions produits au GABARIT MAISON Poils Précieux pour une
// cohérence catalogue. Cible les produits EN LIGNE qui ne suivent pas encore le
// gabarit (absence de la section "Garanties Poils Précieux"). Ne touche QUE la
// description (ni prix, ni variantes, ni images, ni collections).
//
// Usage :
//   node commands/repolish-descriptions.js --project poils-precieux [--dry-run] [--limit N] [--handle h]
//   node commands/repolish-descriptions.js --project poils-precieux --all   (réécrit TOUT, même conformes)

import dotenv from "dotenv";
dotenv.config({ override: true });
import { loadProject } from "../core/config.js";
import { shopifyQuery } from "../core/shopify/client.js";
import { generateTemplateDescription } from "../core/polish/product.js";

const MARKER = "Garanties Poils Précieux";

function parseArgv() {
  const a = process.argv.slice(2);
  const get = (k) => {
    const i = a.indexOf(k);
    return i >= 0 && a[i + 1] && !a[i + 1].startsWith("--") ? a[i + 1] : null;
  };
  return {
    project: get("--project") || process.env.PROJECT || "poils-precieux",
    dryRun: a.includes("--dry-run") || a.includes("--dryRun"),
    all: a.includes("--all"),
    limit: get("--limit") ? Number(get("--limit")) : null,
    handle: get("--handle"),
  };
}

async function fetchAllActive(config) {
  const out = [];
  let cursor = null;
  while (true) {
    const d = await shopifyQuery(
      config,
      `query($c:String){ products(first:50, after:$c, query:"status:active"){
        edges{ node{ id title handle publishedAt descriptionHtml variants(first:30){ nodes{ title } } } }
        pageInfo{ hasNextPage endCursor } } }`,
      { c: cursor }
    );
    for (const e of d.products.edges) out.push(e.node);
    if (!d.products.pageInfo.hasNextPage) break;
    cursor = d.products.pageInfo.endCursor;
  }
  return out;
}

async function main() {
  const args = parseArgv();
  const config = loadProject(args.project);
  const all = await fetchAllActive(config);

  let targets = all.filter((p) => p.publishedAt);
  if (!args.all) targets = targets.filter((p) => !(p.descriptionHtml || "").includes(MARKER));
  if (args.handle) targets = targets.filter((p) => p.handle === args.handle);
  if (args.limit) targets = targets.slice(0, args.limit);

  console.log(`[repolish] ${targets.length} fiche(s) à reformater au gabarit${args.dryRun ? " (DRY-RUN)" : ""}`);

  let ok = 0;
  let fail = 0;
  for (const p of targets) {
    try {
      const html = await generateTemplateDescription(config, p);
      if (!html || html.length < 80) throw new Error("description trop courte / vide");
      if (args.dryRun) {
        console.log(`\n=== ${p.title} ===\n${html}\n`);
      } else {
        const r = await shopifyQuery(
          config,
          `mutation($product: ProductUpdateInput!){ productUpdate(product:$product){ userErrors{ field message } } }`,
          { product: { id: p.id, descriptionHtml: html } }
        );
        const errs = r.productUpdate.userErrors;
        if (errs?.length) throw new Error(JSON.stringify(errs));
        console.log(`  ✓ ${p.title}`);
      }
      ok++;
    } catch (err) {
      fail++;
      console.log(`  ✗ ${p.title}: ${err.message}`);
    }
  }
  console.log(`\n[repolish] terminé — ${ok} OK, ${fail} échec(s)`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
