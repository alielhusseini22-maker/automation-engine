// Client Anthropic Claude — utilisé pour sourcing research, blog drafting, caption writing.
// Modèle paramétrable par projet via config.anthropic.model.

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
 * Texte simple. Pour génération de blog, sourcing research, caption.
 */
export async function claudeText(config, { system, user, maxTokens = 4096, temperature }) {
  const c = client(config);
  const payload = {
    model: config.anthropic.model || "claude-opus-4-7",
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  };
  // Some recent models deprecate `temperature`. Only include if explicitly passed AND model accepts it.
  // Safer default: omit unless user passed a value.
  if (temperature != null && !String(payload.model).startsWith("claude-opus-4-7")) {
    payload.temperature = temperature;
  }
  const msg = await c.messages.create(payload);
  const text = msg.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return { text, usage: msg.usage };
}

/**
 * JSON structuré. On demande à Claude de répondre en JSON valide.
 * Utile pour: liste de candidats produits, plan d'article, idées caption.
 */
export async function claudeJSON(config, { system, user, maxTokens = 4096 }) {
  const sys = `${system}\n\nIMPORTANT: Your entire response must be a single valid JSON object/array. No prose before or after. No markdown code fences.`;
  const { text, usage } = await claudeText(config, { system: sys, user, maxTokens, temperature: 0.3 });
  try {
    // Strip potential markdown fences if model ignored instruction
    const cleaned = text
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    return { data: JSON.parse(cleaned), usage };
  } catch (err) {
    throw new Error(`Claude returned invalid JSON. First 300 chars:\n${text.slice(0, 300)}\n\nError: ${err.message}`);
  }
}
