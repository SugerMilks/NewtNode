import assert from "node:assert/strict";
import test from "node:test";
import { ProviderPricing, parseAtlasQuote, parseFalBilling, ATLAS_CALCULATE_URL } from "../server/provider-pricing.js";
import { generationQuoteKey, PRICE_EXPIRY_MS, PRICE_REFRESH_MS, priceState } from "../src/pricingTrust.js";
import { setPricingCatalog, setGenerationQuote, getGenerationQuote, pricingQuote, recordedCostAmount } from "../src/pricingCatalog.js";
import { estimateImageRunCost, estimateVideoRunCost } from "../src/generationPricing.js";
import { pricingApi } from "../src/api/newtApi.js";
import { refreshGenerationEstimate } from "../src/api/pricingEstimate.js";

function fixture(t) {
  const calls = []; let account = "account-1", revision = 1, enabled = true, now = Date.now(), fail = false;
  const pricing = { accounts: () => account, ensureFresh: async () => {}, getEnabledProviders: () => ({ atlas: enabled, fal: enabled, krea: enabled }),
    catalog: () => ({ revision, entries: {} }) };
  const service = new ProviderPricing({ pricing, getKey: () => "test-secret", now: () => now, fetchImpl: async (url, init) => {
    calls.push({ url: String(url), init });
    if (fail) throw new Error("offline");
    if (String(url) === ATLAS_CALCULATE_URL) return Response.json({ code: 200, data: { price: "0.11", currency: "USD", estimated: true } });
    return Response.json({ has_more: false, billing_events: [{ request_id: "request-1", endpoint_id: "endpoint-1", cost_total: 0.19 }] });
  } });
  t.after(() => setPricingCatalog({ version: 1, revision: `reset-${Math.random()}`, entries: {} }));
  return { service, calls, account: () => account = "account-2", revise: () => revision++, disable: () => enabled = false, advance: ms => now += ms, fail: () => fail = true };
}

test("Atlas account estimates scale batches, cache, coalesce and expire without generating or uploading", async t => {
  const f = fixture(t), options = { provider: "atlas", model: "Nano Banana Pro", resolution: "1K", batchCount: 4 };
  const one = f.service.quote(options), two = f.service.quote(options);
  assert.equal(one, two);
  const quote = await one;
  assert.equal(quote.amountUsd, 0.44); assert.equal(quote.estimated, true);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url, ATLAS_CALCULATE_URL);
  assert.equal(JSON.parse(f.calls[0].init.body).model, "google/nano-banana-pro/text-to-image");
  assert.ok(!JSON.stringify(quote).includes("test-secret"));
  await f.service.quote(options); assert.equal(f.calls.length, 1);
  f.advance(5 * 60000 + 1); await f.service.quote(options); assert.equal(f.calls.length, 2);
  f.account(); await f.service.quote(options); assert.equal(f.calls.length, 3);
  f.disable(); f.account(); f.advance(5 * 60000 + 1);
  assert.equal((await f.service.quote(options)).amountUsd, null); assert.equal(f.calls.length, 3);
});

test("display estimates never fabricate reference uploads or fixed token-image prices", async t => {
  const f = fixture(t);
  for (const options of [
    { kind: "image", model: "Nano Banana Pro", referenceCount: 1 },
    { kind: "image", model: "OpenAI Image 2.5 Flare" },
    { kind: "video", model: "Seedance 2.5", hasVideoReference: true },
    { kind: "video", model: "Seedance 2.5", startFrameCount: 1 },
    { kind: "video", model: "Seedance 2.5", audioReferenceCount: 1 },
    { kind: "video", model: "Seedance 2.5", duration: "Auto" }
  ]) await f.service.quote({ provider: "atlas", ...options });
  assert.equal(f.calls.length, 0);
});

test("catalog changes invalidate cached quotes before their TTL", async t => {
  const f = fixture(t), options = { provider: "atlas", model: "Nano Banana Pro" };
  await f.service.quote(options); assert.equal(f.calls.length, 1);
  f.revise(); await f.service.quote(options); assert.equal(f.calls.length, 2);
});

test("Fal display estimates use supported local pricing without unverified unit quotes", async t => {
  const f = fixture(t);
  const quote = await f.service.quote({ provider: "fal", model: "Nano Banana Pro", resolution: "2K", batchCount: 3 });
  assert.equal(quote.amountUsd, 0.45);
  await f.service.quote({ provider: "fal", kind: "video", model: "Seedance 2.5", duration: 8 });
  assert.equal(f.calls.length, 0);
});

test("quote failures fall back without canceling, replaying or changing providers", async t => {
  const f = fixture(t); f.fail();
  const quote = await f.service.quote({ provider: "atlas", model: "Nano Banana Pro", resolution: "1K" });
  assert.equal(quote.amountUsd, 0.14); assert.equal(quote.estimated, true);
  assert.equal(f.calls.length, 1);
  assert.equal(await f.service.atlasInput({ model: "google/nano-banana-pro/edit", images: ["https://example.com/image.png"] }, "key"), null);
});

