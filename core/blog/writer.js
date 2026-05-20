// Rédaction de l'article complet à partir du topic + outline.
// Output : HTML prêt pour Shopify articleCreate.

import { claudeText } from "../claude/client.js";
import fs from "node:fs";

export async function writeArticle(config, { topic, brandCharter }) {
  const target = config.blog?.wordsTarget || 1200;
  const min = config.blog?.wordsMin || 800;
  const max = config.blog?.wordsMax || 1500;

  const system = `You are a senior French content writer for the pet brand Poils Précieux. You write SEO-optimized blog articles in flawless French.

BRAND CHARTER:
${brandCharter.slice(0, 3000)}

WRITING RULES:
- French native, factuel + bienveillant
- Phrases courtes (10-18 mots moyennes)
- Aucun "✨", aucune urgence factice
- Adresse : "votre chien" / "votre chat" (jamais "compagnon à 4 pattes")
- Toujours finir par une utilité concrète, pas un CTA d'achat agressif
- Title 50-70 chars, meta 140-160 chars
- Structure : chapô 2-3 phrases + 3-5 sections H2 + bloc "À retenir" final
- Tableau markdown ou liste à puces toutes les 300-400 mots
- 2-3 produits Poils Précieux mentionnés naturellement (par leur mascotName + bénéfice), pas catalogue forcé
- Word target: ${target} (min ${min}, max ${max})

OUTPUT: HTML directly publishable. Use these tags only:
<h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <blockquote>, <a>.
NO inline styles. NO classes. NO scripts.
Tables format like:
<table><thead><tr><th>Col1</th><th>Col2</th></tr></thead><tbody><tr><td>...</td><td>...</td></tr></tbody></table>`;

  const user = `Write the full article HTML for this topic.

TITLE: ${topic.title}
META DESC: ${topic.metaDescription}
PRIMARY KEYWORD: ${topic.primaryKeyword}
SECONDARY KEYWORDS: ${(topic.secondaryKeywords || []).join(", ")}
AUDIENCE: ${topic.audience}
UNIQUE ANGLE: ${topic.uniqueAngle}

OUTLINE:
${topic.outline.map((s, i) => `${i + 1}. ${s.h2} — ${s.summary}`).join("\n")}

PRODUCT MENTIONS TO WEAVE NATURALLY (optional, only if relevant):
${(topic.productAnchorIdeas || []).join(", ")}

Output the COMPLETE article HTML (no <html>/<body> wrapper, no <h1>—title is shown elsewhere). Start with the chapô paragraph.`;

  const { text, usage } = await claudeText(config, {
    system,
    user,
    maxTokens: 6000,
    temperature: 0.6,
  });

  return { html: text.trim(), usage };
}
