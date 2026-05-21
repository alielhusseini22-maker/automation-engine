// Template "Tip Card" — un conseil actionnable sur fond brand.
// Format Instagram/FB feed 1080x1080.

import { BRAND_THEME, brandCss } from "../theme.js";

/**
 * @param {object} args
 * @param {string} args.tipTitle - phrase action courte ("Brosse après une promenade pluvieuse")
 * @param {string} args.tipBody - explication 1-2 phrases
 * @param {string} [args.category="ASTUCE DU JOUR"]
 * @param {string} [args.productMention] - mention produit subtile en bas (optionnel)
 */
export function buildTipCard(args) {
  return [{ html: render(args), width: 1080, height: 1080 }];
}

function render({ tipTitle, tipBody, category = "ASTUCE DU JOUR", productMention }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${brandCss()}
    .card {
      width: 1080px; height: 1080px;
      background: ${BRAND_THEME.colorBeige};
      position: relative;
      padding: 128px 96px;
      display: flex; flex-direction: column; justify-content: center;
    }
    .card::before {
      content: "";
      position: absolute;
      top: 96px; left: 96px;
      width: 64px; height: 2px;
      background: ${BRAND_THEME.colorTaupe};
    }
    .category {
      position: absolute;
      top: 96px;
      left: 184px;
      font-family: ${BRAND_THEME.fontBody};
      text-transform: uppercase;
      letter-spacing: 0.3em;
      font-size: 0.72rem;
      color: ${BRAND_THEME.colorTaupe};
      font-weight: 600;
      line-height: 2;
    }
    .title {
      font-family: ${BRAND_THEME.fontHeading};
      font-size: 4rem;
      font-weight: 500;
      color: ${BRAND_THEME.colorInk};
      letter-spacing: -0.02em;
      line-height: 1.1;
      max-width: 880px;
      margin-bottom: 48px;
    }
    .body {
      font-family: ${BRAND_THEME.fontBody};
      font-size: 1.4rem;
      color: ${BRAND_THEME.colorInkSoft};
      line-height: 1.55;
      max-width: 800px;
      font-weight: 400;
    }
    .product-mention {
      position: absolute;
      bottom: 168px;
      left: 96px;
      right: 96px;
      padding: 20px 24px;
      background: rgba(196, 169, 119, 0.12);
      border-left: 3px solid ${BRAND_THEME.colorTaupe};
      font-family: ${BRAND_THEME.fontBody};
      font-size: 0.95rem;
      color: ${BRAND_THEME.colorInkSoft};
      font-style: italic;
    }
    .footer {
      position: absolute;
      bottom: 64px;
      left: 96px;
      right: 96px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .footer-sig {
      font-family: ${BRAND_THEME.fontBody};
      text-transform: uppercase;
      letter-spacing: 0.3em;
      font-size: 0.65rem;
      color: ${BRAND_THEME.colorInkSoft};
      font-weight: 600;
    }
    .footer-domain {
      font-family: ${BRAND_THEME.fontBody};
      font-size: 0.85rem;
      color: ${BRAND_THEME.colorForest};
      font-weight: 500;
    }
  </style></head><body>
    <div class="card">
      <div class="category">${escape(category)}</div>
      <div class="title">${escape(tipTitle)}</div>
      <div class="body">${escape(tipBody)}</div>
      ${productMention ? `<div class="product-mention">→ ${escape(productMention)}</div>` : ""}
      <div class="footer">
        <span class="footer-sig">${BRAND_THEME.brandSignature}</span>
        <span class="footer-domain">${BRAND_THEME.domain}</span>
      </div>
    </div>
  </body></html>`;
}

function escape(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
