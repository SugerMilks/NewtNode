export const myNewtIntelligenceLevels = Object.freeze([
  { value: "low", label: "Low", maxOutputTokens: 4000 },
  { value: "medium", label: "Medium", maxOutputTokens: 6000 },
  { value: "high", label: "High", maxOutputTokens: 8000 },
  { value: "xhigh", label: "Extra high", maxOutputTokens: 12000 },
  { value: "max", label: "Maximum", maxOutputTokens: 16000 }
]);

export function myNewtIntelligence(value) {
  return myNewtIntelligenceLevels.find((level) => level.value === value) || myNewtIntelligenceLevels[2];
}

export const myNewtReasoningModes = Object.freeze([
  { value: "auto", label: "Auto" }, { value: "economy", label: "Economy" }, { value: "best", label: "Best" }
]);

// Standard API rates per million tokens, verified 2026-09-04.
// https://developers.openai.com/api/docs/pricing
export const myNewtModelRates = Object.freeze({
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, writes: 0.25, output: 1.2 },
  "gpt-5.6-terra": { input: 2, cached: 0.2, writes: 2.5, output: 12 },
  "gpt-5.6-sol": { input: 4, cached: 0.4, writes: 5, output: 20 },
  "gpt-6-astra": { input: 10, cached: 1, writes: 12.5, output: 50 }
});

export function myNewtReasoningProfile(settings = {}, { brief = "", escalated = false } = {}) {
  const effort = myNewtIntelligence(settings.intelligence);
  const mode = myNewtReasoningModes.some((item) => item.value === settings.reasoningMode) ? settings.reasoningMode : "auto";
  const creative = /\b(director|storyboard|story|script|creative|cinematic|performance|continuity|analy[sz]e|logic|reason|important|critical|campaign|ideat|design|compose|composition|write|rewrite|revise|improve|concept)\w*/i.test(brief);
  const routine = /\b(connect|attach|rename|organize|arrange|move|set|change|switch|select|list|show|find|count|insert|preset)\b/i.test(brief);
  const economy = mode === "economy" || (mode === "auto" && !escalated && routine && !creative);
  return economy
    ? { model: "gpt-5.6-luna", effort: "medium", maxOutputTokens: 4000, reason: mode === "economy" ? "Economy selected" : "Routine project operation" }
    : { model: "gpt-6-astra", effort: effort.value, maxOutputTokens: effort.maxOutputTokens, reason: escalated ? "Creative reasoning required" : "Creative or complex task" };
}

export function myNewtTokenCost(model, usage, rates = myNewtModelRates) {
  const rate = rates[String(model || "").replace(/^openai\//, "")];
  if (!rate || !usage || !Number.isFinite(Number(usage.input_tokens ?? usage.prompt_tokens)) || !Number.isFinite(Number(usage.output_tokens ?? usage.completion_tokens))) return null;
  const input = Math.max(0, Number(usage.input_tokens ?? usage.prompt_tokens));
  const output = Math.max(0, Number(usage.output_tokens ?? usage.completion_tokens));
  const details = usage.input_tokens_details || usage.prompt_tokens_details || {};
  const cached = Math.min(input, Math.max(0, Number(details.cached_tokens) || 0));
  const writes = Math.min(input - cached, Math.max(0, Number(details.cache_write_tokens ?? usage.cache_write_tokens) || 0));
  return ((input - cached - writes) * rate.input + cached * rate.cached + writes * rate.writes + output * rate.output) / 1e6;
}

export function myNewtReasoningAllowance(profile, inputBytes, inspection = false, rates = myNewtModelRates) {
  const rate = rates[profile.model];
  if (!rate) return null;
  // Bytes conservatively bound text tokens. Media inspection has a separate allowance.
  return inputBytes * Math.max(rate.input, rate.writes) / 1e6 + profile.maxOutputTokens * rate.output / 1e6 + (inspection ? 0.5 : 0);
}
