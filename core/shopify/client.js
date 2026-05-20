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

export async function stagedUploadsCreate(config, { filename, mimeType, fileSize }) {
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
          resource: "IMAGE",
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

export async function createArticle(config, { blogId, title, body, summary, imageUrl, imageAlt, tags = [], handle, isPublished = true }) {
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
