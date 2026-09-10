import { myNewtTokenCost } from "../src/myNewt/intelligence.js";
import { currentAtlasLlmRates } from "../src/atlasLlmPricing.js";
export { atlasLlmRates } from "../src/atlasLlmPricing.js";

export const llmResponseEndpoints = Object.freeze({
  openai: "https://api.openai.com/v1/responses",
  atlas: "https://api.atlascloud.ai/v1/responses",
  fal: "https://fal.run/openrouter/router/openai/v1/responses"
});

export function llmResponseModel(provider, model) {
  const id = String(model || "").trim().replace(/^openai\//, "");
  if (!id || id.includes("/")) throw new Error("This LLM route requires an OpenAI model; the configured model was not changed.");
  return provider === "openai" ? id : `openai/${id}`;
}

export function llmResponseBody(provider, body) {
  const result = { ...body, model: llmResponseModel(provider, body.model), stream: false };
  if (provider !== "openai") {
    // Provider-owned response IDs/encrypted reasoning cannot cross gateways.
    for (const key of ["include", "previous_response_id", "conversation", "background"]) delete result[key];
    if (Array.isArray(body.input)) result.input = body.input.filter((item) => item.type !== "reasoning").map((item) => {
      const { id, ...portable } = item;
      return portable;
    });
  }
  return result;
}

export function llmUsageCost(provider, model, usage, rates) {
  if (!usage) return null;
  for (const key of ["cost", "total_cost", "amount_usd", "amountUsd"]) {
    if (["number", "string"].includes(typeof usage[key]) && String(usage[key]).trim()
      && Number.isFinite(Number(usage[key])) && Number(usage[key]) >= 0) return Number(usage[key]);
  }
  const tokens = [usage.input_tokens ?? usage.prompt_tokens, usage.output_tokens ?? usage.completion_tokens];
  if (!tokens.every(value => ["number", "string"].includes(typeof value) && String(value).trim() && Number.isFinite(Number(value)) && Number(value) >= 0)) return null;
  if (provider === "atlas") {
    // Atlas's published threshold is inclusive, unlike the direct OpenAI tier.
    const id = String(model).replace(/^openai\//, "");
    const rate = (rates || currentAtlasLlmRates())[id];
    const input = Number(usage.input_tokens ?? usage.prompt_tokens);
    return myNewtTokenCost(id, usage, rate ? { [id]: input >= 272000 ? rate.long : rate } : {});
  }
  return provider === "openai" ? myNewtTokenCost(model, usage) : null;
}

export async function requestLlmResponse(body, { provider, key }, { request = fetch, falRequest, timeoutMs = 300000 } = {}) {
  const endpoint = llmResponseEndpoints[provider];
  if (!endpoint || !String(key || "").trim()) throw new Error("An enabled compatible LLM API key is required.");
  const label = provider === "atlas" ? "Atlas Cloud" : provider === "fal" ? "Fal" : "OpenAI";
  const input = llmResponseBody(provider, body);
  if (provider === "fal" && falRequest) {
    const result = await falRequest(input, key);
    return result?.data || result;
  }
  // Exactly one POST. A timeout or gateway error does not prove the request was unbilled.
  const response = await request(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `${provider === "fal" ? "Key" : "Bearer"} ${key}` },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(timeoutMs)
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data || typeof data !== "object" || Array.isArray(data)) {
    const rawDetail = typeof data?.error?.message === "string" ? data.error.message : typeof data?.error === "string" ? data.error : "";
    const detail = /<!doctype|<html/i.test(rawDetail) ? "" : rawDetail.replaceAll(key, "[redacted]").slice(0, 600);
    const error = new Error(`${label} LLM request failed (HTTP ${response.status}). ${detail || "The provider did not return a valid response."} No automatic retry was submitted.`);
    error.status = response.ok ? 502 : response.status;
    throw error;
  }
  return data;
}
