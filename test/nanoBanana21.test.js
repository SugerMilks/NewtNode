import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as nano from "../src/nanoBanana21.js";
import { isRetiredNanoBanana2Model } from "../src/retiredImageModels.js";
import { imageModelNames, imageModelOptions, imageWorkspaceModelOptions, coverageModelOptions, storyboardImageModelOptions, normalizeModelPreferences } from "../src/modelOptions.js";
import { characterSheetModelOptions, characterSheetGenerationSettings } from "../src/characterSheetModels.js";
import { storyboardImageSettings, storyboardCharacterImageSettings } from "../src/storyboardImageModels.js";
import { exploreModels } from "../src/explore.js";
import { normalizeMyNewtFavoriteModels } from "../src/myNewt/favoriteModels.js";
import * as krea from "../src/kreaApi.js";
import { supportsAtlasImageModel } from "../src/atlasImages.js";
import { estimateImageRunCost } from "../src/generationPricing.js";
import { parseKreaPricing } from "../server/pricing-sources.js";
import { createNanoBanana21Generator } from "../server/nano-banana-21.js";
import { createSingleSubmissionFalClient } from "../server/fal-single-submission.js";
import { normalizeCharacterWardrobeRequest } from "../server/character-wardrobe.js";
import * as seedream from "../src/seedream5Pro.js";
import * as image25 from "../src/openAiImage25.js";
import { nodeApi, generationApi } from "../src/api/newtApi.js";

const model = nano.nanoBanana21ModelName, prompt = "A cinematic location with the referenced actor.";
const references = ["/uploads/identity.png", "/uploads/location.png"];
const source = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
const serverFunction = name => {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return `${source.slice(start - 6, start) === "async " ? "async " : ""}${source.slice(start, source.indexOf("\n}", start) + 2)}`;
};

test("2.1 is distinct from 2, available throughout image tools, and does not replace defaults", () => {
  for (const name of [model, nano.nanoBanana21FalTextEndpoint, nano.nanoBanana21FalEditEndpoint, "gemini-nano-banana-2.1"]) {
    assert.equal(nano.isNanoBanana21Model(name), true);
    assert.equal(isRetiredNanoBanana2Model(name), false);
  }
  assert.equal(isRetiredNanoBanana2Model("Nano Banana 2"), true);
  for (const name of ["Nano Banana 2", "Nano Banana Pro", "Nano Banana 2.10", "Nano Banana 2.1 Pro", undefined]) assert.equal(nano.isNanoBanana21Model(name), false);
  for (const options of [imageModelOptions, imageWorkspaceModelOptions, coverageModelOptions, storyboardImageModelOptions, characterSheetModelOptions, exploreModels]) assert.ok(options.includes(model));
  assert.equal(normalizeModelPreferences().image[model], true);
  assert.equal(normalizeModelPreferences({ image: { [model]: false } }).image[model], false);
  assert.equal(normalizeMyNewtFavoriteModels({ favoriteImageModel: model }).favoriteImageModel, model);
  assert.equal(characterSheetGenerationSettings().model, "Nano Banana Pro");
  assert.equal(storyboardImageSettings().model, "OpenAI Image 2.5 Flare");
  assert.equal(characterSheetGenerationSettings(model).resolution, "4K");
  assert.equal(storyboardCharacterImageSettings({ model }).resolution, "4K");
  assert.equal(storyboardImageSettings({ model, aspectRatio: "2:1" }).aspectRatio, "16:9");
});

test("provider payloads preserve every supported resolution, ratio, reference and thinking level", () => {
  for (const provider of ["fal", "krea"]) for (const resolution of nano.nanoBanana21ResolutionOptions) for (const aspectRatio of nano.nanoBanana21Ratios(provider)) {
    const input = nano.buildNanoBanana21Input({ prompt, images: references, provider, resolution, aspectRatio });
    assert.equal(input.resolution, resolution); assert.equal(input.aspect_ratio, aspectRatio);
    assert.deepEqual(input.image_urls, references); assert.equal(input.thinking_level, "high");
    if (provider === "krea") {
      assert.deepEqual(krea.buildKreaImageInput({ modelName: model, prompt, referenceUrls: references, resolution, aspectRatio }), input);
      assert.equal(input.num_images, undefined); assert.equal(input.limit_generations, undefined);
    } else { assert.equal(input.num_images, 1); assert.equal(input.limit_generations, true); }
  }
  assert.equal(krea.kreaEndpointForModel("image", model), nano.nanoBanana21KreaEndpoint);
  assert.equal(supportsAtlasImageModel(model), false);
  assert.throws(() => nano.buildNanoBanana21Input({ prompt, provider: "krea", aspectRatio: "8:1" }), /aspect ratio/);
});

