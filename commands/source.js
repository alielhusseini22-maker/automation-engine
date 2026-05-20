#!/usr/bin/env node
// Recherche hebdomadaire de produits à sourcer + brief markdown + CSV pour DSERS.
//
// Usage:
//   node commands/source.js --project poils-precieux
//   node commands/source.js --focus toilettage --count 20

import "dotenv/config";
import { loadProject, parseArgs, runDir } from "../core/config.js";
import { generateCandidates } from "../core/sourcing/research.js";
import { filterAndRank } from "../core/sourcing/rules.js";
import { writeCandidatesOutputs } from "../core/sourcing/output.js";

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
  const dir = runDir(config, "sourcing");

  const count = parseInt(args.count) || config.sourcing.weeklyTargets?.candidatesCount || 15;
  const focus = args.focus || null;

  console.log(`[sourcing] project=${config.project.id} focus=${focus || "auto"} count=${count}`);
  console.log(`[sourcing] output dir = ${dir}`);

  if (args.dryRun) {
    console.log(`[sourcing] DRY RUN — would call Claude with web_search`);
    return;
  }

  const { candidates: rawCandidates, focus: usedFocus, citations, usage } = await generateCandidates(config, {
    focus,
    count,
  });
  console.log(`[sourcing] Claude returned ${rawCandidates.length} raw candidates`);
  console.log(`[sourcing] usage: in=${usage.input_tokens} out=${usage.output_tokens} (~$${((usage.input_tokens * 15 + usage.output_tokens * 75) / 1_000_000).toFixed(3)})`);

  const { accepted, rejected } = filterAndRank(rawCandidates, config.sourcing.rules);
  console.log(`[sourcing] ${accepted.length} accepted, ${rejected.length} rejected`);

  const { csvPath, briefPath } = writeCandidatesOutputs(dir, {
    focus: usedFocus,
    accepted,
    rejected,
    citations,
    weekNumber: isoWeek(),
  });

  console.log(`\n[sourcing] ✓ done`);
  console.log(`  → CSV : ${csvPath}`);
  console.log(`  → Brief : ${briefPath}`);
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
