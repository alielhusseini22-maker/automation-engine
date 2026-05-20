// Dictionnaire de traductions EN → FR pour variantes et options.
// Étendable. Si absent du dict, on utilise Claude pour traduire (fallback).

export const COLOR_FR = {
  // Anglais courants
  black: "Noir", white: "Blanc", red: "Rouge", blue: "Bleu", green: "Vert",
  yellow: "Jaune", orange: "Orange", pink: "Rose", purple: "Violet",
  grey: "Gris", gray: "Gris", brown: "Marron", beige: "Beige",
  navy: "Marine", khaki: "Kaki", "light blue": "Bleu ciel", "sky blue": "Bleu ciel",
  "light grey": "Gris clair", "light gray": "Gris clair", "dark grey": "Gris foncé", "dark gray": "Gris foncé",
  "light brown": "Marron clair", "milk white": "Blanc cassé", silver: "Argent",
  gold: "Doré", "dore": "Doré",
  // Composés AliExpress fréquents
  "rose gray": "Rose", "yellow gray": "Jaune", "black gray": "Anthracite",
  "blue gray": "Bleu gris", "red gray": "Rouge", "pink blue": "Bleu rosé",
};

export const SIZE_FR = {
  // Garder S/M/L/XL/XXL etc. tels quels mais simplifier les codes complexes
  small: "S", medium: "M", large: "L",
  // Dimensions explicites → simplifier
};

export const OPTION_NAME_FR = {
  color: "Couleur",
  colour: "Couleur",
  size: "Taille",
  format: "Format",
  shape: "Forme",
  type: "Type",
  model: "Modèle",
};

export const SHIPS_FROM_OPTION = ["ships from", "ship from"];

/**
 * Traduit une valeur de couleur EN→FR.
 */
export function translateColor(en) {
  if (!en) return en;
  const lower = en.toLowerCase().trim();
  if (COLOR_FR[lower]) return COLOR_FR[lower];
  // Try multi-word match
  for (const [k, v] of Object.entries(COLOR_FR)) {
    if (lower === k) return v;
  }
  return null; // Caller decides fallback (e.g., call Claude)
}

/**
 * Traduit un nom d'option EN→FR.
 */
export function translateOptionName(en) {
  if (!en) return en;
  const lower = en.toLowerCase().trim();
  return OPTION_NAME_FR[lower] || en;
}

export function isShipsFromOption(name) {
  return SHIPS_FROM_OPTION.includes(name.toLowerCase().trim());
}
