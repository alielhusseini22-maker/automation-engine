// Claude avec web_search activé — pour la recherche temps réel (sourcing, trends).
// Tool serveur Anthropic (web_search_20250305) — Claude fait des recherches autonomes.

import Anthropic from "@anthropic-ai/sdk";

let _client = null;
function client(config) {
  if (_client) return _client;
  const apiKey = process.env[config.anthropic.envKey];
  if (!apiKey) throw new Error(`Missing ${config.anthropic.envKey}`);
  _client = new Anthropic({ apiKey });
  return _client;
}

/**
 * Lance une recherche web autonome par Claude. Idéal pour sourcing trending.
 * @returns {{ text: string, citations: Array, usage: object }}
 */
export async function researchWithWebSearch(config, { system, user, maxTokens = 8192, maxSearches = 5 }) {
  const c = client(config);
  const msg = await c.messages.create({
    model: config.anthropic.model || "claude-opus-4-7",
    max_tokens: maxTokens,
    system,
    tools: [{ type: "web_search_20250305", name: "web_search", max_uses: maxSearches }],
    messages: [{ role: "user", content: user }],
  });
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const citations = msg.content
    .filter((b) => b.type === "text" && b.citations)
    .flatMap((b) => b.citations || []);
  return { text, citations, usage: msg.usage };
}

/**
 * Variante "JSON-only output" — on impose à Claude de répondre en JSON valide après ses recherches.
 */
export async function researchJSON(config, { system, user, maxTokens = 8192, maxSearches = 5 }) {
  const sys = `${system}

After completing your research with web_search, your FINAL output must be a single valid JSON object/array. No prose before or after the JSON. No markdown fences. The JSON must come AFTER any tool use, as the final text in your response.`;
  const { text, citations, usage } = await researchWithWebSearch(config, {
    system: sys,
    user,
    maxTokens,
    maxSearches,
  });
  const data = extractJSON(text);
  if (data === undefined) {
    throw new Error(`Claude research output has no parseable JSON. Last 500 chars:\n${text.slice(-500)}`);
  }
  return { data, citations, usage };
}

/**
 * Extraction JSON robuste : Claude peut mêler du raisonnement et le JSON final.
 * Stratégie : 1) bloc ```json fencé, 2) sinon, scan de tous les blocs balancés [..]/{..}
 * et on retient le plus grand qui parse (= le vrai output final).
 */
export function extractJSON(text) {
  const candidates = [];

  // 1. Blocs fencés ```json ... ```
  const fenceRe = /```(?:json)?\s*([\s\S]*?)```/gi;
  let fm;
  while ((fm = fenceRe.exec(text)) !== null) candidates.push(fm[1].trim());

  // 2. Tous les blocs balancés [...] et {...} dans le texte brut
  for (const open of ["[", "{"]) {
    const close = open === "[" ? "]" : "}";
    let depth = 0;
    let start = -1;
    let inStr = false;
    let esc = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === "\\") esc = true;
        else if (ch === '"') inStr = false;
        continue;
      }
      if (ch === '"') { inStr = true; continue; }
      if (ch === open) { if (depth === 0) start = i; depth++; }
      else if (ch === close) {
        depth--;
        if (depth === 0 && start !== -1) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }

  // Parse tous les candidats, garde le plus "gros" (plus de contenu = output final)
  let best;
  let bestSize = -1;
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      const size = Array.isArray(parsed) ? parsed.length * 1000 + c.length : c.length;
      if (size > bestSize) { best = parsed; bestSize = size; }
    } catch { /* skip invalid */ }
  }
  return best;
}
