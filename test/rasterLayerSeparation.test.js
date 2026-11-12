import test from "node:test";
import assert from "node:assert/strict";
import { insertLayerSeparation, layerSeparationCapacity, layerSeparationKey, readLayerSeparation } from "../src/rasterLayerSeparation.js";
import { validateLayerDocument, validateLayersRequest, layersProviderInput } from "../src/imageLayers.js";
import { rasterLayerVisible, rasterLayerLocked, rasterFolderMembers, rasterStackEntries, groupRasterLayers, duplicateRasterFolder, ungroupRasterFolder, reorderRasterStack, moveRasterLayersToFolder } from "../src/rasterLayerFolders.js";
import { confineLayerAlpha, prepareIsolatedLayer } from "../server/image-layer-separation.js";
import { imageLayersApi } from "../src/api/newtApi.js";
import sharp from "sharp";

const layer = (id, folderId) => ({ id, name: id, url: `/outputs/${id}.png`, x: 10, y: 20, width: 100, height: 60, rotation: 32, opacity: .65, visible: true, locked: false, ...(folderId ? { folderId } : {}) });
const original = () => ({ id: "doc", sourceUrl: "/uploads/master.png", width: 800, height: 600,
  layers: [layer("background"), layer("woman", "people"), layer("detail", "people"), layer("foreground")],
  folders: [{ id: "people", name: "People", visible: true, locked: false, collapsed: false }] });
const result = () => ({ id: "result", sourceUrl: "/outputs/woman.png", width: 200, height: 120,
  layers: [layer("dress"), layer("face")].map(item => ({ ...item, x: 0, y: 0, width: 200, height: 120, rotation: 0, opacity: 1 })),
  layerSeparation: { sourceUrl: "/outputs/woman.png", sourceOpacity: .65, alphaProtected: true } });

test("Selected-layer separation inserts a nested folder at the original stack position, preserving transforms and siblings", () => {
  const doc = original(), target = doc.layers[1], before = structuredClone(doc);
  const next = insertLayerSeparation(doc, target, result(), "parts");
  assert.deepEqual(doc, before);
  assert.deepEqual(next.layers.map(item => item.id), ["background", "parts-0", "parts-1", "detail", "foreground"]);
  assert.equal(next.folders[1].parentId, "people"); assert.equal(next.folders[1].name, "woman layers");
  for (const child of next.layers.slice(1, 3)) {
    for (const key of ["x", "y", "width", "height", "rotation"]) assert.equal(child[key], target[key]);
    assert.equal(child.opacity, 1, "source opacity is already protected in child pixels");
  }
  assert.equal(next.layers[0], doc.layers[0]); assert.equal(next.layers[3], doc.layers[2]); assert.equal(next.layers[4], doc.layers[3]);
  assert.equal(rasterStackEntries(next.layers, next.folders)[1].folder.id, "people");
  assert.equal(rasterStackEntries(next.layers, next.folders, "people")[0].folder.id, "parts");
  assert.equal(rasterFolderMembers(next.layers, next.folders, "people").length, 3);
});

test("Separation refuses changed, locked, hidden, mismatched and oversized layer replacements", () => {
  const doc = original(), target = doc.layers[1];
  for (const patch of [{ url: "/outputs/changed.png" }, { rotation: 90 }, { opacity: .3 }, { locked: true }, { visible: false }]) {
    const changed = { ...doc, layers: doc.layers.map(item => item.id === target.id ? { ...item, ...patch } : item) };
    assert.throws(() => insertLayerSeparation(changed, target, result(), "parts"), /source layer has changed/);
  }
  for (const patch of [{ alphaProtected: false }, { sourceUrl: "/uploads/wrong.png" }, { sourceOpacity: 1 }])
    assert.throws(() => insertLayerSeparation(doc, target, { ...result(), layerSeparation: { ...result().layerSeparation, ...patch } }, "parts"), /transparency/);
  assert.equal(layerSeparationCapacity(doc, target), 21);
  const full = { ...doc, folders: [], layers: Array.from({ length: 24 }, (_, i) => layer(`layer-${i}`)) };
  assert.equal(layerSeparationCapacity(full, full.layers[0]), 0);
  const large = { ...doc, width: 4000, height: 4000, folders: [], layers: [layer("a"), layer("b")] };
  assert.equal(layerSeparationCapacity(large, large.layers[1]), 8);
});

test("Nested folders validate ancestry and inherit locks/visibility without changing child pixels", () => {
  const doc = original(), next = insertLayerSeparation(doc, doc.layers[1], result(), "parts");
  const hidden = { ...next, folders: next.folders.map(item => item.id === "people" ? { ...item, visible: false, locked: true } : item) };
  assert.equal(rasterLayerVisible(hidden.layers[1], hidden.folders), false);
  assert.equal(rasterLayerLocked(hidden.layers[1], hidden.folders), true);
  assert.equal(rasterLayerVisible(hidden.layers[4], hidden.folders), true);
  for (const folders of [[...next.folders, { id: "cycle", parentId: "cycle" }], next.folders.map(item => item.id === "parts" ? { ...item, parentId: "missing" } : item), next.folders.map(item => item.id === "people" ? { ...item, parentId: "parts" } : item)])
    assert.throws(() => validateLayerDocument({ ...next, folders }), /folder/);
  const interleaved = [...next.layers]; interleaved.splice(2, 0, interleaved.pop());
  assert.throws(() => validateLayerDocument({ ...next, layers: interleaved }), /stay together/);
});

