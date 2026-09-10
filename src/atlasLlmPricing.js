import { pricingQuote } from "./pricingCatalog.js";

// Atlas standard token rates, including whole-request long context, verified 2026-09-10.
// https://api.atlascloud.ai/api/v1/pricing/models
export const atlasLlmRates = Object.freeze({
  "gpt-5.6-luna": { input: 0.2, cached: 0.02, writes: 0.25, output: 1.2, long: { input: 0.4, cached: 0.04, writes: 0.5, output: 1.8 } },
  "gpt-6-astra": { input: 10, cached: 1, writes: 12.5, output: 50, long: { input: 20, cached: 2, writes: 25, output: 75 } }
});

export function currentAtlasLlmRates() {
  return Object.fromEntries(Object.entries(atlasLlmRates).map(([model, base]) => {
    const rate = { ...base };
    for (const context of ["short", "long"]) {
      const resolved = Object.fromEntries(["input", "cached", "writes", "output"].map(metric =>
        [metric, pricingQuote("atlas", `openai/${model}`, { context, metric })?.amountUsd]));
      if (Object.values(resolved).every(Number.isFinite)) {
        if (context === "short") Object.assign(rate, resolved);
        else rate.long = resolved;
      }
    }
    return [model, rate];
  }));
}
