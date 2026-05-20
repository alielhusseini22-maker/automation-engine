#!/usr/bin/env node
// Smoke test : vérifie que tous les modules se chargent, config valide,
// credentials détectées (sans appel réseau réel).
//
// Usage: node commands/smoke.js --project poils-precieux

import "dotenv/config";
import { loadProject, loadBrandCharter, parseArgs } from "../core/config.js";

const checks = [];
async function check(name, fn) {
  try {
    const out = await fn();
    checks.push({ name, ok: true, detail: out });
  } catch (err) {
    checks.push({ name, ok: false, detail: err.message });
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`[smoke] project=${args.project || process.env.PROJECT}\n`);

  await check("Project config loads", () => {
    const c = loadProject(args.project);
    return `id=${c.project.id} domain=${c.project.domain}`;
  });

  await check("Brand charter exists", () => {
    const c = loadProject(args.project);
    const charter = loadBrandCharter(c);
    return `${charter.length} chars`;
  });

  await check("ANTHROPIC_API_KEY present", () => {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error("missing");
    return "ok (sk-ant-...)";
  });

  await check("OPENAI_API_KEY present", () => {
    if (!process.env.OPENAI_API_KEY) throw new Error("missing");
    return "ok (sk-proj-...)";
  });

  await check("Shopify token env present", () => {
    const c = loadProject(args.project);
    const v = process.env[c.shopify.envToken];
    if (!v) throw new Error(`missing env: ${c.shopify.envToken}`);
    return `ok (${v.slice(0, 10)}...)`;
  });

  await check("Buffer token env (optional)", () => {
    const c = loadProject(args.project);
    const v = process.env[c.buffer.envToken];
    if (!v) return "absent (manual post mode)";
    return `ok (${v.slice(0, 10)}...)`;
  });

  // Static imports verification
  await check("All core modules importable", async () => {
    await import("../core/shopify/client.js");
    await import("../core/claude/client.js");
    await import("../core/claude/research.js");
    await import("../core/images/openai.js");
    await import("../core/sourcing/rules.js");
    await import("../core/sourcing/research.js");
    await import("../core/sourcing/output.js");
    await import("../core/polish/product.js");
    await import("../core/polish/dimensions.js");
    await import("../core/polish/translations.js");
    await import("../core/blog/topics.js");
    await import("../core/blog/writer.js");
    await import("../core/blog/hero.js");
    await import("../core/social/themes.js");
    await import("../core/social/content.js");
    await import("../core/social/buffer.js");
    return "16 modules OK";
  });

  // Print results
  console.log("Results:");
  for (const c of checks) {
    const sym = c.ok ? "✓" : "✗";
    console.log(`  ${sym} ${c.name}: ${c.detail}`);
  }

  const failed = checks.filter((c) => !c.ok).length;
  if (failed > 0) {
    console.log(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll checks passed. Engine ready.");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
