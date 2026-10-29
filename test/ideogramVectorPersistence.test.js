import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { appendResultItems, normalizedResultItems } from "../src/mediaResults.js";
import { recordedCostAmount } from "../src/pricingCatalog.js";
import { buildProjectOutputItems } from "../src/projectOutputs.js";

const item = {
  type: "image", url: "/outputs/vector-fixture/design.png", svgUrl: "/outputs/vector-fixture/design.svg",
  label: "Logo variant 1", model: "Ideogram Vector", seed: 24,
  cost: { amountUsd: 0.32, estimated: true, pricingSource: "https://fal.ai/models/ideogram/vector/text-to-vector" }
};

test("canonical result normalization and append preserve editable SVG and recorded metadata", () => {
  const restored = JSON.parse(JSON.stringify(normalizedResultItems([item], "", "image")));
  const appended = appendResultItems(restored, [{ ...item, url: "/outputs/vector-fixture/second.png", svgUrl: "/outputs/vector-fixture/second.svg" }], "image");
  assert.deepEqual(appended[0], item);
  assert.equal(appended[1].svgUrl, "/outputs/vector-fixture/second.svg");
  assert.equal(appended[0].cost.amountUsd, 0.32);
});

test("workflow packaging collects and rewrites both editable and raster vector assets", () => {
  const server = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const block = server.slice(server.indexOf("function collectWorkflowAssetUrls("), server.indexOf("function rewriteWorkflowPackageAssetReferences("));
  const { collectWorkflowAssetUrls, rewriteWorkflowAssetUrls } = new Function("tryLocalPublicPath", `${block}; return { collectWorkflowAssetUrls, rewriteWorkflowAssetUrls };`)(value => value.startsWith("/outputs/") ? value : "");
  const graph = { nodes: [{ id: "vector", type: "vector", data: { resultUrl: item.url, resultItems: [item] } }] };
  assert.deepEqual(new Set(collectWorkflowAssetUrls(graph)), new Set([item.url, item.svgUrl]));
  const assets = new Map([[item.url, "/workflow-assets/test/outputs/design.png"], [item.svgUrl, "/workflow-assets/test/outputs/design.svg"]]);
  const rewritten = rewriteWorkflowAssetUrls(graph, assets);
  assert.equal(rewritten.nodes[0].data.resultUrl, assets.get(item.url));
  assert.equal(rewritten.nodes[0].data.resultItems[0].svgUrl, assets.get(item.svgUrl));
  assert.equal(graph.nodes[0].data.resultItems[0].svgUrl, item.svgUrl);
});

test("output rail remains one raster-compatible image per vector variant", () => {
  const outputs = buildProjectOutputItems({ nodes: [{ id: "vector", type: "vector", data: { resultItems: [item] } }], getNodeResultMediaType: () => "image" });
  assert.equal(outputs.length, 1);
  assert.equal(outputs[0].url, item.url);
  assert.equal(outputs[0].mimeType, "image/png");
});

test("Stats records vector charges under the right model and never substitutes today's tariff", () => {
  const source = readFileSync(new URL("../src/StatsDashboard.jsx", import.meta.url), "utf8");
  const { buildUsageStats } = new Function("recordedCostAmount", `${source.slice(source.indexOf("function buildUsageStats("))}; return { buildUsageStats };`)(recordedCostAmount);
  const base = { mediaType: "image", modelName: "Ideogram Vector", createdAt: new Date().toISOString(), project: { id: "vector-test", name: "Vector QA" } };
  const stats = buildUsageStats([{ ...base, id: "priced", cost: { amountUsd: 0.1234, estimated: true } }, { ...base, id: "unpriced", cost: { amountUsd: null } }]);
  assert.equal(stats.totalCost, 0.1234);
  assert.equal(stats.imageCount, 2);
  assert.equal(stats.unpricedCount, 1);
  assert.equal(stats.models[0].name, "Ideogram Vector");
});
