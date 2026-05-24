// Client Shopify Admin GraphQL — partagé entre tous les modules.
// Le token vient de process.env[config.shopify.envToken].

import { getEnvCredential } from "../config.js";

const API_VERSION = process.env.SHOPIFY_API_VERSION || "2026-04";

function endpoint(store) {
  const sanitized = store.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  return `https://${sanitized}/admin/api/${API_VERSION}/graphql.json`;
}

function authHeader(token) {
  if (token.startsWith("shpat_")) return { "X-Shopify-Access-Token": token };
  return { Authorization: `Bearer ${token}` };
}

export async function shopifyQuery(config, query, variables = {}) {
  const token = getEnvCredential(config.shopify.envToken);
  const url = endpoint(config.shopify.store);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeader(token) },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Shopify ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }
  return json.data;
}

function inferResource(mimeType) {
  if (mimeType?.startsWith("video/")) return "VIDEO";
  return "IMAGE";
}

export async function stagedUploadsCreate(config, { filename, mimeType, fileSize, resource }) {
  const res = resource || inferResource(mimeType);
  const data = await shopifyQuery(
    config,
    `mutation($input: [StagedUploadInput!]!) {
      stagedUploadsCreate(input: $input) {
        stagedTargets { url resourceUrl parameters { name value } }
        userErrors { field message }
      }
    }`,
    {
      input: [
        {
          resource: res,
          filename,
          mimeType,
          httpMethod: "POST",
          fileSize: String(fileSize),
        },
      ],
    }
  );
  const errors = data.stagedUploadsCreate.userErrors;
  if (errors?.length) throw new Error(`stagedUploadsCreate: ${JSON.stringify(errors)}`);
  return data.stagedUploadsCreate.stagedTargets[0];
}

