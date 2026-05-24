// Template "Video Outro" — carte produit de fin pour les vidéos montage.
// Plein cadre 1080x1920 (PAS transparent) : photo produit en haut, panneau beige en bas avec
// nom + accroche courte + prix + domaine. Sert de fin "pub douce" : la vidéo se termine sur un
// produit Poils Précieux en lien avec le concept. Typo Fraunces (cohérente avec video-overlay.js).
// ZÉRO émoji (règle brand absolue).

/**
 * Construit la carte produit de fin (outro) d'une vidéo montage.
 * @param {object} args
 * @param {string} args.productImageUrl - vraie photo produit Shopify (URL CDN)
 * @param {string} args.productName - nom court du produit (ex: "Brosse Marley™")
 * @param {string} args.tagline - accroche courte de transition (max ~8 mots, sans émoji)
 * @param {string} args.price - prix formaté (ex: "24,90€")
 * @param {string} [args.domain="poilsprecieux.com"]
 * @returns {{ html: string, width: 1080, height: 1920, transparent: false, waitMs: number }}
 */
export function buildVideoOutro({ productImageUrl, productName, tagline, price, domain = "poilsprecieux.com" }) {
  return {
    html: render({ productImageUrl, productName, tagline, price, domain }),
    width: 1080,
    height: 1920,
    transparent: false,
    waitMs: 600,
  };
}

function render({ productImageUrl, productName, tagline, price, domain }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1080px; height: 1920px;
      background: #F4EDE3;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }
    .frame { position: absolute; inset: 0; display: flex; flex-direction: column; }
    .photo {
      position: relative;
      height: 1150px;
      background-image: url('${productImageUrl}');
      background-size: cover;
      background-position: center;
      background-color: #FFFAF1;
    }
    /* Fondu doux du bas de la photo vers le panneau beige → pas de ligne dure. */
    .photo::after {
      content: "";
      position: absolute; left: 0; right: 0; bottom: 0; height: 220px;
      background: linear-gradient(to bottom, rgba(244,237,227,0) 0%, #F4EDE3 100%);
      pointer-events: none;
    }
    .panel {
      flex: 1 1 auto;
      padding: 12px 96px 0;
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center;
    }
    .eyebrow {
      font-family: 'Inter', sans-serif;
      text-transform: uppercase;
      letter-spacing: 0.32em;
      font-size: 22px;
      font-weight: 600;
      color: #5A6B4F;
    }
    .name {
      font-family: 'Fraunces', Georgia, serif;
      font-weight: 500;
      font-size: 64px;
      line-height: 1.04;
      letter-spacing: -0.015em;
      color: #1A1815;
      margin-top: 26px;
    }
    .tagline {
      font-family: 'Inter', sans-serif;
      font-weight: 400;
      font-size: 31px;
      line-height: 1.4;
      color: #3A3530;
      margin-top: 20px;
      max-width: 760px;
    }
    .price {
      font-family: 'Fraunces', Georgia, serif;
      font-weight: 600;
      font-size: 48px;
      color: #1A1815;
      margin-top: 34px;
    }
    .cta {
      font-family: 'Inter', sans-serif;
      font-weight: 600;
      font-size: 24px;
      letter-spacing: 0.06em;
      color: #5A6B4F;
      border: 1.5px solid rgba(90,107,79,0.55);
      border-radius: 999px;
      padding: 16px 38px;
      margin-top: 38px;
    }
  </style></head><body>
    <div class="frame">
      <div class="photo"></div>
      <div class="panel">
        <div class="eyebrow">Poils Précieux</div>
        <div class="name">${escape(productName)}</div>
        ${tagline ? `<div class="tagline">${escape(tagline)}</div>` : ""}
        <div class="price">${escape(price)}</div>
        <div class="cta">${escape(domain)}</div>
      </div>
    </div>
  </body></html>`;
}

function escape(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
