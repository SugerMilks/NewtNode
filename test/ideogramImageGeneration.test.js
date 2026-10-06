import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { ideogramImageModelName as model, ideogramImageEndpoint, ideogramImageSize } from "../src/ideogramImage.js";
import { createIdeogramImageGenerator, createIdeogramImageHandler } from "../server/ideogram-image.js";
import { createIdeogramFalClient } from "../server/image-edit.js";
import { isSeedream5ProModel, seedream5ProModelName, seedream5ProFalEndpoint } from "../src/seedream5Pro.js";
import { isNanoBanana2Model } from "../src/nanoBanana2.js";
import { isOpenAiImage25Model, openAiImage25Models, openAiImage25Variant } from "../src/openAiImage25.js";

const serverSource = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
const httpError = (status, message) => Object.assign(new Error(message), { status });
const modelNamesSource = serverSource.slice(serverSource.indexOf("const imageModelNames = {"), serverSource.indexOf("const videoModelNames = {"));
const modelCatalog = new Function("ideogramImageModelName", "seedream5ProModelName", "openAiImage25Models", `${modelNamesSource}; return { imageModelNames, imageModelOptions };`)(model, seedream5ProModelName, openAiImage25Models);
const resolveDependencies = { ideogramImageModelName: model, ideogramImageEndpoint, isSeedream5ProModel, seedream5ProModelName, seedream5ProFalEndpoint,
  isNanoBanana2Model, isOpenAiImage25Model, openAiImage25Models, openAiImage25Variant, imageModelNames: modelCatalog.imageModelNames,
  httpError, process: { env: {} }, falNanoBananaProEndpoint: "fal-ai/nano-banana-pro", falNanoBanana2TextEndpoint: "fal-ai/nano-banana-2" };
const resolverSource = serverSource.slice(serverSource.indexOf("function resolveImageModel("), serverSource.indexOf("function resolveUtilityImageModel("));
const resolveImageModel = new Function(...Object.keys(resolveDependencies), `${resolverSource}; return resolveImageModel;`)(...Object.values(resolveDependencies));

function provider(overrides = {}) {
  const clients = [], submissions = [], reads = [], uploads = [];
  return { clients, submissions, reads, uploads, dependencies: {
    readLocalAsset: async (url) => { reads.push(url); return { mimeType: "image/png",
      buffer: await sharp({ create: { width: 320, height: 256, channels: 3, background: "red" } }).png().toBuffer() }; },
    uploadImageInputToFal: async (image, index, client) => { uploads.push({ image, index, client }); return `https://fixture.invalid/${image.fileName}`; },
    createClient: (key, endpoint) => { const client = { key, endpoint }; clients.push(client); return client; },
    subscribeFal: async (endpoint, options, context, client, billingKey) => {
      submissions.push({ endpoint, options, context, client, billingKey });
      return { requestId: "fixture-job", data: { images: [{ url: "https://fixture.invalid/result.png", content_type: "image/png", width: 2560, height: 1440 }], seed: 0 } };
    },
    firstFalImageResult: data => data?.images?.[0], ...overrides
  } };
}

function imageApi({ key = "fixture-original-key", ...overrides } = {}) {
  const state = provider(overrides), saved = [], history = [], environment = { key };
  const dependencies = {
    ...state.dependencies, getKey: () => environment.key,
    downloadImage: async (req, url, prefix, mimeType) => {
      saved.push({ body: req.body, url, prefix, mimeType });
      return { publicPath: "/workflow-assets/fixture/outputs/generated.png", thumbnailPublicPath: "/workflow-assets/fixture/outputs/thumb.jpg", fileName: "generated.png", mimeType: "image/png", bytes: 42 };
    },
    appendHistory: async (entry) => history.push(entry), projectFromBody: (body) => ({ id: body.projectId }), nodeFromBody: (body) => ({ id: body.nodeId }), ...overrides
  };
  const runIdeogramImageModel = createIdeogramImageHandler(dependencies);
  let handler;
  const route = serverSource.slice(serverSource.indexOf('app.post("/api/node/generate-image",'), serverSource.indexOf("\nasync function runAtlasImageModel("));
  const routeDependencies = {
    app: { post: (_path, _limiter, run) => { handler = run; } }, imageGenerationRequestLimiter: null,
    runIdeogramImageModel, resolveImageModel,
    normalizeCharacterWardrobeRequest: () => assert.fail("Ideogram must branch before wardrobe mask removal"),
    isLocalAssetUrl: () => assert.fail("Ideogram must reject references before URL filtering"),
    atlasMediaEnabled: () => assert.fail("Ideogram must never fall back to Atlas"),
    sendApiError: (res, error) => res.status(error.status || 500).json({ error: error.message })
  };
  new Function(...Object.keys(routeDependencies), route)(...Object.values(routeDependencies));
  return { ...state, saved, history, environment, async post(patch = {}) {
    let status = 200, body;
    await handler({ body: { model, prompt: "A hand-lettered restaurant sign", nodeId: "fixture-node", projectId: "fixture-project", workflowPackagePath: "/fixture/project", ...patch } },
      { status(value) { status = value; return this; }, json(value) { body = value; return this; } });
    return { status, body };
  } };
}

