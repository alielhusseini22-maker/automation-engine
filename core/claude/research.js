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
  // Strip any markdown fences if present, then find the first JSON token
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  // Find first { or [ to start parsing
  const firstBrace = Math.min(
    ...["[", "{"].map((c) => {
      const i = cleaned.indexOf(c);
      return i === -1 ? Infinity : i;
    })
  );
  if (firstBrace === Infinity) {
    throw new Error(`Claude research output has no JSON. First 400 chars:\n${cleaned.slice(0, 400)}`);
  }
  const jsonText = cleaned.slice(firstBrace);
  try {
    return { data: JSON.parse(jsonText), citations, usage };
  } catch (err) {
    throw new Error(`Invalid JSON from research:\n${jsonText.slice(0, 400)}\n\n${err.message}`);
  }
}
