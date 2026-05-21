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
