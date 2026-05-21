#!/usr/bin/env node
// Génère un brief hebdomadaire de 7 idées de contenu à filmer.
// À lancer chaque dimanche pour avoir le brief de la semaine à venir.
//
// Usage : node commands/content-ideas.js --project poils-precieux

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { loadProject, parseArgs, runDir } from "../core/config.js";
import { generateWeeklyIdeas, renderIdeasMarkdown } from "../core/social/ideas.js";

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
  const dir = runDir(config, "content-ideas");
  const weekNumber = isoWeek();

  console.log(`[content-ideas] project=${config.project.id} week=${weekNumber}`);
  console.log(`[content-ideas] generating 7 ideas via Claude + web_search...`);

  const result = await generateWeeklyIdeas(config);
  const ideas = Array.isArray(result.ideas) ? result.ideas : [];
  console.log(`[content-ideas] got ${ideas.length} ideas`);

  fs.writeFileSync(path.join(dir, "ideas.json"), JSON.stringify(result, null, 2), "utf8");

  const md = renderIdeasMarkdown({ ideas, season: result.season, upcoming: result.upcoming, weekNumber });
  const briefPath = path.join(dir, "BRIEF.md");
  fs.writeFileSync(briefPath, md, "utf8");

  console.log(`\n[content-ideas] ✓ done`);
  console.log(`  → JSON : ${path.join(dir, "ideas.json")}`);
  console.log(`  → Brief markdown : ${briefPath}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
