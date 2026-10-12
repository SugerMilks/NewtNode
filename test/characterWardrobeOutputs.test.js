import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, stat, rm } from "node:fs/promises";
import { createWriteStream } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import sharp from "sharp";
import { finishOpenAiMaskedEdit } from "../server/openai-edit-mask.js";
import { isOpenAiImage25Model, openAiImage25Variant } from "../src/openAiImage25.js";
import { normalizeCharacterWardrobeRequest } from "../server/character-wardrobe.js";
import { isNanoBanana21Model } from "../src/nanoBanana21.js";

const source = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
const routeCode = source.slice(source.indexOf('app.post("/api/node/generate-image",'), source.indexOf("\nasync function runKreaImageModel("));
const downloadCode = source.slice(source.indexOf("async function downloadImage("), source.indexOf("\nasync function createImagePreview("));
const raster = (color) => sharp({ create: { width: 32, height: 16, channels: 3, background: color } }).png().toBuffer();

async function harness(t, provider, model, masked = true, requestOverrides = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "newtnode-mask-output-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const base = await raster("#7392ae"), generated = await raster("#010101");
  const mask = await sharp({ create: { width: 32, height: 16, channels: 4, background: "#fff" } })
    .composite([{ input: await sharp({ create: { width: 16, height: 16, channels: 4, background: "#fff" } }).png().toBuffer(), left: 0, top: 0, blend: "dest-out" }]).png().toBuffer();
  const maskedEdit = masked ? { source: base, mask } : null;
  let appliedMask = null;
  const cost = { amountUsd: 0.12 };
  const history = [], events = [], requests = [];
  const output = { fileName: "sheet.png", filePath: path.join(directory, "sheet.png"), publicPath: "/outputs/sheet.png" };
  const downloadDeps = { readFile, writeFile, stat, rm, createWriteStream, Readable, pipeline, finishOpenAiMaskedEdit,
    fetch: async () => { events.push("download"); return new Response(generated, { headers: { "content-type": "image/png" } }); },
    normalizeMimeType: value => value, imageExtensionForUrl: () => ".png", workflowPackageOutputDirName: "outputs",
    createManagedAssetTarget: async (req, kind, extension) => {
      assert.equal(extension, ".png"); assert.equal(req.body.projectId, "test-project"); return output;
    },
    createImagePreview: async (_req, saved) => {
      events.push("thumbnail");
      assert.deepEqual(await readFile(saved.filePath), appliedMask ? await finishOpenAiMaskedEdit(appliedMask, generated) : generated,
        "The thumbnail must be made from the completed image, never the raw black-masked response");
      return { publicPath: "/thumbnails/sheet.jpg", fileName: "sheet.jpg" };
    }
  };
  const downloadImage = new Function(...Object.keys(downloadDeps), `${downloadCode}; return downloadImage;`)(...Object.values(downloadDeps));
  let handler;
  const generate = async options => {
    requests.push(options);
    appliedMask = options.editMaskDataUrl || options.editMaskInput ? maskedEdit : null;
    events.push("generate");
    return { requestId: "test-job", remoteImage: { url: "https://example.com/raw.png", content_type: "image/png" },
      maskedEdit: appliedMask, cost, endpoint: "test/edit", size: "32x16", resolution: "4K", quality: "high" };
  };
  const deps = {
    normalizeCharacterWardrobeRequest, isNanoBanana21Model,
    app: { post: (_url, _limiter, callback) => { handler = callback; } }, imageGenerationRequestLimiter: null,
    process: { env: { FAL_KEY: provider === "fal" ? "mock" : "", ATLAS_API_KEY: "mock" } },
    atlasMediaEnabled: () => provider === "atlas", supportsAtlasImageModel: () => true,
    resolveImageModel: () => ({ displayName: model, provider: isOpenAiImage25Model(model) ? "fal-openai-image-25" : "fal-openai-image-2" }),
    isLocalAssetUrl: () => true, cleanImagePromptLabel: value => value,
    resolveImageGenerationAspectRatio: async () => "16:9", generateFalOpenAiImage2: generate,
    atlasMedia: { image: generate }, readLocalAsset: async () => ({ buffer: base, mimeType: "image/png" }),
    imageDataUrlAsset: () => ({ buffer: mask }), downloadImage, isOpenAiImage25Model, openAiImage25Variant,
    safePathSegment: value => value, randomUUID: () => "test-id", openAiImage25Cost: () => cost, estimateOpenAiImage2Cost: () => cost,
    appendHistory: async row => { events.push("history"); history.push(row); assert.equal(row.outputBytes, (await stat(output.filePath)).size); },
    projectFromBody: body => ({ id: body.projectId }), nodeFromBody: body => ({ id: body.nodeId }),
    sendApiError: (_res, error) => { throw error; }
  };
  new Function(...Object.keys(deps), routeCode)(...Object.values(deps));
  let result;
  await handler({ body: { prompt: "Clothing only", model, projectId: "test-project", nodeId: "character-1",
    imagePromptUrls: ["/uploads/cu-base.png", "/uploads/wardrobe.png"], imagePromptLabels: ["BASE", "WARDROBE"],
    ...(masked ? { editMaskDataUrl: "test-mask" } : {}), ...requestOverrides } }, { json: value => { events.push("response"); result = value; } });
  return { events, history, result, output, base, generated, requests };
}

