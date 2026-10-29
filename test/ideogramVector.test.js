import test from "node:test";
import assert from "node:assert/strict";
import { vectorDefaults, normalizeVectorData, validateIdeogramVectorRequest, buildVectorRequest, buildVectorBatchRequests, ideogramVectorCost, appendVectorResult, vectorAspectRatios, vectorBatchOptions, normalizeVectorRates } from "../src/ideogramVector.js";
import { ideogramVectorApi } from "../src/api/newtApi.js";

const image = { url: "/uploads/brand/source.png", label: "Source" };
const output = index => ({ url: `/outputs/design/vector-${index}.png`, svgUrl: `/outputs/design/vector-${index}.svg`, type: "image", label: `Vector ${index}`, cost: { amountUsd: 0.16 } });

test("Vector Node renames only missing and legacy default node titles", () => {
  for (const [title, expected] of [[undefined, "Vector Node"], ["", "Vector Node"], ["  ", "Vector Node"],
    ["Vector", "Vector Node"], ["Vector 2", "Vector Node 2"], ["Vector 3 Copy Copy", "Vector Node 3 Copy Copy"],
    ["Vector Node", "Vector Node"], ["Vector Node 2", "Vector Node 2"], ["Vector Logo", "Vector Logo"], ["Brand artwork", "Brand artwork"]]) {
    const original = { title, resultItems: [output(1)], vectorJob: { requestId: "pending", status: "running" } };
    const normalized = normalizeVectorData(original);
    assert.equal(normalized.title, expected);
    assert.equal(normalizeVectorData(normalized).title, expected);
    assert.deepEqual(normalized.vectorJob, original.vectorJob);
    assert.equal(normalized.resultItems[0].svgUrl, original.resultItems[0].svgUrl);
    assert.equal(normalized.resultItems[0].label, "Vector 1");
    assert.equal(original.title, title);
  }
});

test("Vector generation count defaults to one, is bounded to six and survives restoration", () => {
  assert.equal(vectorDefaults().batchCount, "1");
  assert.equal(normalizeVectorData({}).batchCount, "1");
  assert.deepEqual(vectorBatchOptions, ["1", "2", "3", "4", "5", "6"]);
  for (const [value, expected] of [[undefined, "1"], [null, "1"], ["bad", "1"], [Infinity, "1"], [-4, "1"], [0, "1"], [2.9, "2"], ["6", "6"], [30, "6"]]) {
    assert.equal(normalizeVectorData({ batchCount: value }).batchCount, expected);
  }
  const restored = normalizeVectorData(JSON.parse(JSON.stringify({ ...vectorDefaults(), batchCount: "6", resultItems: [output(1)] })), { restore: true });
  assert.equal(restored.batchCount, "6"); assert.equal(restored.resultItems[0].svgUrl, output(1).svgUrl);
});

test("Vector batches snapshot validated requests with independent bounded seeds and references", () => {
  const data = { ...vectorDefaults(), prompt: "An emblem", batchCount: "6", seed: "2147483646" };
  const source = { ...image }, board = { url: "/outputs/mood.png", label: "Look" };
  const requests = buildVectorBatchRequests(data, { images: [source], moodBoards: [board] });
  assert.equal(requests.length, 6);
  assert.deepEqual(requests.map(request => request.seed), [2147483646, 2147483647, 0, 1, 2, 3]);
  data.prompt = "Changed"; source.url = "/uploads/other.png"; board.label = "Changed";
  for (const request of requests) {
    assert.match(request.prompt, /^An emblem/); assert.match(request.prompt, /MOOD BOARD/);
    assert.equal(request.images[0].url, image.url); assert.equal(request.images[1].label, "Look");
    assert.deepEqual(validateIdeogramVectorRequest(request), request, "no batch fields leak into the single-output API");
  }
  requests[0].images[0].label = "Mutated";
  assert.equal(requests[1].images[0].label, "Source");
  assert.equal(buildVectorBatchRequests({ ...data, seed: "", batchCount: "2" }).every(request => !("seed" in request)), true);
  assert.throws(() => buildVectorBatchRequests({ ...data, seed: "bad" }), /Seed/);
  const converted = buildVectorBatchRequests({ ...data, vectorMode: "vectorize", seed: "bad", batchCount: "3" }, { images: [image] });
  assert.equal(converted.length, 3);
  for (const request of converted) assert.deepEqual(request, { mode: "vectorize", vectorizeMode: "default", images: [image] });
});