test("invalid inputs are rejected instead of truncating references or silently switching models", () => {
  for (const patch of [{ images: Array(15).fill("/uploads/a.png") }, { images: [null] }, { images: "bad" }, { provider: "atlas" }, { resolution: "0.5K" }, { resolution: "8K" }, { aspectRatio: "2:1" }, { maskUrl: "mask.png" }, { background: "transparent" }, { prompt: "hi" }, { prompt: "x".repeat(50001) }])
    assert.throws(() => nano.buildNanoBanana21Input({ prompt, ...patch }), { status: 400 });
  assert.equal(nano.buildNanoBanana21Input({ prompt, images: Array(14).fill("/uploads/a.png") }).image_urls.length, 14);
});

test("Krea pricing has its own published table; unverified Fal and Atlas costs stay unknown", () => {
  for (const resolution of nano.nanoBanana21ResolutionOptions) {
    assert.equal(estimateImageRunCost({ model, provider: "krea", resolution, batchCount: 2 }), nano.nanoBanana21KreaPrices[resolution] * 2);
    for (const provider of ["fal", "atlas"]) assert.equal(estimateImageRunCost({ model, provider, resolution }), null);
  }
  const endpoint = nano.nanoBanana21KreaEndpoint;
  const entry = parseKreaPricing({ openapi: "3.1.0", paths: { [endpoint]: { post: { "x-krea-pricing": { type: "fixed", unit: "request", currency: "USD",
    price_points: Object.entries(nano.nanoBanana21KreaPrices).map(([resolution, amount]) => ({ amount, dimensions: { resolution } })) } } } } }).find(row => row.id === `krea:${endpoint}`);
  assert.equal(entry.entry.points.length, 3);
});

function generatorHarness(overrides = {}) {
  const uploads = [], calls = [], client = {};
  const generate = createNanoBanana21Generator({
    readLocalAsset: async url => ({ buffer: url, mimeType: "image/png" }),
    uploadImageInputToFal: async (asset, _index, actualClient) => { assert.equal(actualClient, client); uploads.push(asset); return `https://example.com${asset.buffer}`; },
    promptWithReferenceLabels: (text, inputs) => `${text}\n${inputs.map(item => item.label).join(",")}`,
    subscribeFal: async (endpoint, request, _context, actualClient, key) => { assert.equal(actualClient, client); assert.equal(key, "fixture-key"); calls.push({ endpoint, ...request }); return { requestId: "fixture-job", data: { images: [{ url: "https://example.com/out.png" }] } }; },
    firstFalImageResult: data => data?.images?.[0], createClient: ({ credentials }) => { assert.equal(credentials, "fixture-key"); return client; }, ...overrides
  });
  return { uploads, calls, generate: request => generate(request, "fixture-key") };
}

test("Fal uses genuine 2.1 text/edit endpoints with captured credentials and ordered labeled references", async () => {
  const h = generatorHarness();
  for (const imagePromptUrls of [[], references]) {
    const output = await h.generate({ prompt, imagePromptUrls, imagePromptLabels: ["Actor", "Park"], resolution: "4K", aspectRatio: "16:9" });
    assert.equal(output.endpoint, imagePromptUrls.length ? nano.nanoBanana21FalEditEndpoint : nano.nanoBanana21FalTextEndpoint);
    assert.equal(output.thinkingLevel, "high"); assert.equal(output.requestId, "fixture-job");
  }
  assert.equal(h.calls.length, 2); assert.match(h.calls[1].input.prompt, /Actor,Park/);
  assert.deepEqual(h.calls[1].input.image_urls, references.map(url => `https://example.com${url}`));
});

