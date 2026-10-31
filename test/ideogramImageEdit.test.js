import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { ideogramImageEditModel as model, ideogramImageEditEndpoint, buildIdeogramImageEditFalRequest, ideogramImageEditCost,
  ideogramImageEditQualityOptions, ideogramImageEditPrecisionOptions } from "../src/ideogramImageEdit.js";
import { openAiImage25Models } from "../src/openAiImage25.js";
import { nanoBanana21ModelName, nanoBanana21FalEditEndpoint } from "../src/nanoBanana21.js";
import { imageEditSize, buildImageEditPrompt } from "../src/imageEdit.js";
import { prepareImageEdit, finishImageEdit, generateFalImageEdit, createIdeogramImageEditClient } from "../server/image-edit.js";
import { registerImageEditRoutes } from "../server/routes/imageEdit.js";

const solid = (width, height, background) => sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
const rgba = (buffer) => sharp(buffer).ensureAlpha().raw().toBuffer();
const selectionFromAlpha = (alpha, width, height) => {
  const data = Buffer.alloc(width * height * 4, 255);
  alpha.forEach((value, index) => { data[index * 4 + 3] = value; });
  return sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer();
};

function transport(overrides = {}) {
  const uploads = [], submissions = [];
  return { uploads, submissions, dependencies: {
    uploadImage: async (image, index) => { uploads.push({ image, index }); return `https://fixture.invalid/${index}.png`; },
    subscribe: async (endpoint, options, context) => { submissions.push({ endpoint, options, context }); return { data: { images: [{ url: "https://fixture.invalid/result.png" }], seed: 0 } }; },
    firstImage: (data) => data?.images?.[0], ...overrides
  } };
}

async function editor(overrides = {}) {
  const source = await solid(6, 2, { r: 20, g: 40, b: 60, alpha: .8 });
  const generated = await solid(3, 1, "#ff0000");
  const reads = [], calls = [], saves = [], histories = [];
  let handler;
  registerImageEditRoutes({ post: (_path, ...handlers) => { handler = handlers.at(-1); } }, {
    limiter: (_req, _res, next) => next(), getProvider: () => "fal",
    readSource: async (url) => { reads.push(url); return { buffer: source }; },
    generate: async (request) => { calls.push(request); return { endpoint: ideogramImageEditEndpoint, seed: 123, remoteImage: { url: "fixture-result" } }; },
    readGenerated: async () => generated,
    save: async (req, buffer) => { saves.push({ body: req.body, buffer }); return { url: "/workflow-assets/fixture/outputs/edit.png", fileName: "edit.png" }; },
    recordHistory: async (entry) => histories.push(entry),
    sendError: (res, error) => res.status(error.status || 500).json({ error: error.message }), ...overrides
  });
  const post = async (changes = {}, layers = {}) => {
    const result = { status: 200, body: null };
    await handler({ body: { model, sourceUrl: "/uploads/fixture.png", requestId: randomUUID(), mode: "edit", prompt: "Make the jacket red", quality: "high", editPrecision: "regular",
      projectId: "fixture-project", projectName: "Fixture", nodeId: "fixture-node", workflowPackagePath: "/fixture/workflow", ...changes },
      files: Object.fromEntries(Object.entries(layers).map(([name, buffer]) => [name, [{ buffer }]]))
    }, { status(value) { result.status = value; return this; }, json(value) { result.body = value; } });
    return result;
  };
  return { source, reads, calls, saves, histories, post };
}

test("Ideogram maps primary source, guide and mask to the Fal edit contract for every quality and precision", () => {
  for (const quality of ideogramImageEditQualityOptions) for (const editPrecision of ideogramImageEditPrecisionOptions) {
    const request = buildIdeogramImageEditFalRequest({ prompt: "Edit the jacket", quality, editPrecision, imageUrls: ["source", "guide"], maskUrl: "mask" });
    assert.equal(request.endpoint, "ideogram/v4.5/edit");
    assert.deepEqual(request.input, { prompt: "Edit the jacket", quality, edit_precision: editPrecision,
      image_url: "source", reference_image_urls: ["guide"], mask_url: "mask", image_size: "auto", num_images: 1, sync_mode: false });
  }
  const { input } = buildIdeogramImageEditFalRequest({ prompt: "x", imageUrls: ["source"] });
  assert.equal(input.quality, "high"); assert.equal(input.edit_precision, "regular");
  assert.equal(input.reference_image_urls, undefined); assert.equal(input.mask_url, undefined);
});

