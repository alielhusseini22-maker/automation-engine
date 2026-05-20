// Format candidats sourcing → CSV / JSON / Markdown brief pour le founder.

import fs from "node:fs";
import path from "node:path";
import { stringify } from "csv-stringify/sync";

export function writeCandidatesOutputs(runDirectory, { focus, accepted, rejected, citations, weekNumber }) {
  // 1. CSV ready for DSERS manual review
  const csvHeader = [
    "rank",
    "title",
    "mascot",
    "category",
    "aliSearchTerms",
    "ordersCount",
    "rating",
    "priceUSD",
    "expectedRetailEUR",
    "marginPct",
    "score",
    "whyInteresting",
    "variantStrategy",
    "imageStrategy",
  ];
  const rows = accepted.map((c, i) => {
    const cost = c.priceUSD * 0.92;
    const marginPct = c.expectedRetailEUR ? Math.round(((c.expectedRetailEUR - cost) / c.expectedRetailEUR) * 100) : null;
    return [
      i + 1,
      c.title,
      c.mascotName,
      c.category,
      Array.isArray(c.aliSearchTerms) ? c.aliSearchTerms.join(" | ") : c.aliSearchTerms,
      c.ordersCount,
      c.rating,
      c.priceUSD,
      c.expectedRetailEUR,
      marginPct,
      c.score,
      c.whyInteresting,
      c.variantStrategy,
      c.imageStrategy,
    ];
  });
  const csv = stringify([csvHeader, ...rows]);
  fs.writeFileSync(path.join(runDirectory, "candidates.csv"), csv, "utf8");

  // 2. Full JSON (accepted + rejected, for traceability)
  fs.writeFileSync(
    path.join(runDirectory, "candidates.json"),
    JSON.stringify({ focus, weekNumber, accepted, rejected, citations }, null, 2),
    "utf8"
  );

  // 3. Markdown brief for human review
  const md = renderBrief({ focus, accepted, rejected, weekNumber });
  fs.writeFileSync(path.join(runDirectory, "BRIEF.md"), md, "utf8");

  return { csvPath: path.join(runDirectory, "candidates.csv"), briefPath: path.join(runDirectory, "BRIEF.md") };
}

function renderBrief({ focus, accepted, rejected, weekNumber }) {
  const date = new Date().toISOString().slice(0, 10);
  let md = `# Brief sourcing — semaine ${weekNumber} (${date})\n\n`;
  md += `**Focus de la semaine** : ${focus}\n\n`;
  md += `**Candidats retenus** : ${accepted.length}\n`;
  md += `**Candidats rejetés** : ${rejected.length}\n\n`;

  md += `## Top candidats (triés par score)\n\n`;
  md += `| Rank | Titre | Mascotte | Catégorie | Orders | Rating | Prix $ | Vente € | Marge % | Score |\n`;
  md += `|---:|---|---|---|---:|---:|---:|---:|---:|---:|\n`;
  for (const [i, c] of accepted.entries()) {
    const cost = c.priceUSD * 0.92;
    const marginPct = c.expectedRetailEUR ? Math.round(((c.expectedRetailEUR - cost) / c.expectedRetailEUR) * 100) : "?";
    md += `| ${i + 1} | ${c.title} | ${c.mascotName} | ${c.category} | ${c.ordersCount} | ${c.rating} | $${c.priceUSD} | €${c.expectedRetailEUR} | ${marginPct}% | ${c.score} |\n`;
  }

  md += `\n## Détails par candidat\n\n`;
  for (const [i, c] of accepted.entries()) {
    md += `### ${i + 1}. ${c.title} (${c.mascotName}™)\n\n`;
    md += `- **Catégorie** : ${c.category}\n`;
    md += `- **Recherche AliExpress** : \`${Array.isArray(c.aliSearchTerms) ? c.aliSearchTerms.join(" | ") : c.aliSearchTerms}\`\n`;
    md += `- **Pourquoi** : ${c.whyInteresting}\n`;
    md += `- **Stratégie variantes** : ${c.variantStrategy}\n`;
    md += `- **Stratégie image** : ${c.imageStrategy}\n\n`;
  }

  if (rejected.length > 0) {
    md += `## Rejetés (pour info)\n\n`;
    for (const c of rejected.slice(0, 10)) {
      md += `- **${c.title}** — ${c.rejectReasons.join(", ")}\n`;
    }
  }

  md += `\n---\n\n## Action à faire (toi)\n\n`;
  md += `1. Ouvrir DSERS → "Find Products"\n`;
  md += `2. Pour chaque candidat retenu (top 5-10), copier les **mots-clés AliExpress** dans la recherche\n`;
  md += `3. Importer manuellement dans DSERS les produits qui matchent (vérifier orders + rating en live)\n`;
  md += `4. Une fois importés sur Shopify → lance \`pnpm polish\` pour appliquer le polish auto + génération images\n`;

  return md;
}
