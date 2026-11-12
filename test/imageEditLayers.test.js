import test from "node:test";
import assert from "node:assert/strict";
import { imageLayersInitialState, imageLayersResult, imageLayersSessionKey, readImageLayersSession, saveImageLayersSession, resizeRasterLayer, originalLayerSeparation, retainLayerSeparation } from "../src/imageEditLayers.js";
import { layersOutputPatch } from "../src/imageLayers.js";
const layer = { id: "a", name: "Subject", url: "/outputs/subject.png", x: 100, y: 80, width: 200, height: 100, opacity: 1, visible: true, locked: false };
const document = { id: "doc", width: 800, height: 450, sourceUrl: "/uploads/base.png", layers: [layer], items: [{ url: "/outputs/composite.png", type: "image", width: 800, height: 450 }] };

test("Reset retains the original separation through versions and portable image metadata without recursive copies", () => {
  const original = retainLayerSeparation(document, document);
  const edited = retainLayerSeparation({ ...document, id: "edited", layers: [{ ...layer, x: 300, visible: false }] }, originalLayerSeparation(original));
  const next = retainLayerSeparation({ ...edited, id: "edited-again", layers: [{ ...layer, x: 400 }] }, originalLayerSeparation(edited));
  const reopened = imageLayersInitialState(imageLayersResult(JSON.parse(JSON.stringify(next))));
  assert.equal(originalLayerSeparation(reopened.layersDocuments[0]).layers[0].x, 100);
  assert.equal(originalLayerSeparation(next).layers[0].visible, true);
  assert.equal(next.originalSeparation.originalSeparation, undefined); assert.equal(next.originalSeparation.items, undefined);
  assert.equal(edited.layers[0].x, 300);
});

test("Legacy reset only matches the actual separation, not another generation of the same source", () => {
  const original = { ...document, name: "Separation" };
  const other = { ...original, id: "other", layers: [{ ...layer, id: "another", url: "/outputs/other.png", x: 500 }] };
  const edited = { ...document, id: "saved", name: "Edited", layers: [{ ...layer, x: 300 }] };
  assert.equal(originalLayerSeparation(edited, [other, original]).id, original.id);
  for (const name of ["Separation", "Edited"]) {
    const unsaved = { ...original, name, layers: [{ ...layer, x: 300 }] };
    assert.equal(originalLayerSeparation(unsaved, [original, other]).layers[0].x, 100, "saving a legacy draft keeps the stored original, not the draft");
  }
  assert.equal(originalLayerSeparation({ ...original, name: "Edited", layers: [{ ...layer, id: "copy", x: 400 }] }, [original]).layers[0].x, 100);
  assert.equal(originalLayerSeparation(edited, [other]), null);
  assert.equal(originalLayerSeparation({ ...edited, originalSeparation: { ...original, sourceUrl: "/uploads/other.png" } }), null);
  assert.equal(originalLayerSeparation({ ...edited, originalSeparation: { ...original, width: 99999 } }), null);
});

test("Advanced Layers results retain reusable layer documents without claiming edited pixels have the original layers", () => {
  const item = imageLayersResult(document), state = imageLayersInitialState(item);
  assert.equal(item.url, document.items[0].url); assert.equal(state.layersDocuments[0], document);
  assert.equal(state.layersDocumentId, "doc"); assert.equal(state.layersJob, null);
  assert.equal(imageLayersInitialState({ ...item, url: "/outputs/cropped.png" }).layersDocuments.length, 0);
  assert.equal(imageLayersInitialState({ ...item, imageLayersDocument: { ...document, width: 99999 } }).layersDocuments.length, 0);
  assert.throws(() => imageLayersResult({}), /Save a layer version/);
});

test("Layer workspace recovery is source/project scoped and restores only data, never a generation", () => {
  const entries = new Map(), storage = { getItem: key => entries.get(key), setItem: (key, value) => entries.set(key, value) };
  const item = { url: "/uploads/base.png" }, key = imageLayersSessionKey(item, { projectId: "a" });
  assert.notEqual(key, imageLayersSessionKey(item, { projectId: "b" }));
  assert.notEqual(key, imageLayersSessionKey({ url: "/uploads/other.png" }, { projectId: "a" }));
  const data = { ...layersOutputPatch([document], document.id), layersJob: { requestId: "pending", status: "running" }, layersDraft: { documentId: "doc", layers: [{ ...layer, x: 200 }] } };
  saveImageLayersSession(key, data, storage);
  const restored = imageLayersInitialState(item, readImageLayersSession(key, storage));
  assert.equal(restored.layersJob.status, "uncertain"); assert.equal(restored.layersDraft.layers[0].x, 200);
  assert.equal(restored.layersDocuments[0].sourceUrl, "/uploads/base.png");
  entries.set(key, "broken json"); assert.equal(readImageLayersSession(key, storage), null);
  assert.throws(() => saveImageLayersSession(key, data, { setItem: () => { throw new Error("quota"); } }), /quota/);
});

test("Four-corner layer resizing preserves aspect ratio and the opposite corner within render budgets", () => {
  for (const [corner, dx, dy] of [["nw", -40, -20], ["ne", 40, -20], ["sw", -40, 20], ["se", 40, 20]]) {
    const result = resizeRasterLayer(layer, corner, dx, dy);
    assert.equal(result.width, 240); assert.equal(result.height, 120);
    assert.equal(corner.includes("w") ? result.x + result.width : result.x, corner.includes("w") ? layer.x + layer.width : layer.x);
    assert.equal(corner.includes("n") ? result.y + result.height : result.y, corner.includes("n") ? layer.y + layer.height : layer.y);
  }
  const large = resizeRasterLayer(layer, "se", 1e9, 1e9);
  assert.ok(large.width <= 8192 && large.height <= 8192 && large.width * large.height <= 36000000);
  assert.ok(resizeRasterLayer(layer, "se", -999, -999).height >= 1);
});
