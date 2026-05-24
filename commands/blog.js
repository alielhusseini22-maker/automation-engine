#!/usr/bin/env node
// Génère et publie un article de blog hebdomadaire.
//
// Workflow:
//   1. Pick un sujet (Claude + web_search, évite les doublons)
//   2. Écrit l'article complet (Claude)
//   3. Génère image hero (GPT-Image-1)
//   4. Upload image vers Shopify CDN
//   5. Publie via articleCreate
//
// Usage:
//   node commands/blog.js --project poils-precieux
//   node commands/blog.js --project poils-precieux --dry-run
//   node commands/blog.js --project poils-precieux --topic "Mon titre" (skip step 1)

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { loadProject, loadBrandCharter, parseArgs, runDir } from "../core/config.js";
import { listExistingArticles, uploadImageBuffer, createArticle } from "../core/shopify/client.js";
import { pickTopic } from "../core/blog/topics.js";
import { writeArticle } from "../core/blog/writer.js";
import { generateHero } from "../core/blog/hero.js";
import { loadWeeklyPlan } from "../core/strategy/weekly-plan.js";

function isoWeek(d = new Date()) {
  const t = new Date(d.valueOf());
  const dn = (d.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dn + 3);
  const ft = t.valueOf();
  t.setUTCMonth(0, 1);
  if (t.getUTCDay() !== 4) t.setUTCMonth(0, 1 + ((4 - t.getUTCDay()) + 7) % 7);
  return 1 + Math.ceil((ft - t.valueOf()) / 604800000);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const config = loadProject(args.project);
  const dir = runDir(config, "blog");
  const brand = loadBrandCharter(config);
  const weekNumber = isoWeek();

  console.log(`[blog] project=${config.project.id} week=${weekNumber}`);

  // Step 1 — pick topic
  let topic;
  if (args.topic) {
    topic = { title: args.topic, handle: slugify(args.topic), metaDescription: "", outline: [], primaryKeyword: args.topic };
  } else {
    console.log(`[blog] Step 1/5 — picking topic (Claude + web_search)`);
    const existing = await listExistingArticles(config);
    const titles = existing.map((a) => a.title);
    const weeklyPlan = loadWeeklyPlan(config);
    if (weeklyPlan?.blogAngle) console.log(`[blog]   weekly-plan angle: ${weeklyPlan.blogAngle}`);
    const result = await pickTopic(config, { existingTitles: titles, weekNumber, locale: config.project.locale, weeklyPlan });
    topic = result.topic;
    console.log(`[blog]   → ${topic.title}`);
    fs.writeFileSync(path.join(dir, "topic.json"), JSON.stringify({ topic, citations: result.citations }, null, 2), "utf8");
  }

  // Step 2 — write article HTML
  console.log(`[blog] Step 2/5 — writing article`);
  const { html, usage: writeUsage } = await writeArticle(config, { topic, brandCharter: brand });
  fs.writeFileSync(path.join(dir, "article.html"), html, "utf8");
  console.log(`[blog]   → ${Math.round(html.length / 6)} approx words`);

  // Step 3 — generate hero image (Claude-provided imagePrompt si présent, sinon heuristique)
  console.log(`[blog] Step 3/5 — generating hero image`);
  const { buffer: imgBuf, prompt: imgPrompt } = await generateHero(config, {
    title: topic.title,
    summary: topic.metaDescription || topic.uniqueAngle || "",
    imagePrompt: topic.imagePrompt, // ← clé : prompt contextualisé par Claude, espèce-aware
    species: topic.species,
  });
  const heroPath = path.join(dir, `${topic.handle}.png`);
  fs.writeFileSync(heroPath, imgBuf);
  console.log(`[blog]   → ${heroPath} (${imgBuf.length} bytes)`);

  if (args.dryRun) {
    console.log(`[blog] DRY RUN — skipping Shopify upload/create`);
    console.log(`[blog] Topic: ${topic.title}`);
    console.log(`[blog] Handle: ${topic.handle}`);
    return;
  }

  // Step 4 — upload to Shopify CDN
  console.log(`[blog] Step 4/5 — uploading image to Shopify CDN`);
  const imageUrl = await uploadImageBuffer(config, {
    buffer: imgBuf,
    filename: `${topic.handle}.png`,
  });
  console.log(`[blog]   → ${imageUrl}`);

  // Step 5 — create article
  console.log(`[blog] Step 5/5 — publishing article`);
  const article = await createArticle(config, {
    blogId: config.shopify.blogId,
    title: topic.title,
    body: html,
    summary: topic.metaDescription,
    handle: topic.handle,
    imageUrl,
    imageAlt: topic.title,
    tags: [topic.category, "auto-generated"].filter(Boolean),
    isPublished: true,
  });

  console.log(`\n[blog] ✓ published: ${article.handle}`);
  fs.writeFileSync(
    path.join(dir, "result.json"),
    JSON.stringify({ topic, article, imageUrl, imagePrompt: imgPrompt }, null, 2),
    "utf8"
  );
}

function slugify(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

main().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
