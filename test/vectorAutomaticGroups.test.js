import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { editVectorDocument } from "../server/vector-layers.js";
import { createVectorLayerService } from "../server/vector-layer-service.js";
import { needsVectorGroupSetup, needsVectorLayerSetup, prepareVectorLayerState, vectorAutomaticGroupOperation, vectorLayerRole } from "../src/vectorLayerOrganization.js";
import { normalizeVectorData } from "../src/ideogramVector.js";
import { ideogramVectorApi } from "../src/api/newtApi.js";

const source = '<svg width="160" height="120"><rect id="paper" width="160" height="120" fill="white"/><rect id="art" x="10" y="10" width="80" height="80" fill="#267777"/><text id="headline" x="15" y="45" font-size="18">Hello<tspan x="15" dy="25">world</tspan></text><path id="glyph-1" d="M110 20H120V40H110Z"/><path id="glyph-2" d="M130 20H140V40H130Z"/></svg>';
const raster = svg => sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
const groups = operation => operation?.operations.filter(op => op.type === "group") || [];
const serviceFor = svg => createVectorLayerService({ readSource: async () => Buffer.from(svg), saveAssets: () => assert.fail("No save expected"), recordHistory: () => assert.fail("No History expected"), describeLayers: () => assert.fail("No paid AI expected") });

test("automatic grouping recognizes real text and explicit labels, not colors or ambiguous words", () => {
  for (const name of ["Text", "lettering", "glyph-12", "Letter 1", "headline_main", "caption:top"]) assert.equal(vectorLayerRole({ kind: "path", name }), "Text");
  for (const name of ["Background", "backdrop_1", "bg-2", "Background 2"]) assert.equal(vectorLayerRole({ kind: "path", name }), "Background");
  for (const name of ["Path 1", "letterbox", "texture", "wordmark", "backgroundish", "art"]) assert.equal(vectorLayerRole({ kind: "path", name, color: "#fff" }), "");
  assert.equal(vectorLayerRole({ kind: "text", name: "a" }), "Text");
  assert.equal(vectorLayerRole({ kind: "text", background: true }), "Background");
});

test("text and explicitly labeled glyphs form a folder while unlabeled artwork remains untouched", async () => {
  const doc = editVectorDocument(source), operation = vectorAutomaticGroupOperation(doc.layers, randomUUID);
  assert.deepEqual(groups(operation).map(op => ({ name: op.name, keys: op.keys })), [{ name: "Text", keys: ["headline", "glyph-1", "glyph-2"] }]);
  const edited = editVectorDocument(source, { operations: [operation] });
  assert.deepEqual(await raster(edited.svg), await raster(source));
  assert.equal(edited.layers.find(layer => layer.key === "art").parentKey, "");
  assert.equal(edited.layers.filter(layer => layer.kind === "text").length, 1, "tspan stays within its original text object");
  assert.equal(vectorAutomaticGroupOperation(edited.layers, randomUUID), null);
});

test("single text objects receive a folder without relaxing manual grouping", () => {
  const svg = '<svg width="100" height="100"><text id="a" x="5" y="20">One</text></svg>';
  const operation = vectorAutomaticGroupOperation(editVectorDocument(svg).layers, randomUUID);
  assert.equal(groups(operation)[0].singleton, true);
  assert.equal(editVectorDocument(svg, { operations: [operation] }).layers[0].name, "Text");
  assert.throws(() => editVectorDocument(svg, { operations: [{ ...groups(operation)[0], singleton: false }] }), /at least two/);
});

test("automatic background and text setup is one replayable undo step without paid calls", async () => {
  const service = serviceFor(source), prepared = await service.inspect({ svgUrl: "/outputs/a.svg", prepareBackground: true, prepareGroups: true });
  assert.deepEqual(groups(prepared.initialOperation).map(op => op.name), ["Background", "Text"]);
  const replay = await service.inspect({ svgUrl: "/outputs/a.svg", operations: [prepared.initialOperation] });
  assert.equal(replay.svg, prepared.svg); assert.deepEqual(replay.backgroundKeys, prepared.backgroundKeys);
  assert.equal((await raster(prepared.svg))[3], 0);
  const shown = editVectorDocument(source, { operations: [prepared.initialOperation, { type: "backgroundVisibility", visible: true }] });
  assert.deepEqual(await raster(shown.svg), await raster(source));
  assert.deepEqual(await raster(editVectorDocument(source).svg), await raster(source));
  const again = await service.inspect({ svgUrl: "/outputs/a.svg", operations: [prepared.initialOperation], prepareGroups: true });
  assert.equal(again.initialOperation, undefined, "prepared folders never get nested again");
});

