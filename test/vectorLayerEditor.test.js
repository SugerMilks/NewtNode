import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { editVectorDocument } from "../server/vector-layers.js";
import { createVectorLayerService } from "../server/vector-layer-service.js";
import { createVectorLayerNamer } from "../server/vector-layer-names.js";
import { vectorLayerRows } from "../src/vectorLayerCanvas.js";
import { ideogramVectorApi } from "../src/api/newtApi.js";

const svg = '<svg width="100" height="100"><rect id="back" width="100" height="100" fill="#ff0000"/><g id="design"><rect id="a" width="50" height="50" fill="#00ff00"/><circle id="b" cx="30" cy="30" r="20" fill="#0000ff"/></g><path id="accent" d="M50 50L100 50L100 100Z" fill="#ffff00"/></svg>';
const pixels = async svg => sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();

test("reorder changes paint order only inside the same group", async () => {
  const result = editVectorDocument(svg, { operations: [{ type: "reorder", keys: ["a"], target: "b", position: "after" }] });
  assert.deepEqual(result.layers.filter(layer => layer.parentKey === "design").map(layer => layer.key), ["b", "a"]);
  assert.notDeepEqual(await pixels(result.svg), await pixels(svg));
  assert.throws(() => editVectorDocument(svg, { operations: [{ type: "reorder", keys: ["a"], target: "back", position: "after" }] }), /existing group/);
  assert.throws(() => editVectorDocument(svg, { operations: [{ type: "reorder", keys: ["a"], target: "a", position: "after" }] }));
});

test("delete cleans nested metadata, permits an empty transparent document and undo preserves originals", async () => {
  const deleted = editVectorDocument(svg, { backgroundKeys: ["a"], operations: [{ type: "delete", keys: ["design", "a"] }] });
  assert.deepEqual(deleted.backgroundKeys, []); assert.equal(deleted.layers.some(layer => layer.key === "a"), false);
  const empty = editVectorDocument(svg, { operations: [{ type: "delete", keys: ["back", "design", "accent"] }] });
  assert.equal(empty.layers.length, 0); assert.ok((await pixels(empty.svg)).every(value => value === 0));
  assert.equal(editVectorDocument(empty.svg).layers.length, 0);
  assert.equal(editVectorDocument(svg).layers.length, 5);
});

test("locks protect children and parent structural edits and survive saves", async () => {
  const operations = [{ type: "lock", keys: ["a"], locked: true }];
  for (const operation of [{ type: "delete", keys: ["design"] }, { type: "opacity", keys: ["design"], opacity: .5 }, { type: "rename", key: "a", name: "Changed" }, { type: "reorder", keys: ["design"], target: "accent", position: "after" }]) {
    assert.throws(() => editVectorDocument(svg, { operations: [...operations, operation] }), /Unlock/);
  }
  const parentLocked = editVectorDocument(svg, { lockedKeys: ["design"] });
  assert.equal(parentLocked.layers.find(layer => layer.key === "a").parentLocked, true);
  assert.throws(() => editVectorDocument(svg, { lockedKeys: ["design", "a"], operations: [{ type: "lock", keys: ["a"], locked: false }] }), /parent/);
  const service = createVectorLayerService({ readSource: async () => Buffer.from(svg), saveAssets: async () => ({ url: "/outputs/a.png", svgUrl: "/outputs/a.svg" }), recordHistory: async () => {} });
  const inspected = await service.inspect({ svgUrl: "/outputs/a.svg" });
  const result = await service.save({ svgUrl: "/outputs/a.svg", sourceHash: inspected.sourceHash, requestId: randomUUID(), operations });
  assert.deepEqual(result.item.vectorLockedKeys, ["a"]);
});

test("ungroup is pixel-identical and refuses to distribute compositing attributes", async () => {
  const result = editVectorDocument(svg, { operations: [{ type: "ungroup", keys: ["design"] }] });
  assert.deepEqual(await pixels(result.svg), await pixels(svg));
  assert.equal(result.layers.find(layer => layer.key === "a").parentKey, "");
  for (const attr of ['opacity=".5"', 'fill="#f00"']) assert.throws(() => editVectorDocument(svg.replace('id="design"', `id="design" ${attr}`), { operations: [{ type: "ungroup", keys: ["design"] }] }), /appearance or positioning/);
});

