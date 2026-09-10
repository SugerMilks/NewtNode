import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { estimateAtlasImageCost, estimateAtlasVideoCost, ATLAS_PRICING_URL, atlasPricingSpecs, atlasPriceRows, atlasPricingEntry } from "../src/atlasPricing.js";
import { parseAtlasPricing } from "../server/atlas-pricing.js";
import { PricingRefresh } from "../server/pricing-refresh.js";
import { setPricingCatalog, getPricingCatalog, recordedCostAmount } from "../src/pricingCatalog.js";

const banana = "google/nano-banana-2/text-to-image";
const h3 = "minimax/h3/reference-to-video";
const version = `sha256:${"a".repeat(64)}`;

// Public catalog field shapes and billing explanations observed on 2026-09-10.
function modelFixture(endpoint = banana) {
  const spec = atlasPricingSpecs[endpoint];
  const params = spec.kind === "image" ? ["resolution", "num_images", "enable_web_search", ...(spec.imageSearch ? ["enable_image_search"] : [])]
    : ["duration", "resolution", "prompt_expansion", ...(spec.reference ? ['refers.#(type=="video")#.url', 'refers.#(type=="image")#.url'] : [])];
  const lines = spec.kind === "image" ? [
    spec.imageSearch ? "Resolution base prices per image: 1K $0.08, 2K $0.12, 4K $0.16." : "Resolution base prices per image: 1K $0.14, 4K $0.24.",
    "Web Search adds $0.014 when enabled.", ...(spec.imageSearch ? ["Image Search adds $0.014 when enabled."] : []),
    "Total price = selected resolution price \u00d7 output image count + optional formula add-ons."
  ] : spec.reference ? [
    "Output duration and reference-video duration use the rate for the selected resolution.",
    "The first five reference images are included; each additional reference image is charged separately.",
    "Prompt expansion adds a fixed per-request charge when enabled.", "Use View to calculate the combined total for a request."
  ] : ["Output duration uses the rate for the selected resolution.", "Prompt expansion adds a fixed per-request charge when enabled."];
  const rows = atlasPriceRows(endpoint).map((row) => ({ ...row, our_price: "0.001", account_price: "0.0001" }));
  return { id: endpoint, display: true, type: spec.kind, price_version: version, price_count: rows.length,
    billing_category: "composite", pricing_mode: spec.kind === "image" ? "default_estimate" : "per_second",
    requires_runtime_quote: true, pricing_params: params, billing_explanation: { lines }, price_rows: rows, discount: "0.01" };
}
const catalogFixture = () => ({ code: 200, data: Object.keys(atlasPricingSpecs).map(modelFixture) });
const parsed = (model) => parseAtlasPricing({ code: 200, data: [model] }).find((row) => row.id === `atlas:${model.id}`);

test("Nano Banana standard image tiers and request add-ons are exact on text and edit routes", () => {
  for (const [resolution, price] of [["1K", 0.08], ["2K", 0.12], ["4K", 0.16]]) for (const referenceCount of [0, 1, 14]) {
    const options = { modelName: "Nano Banana 2", resolution, referenceCount, aspectRatio: "16:9" };
    assert.equal(estimateAtlasImageCost(options).amountUsd, price);
    assert.equal(estimateAtlasImageCost({ ...options, enableWebSearch: true, enableImageSearch: true }).amountUsd, Math.round((price + 0.028) * 1e6) / 1e6);
    assert.equal(estimateAtlasImageCost(options).endpoint, `google/nano-banana-2/${referenceCount ? "edit" : "text-to-image"}`);
  }
  for (const referenceCount of [0, 10]) {
    assert.equal(estimateAtlasImageCost({ model: "Nano Banana Pro", resolution: "1K", referenceCount }).amountUsd, 0.14);
    assert.equal(estimateAtlasImageCost({ model: "Nano Banana Pro", resolution: "4K", referenceCount, enable_web_search: true }).amountUsd, 0.254);
    assert.equal(estimateAtlasImageCost({ model: "Nano Banana Pro", resolution: "2K", referenceCount }).amountUsd, null);
  }
});