test("assigned multipart backgrounds move hidden visibility to the folder and can be restored", async () => {
  const svg = '<svg width="100" height="100"><rect id="left" width="50" height="100" fill="red"/><rect id="right" x="50" width="50" height="100" fill="blue"/><circle id="art" cx="50" cy="50" r="10" fill="white"/></svg>';
  const hidden = { type: "visibility", keys: ["left", "right"], visible: false };
  const doc = editVectorDocument(svg, { backgroundKeys: ["left", "right"], operations: [hidden] });
  const operation = vectorAutomaticGroupOperation(doc.layers, randomUUID), folder = groups(operation)[0];
  const edited = editVectorDocument(svg, { backgroundKeys: ["left", "right"], operations: [hidden, operation] });
  assert.deepEqual(edited.backgroundKeys, [folder.id]);
  assert.equal(edited.layers.find(layer => layer.key === folder.id).hidden, true);
  assert.equal(edited.layers.find(layer => layer.key === "left").hidden, false);
  assert.deepEqual(await raster(edited.svg), await raster(doc.svg));
  const shown = editVectorDocument(svg, { backgroundKeys: ["left", "right"], operations: [hidden, operation, { type: "visibility", keys: [folder.id], visible: true }] });
  assert.deepEqual(await raster(shown.svg), await raster(svg));
});

test("labeled backgrounds group without hiding them or resetting mixed visibility choices", async () => {
  const svg = '<svg width="100" height="100"><rect id="bg-1" width="50" height="100" fill="red"/><rect id="bg-2" x="50" width="50" height="100" fill="blue" display="none"/><circle id="art" cx="50" cy="50" r="10" fill="white"/></svg>';
  const prepared = await serviceFor(svg).inspect({ svgUrl: "/outputs/a.svg", prepareGroups: true });
  assert.equal(prepared.backgroundVisible, true);
  assert.equal(prepared.layers.find(layer => layer.key === "bg-2").hidden, true);
  assert.deepEqual(await raster(prepared.svg), await raster(svg));
});

test("separate same-role runs and nested transforms preserve paint order and rendered pixels", async () => {
  const svg = '<svg width="100" height="100"><g id="artwork" transform="translate(5 3) scale(.8)" opacity=".7"><path id="glyph-1" d="M0 0H80V80H0Z" fill="red"/><rect id="art" x="30" y="20" width="40" height="40" fill="blue"/><path id="glyph-2" d="M20 20H40V40H20Z" fill="white"/></g></svg>';
  const operation = vectorAutomaticGroupOperation(editVectorDocument(svg).layers, randomUUID);
  assert.deepEqual(groups(operation).map(op => op.name), ["Text", "Text 2"]);
  const edited = editVectorDocument(svg, { operations: [operation] });
  assert.deepEqual(await raster(edited.svg), await raster(svg));
  assert.deepEqual(edited.layers.filter(layer => layer.parentKey === "artwork").map(layer => layer.name), ["Text", "art", "Text 2"]);
});

test("existing semantic folders, hidden text, locks and hidden ancestors are respected", () => {
  const svg = '<svg width="100" height="100"><g id="Text"><path id="glyph-1" d="M0 0H10V10Z"/></g><g id="Background"><rect id="bg-1" width="20" height="20"/></g><g id="locked"><text id="a">A</text></g><g id="hidden" display="none"><text id="b">B</text></g><text id="c" display="none">C</text><text id="d">D</text></svg>';
  const doc = editVectorDocument(svg, { lockedKeys: ["locked", "d"] });
  assert.equal(vectorAutomaticGroupOperation(doc.layers, randomUUID), null);
});

test("automatic grouping obeys operation budgets and object/group limits", () => {
  const layer = (key, extra = {}) => ({ key, name: key, parentKey: "", index: 0, kind: "text", ...extra });
  for (const limit of [-1, 0]) assert.equal(vectorAutomaticGroupOperation([layer("a")], randomUUID, limit), null);
  assert.equal(groups(vectorAutomaticGroupOperation([layer("a")], randomUUID, 1)).length, 1);
  const hidden = layer("back", { kind: "path", background: true, hidden: true });
  assert.equal(vectorAutomaticGroupOperation([hidden], randomUUID, 3), null);
  assert.equal(vectorAutomaticGroupOperation([hidden], randomUUID, 4).operations.length, 4);
  assert.equal(vectorAutomaticGroupOperation(Array.from({ length: 5000 }, (_, i) => layer(`a${i}`)), randomUUID), null);
  const separated = Array.from({ length: 100 }, (_, i) => layer(`a${i}`, { index: i, kind: i % 2 ? "path" : "text" }));
  assert.equal(groups(vectorAutomaticGroupOperation(separated, randomUUID)).length, 32);
});