test("Ideogram validates complete prompt, reference slots and options without silent normalization", () => {
  const valid = { prompt: "Edit", imageUrls: ["source"] };
  for (const invalid of [{ prompt: "" }, { prompt: " " }, { prompt: "x".repeat(10001) }, { quality: "xhigh" }, { editPrecision: "precise" }, { imageUrls: [] }, { imageUrls: [""] },
    { imageUrls: ["source", "1", "2", "3", "4", "5"] }, { imageUrls: ["source", "1", "2", "3", "4"], maskUrl: "mask" }]) {
    assert.throws(() => buildIdeogramImageEditFalRequest({ ...valid, ...invalid }), { status: 400 });
  }
  assert.doesNotThrow(() => buildIdeogramImageEditFalRequest({ ...valid, prompt: "x".repeat(10000), imageUrls: ["source", "1", "2", "3", "4"] }));
  assert.doesNotThrow(() => buildIdeogramImageEditFalRequest({ ...valid, imageUrls: ["source", "1", "2", "3"], maskUrl: "mask" }));
  const prompt = buildImageEditPrompt({ model, prompt: "Change the marked area", hasDrawing: true, hasSelection: true });
  assert.match(prompt, /guide reference/); assert.match(prompt, /black area/); assert.doesNotMatch(prompt, /transparent area/);
  assert.throws(() => buildImageEditPrompt({ model, prompt: "x".repeat(10000) }), /10,000/);
});

test("Ideogram auto geometry retains native sizes while Sunburst still uses its existing limits", () => {
  for (const [width, height] of [[6, 1], [1000, 6000], [6000, 4000], [701, 519]])
    assert.deepEqual(imageEditSize(width, height, model), { width, height });
  assert.throws(() => imageEditSize(7, 1, model), /1:6/);
  assert.throws(() => imageEditSize(6001, 4000, model), /24 megapixels/);
  assert.throws(() => imageEditSize(6000, 1000), /1:3/);
  assert.deepEqual(imageEditSize(701, 519), imageEditSize(701, 519, openAiImage25Models.sunburst));
});

test("Ideogram masks are opaque black/edit and white/protect with the documented alpha rounding", async () => {
  const source = await solid(4, 1, "#102030"), selection = await selectionFromAlpha([0, 127, 128, 255], 4, 1);
  const prepared = await prepareImageEdit({ source, selection, model, prompt: "Change the selection" });
  assert.deepEqual([...await rgba(prepared.mask)], [255,255,255,255, 255,255,255,255, 0,0,0,255, 0,0,0,255]);
  const metadata = await sharp(prepared.mask).metadata();
  assert.equal(metadata.width, 4); assert.equal(metadata.height, 1); assert.equal(metadata.hasAlpha, false);
  assert.deepEqual(prepared.selection, selection);
});

test("Ideogram rejects invalid masks and dimension mismatches before generation", async () => {
  const source = await solid(4, 1, "#102030");
  for (const alpha of [[255,255,255,255], [1,127,1,127]])
    await assert.rejects(prepareImageEdit({ source, selection: await selectionFromAlpha(alpha, 4, 1), model, prompt: "Change" }), /selected and protected/);
  await assert.rejects(prepareImageEdit({ source, selection: await solid(3, 1, "#fff"), model, prompt: "Change" }), /matching/);
  await assert.rejects(prepareImageEdit({ source, selection: await solid(4, 1, "#00000000"), model, mode: "remove" }), /Select the area/);
});

