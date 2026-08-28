export const llmProviderIds = Object.freeze(["fal", "openai"]);

export function normalizeLlmProvider(value = "") {
  const normalized = String(value || "").trim().toLowerCase().replace(/[^a-z]/g, "");
  if (normalized === "openai") return "openai";
  if (normalized === "fal" || normalized === "falai") return "fal";
  return "";
}

export function resolveLlmProvider({ preferredProvider = "", falKey = "", openAiKey = "" } = {}) {
  const configured = {
    fal: Boolean(String(falKey || "").trim()),
    openai: Boolean(String(openAiKey || "").trim())
  };
  const preferred = normalizeLlmProvider(preferredProvider);
  const order = [preferred, "fal", "openai"].filter((provider, index, providers) => (
    provider && providers.indexOf(provider) === index
  ));
  return order.find((provider) => configured[provider]) || "";
}

export function llmProviderUnavailableMessage({ kreaKey = "" } = {}) {
  const kreaContext = String(kreaKey || "").trim()
    ? " Krea can remain enabled for image and video generation, but its public API does not provide a general text or vision LLM endpoint."
    : "";
  return `Enable a Fal or OpenAI API key in Settings for LLM features.${kreaContext}`;
}
