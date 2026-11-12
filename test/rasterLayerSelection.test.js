import test from "node:test";
import assert from "node:assert/strict";
import { sameRasterLayers, selectRasterLayers, rasterSelectionBounds, translateRasterLayers, resizeRasterSelection, rotateRasterSelection, duplicateRasterSelection, dropRasterSelection, rasterComparisonPercent } from "../src/rasterLayerSelection.js";
import { rotateLayerPoint, rotatedLayerBounds } from "../src/rasterLayerGeometry.js";

const layer = (id, x, y, locked = false) => ({ id, name: id, url: `/outputs/${id}.png`, x, y, width: 100, height: 50, visible: true, locked, opacity: 1 });
const document = { id: "test", width: 800, height: 450, layers: [layer("a", 100, 100), layer("b", 300, 200), layer("c", 500, 250, true)] };

test("Layer equality ignores property insertion order but preserves layer order and edits", () => {
  const reordered = document.layers.map(item => Object.fromEntries(Object.entries(item).reverse()));
  assert.equal(sameRasterLayers(document.layers, reordered), true);
  assert.equal(sameRasterLayers(document.layers, [...reordered].reverse()), false);
  assert.equal(sameRasterLayers(document.layers, reordered.slice(1)), false);
  assert.equal(sameRasterLayers(document.layers, reordered.map(item => ({ ...item, visible: false }))), false);
});

test("Shift selection toggles membership and a drag keeps the existing selection", () => {
  assert.deepEqual(selectRasterLayers(document.layers, ["a"], "b", { toggle: true }), ["a", "b"]);
  assert.deepEqual(selectRasterLayers(document.layers, ["a", "b"], "a", { toggle: true }), ["b"]);
  assert.deepEqual(selectRasterLayers(document.layers, ["a", "b"], "a", { keep: true }), ["a", "b"]);
  assert.deepEqual(selectRasterLayers(document.layers, ["a", "b"], "a"), ["a"]);
  assert.deepEqual(selectRasterLayers(document.layers, ["gone", "b"], "missing"), ["b"]);
});

test("Multi-layer translation preserves spacing at boundaries and does not move locked layers", () => {
  const moved = translateRasterLayers(document, ["a", "b", "c"], 50, -20);
  assert.deepEqual(moved.map(({ x, y }) => [x, y]), [[150, 80], [350, 180], [500, 250]]);
  assert.equal(moved[2], document.layers[2]);
  for (const delta of [-100000, 100000]) {
    const bounded = translateRasterLayers(document, ["a", "b"], delta, delta);
    assert.equal(bounded[1].x - bounded[0].x, 200);
    assert.equal(bounded[1].y - bounded[0].y, 100);
    assert.ok(bounded.every(item => Math.abs(item.x) <= 3200 && Math.abs(item.y) <= 1800));
  }
});

test("Selected layers scale around the shared opposite corner with locks and limits preserved", () => {
  const ids = ["a", "b", "c"];
  assert.deepEqual(rasterSelectionBounds(document.layers, ids), { x: 100, y: 100, width: 300, height: 150 });
  const next = resizeRasterSelection(document, ids, "nw", -300, -150);
  assert.deepEqual(next.map(({ x, y, width, height }) => [x, y, width, height]), [[-200, -50, 200, 100], [200, 150, 200, 100], [500, 250, 100, 50]]);
  assert.equal(document.layers[0].x, 100);
  assert.throws(() => resizeRasterSelection(document, ids, "nw", -100000, -100000), /Invalid layer/);
});

test("Batch duplication and reordering preserve paint order and skip locked layers", () => {
  let id = 0;
  const next = duplicateRasterSelection(document, ["a", "b", "c"], () => `copy${++id}`);
  assert.deepEqual(next.selectedIds, ["copy1", "copy2"]);
  assert.deepEqual(next.layers.map(item => item.id), ["a", "copy1", "b", "copy2", "c"]);
  assert.equal(next.layers[1].url, "/outputs/a.png");
  assert.equal(next.layers[1].name, "a copy"); assert.equal(document.layers.length, 3);
  assert.throws(() => duplicateRasterSelection({ ...document, width: 8192, height: 4000, layers: document.layers.map(item => ({ ...item, width: 8192, height: 4000 })) }, ["a"], () => "extra"), /too large/);
  assert.throws(() => duplicateRasterSelection({ ...document, layers: Array.from({ length: 24 }, (_, i) => layer(`${i}`, 0, 0)) }, ["0", "1"], () => `extra${++id}`), /1-24/);
  const stack = [layer("a", 0, 0), layer("b", 0, 0), layer("c", 0, 0), layer("d", 0, 0)];
  assert.deepEqual(dropRasterSelection(stack, ["a", "b"], "d").map(item => item.id), ["c", "d", "a", "b"]);
  assert.equal(dropRasterSelection(document.layers, ["a"], "c"), document.layers);
});

