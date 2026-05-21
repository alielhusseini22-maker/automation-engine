// Génération de caption ADAPTÉE à un média existant (vraie vidéo, vraie photo, ou photo produit).
// Ne génère JAMAIS d'histoire fictive de client. Cite uniquement ce que l'item brief décrit.
//
// Format-aware : un Reel a un hook 3 secondes qui doit retenir le scroll, une photo statique a
// un hook qui doit faire arrêter le scroll dans le feed. Patterns différents.

import { claudeJSON } from "../claude/client.js";
import { selectHashtags } from "./themes.js";

const VIRAL_HOOKS_FR = `
PATTERNS DE HOOK QUI FONCTIONNENT EN FR (pet content) :

Pour Reels/vidéos (3 premières secondes critiques) :
- "POV : ton chien voit la pluie pour la 1ère fois"
- "Tu fais ça à ton chat sans le savoir"
- "Avant de brosser ton chien, lis ça"
- "Ça change tout pour un cocker en mue"
- "Personne ne te dit ça à l'animalerie"
- "L'erreur que 90 % des proprios font le matin"
- "5 secondes pour comprendre pourquoi ton chat fait ça"

Pour photos statiques (scroll-stop visuel) :
- "Le rituel du soir." (court, statement)
- "Ce moment qu'on connaît tous." (collective)
- "Les chats ont ce talent." (observation)
- "Quand ton chien a enfin sa place."
- Question directe : "Est-ce que ton chat aussi dort comme ça ?"
- Mini-stat : "80 % des chiens à poils longs font des nœuds derrière les oreilles. Voici pourquoi."

RÈGLES HOOK :
- 5-12 mots max
- Jamais d'émoji en début
- Préférer concret (race, action) au générique (animal)
- Si tu commences par "tu", "ton" ou "votre" → instant identification
`;

const ENGAGEMENT_BAIT_FR = `
FIN DE CAPTION — boost engagement (l'algo récompense les commentaires/sauvegardes) :

Quand pertinent, finir par UN seul de ces patterns :
- Question ouverte : "Ton chat dort où, toi ?" / "Tu fais comment, toi ?"
- Invitation à sauver : "Garde ce post pour ton prochain brossage."
- Tag d'ami : "Tague le proprio d'un cocker qui galère avec les nœuds."
- Mini sondage : "Brosse en bois ou métal pour vous ?"
- Aveu collectif : "Avoue, ton chat fait ça aussi 👇"

Une seule de ces lignes en fin de caption. Pas toutes en même temps.
`;

/**
 * Construit la caption + hashtags pour un post, à partir d'un brief décrivant le média.
 *
 * @param {object} config
 * @param {string} brandCharter
 * @param {object} args
 * @param {object} args.dayTheme - { dayName, theme, format }
 * @param {object} args.brief - description du contenu (cf types ci-dessous)
 */
export async function captionFromBrief(config, brandCharter, { dayTheme, brief }) {
  const system = `You are the social media strategist for Poils Précieux, a French premium pet brand. Your job: turn real pet content into scroll-stopping social posts that drive engagement and store traffic.

BRAND CHARTER (extract):
${brandCharter.slice(0, 2500)}

${VIRAL_HOOKS_FR}

${ENGAGEMENT_BAIT_FR}

ABSOLUTE RED LINES (never violate):
1. NEVER invent customers ("Claire", "Mathieu"), fake testimonials, or fake pet stories. Only mention pet/owner details IF they appear in the brief.
2. NEVER claim a post is from a customer unless brief.meta.isRealTestimonial === true.
3. NEVER write things absent from the actual media (no "regardez slide 3" if format !== "carousel").
4. NEVER use "✨", "🔥", urgency tactics, "Bestseller!", "Hot sale!", "Plus que X en stock !!".
5. NEVER use anglicismes superflus ("shooter", "engager la community", "ASAP").

WRITING RULES:
- French native, factuel + bienveillant
- Caption length 60-150 words MAX
- Phrases courtes (10-18 mots moyennes)
- Toujours finir par une utilité concrète OU une question d'engagement
- 0 ou 1 émoji max dans toute la caption (jamais en début de phrase)
- Si product mentioned dans brief → l'évoquer naturellement par son utilité, pas son nom commercial seul

FORMAT-SPECIFIC:
- "reel" (vidéo verticale 9:16) → hook 3 secondes obligatoire, structure : Hook (1 phrase) + Tension/insight (1-2 phrases) + Résolution/payoff (1-2 phrases) + Engagement bait (1 ligne)
- "single" (photo statique 1:1) → hook scroll-stop (statement court ou question), 2-4 phrases de substance, fin engagement
- "carousel" (3-5 slides) → hook = teaser de ce que la suite révèle ("Voici les 3 erreurs ↓"), caption synthétise les insights de TOUTES les slides

HASHTAG STRATEGY:
- 5-8 hashtags max
- Pyramide d'audience : 2 core brand + 2-3 high-volume FR pet + 2-3 niche/long-tail
- Toujours #poilsprecieux + #poilsprecieuxfr en core
- High-volume FR (boost discovery) : #chien #chat #chienenfrance #chatenfrance #petlovers
- Niche/long-tail (qualified traffic) : #brossagechien #brossagechat #cockerspaniel #chiensenior #chathaut #poilslongs #toilettagemaison
- Si race mentionnée dans le brief → toujours inclure le hashtag race (#cockerspaniel #shiba #maincoon...)
- Adapter au theme du jour`;

  const briefSummary = renderBriefForPrompt(brief);

  const user = `Generate ONE social media post for today, optimized for ${dayTheme.format} format.

DAY THEME: ${dayTheme.theme} (${dayTheme.dayName})
FORMAT: ${dayTheme.format}
GOAL: Drive engagement (saves, comments, profile visits → bio link → poilsprecieux.com)

CONTENT BRIEF (the media that will be posted — write caption STRICTLY AROUND this):
${briefSummary}

Return JSON:
{
  "hook": "hook line 5-12 words, format-appropriate (Reel = 3sec stopper, Static = scroll-stop)",
  "caption": "Full FR caption with hook on line 1. Structure depends on format. 60-150 words total. ENDS with engagement bait or soft CTA.",
  "hashtags": ["#tag1", "#tag2", ...] (5-8, pyramide brand + high-volume + niche),
  "category": "chien|chat|toilettage|alimentation|couchage|balade|jeu|other",
  "engagementBait": "the last line of the caption (question/save/tag prompt)",
  "altText": "FR alt text 1 phrase describing the visual for accessibility",
  "suggestedMusic": "If Reel: a generic mood description (e.g. 'soft acoustic guitar, lo-fi') — Buffer can't set music but the user might add manually. Else null.",
  "viralScore1to10": integer with brief 1-sentence justification {score: int, reason: string}
}`;

  const { data } = await claudeJSON(config, { system, user, maxTokens: 2000 });

  if (!data.hashtags || data.hashtags.length < 4) {
    data.hashtags = selectHashtags(config, { category: data.category, count: 7 });
  }
  return data;
}

