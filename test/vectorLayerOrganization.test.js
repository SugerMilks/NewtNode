import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { editVectorDocument } from "../server/vector-layers.js";
import { vectorBackgroundSetup } from "../server/vector-background.js";
import { createVectorLayerService } from "../server/vector-layer-service.js";
import { needsVectorLayerSetup, prepareVectorLayerState, vectorLayerRange, vectorOrganizationOperation, vectorOrganizationRuns } from "../src/vectorLayerOrganization.js";
import { normalizeVectorData } from "../src/ideogramVector.js";
import { ideogramVectorApi } from "../src/api/newtApi.js";

const source = '<svg width="100" height="100"><path id="back" d="M0 0H100V100H0Z" fill="#fff"/><rect id="a" x="10" y="10" width="60" height="60" fill="#f00"/><rect id="detail" x="20" y="20" width="10" height="10" fill="#fff"/><circle id="b" cx="70" cy="70" r="20" fill="#00f"/></svg>';
const raster = async svg => sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();

test("first-open setup identifies a solid backdrop, labels and hides only that layer in one undo step", async () => {
  const doc = editVectorDocument(source), operation = await vectorBackgroundSetup(doc);
  assert.equal(operation.type, "batch"); assert.equal(operation.operations.length, 3);
  const edited = editVectorDocument(source, { operations: [operation] });
  assert.deepEqual(edited.backgroundKeys, ["back"]);
  assert.equal(edited.layers[0].name, "Background"); assert.equal(edited.layers[0].hidden, true);
  const pixels = await raster(edited.svg); assert.equal(pixels[3], 0);
  assert.deepEqual([...pixels.subarray((25 * 100 + 25) * 4, (25 * 100 + 25) * 4 + 4)], [255, 255, 255, 255]);
  const shown = editVectorDocument(source, { operations: [operation, { type: "backgroundVisibility", visible: true }] });
  assert.deepEqual(await raster(shown.svg), await raster(source));
  assert.deepEqual(await raster(editVectorDocument(source).svg), await raster(source));
});

test("background setup never guesses from color, names, bounding box, or an otherwise blank result", async () => {
  const candidates = [
    '<rect id="back" x="1" y="1" width="98" height="98" fill="white"/>',
    '<path id="back" d="M0 0H100V100H0Z M40 40H60V60H40Z" fill-rule="evenodd" fill="white"/>',
    '<circle id="background" cx="50" cy="50" r="50" fill="white"/>',
    '<rect id="back" width="100" height="100" fill="white" opacity=".5"/>',
    '<defs><linearGradient id="g"><stop stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient></defs><rect id="back" width="100" height="100" fill="url(#g)"/>',
  ];
  for (const candidate of candidates) assert.equal(await vectorBackgroundSetup(editVectorDocument(`<svg width="100" height="100">${candidate}<circle cx="50" cy="50" r="10" fill="red"/></svg>`)), null);
  assert.equal(await vectorBackgroundSetup(editVectorDocument('<svg width="100" height="100"><rect width="100" height="100" fill="white"/></svg>')), null);
  assert.equal(await vectorBackgroundSetup(editVectorDocument('<svg width="100" height="100"><rect width="100" height="100" fill="white"/><circle cx="500" cy="500" r="10"/></svg>')), null);
});

test("background setup respects locks, existing assignments, inherited opacity, and real viewBox pixels", async () => {
  assert.equal(await vectorBackgroundSetup(editVectorDocument(source, { lockedKeys: ["back"] })), null);
  assert.equal(await vectorBackgroundSetup(editVectorDocument(source, { backgroundKeys: ["a"] })), null);
  const grouped = source.replace('<path', '<g id="g"><path').replace('</svg>', '</g></svg>');
  assert.equal(await vectorBackgroundSetup(editVectorDocument(grouped, { lockedKeys: ["g"] })), null);
  assert.equal(await vectorBackgroundSetup(editVectorDocument(grouped.replace('id="g"', 'id="g" opacity=".5"'))), null);
  assert.ok(await vectorBackgroundSetup(editVectorDocument(grouped)));
  const letterbox = source.replace('height="100"', 'height="50" viewBox="0 0 100 100"');
  assert.equal(await vectorBackgroundSetup(editVectorDocument(letterbox)), null);
  assert.ok(await vectorBackgroundSetup(editVectorDocument('<svg width="400" height="300"><path id="paper" d="M0 0H400V300H0Z" fill="#fff"/><rect x="100" y="60" width="200" height="160" fill="#287777"/></svg>')));
});