test("Comparison wipe uses displayed bounds, preserves grab offset and clamps both ends", () => {
  assert.equal(rasterComparisonPercent(350, { left: 100, width: 1000 }), 25);
  assert.equal(rasterComparisonPercent(360, { left: 100, width: 1000 }, 10), 25);
  assert.equal(rasterComparisonPercent(600, { left: 100, width: 2000 }), 25);
  assert.equal(rasterComparisonPercent(-100, { left: 100, width: 1000 }), 0);
  assert.equal(rasterComparisonPercent(2000, { left: 100, width: 1000 }), 100);
});

test("Rotation preserves single centers, snaps absolute angles and rotates groups around a shared pivot without moving locked layers", () => {
  const single = rotateRasterSelection(document, ["a"], 93, true);
  assert.equal(single[0].rotation, 90); assert.equal(single[0].x, 100); assert.equal(single[0].y, 100);
  const bounds = rasterSelectionBounds(single, ["a"]);
  assert.ok(Math.abs(bounds.width - 50) < 1e-6 && Math.abs(bounds.height - 100) < 1e-6);
  const angled = { ...document, layers: document.layers.map((item, i) => i ? item : { ...item, rotation: 7 }) };
  assert.equal(rotateRasterSelection(angled, ["a"], 3, true)[0].rotation, 15);
  const group = rotateRasterSelection(document, ["a", "b", "c"], 90);
  assert.deepEqual(group.map(({ x, y, rotation }) => [x, y, rotation || 0]), [[250, 50, 90], [150, 250, 90], [500, 250, 0]]);
  assert.equal(sameRasterLayers(single, document.layers), false);
  assert.equal(sameRasterLayers(rotateRasterSelection(document, ["a"], 360), document.layers), true);
  assert.deepEqual(rotateRasterSelection(document, ["c"], 30), document.layers);
  assert.deepEqual(rotateRasterSelection(document, ["a"], NaN), document.layers);
});

test("Rotated resizing holds the opposite corner fixed and keeps rotation through move and duplication", () => {
  const doc = { ...document, layers: rotateRasterSelection(document, ["a"], 32) };
  const cornerPoint = (layer, corner) => {
    const offset = rotateLayerPoint((corner.includes("w") ? -1 : 1) * layer.width / 2, (corner.includes("n") ? -1 : 1) * layer.height / 2, layer.rotation);
    return { x: layer.x + layer.width / 2 + offset.x, y: layer.y + layer.height / 2 + offset.y };
  };
  for (const [corner, opposite] of [["nw", "se"], ["ne", "sw"], ["sw", "ne"], ["se", "nw"]]) {
    const delta = rotateLayerPoint(corner.includes("w") ? -30 : 30, corner.includes("n") ? -15 : 15, 32);
    const next = resizeRasterSelection(doc, ["a"], corner, delta.x, delta.y)[0];
    assert.equal(next.rotation, 32); assert.equal(next.width, 130); assert.equal(next.height, 65);
    const before = cornerPoint(doc.layers[0], opposite), after = cornerPoint(next, opposite);
    assert.ok(Math.hypot(before.x - after.x, before.y - after.y) < .8);
  }
  assert.equal(translateRasterLayers(doc, ["a"], 2, 2)[0].rotation, 32);
  assert.equal(duplicateRasterSelection(doc, ["a"], () => "copy").layers[1].rotation, 32);
  const large = rotatedLayerBounds({ x: 0, y: 0, width: 500, height: 500, rotation: 45 });
  assert.ok(large.width > 700 && large.height > 700);
});