test("Ideogram compositor restores native dimensions and every unselected RGBA value, including transparent RGB", async () => {
  const before = Buffer.from([20,40,60,0, 30,50,70,64, 40,60,80,128, 50,70,90,255, 60,80,100,255, 70,90,110,255]);
  const source = await sharp(before, { raw: { width: 6, height: 1, channels: 4 } }).png().toBuffer();
  const selection = await selectionFromAlpha([0,0,0,128,255,255], 6, 1);
  const prepared = await prepareImageEdit({ source, selection, model, prompt: "Change" });
  const result = await finishImageEdit(prepared, await solid(3, 1, "#ff0000"));
  const after = await rgba(result), metadata = await sharp(result).metadata();
  assert.equal(metadata.width, 6); assert.equal(metadata.height, 1);
  assert.deepEqual(after.subarray(0, 12), before.subarray(0, 12));
  assert.deepEqual([...after.subarray(16, 24)], [255,0,0,255, 255,0,0,255]);
  assert.ok(after[12] > before[12] && after[12] < 255); // Existing soft selection compositing stays intact.
});

test("Ideogram annotations retain the clean source, while blank sketches submit only the sketch on white", async () => {
  const source = await solid(4, 2, "#123456"), drawing = await selectionFromAlpha([255,0,0,0,0,0,0,0], 4, 2);
  const annotated = await prepareImageEdit({ source, drawing, model, prompt: "Follow the marks" });
  assert.equal(annotated.images.length, 2); assert.deepEqual(await rgba(annotated.images[0]), await rgba(source));
  const blank = await prepareImageEdit({ source, drawing, model, mode: "sketch", blank: true });
  assert.equal(blank.images.length, 1); assert.equal(blank.mask, null);
  assert.deepEqual([...(await rgba(blank.images[0])).subarray(4, 8)], [255,255,255,255]);
});

test("real Fal edit adapter preserves upload roles and result seed without calling a provider", async () => {
  const source = Buffer.from("source"), guide = Buffer.from("guide"), mask = Buffer.from("mask");
  const state = transport();
  const result = await generateFalImageEdit({ model, prompt: "Change", quality: "low", editPrecision: "high", size: "703x514", images: [source, guide], mask }, state.dependencies);
  assert.deepEqual(state.uploads.map((item) => item.image.buffer), [source, guide, mask]);
  assert.deepEqual(state.uploads.map((item) => item.image.fileName), ["edit-reference-1.png", "edit-reference-2.png", "edit-mask.png"]);
  assert.equal(state.submissions.length, 1); assert.equal(state.submissions[0].endpoint, ideogramImageEditEndpoint);
  assert.equal(state.submissions[0].options.input.image_url, "https://fixture.invalid/0.png");
  assert.deepEqual(state.submissions[0].options.input.reference_image_urls, ["https://fixture.invalid/1.png"]);
  assert.equal(state.submissions[0].options.input.mask_url, "https://fixture.invalid/2.png");
  assert.equal(result.seed, 0); assert.equal(result.remoteImage.url, "https://fixture.invalid/result.png");
});

test("Fal transport rejects invalid Ideogram requests before any upload and preserves Sunburst payload", async () => {
  for (const invalid of [{ quality: "max" }, { editPrecision: "precise" }, { prompt: "x".repeat(10001) }, { images: [] },
    { images: Array(5).fill(Buffer.from("image")), mask: Buffer.from("mask") }, { images: [{ length: 25 * 1024 * 1024 + 1 }] }]) {
    const state = transport();
    await assert.rejects(generateFalImageEdit({ model, prompt: "Change", images: [Buffer.from("source")], ...invalid }, state.dependencies));
    assert.equal(state.uploads.length, 0); assert.equal(state.submissions.length, 0);
  }
  const state = transport();
  await generateFalImageEdit({ model: openAiImage25Models.sunburst, prompt: "Change", quality: "max", size: "1024x1024", images: [Buffer.from("source")], mask: Buffer.from("mask") }, state.dependencies);
  assert.equal(state.submissions[0].endpoint, "openai/gpt-image-2.5/sunburst/edit");
  assert.equal(state.submissions[0].options.input.quality, "max");
  assert.deepEqual(state.submissions[0].options.input.image_size, { width: 1024, height: 1024 });
  assert.deepEqual(state.submissions[0].options.input.image_urls, ["https://fixture.invalid/0.png"]);
});