test("service background preparation is opt-in, returns a replayable operation, and never saves or calls AI", async () => {
  let read = 0;
  const service = createVectorLayerService({ readSource: async () => { read++; return Buffer.from(source); }, saveAssets: () => assert.fail("No saving"), recordHistory: () => assert.fail("No History"), describeLayers: () => assert.fail("No AI") });
  const plain = await service.inspect({ svgUrl: "/outputs/test.svg" }); assert.equal(plain.layers[0].hidden, false);
  const prepared = await service.inspect({ svgUrl: "/outputs/test.svg", prepareBackground: true });
  assert.equal(prepared.layers[0].hidden, true); assert.equal(prepared.sourceHash, plain.sourceHash);
  const reopened = await service.inspect({ svgUrl: "/outputs/test.svg", operations: [prepared.initialOperation], prepareBackground: true });
  assert.equal(reopened.initialOperation, undefined); assert.equal(reopened.svg, prepared.svg); assert.equal(read, 3);
});

test("setup remembers user choices through undo, cancel, save/reopen and unrelated generation updates", () => {
  const item = { url: "/outputs/a.png", svgUrl: "/outputs/a.svg", type: "image" };
  const data = normalizeVectorData({ resultItems: [item], vectorJob: { requestId: "running", status: "running" } });
  assert.equal(needsVectorLayerSetup(item), true);
  const operation = { type: "batch", operations: [{ type: "background", keys: ["back"] }] };
  const patch = prepareVectorLayerState(data, item.svgUrl, operation);
  const next = normalizeVectorData({ ...data, ...patch });
  assert.equal(next.vectorJob.status, "running"); assert.equal(next.resultItems[0].vectorLayersPrepared, true);
  assert.deepEqual(next.vectorLayerDrafts[0].operations, [operation]);
  assert.equal(needsVectorLayerSetup(next.resultItems[0], []), false, "undo/cancel cannot retrigger preparation");
  assert.deepEqual(prepareVectorLayerState(next, item.svgUrl, operation), {});
  assert.deepEqual(prepareVectorLayerState(data, "/outputs/gone.svg", operation), {});
  assert.equal(needsVectorLayerSetup({ ...item, vectorSourceSvgUrl: "/outputs/old.svg" }), false);
  assert.equal(needsVectorLayerSetup(item, [{ type: "rename" }]), false);
  assert.deepEqual(prepareVectorLayerState(data, item.svgUrl, null).resultItems[0].vectorLayersPrepared, true);
});

test("organizing creates named collapsible folders without changing pixels, stacking or existing groups", async () => {
  const doc = editVectorDocument(source, { backgroundKeys: ["back"] });
  const op = vectorOrganizationOperation(doc.layers, randomUUID);
  assert.equal(op.operations.length, 1); assert.equal(op.operations[0].name, "Artwork 1");
  assert.deepEqual(op.operations[0].keys, ["a", "detail", "b"]);
  const organized = editVectorDocument(source, { backgroundKeys: ["back"], operations: [op] });
  assert.deepEqual(await raster(organized.svg), await raster(source));
  assert.equal(organized.layers.filter(layer => !layer.parentKey).length, 2);
  assert.equal(vectorOrganizationOperation(organized.layers, randomUUID), null, "repeated organization does not nest folders");
  const split = editVectorDocument(source, { lockedKeys: ["detail"] });
  assert.ok(vectorOrganizationRuns(split.layers).every(run => !run.some(layer => layer.key === "detail")));
});

