#!/usr/bin/env node
// Génère le plan stratégique de la semaine (full-auto) : thème, produits à pousser,
// catégories Pexels, angle blog. Écrit projects/<projet>/weekly-plan.json que les
// pipelines social + blog lisent pour aligner tout le contenu de la semaine.
//
// Usage : node commands/weekly-plan.js --project poils-precieux

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { loadProject, parseArgs, runDir } from "../core/config.js";
import { generateWeeklyPlan, writeWeeklyPlan, renderPlanMarkdown } from "../core/strategy/weekly-plan.js";

function isoWeek(d = new Date()) {
  const t = new Date(d.valueOf());
  const dn = (d.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dn + 3);
  const ft = t.valueOf();
  t.setUTCMonth(0, 1);
  if (t.getUTCDay() !== 4) t.setUTCMonth(0, 1 + ((4 - t.getUTCDay()) + 7) % 7);
  return 1 + Math.ceil((ft - t.valueOf()) / 604800000);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project);
  const dir = runDir(config, "weekly-plan");
  const weekNumber = isoWeek();

  console.log(`[weekly-plan] project=${config.project.id} week=${weekNumber}`);
  console.log(`[weekly-plan] generating strategy via Claude + web_search...`);

  const { plan, usage } = await generateWeeklyPlan(config, weekNumber);

  // Écrit le plan (lu par social + blog) — committé dans le repo
  const planFile = writeWeeklyPlan(config, plan);
  console.log(`[weekly-plan] ✓ plan written: ${planFile}`);
  console.log(`[weekly-plan]   theme: ${plan.themeOfWeek}`);
  console.log(`[weekly-plan]   focus products: ${(plan.focusProductHandles || []).join(", ")}`);
  console.log(`[weekly-plan]   pexels categories: ${(plan.focusPexelsCategories || []).join(", ")}`);
  console.log(`[weekly-plan]   blog angle: ${plan.blogAngle}`);

  // Copie lisible dans runs/ + artifact
  fs.writeFileSync(path.join(dir, "PLAN.md"), renderPlanMarkdown(plan), "utf8");
  fs.writeFileSync(path.join(dir, "plan.json"), JSON.stringify(plan, null, 2), "utf8");

  if (usage) {
    console.log(`[weekly-plan] usage: in=${usage.input_tokens} out=${usage.output_tokens}`);
  }
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
