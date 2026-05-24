// Polish d'un produit fraîchement importé via DSERS.
// Applique : traduction options/variantes, suppression Ships From, alignement prix,
// extraction dimensions vers description, simplification mono-variante.

import { shopifyQuery } from "../shopify/client.js";
import { claudeJSON } from "../claude/client.js";
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

// ─────────────────────────────────────────────────────────────────────────────
// AI-powered polish : titre FR + description conforme, nettoyage/élagage variantes
// (AVANT génération d'images → économie de coût), et rattachement aux collections.
// ─────────────────────────────────────────────────────────────────────────────

function stripHtml(html) {
  return (html || "").replace(/<[^>]+>/g, " ").replace(/&[a-z]+;/gi, " ").replace(/\s+/g, " ").trim();
}

/**
 * Liste les collections de la boutique (id + titre) pour le rattachement par catégorie.
 */
export async function fetchCollections(config) {
  const out = [];
  let cursor = null;
  while (true) {
    const data = await shopifyQuery(
      config,
      `query($cursor: String) {
        collections(first: 50, after: $cursor) {
          edges { node { id title } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { cursor }
    );
    for (const e of data.collections.edges) out.push({ id: e.node.id, title: e.node.title });
    if (!data.collections.pageInfo.hasNextPage) break;
    cursor = data.collections.pageInfo.endCursor;
  }
  return out;
}

/**
 * UN appel Claude : transforme la fiche brute (titre EN, desc "SPECIFICATIONS", variantes en vrac)
 * en fiche premium FR + plan de nettoyage des variantes + collections cibles.
 * Retourne { title, mascot, descriptionHtml, category, collections, options }.
 */
export async function generateProductPolishAI(config, product, { collectionTitles = [], maxColors = 6 } = {}) {
  const rawDesc = stripHtml(product.descriptionHtml).slice(0, 1500);
  const options = (product.options || []).map((o) => ({
    name: o.name,
    values: (o.optionValues || []).map((v) => v.name),
  }));

  // À l'import DSERS, le prix variante = coût d'achat → base pour le pricing marché.
  const costs = (product.variants?.nodes || [])
    .map((v) => parseFloat(v.price))
    .filter((n) => !Number.isNaN(n) && n > 0);
  const costMin = costs.length ? Math.min(...costs) : null;
  const costMax = costs.length ? Math.max(...costs) : null;

  const system = `Tu es responsable des fiches produit de Poils Précieux, boutique e-commerce française premium et minimaliste d'accessoires pour chiens et chats (poilsprecieux.com).
Ton rôle : transformer une fiche BRUTE importée d'AliExpress (titre en anglais, description "SPECIFICATIONS", variantes en vrac) en une fiche PREMIUM FRANÇAISE, claire, honnête et épurée.
Règles absolues :
- Aucun emoji.
- Français impeccable, ton premium et sobre, orienté bénéfice client.
- Description HONNÊTE et PRÉCISE sur le fonctionnement RÉEL du produit : explique concrètement comment il marche et à quoi il sert, sans promesse fausse ni superlatif creux.
- COMPOSITION EXACTE : indique clairement ce que le client reçoit (nombre et nature des pièces, ex: "4 pièces : 1 ciseau droit, 1 ciseau courbé, 1 ciseau à effiler, 1 peigne") et les caractéristiques concrètes (matière, dimensions, capacité) UNIQUEMENT d'après les données fournies. N'invente AUCUNE caractéristique ni mesure.
- ATTENTION accessoires non inclus : les visuels marketing montrent souvent un étui, un support ou des accessoires qui NE SONT PAS fournis. Ne mentionne JAMAIS un accessoire qui n'est pas explicitement listé dans le titre ou les specs brutes.
- Jamais de mention "AliExpress", "SPECIFICATIONS", "Brand Name: NONE" ni de charabia traduit.`;

  const user = `Produit brut à transformer :
TITRE BRUT : ${product.title}
DESCRIPTION BRUTE : ${rawDesc || "(vide)"}
OPTIONS/VARIANTES BRUTES : ${JSON.stringify(options)}
COÛT D'ACHAT (par variante) : ${costMin != null ? `${costMin}€ à ${costMax}€` : "inconnu"}

Collections disponibles : ${collectionTitles.join(" | ")}

Réponds en JSON strict :
{
  "title": "Nature du produit + bénéfice — Mascotte™",
  "mascot": "Mascotte",
  "descriptionHtml": "<p>...</p><p>...</p><ul><li>...</li></ul>",
  "category": "toilettage",
  "collections": ["Toilettage & Hygiène", "Pour chien"],
  "priceEUR": 14.90,
  "options": [
    { "name": "Couleur", "values": [ { "from": "with connect Black", "to": "Noir", "keep": true }, { "from": "Jaune", "to": "Jaune", "keep": false } ] }
  ]
}

Consignes :
- title : format "[nature + bénéfice] — [Mascotte]™" (ex: "Douchette de bain pour chien avec brosse silicone — Rinso™").
- mascot : 4-6 lettres, mignon, FR/EN, finissant par -y ou -o, distinctif.
- descriptionHtml : un paragraphe d'accroche (problème vécu → solution concrète), puis la COMPOSITION/CONTENU EXACT quand c'est pertinent (ex: "<strong>Contenu : 4 pièces en acier inoxydable</strong>" + la liste), puis 3 à 5 puces de bénéfices ET caractéristiques précis et véridiques (matière, dimensions/capacité si connues). Jamais d'accessoire non confirmé (étui, support...).
- category : une seule parmi chien, chat, toilettage, alimentation, couchage, balade, jeu.
- collections : 1 à 3 parmi les collections disponibles ci-dessus. TOUJOURS l'audience (Pour chien et/ou Pour chat) + la collection fonctionnelle correspondante.
- priceEUR : prix de vente UNIQUE (appliqué à toutes les variantes), aligné sur le PRIX DU MARCHÉ FRANÇAIS pour ce type de produit. Marge MODESTE : la marque est nouvelle et inconnue, donc rester compétitif et ne PAS être gourmand. Plancher : au moins 2× le coût d'achat le plus élevé (${costMax != null ? `soit ≥ ${(costMax * 2).toFixed(2)}€` : "viabilité pub"}). Terminaison en .90 (ex: 14.90, 24.90).
- options/values : "from" = valeur brute EXACTE (pour le matching). "to" = label FR épuré (enlève codes matière/techniques : "300ml-PET"→"300ml", "with connect Black"→"Noir" ; traduis et capitalise).
- "keep": false pour doublons, valeurs parasites ("(old)", "（old）", vides) et coloris superflus : garde AU MAXIMUM ${maxColors} coloris en privilégiant les neutres (noir, blanc, gris, beige, vert sauge, bleu marine) et en écartant les coloris flashy/fluo. Garde TOUJOURS au moins une valeur par option et conserve les tailles utiles (S/M/L/XL, ml).`;

  const { data } = await claudeJSON(config, { system, user, maxTokens: 3000 });
  return data;
}

/**
 * Applique le plan AI. ORDRE important :
 *   1) supprime les variantes superflues (AVANT images → économie),
 *   2) renomme options + valeurs gardées,
 *   3) titre + description FR,
 *   4) rattache aux collections.
 * @returns {string[]} log lisible des actions
 */
export async function applyAIPolish(config, product, aiPlan, { collections = [], dryRun = false } = {}) {
  const log = [];
  const productId = product.id;
  const variants = product.variants?.nodes || [];

  // 1. Variantes à supprimer (valeurs keep === false)
  const dropKeys = new Set();
  for (const opt of aiPlan.options || []) {
    for (const v of opt.values || []) {
      if (v.keep === false) dropKeys.add(`${opt.name}::${v.from}`);
    }
  }
  const variantsToDelete = variants
    .filter((vr) => (vr.selectedOptions || []).some((so) => dropKeys.has(`${so.name}::${so.value}`)))
    .map((vr) => vr.id);
  const remaining = variants.length - variantsToDelete.length;
  if (variantsToDelete.length && remaining >= 1) {
    log.push(`élague ${variantsToDelete.length} variante(s) avant images`);
    if (!dryRun) {
      await shopifyQuery(
        config,
        `mutation($productId: ID!, $variantsIds: [ID!]!) {
          productVariantsBulkDelete(productId: $productId, variantsIds: $variantsIds) { userErrors { field message } }
        }`,
        { productId, variantsIds: variantsToDelete }
      );
    }
  } else if (variantsToDelete.length) {
    log.push(`élagage ignoré (supprimerait toutes les ${variants.length} variantes)`);
  }

  // 1b. Prix marché (marge modeste) sur les variantes conservées
  if (aiPlan.priceEUR != null) {
    const costMax = Math.max(0, ...variants.map((v) => parseFloat(v.price) || 0));
    let price = Number(aiPlan.priceEUR);
    if (!Number.isFinite(price) || price <= 0) price = costMax > 0 ? costMax * 2.2 : 0;
    // Plancher de viabilité : jamais sous 2× le coût le plus élevé
    if (costMax > 0 && price < costMax * 2) price = Math.ceil(costMax * 2) - 0.1;
    const priceStr = price.toFixed(2);
    const keptIds = variants.filter((v) => !variantsToDelete.includes(v.id)).map((v) => v.id);
    if (keptIds.length && price > 0) {
      log.push(`prix ${priceStr}€ sur ${keptIds.length} variante(s)`);
      if (!dryRun) {
        await shopifyQuery(
          config,
          `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) { userErrors { field message } }
          }`,
          { productId, variants: keptIds.map((id) => ({ id, price: priceStr })) }
        );
      }
    }
  }

  // 2. Renommage options + valeurs gardées
  for (const opt of aiPlan.options || []) {
    const productOpt =
      (product.options || []).find((o) => o.name === opt.name) ||
      (product.options || []).find((o) =>
        (o.optionValues || []).some((ov) => (opt.values || []).some((v) => v.from === ov.name))
      );
    if (!productOpt) continue;
    const optionValuesToUpdate = [];
    for (const v of opt.values || []) {
      if (v.keep === false) continue;
      const ov = (productOpt.optionValues || []).find((x) => x.name === v.from);
      if (ov && v.to && v.to !== v.from) optionValuesToUpdate.push({ id: ov.id, name: v.to });
    }
    const needNameChange = opt.name && opt.name !== productOpt.name;
    if (needNameChange || optionValuesToUpdate.length) {
      log.push(`renomme option "${productOpt.name}" → "${opt.name}" (${optionValuesToUpdate.length} valeur(s))`);
      if (!dryRun) {
        const optionInput = { id: productOpt.id };
        if (needNameChange) optionInput.name = opt.name;
        await shopifyQuery(
          config,
          `mutation($productId: ID!, $option: OptionUpdateInput!, $optionValuesToUpdate: [OptionValueUpdateInput!]) {
            productOptionUpdate(productId: $productId, option: $option, optionValuesToUpdate: $optionValuesToUpdate) { userErrors { field message code } }
          }`,
          { productId, option: optionInput, optionValuesToUpdate }
        );
      }
    }
  }

  // 3. Titre + description FR
  if (aiPlan.title || aiPlan.descriptionHtml) {
    log.push(`titre + description FR`);
    if (!dryRun) {
      await shopifyQuery(
        config,
        `mutation($product: ProductUpdateInput!) {
          productUpdate(product: $product) { userErrors { field message } }
        }`,
        {
          product: {
            id: productId,
            ...(aiPlan.title ? { title: aiPlan.title } : {}),
            ...(aiPlan.descriptionHtml ? { descriptionHtml: aiPlan.descriptionHtml } : {}),
          },
        }
      );
    }
  }

  // 4. Collections
  const wantTitles = aiPlan.collections || [];
  const toAdd = collections.filter((c) => wantTitles.includes(c.title));
  for (const col of toAdd) {
    log.push(`collection "${col.title}"`);
    if (!dryRun) {
      await shopifyQuery(
        config,
        `mutation($id: ID!, $productIds: [ID!]!) {
          collectionAddProducts(id: $id, productIds: $productIds) { userErrors { field message } }
        }`,
        { id: col.id, productIds: [productId] }
      );
    }
  }

  return log;
}
