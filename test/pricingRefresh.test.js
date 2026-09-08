import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import express from "express";
import { PricingRefresh, latestPricingSlot, nextPricingSlot } from "../server/pricing-refresh.js";
import { registerPricingRoutes } from "../server/routes/pricing.js";
import { parseKreaPricing, parseFalPricing, parseOpenAiPricing, validatePricingEntry, googlePricingTables, falPricingEndpoints } from "../server/pricing-sources.js";
import { setPricingCatalog, pricingQuote, getPricingCatalog, currentOpenAiRates, recordedCostAmount } from "../src/pricingCatalog.js";
import { estimateImageRunCost, estimateVideoRunCost } from "../src/generationPricing.js";
import { myNewtModelRates, myNewtTokenCost, myNewtReasoningAllowance } from "../src/myNewt/intelligence.js";
import { myNewtVoiceCost } from "../src/myNewt/voiceConfig.js";

const kreaPath = "/generate/video/bytedance/seedance-2-5";
const points = (amount = 1) => [{ amount, dimensions: { resolution: "720p", hasVideoReference: false, duration: 5 } }];
const entry = (amount = 1) => ({ currency: "USD", unit: "request", source: "https://api.krea.ai/openapi.json", points: points(amount) });
function krea(amount = 1) { return { openapi: "3.1.0", paths: { [kreaPath]: { post: { "x-krea-pricing": { type: "fixed", currency: "USD", unit: "request", price_points: points(amount) } } } } }; }
const headers = ["Model", ...["Short", "Long"].flatMap((context) => ["input", "cached input", "cache writes", "output"].map((metric) => `${context} context ${metric}`))];
const openai = `# Pricing\n\nPrices per 1M tokens.\n\n### Standard pricing data\n\n| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n`
  + Object.entries(myNewtModelRates).map(([model, rate]) => `| ${model} | $${rate.input} | $${rate.cached} | $${rate.writes} | $${rate.output} | $${rate.input * 2} | $${rate.cached * 2} | $${rate.writes * 2} | $${rate.output * 1.5} |`).join("\n")
  + "\n\n### Audio\n\n| Model | Type | Rate |\n| --- | --- | --- |\n| gpt-transcribe | Transcription | $0.0045 / minute |\n";

async function fixture(t, options = {}) {
  const directory = await mkdtemp(path.join(os.tmpdir(), "newt-pricing-"));
  const calls = [];
  let now = Date.parse("2026-09-07T08:00:00Z"), amount = 1, fail = false, key = "test-account-key";
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), method: init.method || "GET" });
    assert.equal(init.redirect, "error");
    if (fail) return new Response("<!doctype html>bad gateway", { status: 524 });
    if (String(url).includes("api.krea.ai")) return Response.json(krea(amount));
    if (String(url).includes("api.fal.ai")) return Response.json({ prices: [
      { endpoint_id: "reve/2.1/text-to-image", unit: "image", unit_price: 0.3, currency: "USD" },
      { endpoint_id: "bytedance/seedance-2.5/reference-to-video", unit: "second", unit_price: 0.5, currency: "USD" }
    ], has_more: false });
    if (String(url).includes("openai.com")) return new Response(openai);
    return new Response("<table><tr><th>Paid Tier</th></tr><tr><td>$2</td></tr></table>");
  };
  const service = new PricingRefresh({ filePath: path.join(directory, "prices.json"), fetchImpl, now: () => now, getFalKey: () => key, ...options });
  t.after(async () => { service.stop(); setPricingCatalog({ version: 1, revision: `reset-${Date.now()}`, entries: {} }); await rm(directory, { recursive: true, force: true }); });
  await service.ready;
  return { service, calls, advance: (ms) => now += ms, amount: (value) => amount = value, fail: (value) => fail = value, key: (value) => key = value };
}

test("weekly schedule follows Eastern daylight saving and exact Monday boundary", () => {
  for (const [before, expected] of [
    ["2026-03-08T08:00:00Z", "2026-03-09T08:00:00Z"],
    ["2026-11-01T08:00:00Z", "2026-11-02T09:00:00Z"],
    ["2026-09-07T07:59:59Z", "2026-09-07T08:00:00Z"]
  ]) assert.equal(new Date(nextPricingSlot(Date.parse(before))).toISOString(), new Date(expected).toISOString());
  assert.equal(new Date(latestPricingSlot(Date.parse("2026-09-07T08:00:00Z"))).toISOString(), "2026-09-07T08:00:00.000Z");
  assert.equal(new Date(nextPricingSlot(Date.parse("2026-09-07T08:00:00Z"))).toISOString(), "2026-09-14T08:00:00.000Z");
});

