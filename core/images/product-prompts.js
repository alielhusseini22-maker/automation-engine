// Prompts d'édition pour GPT-Image-1 (mode images/edits).
// Objectif :
//   1. Préserver fidèlement le produit (couleur, forme, matière, motifs)
//   2. Imposer une identité visuelle cohérente "Poils Précieux" sur TOUT le catalogue
//   3. Générer 3 angles (hero / lifestyle / detail) par couleur de variante
//
// L'identité de marque est constante — c'est le levier #1 pour qu'une boutique
// "feel premium" : cohérence visuelle entre tous les produits.

// ─────────────────────────────────────────────────────────────────────────────
// IDENTITÉ DE MARQUE — appliquée à TOUS les prompts (fond, mood, lighting)
// ─────────────────────────────────────────────────────────────────────────────

const BRAND_IDENTITY = [
  "BRAND VISUAL IDENTITY (must be consistent across the entire catalog): ",
  "Pure clean white background (#FFFFFF to #FAFAFA), minimalist premium ecommerce style, ",
  "soft diffused studio lighting coming from above and slightly left, ",
  "subtle realistic soft shadow under the product grounding it naturally, ",
  "calm refined neutral mood, premium boutique pet-care brand feel, ",
  "magazine-quality 4k ecommerce product photography, sharp focus, photorealistic, ",
  "consistent with a luxury pet brand catalog on a clean white website.",
].join("");

// ─────────────────────────────────────────────────────────────────────────────
// FIDÉLITÉ PRODUIT — règle non-négociable
// ─────────────────────────────────────────────────────────────────────────────

const PRESERVE_STRICT = [
  "PRIMARY INSTRUCTION — BACKGROUND SWAP ONLY, ZERO STYLIZATION: ",
  "The source images show a real physical product that customers will receive. Your task is strictly to isolate this product and place it on a clean studio environment. ",
  "DO NOT redraw, restyle, smooth out, simplify, or reinterpret the product in any way. ",
  "PRESERVE EVERY VISIBLE DETAIL with hyper-precision: ",
  "every individual fiber, every stitch, every seam, every fold, every wrinkle, every subtle color variation, every grain of texture, every pattern detail. ",
  "Material rendering MUST match source exactly: fluffy fur stays as INDIVIDUAL VISIBLE FIBERS (not smooth), felt stays grainy and matte (not silky), plush pile keeps its 3D depth, mesh shows its weave, fabric shows its grain, leather shows its grain and creases, plastic keeps its specific gloss reflection. ",
  "If you see fluffy fur on the source — render fluffy fur with the SAME fiber density and direction. Do not smooth into uniform fabric. ",
  "If you see seams or stitching lines on the source — render them with the SAME stitch count and thread color. ",
  "Color must match source exactly — same shade, same saturation, same lighting, same shadows on the product itself. ",
  "Proportions and silhouette: identical at the pixel level. ",
  "The output must look like a higher-resolution photograph of the EXACT SAME OBJECT, not an artistic interpretation.",
].join("");

const REMOVE = [
  "REMOVE ONLY these MARKETING/IMAGE overlays (NOT physical product elements): ",
  "text overlays drawn on top of the image (Chinese hanzi, English, French, Arabic marketing text), ",
  "promotional watermarks, multi-panel info layouts with dimensions/specs, ",
  "measurement labels with arrows and callouts, dimension annotations like '40cm', '16cm', '36×36cm', ",
  "marketing graphic banners. ",
  "Remove any animals, pets, hands, or people that appear in the source — keep only the product alone. ",
  "Remove any cluttered background, packaging boxes, surrounding props, or other products visible behind the main subject. ",
  "⚠ CRITICAL — KEEP ALL PHYSICAL PRODUCT ELEMENTS even if they look like branding: ",
  "small leather patches sewn onto the product, embossed logos pressed into the material, ",
  "fabric tags, brand labels physically attached or stitched to the product. ",
  "These are integral parts of the real product the customer receives — they must remain visible and faithful.",
].join("");

