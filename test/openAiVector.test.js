import test from "node:test";
import assert from "node:assert/strict";
import { openAiVectorModels, openAiVectorAspectRatios, openAiVectorQualities, openAiVectorProviderInput, openAiVectorEndpoint, validateOpenAiVectorRequest } from "../src/openAiVector.js";
import { vectorDefaults, normalizeVectorData, buildVectorRequest, buildVectorBatchRequests, validateVectorRequest, vectorGenerationCost } from "../src/ideogramVector.js";
import { vectorDesignLook } from "../src/vectorDesignLooks.js";
import { ideogramVectorApi } from "../src/api/newtApi.js";

const data = (patch = {}) => ({ ...vectorDefaults(), vectorModel: openAiVectorModels[0], prompt: "A graphic oak emblem", ...patch });

test("new Vector nodes default to Flare while saved choices, legacy references and conversion are preserved", () => {
  assert.equal(vectorDefaults().vectorModel, "OpenAI Image 2.6 Flare");
  assert.equal(normalizeVectorData(vectorDefaults()).vectorModel, "OpenAI Image 2.6 Flare");
  assert.equal(buildVectorRequest({ ...vectorDefaults(), prompt: "A graphic oak emblem" }).model, "OpenAI Image 2.6 Flare");
  assert.equal(normalizeVectorData({}).vectorModel, "Ideogram Vector");
  assert.equal(normalizeVectorData({ ...vectorDefaults(), vectorModel: "Ideogram Vector" }).vectorModel, "Ideogram Vector");
  assert.equal(normalizeVectorData({ ...vectorDefaults(), vectorMode: "vectorize" }).vectorModel, "Ideogram Vector");
  for (const vectorModel of openAiVectorModels) {
    const original = data({ vectorModel, quality: "max", vectorComplexity: "low", vectorBackground: "transparent", seed: "42", resultItems: [{ url: "/outputs/a.png", svgUrl: "/outputs/a.svg", model: "Ideogram Vector" }] });
    const restored = normalizeVectorData(JSON.parse(JSON.stringify(original)), { restore: true });
    assert.equal(restored.vectorModel, vectorModel); assert.equal(restored.quality, "max");
    assert.equal(restored.seed, "42"); assert.equal(restored.resultItems[0].model, "Ideogram Vector");
    const look = vectorDesignLook(restored);
    assert.equal(look.vectorModel, vectorModel); assert.equal(look.vectorComplexity, "low"); assert.equal(look.vectorBackground, "transparent");
    assert.equal(look.prompt, undefined); assert.equal(look.resultItems, undefined);
  }
});

test("GPT vector requests retain brief/design/lettering/palette, not inactive Ideogram seed", () => {
  const requests = buildVectorBatchRequests(data({ designPreset: "logo", lettering: "OAK", palette: "green", seed: "99", batchCount: "6" }));
  assert.equal(requests.length, 6);
  for (const request of requests) {
    assert.match(request.prompt, /^A graphic oak emblem/); assert.match(request.prompt, /clear silhouette/); assert.match(request.prompt, /"OAK"/); assert.match(request.prompt, /Color direction: green/);
    assert.equal(request.seed, undefined); assert.equal(request.batchCount, undefined);
    assert.deepEqual(validateVectorRequest(request), request);
    const input = openAiVectorProviderInput(request);
    assert.equal(input.output_format, "svg"); assert.equal(input.num_images, 1); assert.equal(input.sync_mode, false);
    assert.equal(input.svg_model, "gpt-6-astra"); assert.equal(input.reasoning_effort, "high");
    for (const key of ["seed", "image_urls", "output_compression", "frame_count", "frame_duration_ms", "stream"]) assert.equal(input[key], undefined);
  }
});

test("every GPT vector ratio produces exact bounded dimensions on the documented 16px grid", () => {
  for (const model of openAiVectorModels) for (const aspectRatio of openAiVectorAspectRatios) for (const quality of openAiVectorQualities) {
    const input = openAiVectorProviderInput({ model, aspectRatio, quality, prompt: "Logo" });
    assert.equal(input.quality, quality);
    assert.match(openAiVectorEndpoint(model), /openai\/gpt-image-2\.6\/(sunburst|flare)\/text-to-image/);
    if (aspectRatio === "auto") { assert.equal(input.image_size, "auto"); continue; }
    const { width, height } = input.image_size, [w, h] = aspectRatio.split(":").map(Number);
    assert.equal(width / height, w / h);
    assert.equal(width % 16, 0); assert.equal(height % 16, 0);
    assert.ok(width * height >= 655360 && width * height <= 8294400);
    assert.ok(Math.max(width, height) <= 3840 && Math.max(width / height, height / width) <= 3);
  }
});

test("GPT refuses image, board, font and drawing references instead of dropping or reinterpreting them", () => {
  const image = { url: "/uploads/ref.png", label: "Reference" };
  for (const inputs of [{ images: [image] }, { moodBoards: [image] }]) assert.throws(() => buildVectorRequest(data(), inputs), /text-only/);
  for (const key of ["fontReference", "layoutReference"]) {
    assert.throws(() => buildVectorRequest(data({ [key]: { ...image, enabled: true } })), /text-only/);
    assert.equal(buildVectorRequest(data({ [key]: { ...image, enabled: false } })).images.length, 0);
  }
  assert.throws(() => buildVectorRequest(data({ vectorSavedMoodBoards: [image] })), /text-only/);
  assert.throws(() => buildVectorRequest(data({ vectorMode: "vectorize" }), { images: [image] }), /Text to vector only/);
  for (const patch of [{ images: [image] }, { images: "bad" }, { seed: 0 }, { aspectRatio: "4:1" }, { aspectRatio: "1:4" }, { complexity: "max" }, { background: "none" }, { quality: "bad" }, { prompt: "x".repeat(32001) }])
    assert.throws(() => validateOpenAiVectorRequest({ model: openAiVectorModels[0], prompt: "Logo", ...patch }), { status: 400 });
  assert.throws(() => validateVectorRequest({ model: "unsupported", prompt: "Logo" }), /supported Vector model/);
});

test("GPT vector cost stays unknown and never borrows Ideogram prices or becomes free", () => {
  for (const model of openAiVectorModels) {
    const cost = vectorGenerationCost({ model, quality: "low", batchCount: "6" }, { low: .01 });
    assert.equal(cost.amountUsd, null); assert.equal(cost.model, model); assert.match(cost.pricingBasis, /SVG authoring/);
  }
  assert.equal(vectorGenerationCost({ quality: "medium", batchCount: "2" }).amountUsd, .32);
});

test("GPT vector health gating prevents an older server from silently submitting Ideogram", async () => {
  const original = globalThis.fetch, calls = [];
  let enabled = false;
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url, options });
    if (url.endsWith("/api/health")) return new Response(JSON.stringify({ routes: { ideogramVector: true, gptImage26Vector: enabled } }));
    throw new Error("Lost response");
  };
  try {
    const request = buildVectorRequest(data());
    await assert.rejects(ideogramVectorApi.generate(request), error => error.noSubmission === true);
    assert.equal(calls.filter(c => c.options.method === "POST").length, 0);
    enabled = true;
    await assert.rejects(ideogramVectorApi.generate(request), /did not resubmit or cancel/);
    assert.equal(calls.filter(c => c.options.method === "POST").length, 1);
  } finally { globalThis.fetch = original; }
});