test("Krea parser preserves exact dimensions and rejects new billing meanings", () => {
  const parsed = parseKreaPricing(krea()).find((item) => item.id === `krea:${kreaPath}`);
  assert.deepEqual(parsed.entry.points, points());
  for (const change of [
    (p) => p.currency = "EUR", (p) => p.price_points[0].amount = "1.0",
    (p) => p.price_points[0].dimensions.duration = "5", (p) => p.price_points[0].dimensions.newSurcharge = true,
    (p) => p.type = "token", (p) => p.price_points = []
  ]) {
    const schema = krea(); change(schema.paths[kreaPath].post["x-krea-pricing"]);
    assert.ok(parseKreaPricing(schema).find((item) => item.id === `krea:${kreaPath}`).issue);
  }
});

test("price validation rejects NaN, negatives, zero, huge swings, duplicate and removed settings", () => {
  for (const value of [null, NaN, Infinity, -1, 0, 1000, "1"]) assert.throws(() => validatePricingEntry(entry(value)));
  assert.throws(() => validatePricingEntry(entry(3), entry(1)), /2x/);
  assert.throws(() => validatePricingEntry(entry(0.1), entry(1)), /2x/);
  assert.throws(() => validatePricingEntry({ ...entry(), points: [...points(), ...points()] }), /Duplicate/);
  const changed = entry(); changed.points[0].dimensions.duration = 6;
  assert.throws(() => validatePricingEntry(changed, entry()), /settings/);
});

test("OpenAI parser uses Standard only, never Batch/Flex or malformed columns", () => {
  const parsed = parseOpenAiPricing(openai + "\n\n### Batch pricing data\n\n" + openai.slice(openai.indexOf("| Model")));
  const astra = parsed.find((item) => item.id === "openai:gpt-6-astra");
  assert.equal(astra.entry.points.find((point) => point.dimensions.context === "short" && point.dimensions.metric === "input").amount, 10);
  assert.throws(() => parseOpenAiPricing(openai.replace("Standard pricing data", "Flex pricing data")));
  assert.throws(() => parseOpenAiPricing(openai.replace("Short context input", "Price")));
  assert.throws(() => parseOpenAiPricing("<html>Cloudflare error</html>"));
});

test("Fal never flattens a variable video price into a fixed price", () => {
  const results = parseFalPricing({ prices: [
    { endpoint_id: "reve/2.1/edit", unit_price: 0.3, currency: "USD", unit: "image" },
    { endpoint_id: "bytedance/seedance-2.5/reference-to-video", unit_price: 0.5, currency: "USD", unit: "second" }
  ] });
  assert.ok(results.find((item) => item.id === "fal:reve/2.1/edit").entry);
  assert.ok(results.find((item) => item.id.endsWith("seedance-2.5/reference-to-video")).issue);
  assert.ok(falPricingEndpoints.length <= 50);
  assert.equal(new Set(falPricingEndpoints).size, falPricingEndpoints.length);
});

test("Google monitor extracts tables without executing page scripts or interpreting HTML as prices", () => {
  assert.deepEqual(googlePricingTables("<script>throw new Error()</script><table><tr><th>Paid Tier</th><td>$2</td></tr></table>"), ["Paid Tier $2"]);
  assert.throws(() => googlePricingTables("<html>timeout</html>"));
});

test("refresh persists verified data, keeps secrets out of status, and updates exact batch estimates", async (t) => {
  const { service, calls } = await fixture(t);
  await service.refresh();
  const status = service.status();
  assert.equal(status.running, false);
  assert.equal(status.sources.openai.applied, 5);
  assert.equal(status.sources.krea.status, "partial");
  assert.ok(!JSON.stringify(status).includes("test-account-key"));
  assert.ok(!JSON.stringify(status).includes("falAccount"));
  assert.ok(calls.every((call) => call.method === "GET"));
  assert.ok(calls.every((call) => !call.url.includes("/generate/")));
  setPricingCatalog(status.catalog);
  assert.equal(estimateVideoRunCost({ model: "Seedance 2.5", duration: "5 seconds", resolution: "720p", provider: "krea", batchCount: 2 }), 2);
  assert.notEqual(estimateVideoRunCost({ model: "Seedance 2.5", duration: "6 seconds", resolution: "720p", provider: "krea" }), 1);
  assert.equal(estimateImageRunCost({ model: "REVE 2.1", batchCount: 4 }), 1.2);
  assert.equal((await stat(service.filePath)).mode & 0o777, 0o600);
  const restored = new PricingRefresh({ filePath: service.filePath, getFalKey: () => "test-account-key" });
  await restored.ready;
  assert.deepEqual(restored.catalog().entries, status.catalog.entries);
});

