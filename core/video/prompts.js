// Direction artistique cinématographique pour la génération vidéo IA (Minimax Hailuo 02 / Luma / Kling).
// Objectif : Reels qui ressemblent à de vrais clips téléphone humains. Vraies actions visibles, pas juste micro-mouvements.

const FILM_LOOK = `Shot on a modern smartphone in 9:16 vertical, HDR, shallow depth of field, soft natural daylight from a side window casting warm golden light. Cinematic but intimate — slight handheld camera movement, breathing feel. Film grain subtle. Color grade: warm beige and cream tones throughout. NO text overlays, NO logos, NO graphics overlaid.`;

const REALISM_BAR = `Hyperrealistic, indistinguishable from a real iPhone 16 Pro recording. The animal's behavior must look documentary-grade: real anatomy, real fur physics (individual hairs catch the light), real eye reflections, real breathing, real micro-expressions. The motion must be physically plausible — no morphing, no extra limbs, no glowing eyes, no plastic skin texture.`;

const BRAND_SETTING = `Setting: Scandinavian minimalist Parisian apartment interior — warm oak wood floor, cream linen drape, beige walls. Visible accessories must be premium and tasteful (no clutter): one wooden bristle brush, one cream knit blanket, one matte beige ceramic bowl. Lived-in but uncluttered. Soft natural daylight from a window on the left.`;

const ANTI_AI = `Critical: avoid all AI tells. NO morphing fur, NO extra paws or limbs, NO impossible anatomy, NO glowing or symmetrical eyes, NO plastic skin, NO weird teeth, NO floating accessories, NO inconsistent lighting. If the animal moves toward the camera, its size scales correctly. If a hand enters the frame, it has five fingers in correct anatomy.`;

/**
 * Banque de scénarios cinématographiques.
 * Format : action visible + direction caméra explicite + durée 6-10s.
 * Plus de motion réelle que dans la v1 (lick the camera, jump on bed, run in frame, etc.)
 */