test("near-full histories stay within the flattened server operation limit", async () => {
  const operations = Array.from({ length: 499 }, () => ({ type: "rename", key: "art", name: "Art" }));
  const prepared = await serviceFor(source).inspect({ svgUrl: "/outputs/a.svg", operations, prepareGroups: true });
  assert.equal(prepared.initialOperation.operations.length, 1);
  assert.doesNotThrow(() => editVectorDocument(source, { operations: [...operations, prepared.initialOperation] }));
  const full = await serviceFor(source).inspect({ svgUrl: "/outputs/a.svg", operations: [...operations, operations[0]], prepareGroups: true });
  assert.equal(full.initialOperation, undefined);
});

test("grouping upgrades old edited results and appends to drafts without resetting background choices", () => {
  const item = { url: "/outputs/a.png", svgUrl: "/outputs/a.svg", vectorLayersPrepared: true, vectorSourceSvgUrl: "/outputs/original.svg", vectorBackgroundKeys: ["paper"] };
  const old = { type: "rename", key: "art", name: "My artwork" }, operation = { type: "batch", operations: [{ type: "rename", key: "headline", name: "My text" }] };
  const data = normalizeVectorData({ resultItems: [item], vectorLayerDrafts: [{ svgUrl: item.svgUrl, operations: [old] }], vectorJob: { status: "running", requestId: "active" } });
  assert.equal(needsVectorLayerSetup(item), false); assert.equal(needsVectorGroupSetup(item), true);
  const next = normalizeVectorData({ ...data, ...prepareVectorLayerState(data, item.svgUrl, operation, { background: false, groups: true }) });
  assert.deepEqual(next.vectorLayerDrafts[0].operations, [old, operation]);
  assert.equal(next.vectorJob.status, "running"); assert.deepEqual(next.resultItems[0].vectorBackgroundKeys, ["paper"]);
  assert.equal(next.resultItems[0].vectorGroupsPrepared, true);
  assert.equal(needsVectorGroupSetup(next.resultItems[0]), false, "Undo/Cancel cannot trigger another automatic grouping");
  assert.deepEqual(prepareVectorLayerState(next, item.svgUrl, operation, { groups: true }), {});
  assert.deepEqual(prepareVectorLayerState(data, "/outputs/gone.svg", operation, { groups: true }), {});
});

test("a no-op review is remembered without adding history or affecting other results", () => {
  const data = { resultItems: [{ svgUrl: "/outputs/a.svg" }, { svgUrl: "/outputs/b.svg" }] };
  const patch = prepareVectorLayerState(data, "/outputs/a.svg", null, { background: true, groups: true });
  assert.equal(patch.resultItems[0].vectorLayersPrepared, true); assert.equal(patch.resultItems[0].vectorGroupsPrepared, true);
  assert.equal(patch.resultItems[1], data.resultItems[1]); assert.equal(patch.vectorLayerDrafts, undefined);
});

test("saved versions persist grouping review only when the client actually completed it", async () => {
  const service = createVectorLayerService({ readSource: async () => Buffer.from(source), saveAssets: async () => ({ url: "/outputs/edit.png", svgUrl: "/outputs/edit.svg" }), recordHistory: async () => {} });
  const doc = await service.inspect({ svgUrl: "/outputs/a.svg" });
  for (const groupsPrepared of [true, false, undefined]) {
    const result = await service.save({ svgUrl: "/outputs/a.svg", sourceHash: doc.sourceHash, requestId: randomUUID(), groupsPrepared });
    assert.equal(result.item.vectorGroupsPrepared, groupsPrepared === true);
  }
});

test("automatic grouping capability is required before inspection, saving or paid naming", async t => {
  const mocked = t.mock.method(globalThis, "fetch", async () => Response.json({ routes: { vectorLayers: true, vectorLayerEditor: true, vectorLayerTransforms: true, vectorLayerOrganization: true } }));
  for (const action of ["inspectLayers", "saveLayers", "nameLayers"]) await assert.rejects(ideogramVectorApi[action]({ editorVersion: 5 }), /Restart.*automatic Text and Background/);
  assert.ok(mocked.mock.calls.every(call => call.arguments[0] === "/api/health"));
});
