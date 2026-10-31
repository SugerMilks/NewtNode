import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { nanoBanana21ModelName as model, nanoBanana21FalEditEndpoint as endpoint, buildNanoBanana21Input } from "../src/nanoBanana21.js";
import { imageEditSize } from "../src/imageEdit.js";
import { prepareImageEdit, finishImageEdit, generateFalImageEdit } from "../server/image-edit.js";
import { registerImageEditRoutes } from "../server/routes/imageEdit.js";
import { createSingleSubmissionFalClient } from "../server/fal-single-submission.js";
import { nodeApi } from "../src/api/newtApi.js";

const solid = (color) => sharp({ create: { width: 4, height: 2, channels: 4, background: color } }).png().toBuffer();
const rgba = buffer => sharp(buffer).ensureAlpha().raw().toBuffer();
async function fixture() {
  const source = await solid({ r: 20, g: 40, b: 60, alpha: .5 });
  const drawing = await solid("#00000000");
  const pixels = Buffer.alloc(32, 255);
  [0, 0, 128, 255, 0, 0, 128, 255].forEach((alpha, i) => { pixels[i * 4 + 3] = alpha; });
  const selection = await sharp(pixels, { raw: { width: 4, height: 2, channels: 4 } }).png().toBuffer();
  return { source, drawing, selection, generated: await solid("#ff0000") };
}

test("Nano Banana edit sizing supports source aspect without changing normal generation validation", () => {
  for (const [width, height] of [[701, 519], [8000, 1000], [1000, 8000]]) assert.deepEqual(imageEditSize(width, height, model), { width, height });
  assert.throws(() => imageEditSize(9000, 1000, model), /1:8/);
  assert.throws(() => imageEditSize(6001, 4000, model), /24 megapixels/);
  assert.equal(buildNanoBanana21Input({ prompt: "Edit source", images: ["source"], aspectRatio: "auto" }).aspect_ratio, "auto");
  assert.throws(() => buildNanoBanana21Input({ prompt: "Edit source", images: [], aspectRatio: "auto" }), /aspect ratio/);
  assert.throws(() => buildNanoBanana21Input({ prompt: "Edit source", images: ["source"], aspectRatio: "auto", provider: "krea" }), /aspect ratio/);
});

test("Nano Banana selection is a separate visual guide; protected RGBA and soft edges survive local compositing", async () => {
  const data = await fixture();
  for (const drawing of [undefined, await solid("#ff000080")]) {
    const prepared = await prepareImageEdit({ ...data, drawing, model, prompt: "Change the selection" });
    assert.equal(prepared.mask, null);
    assert.equal(prepared.images.length, drawing ? 3 : 2);
    assert.deepEqual(await rgba(prepared.images[0]), await rgba(data.source));
    assert.match(prepared.submittedPrompt, new RegExp(`Image ${drawing ? 3 : 2} is a black-and-white selection guide`));
    assert.match(prepared.submittedPrompt, /White indicates the area to edit; black indicates protected/);
    assert.doesNotMatch(prepared.submittedPrompt, /provided edit mask|transparent area/);
    const guide = await rgba(prepared.images.at(-1));
    assert.deepEqual([...guide.subarray(0, 4)], [0, 0, 0, 255]);
    assert.deepEqual([...guide.subarray(12, 16)], [255, 255, 255, 255]);
    const before = await rgba(data.source), result = await finishImageEdit(prepared, data.generated), after = await rgba(result);
    assert.deepEqual(after.subarray(0, 8), before.subarray(0, 8));
    assert.deepEqual(after.subarray(16, 24), before.subarray(16, 24));
    assert.ok(after[8] > before[8] && after[8] < 255);
    assert.deepEqual([...after.subarray(12, 16)], [255, 0, 0, 255]);
    assert.equal((await sharp(result).metadata()).width, 4);
  }
});

test("Nano Banana supports unmasked edits, guided edits, blank sketches and removal without an API mask", async () => {
  const data = await fixture();
  const ordinary = await prepareImageEdit({ source: data.source, model, prompt: "Warm the lighting" });
  assert.equal(ordinary.images.length, 1);
  const annotated = await prepareImageEdit({ source: data.source, drawing: data.selection, model, prompt: "Use the marks" });
  assert.equal(annotated.images.length, 2);
  assert.match(annotated.submittedPrompt, /Image 2 shows annotations/);
  const sketch = await prepareImageEdit({ source: data.source, drawing: data.selection, model, mode: "sketch", blank: true });
  assert.equal(sketch.images.length, 1);
  assert.deepEqual([...(await rgba(sketch.images[0])).subarray(0, 4)], [255, 255, 255, 255]);
  const remove = await prepareImageEdit({ ...data, model, mode: "remove" });
  assert.equal(remove.images.length, 2);
  assert.match(remove.submittedPrompt, /Remove the selected content/);
  await assert.rejects(prepareImageEdit({ source: data.source, model, mode: "remove" }), /Select the area/);
});