test("partial failures and suspicious changes preserve last-known-good prices", async (t) => {
  const f = await fixture(t); await f.service.refresh();
  const first = f.service.catalog().entries[`krea:${kreaPath}`];
  f.advance(1000); f.amount(4); await f.service.refresh();
  assert.deepEqual(f.service.catalog().entries[`krea:${kreaPath}`], first);
  assert.ok(f.service.status().sources.krea.reviews.some((review) => /2x/.test(review.message)));
  f.advance(1000); f.fail(true); await f.service.refresh();
  assert.deepEqual(f.service.catalog().entries[`krea:${kreaPath}`], first);
  assert.equal(f.service.status().sources.krea.status, "error");
});

test("Fal key switches invalidate account-specific quotes immediately", async (t) => {
  const f = await fixture(t); await f.service.refresh();
  assert.ok(f.service.catalog().entries["fal:reve/2.1/text-to-image"]);
  f.key("replacement-key");
  assert.ok(!f.service.catalog().entries["fal:reve/2.1/text-to-image"]);
  assert.equal(f.service.status().sources.fal.status, "unavailable");
  f.key(""); await f.service.refresh();
  assert.equal(f.calls.filter((call) => call.url.includes("api.fal.ai")).length, 1);
});

test("manual and scheduled checks coalesce; missed weeks catch up once; disable persists", async (t) => {
  const f = await fixture(t);
  const one = f.service.refresh(), two = f.service.refresh(); assert.equal(one, two); await one;
  assert.equal(f.calls.length, 4);
  await f.service.tick(); assert.equal(f.calls.length, 4);
  f.advance(3 * 7 * 86400000); await f.service.tick(); assert.equal(f.calls.length, 8);
  await f.service.setEnabled(false); f.advance(7 * 86400000); await f.service.tick(); assert.equal(f.calls.length, 8);
  assert.equal(JSON.parse(await readFile(f.service.filePath, "utf8")).enabled, false);
  await f.service.refresh(); assert.equal(f.calls.length, 12);
});

test("write failure cannot publish an unpersisted price change", async (t) => {
  const f = await fixture(t); await f.service.refresh();
  const before = f.service.catalog(); f.amount(1.5); f.advance(1000);
  f.service.write = async () => { throw new Error("disk full"); };
  await assert.rejects(f.service.refresh(), /disk full/);
  assert.deepEqual(f.service.catalog(), before);
  assert.match(f.service.status().error, /retained/);
});

test("offline checks retry hourly three times, then wait for the next weekly slot", async (t) => {
  const f = await fixture(t); f.fail(true);
  await f.service.tick(); assert.equal(f.calls.length, 4);
  f.advance(3599999); await f.service.tick(); assert.equal(f.calls.length, 4);
  f.advance(1); await f.service.tick(); assert.equal(f.calls.length, 8);
  f.advance(3600000); await f.service.tick(); assert.equal(f.calls.length, 12);
  f.advance(3600000); await f.service.tick(); assert.equal(f.calls.length, 16);
  f.advance(3600000); await f.service.tick(); assert.equal(f.calls.length, 16);
  assert.equal(f.service.state.retryAt, null);
  f.advance(7 * 86400000); f.fail(false); await f.service.tick();
  assert.equal(f.calls.length, 20); assert.equal(f.service.state.retryCount, 0);
  assert.equal(f.service.status().sources.openai.status, "current");
});

test("disabling during a refresh remains disabled after both writes complete", async (t) => {
  const f = await fixture(t);
  const refresh = f.service.refresh();
  const disable = f.service.setEnabled(false);
  await refresh; await disable;
  assert.equal(f.service.status().enabled, false);
  assert.equal(JSON.parse(await readFile(f.service.filePath, "utf8")).enabled, false);
  f.advance(7 * 86400000); await f.service.tick(); assert.equal(f.calls.length, 4);
});

