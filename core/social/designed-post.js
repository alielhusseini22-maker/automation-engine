// Orchestrator des "designed posts" — décide template, génère contenu via Claude, render HTML→PNG.

import path from "node:path";
import { claudeJSON } from "../claude/client.js";
import { renderCarousel } from "../design/render.js";
import { buildHookCarousel } from "../design/templates/hook-carousel.js";
import { buildProductHighlight } from "../design/templates/product-highlight.js";
import { buildTipCard } from "../design/templates/tip-card.js";
import { shopifyQuery } from "../shopify/client.js";

/**
 * Génère un "designed post" complet pour le slot temporel donné.
 * @param {object} args
 * @param {string} args.slot - "morning" | "evening"
 * @param {string} args.dayName - "monday" | ... (pour rotation thématique)
 * @param {string} runDir - dossier de sortie
 * @returns {{ mediaPaths: string[], format: "carousel"|"single", brief: object, content: object }}
 */
export async function generateDesignedPost(config, runDir, { slot, dayName }) {
  // Choisit le type de template
  const templateType = pickTemplate(slot, dayName);
  console.log(`[design] template = ${templateType} (${slot}, ${dayName})`);

  if (templateType === "hook-carousel") {
    return await generateHookCarousel(config, runDir);
  }
  if (templateType === "tip-card") {
    return await generateTipCard(config, runDir);
  }
  if (templateType === "product-highlight") {
    return await generateProductHighlight(config, runDir);
  }
  throw new Error(`Unknown template type: ${templateType}`);
}

function pickTemplate(slot, dayName) {
  if (slot === "evening") return "product-highlight";
  // Morning : rotation hook/tip selon jour
  const morningRotation = {
    monday: "hook-carousel",
    tuesday: "tip-card",
    wednesday: "hook-carousel",
    thursday: "tip-card",
    friday: "hook-carousel",
    saturday: "tip-card",
    sunday: "tip-card",
  };
  return morningRotation[dayName] || "tip-card";
}

// ───────────────────────────────────────────────────────────
// Hook carousel : 5 slides éducatives + CTA produit
// ───────────────────────────────────────────────────────────

async function generateHookCarousel(config, runDir) {
  const product = await pickFeatureProduct(config);

  const { data: content } = await claudeJSON(config, {
    system: `Tu écris un carrousel social éducatif pour Poils Précieux, marque française premium pour chiens & chats. Le but : éduquer + driver vers produit. Ton factuel + bienveillant, jamais survendu, jamais d'invention de client.`,
    user: `Écris le contenu d'un carrousel Instagram 5 slides éducatif lié à ce produit Poils Précieux :

Produit : ${product.title}
Type : ${product.productType}
Description courte : ${product.shortDescription}
Prix : ${product.price}€

STRUCTURE :
- Slide 1 (hook) : titre accrocheur en 2 lignes courtes (style "3 erreurs en X / sur ton chien à poils longs"). Sous-titre 5-10 mots.
- Slides 2-4 : 3 insights factuels (titre court + body 1-2 phrases factuelles). Erreur fréquente, mécanique invisible, ou astuce.
- Slide 5 : CTA produit (le produit ci-dessus).

Return JSON :
{
  "hookLine1": "ligne 1 hook 3-6 mots",
  "hookLine2": "ligne 2 hook (italique) 3-6 mots",
  "hookSubtext": "10-15 mots qui posent la promesse",
  "insights": [
    { "title": "titre slide 2 (5-8 mots)", "body": "1-2 phrases factuelles 15-30 mots" },
    { "title": "titre slide 3", "body": "..." },
    { "title": "titre slide 4", "body": "..." }
  ],
  "captionForPost": "FR caption pour le post Insta (60-120 mots, hook+contenu+CTA 'Lien en bio')",
  "captionHashtags": ["#poilsprecieux", "#poilsprecieuxfr", "..."],
  "altText": "FR alt text 1 phrase"
}`,
    maxTokens: 2500,
  });

  const slides = buildHookCarousel({
    hookLine1: content.hookLine1,
    hookLine2: content.hookLine2,
    hookSubtext: content.hookSubtext,
    insights: content.insights,
    cta: {
      productName: product.title.replace(/—.*/g, "").trim(),
      benefit: product.shortDescription,
      price: `${product.price}€`,
      productImageUrl: product.imageUrl,
      ctaText: "Lien en bio",
    },
  });

  const paths = await renderCarousel({
    slides,
    outputDir: runDir,
    basename: `carousel-${Date.now()}`,
  });

  return {
    mediaPaths: paths,
    format: "carousel",
    mediaType: "image",
    brief: {
      type: "designed-carousel",
      templateType: "hook-carousel",
      product,
      content,
    },
    content,
  };
}