test("organization preserves hidden/named groups and separates actual text objects, with bounded groups", () => {
  const layer = (key, index, extra = {}) => ({ key, index, parentKey: "", kind: "path", name: key, ...extra });
  const layers = [layer("a", 0), layer("b", 1), layer("existing", 2, { kind: "g", name: "Artwork 1" }), layer("c", 3), layer("d", 4), layer("e", 5, { kind: "text" }), layer("f", 6, { kind: "text" }), layer("hidden", 7, { hidden: true })];
  const op = vectorOrganizationOperation(layers, randomUUID);
  assert.deepEqual(op.operations.map(op => op.name), ["Artwork 2", "Artwork 3", "Lettering 1"]);
  assert.deepEqual(op.operations.map(op => op.keys), [["a", "b"], ["c", "d"], ["e", "f"]]);
  assert.equal(vectorOrganizationRuns(Array.from({ length: 5000 }, (_, i) => layer(`x${i}`, i))).length, 0);
});

test("batch edits remain bounded, reject nested batches and preserve failures atomically", () => {
  for (const operations of [[], [null], [{ type: "batch", operations: [] }]]) assert.throws(() => editVectorDocument(source, { operations: [{ type: "batch", operations }] }));
  assert.throws(() => editVectorDocument(source, { operations: Array.from({ length: 6 }, () => ({ type: "batch", operations: Array.from({ length: 100 }, () => ({ type: "visibility", keys: ["a"], visible: true })) })) }), /500/);
  assert.throws(() => editVectorDocument(source, { lockedKeys: ["a"], operations: [{ type: "batch", operations: [{ type: "rename", key: "detail", name: "New" }, { type: "delete", keys: ["a"] }] }] }), /Unlock/);
  assert.equal(editVectorDocument(source).layers.find(layer => layer.key === "detail").name, "detail");
});

test("ungrouping moved/scaled groups composes transforms and retains rendered pixels", async () => {
  const svg = '<svg width="100" height="100"><g id="p" transform="translate(4 8) scale(1.2)"><g id="g" transform="translate(10 3) rotate(8)"><rect id="a" transform="translate(3 4)" width="10" height="10" fill="#f00"/><circle id="b" cx="20" cy="20" r="5"/></g></g></svg>';
  const result = editVectorDocument(svg, { operations: [{ type: "ungroup", keys: ["g"] }] });
  assert.deepEqual(await raster(result.svg), await raster(svg));
  assert.equal(result.layers.find(layer => layer.key === "a").parentKey, "p");
  assert.equal(result.layers.some(layer => layer.key === "g"), false);
  assert.throws(() => editVectorDocument(svg.replace('id="g"', 'id="g" opacity=".5"'), { operations: [{ type: "ungroup", keys: ["g"] }] }), /appearance/);
});

test("shift range selects sibling spans but never crosses a group boundary", () => {
  const { layers } = editVectorDocument(source);
  assert.deepEqual(vectorLayerRange(layers, "b", "a"), ["a", "detail", "b"]);
  assert.deepEqual(vectorLayerRange(layers, "missing", "a"), ["a"]);
  assert.deepEqual(vectorLayerRange([...layers, { key: "child", parentKey: "group", index: 0 }], "a", "child"), ["child"]);
});

test("organization capability is required before inspecting, saving or paid naming", async t => {
  const mocked = t.mock.method(globalThis, "fetch", async () => Response.json({ routes: { vectorLayers: true, vectorLayerEditor: true, vectorLayerTransforms: true } }));
  for (const action of ["inspectLayers", "saveLayers", "nameLayers"]) await assert.rejects(ideogramVectorApi[action]({ editorVersion: 4 }), /Restart.*grouping/);
  assert.ok(mocked.mock.calls.every(call => call.arguments[0] === "/api/health"));
});
