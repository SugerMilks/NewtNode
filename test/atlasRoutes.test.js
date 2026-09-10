import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { supportsAtlasImageModel } from "../src/atlasImages.js";
import { creativeImageDefaultModel } from "../src/modelOptions.js";
import { generationProviderFromSettings, estimateImageRunCost, estimateVideoRunCost } from "../src/generationPricing.js";

const source = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const code = source.slice(source.indexOf('app.post("/api/node/generate-image",'), source.indexOf("\nasync function runKreaImageModel("));
const providerCode = source.slice(source.indexOf("function atlasMediaEnabled()"), source.indexOf("\nconst runtimeThumbnailJobs"));

test("backend and UI preserve Fal then Krea then Atlas precedence", () => {
  for (const [fal, krea, atlas, expected] of [[true, true, true, "fal"], [false, true, true, "krea"], [false, false, true, "atlas"]]) {
    const enabled = new Function("process", `${providerCode}; return atlasMediaEnabled();`)({ env: { FAL_KEY: fal ? "fal-test" : "", KREA_API_KEY: krea ? "krea-test" : "", ATLAS_API_KEY: atlas ? "atlas-test" : "" } });
    assert.equal(enabled, expected === "atlas");
    assert.equal(generationProviderFromSettings({ falKeyConfigured: fal, kreaApiKeyConfigured: krea, atlasApiKeyConfigured: atlas }), expected);
  }
});

function imageApi({ failure } = {}) {
  let handler;
  const calls = [], history = [], reads = [];
  const deps = {
    app: { post: (_path, _limiter, run) => { handler = run; } }, imageGenerationRequestLimiter: null,
    process: { env: { ATLAS_API_KEY: "test-atlas-original" } }, atlasMediaEnabled: () => true, supportsAtlasImageModel,
    resolveImageModel: (displayName) => ({ displayName, provider: "fal-openai-image-25" }),
    isLocalAssetUrl: (url) => url.startsWith("/uploads/"), cleanImagePromptLabel: (value) => value || "",
    resolveImageGenerationAspectRatio: async ({ value }) => value || "16:9",
    readLocalAsset: async (url) => { reads.push(url); return { buffer: Buffer.from(url), mimeType: "image/png", fileName: "source.png" }; },
    imageDataUrlAsset: (value) => ({ buffer: Buffer.from(value), mimeType: "image/png" }),
    atlasMedia: { image: async (request, key) => {
      calls.push({ request, key });
      if (failure) throw failure;
      return { requestId: "atlas-job", endpoint: "atlas-model/edit", remoteImage: { url: "https://cdn.example/full.png" }, cost: { amountUsd: null }, submittedPrompt: request.prompt, size: "3840x2160", quality: "high", resolution: "4K" };
    } },
    downloadImage: async () => ({ publicPath: "/outputs/full.png", thumbnailPublicPath: "/outputs/thumb.jpg", mimeType: "image/png", fileName: "full.png", bytes: 123 }),
    appendHistory: async (item) => history.push(item), safePathSegment: (value) => value,
    projectFromBody: (body) => ({ id: body.projectId }), nodeFromBody: (body) => ({ id: body.nodeId }),
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    sendApiError: (res, error) => res.status(error.status || 500).json({ error: error.message })
  };
  new Function(...Object.keys(deps), code)(...Object.values(deps));
  return { calls, reads, history, async run(patch = {}) {
    let status = 200, data;
    const res = { status(value) { status = value; return this; }, json(value) { data = value; } };
    await handler({ body: { model: creativeImageDefaultModel, prompt: "Preserve @Emma", nodeId: "character", projectId: "test-project", resolution: "4K", quality: "high", aspectRatio: "16:9", ...patch } }, res);
    return { status, data };
  } };
}

test("Atlas image route preserves ordered labeled references, masks, project history and native outputs", async () => {
  const api = imageApi();
  const result = await api.run({ imagePromptUrls: ["/uploads/base.png", "/uploads/outfit.png"], imagePromptLabels: ["BASE", "WARDROBE"], editMaskDataUrl: "mask-test" });
  assert.equal(result.status, 200);
  assert.equal(api.calls.length, 1);
  assert.equal(api.calls[0].key, "test-atlas-original");
  assert.deepEqual(api.calls[0].request.imageInputs.map((item) => item.label), ["BASE", "WARDROBE"]);
  assert.equal(api.calls[0].request.editMaskInput.buffer.toString(), "mask-test");
  assert.equal(api.calls[0].request.resolution, "4K");
  assert.equal(result.data.image.localUrl, "/outputs/full.png");
  assert.equal(result.data.image.thumbnailUrl, "/outputs/thumb.jpg");
  assert.equal(api.history[0].provider, "Atlas Cloud");
  assert.equal(api.history[0].project.id, "test-project");
  assert.equal(api.history[0].cost.amountUsd, null);
});

test("unsupported Atlas models stop before reading references or paying; adapter errors are JSON", async () => {
  const api = imageApi();
  assert.equal((await api.run({ model: "Krea 2 Large", imagePromptUrls: ["/uploads/private.png"] })).status, 400);
  assert.equal(api.reads.length, 0);
  assert.equal(api.calls.length, 0);
  const failed = imageApi({ failure: Object.assign(new Error("Unsupported Atlas dimensions"), { status: 400 }) });
  assert.deepEqual(await failed.run(), { status: 400, data: { error: "Unsupported Atlas dimensions" } });
  assert.equal(failed.calls.length, 1);
  assert.equal(failed.history.length, 0);
});

test("Atlas estimates use Atlas rates and never substitute Fal rates for token billing", () => {
  assert.equal(estimateImageRunCost({ model: "Nano Banana 2", resolution: "2K", aspectRatio: "16:9", provider: "atlas", batchCount: 4 }), 0.48);
  assert.equal(estimateImageRunCost({ model: creativeImageDefaultModel, provider: "atlas" }), null);
  assert.equal(estimateVideoRunCost({ model: "Seedance 2.5", duration: "8 seconds", resolution: "720p", provider: "atlas" }), null);
});
