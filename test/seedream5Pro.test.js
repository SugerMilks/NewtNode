import test from "node:test";
import assert from "node:assert/strict";
import { seedream5ProModelName as model, seedream5ProAspectRatios, seedream5ProSize, buildSeedream5ProFalInput, seedream5ProCost } from "../src/seedream5Pro.js";
import { imageModelOptions, coverageModelOptions, storyboardImageModelOptions, normalizeModelPreferences } from "../src/modelOptions.js";
import { characterSheetModelOptions, characterSheetGenerationSettings } from "../src/characterSheetModels.js";
import { storyboardImageSettings, storyboardCharacterImageSettings } from "../src/storyboardImageModels.js";
import { exploreModels, exploreDefaults } from "../src/explore.js";
import { normalizeMyNewtFavoriteModels } from "../src/myNewt/favoriteModels.js";
import { buildKreaImageInput, kreaEndpointForModel, estimateKreaImageCost } from "../src/kreaApi.js";
import { buildAtlasImageRequest } from "../src/atlasImages.js";
import { atlasPricingEndpoints } from "../src/atlasPricing.js";
import { estimateImageRunCost } from "../src/generationPricing.js";
import { createSeedream5ProGenerator } from "../server/seedream5-pro.js";
import { createAtlasMedia } from "../server/atlas-media.js";
import { parseKreaPricing } from "../server/pricing-sources.js";

const prompt = "A cinematic location with the referenced character.";
const refs = Array.from({ length: 10 }, (_, i) => `https://example.com/ref-${i}.png`);

test("Seedream is selectable throughout the image tools and favorites without replacing defaults", () => {
  for (const options of [imageModelOptions, coverageModelOptions, storyboardImageModelOptions, characterSheetModelOptions, exploreModels]) assert.ok(options.includes(model));
  assert.equal(normalizeModelPreferences().image[model], true);
  assert.equal(normalizeModelPreferences({ image: { [model]: false } }).image[model], false);
  assert.equal(normalizeMyNewtFavoriteModels({ favoriteImageModel: model }).favoriteImageModel, model);
  assert.equal(characterSheetGenerationSettings().model, "Nano Banana Pro");
  assert.equal(storyboardImageSettings().model, "OpenAI Image 2.5 Flare");
  assert.equal(exploreDefaults().model, "OpenAI Image 2.5 Flare");
  for (const provider of ["fal", "krea", "atlas"]) {
    assert.deepEqual(characterSheetGenerationSettings(model, provider), { model, resolution: "2K" });
    assert.equal(storyboardImageSettings({ model, resolution: "4K" }, provider).resolution, "2K");
    assert.equal(storyboardCharacterImageSettings({ model }, provider).resolution, "2K");
  }
});

test("all offered sizes meet the provider pixel limits and preserve the aspect ratio", () => {
  for (const resolution of ["1K", "2K"]) for (const aspectRatio of seedream5ProAspectRatios) {
    const size = seedream5ProSize({ resolution, aspectRatio });
    const [w, h] = aspectRatio.split(":").map(Number);
    assert.ok(size.width * size.height >= 1024 ** 2);
    assert.ok(size.width * size.height <= 2048 ** 2);
    assert.ok(Math.abs(size.width / size.height - w / h) < 0.003);
    assert.ok(size.width <= 4096 && size.height <= 4096);
  }
});

test("each provider receives its exact Pro endpoint, sizing and ordered reference format", () => {
  for (const images of [[], refs]) {
    const size = seedream5ProSize({ aspectRatio: "21:9" });
    const fal = buildSeedream5ProFalInput({ prompt, images, aspectRatio: "21:9" });
    assert.deepEqual(fal.image_size, size);
    assert.equal(fal.enable_safety_checker, true);
    assert.equal(fal.num_images, 1);
    assert.deepEqual(fal.image_urls || [], images);
    const krea = buildKreaImageInput({ modelName: model, prompt, referenceUrls: images, aspectRatio: "21:9" });
    assert.equal(kreaEndpointForModel("image", model), "/generate/image/bytedance/seedream-5-pro");
    assert.equal(krea.width, size.width);
    assert.equal(krea.height, size.height);
    assert.deepEqual(krea.style_images || [], images.map(url => ({ url, strength: 1 })));
    assert.equal(krea.image_urls, undefined);
    assert.equal(krea.resolution, undefined);
    const atlas = buildAtlasImageRequest({ model, prompt, images, aspectRatio: "21:9" });
    assert.equal(atlas.model, `bytedance/seedream-v5.0-pro/${images.length ? "edit" : "text-to-image"}`);
    assert.ok(atlasPricingEndpoints.includes(atlas.model));
    assert.equal(atlas.size, `${size.width}*${size.height}`);
    assert.equal(atlas.thinking, "enabled");
    assert.deepEqual(atlas.images || [], images);
    assert.equal(atlas.aspect_ratio, undefined);
    assert.equal(atlas.quality, undefined);
  }
});

