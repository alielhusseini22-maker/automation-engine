// Direction artistique cinématographique pour les prompts vidéo IA.
// Objectif : générer des Reels qui ressemblent à des vidéos téléphone humaines,
// pas à des assets IA mous. Cinematic but intime.

const FILM_LOOK = `Cinematic 9:16 vertical mobile-shot aesthetic. Shallow depth of field, soft natural window light from the left (golden hour quality), warm beige and cream tones throughout the scene, subtle film grain, handheld phone feel (very slight natural camera motion). NO text overlays, NO logos, NO graphics. Photorealistic, not stylized, not animated, not cartoon.`;

const PET_DIRECTION = `Realistic pet behavior — the animal moves like a real animal, not an exaggerated cartoon. Authentic emotion, calm intimate moment. Camera focuses on subtle micro-actions (ear twitch, slow blink, paw flex, head tilt) rather than dramatic action.`;

const ANTI_AI_TELL = `Avoid uncanny features: no extra paws, no morphing fur, no impossible anatomy, no glowing eyes, no plastic skin. The pet must look like a documentary still of a real dog or cat.`;

const BRAND_AESTHETIC = `Setting: Scandinavian minimalist interior — warm cream linen surface, oak wood floor, neutral beige walls, soft daylight from a window. Visible accessories must be premium and minimal : one wooden grooming brush, one cream linen blanket, one ceramic beige bowl. Tactile, lived-in but uncluttered.`;

/**
 * Banque de prompts cinématographiques par thème.
 * Chaque entrée = un mini-scénario tournable, varié, brand-aligned.
 * L'engine pioche aléatoirement pour éviter la répétition.
 */
