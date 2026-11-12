import test from "node:test";
import assert from "node:assert/strict";
import { validateLayerDocument } from "../src/imageLayers.js";
import { groupRasterLayers, ungroupRasterFolder, duplicateRasterFolder, moveRasterLayersToFolder, moveRasterStackToRoot, reorderRasterStack, rasterStackEntries, rasterLayerVisible, rasterLayerLocked, sameRasterFolders } from "../src/rasterLayerFolders.js";
import { translateRasterLayers, resizeRasterSelection, rotateRasterSelection, duplicateRasterSelection, sameRasterLayers } from "../src/rasterLayerSelection.js";
import { originalLayerSeparation, retainLayerSeparation, imageLayersInitialState, imageLayersResult } from "../src/imageEditLayers.js";

const make = () => ({ id: "doc", name: "Separation", width: 100, height: 100, sourceUrl: "/uploads/source.png", layers: ["a", "b", "c", "d"].map((id, index) => ({ id, name: id.toUpperCase(), url: `/outputs/${id}.png`, x: index * 10, y: 10, width: 20, height: 20, visible: true, locked: false, opacity: 1 })), items: [{ url: "/outputs/composite.png" }] });
const order = doc => doc.layers.map(layer => layer.id);

test("Folders group selected layers contiguously, retain their order and do not flatten pixels", () => {
  const doc = make(), grouped = groupRasterLayers(doc, ["b", "d"], "f");
  assert.deepEqual(order(grouped), ["a", "c", "b", "d"]);
  assert.deepEqual(grouped.folders, [{ id: "f", name: "Folder 1", visible: true, locked: false, collapsed: false }]);
  assert.deepEqual(grouped.layers.map(layer => layer.folderId), [undefined, undefined, "f", "f"]);
  assert.deepEqual(grouped.layers.map(layer => layer.url), ["/outputs/a.png", "/outputs/c.png", "/outputs/b.png", "/outputs/d.png"]);
  assert.equal(rasterStackEntries(grouped.layers, grouped.folders).length, 3);
  assert.deepEqual(validateLayerDocument(grouped).folders, grouped.folders);
  assert.equal(doc.folders, undefined);
  const ungrouped = ungroupRasterFolder(grouped, "f");
  assert.deepEqual(order(ungrouped), order(grouped)); assert.deepEqual(ungrouped.folders, []);
  assert.ok(ungrouped.layers.every(layer => layer.folderId === undefined));
});

test("Folder membership, identifiers and contiguous order are validated without altering legacy documents", () => {
  const doc = make(), folder = { id: "f", name: "Subjects" };
  assert.equal(validateLayerDocument(doc).folders, undefined);
  for (const folders of [null, {}, [folder, folder], [{ id: "a" }], [{ id: "" }], Array(25).fill(folder)]) {
    assert.throws(() => validateLayerDocument({ ...doc, folders }));
  }
  assert.throws(() => validateLayerDocument({ ...doc, folders: [folder] }), /stay together/);
  assert.throws(() => validateLayerDocument({ ...doc, layers: doc.layers.map(layer => ({ ...layer, folderId: "missing" })) }), /membership/);
  assert.throws(() => validateLayerDocument({ ...doc, folders: [folder], layers: doc.layers.map((layer, i) => i % 2 ? { ...layer, folderId: "f" } : layer) }), /stay together/);
});

test("Folder hide and lock are inherited without replacing child settings and protect transforms", () => {
  const grouped = groupRasterLayers(make(), ["b", "c"], "f");
  grouped.layers[2].visible = false;
  grouped.folders[0].visible = false; grouped.folders[0].locked = true;
  assert.equal(rasterLayerVisible(grouped.layers[1], grouped.folders), false);
  assert.equal(rasterLayerLocked(grouped.layers[1], grouped.folders), true);
  assert.deepEqual(translateRasterLayers(grouped, ["b", "c"], 10, 10), grouped.layers);
  assert.deepEqual(resizeRasterSelection(grouped, ["b", "c"], "se", 10, 10), grouped.layers);
  assert.deepEqual(rotateRasterSelection(grouped, ["b", "c"], 30), grouped.layers);
  assert.deepEqual(duplicateRasterSelection(grouped, ["b", "c"], () => "new").selectedIds, []);
  assert.equal(ungroupRasterFolder(grouped, "f"), grouped);
  assert.equal(moveRasterLayersToFolder(grouped, ["b"]), grouped);
  assert.equal(groupRasterLayers(grouped, ["b"], "other"), grouped);
  grouped.folders[0].visible = true; grouped.folders[0].locked = false;
  assert.equal(rasterLayerVisible(grouped.layers[1], grouped.folders), true);
  assert.equal(rasterLayerVisible(grouped.layers[2], grouped.folders), false);
  assert.equal(rasterLayerLocked(grouped.layers[1], grouped.folders), false);
});

test("Moving in/out and reordering folders keep whole blocks and clean empty folders", () => {
  let doc = groupRasterLayers(make(), ["b", "c"], "f");
  doc = moveRasterLayersToFolder(doc, ["d"], "f");
  assert.deepEqual(order(doc), ["a", "b", "c", "d"]);
  assert.deepEqual(doc.layers.filter(layer => layer.folderId).map(layer => layer.id), ["b", "c", "d"]);
  doc = moveRasterLayersToFolder(doc, ["c"]);
  validateLayerDocument(doc); assert.equal(doc.layers.find(layer => layer.id === "c").folderId, undefined);
  doc = reorderRasterStack(doc, ["b", "d"], "a", "f");
  assert.deepEqual(order(doc).slice(0, 2), ["b", "d"]); validateLayerDocument(doc);
  doc = moveRasterLayersToFolder(doc, ["b", "d"]);
  assert.deepEqual(doc.folders, []); validateLayerDocument(doc);
});

