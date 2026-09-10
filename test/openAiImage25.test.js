import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import * as image25 from "../src/openAiImage25.js";
import { imageModelNames, imageModelOptions, normalizeModelPreferences, openAiImageAspectRatios } from "../src/modelOptions.js";
import { normalizeOpenAiImage2Quality } from "../src/openAiImage2.js";
import { buildKreaImageInput, kreaEndpointForModel, supportsKreaModel, normalizeKreaImageResolution } from "../src/kreaApi.js";
import { estimateImageRunCost } from "../src/generationPricing.js";
import { reserveMyNewtCost } from "../server/my-newt-budget.js";
import { falPricingEndpoints, kreaPricingModels } from "../server/pricing-sources.js";
import { nodeApi } from "../src/api/newtApi.js";
import { runImageModelGeneration } from "../src/nodeRunners/mediaModels.js";

const server = await readFile(new URL("../server/index.js", import.meta.url), "utf8");
function serverFunction(name) {
  const start = server.indexOf(`function ${name}(`);
  assert.ok(start >= 0, name);
  return `${server.slice(start - 6, start) === "async " ? "async " : ""}${server.slice(start, server.indexOf("\n}", start) + 2)}`;
}
function serverHelpers(deps, names) {
  return new Function(...Object.keys(deps), `${names.map(serverFunction).join("\n")}\nreturn {${names.join(",")}};`)(...Object.values(deps));
}
const sizes = serverHelpers({}, ["normalizeOpenAiImageSize", "openAiImageSizeForAspectRatio", "aspectRatioNumber", "roundOpenAiImageDimension"]);
const models = Object.values(image25.openAiImage25Models);
const prompt = "Keep the subject and edit only the background.";

test("Image 2.5 variants are registered without replacing Image 2 or saved preferences", () => {
  for (const model of models) {
    assert.ok(imageModelOptions.includes(model));
    assert.equal(normalizeModelPreferences().image[model], true);
    assert.equal(normalizeModelPreferences({ image: { [model]: false } }).image[model], false);
    assert.ok(supportsKreaModel("image", model));
  }
  assert.ok(imageModelOptions.includes(imageModelNames.openAiImage2));
  assert.equal(image25.isOpenAiImage25Model(imageModelNames.openAiImage2), false);
  assert.equal(image25.normalizeOpenAiImage25Quality("MAX"), "max");
  assert.equal(image25.normalizeOpenAiImage25Quality("xhigh"), "xhigh");
  assert.equal(image25.normalizeOpenAiImage25Quality("auto"), "high");
});

test("backend resolves both 2.5 variants before the legacy OpenAI match", () => {
  const { resolveImageModel } = serverHelpers({ ...image25, imageModelNames, isNanoBanana2Model: () => false,
    httpError: (status, message) => Object.assign(new Error(message), { status }) }, ["resolveImageModel"]);
  for (const variant of ["sunburst", "flare"]) {
    for (const name of [image25.openAiImage25Models[variant], `gpt-image-2.5-${variant}`]) {
      const selected = resolveImageModel(name);
      assert.equal(selected.provider, "fal-openai-image-25");
      assert.equal(selected.id, `openai/gpt-image-2.5/${variant}/text-to-image`);
    }
  }
  assert.equal(resolveImageModel("OpenAI Image 2").id, "openai/gpt-image-2");
  assert.throws(() => resolveImageModel("gpt-image-2.5"), /Sunburst or Flare/);
});

test("Fal 2.5 request builder preserves edits, mask, quality, alpha and all references", () => {
  for (const model of models) {
    const variant = image25.openAiImage25Variant(model);
    const base = { model, prompt, size: "1280x720", quality: "max", background: "transparent" };
    const generated = image25.buildOpenAiImage25FalRequest(base);
    assert.equal(generated.endpoint, `openai/gpt-image-2.5/${variant}/text-to-image`);
    assert.deepEqual(generated.input, { prompt, image_size: { width: 1280, height: 720 }, quality: "max", background: "transparent", num_images: 1, output_format: "png", sync_mode: false });
    const imageUrls = Array.from({ length: 16 }, (_, i) => `https://example.com/${i}.png`);
    const edit = image25.buildOpenAiImage25FalRequest({ ...base, imageUrls, maskUrl: "https://example.com/mask.png" });
    assert.equal(edit.endpoint, `openai/gpt-image-2.5/${variant}/edit`);
    assert.deepEqual(edit.input.image_urls, imageUrls);
    assert.equal(edit.input.mask_url, "https://example.com/mask.png");
    assert.throws(() => image25.buildOpenAiImage25FalRequest({ ...base, imageUrls: [...imageUrls, "extra"] }), /16 reference/);
    assert.throws(() => image25.buildOpenAiImage25FalRequest({ ...base, maskUrl: "mask" }), /reference image/);
  }
});