test("Vector batch estimates multiply only the run total and preserve unknown pricing", () => {
  assert.equal(ideogramVectorCost({ batchCount: "6" }).amountUsd, .96);
  assert.equal(ideogramVectorCost({ quality: "high", referenceCount: 1, batchCount: "3" }).amountUsd, .96);
  assert.equal(ideogramVectorCost({ mode: "vectorize", batchCount: "2" }).amountUsd, .20);
  assert.equal(ideogramVectorCost({ batchCount: "6" }, {}).amountUsd, null);
  assert.equal(ideogramVectorCost({ batchCount: "6" }, { medium: 0 }).amountUsd, 0);
  assert.match(ideogramVectorCost({ batchCount: "6" }).pricingBasis, /^6 SVGs/);
  assert.equal(ideogramVectorCost(buildVectorBatchRequests({ ...vectorDefaults(), prompt: "Mark", batchCount: "6" })[0]).amountUsd, .16, "History records each individual request");
});

test("vector defaults and mode-specific requests preserve authored guidance and seed zero", () => {
  const d = { ...vectorDefaults(), prompt: "A newt monogram", designPreset: "logo", lettering: "NEWT", palette: "navy and coral", seed: "0" };
  const request = buildVectorRequest(d, { images: [image] });
  assert.equal(request.mode, "generate"); assert.equal(request.quality, "medium"); assert.equal(request.seed, 0);
  assert.match(request.prompt, /^A newt monogram/); assert.match(request.prompt, /clear silhouette/); assert.match(request.prompt, /"NEWT"/); assert.match(request.prompt, /navy and coral/);
  assert.equal(request.images[0].label, "Source");
  const conversion = buildVectorRequest({ ...d, vectorMode: "vectorize", vectorizeMode: "simple", seed: "invalid" }, { images: [image] });
  assert.deepEqual(conversion, { mode: "vectorize", vectorizeMode: "simple", images: [image] });
  assert.equal(vectorAspectRatios.length, 18);
});

