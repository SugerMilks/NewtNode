import test from "node:test";
import assert from "node:assert/strict";
import { seedream55ModelName as model, seedream55Ratios, seedream55Size, buildSeedream55FalInput, seedream55Cost, migrateSeedreamModel, migrateSeedreamSettings, migrateSeedreamPreferences } from "../src/seedream55.js";
import { imageModelOptions, coverageModelOptions, storyboardImageModelOptions, normalizeModelPreferences } from "../src/modelOptions.js";
import { characterSheetModelOptions, characterSheetGenerationSettings } from "../src/characterSheetModels.js";
import { storyboardImageSettings, storyboardCharacterImageSettings } from "../src/storyboardImageModels.js";
import { exploreModels, exploreDefaults, normalizeExploreData } from "../src/explore.js";
import { normalizeMyNewtFavoriteModels } from "../src/myNewt/favoriteModels.js";
import { buildKreaImageInput, kreaEndpointForModel, estimateKreaImageCost } from "../src/kreaApi.js";
import { buildAtlasImageRequest } from "../src/atlasImages.js";
import { atlasPricingEndpoints } from "../src/atlasPricing.js";
import { estimateImageRunCost } from "../src/generationPricing.js";
import { createSeedream55Generator } from "../server/seedream5-5.js";
import { createAtlasMedia } from "../server/atlas-media.js";
import { parseKreaPricing } from "../server/pricing-sources.js";
import { nodeApi } from "../src/api/newtApi.js";

const prompt = "A cinematic location with the referenced character.";
const refs = Array.from({ length: 10 }, (_, i) => `https://example.com/ref-${i}.png`);

test("Seedream is selectable throughout the image tools and favorites without replacing defaults", () => {
  for (const options of [imageModelOptions, coverageModelOptions, storyboardImageModelOptions, characterSheetModelOptions, exploreModels]) assert.ok(options.includes(model));
  assert.equal(normalizeModelPreferences().image[model], true);
  assert.equal(normalizeModelPreferences({ image: { [model]: false } }).image[model], false);
  assert.equal(normalizeMyNewtFavoriteModels({ favoriteImageModel: model }).favoriteImageModel, model);
  assert.equal(characterSheetGenerationSettings().model, "Nano Banana Pro");
  assert.equal(storyboardImageSettings().model, "OpenAI Image 2.6 Flare");
  assert.equal(exploreDefaults().model, "OpenAI Image 2.6 Flare");
  assert.throws(() => characterSheetGenerationSettings(model, "krea"), /requires Fal or Atlas/);
  for (const provider of ["fal", "atlas"]) {
    assert.deepEqual(characterSheetGenerationSettings(model, provider), { model, resolution: "2K" });
    assert.equal(storyboardImageSettings({ model, resolution: "4K" }, provider).resolution, "2K");
    assert.equal(storyboardCharacterImageSettings({ model }, provider).resolution, "2K");
  }
});

test("all offered sizes meet the provider pixel limits and preserve the aspect ratio", () => {
  for (const provider of ["fal", "atlas"]) for (const resolution of ["1K", "2K"]) for (const aspectRatio of seedream55Ratios(provider)) {
    const size = seedream55Size({ resolution, aspectRatio, provider });
    const [w, h] = aspectRatio.split(":").map(Number);
    assert.ok(size.width * size.height >= 921600);
    assert.ok(size.width * size.height <= 4624220);
    assert.ok(Math.abs(size.width / size.height - w / h) < 0.003);
    assert.ok(size.width <= 4096 && size.height <= 4096);
  }
});

