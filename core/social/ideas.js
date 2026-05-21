// Génère un brief hebdomadaire d'idées de contenu à filmer.
// Input : catalogue Shopify + saison courante + thèmes hebdo
// Output : 7 idées concrètes "facile à tourner avec un smartphone"

import { shopifyQuery } from "../shopify/client.js";
import { researchJSON } from "../claude/research.js";

/**
 * Fetch un échantillon du catalogue actif pour nourrir le brainstorm.
 */
async function fetchCatalogSnapshot(config) {
  const data = await shopifyQuery(
    config,
    `query {
      products(first: 30, query: "status:active", sortKey: BEST_SELLING) {
        nodes {
          id title productType tags
          variants(first: 5) { nodes { title } }
        }
      }
    }`
  );
  return data.products.nodes.map((p) => ({
    title: p.title,
    type: p.productType,
    tags: p.tags,
    sampleVariants: p.variants.nodes.slice(0, 3).map((v) => v.title),
  }));
}

function seasonHint() {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) return "printemps : mues massives, allergies pollen, retour des sorties, premières chaleurs";
  if (m >= 5 && m <= 7) return "été : canicule, hydratation critique, voyage vacances, parasites, tique";
  if (m >= 8 && m <= 10) return "automne : retour mue, paws cracking, transition saisonnière";
  return "hiver : froid, coussins chauffants, intérieur, anti-anxiété, ennui, fêtes de fin d'année";
}

function upcomingEventsFR() {
  const now = new Date();
  const events = [];
  const m = now.getMonth();
  const d = now.getDate();
  // Quelques temps forts FR pets
  const calendar = [
    { month: 0, day: 1, name: "Nouvelle année", angle: "résolutions pour son animal" },
    { month: 1, day: 14, name: "Saint-Valentin", angle: "amour pour son animal" },
    { month: 3, day: 4, name: "Journée mondiale des animaux errants", angle: "adoption" },
    { month: 5, day: 1, name: "Été : journée des chiens", angle: "promenades été" },
    { month: 7, day: 8, name: "Journée mondiale du chat", angle: "célébration chat" },
    { month: 8, day: 4, name: "Rentrée", angle: "séparation chien/chat" },
    { month: 9, day: 4, name: "Journée mondiale des animaux", angle: "bien-être" },
    { month: 10, day: 1, name: "Halloween", angle: "sécurité chocolat, bruits" },
    { month: 11, day: 25, name: "Noël", angle: "cadeaux pour son animal" },
  ];
  for (const ev of calendar) {
    const evDate = new Date(now.getFullYear(), ev.month, ev.day);
    const diff = Math.floor((evDate - now) / 86400000);
    if (diff >= 0 && diff <= 14) events.push({ ...ev, daysAhead: diff });
  }
  return events;
}

/**
 * Génère 7 idées de contenu à filmer cette semaine.
 * Chaque idée = un brief actionnable avec angle, prop nécessaire, durée, jour suggéré.
 */
