// Application des règles sourcing sur une liste de candidats produits.
// Filtre + score chaque candidat selon le projet.

/**
 * Vérifie qu'un candidat passe les règles obligatoires du projet.
 * @returns {{ pass: boolean, reasons: string[] }}
 */
export function evaluateCandidate(candidate, rules) {
  const reasons = [];

  if ((candidate.ordersCount ?? 0) < rules.minOrders) {
    reasons.push(`orders ${candidate.ordersCount} < ${rules.minOrders}`);
  }
  if ((candidate.rating ?? 0) < rules.minRating) {
    reasons.push(`rating ${candidate.rating} < ${rules.minRating}`);
  }
  if (candidate.priceUSD != null) {
    if (candidate.priceUSD < rules.minPriceUSD) reasons.push(`price ${candidate.priceUSD} < ${rules.minPriceUSD}`);
    if (candidate.priceUSD > rules.maxPriceUSD) reasons.push(`price ${candidate.priceUSD} > ${rules.maxPriceUSD}`);
  }
  if (candidate.category && rules.excludeCategories?.some((ex) => candidate.category.toLowerCase().includes(ex.toLowerCase()))) {
    reasons.push(`excluded category: ${candidate.category}`);
  }

  return { pass: reasons.length === 0, reasons };
}

/**
 * Score qualité d'un candidat (0-100). Sert à trier les candidats retenus.
 */
export function scoreCandidate(candidate) {
  let score = 0;
  // Orders volume (0-40 points)
  const orders = candidate.ordersCount || 0;
  if (orders >= 10000) score += 40;
  else if (orders >= 5000) score += 35;
  else if (orders >= 2000) score += 30;
  else if (orders >= 1000) score += 20;
  else if (orders >= 500) score += 15;

  // Rating (0-25 points)
  const rating = candidate.rating || 0;
  score += Math.min(25, Math.max(0, (rating - 3.5) * 50));

  // Margin potential (0-20 points): higher margin = higher score
  if (candidate.priceUSD && candidate.expectedRetailEUR) {
    const costEUR = candidate.priceUSD * 0.92; // rough USD→EUR
    const marginPct = ((candidate.expectedRetailEUR - costEUR) / candidate.expectedRetailEUR) * 100;
    if (marginPct >= 70) score += 20;
    else if (marginPct >= 60) score += 15;
    else if (marginPct >= 50) score += 10;
    else if (marginPct >= 40) score += 5;
  }

  // Niche fit (0-15 points): a manual signal from Claude research
  if (candidate.nicheFitScore != null) score += Math.min(15, candidate.nicheFitScore * 3);

  return Math.round(score);
}

export function filterAndRank(candidates, rules) {
  const evaluated = candidates.map((c) => {
    const { pass, reasons } = evaluateCandidate(c, rules);
    const score = pass ? scoreCandidate(c) : 0;
    return { ...c, pass, rejectReasons: reasons, score };
  });
  return {
    accepted: evaluated.filter((c) => c.pass).sort((a, b) => b.score - a.score),
    rejected: evaluated.filter((c) => !c.pass),
  };
}