export const VIDEO_PROMPTS = {
  tendresse: [
    {
      title: "Cocker brossage soir",
      prompt: `A serene long-haired golden cocker spaniel lying calmly on a cream linen surface, head resting on its paws, eyes slowly closing as a human hand gently brushes the long ear fur with a wooden bristle brush. Soft warm side window light. Five seconds of micro-action: the cocker exhales, the ear fur lifts slightly with the brush stroke. Intimate, peaceful, late afternoon mood.`,
      species: "chien",
      duration: 5,
    },
    {
      title: "Chat tabby fenêtre",
      prompt: `A brown tabby cat sitting on a warm beige linen-covered cushion next to a window, sunbeam catching the fur. Five seconds: the cat slowly closes its eyes (slow blink — the cat trust signal), tail tip flicks once gently. Background softly blurred — a wooden floor, a folded cream blanket. Window light warm and golden. Intimate, calm, observational.`,
      species: "chat",
      duration: 5,
    },
    {
      title: "Chiot golden cuddle",
      prompt: `A small golden retriever puppy (8-10 weeks) nestled in a cream linen blanket on a wooden floor, only its head and front paws visible. The puppy looks up at the camera with sleepy eyes, then stretches one paw forward and yawns. Soft morning daylight. Beige and cream tones. Five seconds of pure tenderness.`,
      species: "chien",
      duration: 5,
    },
    {
      title: "Chaton calico panier",
      prompt: `A small calico kitten curled inside a wicker basket lined with a cream knit blanket. Five seconds: the kitten lifts its head, looks at the camera with curious eyes, then settles back down with a soft yawn. Warm afternoon light filters in. Beige wooden floor visible at the bottom of the frame. Intimate documentary feel.`,
      species: "chat",
      duration: 5,
    },
  ],

  inspiration: [
    {
      title: "Chien cocon plaid",
      prompt: `A small dog (Cavalier King Charles or similar gentle breed) deeply asleep curled on a thick cream knit blanket placed on an oak wood floor. Soft golden window light. Five seconds: the dog's chest rises and falls slowly, one ear twitches slightly. No movement otherwise. Pure calm. Beige walls in background, completely uncluttered.`,
      species: "chien",
      duration: 5,
    },
    {
      title: "Chat lit moelleux",
      prompt: `A fluffy beige-and-white cat (Ragdoll or longhair domestic) sprawled belly-up on a plush cream-colored round pet bed, paws relaxed in the air. Five seconds: the cat slowly turns its head toward the camera, blinks once, then settles back. Soft natural daylight. The setting is a minimalist interior with warm wood floor and beige walls.`,
      species: "chat",
      duration: 5,
    },
    {
      title: "Chien lecture",
      prompt: `An adult medium-sized dog (Whippet or similar lean breed, beige coat) lying calmly on its side on a cream rug, head resting on its front paws. Beside the dog, a partially visible open book and a steaming mug of coffee. Five seconds: the dog's eyes are closed, ear twitches once, deep breath cycle. Soft afternoon window light. Intimate quiet moment.`,
      species: "chien",
      duration: 5,
    },
  ],

  "behind-scenes": [
    {
      title: "Brossage gros plan",
      prompt: `Close-up macro view of a wooden grooming brush running gently through long golden fur on a beige linen surface. Five seconds of slow brush motion — the bristles separate the fur, a few loose strands gather between bristles. Soft natural side light. No human face visible, just the brush and the fur. Documentary close-up, cinematic shallow depth of field.`,
      species: null,
      duration: 5,
    },
    {
      title: "Préparation gamelle",
      prompt: `Close-up: a hand carefully scooping dry kibble from a paper bag into a matte beige ceramic bowl on a warm wooden countertop. Five seconds: the scoop tips, kibble falls, the bowl settles. Side daylight. Background softly blurred, beige tones. Premium kitchen aesthetic, no labels visible.`,
      species: null,
      duration: 5,
    },
    {
      title: "Tapis préparation",
      prompt: `A pair of hands gently smoothing out a cream-colored pet bed cushion on a wooden floor, fluffing it to make it inviting. Five seconds: the hands pat the cushion, then a small dog softly steps into frame and circles before settling down. Soft golden window light. Intimate moment of preparing a comfortable space.`,
      species: "chien",
      duration: 5,
    },
  ],

  astuce: [
    {
      title: "Chat fontaine",
      prompt: `A serene grey-and-white cat approaches a sleek ceramic water fountain on a wooden floor. Five seconds: the cat sniffs cautiously, then dips its head to drink, soft splash on its whiskers. Side daylight, beige minimal interior in background. Documentary observational. The fountain looks premium, made of matte beige ceramic.`,
      species: "chat",
      duration: 5,
    },
    {
      title: "Lave-pattes",
      prompt: `Close-up of a dog's muddy paw being gently lowered into a cylindrical paw-washing cup filled with water on a wooden floor. Five seconds: the paw rotates slowly inside the cup, water swirls, a hand from above stabilizes the dog's leg. The paw emerges clean. Soft daylight, kitchen entryway setting.`,
      species: "chien",
      duration: 5,
    },
  ],

  guide: [
    {
      title: "Portrait race",
      prompt: `Studio portrait quality view of a beautiful long-haired dog (English cocker spaniel or similar) sitting calmly on a beige linen backdrop. Five seconds: the dog turns its head slightly toward the camera, ears lifting in attention, eyes meeting lens. Soft three-quarter portrait lighting. Editorial premium pet brand aesthetic. Subject takes up 70% of frame, centered.`,
      species: "chien",
      duration: 5,
    },
  ],

  communaute: [
    {
      title: "Câlin chien",
      prompt: `A close-up over-the-shoulder view of a person (face mostly out of frame, only the chin and jaw visible) hugging a medium-sized dog (Labrador or golden) who closes its eyes contentedly. Five seconds: the dog's tail wags gently behind, the person gently scratches behind the ear. Warm window light, beige minimal interior, intimate moment.`,
      species: "chien",
      duration: 5,
    },
  ],
};

/**
 * Pioche aléatoirement un prompt vidéo pour un thème + species donné(s).
 * @param {string} theme
 * @param {string|null} species - "chien"|"chat"|null (any)
 */
export function pickVideoPrompt(theme, species = null) {
  const pool = VIDEO_PROMPTS[theme] || VIDEO_PROMPTS.tendresse;
  let candidates = pool;
  if (species) {
    candidates = pool.filter((p) => !p.species || p.species === species);
    if (candidates.length === 0) candidates = pool;
  }
  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  return buildFullPrompt(picked);
}

/**
 * Combine le prompt scénario avec la direction artistique brand.
 */
function buildFullPrompt(scenario) {
  const fullPrompt = `${scenario.prompt}

${FILM_LOOK}

${PET_DIRECTION}

${BRAND_AESTHETIC}

${ANTI_AI_TELL}`;

  return {
    title: scenario.title,
    prompt: fullPrompt,
    species: scenario.species,
    duration: scenario.duration || 5,
  };
}

/**
 * Construit un prompt vidéo CUSTOM depuis un contexte arbitraire (utilisé par auto-promo produit).
 */
export function buildCustomVideoPrompt({ scenario, species = null, duration = 5 }) {
  return {
    title: "custom",
    prompt: `${scenario}\n\n${FILM_LOOK}\n\n${PET_DIRECTION}\n\n${BRAND_AESTHETIC}\n\n${ANTI_AI_TELL}`,
    species,
    duration,
  };
}
