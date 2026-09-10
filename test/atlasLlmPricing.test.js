import test from "node:test";
import assert from "node:assert/strict";
import { parseAtlasPricing, parseAtlasLlmPricing } from "../server/atlas-pricing.js";
import { atlasLlmRates, currentAtlasLlmRates } from "../src/atlasLlmPricing.js";
import { configurePricingReader } from "../src/pricingCatalog.js";
import { llmUsageCost } from "../server/llm-responses.js";

function catalog() {
  const metricIds = { input: "input", cached: "cache_read", writes: "cache_write", output: "output" };
  return { code: 200, data: Object.entries(atlasLlmRates).map(([id, rates]) => ({
    id: `openai/${id}`, display: true, type: "chat", billing_category: "llm_token", requires_runtime_quote: false,
    price_rows: ["short", "long"].flatMap(context => Object.entries(metricIds).map(([metric, row]) => ({
      row_id: context === "short" ? row : `${row.replaceAll("_", "-")}-threshold-272000`,
      billing_unit: "/1M tokens", official_price: String((context === "short" ? rates : rates.long)[metric]),
      our_price: "0.001", estimated: false, requires_quote: false,
      ...(context === "long" ? { quote_defaults: { application: "whole_request", metric: "billable_input_tokens", operator: "gte", threshold: 272000 } } : {})
    })))
  })) };
}

test("weekly Atlas refresh includes both LLMs at standard rates, ignoring promotional prices", () => {
  const results = parseAtlasPricing(catalog()).filter(item => item.id === "atlas:openai/gpt-6-astra" || item.id === "atlas:openai/gpt-5.6-luna");
  assert.equal(results.length, 2);
  for (const result of results) {
    assert.equal(result.issue, undefined); assert.equal(result.entry.unit, "million tokens");
    assert.equal(result.entry.points.length, 8);
    assert.equal(result.entry.points[0].amount, atlasLlmRates[result.id.split("/")[1]].input);
  }
});

test("ambiguous, partial or changed Atlas billing contracts do not replace verified rates", () => {
  for (const mutate of [
    data => data.data.push(data.data[0]),
    data => data.data[0].price_rows.pop(),
    data => { data.data[0].price_rows[0].billing_unit = "request"; },
    data => { data.data[0].price_rows[4].quote_defaults.threshold = 128000; },
    data => { data.data[0].price_rows[4].quote_defaults.operator = "gt"; },
    data => { data.data[0].price_rows[0].official_price = "999"; },
    data => { data.data[0].requires_runtime_quote = true; }
  ]) {
    const data = catalog(); mutate(data);
    const first = parseAtlasLlmPricing(data)[0];
    assert.equal(first.entry, undefined); assert.ok(first.issue);
  }
});

test("Atlas LLM estimates use the existing live catalog and a captured rate snapshot", (t) => {
  const data = catalog();
  data.data[1].price_rows[0].official_price = "12";
  const entries = Object.fromEntries(parseAtlasLlmPricing(data).map(item => [item.id, item.entry]));
  configurePricingReader(() => ({ version: 1, entries, revision: "atlas-test" }));
  t.after(() => configurePricingReader(() => ({ version: 1, entries: {}, revision: "bundled" })));
  const captured = currentAtlasLlmRates();
  assert.equal(captured["gpt-6-astra"].input, 12);
  assert.equal(llmUsageCost("atlas", "gpt-6-astra", { input_tokens: 1000, output_tokens: 100 }, captured), 0.017);
  configurePricingReader(() => ({ version: 1, entries: {}, revision: "bundled" }));
  assert.equal(currentAtlasLlmRates()["gpt-6-astra"].input, 10);
  assert.equal(llmUsageCost("atlas", "gpt-6-astra", { input_tokens: 1000, output_tokens: 100 }, captured), 0.017);
});