test("server catalog enables Ideogram while legacy model resolution and defaults remain intact", () => {
  assert.ok(modelCatalog.imageModelOptions.includes(model));
  const preferencesSource = serverSource.slice(serverSource.indexOf("const defaultModelPreferences = {"), serverSource.indexOf("const falNanoBananaProEndpoint ="));
  const defaults = new Function("imageModelNames", "imageModelOptions", "videoModelOptions", "isOpenAiImage25Model", "isSeedream5ProModel", `${preferencesSource}; return defaultModelPreferences;`)
    (modelCatalog.imageModelNames, modelCatalog.imageModelOptions, [], isOpenAiImage25Model, isSeedream5ProModel);
  assert.equal(defaults.image[model], true);
  assert.deepEqual(resolveImageModel(model), { provider: "fal-ideogram-45", displayName: model, id: "ideogram/v4.5" });
  assert.equal(resolveImageModel(undefined).displayName, "Nano Banana Pro");
  assert.equal(resolveImageModel("OpenAI Image 2.5 Sunburst").provider, "fal-openai-image-25");
  assert.equal(resolveImageModel("OpenAI Image 2.5 Flare").provider, "fal-openai-image-25");
  assert.throws(() => resolveImageModel("Ideogram 3"), { status: 400 });
});

test("Ideogram generator uses the text endpoint with explicit settings and the same captured billing key", async () => {
  const state = provider(), generate = createIdeogramImageGenerator(state.dependencies);
  const result = await generate({ prompt: "Sign", resolution: "1K", aspectRatio: "4:3", quality: "low", enablePromptExpansion: false, seed: 42 }, "fixture-key");
  assert.equal(state.clients.length, 1); assert.equal(state.submissions.length, 1);
  const call = state.submissions[0];
  assert.equal(call.endpoint, "ideogram/v4.5"); assert.equal(call.client.key, "fixture-key"); assert.equal(call.billingKey, "fixture-key");
  assert.deepEqual(call.context, { route: "generate-image", model });
  assert.deepEqual(call.options.input, { prompt: "Sign", image_size: ideogramImageSize({ resolution: "1K", aspectRatio: "4:3" }),
    quality: "low", enable_prompt_expansion: false, seed: 42, num_images: 1, sync_mode: false });
  assert.equal(result.seed, 0); assert.equal(result.requestId, "fixture-job");
});

test("invalid generation settings reject before any client, asset read, upload or submission", async () => {
  const invalid = [{ imagePromptUrls: ["https://remote.invalid/image.png"] }, { imagePromptUrls: ["not-a-local-url"] }, { imagePromptUrls: Array.from({ length: 6 }, (_, i) => `/uploads/${i}.png`) },
    { imagePromptUrls: ["/uploads/image.png"], ideogramSourceUrl: "/uploads/missing.png" },
    { imagePromptUrls: "not-an-array" }, { editMaskDataUrl: "data:image/png;base64,fixture" }, { resolution: "4K" }, { aspectRatio: "21:9" }, { aspectRatio: "Auto" },
    { quality: "very_low" }, { enablePromptExpansion: "false" }, { background: "transparent" }, { seed: -1 }, { seed: 2147483648 }, { seed: 1.5 }, { prompt: "" }, { prompt: "x".repeat(10001) }];
  for (const patch of invalid) {
    const api = imageApi();
    const response = await api.post(patch);
    assert.equal(response.status, 400, JSON.stringify(patch).slice(0, 100));
    assert.equal(api.clients.length, 0); assert.equal(api.submissions.length, 0); assert.equal(api.saved.length, 0);
    assert.equal(api.reads.length, 0); assert.equal(api.uploads.length, 0);
  }
  const wardrobe = imageApi();
  assert.equal((await wardrobe.post({ characterWardrobeEdit: true, editMaskDataUrl: "mask", imagePromptUrls: [] })).status, 400);
  assert.equal(wardrobe.submissions.length, 0);
});

test("missing or disabled Fal keys fail without falling back to another provider", async () => {
  for (const key of ["", " ", null, undefined]) {
    const api = imageApi(); api.environment.key = key;
    const response = await api.post();
    assert.equal(response.status, 400); assert.match(response.body.error, /Enable Fal/);
    assert.equal(api.clients.length, 0); assert.equal(api.submissions.length, 0);
  }
});