test("SDK retryable failures and timeouts never repeat an outbound Ideogram paid submission", async () => {
  for (const failure of ["503", "timeout"]) {
    let requests = 0;
    const client = createIdeogramImageEditClient("fixture-key", async () => {
      requests++;
      if (failure === "timeout") throw new Error("fixture timeout");
      return new Response(JSON.stringify({ detail: "Fixture temporarily unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
    });
    await assert.rejects(client.queue.submit(ideogramImageEditEndpoint, { input: { prompt: "fixture", image_url: "https://fixture.invalid/source" } }), /Check Fal history/);
    assert.equal(requests, 1);
    await assert.rejects(client.queue.submit(ideogramImageEditEndpoint, { input: { prompt: "fixture", image_url: "https://fixture.invalid/source" } }), /did not resubmit/);
    assert.equal(requests, 1);
  }
});

test("Ideogram request-scoped client retains retryable read-only queue polling", async () => {
  let requests = 0;
  const client = createIdeogramImageEditClient("fixture-key", async (_url, init) => {
    assert.equal(init.method, "GET"); requests++;
    return new Response(JSON.stringify(requests === 1 ? { detail: "temporary" } : { status: "COMPLETED", request_id: "fixture" }),
      { status: requests === 1 ? 503 : 200, headers: { "content-type": "application/json" } });
  });
  const result = await client.queue.status(ideogramImageEditEndpoint, { requestId: "fixture" });
  assert.equal(result.status, "COMPLETED"); assert.equal(requests, 2);
});

test("Ideogram route retains source geometry, workflow persistence, unknown cost and model/precision/seed history", async () => {
  const state = await editor();
  const selection = await selectionFromAlpha([0,0,0,0,0,0,0,255,255,0,0,0], 6, 2);
  const response = await state.post({ editPrecision: "high", quality: "very_low" }, { selection });
  assert.equal(response.status, 200); assert.equal(state.calls[0].model, model); assert.equal(state.calls[0].editPrecision, "high");
  assert.equal(state.calls[0].provider, "fal"); assert.equal(state.calls[0].size, "6x2");
  assert.equal(response.body.item.model, model); assert.equal(response.body.item.editPrecision, "high"); assert.equal(response.body.item.seed, 123);
  assert.equal(response.body.item.width, 6); assert.equal(response.body.item.height, 2);
  assert.equal(response.body.item.cost.amountUsd, null); assert.equal(response.body.item.cost.model, model);
  assert.equal(state.histories[0].modelName, model); assert.equal(state.histories[0].settings.editPrecision, "high");
  assert.equal(state.histories[0].settings.seed, 123); assert.equal(state.histories[0].settings.maskedEdit, true);
  assert.equal(state.histories[0].localImage, response.body.item.url); assert.equal(state.saves[0].body.workflowPackagePath, "/fixture/workflow");
  const before = await rgba(state.source), after = await rgba(state.saves[0].buffer);
  assert.deepEqual(after.subarray(0, 24), before.subarray(0, 24));
});

test("Ideogram route rejects unsupported provider and invalid fields before reading or uploading assets", async () => {
  for (const provider of ["", "atlas", "krea", undefined]) {
    const state = await editor({ getProvider: () => provider });
    const result = await state.post();
    assert.equal(result.status, 400); assert.match(result.body.error, /Enable Fal/);
    assert.equal(state.reads.length, 0); assert.equal(state.calls.length, 0);
  }
  const state = await editor();
  for (const change of [{ model: "unknown" }, { quality: "xhigh" }, { editPrecision: "bad" }, { requestId: "bad" }, { prompt: "" }, { prompt: "x".repeat(10000) }, { mode: "remove", prompt: "" }]) {
    const result = await state.post(change); assert.equal(result.status, 400, JSON.stringify(change).slice(0, 100));
  }
  assert.equal(state.reads.length, 0); assert.equal(state.calls.length, 0);
});

test("Ideogram duplicate requests share one generation and changed model, quality or precision conflicts", async () => {
  const state = await editor(), requestId = randomUUID();
  const [first, duplicate] = await Promise.all([state.post({ requestId }), state.post({ requestId })]);
  assert.equal(first.status, 200); assert.deepEqual(first, duplicate); assert.equal(state.calls.length, 1); assert.equal(state.saves.length, 1);
  for (const change of [{ model: openAiImage25Models.sunburst }, { quality: "low" }, { editPrecision: "high" }])
    assert.equal((await state.post({ requestId, ...change })).status, 409);
  assert.equal(state.calls.length, 1);
});

test("Ideogram failures stay cached and saved output survives a History failure", async () => {
  let calls = 0;
  const state = await editor({ generate: async () => { calls++; throw Object.assign(new Error("Fixture provider failure"), { status: 502 }); } });
  const requestId = randomUUID();
  for (let i = 0; i < 2; i++) assert.equal((await state.post({ requestId })).status, 502);
  assert.equal(calls, 1); assert.equal(state.saves.length, 0);
  const historyFailure = await editor({ recordHistory: async () => { throw new Error("Fixture History failure"); } });
  const response = await historyFailure.post();
  assert.equal(response.status, 200); assert.ok(response.body.item.url); assert.match(response.body.warning, /History/);
  assert.equal(ideogramImageEditCost().amountUsd, null);
});


for (const editModel of [model, nanoBanana21ModelName]) test(`server wiring captures one ${editModel} key for uploads, submission and charge lookup`, async () => {
  const source = readFileSync(new URL("../server/index.js", import.meta.url), "utf8");
  const start = source.indexOf("  generate: async (", source.indexOf("registerImageEditRoutes(app, {"));
  const body = source.slice(start + "  generate: ".length, source.indexOf(",\n  save:", start));
  const process = { env: { FAL_KEY: "fixture-initial-key" } };
  const client = { fixture: true }, observed = [];
  const dependencies = { process, ideogramImageEditModel: model, nanoBanana21ModelName, nanoBanana21FalEditEndpoint, fal: {}, atlasMedia: {}, generateFalImageEdit,
    httpError: (status, message) => Object.assign(new Error(message), { status }),
    createIdeogramImageEditClient: (key) => { observed.push(["client", key]); return client; },
    createSingleSubmissionFalClient: ({ credentials, endpoint, model: selected }) => {
      assert.equal(endpoint, nanoBanana21FalEditEndpoint); assert.equal(selected, nanoBanana21ModelName);
      observed.push(["client", credentials]); return client;
    },
    uploadImageInputToFal: async (_image, _index, uploadClient) => { observed.push(["upload", uploadClient]); process.env.FAL_KEY = "fixture-changed-key"; return "https://fixture.invalid/source.png"; },
    subscribeFal: async (_endpoint, _options, _context, submittedClient, billingKey) => { observed.push(["submit", submittedClient, billingKey]); return { data: { images: [{ url: "https://fixture.invalid/result.png" }] } }; },
    firstFalImageResult: (data) => data.images[0]
  };
  const generate = new Function(...Object.keys(dependencies), `return (${body});`)(...Object.values(dependencies));
  await generate({ provider: "fal", model: editModel, prompt: "Change", images: [Buffer.from("source")] });
  assert.deepEqual(observed, [["client", "fixture-initial-key"], ["upload", client], ["submit", client, "fixture-initial-key"]]);
  process.env.FAL_KEY = "";
  await assert.rejects(generate({ provider: "fal", model: editModel, prompt: "Change", images: [Buffer.from("source")] }), /Enable Fal/);
  assert.equal(observed.length, 3);
});