test("supported providers receive exact 5.5 endpoints, sizing and ordered references", () => {
  for (const images of [[], refs]) {
    const size = seedream55Size({ aspectRatio: "21:9" });
    const fal = buildSeedream55FalInput({ prompt, images, aspectRatio: "21:9" });
    assert.deepEqual(fal.image_size, size);
    assert.equal(fal.enable_safety_checker, true);
    assert.equal(fal.num_images, 1);
    assert.deepEqual(fal.image_urls || [], images);
    assert.throws(() => buildKreaImageInput({ modelName: model, prompt, referenceUrls: images }), /Unsupported Krea/);
    assert.ok(!kreaEndpointForModel("image", model));
    const atlas = buildAtlasImageRequest({ model, prompt, images, aspectRatio: "21:9" });
    assert.equal(atlas.model, `bytedance/seedream-v5.5/${images.length ? "edit" : "text-to-image"}`);
    assert.ok(atlasPricingEndpoints.includes(atlas.model));
    assert.equal(atlas.size, `${size.width}*${size.height}`);
    assert.equal(atlas.thinking, undefined);
    assert.equal(atlas.prompt_optimization_mode, undefined);
    assert.equal(atlas.images, undefined);
    assert.deepEqual(atlas.reference_images || [], images);
    assert.equal(atlas.aspect_ratio, undefined);
    assert.equal(atlas.quality, undefined);
  }
});

test("unsupported sizes, masks and too many references are rejected, never truncated", () => {
  for (const patch of [{ resolution: "4K" }, { aspectRatio: "4:1" }, { images: [...refs, refs[0]] }, { maskUrl: "mask.png" }, { background: "invalid" }, { prompt: "" }]) {
    assert.throws(() => buildSeedream55FalInput({ prompt, ...patch }), { status: 400 });
    assert.throws(() => buildAtlasImageRequest({ model, prompt, ...patch }), { status: 400 });
  }
  assert.throws(() => buildAtlasImageRequest({ model, prompt, aspectRatio: "4:5" }), /Atlas Cloud aspect ratio/);
  assert.throws(() => seedream55Size({ provider: "krea" }), /requires Fal or Atlas/);
  for (const input of [buildSeedream55FalInput({ prompt, background: "transparent" }), buildAtlasImageRequest({ model, prompt, background: "transparent" })]) {
    assert.equal(input.background, "transparent");
    assert.equal(input.output_format, "png");
  }
});

test("Fal generator validates before uploads, preserves labels and submits just once", async () => {
  const uploads = [], submissions = [];
  const client = {};
  const generate = createSeedream55Generator({
    createClient: options => { assert.equal(options.credentials, "captured-key"); return client; },
    readLocalAsset: async url => ({ mimeType: "image/png", buffer: url }),
    uploadImageInputToFal: async (asset, index, passedClient) => { assert.equal(passedClient, client); uploads.push(asset); return `https://example.com${asset.buffer}`; },
    promptWithReferenceLabels: (text, inputs) => `${text}\n${inputs.map(item => item.label).join(",")}`,
    subscribeFal: async (endpoint, request, context, passedClient, key) => { assert.equal(passedClient, client); assert.equal(key, "captured-key"); submissions.push({ endpoint, ...request }); return { requestId: "mock-job", data: { images: [{ url: "https://example.com/out.png" }] } }; },
    firstFalImageResult: data => data.images[0]
  });
  await assert.rejects(generate({ prompt, resolution: "4K", imagePromptUrls: ["/portrait.png"] }), /4K/);
  await assert.rejects(generate({ prompt, imagePromptUrls: [...refs, refs[0]] }, "captured-key"), /10 reference/);
  assert.equal(uploads.length, 0);
  assert.equal(submissions.length, 0);
  for (const imagePromptUrls of [[], ["/portrait.png", "/wardrobe.png"]]) {
    const result = await generate({ prompt, imagePromptUrls, imagePromptLabels: ["Identity", "Outfit"], resolution: "2K", aspectRatio: "16:9", background: "transparent" }, "captured-key");
    assert.equal(result.endpoint, `bytedance/seedream/v5.5/${imagePromptUrls.length ? "edit" : "text-to-image"}`);
    assert.equal(result.requestId, "mock-job");
    assert.equal(result.remoteImage.url, "https://example.com/out.png");
  }
  assert.equal(submissions.length, 2);
  assert.equal(submissions[1].input.background, "transparent");
  assert.match(submissions[1].input.prompt, /Identity,Outfit/);
  assert.deepEqual(submissions[1].input.image_urls, ["https://example.com/portrait.png", "https://example.com/wardrobe.png"]);
});