function renderBriefForPrompt(brief) {
  if (brief.type === "queue") {
    const m = brief.meta || {};
    return `Type: REAL content from brand queue (founder-owned video or photo)
Context: ${m.context || "(no context provided)"}
Pet name: ${m.petName || "—"}
Pet breed: ${m.petBreed || "—"}
Pet species: ${m.petSpecies || "—"}
Product mentioned: ${m.productMentioned || "—"}
Media type: ${brief.mediaType}
Real testimonial?: ${m.isRealTestimonial ? "YES — based on real customer feedback, you may attribute to that customer if name provided" : "NO — generic brand content, do NOT attribute to a customer"}
CTA link in bio: ${m.ctaLinkInBio ? "yes — end with 'Lien en bio.' or equivalent" : "no — pure value content"}

Caption MUST reference real elements only (the pet name if provided, the breed if provided, the context as observed).`;
  }
  if (brief.type === "pexels") {
    return `Type: STOCK video/photo from Pexels (real footage but not brand-owned)
Search query: ${brief.query}
Pexels description: ${brief.description || "—"}
Photographer credit: ${brief.photographer || "—"}
Media type: ${brief.mediaType}

CRITICAL: This is generic real footage, NOT the brand's pet. Caption MUST frame this as inspiration/observation, not as "voici Nougat" or "Claire et son chien".
Examples of correct framing:
- "Quand un chien trouve sa place préférée…"
- "Ce moment de calme qu'on cherche tous pour son chat."
- "Une routine du soir simple change tout."
DO NOT name a pet, owner, or location. DO NOT pretend this is brand-authored.
End with a soft observation or question to community.`;
  }
  if (brief.type === "shopify-product-promo") {
    return `Type: NEW PRODUCT LAUNCH PROMO
Product: ${brief.title}
Product type: ${brief.productType}
Price: ${brief.price} ${brief.currency}
Real description (cleaned): ${brief.description}

Write a caption that:
1. Hook: state the REAL utility/problem this product solves (not just the product name)
2. 1-2 sentences explaining WHO it's for + WHEN it matters
3. Mention price casually (not aggressive)
4. CTA: "Disponible sur poilsprecieux.com — lien en bio." or similar soft variant
ABSOLUTELY NO invented customer story.`;
  }
  if (brief.type === "shopify-product-usage") {
    return `Type: FACTUAL product use case (pedagogy, NO customer story)
Product: ${brief.title}
Description: ${brief.description}
Use case angle: ${brief.useCaseAngle || "Explain when and why this product is useful"}

Write a factual, helpful caption explaining WHEN this product becomes useful. Style examples:
- "Sur un chien à poils longs comme un cocker, la brosse à picots arrondis change tout quand…"
- "Le tapis Frosty est pensé pour les chiens qui supportent mal la chaleur. Sortez-le quand…"
- "Pour un chaton qui vient d'arriver, voici à quoi sert ce coussin chauffant…"
Pure pédagogie, jamais d'histoire client inventée.`;
  }
  return `Type: unknown brief — generate generic but on-brand post for theme ${brief.theme || "general"}.`;
}