// ─────────────────────────────────────────────────────────────────────────────
// 3 ANGLES par couleur de variante
// ─────────────────────────────────────────────────────────────────────────────

// Catalogue de tous les angles disponibles. La sélection des 2 angles utilisés
// pour un produit donné dépend de son productType (voir TYPE_SHOTS plus bas).
const SHOT_VARIANTS = [
  {
    name: "front-three-quarter",
    direction: "FRONT THREE-QUARTER ANGLE: Product CENTERED both horizontally AND vertically. Camera slightly above and to the right of the product, looking down at roughly 30 degrees, showing the FRONT of the product plus a clear hint of its right side. Product fills around 60% of the frame with at least 18% breathing room above and below. {BG}",
  },
  {
    name: "side-profile",
    direction: "PURE SIDE PROFILE VIEW (RADICALLY DIFFERENT camera position): Product CENTERED. Camera EXACTLY LEVEL with the product (eye-level, no tilt), looking at the product from a strict 90-degree side angle (LEFT or RIGHT silhouette). The result must show ONLY the side outline of the product — no front face visible at all, completely different from a 3/4 view. Product fills around 55% of the frame with at least 18% breathing room on all sides. {BG}",
  },
  {
    name: "top-down",
    direction: "TOP-DOWN OVERHEAD VIEW: Product CENTERED. Camera DIRECTLY ABOVE the product, looking straight down at a 90-degree top-down angle (flatlay style). Shows the full top surface of the product. Product fills around 70% of the frame. {BG}",
  },
  {
    name: "macro-detail",
    direction: "MACRO CLOSE-UP DETAIL: Product CENTERED. Camera very close, focused on the texture, material, stitching, and finishing details (felt fuzz, fabric weave, stitching lines, button details, embossed labels). Product fills around 85% of the frame. Very shallow depth of field. {BG}",
  },
  {
    name: "back-view",
    direction: "BACK VIEW: Product CENTERED. Camera at eye-level showing the BACK side of the product (the opposite face from a front view). Useful for bottles labels, packaging back, garment back. Product fills around 60% of the frame with breathing room. {BG}",
  },
];

// 1 SEUL angle par produit, choisi selon ce qui valorise le mieux le productType.
// Vu les limites de GPT-Image-1 (qui invente les angles non vus dans la source),
// on se concentre sur LE meilleur angle pour chaque catégorie.
const TYPE_SHOTS = {
  // Objets 3D substantiels → face 3/4 (montre face + côté)
  "Couchage":            ["front-three-quarter"],
  "Lit orthopédique":    ["front-three-quarter"],
  "Niche":               ["front-three-quarter"],
  "Sac transport":       ["front-three-quarter"],
  "Bac à litière":       ["front-three-quarter"],
  "Fontaine":            ["front-three-quarter"],
  "Gamelle":             ["front-three-quarter"],
  "Bol":                 ["front-three-quarter"],
  "Bol anti-glouton":    ["top-down"],
  "Caméra":              ["front-three-quarter"],
  "Aspirateur":          ["front-three-quarter"],
  "Distributeur":        ["front-three-quarter"],

  // Objets plats / textiles → top-down (montre le pattern)
  "Tapis anti-stress":   ["top-down"],
  "Anti-stress":         ["top-down"],
  "Tapis rafraîchissant":["top-down"],
  "Tapis léchage":       ["top-down"],
  "Tapis gamelle":       ["top-down"],
  "Accessoire repas":    ["top-down"],
  "Plaid":               ["top-down"],
  "Plaid déperlant":     ["top-down"],
  "Serviette de bain":   ["top-down"],

  // Petits objets / accessoires → face 3/4
  "Brosse":              ["front-three-quarter"],
  "Brosse pour chien":   ["front-three-quarter"],
  "Brosse pour chat":    ["front-three-quarter"],
  "Brosse de bain":      ["front-three-quarter"],
  "Brosse à dents":      ["front-three-quarter"],
  "Hygiène dentaire":    ["front-three-quarter"],
  "Tondeuse":            ["front-three-quarter"],
  "Coupe-griffes":       ["front-three-quarter"],
  "Détartreur":          ["front-three-quarter"],
  "Laisse":              ["front-three-quarter"],
  "Sacs crottes":        ["front-three-quarter"],
  "Accessoire promenade":["front-three-quarter"],
  "Pelle":               ["front-three-quarter"],
  "Pelle litière":       ["front-three-quarter"],
  "Lave-pattes":         ["front-three-quarter"],
  "Tracker":             ["front-three-quarter"],
  "Jouet":               ["front-three-quarter"],
  "Jouet interactif":    ["front-three-quarter"],

  // Vêtements / harnais → face 3/4
  "Harnais":             ["front-three-quarter"],
  "Veste":               ["front-three-quarter"],
  "Vêtement chien":      ["front-three-quarter"],

  // Liquides / packaging → face
  "Démêlant":            ["front-three-quarter"],
  "Shampooing":          ["front-three-quarter"],
  "Parfum":              ["front-three-quarter"],
  "Dentifrice":          ["front-three-quarter"],
  "Antiparasitaire":     ["front-three-quarter"],
  "Hygiène auriculaire": ["front-three-quarter"],
};