test("opacity validates bounds and bulk rename is atomic and escaped", () => {
  const result = editVectorDocument(svg, { operations: [{ type: "opacity", keys: ["design"], opacity: .4 }, { type: "renameMany", names: [{ key: "a", name: "Green <shape>" }, { key: "b", name: "Blue circle" }] }] });
  assert.equal(result.layers.find(layer => layer.key === "design").opacity, .4); assert.match(result.svg, /Green &lt;shape&gt;/);
  for (const opacity of [-1, 1.1, "0.5", null, Infinity]) assert.throws(() => editVectorDocument(svg, { operations: [{ type: "opacity", keys: ["a"], opacity }] }));
  assert.throws(() => editVectorDocument(svg, { operations: [{ type: "renameMany", names: [{ key: "a", name: "" }] }] }));
});

test("layer list displays front-to-back and preserves group hierarchy and filtering", () => {
  const { layers } = editVectorDocument(svg);
  assert.deepEqual(vectorLayerRows(layers, new Set()).map(layer => layer.key), ["accent", "design", "back"]);
  assert.deepEqual(vectorLayerRows(layers, new Set(["design"])).map(layer => layer.key), ["accent", "design", "b", "a", "back"]);
  assert.deepEqual(vectorLayerRows(layers, new Set(), "DESIGN").map(layer => layer.key), ["design"]);
});

test("AI naming uses a single bounded contact sheet and records usage on invalid output too", async () => {
  const doc = editVectorDocument(svg), layers = doc.layers.slice(0, 2), history = [], calls = [];
  let invalid = false;
  const namer = createVectorLayerNamer({ analyze: async options => { calls.push(options); return { text: JSON.stringify({ names: invalid ? [{ key: "wrong", name: "Wrong" }] : layers.map(layer => ({ key: layer.key, name: `Named ${layer.key}` })) }), provider: "mock", usages: [{ tokens: 1 }] }; }, estimateCost: () => ({ amountUsd: .001 }), recordHistory: async item => history.push(item) });
  const names = await namer({ nodeId: "n", projectId: "p" }, doc, layers);
  assert.equal(names.names.length, 2); assert.equal(calls.length, 1); assert.equal(calls[0].inputs.length, 1);
  const info = await sharp(calls[0].inputs[0].asset.buffer).metadata(); assert.equal(info.width, 960); assert.equal(info.height, 240);
  assert.equal(history[0].cost.amountUsd, .001);
  invalid = true; await assert.rejects(namer({}, doc, layers), /did not match/);
  assert.equal(history.length, 2); assert.equal(history[1].status, "failed");
});

test("naming deduplicates paid submissions, validates selections first and never saves artwork", async () => {
  let calls = 0;
  const service = createVectorLayerService({ readSource: async () => Buffer.from(svg), saveAssets: async () => { throw new Error("Must not save"); }, recordHistory: async () => {}, describeLayers: async () => { calls++; return { names: [] }; } });
  const body = { svgUrl: "/outputs/a.svg", requestId: randomUUID(), keys: ["a"] };
  await service.autoName(body); await service.autoName(body); assert.equal(calls, 1);
  await assert.rejects(service.autoName({ ...body, keys: ["b"] }), /different artwork/);
  for (const keys of [[], ["missing"], Array(33).fill("a")]) await assert.rejects(service.autoName({ ...body, requestId: randomUUID(), keys }));
  assert.equal(calls, 1);
});

test("expanded editor requires its health flag before sending new operations or naming", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ routes: { vectorLayers: true } }));
  await assert.rejects(ideogramVectorApi.inspectLayers({ editorVersion: 2 }), /Restart.*expanded/);
  await assert.rejects(ideogramVectorApi.nameLayers({}), /Restart.*expanded/);
  assert.ok(mock.mock.calls.every(call => call.arguments[0] === "/api/health"));
});
