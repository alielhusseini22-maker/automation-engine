// Recherche temps réel des produits tendance sur AliExpress via Claude + web_search.
// Output : candidats structurés prêts pour filterAndRank().

import { researchJSON } from "../claude/research.js";
import { shopifyQuery } from "../shopify/client.js";

/**
 * Récupère le catalogue actif (titres + types) pour exclure les doublons du sourcing.
 */
export async function fetchExistingCatalog(config) {
  const data = await shopifyQuery(
    config,
    `query {
      products(first: 100, query: "status:active") {
        nodes { title productType tags }
      }
    }`
  );
  return data.products.nodes.map((p) => ({
    title: p.title,
    type: p.productType,
  }));
}

/**
 * Sélectionne le focus de la semaine selon le calendrier rotation.
 */
export function getWeeklyFocus(config) {
  const rotation = config.sourcing.rotation || [];
  if (rotation.length === 0) return null;
  // ISO week number modulo rotation length
  const week = isoWeekNumber(new Date());
  return rotation[(week - 1) % rotation.length].focus;
}

function isoWeekNumber(d) {
  const target = new Date(d.valueOf());
  const dayNr = (d.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
}

/**
 * Génère N candidats produits via recherche web Claude.
 * @returns {{ candidates: Array, focus: string, citations: Array }}
 */
export async function generateCandidates(config, { focus = null, count = 15 } = {}) {
  const usedFocus = focus || getWeeklyFocus(config) || "general";
  const rules = config.sourcing.rules;

  // Catalogue existant → exclusion des doublons
  let existing = [];
  try {
    existing = await fetchExistingCatalog(config);
  } catch (err) {
    console.log(`[sourcing] ⚠ couldn't fetch catalog for dedup: ${err.message}`);
  }
  const existingList = existing.map((p) => `- ${p.title}${p.type ? ` (${p.type})` : ""}`).join("\n");

  const system = `You are a product sourcing analyst for a French premium pet products dropshipping brand called "Poils Précieux" (poilsprecieux.com).

Your job: research AliExpress for trending, high-quality pet products that match the brand's positioning AND that are NOT already in the catalog.

Brand positioning:
- French market, premium minimal aesthetic
- Target retail price €${rules.minPriceUSD * 3}-€${rules.maxPriceUSD * 3}
- Focus on UTILITY products, not gadgets or fashion items
- Categories: ${rules.categories.join(", ")}
- Exclude: ${rules.excludeCategories.join(", ")}

Hard rules (must all be met):
- Minimum ${rules.minOrders} historical orders on AliExpress
- Minimum ${rules.minRating} star rating
- Wholesale price between $${rules.minPriceUSD}-$${rules.maxPriceUSD}
- Suitable for shipping to France
- Not requiring subscription (no food/meds)
- NO VISIBLE THIRD-PARTY BRAND on the product itself, its screen-print/engraving, or its packaging. We sell white-label as Poils Précieux, so any unit showing another brand's name or logo is DISQUALIFIED — always prefer plain/unbranded versions of the same product.

CRITICAL — NO DUPLICATES: The brand ALREADY SELLS these products. You must NOT propose anything that is the same product type or serves the same function. Propose only genuinely NEW products that fill gaps in the catalog.

PRODUITS DÉJÀ EN CATALOGUE (à NE PAS reproposer, ni équivalent fonctionnel) :
${existingList || "(catalogue vide)"}

Use web_search to find current trending products on AliExpress, dropshipping research sites, or pet industry trend sources. Then synthesize ${count} qualified candidates that are NEW (not in the list above).`;

  const user = `Find ${count} trending pet products on AliExpress that match our criteria AND are NOT already in our catalog (see the exclusion list in the system prompt).

This week's focus: **${usedFocus}** (prioritize this category, but include 2-3 wildcards from other categories if very strong).

For EACH candidate, double-check it is NOT functionally equivalent to anything in our existing catalog. If the focus category is saturated in our catalog, pick adjacent gaps (new use cases, new product types we don't have yet).

For each candidate, return:
- title: short descriptive French title (will become product title after polish)
- mascotName: a 4-6 letter cute French/English mascot name ending with -y or -o (e.g., "Brushy", "Cocoony", "Marley") — must NOT exist in our catalog already
- category: one of [chien, chat, toilettage, alimentation, couchage, balade, jeu]
- aliSearchTerms: 2-3 English search terms to find this exact product on AliExpress
- ordersCount: estimated number (use web_search to verify)
- rating: estimated star rating
- priceUSD: estimated wholesale price
- expectedRetailEUR: target retail price (apply premium margin)
- nicheFitScore: 1-5 (1 = generic, 5 = perfect niche fit for premium French pet market)
- whyInteresting: 1 sentence explaining why this product fits our brand
- variantStrategy: brief note on how to simplify variants (which to keep, which to drop)
- imageStrategy: hint for AI image generation ("front-three-quarter" for objects, "top-down" for flats/mats/bowls)

Return as a JSON array of ${count} objects.`;

  const { data, citations, usage } = await researchJSON(config, {
    system,
    user,
    maxTokens: 16000,
    maxSearches: 8,
  });

  if (!Array.isArray(data)) {
    throw new Error(`Expected JSON array, got: ${typeof data}`);
  }

  return { candidates: data, focus: usedFocus, citations, usage };
}