export async function generateWeeklyIdeas(config) {
  const catalog = await fetchCatalogSnapshot(config);
  const season = seasonHint();
  const upcoming = upcomingEventsFR();

  const system = `Tu es content strategist pour Poils Précieux (marque française premium accessoires chien et chat).

L'objectif : générer 7 idées de contenu social TOURNABLES FACILEMENT cette semaine par le founder avec son smartphone (lui ou ses proches ont un chien/chat à filmer).

Critères pour chaque idée :
1. Tournable en 5-10 min avec un phone (pas de setup pro)
2. 9:16 vertical (Reel/TikTok) ou carré 1:1 (feed)
3. 10-25 secondes de vidéo MAX
4. Émotionnellement engageante OU pédagogiquement utile
5. Mentionne un produit Poils Précieux par sa fonction réelle (jamais forcé)
6. Pas d'invention de client fictif

Utilise web_search si nécessaire pour repérer des tendances pet FR du moment, hooks viraux français, formats qui marchent sur TikTok/Insta en ce moment.`;

  const user = `Catalogue actuel Poils Précieux (top 30 best-sellers, échantillon) :
${JSON.stringify(catalog, null, 1).slice(0, 3000)}

Saison/contexte FR : ${season}

Événements à venir dans les 14 jours :
${upcoming.length ? upcoming.map((e) => `- ${e.name} dans ${e.daysAhead}j (angle: ${e.angle})`).join("\n") : "Aucun temps fort majeur."}

Génère 7 IDÉES de contenu actionnables, une par jour de la semaine à venir (lundi à dimanche).

Pour chaque idée, return JSON :
{
  "day": "monday|tuesday|...",
  "theme": "tendresse|astuce|guide|behind-scenes|inspiration|produit|cas-usage-produit|communaute",
  "format": "single|reel|carousel",
  "workingTitle": "titre interne court (5-10 mots)",
  "hook": "le hook 3 secondes / scroll-stop (5-12 mots, FR)",
  "shotList": [
    "Plan 1 : description du plan en 1 ligne",
    "Plan 2 : ...",
    "Plan 3 : ..."
  ],
  "durationSeconds": int,
  "propsNeeded": ["liste des accessoires nécessaires"],
  "productMentioned": "mascot name ou null",
  "viralPotential": "low|medium|high",
  "whyItWorks": "1 phrase explication algorithm / émotion",
  "captionDraft": "1-2 phrases de draft caption (pas final, juste pour orienter)"
}

Return as a JSON array of 7 ideas, one per day Mon→Sun.`;

  const { data, citations, usage } = await researchJSON(config, {
    system,
    user,
    maxTokens: 8000,
    maxSearches: 4,
  });
  return { ideas: data, catalog, season, upcoming, citations, usage };
}

/**
 * Rend les idées en markdown lisible pour le founder.
 */
export function renderIdeasMarkdown({ ideas, season, upcoming, weekNumber }) {
  const date = new Date().toISOString().slice(0, 10);
  let md = `# Brief contenu — semaine ${weekNumber} (${date})\n\n`;
  md += `**Saison** : ${season}\n\n`;
  if (upcoming.length) {
    md += `**Temps forts dans 14j** :\n`;
    for (const e of upcoming) md += `- ${e.name} dans ${e.daysAhead}j (angle : ${e.angle})\n`;
    md += `\n`;
  }
  md += `---\n\n`;
  md += `## 7 idées à filmer cette semaine\n\n`;
  for (const [i, idea] of ideas.entries()) {
    md += `### ${i + 1}. ${idea.day?.toUpperCase()} — ${idea.workingTitle}\n\n`;
    md += `**Thème** : ${idea.theme} · **Format** : ${idea.format} · **Durée** : ${idea.durationSeconds}s · **Potentiel viral** : ${idea.viralPotential}\n\n`;
    md += `**Hook** : "${idea.hook}"\n\n`;
    md += `**Plan de tournage** :\n`;
    for (const s of idea.shotList || []) md += `- ${s}\n`;
    md += `\n`;
    if (idea.propsNeeded?.length) md += `**Accessoires** : ${idea.propsNeeded.join(", ")}\n\n`;
    if (idea.productMentioned) md += `**Produit cité** : ${idea.productMentioned}\n\n`;
    if (idea.whyItWorks) md += `**Pourquoi ça marche** : ${idea.whyItWorks}\n\n`;
    if (idea.captionDraft) md += `**Draft caption** : ${idea.captionDraft}\n\n`;
    md += `---\n\n`;
  }
  md += `## Comment utiliser ce brief\n\n`;
  md += `1. Choisis 3-5 idées que tu peux filmer cette semaine (ne fais pas tout)\n`;
  md += `2. Tourne avec ton phone : 10 min/idée max\n`;
  md += `3. Pour chaque vidéo tournée, crée un dossier dans \`projects/poils-precieux/content-queue/NNN-nom/\`\n`;
  md += `4. Dépose le \`media.mp4\` + crée le \`meta.json\` (voir content-queue/README.md)\n`;
  md += `5. L'engine pioche automatiquement au prochain run social\n\n`;
  return md;
}
