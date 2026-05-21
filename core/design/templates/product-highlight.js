// Template "Product Highlight" — vraie photo produit + benefit overlay + prix + CTA.
// Format Instagram/FB feed 1080x1080.

import { BRAND_THEME, brandCss } from "../theme.js";

/**
 * @param {object} args
 * @param {string} args.productImageUrl - vraie photo produit Shopify (URL CDN)
 * @param {string} args.productName - "Brosse Marley™"
 * @param {string} args.benefitLine - phrase courte bénéfice (ex: "Pour cocker à poils longs.")
 * @param {string} args.price - "24,90€"
 * @param {string} [args.ctaText="Lien en bio"]
 */
export function buildProductHighlight(args) {
  return [{ html: render(args), width: 1080, height: 1080 }];
}

function render({ productImageUrl, productName, benefitLine, price, ctaText = "Lien en bio" }) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${brandCss()}
    .container {
      width: 1080px; height: 1080px; position: relative;
      background: ${BRAND_THEME.colorBeige};
      display: flex; flex-direction: column;
    }
    .photo {
      flex: 1 1 auto;
      background-image: url('${productImageUrl}');
      background-size: cover;
      background-position: center;
      min-height: 720px;
    }
    .photo::after {
      content: "";
      position: absolute;
      inset: 0;
      background: linear-gradient(to bottom, transparent 0%, transparent 60%, rgba(0,0,0,0.15) 100%);
      pointer-events: none;
    }
    .strip {
      flex: 0 0 auto;
      padding: 40px 64px 56px;
      background: ${BRAND_THEME.colorCream};
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 32px;
    }
    .strip-left { flex: 1 1 auto; }
    .strip-right { flex: 0 0 auto; }
    .name {
      font-family: ${BRAND_THEME.fontHeading};
      font-size: 2.2rem;
      color: ${BRAND_THEME.colorInk};
      letter-spacing: -0.01em;
      line-height: 1.1;
    }
    .benefit {
      font-family: ${BRAND_THEME.fontBody};
      font-size: 1.05rem;
      color: ${BRAND_THEME.colorInkSoft};
      margin-top: 8px;
      line-height: 1.4;
    }
    .price-badge {
      font-family: ${BRAND_THEME.fontHeading};
      font-size: 2.4rem;
      color: ${BRAND_THEME.colorInk};
      line-height: 1;
    }
    .cta {
      margin-top: 6px;
      background: ${BRAND_THEME.colorForest};
      color: white;
      padding: 14px 24px;
      font-family: ${BRAND_THEME.fontBody};
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-size: 0.78rem;
      text-align: center;
      border-radius: 2px;
    }
    .eyebrow-top {
      position: absolute;
      top: 32px;
      left: 64px;
      color: white;
      background: rgba(0,0,0,0.35);
      backdrop-filter: blur(8px);
      padding: 8px 16px;
      letter-spacing: 0.25em;
      font-size: 0.65rem;
      text-transform: uppercase;
      font-weight: 600;
      border-radius: 2px;
    }
  </style></head><body>
    <div class="container">
      <div class="photo" style="position: relative;">
        <div class="eyebrow-top">Poils Précieux • Sélection</div>
      </div>
      <div class="strip">
        <div class="strip-left">
          <div class="name">${escape(productName)}</div>
          <div class="benefit">${escape(benefitLine)}</div>
        </div>
        <div class="strip-right" style="text-align: right;">
          <div class="price-badge">${escape(price)}</div>
          <div class="cta">${escape(ctaText)}</div>
        </div>
      </div>
    </div>
  </body></html>`;
}

function escape(s) {
  if (s == null) return "";
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