test("node generation saves normal managed image responses and exact model/options/seed in History", async () => {
  const api = imageApi(), response = await api.post({ resolution: "2K", aspectRatio: "16:9", quality: "medium", enablePromptExpansion: false, seed: 42 });
  assert.equal(response.status, 200); assert.equal(api.submissions.length, 1); assert.equal(api.saved.length, 1);
  assert.equal(response.body.image.localUrl, "/workflow-assets/fixture/outputs/generated.png");
  assert.equal(response.body.image.thumbnailUrl, "/workflow-assets/fixture/outputs/thumb.jpg");
  assert.equal(response.body.model, model); assert.equal(response.body.seed, 0); assert.equal(response.body.cost.amountUsd, null);
  assert.equal(api.saved[0].body.workflowPackagePath, "/fixture/project"); assert.equal(api.saved[0].prefix, "ideogram-4.5");
  const entry = api.history[0];
  assert.equal(entry.modelName, model); assert.equal(entry.provider, "fal.ai"); assert.equal(entry.endpoint, "ideogram/v4.5");
  assert.equal(entry.project.id, "fixture-project"); assert.equal(entry.node.id, "fixture-node"); assert.equal(entry.localImage, response.body.image.localUrl);
  assert.equal(entry.settings.quality, "medium"); assert.equal(entry.settings.enablePromptExpansion, false);
  assert.equal(entry.settings.seed, 0); assert.equal(entry.settings.requestedSeed, 42); assert.equal(entry.settings.imagePromptCount, 0);
  assert.equal(entry.cost.amountUsd, null); assert.equal(entry.settings.resolution, "2K"); assert.equal(entry.settings.aspectRatio, "16:9");
});

test("missing settings use 2K 16:9 high quality and prompt expansion without inventing a seed", async () => {
  const api = imageApi({ subscribeFal: async () => ({ data: { images: [{ url: "https://fixture.invalid/output.png" }] } }) });
  const response = await api.post();
  assert.equal(response.status, 200);
  const settings = api.history[0].settings;
  assert.equal(settings.resolution, "2K"); assert.equal(settings.aspectRatio, "16:9"); assert.equal(settings.quality, "high");
  assert.equal(settings.enablePromptExpansion, true); assert.equal(settings.seed, undefined); assert.equal(settings.requestedSeed, undefined);
  assert.equal(response.body.seed, undefined);
});

test("provider errors and missing images are not retried or persisted", async () => {
  for (const missingImage of [false, true]) {
    let calls = 0;
    const api = imageApi({ subscribeFal: async () => { calls++; if (missingImage) return { data: { images: [] } }; throw httpError(503, "Fixture provider failure"); } });
    const response = await api.post();
    assert.equal(response.status, missingImage ? 502 : 503); assert.equal(calls, 1); assert.equal(api.saved.length, 0); assert.equal(api.history.length, 0);
    if (missingImage) assert.match(response.body.error, /Check Fal history/);
  }
});

test("post-generation save failures warn about completed paid work and History failures preserve saved output", async () => {
  const failedSave = imageApi({ downloadImage: async () => { throw new Error("Fixture disk full"); } });
  const response = await failedSave.post();
  assert.equal(response.status, 502); assert.match(response.body.error, /completed.*could not save.*Check Fal history/);
  assert.equal(failedSave.submissions.length, 1); assert.equal(failedSave.history.length, 0);
  const failedHistory = imageApi({ appendHistory: async () => { throw new Error("Fixture History failure"); } });
  const saved = await failedHistory.post();
  assert.equal(saved.status, 200); assert.ok(saved.body.image.localUrl); assert.match(saved.body.warning, /History/);
  assert.equal(failedHistory.submissions.length, 1);
});

