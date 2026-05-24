// Plan stratégique hebdomadaire — pilote le contenu auto de la semaine.
// Généré chaque dimanche : thème, produits à pousser, catégories Pexels, angle blog.
// Écrit dans projects/<projet>/weekly-plan.json (committé → lu par social.js + blog.js).

import fs from "node:fs";
import path from "node:path";
import { shopifyQuery } from "../shopify/client.js";
import { researchJSON } from "../claude/research.js";

function planPath(config) {
  return path.join(config._projectDir, "weekly-plan.json");
}

/**
 * Charge le plan de la semaine. Retourne null si absent ou périmé (>8 jours).
 * Les pipelines l'utilisent pour biaiser leurs choix ; s'il manque, fallback aléatoire.
 */
export function loadWeeklyPlan(config) {
  const p = planPath(config);
  if (!fs.existsSync(p)) return null;
  try {
    const plan = JSON.parse(fs.readFileSync(p, "utf8"));
    // Périme après 8 jours (sécurité si un dimanche est sauté)
    const ageMs = Date.now() - new Date(plan.generatedAt).getTime();
    if (ageMs > 8 * 86400000) return null;
    return plan;
  } catch {
    return null;
  }
}

function seasonHint() {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) return "printemps : mues massives, allergies pollen, retour des sorties, premières chaleurs";
  if (m >= 5 && m <= 7) return "été : canicule, hydratation critique, voyage vacances, parasites, tiques";
  if (m >= 8 && m <= 10) return "automne : retour mue, coussinets secs, transition saisonnière";
  return "hiver : froid, coussins chauffants, intérieur, anti-anxiété, ennui, fêtes";
}

function upcomingEventsFR() {
  const now = new Date();
  const calendar = [
    { month: 0, day: 1, name: "Nouvelle année", angle: "résolutions pour son animal" },
    { month: 1, day: 14, name: "Saint-Valentin", angle: "amour pour son animal" },
    { month: 4, day: 0, name: "Début été", angle: "préparer la canicule" },
    { month: 7, day: 8, name: "Journée mondiale du chat", angle: "célébration chat" },
    { month: 8, day: 4, name: "Rentrée", angle: "séparation, anti-anxiété" },
    { month: 9, day: 4, name: "Journée mondiale des animaux", angle: "bien-être" },
    { month: 10, day: 1, name: "Halloween", angle: "sécurité, bruits" },
    { month: 11, day: 25, name: "Noël", angle: "cadeaux pour son animal" },
  ];
  const events = [];
  for (const ev of calendar) {
    const evDate = new Date(now.getFullYear(), ev.month, ev.day);
    const diff = Math.floor((evDate - now) / 86400000);
    if (diff >= 0 && diff <= 14) events.push({ ...ev, daysAhead: diff });
  }
  return events;
}

async function fetchCatalog(config) {
  const data = await shopifyQuery(
    config,
    `query {
      products(first: 50, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
        nodes {
          handle title productType tags totalInventory
          priceRangeV2 { minVariantPrice { amount } }
        }
      }
    }`
  );
  return data.products.nodes
    .filter((p) => (p.totalInventory ?? 1) !== 0) // skip out-of-stock
    .map((p) => ({
      handle: p.handle,
      title: p.title,
      type: p.productType,
      tags: (p.tags || []).filter((t) => !t.startsWith("ali_query")),
      price: p.priceRangeV2?.minVariantPrice?.amount,
    }));
}

/**
 * Génère le plan stratégique de la semaine via Claude + web_search.
 */
export async function generateWeeklyPlan(config, weekNumber) {
  const catalog = await fetchCatalog(config);
  const season = seasonHint();
  const upcoming = upcomingEventsFR();

  const system = `Tu es directeur marketing de Poils Précieux, marque française premium d'accessoires chien & chat (dropshipping, boutique poilsprecieux.com).

Ta mission : définir le PLAN DE CONTENU de la semaine pour piloter un pipeline 100% automatisé (3 posts/jour Insta+FB+TikTok + 1 article blog/semaine). Tu ne suggères PAS de tournage manuel — tu choisis les angles que la machine va exécuter automatiquement.

Tu dois créer une cohérence éditoriale : un thème de semaine clair, des produits à pousser, des catégories de contenu à prioriser, en phase avec la saison et les événements.

Utilise web_search pour repérer les tendances pet FR du moment, requêtes Google montantes, sujets chauds.`;

  const user = `Catalogue actif Poils Précieux (handle | titre | type | prix) :
${catalog.map((p) => `${p.handle} | ${p.title} | ${p.type} | ${p.price}€`).join("\n").slice(0, 3500)}

Saison : ${season}
Événements à venir (14j) : ${upcoming.length ? upcoming.map((e) => `${e.name} (${e.daysAhead}j, ${e.angle})`).join(", ") : "aucun majeur"}

Définis le plan de la semaine ${weekNumber}. Return JSON :
{
  "themeOfWeek": "Thème éditorial de la semaine en 1 phrase (ex: 'Mue de printemps : focus brossage & démêlage')",
  "rationale": "2-3 phrases : pourquoi ce thème cette semaine (saison/événement/tendance)",
  "focusProductHandles": ["3 à 5 handles produits du catalogue ci-dessus à mettre en avant cette semaine, cohérents avec le thème"],
  "focusPexelsCategories": ["1-3 catégories parmi: toilettage, hygiene, alimentation, couchage — à prioriser pour les vidéos Pexels"],
  "preferSpecies": "chien | chat | null (si la semaine cible plutôt une espèce)",
  "blogAngle": "L'angle de l'article blog de la semaine en 1 phrase (titre de travail)",
  "blogPrimaryKeyword": "mot-clé SEO principal de l'article"
}`;

  const { data, citations, usage } = await researchJSON(config, {
    system,
    user,
    maxTokens: 3000,
    maxSearches: 4,
  });

  const plan = {
    weekNumber,
    generatedAt: new Date().toISOString(),
    season,
    upcomingEvents: upcoming,
    ...data,
  };
  return { plan, catalog, citations, usage };
}

/**
 * Écrit le plan dans projects/<projet>/weekly-plan.json.
 */
export function writeWeeklyPlan(config, plan) {
  fs.writeFileSync(planPath(config), JSON.stringify(plan, null, 2), "utf8");
  return planPath(config);
}

export function renderPlanMarkdown(plan) {
  let md = `# Plan stratégique — semaine ${plan.weekNumber}\n\n`;
  md += `Généré le ${plan.generatedAt.slice(0, 10)}\n\n`;
  md += `## Thème de la semaine\n\n**${plan.themeOfWeek}**\n\n${plan.rationale}\n\n`;
  md += `## Produits poussés cette semaine\n\n`;
  for (const h of plan.focusProductHandles || []) md += `- ${h}\n`;
  md += `\n## Catégories Pexels priorisées\n\n${(plan.focusPexelsCategories || []).join(", ")}\n\n`;
  md += `Espèce ciblée : ${plan.preferSpecies || "les deux"}\n\n`;
  md += `## Article blog de la semaine\n\n**Angle** : ${plan.blogAngle}\n**Mot-clé** : ${plan.blogPrimaryKeyword}\n\n`;
  md += `---\n\n*Ce plan pilote automatiquement les posts social + le blog de la semaine. Aucune action manuelle requise.*\n`;
  return md;
}