test("invalid sources and expanded prompts stop before uploads; failed generations are not replayed", async () => {
  for (const [overrides, request, match] of [
    [{}, { resolution: "0.5K" }, /resolution/],
    [{ readLocalAsset: async () => ({ mimeType: "video/mp4" }) }, {}, /must be images/],
    [{ promptWithReferenceLabels: () => "x".repeat(50001) }, {}, /50,000/]
  ]) {
    const h = generatorHarness(overrides);
    await assert.rejects(h.generate({ prompt, imagePromptUrls: references, ...request }), match);
    assert.equal(h.uploads.length, 0); assert.equal(h.calls.length, 0);
  }
  let submissions = 0;
  const h = generatorHarness({ subscribeFal: async () => { submissions++; throw new Error("Provider failed"); } });
  await assert.rejects(h.generate({ prompt }), /Provider failed/); assert.equal(submissions, 1);
});

test("SDK retryable failures cannot repeat a Nano Banana 2.1 paid POST", async () => {
  for (const endpoint of [nano.nanoBanana21FalTextEndpoint, nano.nanoBanana21FalEditEndpoint]) {
    let posts = 0;
    const client = createSingleSubmissionFalClient({ credentials: "fixture-key", endpoint, model }, async () => { posts++; throw new TypeError("Network error"); });
    await assert.rejects(client.queue.submit(endpoint, { input: { prompt } }), /Check Fal history/);
    assert.equal(posts, 1);
    await assert.rejects(client.queue.submit(endpoint, { input: { prompt } }), /did not resubmit/);
    assert.equal(posts, 1);
  }
});

function routeHarness(provider, fail = false) {
  let handler, json, status = 200;
  const requests = [], history = [], uploads = [];
  const env = provider === "fal" ? { FAL_KEY: "fixture-key" } : provider === "krea" ? { KREA_API_KEY: "fixture-key" } : { ATLAS_API_KEY: "fixture-key" };
  const deps = { ...nano, ...krea, ...seedream, ...image25, isRetiredNanoBanana2Model, imageModelNames, normalizeCharacterWardrobeRequest,
    createNanoBanana21Generator, process: { env }, app: { post: (_path, _limiter, callback) => { handler = callback; } }, imageGenerationRequestLimiter: null,
    atlasMediaEnabled: () => provider === "atlas", supportsAtlasImageModel,
    httpError: (status, message) => Object.assign(new Error(message), { status }), sendApiError: (_res, error) => { status = error.status || 500; json = { error: error.message }; },
    isLocalAssetUrl: url => typeof url === "string" && url.startsWith("/uploads/"), cleanImagePromptLabel: label => label || "",
    readLocalAsset: async url => ({ buffer: url, mimeType: url.endsWith(".png") ? "image/png" : "video/mp4" }),
    uploadImageInputToFal: async asset => { uploads.push(asset.buffer); return `https://example.com${asset.buffer}`; },
    uploadLocalOutputToKrea: async url => { uploads.push(url); return `https://example.com${url}`; },
    subscribeFal: async (endpoint, request) => { requests.push({ endpoint, ...request }); if (fail) throw new Error("Provider failed"); return { requestId: "fixture-job", data: { images: [{ url: "https://example.com/out.png" }] } }; },
    firstFalImageResult: data => data.images[0],
    runKreaGeneration: async request => { requests.push(request); if (fail) throw new Error("Provider failed"); return { requestId: "fixture-job", job: { result: { urls: ["https://example.com/out.png"] } } }; },
    promptWithReferenceLabels: (text, inputs) => `${text}\n${inputs.map(item => item.label).join(",")}`,
    downloadImage: async () => ({ publicPath: "/workflow-assets/fixture/outputs/image.png", thumbnailPublicPath: "/outputs/thumb.png", fileName: "image.png", mimeType: "image/png", bytes: 42 }),
    appendHistory: async entry => history.push(entry), projectFromBody: body => ({ id: body.projectId }), nodeFromBody: body => ({ id: body.nodeId }),
    randomUUID: () => "fixture-uuid", safePathSegment: text => text, normalizeChoice: (value, options, fallback) => options.includes(value) ? value : fallback,
    firstImageDimensions: async () => ({ width: 800, height: 100 }), closestAspectRatio: (_ratio, options) => options.includes("8:1") ? "8:1" : "4:1"
  };
  const route = source.slice(source.indexOf('app.post("/api/node/generate-image",'), source.indexOf("\nasync function runKreaImageModel("));
  const functions = ["resolveImageModel", "runKreaImageModel", "resolveImageGenerationAspectRatio", "normalizeImageAspectRatioForProvider", "imageAspectRatiosForProvider", "isAutoImageAspectRatio"].map(serverFunction).join("\n");
  new Function(...Object.keys(deps), `${functions}\n${route}`)(...Object.values(deps));
  return { requests, history, uploads, async run(patch = {}) {
    status = 200; json = undefined;
    await handler({ body: { prompt, model, resolution: "4K", aspectRatio: "16:9", imagePromptUrls: references, imagePromptLabels: ["Actor", "Park"], projectId: "fixture", nodeId: "image", ...patch } }, {
      status(value) { status = value; return this; }, json(value) { json = value; return value; }
    });
    return { status, data: json };
  } };
}

