// Choix de sujet d'article hebdomadaire selon la rotation thématique du projet.
// Évite les doublons en consultant les articles existants.

import { researchJSON } from "../claude/research.js";

const ROTATION_PROMPTS = {
  "guide-pratique": "Choose a practical how-to topic for pet owners that helps solve a common, mildly painful problem. Examples: how to brush a long-haired cat, how to clip dog nails without stress, how to introduce a new bed.",
  "comparatif-produits": "Choose a comparison/buyer-guide topic that helps a customer pick between options. Examples: which brush for short vs long hair, which type of bed for senior dogs, electric vs manual nail clipper.",
  "saisonnier": "Choose a seasonally-relevant topic for the current season in France. Spring/summer: cooling, allergies, fleas. Autumn: shedding, paw care. Winter: cold-weather gear, indoor stimulation.",
  "sante-conseil": "Choose a preventative health topic owners can address at home before vet visits. Examples: dental tartar prevention, ear cleaning, weight monitoring, anxiety signs.",
};

export function getNextTopicCategory(config, weekNumber) {
  const rotation = config.blog?.topicRotation || ["guide-pratique", "comparatif-produits", "saisonnier", "sante-conseil"];
  return rotation[(weekNumber - 1) % rotation.length];
}

/**
 * Demande à Claude (avec web_search) de proposer 1 sujet d'article, en évitant les doublons.
 */
export async function pickTopic(config, { existingTitles = [], weekNumber, locale = "fr-FR" }) {
  const category = getNextTopicCategory(config, weekNumber);
  const seasonHint = currentSeasonHint();

  const system = `You are a content strategist for the French pet brand Poils Précieux. You select weekly blog topics that drive organic search traffic in France.

Audience: French dog & cat owners 25-45 yo, urban, premium-leaning.
Tone : factuel + bienveillant. Pas survendu.`;

  const user = `Select ONE blog article topic for this week.

Category rotation this week: **${category}**
Topic hint: ${ROTATION_PROMPTS[category]}
Season context: ${seasonHint}

AVOID titles too close to these existing articles (no duplicates):
${existingTitles.map((t) => `- ${t}`).join("\n")}

Use web_search to find what French pet owners are searching for right now (Google Trends FR, social mentions, common questions).

Return JSON with:
{
  "title": "Titre français du chapeau, 50-70 caractères, accroche SEO",
  "handle": "kebab-case-handle-sans-accents",
  "metaDescription": "140-160 caractères pour SEO",
  "category": "${category}",
  "primaryKeyword": "mot-clé principal court",
  "secondaryKeywords": ["3 à 5 keywords associés"],
  "audience": "Profil ciblé en 1 phrase",
  "uniqueAngle": "Pourquoi ce sujet est intéressant cette semaine (1-2 phrases)",
  "estimatedSearchVolumeFR": "low|medium|high",
  "species": "chien | chat | both — quelle espèce est sujet de l'article",
  "outline": [
    { "h2": "Section 1 title", "summary": "1 phrase" },
    { "h2": "Section 2 title", "summary": "1 phrase" },
    { "h2": "Section 3 title", "summary": "1 phrase" },
    { "h2": "Section 4 title", "summary": "1 phrase" }
  ],
  "productAnchorIdeas": ["Quels produits Poils Précieux mentionner brièvement (mascot names)"],
  "imagePrompt": "Detailed English prompt for GPT-Image-1 to generate the hero image. CRITICAL: must match the article's species (if article is about dogs, image MUST show a dog, not a cat; if about cats, MUST show a cat). Reference the specific topic (e.g. if about ticks, show a vet/owner inspecting fur outdoors; if about brushing, show a brush + fur tuft; if about a bed, show a cozy bed). Style: Scandinavian minimalism, warm beige #F4EDE3 and cream tones, soft natural daylight, single subject, generous negative space, NO text overlay, NO logos, photorealistic editorial. Landscape 3:2. 2-3 sentences max."
}`;

  const { data, citations, usage } = await researchJSON(config, {
    system,
    user,
    maxTokens: 4000,
    maxSearches: 4,
  });
  return { topic: data, citations, usage };
}

function currentSeasonHint() {
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) return "printemps en France — réveil mues, allergies pollen, sortie";
  if (m >= 5 && m <= 7) return "été en France — chaleur, hydratation, tique/puces, voyage";
  if (m >= 8 && m <= 10) return "automne en France — mue, retour pluie, tartre";
  return "hiver en France — froid, intérieur, stimulation, anti-anxiété";
}