test("unsupported, ambiguous, promotional and token-billed image requests stay unknown", () => {
  const base = { model: "Nano Banana 2", resolution: "1K" };
  for (const change of [{ resolution: "8K" }, { resolution: undefined }, { referenceCount: -1 }, { referenceCount: 15 },
    { referenceCount: "1" }, { aspectRatio: "auto" }, { size: "2048x1024" }, { n: 2 }, { n: 2, numImages: 1 },
    { videoClipCount: 1 }, { hasVideoReference: true }, { enableWebSearch: "false" }, { enableWebSearch: false, enable_web_search: true },
    { images: ["reference"], referenceCount: 0 }, { modelName: "Nano Banana Pro" }, { routeKind: "reference-to-image" },
    { model: "google/nano-banana-2/text-to-image-developer" }, { model: "google/nano-banana-pro/edit-ultra" },
    { model: "REVE 2.1" }, { model: "OpenAI Image 2" }, { model: "OpenAI Image 2.5 Sunburst" }, { model: "OpenAI Image 2.5 Flare" }]) {
    const cost = estimateAtlasImageCost({ ...base, ...change });
    assert.equal(cost.amountUsd, null, JSON.stringify(change));
    assert.equal(cost.pricingSource, ATLAS_PRICING_URL);
    assert.ok(cost.pricingBasis);
  }
  assert.equal(estimateAtlasImageCost({ model: banana, resolution: "1k", routeKind: "edit" }).amountUsd, null);
  assert.equal(estimateAtlasImageCost({ model: "Nano Banana Pro", resolution: "1K", enableImageSearch: true }).amountUsd, null);
});

test("MiniMax H3 uses duration plus one prompt surcharge and images beyond five", () => {
  const base = { model: "MiniMax H3", resolution: "768P", duration: "5 seconds" };
  assert.equal(estimateAtlasVideoCost(base).amountUsd, 0.4);
  assert.equal(estimateAtlasVideoCost({ ...base, resolution: "2K", duration: 4 }).amountUsd, 0.52);
  assert.equal(estimateAtlasVideoCost({ ...base, prompt_expansion: true }).amountUsd, 0.517);
  assert.equal(estimateAtlasVideoCost({ ...base, routeKind: "image-to-video", referenceImageCount: 0 }).amountUsd, 0.4);
  const startFrameCost = estimateAtlasVideoCost({ ...base, startFrameCount: 1, referenceImageCount: 0 });
  assert.equal(startFrameCost.amountUsd, 0.4);
  assert.equal(startFrameCost.endpoint, "minimax/h3/image-to-video");
  assert.equal(estimateAtlasVideoCost({ ...base, routeKind: "i2v", referenceImageCount: 2 }).amountUsd, 0.4);
  for (const [referenceImageCount, expected] of [[1, 0.4], [5, 0.4], [6, 0.44], [16, 0.84]]) {
    assert.equal(estimateAtlasVideoCost({ ...base, routeKind: "r2v", referenceImageCount }).amountUsd, expected);
  }
  assert.equal(estimateAtlasVideoCost({ ...base, routeKind: "r2v", referenceImageCount: 6, promptExpansion: true }).amountUsd, 0.557);
});

test("video price summaries, token estimates and missing reference durations never become fixed prices", () => {
  const base = { modelName: "MiniMax H3", resolution: "768P", duration: 5 };
  for (const change of [{ resolution: "480P" }, { resolution: "1080p" }, { resolution: "4k" }, { duration: "auto" },
    { duration: 3 }, { duration: 16 }, { duration: "5garbage" }, { duration: 5.5 }, { duration: null },
    { hasVideoReference: true }, { hasVideoReference: "false" }, { referenceVideoDuration: 2 }, { refers: [] },
    { startFrameCount: 2 }, { startFrameCount: -1 }, { startFrameCount: 1, routeKind: "t2v" },
    { promptExpansion: "true" }, { promptExpansion: false, prompt_expansion: true }, { referenceImageCount: -1 },
    { routeKind: "t2v", referenceImageCount: 1 }, { referenceImageCount: 17 },
    { modelName: "Seedance 2.0" }, { modelName: "Seedance 2.5" }, { modelName: "minimax/h3-developer/text-to-video" }]) {
    assert.equal(estimateAtlasVideoCost({ ...base, ...change }).amountUsd, null, JSON.stringify(change));
  }
});

test("public adapter applies standard rows only, ignoring discounts, account quotes and generic summaries", () => {
  const results = parseAtlasPricing(catalogFixture());
  assert.equal(results.filter((row) => row.entry).length, 7);
  for (const row of results.filter((row) => row.entry)) {
    assert.deepEqual(row.entry.points, atlasPricingEntry(row.id.slice(6)).points);
    assert.equal(row.entry.priceKind, "standard");
  }
  const model = modelFixture(h3);
  model.pricing = { resolutions: [{ resolution: "480p", video: "0.038" }, { resolution: "4k", video: "0.08" }] };
  assert.ok(parsed(model).entry);
  assert.ok(!parsed(model).entry.points.some((point) => point.dimensions.resolution === "480p"));
  assert.equal(results.find((row) => row.id === "atlas:reve-ai/reve-2.1/edit").entry, undefined);
});

