// Variables CSS partagées pour tous les templates designés.
// Centralise la palette + typo pour cohérence brand.

export const BRAND_THEME = {
  // Palette Poils Précieux
  colorBeige: "#F4EDE3",
  colorCream: "#FFFAF1",
  colorWhite: "#FFFFFF",
  colorTaupe: "#C4A977",
  colorForest: "#5A6B4F",
  colorInk: "#1A1815",
  colorInkSoft: "#3A3530",

  // Typo
  fontHeading: "'Playfair Display', 'Cormorant Garamond', Georgia, serif",
  fontBody: "'Inter', 'Helvetica Neue', -apple-system, sans-serif",
  fontMono: "'JetBrains Mono', 'Courier New', monospace",

  // Spacing
  brandSignature: "POILS PRÉCIEUX",
  domain: "poilsprecieux.com",
};

/**
 * CSS shared snippets, à inline dans chaque template.
 */
export function brandCss() {
  return `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=Inter:wght@300;400;500;600;700&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: ${BRAND_THEME.fontBody};
      background: ${BRAND_THEME.colorBeige};
      color: ${BRAND_THEME.colorInk};
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .heading {
      font-family: ${BRAND_THEME.fontHeading};
      font-weight: 500;
      letter-spacing: -0.02em;
      line-height: 1.05;
    }
    .eyebrow {
      font-family: ${BRAND_THEME.fontBody};
      text-transform: uppercase;
      letter-spacing: 0.25em;
      font-size: 0.7rem;
      font-weight: 500;
      color: ${BRAND_THEME.colorInkSoft};
    }
    .signature {
      font-family: ${BRAND_THEME.fontBody};
      text-transform: uppercase;
      letter-spacing: 0.3em;
      font-size: 0.6rem;
      font-weight: 600;
      color: ${BRAND_THEME.colorInkSoft};
    }
    .domain {
      font-family: ${BRAND_THEME.fontMono};
      font-size: 0.75rem;
      letter-spacing: 0.05em;
      color: ${BRAND_THEME.colorInkSoft};
    }
    .texture {
      background-image:
        radial-gradient(ellipse at top, rgba(196,169,119,0.08) 0%, transparent 50%),
        radial-gradient(ellipse at bottom, rgba(90,107,79,0.04) 0%, transparent 60%);
    }
  `;
}

/**
 * Markup commun pour le footer brand (signature + domain).
 */
export function brandFooter() {
  return `
    <div style="position: absolute; bottom: 48px; left: 0; right: 0; text-align: center;">
      <div class="signature">${BRAND_THEME.brandSignature}</div>
      <div class="domain" style="margin-top: 6px;">${BRAND_THEME.domain}</div>
    </div>
  `;
}
