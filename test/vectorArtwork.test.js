import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, writeFile, rm, mkdir } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import sharp from "sharp";
import { editVectorDocument } from "../server/vector-layers.js";
import { createVectorLayerService } from "../server/vector-layer-service.js";
import { createVectorLookStore } from "../server/vector-design-looks.js";
import { vectorTextDefaults, vectorFinishingMatrix, vectorAlignmentOperation, vectorSnapMove } from "../src/vectorArtwork.js";
import { vectorDesignLook } from "../src/vectorDesignLooks.js";
import { vectorReferences } from "../src/vectorGuidance.js";
import { outputCandidates } from "../src/outputNode.js";
import { exportOutputItem } from "../server/output-export.js";
import { ideogramVectorApi, outputApi } from "../src/api/newtApi.js";

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="80"><defs><linearGradient id="grad"><stop stop-color="red"/><stop offset="1" stop-color="blue"/></linearGradient></defs><g id="group" fill="red"><rect id="one" x="10" y="10" width="20" height="30"/><rect id="two" x="40" y="10" width="10" height="20" fill="#ff000080"/></g><rect id="three" x="60" y="10" width="15" height="10" fill="url(#grad)"/></svg>';
const pixels = async input => sharp(Buffer.from(input)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const pixel = (image, x, y) => [...image.data.subarray((y * image.info.width + x) * 4, (y * image.info.width + x) * 4 + 4)];
const change = operations => editVectorDocument(svg, { operations });
const textOp = (extra = {}) => ({ type: "addText", id: `newt-text-${randomUUID()}`, x: 50, y: 50, text: { ...vectorTextDefaults, content: "Studio", size: 20 }, ...extra });

test("solid color replacement respects selection, inherited paint, gradients, alpha and locks", async () => {
  const original = await pixels(svg), doc = change([{ type: "paint", keys: ["one"], from: "#ff0000ff", to: "#123456" }]);
  assert.deepEqual(doc.palette, ["#123456ff", "#ff000080"]);
  assert.deepEqual(pixel(await pixels(doc.svg), 15, 15), [18, 52, 86, 255]);
  assert.deepEqual(pixel(await pixels(doc.svg), 65, 15), pixel(original, 65, 15));
  const alpha = change([{ type: "paint", all: true, from: "#ff000080", to: "#00ff00" }]);
  assert.deepEqual(pixel(await pixels(alpha.svg), 45, 15), [0, 255, 0, 128]);
  assert.throws(() => editVectorDocument(svg, { lockedKeys: ["group"], operations: [{ type: "paint", all: true, from: "#ff0000ff", to: "#000000" }] }), /Unlock/);
  assert.throws(() => change([{ type: "paint", all: true, from: "#ff0000ff", to: "url(https://example.com)" }]));
  assert.deepEqual(pixel(await pixels(svg), 15, 15), [255, 0, 0, 255]);
});

test("currentColor and span paints are resolved and replaced without altering resource definitions", () => {
  const input = '<svg width="100" height="100" color="red"><text id="text" x="10" y="30" fill="currentColor">A<tspan fill="blue">B</tspan></text></svg>';
  const doc = editVectorDocument(input, { operations: [{ type: "paint", keys: ["text"], from: "#ff0000ff", to: "#00ff00" }] });
  assert.deepEqual(doc.palette, ["#0000ffff", "#00ff00ff"]);
});

test("rotation and flip operate around selection center, survive nested parents and preserve undo source", async () => {
  const box = { left: 10, top: 10, width: 20, height: 30 };
  const operation = { type: "affine", keys: ["one"], matrix: vectorFinishingMatrix(box, "rotate", 90) };
  const rotated = await pixels(change([operation]).svg);
  assert.deepEqual(pixel(rotated, 6, 25), [255, 0, 0, 255]);
  assert.equal(pixel(rotated, 15, 11)[3], 0);
  const nested = svg.replace('id="group"', 'id="group" transform="translate(2 2)"');
  const flipped = editVectorDocument(nested, { operations: [{ type: "affine", keys: ["one"], matrix: vectorFinishingMatrix({ ...box, left: 12, top: 12 }, "flipX") }] });
  assert.deepEqual((await pixels(flipped.svg)).data, (await pixels(nested)).data);
  assert.throws(() => editVectorDocument(svg, { lockedKeys: ["one"], operations: [operation] }), /Unlock/);
  assert.throws(() => change([{ ...operation, matrix: { a: 1e8, b: 0, c: 0, d: 1, e: 0, f: 0 } }]), /transform/i);
});

test("alignment, distribution and snapping use consistent image-space positions", () => {
  const boxes = [{ key: "a", left: 10, top: 20, width: 10, height: 10 }, { key: "b", left: 25, top: 30, width: 20, height: 20 }, { key: "c", left: 90, top: 50, width: 10, height: 10 }];
  const align = vectorAlignmentOperation(boxes, "middle", { width: 100, height: 100 });
  assert.deepEqual(align.operations.map(op => op.matrix.f), [15, 0, -15]);
  const distribute = vectorAlignmentOperation(boxes, "distributeX", {});
  assert.deepEqual(distribute.operations.map(op => op.matrix.e), [0, 20, 0]);
  assert.equal(vectorAlignmentOperation([boxes[0]], "center", { width: 100, height: 100 }).operations[0].matrix.e, 35);
  assert.throws(() => vectorAlignmentOperation(boxes.slice(0, 2), "distributeX", {}), /three/);
  const snap = vectorSnapMove({ left: 2, top: 60, width: 20, height: 20 }, [{ left: 0, top: 0, width: 100, height: 100 }], 3);
  assert.equal(snap.dx, -2); assert.equal(snap.dy, 0); assert.deepEqual(snap.guides, [0, null]);
});

test("editable text is escaped, multiline, rename-safe and hides rather than deletes replaced lettering", async () => {
  const operation = textOp({ replaceKeys: ["one"], text: { ...vectorTextDefaults, content: '<Studio> & Co\nSecond line', size: 12, lineHeight: 1.8 } });
  const added = change([operation]);
  assert.equal(added.layers.find(layer => layer.key === "one").hidden, true);
  assert.deepEqual(added.layers.find(layer => layer.key === operation.id).text, operation.text);
  assert.match(added.svg, /&lt;Studio&gt; &amp; Co/);
  const updated = change([operation, { type: "rename", key: operation.id, name: "Brand" }, { type: "text", key: operation.id, text: { ...operation.text, content: "One line", lineHeight: 2 } }]);
  assert.equal(updated.layers.find(layer => layer.key === operation.id).name, "Brand");
  assert.equal(editVectorDocument(updated.svg).layers.find(layer => layer.key === operation.id).text.lineHeight, 2);
  assert.ok((await pixels(updated.svg)).data.some(Boolean));
  assert.throws(() => change([textOp({ text: { ...operation.text, family: 'bad;url(x)' } })]));
  assert.throws(() => editVectorDocument(svg, { lockedKeys: ["one"], operations: [operation] }), /Unlock/);
  assert.throws(() => change([{ type: "text", key: "one", text: operation.text }]), /not editable text/);
  assert.equal(change([]).layers.find(layer => layer.key === "one").hidden, false);
});

test("Fit Canvas uses rendered visible alpha and returns a single replayable undo step", async () => {
  const input = '<svg width="200" height="100" viewBox="0 0 100 50"><rect id="hidden" width="100" height="50" display="none"/><rect id="art" x="10" y="10" width="20" height="10" fill="#abcdef"/></svg>';
  const service = createVectorLayerService({ readSource: async () => Buffer.from(input) });
  const fitted = await service.inspect({ svgUrl: "/outputs/a.svg", fitCanvasPadding: 5 });
  assert.equal(fitted.width, 50); assert.equal(fitted.height, 30);
  assert.equal(fitted.initialOperation.operations.length, 1);
  const replay = editVectorDocument(input, { operations: [fitted.initialOperation] });
  assert.deepEqual((await pixels(fitted.svg)).data, (await pixels(replay.svg)).data);
  const image = await pixels(replay.svg);
  assert.deepEqual(pixel(image, 6, 6), [171, 205, 239, 255]); assert.equal(pixel(image, 0, 0)[3], 0);
  assert.equal(replay.layers.find(layer => layer.key === "hidden").hidden, true);
  assert.equal(editVectorDocument(input).width, 200);
  await assert.rejects(service.inspect({ svgUrl: "/outputs/a.svg", fitCanvasPadding: -1 }), /padding/);
  await assert.rejects(service.inspect({ svgUrl: "/outputs/a.svg", fitCanvasPadding: 0, operations: [{ type: "visibility", keys: ["art"], visible: false }] }), /no visible/);
  assert.throws(() => editVectorDocument(input.replace('width="20"', 'width="20%"'), { operations: [fitted.initialOperation] }), /relative dimensions/);
});

test("saved looks exclude outputs, drafts, brief and jobs while retaining reusable guidance", () => {
  const look = vectorDesignLook({ prompt: "private brief", resultItems: [{ url: "/outputs/a.png" }], vectorJob: { requestId: "abc" }, palette: "red, black", lettering: "BRAND", vectorLayerDrafts: [{}] }, [{ url: "/uploads/board.png", label: "Brand" }]);
  assert.equal(look.prompt, undefined); assert.equal(look.resultItems, undefined); assert.equal(look.vectorJob, undefined); assert.equal(look.vectorLayerDrafts, undefined);
  assert.equal(look.palette, "red, black"); assert.equal(look.lettering, "BRAND");
  assert.equal(vectorReferences(look, [], [])[0].url, "/uploads/board.png");
  assert.equal(vectorReferences(look, [], [{ url: "/uploads/new.png" }])[0].url, "/uploads/new.png");
});

test("Fit Canvas keeps previously off-canvas geometry clipped when padding extends outside the original", async () => {
  const input = '<svg width="100" height="80"><rect id="edge" x="-20" y="0" width="40" height="40" fill="red"/><rect id="outside" x="-15" y="50" width="10" height="10" fill="blue"/></svg>';
  const service = createVectorLayerService({ readSource: async () => Buffer.from(input) });
  const fitted = await service.inspect({ svgUrl: "/outputs/a.svg", fitCanvasPadding: 24 });
  const rendered = await pixels(fitted.svg);
  assert.equal(fitted.width, 68); assert.equal(fitted.height, 88);
  assert.equal(pixel(rendered, 10, 30)[3], 0);
  assert.deepEqual(pixel(rendered, 25, 30), [255, 0, 0, 255]);
  assert.equal(pixel(rendered, 12, 78)[3], 0);
});

test("saved look store copies portable images, deduplicates saves and retains applied assets after deletion", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vector-looks-test-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const png = await sharp({ create: { width: 10, height: 10, channels: 4, background: "red" } }).png().toBuffer();
  let reads = 0;
  const store = createVectorLookStore({ directory: path.join(dir, "looks"), assetDirectory: path.join(dir, "assets"), assetUrl: "/uploads/vector-looks", readAsset: async () => { reads++; return png; } });
  const body = { id: randomUUID(), name: "Studio", settings: vectorDesignLook({}, [{ url: "/uploads/board.png", label: "Board" }]) };
  const a = await store.save(body), b = await store.save(body);
  assert.deepEqual(a, b); assert.equal(reads, 1); assert.equal((await store.list()).length, 1);
  assert.match(a.settings.vectorSavedMoodBoards[0].url, /^\/uploads\/vector-looks\//);
  await store.remove(body.id); assert.equal((await store.list()).length, 0);
  assert.ok((await readFile(path.join(dir, "assets", body.id, "1.png"))).length);
  await assert.rejects(store.save({ ...body, id: "../../invalid" }));
});

test("Output exports canonical PNG, SVG companion and alpha matte without modifying sources or overwriting", async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), "vector-output-test-")); t.after(() => rm(dir, { recursive: true, force: true }));
  const source = path.join(dir, "source.svg"), pngPath = path.join(dir, "source.png"), output = path.join(dir, "delivery"); await mkdir(output);
  await writeFile(source, svg); await sharp(Buffer.from(svg)).png().toFile(pngPath);
  const sources = [{ url: "/outputs/source.png", svgUrl: "/outputs/source.svg", type: "image", ready: true }];
  const base = { path: output, subfolder: "", quality: 90 };
  const settings = { destinations: { image: { ...base, format: "svg" } } };
  const candidate = outputCandidates(sources, settings)[0]; assert.equal(candidate.url, sources[0].svgUrl); assert.equal(candidate.canonicalUrl, sources[0].url);
  const options = { resolveAsset: async url => ({ filePath: url.endsWith(".svg") ? source : pngPath }) };
  const first = await exportOutputItem(candidate, settings.destinations.image, options);
  const second = await exportOutputItem(candidate, settings.destinations.image, options);
  assert.notEqual(first.filePath, second.filePath); assert.match(first.fileName, /\.svg$/);
  assert.deepEqual((await pixels(await readFile(first.filePath))).data, (await pixels(svg)).data);
  const alpha = await exportOutputItem({ ...sources[0], name: "matte" }, { ...base, format: "alpha" }, options);
  assert.match(alpha.fileName, /\.png$/);
  const matte = await sharp(alpha.filePath).greyscale().raw().toBuffer();
  assert.equal(matte[0], 0); assert.equal(matte[15 * 100 + 15], 255); assert.equal(matte[15 * 100 + 45], 128);
  assert.equal(await readFile(source, "utf8"), svg);
  await assert.rejects(exportOutputItem({ ...sources[0], name: "bad" }, { ...base, format: "svg" }, options), /SVG export needs/);
  await writeFile(source, svg.replace('<defs>', '<script>alert(1)</script><defs>'));
  await assert.rejects(exportOutputItem(candidate, settings.destinations.image, options), /unsupported/);
});

test("new artwork, look and Output operations require the backend capability before submitting", async t => {
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json({ routes: { vectorLayers: true, vectorLayerEditor: true, vectorLayerTransforms: true, vectorLayerOrganization: true, vectorLayerAutoGroups: true } }));
  await assert.rejects(ideogramVectorApi.inspectLayers({ editorVersion: 6 }), /Restart NewtNode/);
  await assert.rejects(ideogramVectorApi.saveLook({}), /Restart NewtNode/);
  await assert.rejects(outputApi.validate({ destinations: { image: { format: "svg" } } }), /Restart NewtNode/);
  assert.ok(fetch.mock.calls.every(call => String(call.arguments[0]).endsWith("/api/health")));
});