test("a Fal credential replaced during a refresh cannot publish the old account quotes", async (t) => {
  const f = await fixture(t);
  const fetchImpl = f.service.fetchImpl;
  f.service.fetchImpl = async (...args) => {
    const result = await fetchImpl(...args);
    if (String(args[0]).includes("api.fal.ai")) f.key("replacement-key");
    return result;
  };
  await f.service.refresh();
  assert.ok(!f.service.catalog().entries["fal:reve/2.1/text-to-image"]);
  assert.equal(f.service.status().sources.fal.status, "unavailable");
});

test("malformed persisted metadata falls back to bundled prices without breaking Settings", async (t) => {
  const f = await fixture(t); await f.service.refresh();
  for (const damage of [{ changes: null }, { sources: [] }, { lastScheduledSlot: "not a date" }, { sources: { krea: null } }]) {
    await f.service.write(f.service.filePath, { ...f.service.state, ...damage }, { mode: 0o600 });
    const restored = new PricingRefresh({ filePath: f.service.filePath });
    await restored.ready;
    assert.deepEqual(restored.catalog().entries, {});
    assert.match(restored.status().error, /Bundled estimates/);
  }
});

test("recorded costs, including legacy and zero-cost runs, never change with new rates", async (t) => {
  const f = await fixture(t); await f.service.refresh();
  const legacy = { amountUsd: "0.75" }, verified = { amountUsd: 2, pricingVersion: "old" };
  setPricingCatalog(f.service.catalog());
  assert.equal(recordedCostAmount(legacy), 0.75);
  f.amount(1.5); f.advance(1000); await f.service.refresh(); setPricingCatalog(f.service.catalog());
  assert.equal(recordedCostAmount(legacy), 0.75);
  assert.equal(recordedCostAmount(verified), 2);
  assert.equal(recordedCostAmount({ amountUsd: 0 }), 0);
  for (const cost of [null, {}, { amountUsd: null }, { amountUsd: "" }, { amountUsd: -1 }, { amountUsd: NaN }]) assert.equal(recordedCostAmount(cost), null);
});

test("captured request prices remain stable while future requests use new prices", async (t) => {
  const f = await fixture(t); await f.service.refresh();
  setPricingCatalog(f.service.catalog()); const captured = getPricingCatalog();
  f.amount(1.5); f.advance(1000); await f.service.refresh(); setPricingCatalog(f.service.catalog());
  const dimensions = { resolution: "720p", hasVideoReference: false, duration: 5 };
  assert.equal(pricingQuote("krea", kreaPath, dimensions, 1, captured).amountUsd, 1);
  assert.equal(pricingQuote("krea", kreaPath, dimensions).amountUsd, 1.5);
});

test("OpenAI estimates use verified short/long rates and preserve explicit test/custom rates", async (t) => {
  const f = await fixture(t); await f.service.refresh(); setPricingCatalog(f.service.catalog());
  assert.equal(myNewtTokenCost("gpt-6-astra", { input_tokens: 300000, output_tokens: 1000 }), 6.075);
  assert.equal(myNewtTokenCost("gpt-6-astra", { input_tokens: 1000, output_tokens: 1000 }), 0.06);
  assert.equal(myNewtVoiceCost(60), 0.0045);
  const captured = currentOpenAiRates(myNewtModelRates);
  assert.equal(myNewtReasoningAllowance({ model: "gpt-6-astra", maxOutputTokens: 1000 }, 1000, false, captured), 0.0625);
});

test("local pricing routes reject foreign origins and require explicit local writes", async (t) => {
  const { service } = await fixture(t);
  const app = express(); app.use(express.json()); registerPricingRoutes(app, service);
  const server = await new Promise((resolve) => { const running = app.listen(0, "127.0.0.1", () => resolve(running)); });
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const root = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${root}/api/pricing/refresh`, { method: "POST" })).status, 403);
  assert.equal((await fetch(`${root}/api/pricing/refresh`, { method: "POST", headers: { "X-Newt-Local": "1", Origin: "https://evil.example" } })).status, 403);
  const response = await fetch(`${root}/api/pricing/settings`, { method: "POST", headers: { "X-Newt-Local": "1", "Content-Type": "application/json" }, body: JSON.stringify({ enabled: false }) });
  assert.equal(response.status, 200); assert.equal((await response.json()).enabled, false);
  assert.equal((await fetch(`${root}/api/pricing`)).headers.get("cache-control"), "no-store");
});
