// Génération de caption ADAPTÉE à un média existant (vraie vidéo, vraie photo, ou photo produit).
// Ne génère JAMAIS d'histoire fictive de client. Cite uniquement ce que l'item brief décrit.

import { claudeJSON } from "../claude/client.js";
import { selectHashtags } from "./themes.js";

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
  const system = `You are the social media manager for Poils Précieux, a French premium pet brand.

BRAND CHARTER:
${brandCharter.slice(0, 2500)}

ABSOLUTE RULES — NEVER violate:
1. NEVER invent customer testimonials, fake names, fake pet stories, or fake reviews. Le client n'existe pas tant qu'on n'a pas son retour réel.
2. NEVER claim the post is from a customer ("Claire nous a écrit", "Mathieu a essayé") unless the brief explicitly says "isRealTestimonial: true".
3. ALWAYS write the caption AROUND the actual media described in the brief — never describe things not in the media.
4. NEVER reference "slide 2", "swipe", "carousel" unless format === "carousel" AND there are multiple slides.
5. NEVER use "✨", urgency tactics, "Bestseller!", "Hot sale!".

WRITING RULES:
- French native, factuel + bienveillant
- Caption: hook line 1 (5-12 words), 1-3 sentences body, optional soft CTA
- Total length: 60-150 words
- Tone matches brand charter section 4

Hashtag rules:
- 5-8 hashtags max
- Core: #poilsprecieux #poilsprecieuxfr (always include)
- Then category-specific in French (chien/chat/brossage/etc.)`;

  const briefSummary = renderBriefForPrompt(brief);

  const user = `Generate ONE social media post for today.

DAY THEME: ${dayTheme.theme} (${dayTheme.dayName})
FORMAT: ${dayTheme.format}

CONTENT BRIEF (the media that will be posted — write caption AROUND this, don't invent):
${briefSummary}

Return JSON:
{
  "hook": "hook line 5-12 words",
  "caption": "Full FR caption, hook on line 1, 60-150 words total",
  "hashtags": ["#tag1", ...] (5-8),
  "category": "chien|chat|toilettage|alimentation|couchage|balade|jeu|other",
  "callToAction": "Soft CTA in caption end if applicable, or null",
  "altText": "FR alt text 1 phrase describing the image/video for accessibility"
}`;

  const { data } = await claudeJSON(config, { system, user, maxTokens: 2000 });

  // Sécurité : si Claude oublie les hashtags, on tape dans le pool projet
  if (!data.hashtags || data.hashtags.length < 4) {
    data.hashtags = selectHashtags(config, { category: data.category, count: 7 });
  }
  return data;
}

/**
 * Rend le brief sous forme texte pour le prompt Claude.
 * 4 types de brief : queue / pexels / shopify-product-promo / shopify-product-usage
 */
function renderBriefForPrompt(brief) {
  if (brief.type === "queue") {
    const m = brief.meta || {};
    return `Type: real content from brand queue (video or photo authored by the brand or community)
Context: ${m.context || "(no context provided)"}
Pet name: ${m.petName || "—"}
Pet breed: ${m.petBreed || "—"}
Pet species: ${m.petSpecies || "—"}
Product mentioned: ${m.productMentioned || "—"}
Media type: ${brief.mediaType}
Real testimonial?: ${m.isRealTestimonial ? "yes — based on real customer feedback" : "no — generic brand content"}
CTA link in bio: ${m.ctaLinkInBio ? "yes — end with 'Lien en bio.'" : "no"}`;
  }
  if (brief.type === "pexels") {
    return `Type: stock video/photo from Pexels (real footage but not brand-produced)
Search query used: ${brief.query}
Description from Pexels: ${brief.description || "—"}
Photographer credit: ${brief.photographer || "—"}
Media type: ${brief.mediaType}

IMPORTANT: This is stock content, not the brand's own. The caption MUST NOT claim it's brand-produced or feature a specific pet. Frame it as inspiration or general observation. Examples:
- "Quand un chat trouve sa place préférée…"
- "Ce moment de calme qu'on cherche tous pour notre chien."
- "Une routine simple, le soir, change tout."
DO NOT name a pet, owner, or location.`;
  }
  if (brief.type === "shopify-product-promo") {
    return `Type: new product launch promo
Product title: ${brief.title}
Product type: ${brief.productType}
Price: ${brief.price} ${brief.currency}
Description (cleaned): ${brief.description}

Write a promo caption that highlights the REAL utility of this product. Don't invent customer stories. Mention price casually. End with CTA "Disponible sur poilsprecieux.com — lien en bio."`;
  }
  if (brief.type === "shopify-product-usage") {
    return `Type: factual product use case (no customer story, pure product education)
Product: ${brief.title}
Description: ${brief.description}
Use case angle: ${brief.useCaseAngle || "Explain when and why this product is useful"}

Write a factual caption explaining when this product is useful. Examples of style:
- "Sur un chien à poils longs comme un cocker, voici quand utiliser X..."
- "Le tapis Frosty est pensé pour les chiens qui supportent mal la chaleur. Sortez-le quand..."
ABSOLUTELY NO invented customers. Pure pedagogy.`;
  }
  return `Type: unknown — generate a generic but on-brand post for theme ${brief.theme || "general"}.`;
}