test("Nested grouping, duplicating, ungrouping and drag order retain a valid paint stack", () => {
  const doc = original(), next = insertLayerSeparation(doc, doc.layers[1], result(), "parts");
  let counter = 0;
  const duplicate = duplicateRasterFolder(next, "people", () => `copy-${++counter}`);
  validateLayerDocument(duplicate); assert.equal(duplicate.layers.length, 8); assert.equal(duplicate.folders.length, 4);
  const ungrouped = ungroupRasterFolder(next, "people"); validateLayerDocument(ungrouped);
  assert.equal(ungrouped.folders[0].parentId, undefined); assert.equal(ungrouped.layers[3].folderId, undefined);
  const subgroup = groupRasterLayers(next, ["parts-0", "parts-1"], "subparts"); validateLayerDocument(subgroup);
  assert.equal(subgroup.folders.at(-1).parentId, "parts");
  const moved = reorderRasterStack(next, ["parts-0", "parts-1"], "foreground", "parts"); validateLayerDocument(moved);
  assert.equal(moved.folders.find(item => item.id === "parts").parentId, undefined);
  assert.deepEqual(moved.layers.map(item => item.id), ["background", "detail", "foreground", "parts-0", "parts-1"]);
  validateLayerDocument(moveRasterLayersToFolder(next, ["parts-0"], ""));
});

test("Sub-separation recovery is document/project/node scoped and restores only a matching source snapshot", () => {
  const doc = original(), key = layerSeparationKey(doc, { projectId: "p" }, "node");
  for (const other of [layerSeparationKey(doc, { projectId: "other" }, "node"), layerSeparationKey(doc, { projectId: "p" }, "other"), layerSeparationKey({ ...doc, id: "other" }, { projectId: "p" }, "node")]) assert.notEqual(key, other);
  const value = { baseline: doc, target: doc.layers[1], data: { layersJob: { requestId: "pending" } } };
  const storage = { getItem: () => JSON.stringify(value) };
  assert.deepEqual(readLayerSeparation(key, storage), value);
  value.target = { ...value.target, url: "/outputs/changed.png" }; assert.equal(readLayerSeparation(key, storage), null);
});

test("Isolated layer preparation handles small crops and sends no private layer settings to the provider", async () => {
  const buffer = await sharp({ create: { width: 20, height: 30, channels: 4, background: { r: 1, g: 2, b: 3, alpha: .5 } } }).png().toBuffer();
  const prepared = await prepareIsolatedLayer({ buffer, width: 20, height: 30 }, 8);
  const meta = await sharp(prepared.buffer).metadata(); assert.ok(meta.width * meta.height >= 262144);
  assert.equal(prepared.width, 20); assert.equal(prepared.height, 30);
  const request = validateLayersRequest({ sourceUrl: "/outputs/woman.png", layerOnly: true, sourceOpacity: .65 });
  const input = layersProviderInput(request, "https://test/source");
  assert.match(input.prompt, /isolated layer/); assert.equal(input.layerOnly, undefined); assert.equal(input.sourceOpacity, undefined);
  for (const sourceOpacity of [-1, 2, null, "1"]) assert.throws(() => validateLayersRequest({ ...request, sourceOpacity }));
  await assert.rejects(prepareIsolatedLayer({ buffer, width: 8000, height: 4000 }, 8), /too large/);
});

test("Alpha allocation preserves source coverage across many overlapping sublayers", () => {
  for (const sourceAlpha of [0, 1, 64, 128, 254, 255]) for (const opacity of [0, .35, 1]) {
    const source = Buffer.from([20, 30, 40, sourceAlpha]), remaining = new Float32Array([1]);
    let composed = 0;
    for (const alpha of [64, 128, 192, 255]) {
      const data = confineLayerAlpha(Buffer.from([100, 50, 20, alpha]), source, remaining, opacity);
      composed += (1 - composed) * data[3] / 255;
      assert.deepEqual([...data.subarray(0, 3)], [100, 50, 20]);
    }
    assert.ok(Math.abs(composed * 255 - sourceAlpha * opacity) <= 2, `${sourceAlpha}, ${opacity}, ${composed}`);
  }
});

test("Selected-layer submission and nested exports stop before contacting an outdated backend", async t => {
  const originalFetch = globalThis.fetch; t.after(() => { globalThis.fetch = originalFetch; });
  const calls = []; let enabled = false;
  globalThis.fetch = async (url, options) => {
    calls.push(String(url));
    return new Response(JSON.stringify(String(url).endsWith("/api/health") ? { routes: { imageLayers: true, imageLayersPsd: true, imageLayerFolders: true, imageLayersRotation: true, imageLayerSeparation: enabled } } : { ok: true }));
  };
  await assert.rejects(imageLayersApi.start({ sourceUrl: "/outputs/a.png", layerOnly: true, sourceOpacity: 1 }), error => error.noSubmission === true);
  const doc = original(), nested = insertLayerSeparation(doc, doc.layers[1], result(), "parts");
  await assert.rejects(imageLayersApi.save({ document: nested }), /Restart NewtNode/);
  assert.ok(calls.every(url => url.endsWith("/api/health")));
  enabled = true; await imageLayersApi.start({ sourceUrl: "/outputs/a.png", layerOnly: true, sourceOpacity: 1 });
  assert.ok(calls.at(-1).endsWith("/api/node/image-layers"));
});
