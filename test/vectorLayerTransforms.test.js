import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { applyToPoint, compose, inverse, scale, translate } from "transformation-matrix";
import { vectorCanvasMatrix, vectorGestureTransform, vectorTransformUpdates } from "../src/vectorLayerTransforms.js";
import { editVectorDocument } from "../server/vector-layers.js";
import { ideogramVectorApi } from "../src/api/newtApi.js";

const svg = '<svg width="100" height="100"><rect id="box" x="10" y="20" width="20" height="10" fill="#0f0"/></svg>';
const raster = async svg => sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer();
const bounds = async svg => {
  const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let left = info.width, top = info.height, right = -1, bottom = -1;
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 4) { left = Math.min(left, x); top = Math.min(top, y); right = Math.max(right, x); bottom = Math.max(bottom, y); }
  return { left, top, width: right - left + 1, height: bottom - top + 1 };
};
const edit = (source, keys, matrix, extra = {}) => editVectorDocument(source, { ...extra, operations: [{ type: "transform", keys, matrix }] });
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-7, `${a} matches ${b}`);

test("move/resize edits actual SVG geometry while retaining originals, names and alpha", async () => {
  const moved = edit(svg, ["box"], translate(15, 5));
  assert.deepEqual(await bounds(moved.svg), { left: 25, top: 25, width: 20, height: 10 });
  assert.equal(moved.layers[0].key, "box"); assert.equal(moved.layers[0].name, "box");
  const enlarged = edit(svg, ["box"], scale(2, 2, 10, 20));
  assert.deepEqual(await bounds(enlarged.svg), { left: 10, top: 20, width: 40, height: 20 });
  assert.deepEqual(await bounds(svg), { left: 10, top: 20, width: 20, height: 10 });
  assert.deepEqual(await raster(editVectorDocument(svg).svg), await raster(svg));
});

test("screen-space movement is correct for rotated/scaled parents and existing child transforms", async () => {
  const source = '<svg width="100" height="100"><g id="parent" transform="translate(70 10) rotate(90) scale(2)"><rect id="child" transform="translate(5 5)" width="10" height="5" fill="#f00"/></g></svg>';
  const before = await bounds(source), after = await bounds(edit(source, ["child"], translate(-8, 12)).svg);
  assert.deepEqual(after, { ...before, left: before.left - 8, top: before.top + 12 });
});

test("viewBox offsets, root transforms and letterboxing retain pixel-space gestures", async () => {
  for (const aspect of ["xMidYMid meet", "xMinYMin meet", "xMaxYMax meet", "none"]) {
    const source = `<svg width="200" height="100" viewBox="10 20 100 100" preserveAspectRatio="${aspect}" transform="translate(2 3)"><rect id="box" x="20" y="30" width="10" height="10" fill="#00f"/></svg>`;
    const before = await bounds(source), after = await bounds(edit(source, ["box"], translate(5, 7)).svg);
    assert.deepEqual(after, { ...before, left: before.left + 5, top: before.top + 7 });
  }
  const matrix = vectorCanvasMatrix({ width: 200, height: 100, viewBox: [10, 20, 100, 100] });
  assert.deepEqual(applyToPoint(matrix, { x: 10, y: 20 }), { x: 50, y: 0 });
});

test("selected ancestors and children transform once and mixed parents preserve their relationships", async () => {
  const source = '<svg width="100" height="100"><g id="group" transform="translate(10 0)"><rect id="a" width="10" height="10"/></g><g id="other" transform="scale(2)"><rect id="b" x="20" width="5" height="5"/></g></svg>';
  const result = edit(source, ["group", "a", "b"], translate(5, 6));
  assert.deepEqual(await bounds(result.svg), { left: 15, top: 6, width: 40, height: 10 });
  assert.ok(!result.svg.match(/<rect id="a"[^>]*transform=/));
});