test("all exposed Fal aspect/resolution combinations meet 2.5 size limits", () => {
  for (const aspectRatio of openAiImageAspectRatios) for (const resolution of ["1K", "2K", "4K"]) {
    const size = sizes.normalizeOpenAiImageSize({ aspectRatio, resolution });
    assert.doesNotThrow(() => image25.buildOpenAiImage25FalRequest({ model: models[0], prompt, size }), `${aspectRatio} ${resolution} ${size}`);
  }
  for (const size of ["1024x1000", "512x512", "4096x4096", "3840x768", "3840x3840"]) {
    assert.throws(() => image25.buildOpenAiImage25FalRequest({ model: models[0], prompt, size }), /dimensions/);
  }
});

test("Fal generation transport routes text and masked edits to the correct variant", async () => {
  const calls = [];
  const helpers = serverHelpers({ ...image25, ...sizes, imageModelNames, normalizeOpenAiImage2Quality,
    subscribeFal: async (endpoint, options) => { calls.push({ endpoint, ...options }); return { data: { images: [{ url: "https://example.com/result.png" }] } }; },
    firstFalImageResult: (data) => data.images[0], uploadImageInputToFal: async (image) => `https://example.com/${image.fileName}`,
    httpError: (status, message) => Object.assign(new Error(message), { status })
  }, ["generateFalOpenAiImage2FromInputs", "openAiSizeToFalImageSize", "promptWithReferenceLabels"]);
  for (const model of [...models, imageModelNames.openAiImage2]) {
    for (const edit of [false, true]) {
      const result = await helpers.generateFalOpenAiImage2FromInputs({ model, prompt, aspectRatio: "16:9", resolution: "2K", quality: "xhigh", background: "transparent",
        imageInputs: edit ? [{ fileName: "base.png", label: "@Park" }] : [], editMaskInput: edit ? { fileName: "mask.png" } : null });
      const call = calls.at(-1);
      const variant = image25.openAiImage25Variant(model);
      assert.equal(call.endpoint, variant ? `openai/gpt-image-2.5/${variant}/${edit ? "edit" : "text-to-image"}` : `openai/gpt-image-2${edit ? "/edit" : ""}`);
      assert.equal(result.quality, variant ? "xhigh" : "high");
      if (edit) {
        assert.match(call.input.prompt, /@Park/);
        assert.deepEqual(call.input.image_urls, ["https://example.com/base.png"]);
        assert.equal(call.input.mask_url, "https://example.com/mask.png");
      }
    }
  }
});

test("Krea sends only supported launch fields with 10 references intact", () => {
  const referenceUrls = Array.from({ length: 10 }, (_, i) => `https://example.com/${i}.png`);
  for (const modelName of models) {
    const variant = image25.openAiImage25Variant(modelName);
    assert.equal(kreaEndpointForModel("image", modelName), `/generate/image/openai/gpt-image-2.5-${variant}`);
    for (const aspectRatio of image25.openAiImage25KreaAspectRatios) {
      const input = buildKreaImageInput({ modelName, prompt, referenceUrls, aspectRatio, resolution: "1K", quality: "max" });
      assert.deepEqual(input, { prompt, image_urls: referenceUrls, aspect_ratio: aspectRatio, resolution: "1K", quality: "max", ...(variant === "flare" ? { background: "auto" } : {}) });
    }
    const base = { model: modelName, resolution: "1K", aspectRatio: "1:1" };
    for (const invalid of [{ resolution: "4K" }, { aspectRatio: "16:9" }, { referenceCount: 11 }, { editMaskDataUrl: "mask" }]) {
      assert.throws(() => image25.validateOpenAiImage25KreaRequest({ ...base, ...invalid }), { status: 400 });
    }
  }
  assert.throws(() => buildKreaImageInput({ modelName: models[0], prompt, resolution: "1K", aspectRatio: "1:1", background: "transparent" }), /background/);
  assert.equal(buildKreaImageInput({ modelName: models[1], prompt, resolution: "1K", aspectRatio: "1:1", background: "transparent" }).background, "transparent");
});

test("Krea selection normalizes sizes and unsupported backgrounds without reducing quality", () => {
  assert.deepEqual(image25.openAiImage25KreaSelection({ model: models[0], aspectRatio: "9:16", resolution: "4K", quality: "max", background: "transparent" }),
    { aspectRatio: "2:3", resolution: "1K", quality: "max", background: "auto" });
  assert.equal(image25.openAiImage25KreaSelection({ aspectRatio: "Auto" }).aspectRatio, "Auto");
  assert.equal(image25.openAiImage25KreaSelection({ aspectRatio: "21:9" }).aspectRatio, "3:2");
});