for (const provider of ["fal", "krea"]) {
  test(`${provider} route saves output, history, project, endpoint and references for text and reference runs`, async () => {
    const h = routeHarness(provider);
    for (const imagePromptUrls of [[], references]) {
      const result = await h.run({ imagePromptUrls });
      assert.equal(result.status, 200, result.data?.error);
      assert.equal(result.data.image.localUrl, "/workflow-assets/fixture/outputs/image.png");
      const row = h.history.at(-1);
      assert.equal(row.modelName, model); assert.equal(row.project.id, "fixture"); assert.equal(row.node.id, "image");
      assert.equal(row.settings.thinkingLevel, "high"); assert.equal(row.settings.imagePromptCount, imagePromptUrls.length);
      assert.match(row.endpoint, /nano-banana-2\.1/);
      assert.equal(row.cost.amountUsd, provider === "fal" ? null : 0.0755);
    }
    assert.equal(h.requests.length, 2);
  });
  test(`${provider} route rejects bad inputs before upload and failure never saves fake success`, async () => {
    for (const patch of [{ resolution: "0.5K" }, { aspectRatio: "2:1" }, { imagePromptUrls: Array(15).fill(references[0]) }, { imagePromptUrls: ["https://invalid.example/remote.png"] }, { imagePromptUrls: ["/uploads/video.mp4"] }, { editMaskDataUrl: "mask" }, { model: "Ideogram 4.5" }]) {
      const h = routeHarness(provider), result = await h.run(patch);
      assert.equal(result.status, 400, result.data?.error); assert.equal(h.requests.length, 0); assert.equal(h.uploads.length, 0); assert.equal(h.history.length, 0);
    }
    const h = routeHarness(provider, true), result = await h.run();
    assert.equal(result.status, 500); assert.equal(h.requests.length, 1); assert.equal(h.history.length, 0);
  });
}

test("Atlas-only requests stop before upload and Krea Auto chooses a supported ratio", async () => {
  const atlas = routeHarness("atlas"), result = await atlas.run();
  assert.equal(result.status, 400); assert.match(result.data.error, /Fal or Krea/); assert.equal(atlas.uploads.length, 0);
  const h = routeHarness("krea"), auto = await h.run({ aspectRatio: "Auto", requestedAspectRatio: "Auto" });
  assert.equal(auto.status, 200, auto.data?.error); assert.equal(h.requests[0].input.aspect_ratio, "4:1");
});

test("workspace and node clients require updated backend support before a 2.1 paid request", async t => {
  let supported = false;
  const posts = [];
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/health")) return new Response(JSON.stringify({ routes: { nanoBanana21: supported } }));
    posts.push(JSON.parse(options.body)); return new Response(JSON.stringify({ image: { localUrl: "/outputs/fixture.png" } }));
  });
  for (const api of [nodeApi, generationApi]) {
    await assert.rejects(api.generateImage({ model, prompt }), /Restart/); assert.equal(posts.length, 0);
  }
  supported = true;
  await nodeApi.generateImage({ model, prompt }); await generationApi.generateImage({ model, prompt });
  assert.equal(posts.length, 2); assert.ok(posts.every(body => body.model === model));
});
