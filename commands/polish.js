#!/usr/bin/env node
// Polish d'un ou plusieurs produits Shopify (variants, options, dimensions).
//
// Usage:
//   node commands/polish.js --project poils-precieux --handle laisse-retractable-spooly
//   node commands/polish.js --project poils-precieux --tag new (tous les produits taggés "new")
//   node commands/polish.js --project poils-precieux --recent (les 5 derniers créés)

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { loadProject, parseArgs, runDir } from "../core/config.js";
import { shopifyQuery } from "../core/shopify/client.js";
import { fetchProductForPolish, planPolish, executePolish } from "../core/polish/product.js";

async function findProducts(config, args) {
  if (args.handle) {
    const data = await shopifyQuery(
      config,
      `query($q: String!) { products(first: 1, query: $q) { nodes { id title handle } } }`,
      { q: `handle:${args.handle}` }
    );
    return data.products.nodes;
  }
  let query = "status:active";
  if (args.tag) query += ` AND tag:'${args.tag}'`;
  if (args.recent) {
    const data = await shopifyQuery(
      config,
      `query($q: String!) { products(first: 5, query: $q, sortKey: CREATED_AT, reverse: true) { nodes { id title handle } } }`,
      { q: query }
    );
    return data.products.nodes;
  }
  const data = await shopifyQuery(
    config,
    `query($q: String!) { products(first: 50, query: $q) { nodes { id title handle } } }`,
    { q: query }
  );
  return data.products.nodes;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project);
  const dir = runDir(config, "polish");

  const products = await findProducts(config, args);
  console.log(`[polish] ${products.length} products to process`);

  const allResults = [];
  for (const p of products) {
    console.log(`\n[polish] ▶ ${p.title} (${p.handle})`);
    const full = await fetchProductForPolish(config, p.id);
    const plan = planPolish(full, config.polish);
    console.log(`  plan: ${plan.actions.length} actions`);
    for (const a of plan.actions) console.log(`    - ${a.type}: ${a.reason}`);

    if (args.dryRun) {
      allResults.push({ product: p, plan, results: [] });
      continue;
    }

    const results = await executePolish(config, p.id, plan);
    for (const r of results) {
      const sym = r.ok ? "✓" : "✗";
      console.log(`    ${sym} ${r.action}: ${r.reason}${r.error ? ` — ${r.error}` : ""}`);
    }
    allResults.push({ product: p, plan, results });
  }

  fs.writeFileSync(path.join(dir, "polish-results.json"), JSON.stringify(allResults, null, 2), "utf8");
  console.log(`\n[polish] ✓ done — results: ${path.join(dir, "polish-results.json")}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
