import { ATLAS_PRICING_URL, atlasPricingEndpoints, atlasPricingSpecs, atlasPriceRows, atlasPricingEntry } from "../src/atlasPricing.js";
import { validatePricingEntry } from "./pricing-sources.js";
import { atlasLlmRates } from "../src/atlasLlmPricing.js";

export { ATLAS_PRICING_URL };
const sorted = (values) => JSON.stringify([...values].sort());
const equalRecord = (a, b) => a && b && sorted(Object.keys(a)) === sorted(Object.keys(b))
  && Object.entries(a).every(([key, value]) => b[key] === value);

function expectedRules(spec) {
  if (spec.kind === "image") return [
    `Resolution base prices per image: ${Object.entries(spec.resolutions).map(([resolution, price]) => `${resolution.toUpperCase()} $${price}`).join(", ")}.`,
    "Web Search adds $0.014 when enabled.", ...(spec.imageSearch ? ["Image Search adds $0.014 when enabled."] : []),
    "Total price = selected resolution price \u00d7 output image count + optional formula add-ons."
  ];
  return spec.reference ? [
    "Output duration and reference-video duration use the rate for the selected resolution.",
    "The first five reference images are included; each additional reference image is charged separately.",
    "Prompt expansion adds a fixed per-request charge when enabled.", "Use View to calculate the combined total for a request."
  ] : ["Output duration uses the rate for the selected resolution.", "Prompt expansion adds a fixed per-request charge when enabled."];
}

// Compare rule language independently of prices; never evaluate provider formulas or page scripts.
const ruleText = (lines) => JSON.stringify(lines.map((line) => line.replace(/\$\d+(?:\.\d+)?/g, "$PRICE")));

export function parseAtlasPricing(data) {
  if (data?.code !== 200 || !Array.isArray(data.data) || data.data.length > 2000) throw new Error("Atlas did not return its public pricing catalog.");
  const media = atlasPricingEndpoints.map((endpoint) => {
    const result = { id: `atlas:${endpoint}`, label: endpoint, source: ATLAS_PRICING_URL };
    const matches = data.data.filter((model) => model.id === endpoint);
    if (matches.length !== 1) return { ...result, issue: "Atlas standard route is missing or ambiguous; existing estimate retained." };
    const model = matches[0], spec = atlasPricingSpecs[endpoint];
    const observed = { priceVersion: model.price_version, billingCategory: model.billing_category };
    if (!spec) return { ...result, observed, issue: "Atlas published runtime/token pricing requires review; no fixed estimate applied." };
    try {
      const parameters = spec.kind === "image" ? ["resolution", "num_images", "enable_web_search", ...(spec.imageSearch ? ["enable_image_search"] : [])]
        : ["duration", "resolution", "prompt_expansion", ...(spec.reference ? ['refers.#(type=="video")#.url', 'refers.#(type=="image")#.url'] : [])];
      if (model.display !== true || model.billing_category !== "composite" || model.type !== spec.kind
        || model.requires_runtime_quote !== true || (model.currency != null && model.currency !== "USD")
        || model.billing_mode != null || model.pricing_mode !== (spec.kind === "image" ? "default_estimate" : "per_second")
        || !/^sha256:[a-f0-9]{64}$/.test(model.price_version) || !Array.isArray(model.pricing_params)
        || sorted(model.pricing_params) !== sorted(parameters) || !Array.isArray(model.billing_explanation?.lines)
        || ruleText(model.billing_explanation.lines) !== ruleText(expectedRules(spec))) throw new Error("Atlas billing rules changed; review required.");
      const expected = atlasPriceRows(endpoint), rows = model.price_rows;
      if (!Array.isArray(rows) || rows.length !== expected.length || model.price_count !== rows.length) throw new Error("Atlas price tiers changed; review required.");
      for (const target of expected) {
        const candidates = rows.filter((row) => row.row_id === target.row_id);
        const row = candidates[0];
        if (candidates.length !== 1 || row.billing_unit !== target.billing_unit || row.price_role !== target.price_role
          || row.estimated !== false || row.requires_quote !== true || !equalRecord(row.quote_defaults, target.quote_defaults)
          || typeof row.official_price !== "string" || !/^\d+(?:\.\d+)?$/.test(row.official_price)) throw new Error("Atlas row settings or standard prices changed; review required.");
      }
      const rawEntry = (values) => ({ currency: "USD", unit: "request", points: values.map((row) => ({
        amount: Number(row.official_price), dimensions: { row: row.row_id }
      })) });
      validatePricingEntry(rawEntry(rows), rawEntry(expected));
      // official_price is the published standard column. Ignore our_price/account_price/discount entirely.
      const entry = validatePricingEntry(atlasPricingEntry(endpoint, rows), atlasPricingEntry(endpoint));
      return { ...result, observed, entry: { ...entry, sourcePriceVersion: model.price_version } };
    } catch (error) { return { ...result, observed, issue: error.message }; }
  });
  return [...media, ...parseAtlasLlmPricing(data)];
}

export function parseAtlasLlmPricing(data) {
  const metrics = { input: "input", cached: "cache_read", writes: "cache_write", output: "output" };
  return Object.entries(atlasLlmRates).map(([id, baseline]) => {
    const modelId = `openai/${id}`;
    const result = { id: `atlas:${modelId}`, label: modelId, source: ATLAS_PRICING_URL };
    try {
      const matches = data.data?.filter(model => model.id === modelId) || [];
      const model = matches[0];
      if (matches.length !== 1 || !model.display || model.billing_category !== "llm_token" || model.type !== "chat"
        || (model.currency != null && model.currency !== "USD") || model.price_rows?.length !== 8
        || model.requires_runtime_quote !== false) throw new Error("Atlas LLM billing contract unavailable or changed; existing rates retained.");
      const points = [], basePoints = [];
      for (const context of ["short", "long"]) for (const [metric, name] of Object.entries(metrics)) {
        const rowId = context === "short" ? name : `${name.replaceAll("_", "-")}-threshold-272000`;
        const rows = model.price_rows.filter(row => row.row_id === rowId);
        const row = rows[0];
        if (rows.length !== 1 || row.billing_unit !== "/1M tokens" || row.estimated !== false || row.requires_quote !== false
          || typeof row.official_price !== "string" || !/^\d+(?:\.\d+)?$/.test(row.official_price)
          || (context === "long" && !equalRecord(row.quote_defaults, { application: "whole_request", metric: "billable_input_tokens", operator: "gte", threshold: 272000 }))
          || (context === "short" && row.quote_defaults != null)) throw new Error("Atlas LLM token tiers changed; review required.");
        points.push({ amount: Number(row.official_price), dimensions: { context, metric } });
        basePoints.push({ amount: (context === "short" ? baseline : baseline.long)[metric], dimensions: { context, metric } });
      }
      const entry = validatePricingEntry({ currency: "USD", unit: "million tokens", source: ATLAS_PRICING_URL, points },
        { currency: "USD", unit: "million tokens", points: basePoints });
      return { ...result, entry };
    } catch (error) { return { ...result, issue: error.message }; }
  });
}