test("unsupported sizes, masks and too many references are rejected, never truncated", () => {
  for (const patch of [{ resolution: "4K" }, { aspectRatio: "4:1" }, { images: [...refs, refs[0]] }, { maskUrl: "mask.png" }, { background: "transparent" }, { prompt: "" }]) {
    assert.throws(() => buildSeedream5ProFalInput({ prompt, ...patch }), { status: 400 });
    assert.throws(() => buildAtlasImageRequest({ model, prompt, ...patch }), { status: 400 });
  }
  assert.throws(() => buildKreaImageInput({ modelName: model, prompt, referenceUrls: [...refs, refs[0]] }), /10 reference/);
  assert.throws(() => buildKreaImageInput({ modelName: model, prompt, resolution: "4K" }), /4K/);
});

test("Fal generator validates before uploads, preserves labels and submits just once", async () => {
  const uploads = [], submissions = [];
  const generate = createSeedream5ProGenerator({
    readLocalAsset: async url => ({ mimeType: "image/png", buffer: url }),
    uploadImageInputToFal: async asset => { uploads.push(asset); return `https://example.com${asset.buffer}`; },
    promptWithReferenceLabels: (text, inputs) => `${text}\n${inputs.map(item => item.label).join(",")}`,
    subscribeFal: async (endpoint, request) => { submissions.push({ endpoint, ...request }); return { requestId: "mock-job", data: { images: [{ url: "https://example.com/out.png" }] } }; },
    firstFalImageResult: data => data.images[0]
  });
  await assert.rejects(generate({ prompt, resolution: "4K", imagePromptUrls: ["/portrait.png"] }), /4K/);
  assert.equal(uploads.length, 0);
  assert.equal(submissions.length, 0);
  for (const imagePromptUrls of [[], ["/portrait.png", "/wardrobe.png"]]) {
    const result = await generate({ prompt, imagePromptUrls, imagePromptLabels: ["Identity", "Outfit"], resolution: "2K", aspectRatio: "16:9" });
    assert.equal(result.endpoint, `bytedance/seedream/v5/pro/${imagePromptUrls.length ? "edit" : "text-to-image"}`);
    assert.equal(result.requestId, "mock-job");
    assert.equal(result.remoteImage.url, "https://example.com/out.png");
  }
  assert.equal(submissions.length, 2);
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
  const result = await adapter.image({ model, prompt, imageInputs: [{}], aspectRatio: "16:9" }, "mock");
  assert.equal(result.cost.amountUsd, 0.123);
  assert.equal(result.size, runs[0].input.size);
  assert.equal(runs.length, 1);
  assert.equal(runs[0].input.model, "bytedance/seedream-v5.0-pro/edit");
});

test("prices use each provider's pixel tier and extra reference count; Atlas remains quote-based", () => {
  for (const provider of ["fal", "krea"]) for (const resolution of ["1K", "2K"]) {
    const base = provider === "fal" ? resolution === "1K" ? 0.0675 : 0.135 : resolution === "1K" ? 0.045 : 0.09;
    const surcharge = provider === "fal" ? 0.0045 : 0.003;
    assert.equal(seedream5ProCost({ provider, resolution }).amountUsd, base);
    assert.equal(seedream5ProCost({ provider, resolution, referenceCount: 1 }).amountUsd, base);
    assert.equal(estimateImageRunCost({ model, provider, resolution, referenceCount: 3, batchCount: 2 }), Math.round((base + 2 * surcharge) * 2 * 1e6) / 1e6);
  }
  assert.equal(estimateKreaImageCost({ modelName: model, referenceCount: 10 }).amountUsd, 0.117);
  assert.equal(estimateImageRunCost({ model, provider: "atlas" }), null);
  const endpoint = kreaEndpointForModel("image", model);
  const rows = parseKreaPricing({ openapi: "3.1.0", paths: { [endpoint]: { post: { "x-krea-pricing": {
    type: "fixed", unit: "request", currency: "USD", price_points: [{ amount: 0.09, dimensions: { resolutionTier: "2k", referenceImageCount: 0 } }]
  } } } } });
  assert.equal(rows.find(row => row.id === `krea:${endpoint}`).entry.points[0].amount, 0.09);
});