test("adapter rejects changed rules, units, dimensions, missing tiers and unusual raw prices", () => {
  for (const mutate of [
    (m) => m.billing_category = "image_token", (m) => m.billing_mode = "image_token",
    (m) => m.currency = "EUR", (m) => m.display = false, (m) => m.price_version = "missing",
    (m) => m.pricing_params.push("new_surcharge"), (m) => m.billing_explanation.lines.push("New fee"),
    (m) => m.price_rows.pop(), (m) => m.price_rows[1] = m.price_rows[0],
    (m) => m.price_rows[0].billing_unit = "/token", (m) => m.price_rows[0].estimated = true,
    (m) => m.price_rows[0].price_role = "addon", (m) => m.price_rows[0].quote_defaults.n = 2,
    (m) => m.price_rows[0].official_price = "0", (m) => m.price_rows[0].official_price = "0.001",
    (m) => m.price_rows[0].official_price = "10", (m) => m.price_rows[0].official_price = "NaN",
    (m) => m.price_rows[0].official_price = 0.08, (m) => delete m.price_rows[0].official_price
  ]) {
    const model = modelFixture(); mutate(model);
    assert.ok(parsed(model).issue);
    assert.equal(parsed(model).entry, undefined);
  }
  const model = modelFixture(h3);
  model.price_rows.find((row) => row.row_id === "768p-reference-video").official_price = "1000";
  assert.ok(parsed(model).issue);
  assert.throws(() => parseAtlasPricing({ code: 200, data: {} }));
  assert.ok(parseAtlasPricing({ code: 200, data: [modelFixture(), modelFixture()] })[0].issue);
});

test("shared catalog overrides bundled rates without revaluing recorded costs or accepting account data", (t) => {
  const previous = getPricingCatalog(); t.after(() => setPricingCatalog(previous));
  const model = modelFixture();
  model.price_rows.forEach((row) => row.official_price = String(Number(row.official_price) * 1.1));
  const entry = parsed(model).entry;
  assert.ok(entry);
  const snapshot = { version: 1, revision: "atlas-test-refresh", entries: { [`atlas:${banana}`]: { ...entry, checkedAt: "2026-09-14" } } };
  const costBefore = estimateAtlasImageCost({ model: "Nano Banana 2", resolution: "1K" });
  setPricingCatalog(snapshot);
  const cost = estimateAtlasImageCost({ model: "Nano Banana 2", resolution: "1K" });
  assert.equal(cost.amountUsd, 0.088);
  assert.equal(cost.pricingVersion, "atlas-test-refresh");
  assert.equal(cost.pricingCheckedAt, "2026-09-14");
  assert.equal(recordedCostAmount(costBefore), 0.08);
  for (const change of [{ priceKind: "account" }, { rulesVersion: 2 }, { source: "https://other.example" }, { unit: "second" }, { points: [] }]) {
    assert.equal(estimateAtlasImageCost({ model: banana, resolution: "1K", snapshot: { ...snapshot,
      entries: { [`atlas:${banana}`]: { ...entry, ...change } } } }).amountUsd, null);
  }
});

test("weekly adapter uses existing persistence, no auth or paid requests, and survives errors/reload", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "newt-atlas-pricing-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, "pricing.json");
  const calls = []; let fail = false, changed = false;
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url) !== ATLAS_PRICING_URL || fail) return new Response("offline", { status: 503 });
    const data = catalogFixture();
    if (changed) data.data[0].price_rows[0].official_price = "12";
    return Response.json(data);
  };
  const service = new PricingRefresh({ filePath, enableAtlasPricing: true, fetchImpl, now: () => Date.parse("2026-09-14T08:00:00Z") });
  await service.ready; await service.refresh();
  assert.equal(service.status().sources.atlas.applied, 7);
  assert.equal(service.catalog().entries[`atlas:${banana}`].priceKind, "standard");
  assert.equal(calls.filter((call) => call.url === ATLAS_PRICING_URL).length, 1);
  assert.ok(calls.every(({ init }) => (init.method || "GET") === "GET" && !init.headers.Authorization));
  const retained = service.catalog().entries[`atlas:${banana}`];
  changed = true; await service.refresh();
  assert.deepEqual(service.catalog().entries[`atlas:${banana}`], retained);
  assert.ok(service.status().sources.atlas.reviews.some((row) => /2x/.test(row.message)));
  fail = true; await service.refresh();
  assert.equal(service.status().sources.atlas.status, "error");
  assert.deepEqual(service.catalog().entries[`atlas:${banana}`], retained);
  const restored = new PricingRefresh({ filePath, enableAtlasPricing: true, fetchImpl });
  await restored.ready;
  assert.deepEqual(restored.catalog().entries, service.catalog().entries);
  assert.equal(restored.error, "");
});