async function postBinaryToTarget({ target, buffer, mimeType, filename }) {
  const form = new FormData();
  for (const p of target.parameters) form.append(p.name, p.value);
  form.append("file", new Blob([buffer], { type: mimeType }), filename);
  const res = await fetch(target.url, { method: "POST", body: form });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${txt.slice(0, 200)}`);
  }
  return target.resourceUrl;
}

export async function uploadImageBuffer(config, { buffer, filename, mimeType = "image/png" }) {
  const target = await stagedUploadsCreate(config, { filename, mimeType, fileSize: buffer.length });
  return await postBinaryToTarget({ target, buffer, mimeType, filename });
}

/**
 * Alias plus parlant pour upload générique (image ou vidéo).
 */
export async function uploadMediaBuffer(config, { buffer, filename, mimeType }) {
  return await uploadImageBuffer(config, { buffer, filename, mimeType });
}

/**
 * Upload vidéo complet : stagedUpload → fileCreate → poll READY → URL CDN publique.
 * Les staged URLs vidéo Shopify sont privées (GCS), faut passer par fileCreate pour avoir
 * une URL publique consommable par des services tiers (Buffer, etc).
 */
export async function uploadVideoToShopifyFiles(config, { buffer, filename, mimeType = "video/mp4", altText = "" }) {
  // 1. Stage upload
  const target = await stagedUploadsCreate(config, {
    filename,
    mimeType,
    fileSize: buffer.length,
    resource: "VIDEO",
  });

  // 2. POST binary
  const stagedUrl = await postBinaryToTarget({ target, buffer, mimeType, filename });

  // 3. fileCreate (Shopify ingère + transcode → URL CDN publique).
  // Note : on omet `filename` car les staged URLs vidéo de Shopify n'ont pas d'extension
  // dans l'URL → Shopify rejette ("filename extension must match original source").
  // Shopify dérive le nom automatiquement depuis le contenu.
  const createData = await shopifyQuery(
    config,
    `mutation($files: [FileCreateInput!]!) {
      fileCreate(files: $files) {
        files {
          id
          fileStatus
          ... on Video {
            id
            sources { url mimeType format height width }
            originalSource { url }
          }
        }
        userErrors { field message code }
      }
    }`,
    {
      files: [{
        originalSource: stagedUrl,
        contentType: "VIDEO",
        alt: altText,
      }],
    }
  );
  const errors = createData.fileCreate.userErrors;
  if (errors?.length) {
    throw new Error(`fileCreate: ${JSON.stringify(errors)}`);
  }
  const file = createData.fileCreate.files?.[0];
  if (!file?.id) throw new Error("fileCreate returned no file");

  // 4. Poll fileStatus = READY (videos take ~20-60s to transcode)
  const fileId = file.id;
  const startTime = Date.now();
  const maxWaitMs = 180000; // 3 min
  let attempts = 0;
  while (Date.now() - startTime < maxWaitMs) {
    attempts++;
    await new Promise((r) => setTimeout(r, attempts < 5 ? 3000 : 5000));
    const statusData = await shopifyQuery(
      config,
      `query($id: ID!) {
        node(id: $id) {
          ... on Video {
            id
            fileStatus
            fileErrors { code details message }
            sources { url mimeType format }
            originalSource { url }
          }
        }
      }`,
      { id: fileId }
    );
    const node = statusData.node;
    if (!node) throw new Error(`Video file ${fileId} not found`);
    if (node.fileStatus === "READY") {
      const sources = node.sources || [];
      const mp4 = sources.find((s) => (s.mimeType || "").includes("mp4")) || sources[0];
      const url = mp4?.url || node.originalSource?.url;
      if (!url) throw new Error("Video READY but no source URL returned");
      return url;
    }
    if (node.fileStatus === "FAILED") {
      const errs = node.fileErrors || [];
      const errStr = errs.length
        ? errs.map((e) => `${e.code}: ${e.message}${e.details ? ` (${e.details})` : ""}`).join(" | ")
        : "(no fileErrors details)";
      throw new Error(`Shopify video processing FAILED for ${fileId} — ${errStr}`);
    }
    // PROCESSING / UPLOADED → on continue à poller
  }
  throw new Error(`Shopify video processing timeout (>${maxWaitMs / 1000}s)`);
}

/**
 * Liste les produits matchant une query, avec variants + options + media (pour régénération images).
 */
export async function listProductsForImages(config, { searchQuery = "status:ACTIVE", limit = 50 } = {}) {
  const out = [];
  let cursor = null;
  while (true) {
    const data = await shopifyQuery(
      config,
      `query($cursor: String, $q: String) {
        products(first: 25, after: $cursor, query: $q, sortKey: CREATED_AT, reverse: true) {
          edges { node {
            id title handle status productType tags
            options { id name values }
            media(first: 30) { edges { node { ... on MediaImage { id image { url } } } } }
            variants(first: 100) { edges { node {
              id title
              selectedOptions { name value }
              image { id url }
            } } }
          } }
          pageInfo { hasNextPage endCursor }
        }
      }`,
      { cursor, q: searchQuery }
    );
    for (const e of data.products.edges) {
      const mediaNodes = e.node.media.edges.map((m) => m.node).filter((n) => n?.image?.url);
      out.push({
        id: e.node.id,
        title: e.node.title,
        handle: e.node.handle,
        productType: e.node.productType,
        tags: e.node.tags,
        options: e.node.options || [],
        variants: e.node.variants.edges.map((v) => ({
          id: v.node.id,
          title: v.node.title,
          selectedOptions: v.node.selectedOptions || [],
          imageUrl: v.node.image?.url || null,
        })),
        mediaIds: mediaNodes.map((n) => n.id),
        mediaUrls: mediaNodes.map((n) => n.image.url),
      });
      if (out.length >= limit) return out;
    }
    if (!data.products.pageInfo.hasNextPage) break;
    cursor = data.products.pageInfo.endCursor;
  }
  return out;
}

/**
 * Attache une image (buffer PNG) à un produit : staged upload → productCreateMedia.
 * Retourne { mediaId, imageUrl }.
 */
export async function attachImageBuffer(config, { productId, buffer, filename, altText = "" }) {
  const resourceUrl = await uploadImageBuffer(config, { buffer, filename, mimeType: "image/png" });
  const data = await shopifyQuery(
    config,
    `mutation($id: ID!, $media: [CreateMediaInput!]!) {
      productCreateMedia(productId: $id, media: $media) {
        media { ... on MediaImage { id image { url } } }
        mediaUserErrors { field message }
      }
    }`,
    { id: productId, media: [{ originalSource: resourceUrl, mediaContentType: "IMAGE", alt: altText }] }
  );
  const errors = data.productCreateMedia.mediaUserErrors;
  if (errors?.length) throw new Error(`productCreateMedia: ${JSON.stringify(errors)}`);
  const media = data.productCreateMedia.media?.[0];
  return { mediaId: media?.id || null, imageUrl: media?.image?.url || null };
}

/**
 * Lie une image média à plusieurs variantes.
 */
export async function linkMediaToVariants(config, { productId, variantIds, mediaId }) {
  if (!variantIds?.length || !mediaId) return [];
  const data = await shopifyQuery(
    config,
    `mutation($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        productVariants { id }
        userErrors { field message }
      }
    }`,
    { productId, variants: variantIds.map((id) => ({ id, mediaId })) }
  );
  const errors = data.productVariantsBulkUpdate.userErrors;
  if (errors?.length) throw new Error(`linkMediaToVariants: ${JSON.stringify(errors)}`);
  return data.productVariantsBulkUpdate.productVariants;
}

/**
 * Supprime des médias d'un produit.
 */
export async function deleteProductMedia(config, { productId, mediaIds }) {
  if (!mediaIds?.length) return [];
  const data = await shopifyQuery(
    config,
    `mutation($id: ID!, $mediaIds: [ID!]!) {
      productDeleteMedia(productId: $id, mediaIds: $mediaIds) {
        deletedMediaIds
        mediaUserErrors { field message }
      }
    }`,
    { id: productId, mediaIds }
  );
  const errors = data.productDeleteMedia.mediaUserErrors;
  if (errors?.length) throw new Error(`productDeleteMedia: ${JSON.stringify(errors)}`);
  return data.productDeleteMedia.deletedMediaIds;
}

/**
 * Ajoute un tag à un produit (merge avec les tags existants via tagsAdd).
 */
export async function addProductTag(config, productId, tag) {
  const data = await shopifyQuery(
    config,
    `mutation($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        userErrors { field message }
      }
    }`,
    { id: productId, tags: [tag] }
  );
  const errors = data.tagsAdd.userErrors;
  if (errors?.length) throw new Error(`tagsAdd: ${JSON.stringify(errors)}`);
  return true;
}

export async function createArticle(config, { blogId, title, body, summary, imageUrl, imageAlt, tags = [], handle, isPublished = true, authorName }) {
  const name = authorName || config.blog?.author || "Équipe Poils Précieux";
  const data = await shopifyQuery(
    config,
    `mutation($article: ArticleCreateInput!) {
      articleCreate(article: $article) {
        article { id title handle }
        userErrors { field message }
      }
    }`,
    {
      article: {
        blogId,
        title,
        body,
        summary,
        handle,
        isPublished,
        tags: tags.join(","),
        author: { name },
        ...(imageUrl ? { image: { url: imageUrl, altText: imageAlt || title } } : {}),
      },
    }
  );
  const errors = data.articleCreate.userErrors;
  if (errors?.length) throw new Error(`articleCreate: ${JSON.stringify(errors)}`);
  return data.articleCreate.article;
}

export async function listExistingArticles(config) {
  const data = await shopifyQuery(
    config,
    `query($id: ID!) {
      blog(id: $id) {
        articles(first: 50) {
          nodes { id title handle }
        }
      }
    }`,
    { id: config.shopify.blogId }
  );
  return data.blog.articles.nodes;
}
