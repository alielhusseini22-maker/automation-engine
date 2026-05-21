// Template carrousel "hook" — 5 slides : hook | insight 1 | insight 2 | insight 3 | CTA produit.
// Usage : éducatif + drive vers produit. Format Instagram/FB carousel 1080x1080.

import { BRAND_THEME, brandCss, brandFooter } from "../theme.js";

/**
 * Génère le HTML d'un carrousel hook complet (5 slides).
 * @param {object} args
 * @param {string} args.hookLine1 - Première ligne hook (ex: "3 erreurs en brossant")
 * @param {string} args.hookLine2 - Deuxième ligne hook (ex: "ton chien à poils longs")
 * @param {string} args.hookSubtext - Petit texte sous hook (ex: "Tu en fais sûrement une.")
 * @param {Array<{title, body}>} args.insights - 3 insights (slides 2-4)
 * @param {object} args.cta - { productName, benefit, price, productImageUrl, ctaText }
 * @returns Array de 5 objets { html, width, height }
 */
export function buildHookCarousel(args) {
  const slides = [];
  slides.push({ html: slideHook(args), width: 1080, height: 1080 });
  for (const [i, insight] of args.insights.entries()) {
    slides.push({
      html: slideInsight({ ...insight, index: i + 1, total: args.insights.length }),
      width: 1080,
      height: 1080,
    });
  }
  slides.push({ html: slideCta(args.cta), width: 1080, height: 1080 });
  return slides;
}

function pageWrap(innerHtml, extraStyles = "") {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${brandCss()}${extraStyles}</style></head><body>${innerHtml}</body></html>`;
}

function slideHook({ hookLine1, hookLine2, hookSubtext }) {
  return pageWrap(`
    <div class="texture" style="width: 1080px; height: 1080px; position: relative; padding: 120px 96px; display: flex; flex-direction: column; justify-content: center;">

      <div class="eyebrow" style="position: absolute; top: 72px; left: 96px;">Conseil Poils Précieux</div>

      <div class="heading" style="font-size: 5.2rem; color: ${BRAND_THEME.colorInk}; text-align: left; max-width: 880px;">
        ${escape(hookLine1)}<br>
        <em style="font-style: italic; color: ${BRAND_THEME.colorForest};">${escape(hookLine2)}</em>
      </div>

      ${hookSubtext ? `<div style="margin-top: 48px; font-size: 1.4rem; color: ${BRAND_THEME.colorInkSoft}; max-width: 720px; line-height: 1.4;">
        ${escape(hookSubtext)}
      </div>` : ""}

      <div style="position: absolute; bottom: 96px; right: 96px; display: flex; align-items: center; gap: 12px;">
        <span style="font-family: ${BRAND_THEME.fontBody}; font-size: 0.85rem; color: ${BRAND_THEME.colorInkSoft};">Glisse pour voir</span>
        <span style="font-size: 1.4rem; color: ${BRAND_THEME.colorTaupe};">→</span>
      </div>

      <div style="position: absolute; bottom: 48px; left: 96px;" class="signature">${BRAND_THEME.brandSignature}</div>
    </div>
  `);
}

function slideInsight({ title, body, index, total }) {
  return pageWrap(`
    <div style="width: 1080px; height: 1080px; background: ${BRAND_THEME.colorBeige}; position: relative; padding: 120px 96px; display: flex; flex-direction: column; justify-content: center;">

      <div style="position: absolute; top: 72px; left: 96px; display: flex; align-items: center; gap: 16px;">
        <div style="width: 56px; height: 56px; border-radius: 50%; background: ${BRAND_THEME.colorForest}; color: white; display: flex; align-items: center; justify-content: center; font-family: ${BRAND_THEME.fontHeading}; font-size: 1.6rem; font-weight: 600;">
          ${index}
        </div>
        <div class="eyebrow">${String(index).padStart(2, "0")} / ${String(total).padStart(2, "0")}</div>
      </div>

      <div class="heading" style="font-size: 3.8rem; color: ${BRAND_THEME.colorInk}; max-width: 880px; margin-bottom: 40px;">
        ${escape(title)}
      </div>

      <div style="font-size: 1.4rem; color: ${BRAND_THEME.colorInkSoft}; max-width: 800px; line-height: 1.55;">
        ${escape(body)}
      </div>

      <div style="position: absolute; bottom: 96px; right: 96px; display: flex; align-items: center; gap: 12px;">
        <span style="font-family: ${BRAND_THEME.fontBody}; font-size: 0.85rem; color: ${BRAND_THEME.colorInkSoft};">Suite</span>
        <span style="font-size: 1.4rem; color: ${BRAND_THEME.colorTaupe};">→</span>
      </div>

      <div style="position: absolute; bottom: 48px; left: 96px;" class="signature">${BRAND_THEME.brandSignature}</div>
    </div>
  `);
}

function slideCta({ productName, benefit, price, productImageUrl, ctaText = "Découvrir" }) {
  return pageWrap(`
    <div style="width: 1080px; height: 1080px; background: ${BRAND_THEME.colorCream}; position: relative; display: flex; flex-direction: column;">

      <div style="padding: 96px 96px 48px; flex: 0 0 auto;">
        <div class="eyebrow">Le bon outil</div>
        <div class="heading" style="font-size: 3.2rem; color: ${BRAND_THEME.colorInk}; margin-top: 16px;">
          ${escape(productName)}
        </div>
        ${benefit ? `<div style="margin-top: 16px; font-size: 1.2rem; color: ${BRAND_THEME.colorInkSoft}; max-width: 720px; line-height: 1.5;">
          ${escape(benefit)}
        </div>` : ""}
      </div>

      <div style="flex: 1 1 auto; background-image: url('${productImageUrl}'); background-size: cover; background-position: center; min-height: 480px;"></div>

      <div style="padding: 48px 96px 96px; flex: 0 0 auto; display: flex; align-items: center; justify-content: space-between; background: ${BRAND_THEME.colorBeige};">
        <div>
          <div class="signature">${BRAND_THEME.brandSignature}</div>
          <div style="font-family: ${BRAND_THEME.fontHeading}; font-size: 2rem; color: ${BRAND_THEME.colorInk}; margin-top: 4px;">${escape(price)}</div>
        </div>
        <div style="background: ${BRAND_THEME.colorForest}; color: white; padding: 18px 32px; border-radius: 4px; font-family: ${BRAND_THEME.fontBody}; font-weight: 600; letter-spacing: 0.05em; text-transform: uppercase; font-size: 0.95rem;">
          ${escape(ctaText)} →
        </div>
      </div>
    </div>
  `);
}

function escape(s) {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
