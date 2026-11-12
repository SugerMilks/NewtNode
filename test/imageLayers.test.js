import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { layersDefaults, layersNamingInstruction, isLayersNode, validateLayersRequest, layersProviderInput, providerLayerName, providerLayerBounds, validateLayerDocument, layersOutputPatch, normalizeLayersData, moveLayer, layersCost } from "../src/imageLayers.js";
import { createLayersService, publicImageAddress, transformedLayerPixels, placedLayerPixels } from "../server/image-layers.js";
import { resetCopiedNodeRuntime, remapImportedGraph } from "../src/workflowState.js";
import { isRunnableNode } from "../src/nodeRunner.js";

test("Layers is a manual Image utility with small defaults and unknown, never zero, remote cost", () => {
  const node = { type: "utility", data: { utilityMode: "image", utilityImageModel: "Layers" } };
  assert.ok(isLayersNode(node)); assert.equal(isRunnableNode(node), false);
  assert.equal(isLayersNode({ ...node, data: { ...node.data, utilityMode: "video" } }), false);
  assert.equal(layersDefaults.layersLimit, 8); assert.equal(layersCost().amountUsd, null);
});
test("Atlas input contains only documented separation settings", () => {
  const request = validateLayersRequest({ sourceUrl: "/uploads/master.png" });
  assert.deepEqual(layersProviderInput(request, "https://example.com/image.png"), {
    model: "bytedance/seedream-v5.5/layer-decomposition", image: "https://example.com/image.png", prompt: layersNamingInstruction, num_images: 8,
    resolution: "auto", output_format: "png", enable_text_recognition: false, enable_sync_mode: false, enable_base64_output: false
  });
  for (const patch of [{ sourceUrl: "https://example.com/private" }, { limit: 100 }, { limit: 2.2 }, { resolution: "4k" }, { prompt: "x".repeat(4001) }]) assert.throws(() => validateLayersRequest({ ...request, ...patch }));
});
test("Separation requests English metadata without rewriting the user's instructions or image text", () => {
  for (const prompt of ["", "Separate the woman, dress and background.", "x".repeat(4000)]) {
    const request = validateLayersRequest({ sourceUrl: "/uploads/master.png", prompt });
    const input = layersProviderInput(request, "https://example.com/image.png");
    assert.equal(request.prompt, prompt);
    assert.equal(input.prompt, prompt ? `${prompt}\n\n${layersNamingInstruction}` : layersNamingInstruction);
    assert.match(input.prompt, /concise English/);
    assert.match(input.prompt, /metadata only/);
    assert.match(input.prompt, /do not add labels to the image, translate visible text, or change the artwork/);
  }
});
test("Provider names use safe English fallbacks only at separation import", () => {
  assert.equal(providerLayerName({ name: "\u80cc\u666f" }, 0), "Background");
  assert.equal(providerLayerName({ name: "  Woman\n in a dress  " }, 1), "Woman in a dress");
  assert.equal(providerLayerName({ name: "Left cafe\u0301 table" }, 2), "Left caf\u00e9 table");
  for (const name of [undefined, null, {}, 23, "", "  ", "123", "\u5973\u4eba", "Woman \u5973\u4eba", "\u0436\u0435\u043d\u0449\u0438\u043d\u0430"]) {
    assert.equal(providerLayerName({ name }, 3), "Layer 3");
  }
  assert.equal(providerLayerName({ name: "A".repeat(150) }, 1).length, 100);
  const doc = validateLayerDocument({ width: 100, height: 100,
    layers: [{ id: "a", url: "/outputs/a.png", name: "\u5973\u4eba", x: 0, y: 0, width: 100, height: 100 }] });
  assert.equal(doc.layers[0].name, "\u5973\u4eba", "user names and existing documents are not automatically renamed");
});
test("Placement uses base-space bounds, never layer image size or normalized coordinates as pixels", () => {
  assert.deepEqual(providerLayerBounds({ bounding_box: { absolute: [10, 20, 110, 70] } }, 200, 100, 1, 1024, 512), { x: 10, y: 20, width: 100, height: 50 });
  assert.deepEqual(providerLayerBounds({ bounding_box: { normalized: [50, 200, 550, 700] } }, 200, 100, 1), { x: 10, y: 20, width: 100, height: 50 });
  assert.throws(() => providerLayerBounds({}, 200, 100, 1, 1024, 512), /placement/);
  assert.throws(() => providerLayerBounds({ bounding_box: { absolute: [-1, 0, 100, 100] } }, 200, 100, 1));
});
test("Output selection, restore, copy and import preserve documents but never replay jobs", () => {
  const documents = [{ id: "a", layers: [], items: [{ url: "/outputs/a.png" }, { url: "/outputs/b.png" }] }];
  const data = { ...layersOutputPatch(documents, "a", 1), layersJob: { requestId: "pending", status: "running" } };
  assert.equal(data.resultUrl, "/outputs/b.png");
  assert.equal(normalizeLayersData(data, true).layersJob.status, "uncertain");
  assert.equal(resetCopiedNodeRuntime(data).layersJob, null);
  const node = { id: "n", type: "utility", x: 0, y: 0, data: { ...data, utilityMode: "image", utilityImageModel: "Layers" } };
  const imported = remapImportedGraph({ nodes: [node] }).nodes[0];
  assert.equal(imported.data.layersJob, null); assert.deepEqual(imported.data.layersDocuments, documents);
});
test("Raster documents reject unsafe media, duplicate layers and oversized transforms", () => {
  const layer = { id: "one", url: "/outputs/one.png", x: 0, y: 0, width: 10, height: 10, opacity: 1 };
  const doc = { width: 100, height: 100, layers: [layer] };
  assert.equal(validateLayerDocument(doc).layers[0].name, "Layer");
  for (const patch of [{ url: "file:///private.png" }, { x: Infinity }, { width: 999999 }, { opacity: 2 }]) assert.throws(() => validateLayerDocument({ ...doc, layers: [{ ...layer, ...patch }] }));
  assert.throws(() => validateLayerDocument({ ...doc, layers: [layer, layer] }));
  assert.deepEqual(moveLayer([{ id: "a" }, { id: "b" }], "a", "b").map(l => l.id), ["b", "a"]);
  const locked = [{ id: "a", locked: true }, { id: "b" }]; assert.equal(moveLayer(locked, "a", "b"), locked);
});
test("Downloads reject local, private and mapped network destinations", () => {
  for (const address of ["127.0.0.1", "10.0.0.2", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.64.0.1", "::1", "::ffff:127.0.0.1", "0.0.0.0", "224.0.0.1"]) assert.equal(publicImageAddress(address), false, address);
  assert.equal(publicImageAddress("8.8.8.8"), true);
});

test("Rotation is validated, normalized and included in expanded render budgets", () => {
  const doc = { width: 100, height: 100, layers: [{ id: "a", url: "/outputs/a.png", x: 10, y: 20, width: 40, height: 20 }] };
  assert.equal(validateLayerDocument(doc).layers[0].rotation, undefined);
  const rotated = angle => validateLayerDocument({ ...doc, layers: [{ ...doc.layers[0], rotation: angle }] });
  assert.equal(rotated(405).layers[0].rotation, 45); assert.equal(rotated(-390).layers[0].rotation, -30);
  for (const angle of [NaN, Infinity, "45", {}]) assert.throws(() => rotated(angle));
  assert.throws(() => validateLayerDocument({ ...doc, layers: [{ ...doc.layers[0], width: 6000, height: 6000, rotation: 45 }] }), /rotated layer/);
  assert.throws(() => validateLayerDocument({ ...doc, layers: Array.from({ length: 5 }, (_, i) => ({ ...doc.layers[0], id: `${i}`, width: 4000, height: 4000, rotation: 45 })) }), /combined layer/);
});

test("Local rotation resizes first, retains alpha and clips only after rotating around the layer center", async () => {
  const buffer = await sharp({ create: { width: 2, height: 1, channels: 4, background: "red" } }).png().toBuffer();
  const source = { buffer }, layer = { x: -4, y: 10, width: 40, height: 20, opacity: .5, rotation: 90 };
  const pixels = await transformedLayerPixels(source, layer);
  assert.deepEqual([pixels.x, pixels.y, pixels.width, pixels.height], [6, 0, 20, 40]);
  assert.equal(pixels.data[3], 255);
  const placed = await placedLayerPixels(source, layer, 100, 100, pixels);
  assert.deepEqual([placed.left, placed.top], [6, 0]);
  assert.equal((await sharp(placed.input).raw().toBuffer())[3], 128);
  const angled = await transformedLayerPixels(source, { ...layer, rotation: 45 });
  assert.ok(angled.width > 40 && angled.height > 40);
  assert.equal(angled.data[3], 0, "expanded corners remain transparent");
  assert.ok(angled.data.some((n, i) => i % 4 === 3 && n === 255));
  assert.equal(await placedLayerPixels(source, { ...layer, x: 200 }, 100, 100), null);
  const twoColors = await sharp(Buffer.from([255, 0, 0, 255, 0, 0, 255, 255]), { raw: { width: 2, height: 1, channels: 4 } }).png().toBuffer();
  const clockwise = await transformedLayerPixels({ buffer: twoColors }, { x: 0, y: 0, width: 2, height: 1, rotation: 90 });
  assert.deepEqual([...clockwise.data], [255, 0, 0, 255, 0, 0, 255, 255], "clockwise rotation puts the left pixel above the right pixel, matching CSS");
  assert.deepEqual([clockwise.width, clockwise.height], [1, 2]);
});

async function fixture(t, overrides = {}) {
  const directory = await mkdtemp(path.join(tmpdir(), "newtnode-layers-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const base = await sharp({ create: { width: 512, height: 512, channels: 4, background: "#202020" } }).png().toBuffer();
  const foreground = await sharp({ create: { width: 1024, height: 1024, channels: 4, background: "#f00000" } }).png().toBuffer();
  await writeFile(path.join(directory, "master.png"), base);
  let submissions = 0, downloads = 0, outputId = 0, key = "test-key";
  const histories = [];
  const deps = { directory: path.join(directory, "receipts"), getKey: () => key,
    resolveAsset: async url => { if (!url.startsWith("/outputs/") && !url.startsWith("/uploads/")) throw new Error("unmanaged"); return { filePath: path.join(directory, path.basename(url)) }; },
    createTarget: async (_context, kind, extension) => { const fileName = `${++outputId}-${kind}${extension}`; return { filePath: path.join(directory, fileName), publicPath: `/outputs/${fileName}`, fileName }; },
    recordHistory: async entry => { const index = histories.findIndex(item => item.id === entry.id); if (index < 0) histories.push(entry); else histories[index] = entry; },
    readGenerated: async url => { downloads++; return url.endsWith("base") ? base : foreground; },
    client: { upload: async () => "https://example.com/input", submit: async () => { submissions++; return { requestId: "provider-1" }; },
      waitForResult: async () => ({ job: { outputs: ["https://example.com/base", "https://example.com/fg"], layers: [{ z_index: 0 }, { z_index: 1, name: "Subject", bounding_box: { absolute: [100, 100, 200, 200] } }] } }) }, ...overrides };
  const service = createLayersService(deps);
  const body = { requestId: randomUUID(), sourceUrl: "/uploads/master.png", projectId: "p", nodeId: "n", limit: 8 };
  const settle = async () => {
    for (let i = 0; i < 200; i++) {
      const receipt = JSON.parse(await readFile(path.join(deps.directory, `${body.requestId}.json`), "utf8"));
      if (["completed", "uncertain"].includes(receipt.status)) return receipt;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error("Test job never settled");
  };
  return { directory, deps, service, body, settle, histories, submissions: () => submissions, downloads: () => downloads, setKey: value => { key = value; } };
}
test("Separation is submitted once and preserves source, names, positions, PNG alpha and History", async t => {
  const f = await fixture(t); const before = await readFile(path.join(f.directory, "master.png"));
  await Promise.all([f.service.start(f.body), f.service.start(f.body)]);
  const job = await f.settle(); assert.equal(job.status, "completed", job.error);
  assert.equal(f.submissions(), 1); assert.equal(f.downloads(), 2); assert.equal(f.histories.length, 1);
  assert.equal(job.document.layers[1].width, 100); assert.equal(job.document.items[2].label, "Subject");
  const pixels = await sharp(path.join(f.directory, job.document.items[2].fileName)).raw().toBuffer();
  assert.equal(pixels[3], 0); assert.equal(pixels[(150 * 512 + 150) * 4], 240); assert.equal(pixels[(150 * 512 + 150) * 4 + 3], 255);
  assert.deepEqual(await readFile(path.join(f.directory, "master.png")), before);
  await f.service.start(f.body); assert.equal(f.submissions(), 1);
  await assert.rejects(f.service.start({ ...f.body, prompt: "different" }), /different settings/);
  assert.equal(f.histories[0].cost.amountUsd, null);
});
test("Single-layer separation preserves native alpha and opacity, upscales small crops only for submission, and recovers without another paid call", async t => {
  const f = await fixture(t);
  const raw = Buffer.alloc(200 * 120 * 4, 100);
  for (let y = 0; y < 120; y++) for (let x = 0; x < 200; x++) raw[(y * 200 + x) * 4 + 3] = x < 40 ? 0 : x < 100 ? 128 : 255;
  const source = await sharp(raw, { raw: { width: 200, height: 120, channels: 4 } }).png().toBuffer();
  await writeFile(path.join(f.directory, "master.png"), source);
  const upload = f.deps.client.upload, readGenerated = f.deps.readGenerated;
  f.deps.client.upload = async args => { const meta = await sharp(args.buffer).metadata(); assert.ok(meta.width * meta.height >= 262144); return upload(args); };
  let offline = true;
  f.deps.readGenerated = async url => { if (offline && url.endsWith("fg")) throw new Error("offline"); return readGenerated(url); };
  const service = createLayersService(f.deps), body = { ...f.body, layerOnly: true, sourceOpacity: .5 };
  await service.start(body); assert.equal((await f.settle()).status, "uncertain");
  offline = false;
  await createLayersService(f.deps).inspect(body.requestId);
  const job = await f.settle(); assert.equal(job.status, "completed", job.error);
  assert.equal(f.submissions(), 1);
  assert.deepEqual(job.document.layerSeparation, { sourceUrl: body.sourceUrl, sourceOpacity: .5, alphaProtected: true });
  assert.deepEqual([job.document.width, job.document.height], [200, 120]);
  for (const child of job.document.layers) assert.deepEqual([child.x, child.y, child.width, child.height], [0, 0, 200, 120]);
  const composite = await sharp(path.join(f.directory, job.document.items[0].fileName)).ensureAlpha().raw().toBuffer();
  for (let i = 3; i < raw.length; i += 4) assert.ok(Math.abs(composite[i] - raw[i] * .5) <= 2, `alpha ${i}: ${composite[i]}`);
  assert.deepEqual(await readFile(path.join(f.directory, "master.png")), source);
  assert.match(job.submittedPrompt, /isolated layer/);
  assert.deepEqual((await createLayersService(f.deps).inspect(body.requestId)).document, job.document);
  assert.equal(f.submissions(), 1);
});
test("English naming is applied to provider submissions and saved labels without a second API call", async t => {
  const f = await fixture(t);
  const submit = f.deps.client.submit, waitForResult = f.deps.client.waitForResult;
  let sent;
  f.deps.client.submit = async args => { sent = args.input; return submit(args); };
  f.deps.client.waitForResult = async args => {
    const result = await waitForResult(args);
    result.job.layers[1].name = "\u5973\u4eba";
    return result;
  };
  const body = { ...f.body, prompt: "Separate the woman." };
  await f.service.start(body); const job = await f.settle();
  assert.equal(job.status, "completed", job.error);
  assert.equal(sent.prompt, `${body.prompt}\n\n${layersNamingInstruction}`);
  assert.equal(job.request.prompt, body.prompt); assert.equal(job.submittedPrompt, sent.prompt);
  assert.equal(f.histories[0].settings.submittedPrompt, sent.prompt);
  assert.equal(f.histories[0].prompt, body.prompt);
  assert.deepEqual(job.document.layers.map(layer => layer.name), ["Background", "Layer 1"]);
  assert.deepEqual(job.document.items.map(item => item.label), ["Composite", "Background", "Layer 1"]);
  assert.equal(job.remote.layers[1].name, "\u5973\u4eba", "retain original provider data for recovery");
  const edited = structuredClone(job.document); edited.layers[1].name = "My \u5973\u4eba";
  const saved = await f.service.save({ document: edited });
  assert.equal(saved.document.layers[1].name, edited.layers[1].name);
  assert.equal(saved.document.items[2].label, edited.layers[1].name);
  assert.deepEqual((await f.service.inspect(body.requestId)).document, job.document);
  assert.equal(f.submissions(), 1); assert.equal(f.downloads(), 2);
});
test("Partial separation recovery replaces cached non-English provider names without redownloading or resubmitting", async t => {
  const f = await fixture(t);
  const waitForResult = f.deps.client.waitForResult, readGenerated = f.deps.readGenerated;
  f.deps.client.waitForResult = async args => {
    const result = await waitForResult(args);
    result.job.layers[1].name = "\u5973\u4eba";
    result.job.layers.push({ z_index: 2, name: "Table", bounding_box: { absolute: [200, 200, 300, 300] } });
    result.job.outputs.push("https://example.com/third");
    return result;
  };
  f.deps.readGenerated = async url => {
    if (url.endsWith("third")) throw new Error("download offline");
    return readGenerated(url);
  };
  await createLayersService(f.deps).start(f.body);
  const failed = await f.settle(); assert.equal(failed.status, "uncertain");
  assert.equal(failed.savedLayers.length, 2);
  failed.savedLayers[1].name = "\u5973\u4eba";
  await writeFile(path.join(f.deps.directory, `${f.body.requestId}.json`), JSON.stringify(failed));
  f.deps.readGenerated = readGenerated;
  await createLayersService(f.deps).inspect(f.body.requestId);
  const recovered = await f.settle(); assert.equal(recovered.status, "completed", recovered.error);
  assert.deepEqual(recovered.document.layers.map(layer => layer.name), ["Background", "Layer 1", "Table"]);
  assert.deepEqual(recovered.document.layers.slice(0, 2).map(layer => layer.url), failed.savedLayers.map(layer => layer.url));
  assert.equal(f.submissions(), 1); assert.equal(f.downloads(), 3);
});
test("Saving rotated layers preserves edit metadata and publishes matching canvas-sized PNGs", async t => {
  const f = await fixture(t); await f.service.start(f.body); const job = await f.settle();
  const doc = structuredClone(job.document); doc.layers[0].visible = false;
  Object.assign(doc.layers[1], { width: 100, height: 50, rotation: 90 });
  const { document: saved } = await f.service.save({ document: doc });
  assert.equal(saved.layers[1].rotation, 90); assert.equal(f.submissions(), 1);
  const composite = await sharp(path.join(f.directory, saved.items[0].fileName)).raw().toBuffer();
  const layer = await sharp(path.join(f.directory, saved.items[2].fileName)).raw().toBuffer();
  assert.deepEqual(composite, layer); assert.equal(composite[(90 * 512 + 150) * 4 + 3], 255);
  assert.equal(composite[(125 * 512 + 110) * 4 + 3], 0, "old unrotated edge is empty");
  assert.equal(job.document.layers[1].rotation, undefined);
});
test("Saving moved, hidden and translucent layers is local and leaves the earlier version unchanged", async t => {
  const f = await fixture(t); await f.service.start(f.body); const job = await f.settle();
  const doc = structuredClone(job.document); doc.layers[0].visible = false; doc.layers[1].x = -50; doc.layers[1].opacity = .5;
  const { document } = await f.service.save({ document: doc });
  const pixels = await sharp(path.join(f.directory, document.items[0].fileName)).raw().toBuffer();
  assert.equal(pixels[(150 * 512 + 10) * 4 + 3], 128); assert.equal(pixels[(150 * 512 + 60) * 4 + 3], 0);
  assert.equal(job.document.layers[1].x, 100); assert.equal(f.submissions(), 1);
});

test("Saved folder visibility controls the composite without erasing child pixels or visibility", async t => {
  const f = await fixture(t); await f.service.start(f.body); const job = await f.settle();
  const doc = structuredClone(job.document);
  doc.folders = [{ id: "f", name: "Foreground", visible: false, locked: true, collapsed: true }];
  doc.layers[1].folderId = "f";
  const { document } = await f.service.save({ document: doc });
  assert.deepEqual(document.folders, doc.folders);
  assert.equal(document.layers[1].visible, true); assert.equal(document.layers[1].locked, false);
  const composite = await sharp(path.join(f.directory, document.items[0].fileName)).raw().toBuffer();
  const child = await sharp(path.join(f.directory, document.items[2].fileName)).raw().toBuffer();
  const offset = (150 * 512 + 150) * 4;
  assert.deepEqual([...composite.slice(offset, offset + 4)], [32, 32, 32, 255]);
  assert.equal(child[offset], 240); assert.equal(child[offset + 3], 255);
  assert.equal(job.document.folders, undefined); assert.equal(f.submissions(), 1);
});
test("Download failures retain a recoverable receipt; restart and check never generate twice", async t => {
  let fail = true;
  const f = await fixture(t); const real = f.deps.readGenerated;
  f.deps.readGenerated = async url => { if (fail) throw new Error("download offline"); return real(url); };
  const service = createLayersService(f.deps); await service.start(f.body); const failed = await f.settle();
  assert.equal(failed.status, "uncertain"); assert.match(failed.error, /retry saving without generating/);
  assert.equal(f.histories[0].status, "uncertain");
  fail = false; const restored = createLayersService(f.deps);
  await Promise.all([restored.inspect(f.body.requestId), restored.inspect(f.body.requestId)]);
  const job = await f.settle(); assert.equal(job.status, "completed", job.error); assert.equal(f.submissions(), 1);
  assert.equal(f.downloads(), 2); assert.equal(f.histories.length, 1); assert.equal(f.histories[0].status, "completed");
});
test("Uncertain submissions without a provider ID cannot be replayed after restart", async t => {
  let submits = 0;
  const f = await fixture(t, { client: { upload: async () => "https://example.com/input", submit: async () => { submits++; throw new Error("connection lost"); } } });
  await f.service.start(f.body); await f.settle();
  const restored = createLayersService(f.deps); const checked = await restored.inspect(f.body.requestId);
  assert.equal(checked.status, "uncertain"); await restored.start(f.body); assert.equal(submits, 1);
  assert.equal(f.histories[0].status, "uncertain"); assert.equal(f.histories[0].cost.amountUsd, null);
});
test("Missing Atlas key and invalid source stop before a paid submission", async t => {
  const f = await fixture(t); f.setKey(""); await assert.rejects(f.service.start(f.body), /Enable Atlas/); assert.equal(f.submissions(), 0);
  f.setKey("key"); await writeFile(path.join(f.directory, "bad.png"), "not an image");
  await assert.rejects(f.service.start({ ...f.body, sourceUrl: "/uploads/bad.png" })); assert.equal(f.submissions(), 0);
});

test("Concurrent new requests cannot bypass the two-job limit while preparing images", async t => {
  const f = await fixture(t);
  const resolveAsset = f.deps.resolveAsset;
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  f.deps.resolveAsset = async url => { await gate; return resolveAsset(url); };
  const service = createLayersService(f.deps);
  const bodies = [f.body, { ...f.body, requestId: randomUUID() }, { ...f.body, requestId: randomUUID() }];
  const starts = bodies.map(body => service.start(body).then(value => ({ value }), error => ({ error })));
  await new Promise(resolve => setTimeout(resolve, 20)); release();
  const results = await Promise.all(starts);
  assert.equal(results.filter(result => result.error?.status === 429).length, 1);
  for (const result of results.filter(result => result.value)) {
    let job;
    for (let i = 0; i < 200; i++) {
      job = JSON.parse(await readFile(path.join(f.deps.directory, `${result.value.requestId}.json`), "utf8"));
      if (["completed", "uncertain"].includes(job.status)) break;
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(job.status, "completed", job.error);
  }
  assert.equal(f.submissions(), 2);
});

test("Provider recovery requires the original enabled account and never resubmits", async t => {
  const f = await fixture(t);
  const waitForResult = f.deps.client.waitForResult;
  f.deps.client.waitForResult = async () => { throw new Error("offline"); };
  const service = createLayersService(f.deps); await service.start(f.body); await f.settle();
  f.setKey("different-account");
  await assert.rejects(createLayersService(f.deps).inspect(f.body.requestId), /original enabled Atlas key/);
  f.setKey("test-key"); f.deps.client.waitForResult = waitForResult;
  await createLayersService(f.deps).inspect(f.body.requestId);
  assert.equal((await f.settle()).status, "completed"); assert.equal(f.submissions(), 1);
});

test("Layer metadata without placement is retained for recovery, not guessed or regenerated", async t => {
  const f = await fixture(t);
  const waitForResult = f.deps.client.waitForResult;
  f.deps.client.waitForResult = async () => { const result = await waitForResult(); result.job.layers[1].bounding_box = null; return result; };
  await f.service.start(f.body); const job = await f.settle();
  assert.equal(job.status, "uncertain"); assert.match(job.error, /placement/);
  assert.equal(job.document, undefined); assert.equal(f.submissions(), 1);
});
