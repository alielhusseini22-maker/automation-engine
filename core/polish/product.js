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
- STYLE HUMAIN, jamais « généré par IA » : bannis les clichés et tics d'IA (« transforme votre X en Y », « dites adieu à », « fini les », « en un seul geste », « véritable », « que demander de plus », tirets cadratins à répétition). Varie le rythme des phrases, privilégie le concret (situations vécues, détails spécifiques ; aucun chiffre de performance inventé) et glisse un aparté complice. Pas de symétrie robotique.
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
- descriptionHtml : suis le GABARIT MAISON exact, dans l'ordre, avec ces sections h3 : <p>accroche (problème vécu, concret)</p> · <h3>Mascotte™ : bénéfice clé</h3><p>fonctionnement et matière réels</p> · <h3>Pour qui ?</h3><ul>3 profils</ul> · <h3>Dimensions | Contenu | Caractéristiques</h3><ul>specs/contenu réels ; si plusieurs variantes/packs, précise ce que contient chaque option</ul> · <h3>Le bon geste</h3><p>usage et entretien</p> · <h3>Garanties Poils Précieux</h3><ul>3 FAITS produit vérifiables en « ✓ » puis « ✓ Livraison France 5-9 jours ouvrés — retours 30 jours »</ul>. Jamais d'accessoire non confirmé (étui, support...). Écris-le naturellement, pas de façon mécanique.
- category : une seule parmi chien, chat, toilettage, alimentation, couchage, balade, jeu.
- collections : 1 à 3 parmi les collections disponibles ci-dessus. TOUJOURS l'audience (Pour chien et/ou Pour chat) + la collection fonctionnelle correspondante.
- priceEUR : prix de vente UNIQUE (appliqué à toutes les variantes), aligné sur le PRIX DU MARCHÉ FRANÇAIS pour ce type de produit. Marge MODESTE : la marque est nouvelle et inconnue, donc rester compétitif et ne PAS être gourmand. Plancher : au moins 2× le coût d'achat le plus élevé (${costMax != null ? `soit ≥ ${(costMax * 2).toFixed(2)}€` : "viabilité pub"}). Terminaison en .90 (ex: 14.90, 24.90).
- options/values : "from" = valeur brute EXACTE (pour le matching). "to" = label FR épuré (enlève codes matière/techniques : "300ml-PET"→"300ml", "with connect Black"→"Noir" ; traduis et capitalise).
- "keep": false pour doublons, valeurs parasites ("(old)", "（old）", vides) et coloris superflus : garde AU MAXIMUM ${maxColors} coloris en privilégiant les neutres (noir, blanc, gris, beige, vert sauge, bleu marine) et en écartant les coloris flashy/fluo. Garde TOUJOURS au moins une valeur par option et conserve les tailles utiles (S/M/L/XL, ml).`;

  const { data } = await claudeJSON(config, { system, user, maxTokens: 3000 });
  return data;
}

/**
 * Réécrit la description d'un produit dans le GABARIT MAISON Poils Précieux,
 * pour une cohérence totale du catalogue. Utilise UNIQUEMENT les infos fournies
 * (titre + description actuelle + variantes) — n'invente aucune spec ni garantie.
 * @returns {string} descriptionHtml au gabarit
 */
export async function generateTemplateDescription(config, product) {
  const current = stripHtml(product.descriptionHtml).slice(0, 2200);
  const variantList = (product.variants?.nodes || product.variants || [])
    .map((v) => v.title)
    .filter((t) => t && t !== "Default Title")
    .slice(0, 30)
    .join(" | ");

  const system = `Tu es le copywriter de Poils Précieux, boutique e-commerce française premium et minimaliste d'accessoires pour chiens et chats. Tu écris comme un vrai passionné d'animaux qui connaît le quotidien des maîtres.
Tu RÉÉCRIS la description d'un produit existant dans le GABARIT MAISON exact, pour une cohérence parfaite du catalogue.

STYLE — LE PLUS IMPORTANT : ça doit sonner HUMAIN, jamais « généré par IA ».
- Bannis les tics d'IA et clichés marketing : « transforme votre X en Y », « dites adieu à », « fini les », « en un seul geste », « véritable », « que demander de plus », « il n'aura jamais été aussi simple », les superlatifs creux, et les tirets cadratins à répétition.
- Varie le rythme : mêle phrases courtes et percutantes et phrases plus longues. Pas de structure répétitive.
- Concret avant tout : situations vécues et détails spécifiques plutôt que du générique. Mais AUCUN chiffre de performance inventé (« 80 % de poils en moins », « 2× plus rapide », « -50 % »...) — n'utilise QUE des chiffres réellement présents dans les infos fournies.
- Glisse un aparté complice, comme une marque qui parle vraiment à des maîtres d'animaux (ton chaleureux, un brin d'humour discret quand c'est naturel).
- Pas de symétrie robotique : les puces peuvent avoir des longueurs différentes.

Règles dures : utilise UNIQUEMENT les informations fournies (titre + infos actuelles + variantes) ; n'invente AUCUNE spec, mesure, matière ou garantie produit non déductible. Aucun emoji (le caractère ✓ est autorisé dans les garanties). Ne mentionne jamais un accessoire non confirmé (étui, support...).`;

  const user = `Réécris cette fiche dans le gabarit Poils Précieux.

TITRE : ${product.title}
INFOS ACTUELLES (source à reformuler, ne rien inventer au-delà) : ${current || "(vide)"}
VARIANTES : ${variantList || "(variante unique)"}

GABARIT EXACT (respecte les balises h3 et l'ordre ; la mascotte est le nom après « — » dans le titre) :
<p>[Accroche : le problème vécu par le maître, concret et relatable]</p>
<h3>Mascotte™ : [bénéfice clé en quelques mots]</h3>
<p>[Comment ça marche / la solution concrète : fonctionnement et matière réels]</p>
<h3>Pour qui ?</h3>
<ul><li>[profil 1]</li><li>[profil 2]</li><li>[profil 3]</li></ul>
<h3>[Dimensions | Contenu | Caractéristiques]</h3>
<ul><li>[specs/contenu réels ; si plusieurs variantes ou packs, précise ce que contient chaque option, ex: « Pack de 4 = 4 traceurs »]</li></ul>
<h3>Le bon geste</h3>
<p>[utilisation et entretien concrets]</p>
<h3>Garanties Poils Précieux</h3>
<ul><li>✓ [garantie produit 1]</li><li>✓ [garantie produit 2]</li><li>✓ [garantie produit 3]</li><li>✓ Livraison France 5-9 jours ouvrés — retours 30 jours</li></ul>

Consignes : 4e section = « Dimensions » pour le textile/tailles, « Contenu » pour les kits/packs/lots, « Caractéristiques » sinon. Les 3 premières garanties doivent être des FAITS PRODUIT vérifiables (matière, entretien, sécurité, compatibilité, etc.) — JAMAIS une promesse de service inventée (pas de « SAV 24h », « satisfait ou remboursé », « testé en laboratoire » si ce n'est pas dans les infos). Termine TOUJOURS les Garanties par la ligne « ✓ Livraison France 5-9 jours ouvrés — retours 30 jours ». Réponds en JSON strict : { "descriptionHtml": "..." }`;

  const { data } = await claudeJSON(config, { system, user, maxTokens: 2500 });
  return data.descriptionHtml;
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
