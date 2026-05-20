// Génération de contenu de post (caption + image prompts + hashtags) via Claude.

import { claudeJSON } from "../claude/client.js";
import { selectHashtags } from "./themes.js";
import { generateImage } from "../images/openai.js";

const FORMAT_HINTS = {
  single: "1 single image post, square 1080x1080. Caption max 100 words.",
  carousel: "Carousel of 3-5 slides, each square 1080x1080. Caption introduces the carousel.",
  reel: "Vertical 9:16 single image (placeholder for video). Caption max 120 words, hook-driven.",
};

const SIZE_BY_FORMAT = {
  single: "1024x1024",
  carousel: "1024x1024",
  reel: "1024x1536",
};

/**
 * Génère un brief de contenu : caption + image prompt + hashtags.
 */
export async function generatePostContent(config, brandCharter, { theme, format, dayName }) {
  const sampleHashtags = selectHashtags(config, { category: "chien", count: 7 });

  const system = `You are the social media manager for Poils Précieux (French premium pet brand). You write Instagram + TikTok posts that match the brand charter.

BRAND CHARTER (key points):
${brandCharter.slice(0, 2500)}

POST FORMAT: ${format} — ${FORMAT_HINTS[format] || ""}
TODAY'S THEME: ${theme} (${dayName})

RULES:
- French native, factuel + bienveillant
- Caption: hook ligne 1 (5-10 mots), 1-2 phrases explicatives, utilité concrète
- No emoji stream. Max 1 emoji functional (e.g. point info) or zero
- No "✨ MAGIQUE ✨" or urgency
- Hashtags séparés en bas, 5-8 max`;

  const user = `Generate ONE post for today.

Thème : ${theme} → ${THEME_DETAIL[theme] || theme}

Return JSON:
{
  "hook": "ligne 1 hook (5-10 mots)",
  "caption": "Full caption FR, includes hook on first line, 80-150 words total",
  "hashtags": ["#tag1", "#tag2", ...] (5-8 hashtags FR-relevant — feel free to override the sample below),
  "imagePrompt": "Detailed English prompt for GPT-Image-1 to generate the hero image. Follow brand visual style (Scandinavian minimalism, beige, single subject, no text overlays). 1-2 sentences.",
  "category": "chien|chat|toilettage|alimentation|couchage|balade|jeu|other",
  "callToAction": "If applicable, soft CTA (e.g. 'Lien en bio', 'On en parle en stories'). Otherwise null.",
  "altText": "Image alt text for accessibility (FR, 1 sentence)"
}

Sample hashtag pool for inspiration: ${sampleHashtags.join(" ")}`;

  const { data, usage } = await claudeJSON(config, { system, user, maxTokens: 2000 });
  return { content: data, usage };
}

const THEME_DETAIL = {
  guide: "Pédagogie / how-to. Soit 1 conseil bien expliqué, soit 3-5 puces avec apprentissages.",
  produit: "Mise en avant d'un produit Poils Précieux, présenté par son utilité réelle (pas sa fiche tech).",
  astuce: "Astuce rapide en 1 visuel. Punchline + démonstration courte.",
  temoignage: "Style témoignage / avant-après. Concret, humain, peu vendeur.",
  communaute: "Question ouverte à la communauté. Poll-style, photo simple, engagement direct.",
  "behind-scenes": "Coulisses : sélection produit, équipe, supplier, processus. Authentique.",
  inspiration: "Image éditoriale pure, caption courte poétique. Pas de pitch produit.",
};

export async function generatePostImage(config, content, { format }) {
  const size = SIZE_BY_FORMAT[format] || "1024x1024";
  const buf = await generateImage(config, {
    prompt: content.imagePrompt,
    quality: "high",
    size,
    background: "opaque",
  });
  return { buffer: buf, size };
}