test("Folder edits participate in dirty checks and survive versions, reset baselines and canvas metadata", () => {
  const doc = make(), grouped = groupRasterLayers(doc, ["b", "c"], "f");
  assert.equal(sameRasterLayers(grouped.layers, doc.layers), false);
  assert.equal(sameRasterFolders(grouped.folders, [{ ...grouped.folders[0], collapsed: true }]), false);
  const saved = retainLayerSeparation({ ...grouped, id: "edited", name: "Edited" }, doc);
  const state = imageLayersInitialState(imageLayersResult(saved));
  assert.deepEqual(state.layersDocuments[0].folders, grouped.folders);
  assert.equal(originalLayerSeparation(saved).folders, undefined);
  assert.deepEqual(originalLayerSeparation({ ...grouped, name: "Separation" }).folders, grouped.folders);
});

test("Folder duplication creates independent identities and honors locked members and image budgets", () => {
  const doc = groupRasterLayers(make(), ["b", "c"], "f"); let id = 0;
  const duplicate = duplicateRasterFolder(doc, "f", () => `copy-${++id}`);
  validateLayerDocument(duplicate);
  assert.equal(duplicate.folders.length, 2); assert.equal(duplicate.folders[1].name, "Folder 1 copy");
  assert.deepEqual(order(duplicate), ["a", "b", "c", "copy-2", "copy-3", "d"]);
  assert.deepEqual(duplicate.selectedIds, ["copy-2", "copy-3"]);
  assert.equal(duplicate.selectedFolderId, "copy-1");
  assert.equal(duplicate.layers[3].url, doc.layers[1].url);
  doc.layers[1].locked = true;
  assert.equal(duplicateRasterFolder(doc, "f", () => "unused"), doc);
});

test("Root drop areas release a layer even when every layer is inside the same folder", () => {
  const grouped = groupRasterLayers(make(), ["a", "b", "c", "d"], "all"), original = structuredClone(grouped);
  const above = moveRasterStackToRoot(grouped, ["b"], { anchorId: "all", edge: "above" });
  validateLayerDocument(above); assert.deepEqual(order(above), ["a", "c", "d", "b"]);
  assert.equal(above.layers.at(-1).folderId, undefined);
  const { folderId, ...before } = grouped.layers[1]; assert.deepEqual(above.layers.at(-1), before);
  assert.deepEqual(grouped, original, "the prior stack remains available to Undo");
  const below = moveRasterStackToRoot(grouped, ["c", "b"], { edge: "bottom" });
  validateLayerDocument(below); assert.deepEqual(order(below), ["b", "c", "a", "d"]);
  assert.ok(below.layers.slice(0, 2).every(layer => !layer.folderId));
  const all = moveRasterStackToRoot(grouped, ["a", "b", "c", "d"]);
  assert.deepEqual(all.folders, []); assert.deepEqual(order(all), ["a", "b", "c", "d"]);
});

test("Root drops choose exact stack boundaries without splitting neighboring folders", () => {
  const grouped = groupRasterLayers(make(), ["b", "c"], "middle");
  for (const [anchorId, expected] of [["d", ["a", "c", "d", "b"]], ["middle", ["a", "c", "b", "d"]], ["a", ["a", "b", "c", "d"]]]) {
    const next = moveRasterStackToRoot(grouped, ["b"], { edge: "above", anchorId });
    validateLayerDocument(next); assert.deepEqual(order(next), expected); assert.equal(next.layers.find(layer => layer.id === "b").folderId, undefined);
  }
  assert.equal(moveRasterStackToRoot(grouped, ["b"], { edge: "above", anchorId: "missing" }), grouped);
});

test("Nested layers and complete folders can be moved to the root while preserving descendants and locks", () => {
  let grouped = groupRasterLayers(make(), ["a", "b", "c", "d"], "all");
  grouped = groupRasterLayers(grouped, ["b", "c"], "nested");
  const layers = moveRasterStackToRoot(grouped, ["b", "c"], { edge: "bottom" });
  validateLayerDocument(layers); assert.deepEqual(order(layers), ["b", "c", "a", "d"]);
  assert.deepEqual(layers.folders.map(folder => folder.id), ["all"]);
  const folder = moveRasterStackToRoot(grouped, ["b", "c"], { folderId: "nested", edge: "top" });
  validateLayerDocument(folder); assert.deepEqual(order(folder), ["a", "d", "b", "c"]);
  assert.equal(folder.folders.find(item => item.id === "nested").parentId, undefined);
  assert.ok(folder.layers.slice(-2).every(layer => layer.folderId === "nested"));
  assert.equal(moveRasterStackToRoot(grouped, ["b"], { folderId: "nested" }), grouped, "whole-folder drops cannot leave children behind");
  grouped.folders[0].locked = true;
  assert.equal(moveRasterStackToRoot(grouped, ["b"]), grouped);
  assert.equal(moveRasterStackToRoot(grouped, ["b", "c"], { folderId: "nested" }), grouped);
});
