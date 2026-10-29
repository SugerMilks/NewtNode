import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { editVectorDocument } from "../server/vector-layers.js";
import { vectorSelectionGroup, vectorRowSelection } from "../src/vectorLayerOrganization.js";
import { ideogramVectorApi } from "../src/api/newtApi.js";

const raster = svg => sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
const op = keys => ({ type: "group", mode: "selection", keys, id: `newt-group-${randomUUID()}`, name: "Selection" });
const source = '<svg width="120" height="100"><rect id="a" x="10" y="10" width="60" height="60" fill="red"/><rect id="b" x="20" y="20" width="60" height="60" fill="green"/><rect id="c" x="80" y="10" width="20" height="20" fill="blue"/><circle id="d" cx="90" cy="70" r="10"/></svg>';
const nested = '<svg width="120" height="100" viewBox="0 0 120 100"><g id="outer" transform="translate(3 2)" fill="#369"><g id="left" transform="translate(10 12)"><g id="inner" transform="rotate(10 10 10)"><rect id="a" width="16" height="16"/><rect id="b" x="24" width="10" height="10" fill="red"/></g></g><g id="right" transform="translate(75 30) scale(1.2)"><circle id="c" cx="10" cy="10" r="8" fill="blue"/></g></g></svg>';

test("manual grouping accepts separated siblings at the frontmost selected position without adding intervening layers", async () => {
  const operation = op(["c", "a"]), doc = editVectorDocument(source, { operations: [operation] });
  assert.deepEqual(doc.layers.filter(layer => layer.parentKey === operation.id).map(layer => layer.key), ["a", "c"]);
  assert.deepEqual(doc.layers.filter(layer => !layer.parentKey).map(layer => layer.key), ["b", operation.id, "d"]);
  const pixels = await raster(doc.svg);
  assert.deepEqual([...pixels.subarray((30 * 120 + 30) * 4, (30 * 120 + 30) * 4 + 4)], [255, 0, 0, 255]);
  const ungrouped = editVectorDocument(source, { operations: [operation, { type: "ungroup", keys: [operation.id] }] });
  assert.deepEqual(await raster(ungrouped.svg), pixels);
  assert.deepEqual(await raster(editVectorDocument(source, { operations: [] }).svg), await raster(source), "undo restores original stack");
  assert.throws(() => editVectorDocument(source, { operations: [{ ...operation, mode: undefined }] }), /adjacent/, "legacy/automatic grouping never moves separated layers");
});

test("manual groups across ordinary nested folders retain world transforms, inherited common paint, and pixels", async () => {
  const operation = op(["c", "a"]), before = editVectorDocument(nested);
  const plan = vectorSelectionGroup(before.layers, operation.keys);
  assert.equal(plan.reason, ""); assert.equal(plan.parentKey, "outer");
  const after = editVectorDocument(nested, { operations: [operation] });
  assert.deepEqual(after.layers.filter(layer => layer.parentKey === operation.id).map(layer => layer.key), ["a", "c"]);
  assert.equal(after.layers.find(layer => layer.key === "b").parentKey, "inner");
  assert.equal(after.layers.find(layer => layer.key === operation.id).parentKey, "outer");
  assert.deepEqual(await raster(after.svg), await raster(before.svg));
  assert.deepEqual(await raster(editVectorDocument(nested, { operations: [operation, { type: "ungroup", keys: [operation.id] }] }).svg), await raster(before.svg));
  assert.equal(after.layers.find(layer => layer.key === "right").canReparent, true, "empty source folders are kept");
});

test("manual grouping normalizes parent and child selections without duplicating objects", async () => {
  const operation = op(["left", "a", "right", "c", "left"]);
  const doc = editVectorDocument(nested, { operations: [operation] });
  assert.deepEqual(doc.layers.filter(layer => layer.parentKey === operation.id).map(layer => layer.key), ["left", "right"]);
  assert.equal(doc.layers.filter(layer => layer.key === "a").length, 1);
  assert.deepEqual(await raster(doc.svg), await raster(nested));
  assert.match(vectorSelectionGroup(editVectorDocument(nested).layers, ["left", "a"]).reason, /two layers/);
  assert.throws(() => editVectorDocument(nested, { operations: [op(["left", "a"])] }), /two layers/);
});

