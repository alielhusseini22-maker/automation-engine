// Extraction de dimensions depuis titre/description/options + ajout dans la description.
// Pattern : 60x40cm, 80×60 cm, 50 cm × 70 cm, L 36x36x36cm, etc.

const DIM_PATTERN = /(\d+(?:[.,]\d+)?)\s*[xX×]\s*(\d+(?:[.,]\d+)?)(?:\s*[xX×]\s*(\d+(?:[.,]\d+)?))?\s*(mm|cm|m)?/g;
const SIZE_LABEL = /^(XXS|XS|S|M|L|XL|XXL|XXXL|3XL|4XL|5XL)\b/;

/**
 * Extrait toutes les dimensions trouvées dans une chaîne.
 */
export function extractDimensions(text) {
  if (!text) return [];
  const matches = [];
  let m;
  const pattern = new RegExp(DIM_PATTERN.source, "g");
  while ((m = pattern.exec(text)) !== null) {
    matches.push({
      raw: m[0],
      values: [m[1], m[2], m[3]].filter(Boolean),
      unit: m[4] || "cm",
    });
  }
  return matches;
}

/**
 * Sépare un titre de variante "L 36x36x36cm" → label "L" + dimensions "36x36x36cm".
 */
export function splitSizeLabel(variantTitle) {
  if (!variantTitle) return { label: variantTitle, dimensions: null };
  const m = variantTitle.match(SIZE_LABEL);
  if (m) {
    const label = m[1];
    const rest = variantTitle.slice(m[0].length).trim();
    const dims = extractDimensions(rest);
    return { label, dimensions: dims.length ? rest : null };
  }
  // No size label found → try just extracting dims and use them as label fallback
  const dims = extractDimensions(variantTitle);
  return { label: variantTitle, dimensions: dims.length ? variantTitle : null };
}

/**
 * Construit un tableau markdown des dimensions à insérer dans la description.
 */
export function dimensionsTableMarkdown(sizesWithDims) {
  if (!sizesWithDims.length) return "";
  let md = "\n## Dimensions\n\n";
  md += "| Taille | Dimensions |\n|---|---|\n";
  for (const { label, dimensions } of sizesWithDims) {
    md += `| ${label} | ${dimensions || "—"} |\n`;
  }
  return md;
}