test("generation SDK guard permits exactly one outbound paid POST after 503 or network timeout", async () => {
  for (const endpoint of [ideogramImageEndpoint, "ideogram/v4.5/edit"]) for (const failure of ["503", "timeout"]) {
    let requests = 0;
    const client = createIdeogramFalClient("fixture-key", endpoint, async (url, init) => {
      assert.equal(url, `https://queue.fal.run/${endpoint}`); assert.equal(init.method, "POST"); requests++;
      if (failure === "timeout") throw new Error("Fixture timeout");
      return new Response(JSON.stringify({ detail: "Fixture unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
    });
    await assert.rejects(client.queue.submit(endpoint, { input: { prompt: "Fixture" } }), /Check Fal history/);
    assert.equal(requests, 1);
    await assert.rejects(client.queue.submit(endpoint, { input: { prompt: "Fixture" } }), /did not resubmit the (generation|edit)/);
    assert.equal(requests, 1);
  }
});

test("one source plus up to four guides use edit routing, source-first uploads and honest History", async () => {
  for (const count of [1, 2, 3, 4, 5]) {
    const api = imageApi();
    const urls = Array.from({ length: count }, (_, index) => `/uploads/${index}.png`);
    const selected = urls.at(-1);
    const response = await api.post({ imagePromptUrls: urls, imagePromptLabels: urls.map((_, i) => `Reference ${i}`),
      ideogramSourceUrl: selected, aspectRatio: "Auto", seed: 0 });
    assert.equal(response.status, 200, response.body.error);
    assert.equal(api.submissions.length, 1);
    assert.deepEqual(api.reads, [selected, ...urls.slice(0, -1)]);
    assert.equal(api.uploads.length, count);
    const call = api.submissions[0], input = call.options.input;
    assert.equal(call.endpoint, "ideogram/v4.5/edit"); assert.equal(input.image_size, "auto");
    assert.equal(input.image_url, `https://fixture.invalid/reference-${count}.png`);
    assert.deepEqual(input.reference_image_urls || [], urls.slice(0, -1).map((_, i) => `https://fixture.invalid/reference-${i + 1}.png`));
    assert.equal(input.seed, 0); assert.equal(input.edit_precision, "regular");
    assert.equal(input.enable_prompt_expansion, undefined);
    assert.match(input.prompt, new RegExp(`Source image \\(image 1\\): Reference ${count - 1}`));
    for (const upload of api.uploads) {
      assert.equal(upload.client, call.client);
      assert.equal(upload.image.mimeType, "image/png");
      assert.equal((await sharp(upload.image.buffer).metadata()).format, "png");
    }
    assert.equal(api.history[0].endpoint, call.endpoint);
    assert.equal(api.history[0].settings.imagePromptCount, count);
    assert.equal(api.history[0].settings.sourceUrl, selected);
    assert.equal(api.history[0].settings.aspectRatio, "auto");
    assert.equal(api.history[0].settings.resolution, "auto");
    assert.equal(response.body.image.sourceUrl, selected);
    assert.equal(response.body.cost.endpoint, call.endpoint);
    assert.equal(response.body.cost.amountUsd, null);
  }
});

test("all reference bytes are validated before any uploads or paid work", async () => {
  const valid = await sharp({ create: { width: 320, height: 256, channels: 3, background: "blue" } }).png().toBuffer();
  const tooWide = await sharp({ create: { width: 2000, height: 256, channels: 3, background: "blue" } }).png().toBuffer();
  for (const bad of [{ mimeType: "video/mp4", buffer: valid }, { mimeType: "image/png", buffer: Buffer.from("broken") },
    { mimeType: "image/png", buffer: Buffer.alloc(25 * 1024 * 1024 + 1) }, { mimeType: "image/png", buffer: tooWide }]) {
    const api = imageApi({ readLocalAsset: async url => url.includes("bad") ? bad : { mimeType: "image/png", buffer: valid } });
    const response = await api.post({ imagePromptUrls: ["/uploads/valid.png", "/uploads/bad.png"] });
    assert.equal(response.status, 400);
    assert.equal(api.uploads.length, 0); assert.equal(api.clients.length, 0); assert.equal(api.submissions.length, 0);
  }
  const uploadFailure = imageApi({ uploadImageInputToFal: async () => { throw new Error("Fixture upload failure"); } });
  const result = await uploadFailure.post({ imagePromptUrls: ["/uploads/source.png"] });
  assert.equal(result.status, 500); assert.match(result.body.error, /upload failure/);
  assert.equal(uploadFailure.submissions.length, 0);
});

test("a disabled key blocks reference reads and a key change during uploads cannot change billing", async () => {
  const disabled = imageApi({ key: "" });
  assert.equal((await disabled.post({ imagePromptUrls: ["/uploads/source.png"] })).status, 400);
  assert.equal(disabled.reads.length, 0); assert.equal(disabled.uploads.length, 0);
  let api;
  api = imageApi({ uploadImageInputToFal: async (image, index, client) => {
    api.environment.key = "replacement-key";
    assert.equal(client.key, "fixture-original-key");
    return "https://fixture.invalid/source.png";
  } });
  assert.equal((await api.post({ imagePromptUrls: ["/uploads/source.png"] })).status, 200);
  assert.equal(api.submissions[0].billingKey, "fixture-original-key");
});

test("captured generation key survives a settings change during client creation", async () => {
  let api;
  api = imageApi({ createClient: (key, endpoint) => { api.environment.key = "fixture-replacement-key"; return { key, endpoint }; } });
  assert.equal((await api.post()).status, 200);
  const request = api.submissions[0];
  assert.equal(request.client.key, "fixture-original-key"); assert.equal(request.billingKey, "fixture-original-key");
});