test("grouping refuses to extract children from styled, hidden or clipped folders but allows intact folders", async () => {
  for (const attrs of ['opacity=".5"', 'fill="red"', 'display="none"', 'clip-path="url(#clip)"']) {
    const svg = nested.replace('<g id="left"', `<g id="left" ${attrs}`).replace('<g id="outer"', '<defs><clipPath id="clip"><rect width="50" height="60"/></clipPath></defs><g id="outer"');
    const layers = editVectorDocument(svg).layers;
    assert.match(vectorSelectionGroup(layers, ["a", "c"]).reason, /clipping or appearance/);
    assert.throws(() => editVectorDocument(svg, { operations: [op(["a", "c"])] }), /clipping or appearance/);
    const whole = editVectorDocument(svg, { operations: [op(["left", "right"])] });
    assert.deepEqual(await raster(whole.svg), await raster(svg));
    const inside = editVectorDocument(svg, { operations: [op(["a", "b"])] });
    assert.deepEqual(await raster(inside.svg), await raster(svg));
  }
});

test("grouping shares lock protection and bounded selection validation between UI and backend", () => {
  for (const lockedKeys of [["a"], ["left"], ["outer"]]) {
    const doc = editVectorDocument(nested, { lockedKeys });
    assert.match(vectorSelectionGroup(doc.layers, ["left", "right"]).reason, /Unlock/);
    assert.throws(() => editVectorDocument(nested, { lockedKeys, operations: [op(["left", "right"])] }), /Unlock/);
  }
  const doc = editVectorDocument(source);
  assert.match(vectorSelectionGroup(doc.layers, ["missing", "a"]).reason, /selection has changed/);
  assert.match(vectorSelectionGroup(doc.layers, Array(1001).fill("a").concat("c")).reason, /1,000/);
  assert.match(vectorSelectionGroup([...doc.layers, ...Array.from({ length: 4996 }, (_, i) => ({ key: `extra${i}`, parentKey: "", index: i + 4 }))], ["a", "c"]).reason, /simplify/);
  assert.throws(() => editVectorDocument(source, { operations: [{ ...op(["a", "b"]), mode: "other" }] }), /grouping mode/);
});

test("row selection keeps Cmd/Ctrl choices, sibling Shift ranges, and additive cross-folder Shift picks", () => {
  const layers = editVectorDocument(nested).layers;
  assert.deepEqual(vectorRowSelection(layers, ["a"], "a", "c", { toggle: true }), ["a", "c"]);
  assert.deepEqual(vectorRowSelection(layers, ["a", "c"], "a", "c", { toggle: true }), ["a"]);
  assert.deepEqual(vectorRowSelection(layers, ["a"], "a", "c", { shift: true }), ["a", "c"]);
  assert.deepEqual(vectorRowSelection(layers, ["c", "a"], "a", "b", { shift: true }), ["a", "b"]);
  assert.deepEqual(vectorRowSelection(layers, ["c", "a"], "a", "b", { shift: true, toggle: true }), ["c", "a", "b"]);
  assert.deepEqual(vectorRowSelection(layers, ["c"], null, "a", { shift: true }), ["c", "a"]);
});

test("new manual grouping drafts require backend support before inspect/save/naming without replay", async t => {
  const routes = { vectorLayers: true, vectorLayerEditor: true, vectorLayerTransforms: true, vectorLayerOrganization: true, vectorLayerAutoGroups: true, vectorArtworkEditor: true };
  const mocked = t.mock.method(globalThis, "fetch", async () => Response.json({ routes }));
  for (const action of ["inspectLayers", "saveLayers", "nameLayers"]) {
    for (const operations of [[op(["a", "c"])], [{ type: "batch", operations: [op(["a", "c"])] }]]) {
      await assert.rejects(ideogramVectorApi[action]({ editorVersion: 6, operations }), /Restart.*grouping across/);
    }
  }
  assert.ok(mocked.mock.calls.every(call => call.arguments[0] === "/api/health"));
});
