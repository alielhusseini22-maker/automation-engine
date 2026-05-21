// Auto-promo nouveau produit : détecte les produits Shopify avec tag "nouveau-produit"
// et construit un post promotionnel à partir de leurs vraies infos (titre, prix, image hero).

import { shopifyQuery } from "../shopify/client.js";

/**
 * Trouve un produit avec tag "nouveau-produit" non encore promu (tag "promo-sent").
 * Si plusieurs, prend le plus récent.
 */
export async function findNewProductToPromote(config) {
  const data = await shopifyQuery(
    config,
    `query {
      products(first: 10, query: "status:active AND tag:'nouveau-produit' AND -tag:'promo-sent'", sortKey: CREATED_AT, reverse: true) {
        nodes {
          id title handle descriptionHtml productType tags
          featuredMedia { preview { image { url } } }
          priceRangeV2 { minVariantPrice { amount currencyCode } }
        }
      }
    }`
  );
  return data.products.nodes[0] || null;
}

/**
 * Marque un produit comme "promo envoyée" pour ne plus le repromouvoir.
 */
export async function markPromoSent(config, productId) {
  await shopifyQuery(
    config,
    `mutation($product: ProductUpdateInput!) {
      productUpdate(product: $product) {
        userErrors { field message }
      }
    }`,
    { product: { id: productId, tags: ["promo-sent"] } } // Note: Shopify merge tags
  );
}

/**
 * Construit le brief pour Claude pour rédiger une caption promo d'un produit existant.
 */
export function productPromoBrief(product) {
  return {
    type: "shopify-product-promo",
    title: product.title,
    handle: product.handle,
    productType: product.productType,
    description: stripHtml(product.descriptionHtml || ""),
    price: product.priceRangeV2?.minVariantPrice?.amount,
    currency: product.priceRangeV2?.minVariantPrice?.currencyCode,
    imageUrl: product.featuredMedia?.preview?.image?.url,
  };
}

function stripHtml(html) {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
}
