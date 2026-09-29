import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { imageModelNames, imageModelOptions, coverageModelOptions, normalizeModelPreferences } from "../src/modelOptions.js";
import { normalizeMyNewtFavoriteModels } from "../src/myNewt/favoriteModels.js";
import { kreaEndpoints } from "../src/kreaApi.js";
import { atlasImageModels } from "../src/atlasImages.js";
import { atlasPricingEndpoints } from "../src/atlasPricing.js";
import { kreaPricingModels } from "../server/pricing-sources.js";
import { estimateImageRunCost } from "../src/generationPricing.js";
import { PricingRefresh } from "../server/pricing-refresh.js";
import { isNanoBanana2Model } from "../src/nanoBanana2.js";
import { isSeedream5ProModel, seedream5ProModelName, seedream5ProFalEndpoint } from "../src/seedream5Pro.js";
import { isOpenAiImage25Model, openAiImage25Variant, openAiImage25Models } from "../src/openAiImage25.js";

const retired = ["Krea 2 Large", "REVE 2.1"];

test("retired choices are absent from catalogs, preferences, favorites and estimates", () => {
  for (const model of retired) {
    for (const options of [imageModelOptions, coverageModelOptions, atlasImageModels, Object.keys(kreaEndpoints.image)])
      assert.equal(options.includes(model), false);
    assert.equal(model in normalizeModelPreferences({ image: { [model]: true } }).image, false);
    assert.equal(normalizeMyNewtFavoriteModels({ favoriteImageModel: model }).favoriteImageModel, "");
    for (const provider of ["fal", "atlas", "krea"]) assert.equal(estimateImageRunCost({ model, provider }), null);
  }
  assert.doesNotMatch(JSON.stringify([atlasPricingEndpoints, kreaPricingModels]), /reve|krea[-/]2|krea-2/i);
});

test("backend rejects retired names and endpoints instead of silently generating another model", async () => {
  const source = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
  const start = source.indexOf("function resolveImageModel(");
  const end = source.indexOf("function resolveUtilityImageModel(", start);
  const deps = { isSeedream5ProModel, seedream5ProModelName, seedream5ProFalEndpoint, isNanoBanana2Model, isOpenAiImage25Model, openAiImage25Variant, openAiImage25Models,
    imageModelNames, falNanoBanana2TextEndpoint: "fal-ai/nano-banana-2", falNanoBananaProEndpoint: "fal-ai/nano-banana-pro",
    httpError: (status, message) => Object.assign(new Error(message), { status }) };
  const resolve = new Function(...Object.keys(deps), source.slice(start, end) + "\nreturn resolveImageModel;")(...Object.values(deps));
  for (const model of [...retired, "reve/2.1/edit", "reve-ai/reve-2.1/remix", "krea/v2/large/text-to-image", "unknown"]) {
    assert.throws(() => resolve(model), { status: 400 });
  }
  assert.equal(resolve("Nano Banana Pro").displayName, "Nano Banana Pro");
  assert.equal(resolve("OpenAI Image 2.5 Flare").displayName, "OpenAI Image 2.5 Flare");
});

test("retired cached prices and reviews are pruned without changing history records", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "newt-retired-models-"));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, "pricing.json");
  const initial = new PricingRefresh({ filePath });
  await initial.ready;
  const entry = { currency: "USD", unit: "request", points: [{ amount: 0.2, dimensions: {} }] };
  const removed = ["fal:reve/2.1/edit", "krea:/generate/image/krea/krea-2/large", "atlas:reve-ai/reve-2.1/edit"];
  const kept = "krea:/generate/image/google/nano-banana-pro";
  const history = [{ model: retired[0], amountUsd: 0.065 }];
  await initial.write(filePath, { ...initial.state, entries: Object.fromEntries([...removed, kept].map(id => [id, entry])),
    changes: history, sources: { krea: { reviews: [{ model: "krea/krea-2/large" }] }, fal: { reviews: [{ model: "reve/2.1/edit" }] },
      atlas: { reviews: [{ model: "reve-ai/reve-2.1/edit" }] } } });
  const restored = new PricingRefresh({ filePath });
  await restored.ready;
  for (const id of removed) assert.equal(restored.state.entries[id], undefined);
  assert.deepEqual(restored.state.entries[kept], entry);
  assert.deepEqual(restored.state.changes, history);
  assert.deepEqual(restored.state.sources.krea.reviews, []);
  assert.deepEqual(restored.state.sources.atlas.reviews, []);
  assert.equal(restored.state.sources.fal, undefined);
});
