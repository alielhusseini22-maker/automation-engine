// Polish d'un produit fraîchement importé via DSERS.
// Applique : traduction options/variantes, suppression Ships From, alignement prix,
// extraction dimensions vers description, simplification mono-variante.

import { shopifyQuery } from "../shopify/client.js";
import { translateColor, translateOptionName, isShipsFromOption } from "./translations.js";
import { extractDimensions, splitSizeLabel, dimensionsTableMarkdown } from "./dimensions.js";

/**
 * Récupère l'état complet d'un produit (options, variants, descriptionHtml).
 */
export async function fetchProductForPolish(config, productId) {
  const data = await shopifyQuery(
    config,
    `query($id: ID!) {
      product(id: $id) {
        id title handle descriptionHtml productType tags
        options { id name optionValues { id name } }
        variants(first: 100) {
          nodes { id title price inventoryQuantity selectedOptions { name value } }
        }
      }
    }`,
    { id: productId }
  );
  return data.product;
}

/**
 * Plan de polish — pure function, ne touche pas Shopify.
 * Returns: { actions: [{ type, payload, reason }] }
 */
export function planPolish(product, polishRules) {
  const actions = [];

  // 1. Détection "Ships From: China Mainland" → delete option
  for (const opt of product.options) {
    if (isShipsFromOption(opt.name) && polishRules.removeShipsFrom) {
      actions.push({
        type: "deleteOption",
        optionId: opt.id,
        reason: `Remove "${opt.name}" option (clutter, all values = China Mainland)`,
      });
    }
  }

  // 2. Mono-variante options (1 seule valeur) → delete option
  for (const opt of product.options) {
    if (polishRules.simplifySingleVariantOption && opt.optionValues.length === 1 && !isShipsFromOption(opt.name)) {
      actions.push({
        type: "deleteOption",
        optionId: opt.id,
        reason: `Single-value option "${opt.name}: ${opt.optionValues[0].name}" — simplify to Default Title`,
      });
    }
  }

  // 3. Traduction option names + values
  if (polishRules.renameColors) {
    for (const opt of product.options) {
      if (isShipsFromOption(opt.name)) continue;
      const newOptName = translateOptionName(opt.name);
      const valueRenames = [];
      for (const v of opt.optionValues) {
        if (opt.name.toLowerCase().includes("color") || opt.name.toLowerCase().includes("colour")) {
          const fr = translateColor(v.name);
          if (fr && fr !== v.name) valueRenames.push({ id: v.id, from: v.name, to: fr });
        }
      }
      if (newOptName !== opt.name || valueRenames.length > 0) {
        actions.push({
          type: "renameOption",
          optionId: opt.id,
          newName: newOptName,
          valueRenames,
          reason: `Translate "${opt.name}" → "${newOptName}" + ${valueRenames.length} values to FR`,
        });
      }
    }
  }

  // 4. Extraction dimensions depuis variant titles → description
  if (polishRules.extractDimensionsToDescription) {
    const sizesWithDims = [];
    for (const v of product.variants.nodes) {
      const { label, dimensions } = splitSizeLabel(v.title);
      if (dimensions) {
        sizesWithDims.push({ label, dimensions, variantId: v.id });
      }
    }
    if (sizesWithDims.length > 0) {
      const dimTable = dimensionsTableMarkdown(sizesWithDims);
      const newDescription = (product.descriptionHtml || "") + dimTable;
      actions.push({
        type: "updateDescription",
        newDescriptionHtml: newDescription,
        reason: `Append dimensions table (${sizesWithDims.length} sizes detected)`,
      });
    }
  }

  return { actions };
}

/**
 * Applique le plan de polish via mutations Shopify.
 */
export async function executePolish(config, productId, plan) {
  const results = [];

  for (const action of plan.actions) {
    try {
      if (action.type === "deleteOption") {
        await shopifyQuery(
          config,
          `mutation($productId: ID!, $options: [ID!]!) {
            productOptionsDelete(productId: $productId, options: $options, strategy: DEFAULT) {
              userErrors { field message code }
            }
          }`,
          { productId, options: [action.optionId] }
        );
      } else if (action.type === "renameOption") {
        const optionInput = { id: action.optionId };
        if (action.newName) optionInput.name = action.newName;
        const optionValuesToUpdate = action.valueRenames.map((v) => ({ id: v.id, name: v.to }));
        await shopifyQuery(
          config,
          `mutation($productId: ID!, $option: OptionUpdateInput!, $optionValuesToUpdate: [OptionValueUpdateInput!]) {
            productOptionUpdate(productId: $productId, option: $option, optionValuesToUpdate: $optionValuesToUpdate) {
              userErrors { field message code }
            }
          }`,
          { productId, option: optionInput, optionValuesToUpdate }
        );
      } else if (action.type === "updateDescription") {
        await shopifyQuery(
          config,
          `mutation($product: ProductUpdateInput!) {
            productUpdate(product: $product) { userErrors { field message } }
          }`,
          { product: { id: productId, descriptionHtml: action.newDescriptionHtml } }
        );
      }
      results.push({ action: action.type, ok: true, reason: action.reason });
    } catch (err) {
      results.push({ action: action.type, ok: false, error: err.message, reason: action.reason });
    }
  }

  return results;
}