export const VIDEO_PROMPTS = {
  tendresse: [
    {
      title: "Cocker s'approche de la caméra",
      prompt: `A golden English cocker spaniel with long wavy fur lies on a cream linen blanket. The camera holds still on its sleepy face. The cocker slowly lifts its head, looks directly into the lens with soft brown eyes, then leans forward and gently licks the camera. The lens slightly fogs from breath. Six seconds of warm tender contact. Beige interior background softly blurred.`,
      species: "chien",
      duration: 6,
    },
    {
      title: "Chat saute sur le lit",
      prompt: `A handheld phone shot of a cream-and-beige longhair cat (Ragdoll or Maine Coon) standing on a wooden floor next to a fluffy cream pet bed. The cat looks up at the camera, then in one fluid motion leaps onto the bed, lands softly, walks two steps, and curls up in a perfect circle. The camera slowly pushes in to frame the cat's contented face. Six seconds total. Soft window light warming the fur.`,
      species: "chat",
      duration: 6,
    },
    {
      title: "Chiot golden court vers caméra",
      prompt: `A small golden retriever puppy (8-10 weeks, fluffy cream coat) bounds clumsily across a wooden floor toward the camera. The phone is held low, almost at floor level. The puppy reaches the camera, tries to lick the lens, tumbles slightly, then sits down looking up with big curious eyes. Tail wagging visibly throughout. Six seconds of pure puppy energy. Soft natural light.`,
      species: "chien",
      duration: 6,
    },
    {
      title: "Brossage cocker mains visibles",
      prompt: `A handheld phone shot, slight overhead angle, of a golden cocker spaniel lying calmly on a cream linen surface. A human hand (visible in frame, light skin) holds a wooden bristle grooming brush and strokes slowly through the long wavy ear fur of the dog. The fur lifts and falls with each brush stroke, individual hairs visible. The cocker's eyes close in pleasure, then a small contented sigh visible in its chest rise. Six seconds. Warm afternoon window light.`,
      species: "chien",
      duration: 6,
    },
    {
      title: "Chat tabby slow blink ralenti",
      prompt: `Extreme close-up on the face of a brown mackerel tabby cat. The cat looks directly at the camera, then performs a deliberate slow blink — eyes closing fully, then opening. The camera holds steady at face level. Six seconds, but the slow blink takes 3-4 seconds, intensely intimate. Sun-warm light catches the golden eyes and individual whiskers.`,
      species: "chat",
      duration: 6,
    },
  ],

  inspiration: [
    {
      title: "Chien soupire et s'enfonce",
      prompt: `Wide handheld phone shot of a small adult dog (Cavalier King Charles, ruby coat) curled on a thick cream knit blanket on an oak floor. Sunbeam crosses the frame from the left window. Six seconds: the dog lets out a visible deep sigh (chest rises and falls), shifts position to nuzzle deeper into the blanket, tucks its nose under its paw, and settles. Camera slowly pushes in 20%. Calm cozy afternoon energy.`,
      species: "chien",
      duration: 6,
    },
    {
      title: "Chat étire sur lit moelleux",
      prompt: `A fluffy beige-and-white ragdoll cat lies belly-up on a plush cream round pet bed in a sunlit corner of a minimalist apartment. Six seconds: the cat suddenly stretches dramatically — front paws extend forward, back arches, then it rolls onto its side and looks at the camera with relaxed eyes. The camera holds steady at floor level. Visible whisker movement, eye contact at the end. Warm window light.`,
      species: "chat",
      duration: 6,
    },
    {
      title: "Chien lecture bouge oreilles",
      prompt: `Wide shot of an adult whippet (beige coat, lean) lying on a cream rug. Beside the whippet, an open hardcover book and a steaming ceramic mug. Six seconds: the whippet's ears swivel toward a sound off-camera (responding to something), it lifts its head, looks toward the source, then settles back down with a soft exhale. Soft afternoon side light. Cozy book-with-dog atmosphere.`,
      species: "chien",
      duration: 6,
    },
  ],

  "behind-scenes": [
    {
      title: "Brossage cocker close-up dynamique",
      prompt: `Extreme close-up macro of a wooden bristle brush running through long golden cocker spaniel ear fur on a beige linen surface. Six seconds: the brush enters frame from the right, slowly strokes downward through the wavy fur, bristles separating individual strands of hair. A few loose hairs gather visibly in the bristles. The brush exits frame and re-enters for a second stroke. Soft natural side light. The texture of every hair visible. Documentary close-up.`,
      species: null,
      duration: 6,
    },
    {
      title: "Préparation gamelle céramique",
      prompt: `Handheld phone shot, slight overhead, of a hand pouring premium dry kibble from a brown paper bag into a matte beige ceramic bowl on a warm wood countertop. Six seconds: the bag tilts, the kibble flows in a controlled stream, fills the bowl 1/3, the hand straightens the bag, taps it to free remaining kibble, then sets it down. The bowl sits next to a small wooden water bowl. Side natural daylight. Premium kitchen aesthetic.`,
      species: null,
      duration: 6,
    },
    {
      title: "Lit installation chien arrive",
      prompt: `Wide handheld phone shot of a cream-colored plush round pet bed being placed on a wood floor. A pair of hands (lightly visible) smoothes the cushion, fluffs it. Six seconds: as the hands withdraw, a small dog (Cavalier King Charles) softly walks into frame from the right, sniffs the bed cautiously, circles once, then settles down comfortably, head between paws. Camera holds steady. Warm window light. Intimate documenting of pet routine.`,
      species: "chien",
      duration: 6,
    },
  ],

  astuce: [
    {
      title: "Chat fontaine eau gouttes",
      prompt: `Handheld phone shot at low angle of a sleek matte beige ceramic pet water fountain, water gently flowing. A grey-and-white tabby cat enters frame from the right, approaches cautiously, sniffs the fountain edge, then dips its head and drinks from the flowing stream. Water drops cling to its whiskers. Six seconds. Soft side daylight. The cat lifts its head, looks at the camera briefly, then goes back to drinking.`,
      species: "chat",
      duration: 6,
    },
    {
      title: "Lave-pattes rotation",
      prompt: `Close-up handheld phone shot of a dog's muddy paw being lowered into a cylindrical pet paw-washing cup filled with water. Six seconds: a hand stabilizes the dog's leg from above, the paw rotates slowly inside the cup (visible swirling water), then emerges cleaner. The hand lifts the paw out and pats it with a soft cream towel. Wooden floor entryway setting. Soft daylight.`,
      species: "chien",
      duration: 6,
    },
  ],

  guide: [
    {
      title: "Portrait cocker tourne tête",
      prompt: `Studio quality portrait shot of an adult English cocker spaniel sitting calmly on a beige linen backdrop. Soft three-quarter front lighting. Six seconds: the cocker faces forward, then slowly turns its head 30 degrees to the right, ears lifting in attention as if hearing a soft sound, eyes following an imaginary point, then returns to face the camera. Subject 70% of frame, perfectly centered. Premium pet brand editorial. Background slightly out of focus.`,
      species: "chien",
      duration: 6,
    },
  ],

  communaute: [
    {
      title: "Câlin chien gros plan",
      prompt: `Intimate over-the-shoulder phone shot, framed close. A medium-sized adult dog (Labrador, beige coat) sits next to a person whose face is mostly out of frame (only chin and shoulder visible). Six seconds: the person's hand enters frame and scratches gently behind the dog's ear, the dog closes its eyes in pleasure, head leaning into the touch, tail visibly wagging behind. Warm window light. Beige minimal interior background.`,
      species: "chien",
      duration: 6,
    },
  ],
};

/**
 * Pioche aléatoirement un prompt vidéo pour un thème + species donné(s).
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

function buildFullPrompt(scenario) {
  const fullPrompt = `${scenario.prompt}\n\n${FILM_LOOK}\n\n${REALISM_BAR}\n\n${BRAND_SETTING}\n\n${ANTI_AI}`;
  return {
    title: scenario.title,
    prompt: fullPrompt,
    species: scenario.species,
    duration: scenario.duration || 6,
  };
}

export function buildCustomVideoPrompt({ scenario, species = null, duration = 6 }) {
  return {
    title: "custom",
    prompt: `${scenario}\n\n${FILM_LOOK}\n\n${REALISM_BAR}\n\n${BRAND_SETTING}\n\n${ANTI_AI}`,
    species,
    duration,
  };
}