const DEFAULT_SHOTS = ["front-three-quarter"]; // fallback

// Clauses background — clean white vs transparent (avec ombre flottante dans les 2 cas).
function bgClause(backgroundMode, typeBg) {
  if (backgroundMode === "transparent") {
    return [
      "OUTPUT BACKGROUND: Fully transparent (alpha channel) — NO solid background color, no environment, no floor, no walls.",
      "Just the cutout product with clean smooth edges (especially preserved around fluffy/fuzzy areas like fur, felt, plush — the alpha mask must follow the soft edges naturally, no harsh cutout).",
      "IMPORTANT — FLOATING SHADOW: Include a SUBTLE soft drop shadow directly underneath the product as semi-transparent pixels on the transparent canvas.",
      "The shadow must be: a small soft elliptical gradient, semi-transparent gray (~20-25% opacity at center fading to 0%), blurred edges, sitting just below the product's bottom contact area.",
      "This creates a premium 'floating' studio product effect. The shadow itself is semi-transparent (alpha < 1) — NOT on a solid background.",
      "Final result = product PNG with alpha + subtle floor shadow PNG with alpha + everything else transparent.",
    ].join(" ");
  }
  return `OUTPUT BACKGROUND: ${typeBg}. No environment, no props, no surrounding objects — just pure flat white background with a subtle natural soft shadow directly under the product to ground it (~20% opacity, blurred edges).`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Background selon le productType — légères variations dans le cadre de la brand
// ─────────────────────────────────────────────────────────────────────────────

// Tous les fonds en blanc pur pour matcher l'identité du site (fond blanc)
const TYPE_BG = {
  "Couchage":            "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Lit orthopédique":    "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Niche":               "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Fontaine":            "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Gamelle":             "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Laisse":              "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Brosse à dents":      "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Hygiène dentaire":    "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Bac à litière":       "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Pelle litière":       "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Pelle":               "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Sac transport":       "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Plaid":               "pure clean white seamless backdrop (#FFFFFF), perfectly even, neatly folded",
  "Tapis anti-stress":   "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Anti-stress":         "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Tapis rafraîchissant":"pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Brosse pour chien":   "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Brosse pour chat":    "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Brosse":              "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Brosse de bain":      "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Caméra":              "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Tracker":             "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Aspirateur":          "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Tondeuse":            "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Coupe-griffes":       "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Détartreur":          "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Distributeur":        "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Sacs crottes":        "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Accessoire promenade":"pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Harnais":             "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Veste":               "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Vêtement chien":      "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Jouet":               "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Jouet interactif":    "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Tapis léchage":       "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Bol anti-glouton":    "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Lave-pattes":         "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Serviette de bain":   "pure clean white seamless backdrop (#FFFFFF), perfectly even, neatly folded",
  "Démêlant":            "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Shampooing":          "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Parfum":              "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Dentifrice":          "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Antiparasitaire":     "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Hygiène auriculaire": "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Tapis gamelle":       "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Accessoire repas":    "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Bol":                 "pure clean white seamless backdrop (#FFFFFF), perfectly even",
  "Plaid déperlant":     "pure clean white seamless backdrop (#FFFFFF), perfectly even, neatly folded",
};

const DEFAULT_BG = "pure clean white seamless backdrop (#FFFFFF), perfectly even";

// ─────────────────────────────────────────────────────────────────────────────
// API publique
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sélection INTELLIGENTE des 2 angles à générer pour un produit donné,
 * basée sur son productType (ex: niche → face + profil, tapis → top-down + face).
 * @param {string} productType - productType Shopify du produit
 * @returns {Array<{name, direction}>} les 2 SHOT_VARIANTS pertinents pour ce produit
 */
export function shotsForProduct(productType) {
  const names = TYPE_SHOTS[productType] || DEFAULT_SHOTS;
  return names.map(n => SHOT_VARIANTS.find(s => s.name === n)).filter(Boolean);
}

/**
 * @deprecated Use shotsForProduct(productType) for smart selection.
 * Liste les variantes de shots par défaut (sans contexte produit).
 */
export function shotVariants() {
  return DEFAULT_SHOTS.map(n => SHOT_VARIANTS.find(s => s.name === n)).filter(Boolean);
}

/**
 * Liste TOUS les shots disponibles (pour filtrage manuel via --shots).
 */
export function allShotVariants() {
  return SHOT_VARIANTS.slice();
}

/**
 * Construit un prompt d'édition pour une combinaison (produit, couleur, shot variant).
 * @param {object} args
 * @param {"white"|"transparent"} [args.backgroundMode="white"] - "transparent" pour PNG transparent
 * @returns {{name: string, prompt: string}}
 */
export function buildEditPrompt({ product, colorName, shotVariant, backgroundMode = "white" }) {
  const typeBg = TYPE_BG[product.productType] || DEFAULT_BG;
  const bg = bgClause(backgroundMode, typeBg);

  const colorClause = colorName
    ? `IMPORTANT COLOR PRESERVATION: The product visible in the source image(s) is the "${colorName}" variant. Keep this exact color, shade, and finish. Do not change the hue or material appearance.`
    : "Preserve the exact color(s), materials and finish of the product as shown in the source image(s).";

  const prompt = [
    PRESERVE_STRICT,
    colorClause,
    shotVariant.direction.replace("{BG}", bg),
    BRAND_IDENTITY,
    REMOVE,
  ].join(" ");

  return {
    name: colorName ? `${slugify(colorName)}-${shotVariant.name}` : shotVariant.name,
    prompt,
  };
}

/**
 * Détecte le nom de l'option "couleur" d'un produit (Color / Couleur / Colour).
 */
export function findColorOptionName(product) {
  return product.options?.find(o => /^couleur|^color|^colour/i.test(o.name))?.name || null;
}

/**
 * Groupe les variantes d'un produit par valeur de l'option couleur.
 * Si pas d'option couleur, retourne un seul groupe avec color=null.
 */
export function groupVariantsByColor(product) {
  const colorOptionName = findColorOptionName(product);

  if (!colorOptionName) {
    return [{
      color: null,
      variantIds: product.variants.map(v => v.id),
      variantImageUrls: [...new Set(product.variants.map(v => v.imageUrl).filter(Boolean))],
    }];
  }

  const groups = new Map();
  for (const v of product.variants) {
    const colorVal = v.selectedOptions.find(o => o.name === colorOptionName)?.value || "default";
    if (!groups.has(colorVal)) {
      groups.set(colorVal, { color: colorVal, variantIds: [], variantImageUrls: [] });
    }
    const g = groups.get(colorVal);
    g.variantIds.push(v.id);
    if (v.imageUrl && !g.variantImageUrls.includes(v.imageUrl)) g.variantImageUrls.push(v.imageUrl);
  }
  return [...groups.values()];
}

function slugify(s) {
  return String(s).toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const _internal = { TYPE_BG, BRAND_IDENTITY, PRESERVE_STRICT, REMOVE, SHOT_VARIANTS };