test("Fal receives ordered images, auto aspect, high thinking and selected resolution, never unsupported quality or mask", async () => {
  const data = await fixture(), prepared = await prepareImageEdit({ ...data, model, prompt: "Warm the selection" });
  for (const resolution of ["1K", "2K", "4K"]) {
    const uploads = [], submissions = [];
    const result = await generateFalImageEdit({ ...prepared, prompt: prepared.submittedPrompt, model, resolution }, {
      uploadImage: async image => { uploads.push(image); return `https://fixture.invalid/${uploads.length}.png`; },
      subscribe: async (name, options) => { submissions.push({ name, ...options }); return { data: { images: [{ url: "fixture-result" }] } }; },
      firstImage: data => data.images[0]
    });
    assert.equal(result.endpoint, endpoint);
    assert.deepEqual(uploads.map(image => image.buffer), prepared.images);
    assert.equal(submissions.length, 1);
    assert.deepEqual(submissions[0].input, { prompt: prepared.submittedPrompt, image_urls: ["https://fixture.invalid/1.png", "https://fixture.invalid/2.png"],
      resolution, aspect_ratio: "auto", thinking_level: "high", num_images: 1, output_format: "png", limit_generations: true });
  }
  for (const invalid of [{ images: [] }, { resolution: "8K" }, { mask: data.selection }, { prompt: "x".repeat(50001) }]) {
    await assert.rejects(generateFalImageEdit({ model, prompt: "Edit this", images: [data.source], ...invalid }, {
      uploadImage: () => assert.fail("Invalid request uploaded"), subscribe: () => assert.fail("Invalid request submitted")
    }));
  }
});

async function editor(overrides = {}) {
  const data = await fixture(), calls = [], histories = [], saves = [], reads = [];
  let handler;
  registerImageEditRoutes({ post: (_path, ...handlers) => { handler = handlers.at(-1); } }, {
    getProvider: () => "fal", readSource: async url => { reads.push(url); return { buffer: data.source }; },
    generate: async request => { calls.push(request); return { endpoint, remoteImage: { url: "fixture-result" } }; },
    readGenerated: async () => data.generated,
    save: async (req, buffer) => { saves.push({ req, buffer }); return { url: "/workflow-assets/fixture/edit.png", fileName: "edit.png" }; },
    recordHistory: async item => histories.push(item),
    sendError: (res, error) => res.status(error.status || 500).json({ error: error.message }), ...overrides
  });
  async function post(changes = {}, layers = {}) {
    const response = { status: 200 };
    await handler({ body: { model, sourceUrl: "/uploads/fixture.png", requestId: randomUUID(), prompt: "Warm the selection", resolution: "4K", projectId: "test",
      workflowPackagePath: "/fixture/project", ...changes }, files: Object.fromEntries(Object.entries(layers).map(([key, buffer]) => [key, [{ buffer }]])) },
    { status(code) { response.status = code; return this; }, json(body) { response.body = body; } });
    return response;
  }
  return { ...data, calls, reads, histories, saves, post };
}

test("Nano Banana route deduplicates edits and records native output, selection, resolution and honest cost", async () => {
  const state = await editor(), requestId = randomUUID();
  const response = await state.post({ requestId }, { selection: state.selection });
  assert.equal(response.status, 200);
  assert.deepEqual(await state.post({ requestId }, { selection: state.selection }), response);
  assert.equal(state.calls.length, 1); assert.equal(state.saves.length, 1);
  assert.equal(state.calls[0].resolution, "4K"); assert.equal(state.calls[0].quality, undefined);
  assert.equal(state.calls[0].mask, null); assert.equal(state.calls[0].images.length, 2);
  assert.equal(response.body.item.cost.amountUsd, null); assert.equal(response.body.item.cost.model, model);
  assert.equal(response.body.item.cost.endpoint, endpoint);
  assert.equal(response.body.item.width, 4); assert.equal(response.body.item.height, 2);
  assert.equal(state.saves[0].req.body.workflowPackagePath, "/fixture/project");
  assert.equal(state.histories[0].settings.maskedEdit, true);
  assert.equal(state.histories[0].settings.resolution, "4K");
  assert.equal(state.histories[0].settings.thinkingLevel, "high");
  assert.equal(state.histories[0].settings.quality, undefined);
  assert.equal((await state.post({ requestId, resolution: "1K" }, { selection: state.selection })).status, 409);
});

test("unsupported provider and invalid Nano Banana resolution fail before reading media", async () => {
  for (const provider of ["krea", "atlas", ""]) {
    const state = await editor({ getProvider: () => provider });
    assert.equal((await state.post()).status, 400);
    assert.deepEqual(state.reads, []); assert.deepEqual(state.calls, []);
  }
  const state = await editor();
  assert.equal((await state.post({ resolution: "8K" })).status, 400);
  assert.deepEqual(state.reads, []);
});

test("Nano Banana failures are cached and its captured Fal client cannot repeat paid submissions", async () => {
  let runs = 0;
  const state = await editor({ generate: async () => { runs++; throw new Error("Fixture failure"); } });
  const requestId = randomUUID();
  assert.equal((await state.post({ requestId })).status, 500);
  assert.equal((await state.post({ requestId })).status, 500);
  assert.equal(runs, 1);
  let requests = 0;
  const client = createSingleSubmissionFalClient({ credentials: "fixture-key", endpoint, model }, async () => {
    requests++;
    return new Response(JSON.stringify({ detail: "temporarily unavailable" }), { status: 503 });
  });
  for (let i = 0; i < 2; i++) await assert.rejects(client.queue.submit(endpoint, { input: { prompt: "Fixture" } }));
  assert.equal(requests, 1);
});

test("editor client checks the new capability before a paid POST and never replays an interrupted edit", async t => {
  let supported = false, posts = 0;
  t.mock.method(globalThis, "fetch", async (url, options) => {
    if (String(url).endsWith("/api/health")) return new Response(JSON.stringify({ routes: { imageEditingNanoBanana21: supported } }));
    assert.equal(options.method, "POST"); posts++;
    throw new Error("Fixture lost response");
  });
  const form = new FormData(); form.append("model", model);
  await assert.rejects(nodeApi.editImage(form), /Restart NewtNode/);
  assert.equal(posts, 0);
  supported = true;
  await assert.rejects(nodeApi.editImage(form), /not retried/);
  assert.equal(posts, 1);
});
