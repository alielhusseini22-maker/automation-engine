// Génération de l'image hero pour un article blog (réutilise la logique du tool image).
// Reprend les heuristiques par mots-clés de blog-prompts.js mais centralisé ici.

import { generateImage } from "../images/openai.js";

const BRAND_STYLE = `Premium editorial photography for a French pet brand blog (Poils Précieux).
Style: Scandinavian minimalism, ambient natural light, soft shadows.
Palette: warm beige #F4EDE3, cream #FFFAF1, white #FFFFFF, soft taupe accents.
Composition: single subject, generous negative space, balanced.
Mood: serene, refined, educational.
NO text overlays, NO logos, NO captions, NO infographics.
Photorealistic, magazine quality. Landscape 3:2.
Subjects are pets (dogs, cats) or pet-related lifestyle objects.`;

const KEYWORD_SUBJECTS = [
  { keys: /brosse|brossage|poil/i, subject: "A close-up of a wooden grooming brush resting on warm beige linen next to a soft tuft of dog or cat fur. Soft side daylight." },
  { keys: /dent|tartre|hygi.ne.*buccale/i, subject: "A serene dog or cat being gently held by a hand, mouth slightly open in calm relaxation. Beige background." },
  { keys: /litière|griff|coupe-griffe/i, subject: "A calm cat sitting on a cream linen surface near a beige ceramic litter scoop. Side daylight." },
  { keys: /chiot|jeune.*chien/i, subject: "A small fluffy puppy sitting on a beige blanket, looking up curiously. Soft natural light." },
  { keys: /chaton|jeune.*chat/i, subject: "A small kitten on a cream linen surface, gentle pose, calm. Natural light, beige tones." },
  { keys: /senior|.g./i, subject: "A calm older dog or cat resting on a cream linen blanket, eyes closed, peaceful. Warm window light." },
  { keys: /promenade|sortie|laisse|harnais/i, subject: "A leather leash and harness arranged on warm sandstone or pale wood, soft daylight. Editorial flat-lay." },
  { keys: /lit|couchage|sommeil|dormir|coussin/i, subject: "A plush cream dog bed on warm wooden floor near a window, soft daylight streaming, folded blanket." },
  { keys: /eau|hydra|fontaine|boire/i, subject: "A ceramic water bowl on a beige linen surface, with a small cat or dog visible in the soft-focus background drinking." },
  { keys: /jouet|jeu|stimul|ennui/i, subject: "A wooden pet toy and a small rope toy in natural fibers arranged on beige linen." },
  { keys: /voyage|transport|train|voiture/i, subject: "A canvas pet carrier bag and a folded blanket on a wooden floor near a window." },
  { keys: /alimenta|gamelle|nourri|repas/i, subject: "Two ceramic pet bowls on a beige linen runner, one with dry food, one with water, arranged with intention." },
  { keys: /stress|anxi|calme/i, subject: "A serene calico cat curled on a cream blanket near a sunlit window, eyes closed peacefully." },
  { keys: /canicule|chaud|chaleur|.t./i, subject: "A dog or cat resting on a beige cooling mat near a window, soft summer daylight, calm." },
  { keys: /hiver|froid|veste|manteau/i, subject: "A small dog wearing a cream wool sweater, sitting on a beige blanket near a window." },
];

export function promptForTopic(title, summary = "") {
  const fullText = `${title} ${summary}`;
  for (const rule of KEYWORD_SUBJECTS) {
    if (rule.keys.test(fullText)) {
      return `${BRAND_STYLE}\n\nSUBJECT: ${rule.subject}\n\nMust feel coherent with Poils Précieux : beige tones, side daylight, minimal composition, premium editorial.`;
    }
  }
  return `${BRAND_STYLE}\n\nSUBJECT: A calm pet (small dog or cat) on a cream linen surface near a window, soft natural light, beige tones, editorial composition. Theme: ${summary.slice(0, 160)}.\n\nMust feel coherent with Poils Précieux.`;
}

/**
 * Génère l'image hero. Priorité au prompt fourni par Claude (`topic.imagePrompt`),
 * fallback heuristique mots-clés si absent.
 */
export async function generateHero(config, topicOrLegacy) {
  // Back-compat : si on reçoit { title, summary } sans imagePrompt → heuristique mots-clés
  const legacyMode = !topicOrLegacy.imagePrompt;
  let prompt;

  if (legacyMode) {
    prompt = promptForTopic(topicOrLegacy.title, topicOrLegacy.summary || "");
  } else {
    // Mode recommandé : Claude a fourni un prompt contextualisé qui matche l'espèce/sujet
    prompt = `${BRAND_STYLE}\n\nSUBJECT (from article context): ${topicOrLegacy.imagePrompt}\n\nThe image must feel coherent with Poils Précieux : beige tones, side daylight, minimal composition, premium editorial. NO text, NO logos.`;
  }

  const buf = await generateImage(config, {
    prompt,
    quality: "high",
    size: "1536x1024",
    background: "opaque",
  });
  return { buffer: buf, prompt };
}