test("Mood Boards supply ordered look-only direction without a Style input or extra API fields", () => {
  const board = { url: "/outputs/mood.png", label: "Graphic palette" };
  const data = { ...vectorDefaults(), prompt: "A geometric emblem", lettering: "NEWT", palette: "navy", quality: "high" };
  const request = buildVectorRequest(data, { images: [image], moodBoards: [board] });
  assert.deepEqual(request.images, [image, board]);
  assert.match(request.prompt, /Reference image 1: SUBJECT \/ CONTENT/);
  assert.match(request.prompt, /Reference image 2: MOOD BOARD - visual style only/);
  assert.match(request.prompt, /Do not copy the mood board's subjects/);
  assert.match(request.prompt, /explicit palette and subject references take priority/);
  assert.equal(request.moodBoards, undefined);
  assert.equal(ideogramVectorCost(request).amountUsd, .32);
  assert.deepEqual(validateIdeogramVectorRequest(request), request, "existing backend schema accepts the complete request unchanged");
  const boardOnly = buildVectorRequest(data, { moodBoards: [board] });
  assert.match(boardOnly.prompt, /Reference image 1: MOOD BOARD/);
  assert.equal(boardOnly.images.length, 1);
});

test("Mood Boards share reference and prompt limits without silently truncating or blocking conversion", () => {
  const data = { ...vectorDefaults(), prompt: "An emblem" };
  const boards = [{ url: "/outputs/mood.png", label: "Look" }];
  assert.equal(buildVectorRequest(data, { images: Array(4).fill(image), moodBoards: boards }).images.length, 5);
  assert.throws(() => buildVectorRequest(data, { images: Array(5).fill(image), moodBoards: boards }), /five/);
  assert.throws(() => buildVectorRequest(data, { moodBoards: [{ url: "" }] }), /local image/);
  assert.throws(() => buildVectorRequest({ ...data, prompt: "x".repeat(9400) }, { moodBoards: boards }), /9,500/);
  const conversion = buildVectorRequest({ ...data, vectorMode: "vectorize" }, { images: [image], moodBoards: [{ url: "" }] });
  assert.deepEqual(conversion, { mode: "vectorize", vectorizeMode: "default", images: [image] });
  const legacy = buildVectorRequest(data, { images: [{ ...boards[0], role: "moodBoard" }, image] });
  assert.match(legacy.prompt, /Reference image 1: MOOD BOARD/);
  assert.match(legacy.prompt, /Reference image 2: SUBJECT \/ CONTENT/);
  assert.equal(legacy.images[0].role, undefined, "roles become prompt guidance, not invented provider fields");
});

test("validation rejects invalid and incomplete requests before any submission", () => {
  const base = { mode: "generate", prompt: "Graphic", images: [] };
  assert.throws(() => buildVectorRequest({ ...vectorDefaults(), designPreset: "logo" }), /design brief/);
  assert.throws(() => validateIdeogramVectorRequest({ ...base, mode: "edit" }), /Text to vector/);
  assert.throws(() => validateIdeogramVectorRequest({ ...base, quality: "ultra" }), /quality/);
  assert.throws(() => validateIdeogramVectorRequest({ ...base, aspectRatio: "21:9" }), /aspect ratio/);
  for (const seed of [-1, 2147483648, 0.2, "NaN", true, [], " "]) assert.throws(() => validateIdeogramVectorRequest({ ...base, seed }), /Seed/);
  assert.throws(() => validateIdeogramVectorRequest({ ...base, images: Array(6).fill(image) }), /five/);
  assert.throws(() => validateIdeogramVectorRequest({ ...base, images: [{ url: "https://example.com/client.png" }] }), /local image/);
  assert.throws(() => validateIdeogramVectorRequest({ ...base, images: [{ url: "" }] }), /local image/);
  assert.throws(() => validateIdeogramVectorRequest({ mode: "vectorize", images: [] }), /exactly one/);
  assert.throws(() => validateIdeogramVectorRequest({ mode: "vectorize", images: [image], vectorizeMode: "detailed" }), /Standard or Simple/);
  assert.equal(validateIdeogramVectorRequest({ ...base, prompt: "😀".repeat(9500) }).prompt.length, 19000);
  assert.throws(() => validateIdeogramVectorRequest({ ...base, prompt: "x".repeat(9501) }), /9,500/);
  assert.throws(() => buildVectorRequest({ ...vectorDefaults(), prompt: "x".repeat(9490), designPreset: "logo" }), /9,500/);
});

test("per-output costs match quality, reference mode and unknown overrides", () => {
  assert.equal(ideogramVectorCost({ quality: "low" }).amountUsd, 0.13);
  assert.equal(ideogramVectorCost({ quality: "medium", images: [image] }).amountUsd, 0.16);
  assert.equal(ideogramVectorCost({ quality: "high" }).amountUsd, 0.20);
  assert.equal(ideogramVectorCost({ quality: "high", referenceCount: 1 }).amountUsd, 0.32);
  assert.equal(ideogramVectorCost({ mode: "vectorize" }).amountUsd, 0.10);
  assert.equal(ideogramVectorCost({ quality: "high" }, {}).amountUsd, null);
  const rates = normalizeVectorRates({ low: "0.13", medium: -1, high: 0.26, highReference: Infinity, vectorize: null });
  assert.deepEqual(rates, { low: null, medium: null, high: 0.26, highReference: null, vectorize: null });
  assert.equal(ideogramVectorCost({ quality: "high" }, rates).amountUsd, 0.26);
  assert.equal(ideogramVectorCost({ quality: "high" }, rates).pricingSource, "local-configuration");
  assert.equal(ideogramVectorCost({ quality: "low" }, rates).amountUsd, null);
});

test("results deduplicate recovery, preserve selection and round-trip editable URLs", () => {
  const first = appendVectorResult(vectorDefaults(), output(1));
  const second = appendVectorResult(first, output(2), { selectNew: false });
  assert.equal(second.resultItems.length, 2); assert.equal(second.resultUrl, output(1).url);
  const duplicate = appendVectorResult(second, output(2));
  assert.equal(duplicate.resultItems.length, 2); assert.equal(duplicate.resultUrl, output(2).url);
  const restored = normalizeVectorData(JSON.parse(JSON.stringify({ ...duplicate, custom: "keep", status: "running", vectorJob: { requestId: "id", status: "submitting" } })), { restore: true });
  assert.equal(restored.vectorJob.status, "uncertain"); assert.equal(restored.custom, "keep");
  assert.equal(restored.resultItems[1].svgUrl, output(2).svgUrl); assert.equal(restored.resultItems[1].cost.amountUsd, 0.16);
  assert.throws(() => appendVectorResult(first, { url: "/outputs/a.png" }), /SVG and PNG pair/);
});

test("client gates unsupported backend and never repeats an interrupted paid request", async () => {
  const previousFetch = globalThis.fetch;
  const calls = [];
  try {
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/api/health")) return new Response(JSON.stringify({ routes: { ideogramVector: false } }));
      throw new Error("Must not submit");
    };
    await assert.rejects(ideogramVectorApi.generate({ requestId: "mock" }), error => error.noSubmission === true);
    assert.equal(calls.length, 1);
    calls.length = 0;
    globalThis.fetch = async (url, options = {}) => {
      calls.push({ url, options });
      if (url.endsWith("/api/health")) return new Response(JSON.stringify({ routes: { ideogramVector: true } }));
      throw new Error("lost response");
    };
    await assert.rejects(ideogramVectorApi.generate({ requestId: "mock" }), /did not resubmit or cancel/);
    assert.equal(calls.filter(call => call.options.method === "POST").length, 1);
    calls.length = 0;
    const controller = new AbortController(); controller.abort();
    await assert.rejects(ideogramVectorApi.generate({ requestId: "mock" }, { signal: controller.signal }), { name: "AbortError" });
    assert.equal(calls.filter(call => call.options.method === "POST").length, 0);
  } finally { globalThis.fetch = previousFetch; }
});