test("Krea transport records the variant and adapts Auto, rejecting invalid requests before upload", async () => {
  const calls = [], uploads = [], history = [];
  const { runKreaImageModel } = serverHelpers({ ...image25, imageModelNames, normalizeOpenAiImage2Quality,
    process: { env: { KREA_API_KEY: "test-only-not-a-key" } }, kreaEndpointForModel, normalizeKreaImageResolution, buildKreaImageInput,
    uploadLocalOutputToKrea: async (url) => { uploads.push(url); return `https://example.com${url}`; },
    cleanImagePromptLabel: (label) => label, safePathSegment: (name) => name,
    runKreaGeneration: async (request) => { calls.push(request); return { requestId: "job", job: {} }; },
    extractKreaJobResultUrl: () => "https://example.com/result.png",
    downloadImage: async () => ({ publicPath: "/outputs/full.png", thumbnailPublicPath: "/outputs/thumb.jpg" }),
    appendHistory: async (row) => history.push(row), projectFromBody: () => ({}), nodeFromBody: () => ({})
  }, ["runKreaImageModel", "promptWithReferenceLabels"]);
  for (const model of models) {
    const selectedModel = { displayName: model };
    const options = { prompt, selectedModel, imagePromptUrls: ["/uploads/base.png"], imagePromptLabels: ["@Park"], cleanReferenceLabels: ["@Park"], aspectRatio: "16:9", requestedAspectRatio: "Auto" };
    const req = { body: { model, resolution: "1K", aspectRatio: "16:9", requestedAspectRatio: "Auto", quality: "max" } };
    const result = await runKreaImageModel(req, { json: (value) => value }, options);
    assert.equal(result.image.localUrl, "/outputs/full.png");
    assert.equal(result.cost.amountUsd, null);
    assert.equal(history.at(-1).modelName, model);
    assert.equal(history.at(-1).settings.quality, "max");
    assert.equal(calls.at(-1).input.aspect_ratio, "3:2");
    assert.match(calls.at(-1).input.prompt, /@Park/);
    const before = [calls.length, uploads.length];
    await assert.rejects(runKreaImageModel({ body: { ...req.body, resolution: "4K" } }, {}, options), /1K/);
    await assert.rejects(runKreaImageModel(req, {}, { ...options, requestedAspectRatio: "16:9" }), /1K/);
    await assert.rejects(runKreaImageModel({ body: { ...req.body, editMaskDataUrl: "mask" } }, {}, options), /masks/);
    assert.deepEqual([calls.length, uploads.length], before);
  }
});

test("2.5 pricing is unknown, never legacy Image 2 pricing or a free Newt run", () => {
  for (const model of models) for (const provider of ["fal", "krea"]) {
    const estimate = estimateImageRunCost({ model, provider, batchCount: 4, quality: "max" });
    assert.equal(estimate, null);
    assert.equal(image25.openAiImage25Cost({ model, provider }).amountUsd, null);
    assert.throws(() => reserveMyNewtCost({ spent: 0, settings: { budget: 5 } }, "run", estimate, model), /No reliable price/);
  }
  assert.ok(estimateImageRunCost({ model: "OpenAI Image 2" }) > 0);
  for (const variant of ["sunburst", "flare"]) {
    assert.ok(falPricingEndpoints.includes(`openai/gpt-image-2.5/${variant}/edit`));
    assert.ok(kreaPricingModels.some(([endpoint]) => endpoint.endsWith(`gpt-image-2.5-${variant}`)));
  }
});

test("batched Image Model runner preserves 2.5 settings, labels and full-resolution results", async (t) => {
  const mock = t.mock.method(nodeApi, "generateImage", async () => ({ response: { ok: true }, data: { image: { localUrl: "/outputs/full.png", thumbnailUrl: "/outputs/thumb.jpg" }, cost: image25.openAiImage25Cost() } }));
  const node = { id: "image", data: { title: "Edit", model: models[0], aspectRatio: "Auto", resolution: "2K", quality: "max", background: "transparent" } };
  for (let index = 0; index < 4; index++) {
    const [result] = await runImageModelGeneration({ node, prompt, aspectRatio: "16:9", imagePromptItems: [{ url: "/uploads/park.png", label: "@Park" }], index });
    assert.equal(result.url, "/outputs/full.png");
    assert.equal(result.cost.amountUsd, null);
    assert.equal(result.label, `Image ${index + 1}`);
  }
  assert.equal(mock.mock.callCount(), 4);
  for (const { arguments: [body] } of mock.mock.calls) {
    assert.equal(body.model, models[0]);
    assert.equal(body.quality, "max");
    assert.equal(body.background, "transparent");
    assert.equal(body.requestedAspectRatio, "Auto");
    assert.deepEqual(body.imagePromptLabels, ["@Park"]);
  }
});