// ───────────────────────────────────────────────────────────
// Tip card : un conseil actionnable
// ───────────────────────────────────────────────────────────

async function generateTipCard(config, runDir) {
  const product = await pickFeatureProduct(config);

  const { data: content } = await claudeJSON(config, {
    system: `Tu écris une tip card pour Poils Précieux, marque pet française premium. Ton bienveillant + factuel + court.`,
    user: `Écris une astuce du jour actionnable et concrète, idéalement en lien doux avec ce produit :

Produit : ${product.title}
Type : ${product.productType}
Description courte : ${product.shortDescription}

STRUCTURE :
- tipTitle : phrase action 6-12 mots (commence par un verbe d'action)
- tipBody : 2 phrases courtes (15-35 mots total) qui expliquent POURQUOI + COMMENT
- productMention : optionnel — une ligne subtile qui mentionne le produit comme outil utile (10-20 mots, jamais "achetez", jamais "soldes")
- captionForPost : FR caption Insta (60-120 mots) qui développe l'astuce + CTA "Lien en bio" si pertinent

Return JSON :
{
  "category": "ASTUCE DU JOUR" | "BON RÉFLEXE" | "À SAVOIR",
  "tipTitle": "...",
  "tipBody": "...",
  "productMention": "..." | null,
  "captionForPost": "...",
  "captionHashtags": ["..."],
  "altText": "..."
}`,
    maxTokens: 1500,
  });

  const slides = buildTipCard({
    tipTitle: content.tipTitle,
    tipBody: content.tipBody,
    category: content.category || "ASTUCE DU JOUR",
    productMention: content.productMention,
  });

  const paths = await renderCarousel({
    slides,
    outputDir: runDir,
    basename: `tip-${Date.now()}`,
  });

  return {
    mediaPaths: paths,
    format: "single",
    mediaType: "image",
    brief: {
      type: "designed-tip",
      templateType: "tip-card",
      product,
      content,
    },
    content,
  };
}

// ───────────────────────────────────────────────────────────
// Product highlight : photo produit + benefit + prix + CTA
// ───────────────────────────────────────────────────────────

async function generateProductHighlight(config, runDir) {
  const product = await pickFeatureProduct(config);

  const { data: content } = await claudeJSON(config, {
    system: `Tu écris la mise en avant d'un produit Poils Précieux. Ton bienveillant, jamais survendu, jamais d'urgence factice.`,
    user: `Mets en avant ce produit Poils Précieux :

Produit : ${product.title}
Type : ${product.productType}
Description : ${product.shortDescription}
Prix : ${product.price}€

STRUCTURE :
- benefitLine : phrase 5-10 mots qui résume LE bénéfice clé (visible en grand sur le visuel)
- captionForPost : FR caption Insta (80-130 mots) : hook 1 ligne + utilité réelle 2-3 phrases + CTA "Lien en bio — ${product.price}€"
- captionHashtags : 6-8 hashtags pyramide (brand + FR pet + niche race ou catégorie)
- altText : 1 phrase

Return JSON.`,
    maxTokens: 1500,
  });

  const slides = buildProductHighlight({
    productImageUrl: product.imageUrl,
    productName: product.title.replace(/—.*/g, "").trim(),
    benefitLine: content.benefitLine,
    price: `${product.price}€`,
    ctaText: "Lien en bio",
  });

  const paths = await renderCarousel({
    slides,
    outputDir: runDir,
    basename: `product-${Date.now()}`,
  });

  return {
    mediaPaths: paths,
    format: "single",
    mediaType: "image",
    brief: {
      type: "designed-product",
      templateType: "product-highlight",
      product,
      content,
    },
    content,
  };
}

// ───────────────────────────────────────────────────────────
// Sélection produit à featurer (rotation par jour)
// ───────────────────────────────────────────────────────────

async function pickFeatureProduct(config) {
  const data = await shopifyQuery(
    config,
    `query {
      products(first: 30, query: "status:active", sortKey: UPDATED_AT, reverse: true) {
        nodes {
          id title handle productType descriptionHtml
          featuredMedia { preview { image { url } } }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
        }
      }
    }`
  );
  const products = data.products.nodes.filter((p) => p.featuredMedia?.preview?.image?.url);
  if (products.length === 0) throw new Error("No products with images available");

  // Rotation simple : varie selon la date (jour ISO de l'année)
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const pick = products[dayOfYear % products.length];

  return {
    id: pick.id,
    handle: pick.handle,
    title: pick.title,
    productType: pick.productType,
    shortDescription: stripHtml(pick.descriptionHtml || "").slice(0, 250),
    price: parseFloat(pick.priceRangeV2?.minVariantPrice?.amount || "0").toFixed(2).replace(".", ","),
    imageUrl: pick.featuredMedia.preview.image.url,
  };
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