test("Atlas adapter uses runtime price quotes and does not convert Seedream into OpenAI sizing", async () => {
  const uploads = [], runs = [];
  const adapter = createAtlasMedia({ client: {
    upload: async asset => { uploads.push(asset); return refs[uploads.length - 1]; },
    generate: async request => { runs.push(request); return { url: "https://example.com/result.png", requestId: "mock" }; }
  }, imageSize: () => assert.fail("Seedream must not use OpenAI sizing"), labelPrompt: text => text,
  quoteInput: async () => ({ amountUsd: 0.123, estimated: true }) });
  await assert.rejects(adapter.image({ model, prompt, resolution: "4K", imageInputs: [{}] }, "mock"), /4K/);
  assert.equal(uploads.length, 0);
  const result = await adapter.image({ model, prompt, imageInputs: [{}], aspectRatio: "16:9", background: "transparent" }, "mock");
  assert.equal(result.cost.amountUsd, 0.123);
  assert.equal(result.size, runs[0].input.size);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].input.model, "bytedance/seedream-v5.5/edit");
  assert.equal(runs[0].input.background, "transparent");
  assert.deepEqual(runs[0].input.reference_images, [refs[0]]);
});

test("unverified prices stay unknown, never reusing 5.0 rates or zero placeholders", () => {
  for (const provider of ["fal", "krea", "atlas"]) for (const resolution of ["1K", "2K"]) {
    assert.equal(seedream55Cost({ provider, resolution }).amountUsd, null);
    assert.equal(estimateImageRunCost({ model, provider, resolution, referenceCount: 3, batchCount: 2 }), null);
  }
  assert.equal(estimateKreaImageCost({ modelName: model, referenceCount: 10 }).amountUsd, null);
  assert.equal(estimateImageRunCost({ model, provider: "atlas" }), null);
  const endpoint = "/generate/image/bytedance/seedream-5-pro";
  const rows = parseKreaPricing({ openapi: "3.1.0", paths: { [endpoint]: { post: { "x-krea-pricing": {
    type: "fixed", unit: "request", currency: "USD", price_points: [{ amount: 0.09, dimensions: { resolutionTier: "2k", referenceImageCount: 0 } }]
  } } } } });
  assert.equal(rows.find(row => row.id === `krea:${endpoint}`), undefined);
});

test("saved selections and disabled preferences migrate without touching generated media", () => {
  const old = "Seedream 5.0 Pro";
  const resultItems = [{ model: old, url: "/outputs/saved.png" }], job = { model: old };
  const original = { model: old, characterSheetModel: old, autoAspectModel: old, frameItImageModel: old, favoriteImageModel: old, resultItems, job };
  const migrated = migrateSeedreamSettings(original);
  for (const key of ["model", "characterSheetModel", "autoAspectModel", "frameItImageModel", "favoriteImageModel"]) assert.equal(migrated[key], model);
  assert.equal(original.model, old);
  assert.equal(migrated.resultItems, resultItems);
  assert.equal(migrated.job, job);
  assert.equal(migrateSeedreamModel("Nano Banana Pro"), "Nano Banana Pro");
  assert.deepEqual(migrateSeedreamPreferences({ [old]: false }), { [model]: false });
  assert.deepEqual(migrateSeedreamPreferences({ [model]: true, [old]: false }), { [model]: true });
  assert.equal(normalizeModelPreferences({ image: { [old]: false } }).image[model], false);
  assert.equal(normalizeExploreData({ model: old }).model, model);
  assert.equal(normalizeMyNewtFavoriteModels({ favoriteImageModel: old }).favoriteImageModel, model);
  assert.equal(characterSheetGenerationSettings(old).model, model);
  assert.equal(storyboardImageSettings({ model: old }).model, model);
});

test("old backends cannot receive a 5.5 request or its migrated 5.0 alias", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async url => { calls.push(url); return Response.json({ routes: {} }); });
  for (const name of [model, "Seedream 5.0 Pro"]) await assert.rejects(nodeApi.generateImage({ model: name, prompt }), /Restart NewtNode/);
  assert.equal(calls.length, 2);
  assert.ok(calls.every(url => url.endsWith("/api/health")));
});