for (const [provider, model] of [["fal", "OpenAI Image 2"], ["fal", "OpenAI Image 2.5 Sunburst"], ["atlas", "OpenAI Image 2.5 Sunburst"]]) {
  test(`${provider} ${model} preserves ordinary masked edits before thumbnails, History and the node response`, async t => {
    const state = await harness(t, provider, model);
    assert.deepEqual(state.events, ["generate", "download", "thumbnail", "history", "response"]);
    assert.equal(state.history[0].settings.protectedPixelsRestored, true);
    assert.equal(state.history[0].localImage, state.result.image.localUrl);
    assert.equal(state.result.image.thumbnailUrl, "/thumbnails/sheet.jpg");
    assert.equal(state.result.maskedEdit, undefined, "Internal base/mask buffers must not be returned to the browser");
    assert.equal(state.history[0].maskedEdit, undefined);
    assert.deepEqual(await sharp(state.output.filePath).extract({ left: 20, top: 5, width: 1, height: 1 }).removeAlpha().raw().toBuffer(), Buffer.from([115, 146, 174]));
    assert.deepEqual(await sharp(state.output.filePath).extract({ left: 5, top: 5, width: 1, height: 1 }).removeAlpha().raw().toBuffer(), Buffer.from([1, 1, 1]));
  });

  for (const cu of [false, true]) {
    test(`${provider} ${model} strips stale ${cu ? "CU" : "regular"} Character masks before generation and saves the whole result`, async t => {
      const labels = [`Locked Base Identity ${cu ? "CU Video" : "Character"} Sheet`, "Selected wardrobe reference; clothing only"];
      const state = await harness(t, provider, model, true, {
        nodeTitle: `Character 1${cu ? " CU Video" : ""} Wardrobe Edit`, imagePromptLabels: labels
      });
      assert.equal(state.requests.length, 1, "Never retry a paid wardrobe edit automatically");
      assert.equal(state.requests[0].editMaskDataUrl, undefined);
      assert.ok(!state.requests[0].editMaskInput);
      assert.deepEqual(await readFile(state.output.filePath), state.generated, "Never paste fixed face rectangles over the complete provider image");
      assert.equal(state.history[0].settings.wardrobeEditMode, "full-sheet");
      assert.equal(state.history[0].settings.maskedEdit, false);
      assert.equal(state.history[0].settings.protectedPixelsRestored, false);
      assert.deepEqual(state.history[0].settings.imagePromptLabels, labels);
      assert.deepEqual(state.events, ["generate", "download", "thumbnail", "history", "response"]);
      if (provider === "fal") assert.deepEqual(state.requests[0].imagePromptUrls, ["/uploads/cu-base.png", "/uploads/wardrobe.png"]);
      else assert.deepEqual(state.requests[0].imageInputs.map(input => input.label), labels);
    });
  }
}

test("unmasked image edits retain the provider bytes without base compositing", async t => {
  const state = await harness(t, "fal", "OpenAI Image 2.5 Sunburst", false);
  assert.deepEqual(await readFile(state.output.filePath), state.generated);
  assert.equal(state.history[0].settings.protectedPixelsRestored, false);
});