test("group movement carries clips and opacity without altering sibling artwork", async () => {
  const source = '<svg width="100" height="100"><defs><clipPath id="clip"><rect width="10" height="10"/></clipPath></defs><g id="g" opacity=".5" clip-path="url(#clip)"><rect id="a" width="50" height="50" fill="#f00"/></g></svg>';
  const result = edit(source, ["g"], translate(20, 30));
  assert.deepEqual(await bounds(result.svg), { left: 20, top: 30, width: 10, height: 10 });
  assert.match(result.svg, /clip-path="url\(#clip\)"/);
  const data = await raster(result.svg); assert.ok(Math.abs(data[(35 * 100 + 25) * 4 + 3] - 128) <= 1);
});

test("locked selections, locked descendants and collapsed parents are rejected", () => {
  assert.throws(() => edit(svg, ["box"], translate(1, 0), { lockedKeys: ["box"] }), /Unlock/);
  const group = svg.replace('<rect', '<g id="group"><rect').replace('</svg>', '</g></svg>');
  assert.throws(() => edit(group, ["group"], scale(2), { lockedKeys: ["box"] }), /Unlock/);
  assert.throws(() => edit(group.replace('id="group"', 'id="group" transform="scale(0)"'), ["box"], translate(1, 0)), /collapsed/);
});

test("malformed/unsafe transforms fail before saving, including unsupported rotation and flips", () => {
  for (const matrix of [null, {}, { ...translate(1, 0), e: Infinity }, { ...translate(1, 0), f: "2" }, scale(0), scale(-1), scale(101), { ...scale(1), b: .1 }]) assert.throws(() => edit(svg, ["box"], matrix));
  assert.throws(() => edit(svg, [], translate(1, 0)), /Select/);
  assert.throws(() => edit(svg, ["missing"], translate(1, 0)), /selected layers/);
});

test("corner resizing anchors the opposite corner, defaults to proportions, and supports free/center resizing", () => {
  const box = { left: 10, top: 20, width: 40, height: 20 };
  const proportional = vectorGestureTransform(box, "se", 20, 0);
  assert.deepEqual(proportional.box, { left: 10, top: 20, width: 60, height: 30 });
  assert.deepEqual(vectorGestureTransform(box, "se", 20, 0, { free: true }).box, { ...box, width: 60 });
  const center = vectorGestureTransform(box, "se", 10, 5, { center: true }).box;
  close(center.left + center.width / 2, 30); close(center.top + center.height / 2, 30);
  for (const handle of ["nw", "ne", "sw", "se"]) {
    const result = vectorGestureTransform(box, handle, 3, -2);
    const anchor = { x: handle.includes("w") ? 50 : 10, y: handle.includes("n") ? 40 : 20 };
    const point = applyToPoint(result.matrix, anchor); close(point.x, anchor.x); close(point.y, anchor.y);
  }
  const tiny = vectorGestureTransform(box, "se", -1000, -1000).box;
  assert.ok(tiny.width > 0 && tiny.height > 0, "crossing an anchor never flips or collapses the layer");
});

test("side resize only changes one axis and SVG transform grammar is parsed by the shared library", () => {
  const box = { left: 10, top: 20, width: 40, height: 20 };
  assert.deepEqual(vectorGestureTransform(box, "e", 10, 99).box, { ...box, width: 50 });
  const layers = [{ key: "p", parentKey: "", transform: "translate(10, 20) skewX(15)" }, { key: "c", parentKey: "p", transform: "matrix(1 0 0 1 5 0)" }];
  assert.match(vectorTransformUpdates(layers, ["c"], translate(3, 4))[0].transform, /^matrix\(/);
  const matrix = compose(translate(10, 20), scale(2));
  assert.deepEqual(applyToPoint(compose(inverse(matrix), matrix), { x: 3, y: 4 }), { x: 3, y: 4 });
});

test("moving/resizing requires its backend capability before any edit request", async t => {
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json({ routes: { vectorLayers: true, vectorLayerEditor: true } }));
  await assert.rejects(ideogramVectorApi.inspectLayers({ editorVersion: 3 }), /Restart.*moving and resizing/);
  await assert.rejects(ideogramVectorApi.saveLayers({ editorVersion: 3 }), /Restart.*moving and resizing/);
  await assert.rejects(ideogramVectorApi.nameLayers({ editorVersion: 3 }), /Restart.*moving and resizing/);
  assert.ok(mock.mock.calls.every(call => call.arguments[0] === "/api/health"));
});