test("Atlas payload quote preserves submitted references and token billing is still estimated", async t => {
  const f = fixture(t), input = { model: "openai/gpt-image-2.5-flare/edit", images: ["https://example.com/image.png"], prompt: "A change", quality: "high" };
  const quote = await f.service.atlasInput(input, "key");
  assert.deepEqual(JSON.parse(f.calls[0].init.body), input);
  assert.equal(quote.estimated, true);
  for (const price of [null, "", false, NaN, -1, "abc"]) assert.equal(parseAtlasQuote({ data: { price } }), null);
  assert.equal(parseAtlasQuote({ data: { price: 1, currency: "EUR" } }), null);
  assert.equal(parseAtlasQuote({ data: { price: 0 } }).amountUsd, 0);
});

test("actual Fal charges must match one exact request and endpoint; historical amounts stay unchanged", async t => {
  const f = fixture(t), cost = await f.service.falCharge("request-1", "endpoint-1", "key");
  assert.equal(cost.estimated, false); assert.equal(cost.amountUsd, 0.19);
  const event = { request_id: "a", endpoint_id: "b", cost_total: 0.2 };
  assert.equal(parseFalBilling({ billing_events: [event], has_more: true }, "a", "b"), null);
  assert.equal(parseFalBilling({ billing_events: [event, event] }, "a", "b"), null);
  assert.equal(parseFalBilling({ billing_events: [event] }, "wrong", "b"), null);
  assert.equal(parseFalBilling({ billing_events: [event] }, "a", "wrong"), null);
  assert.equal(recordedCostAmount({ amountUsd: 3, pricingCheckedAt: "2020-01-01" }), 3);
});

test("pricing trust expires old entries, rejects changed contracts, and locks request snapshots", () => {
  const now = Date.now(), entry = { checkedAt: new Date(now).toISOString(), currency: "USD", source: "test", points: [{ amount: 1, dimensions: {} }] };
  assert.equal(priceState(entry, now), "current");
  assert.equal(priceState(entry, now + PRICE_REFRESH_MS + 1), "stale");
  assert.equal(priceState(entry, now + PRICE_EXPIRY_MS + 1), "expired");
  const expired = { ...entry, checkedAt: new Date(now - PRICE_EXPIRY_MS - 1).toISOString() };
  const snapshot = { version: 1, policyVersion: 2, revision: "test", entries: { "fal:test": expired } };
  assert.equal(pricingQuote("fal", "test", {}, 1, snapshot), null);
  assert.equal(pricingQuote("fal", "test", {}, 1, { ...snapshot, capturedAt: expired.checkedAt }).amountUsd, 1);
  assert.equal(priceState({ ...entry, invalidatedAt: entry.checkedAt }), "unavailable");
});

test("display and agent estimators share quotes and discard them on account/catalog changes", t => {
  fixture(t);
  setPricingCatalog({ version: 1, revision: "a", accountRevision: "a", entries: {} });
  const options = { provider: "atlas", model: "Nano Banana Pro", resolution: "1K", batchCount: 4 };
  setGenerationQuote(options, { accountRevision: "a", checkedAt: new Date().toISOString(), amountUsd: 0.44 });
  assert.equal(estimateImageRunCost(options), 0.44);
  assert.notEqual(generationQuoteKey(options), generationQuoteKey({ ...options, batchCount: 2 }));
  setPricingCatalog({ version: 1, revision: "b", accountRevision: "b", entries: {} });
  assert.equal(getGenerationQuote(options), null);
  setGenerationQuote(options, { accountRevision: "a", checkedAt: new Date().toISOString(), amountUsd: 0.01 });
  assert.equal(getGenerationQuote(options), null);
  const video = { provider: "atlas", model: "Seedance 2.5", duration: "8 seconds", kind: "video" };
  setGenerationQuote(video, { accountRevision: "b", checkedAt: new Date().toISOString(), amountUsd: 2 });
  assert.equal(estimateVideoRunCost(video), 2);
  assert.notEqual(estimateVideoRunCost({ ...video, startFrameCount: 1 }), 2);
});

test("client quote requests exclude prompts and assets and reject a replaced account response", async t => {
  fixture(t);
  setPricingCatalog({ version: 1, revision: "client-quote", accountRevision: "client-account", entries: {} });
  const original = pricingApi.quote;
  t.after(() => { pricingApi.quote = original; });
  const options = { provider: "atlas", model: "Nano Banana Pro", resolution: "1K", prompt: "Private brief", references: [{ url: "/uploads/private.png" }] };
  pricingApi.quote = async settings => {
    assert.ok(!("prompt" in settings)); assert.ok(!("references" in settings));
    return { accountRevision: "replaced-account", checkedAt: new Date().toISOString(), amountUsd: 99 };
  };
  assert.equal((await refreshGenerationEstimate(options)).amountUsd, 0.14);
  assert.equal(getGenerationQuote(options), null);
});
