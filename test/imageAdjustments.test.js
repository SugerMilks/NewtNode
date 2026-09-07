import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { applyImageAdjustmentsToCanvas, curveLookup, defaultCurvePoints, normalizedToneAdjustments, sortedCurvePoints } from "../src/imageAdjustments.js";

function adjusted(pixels, adjustments, points) {
  let data = new Uint8ClampedArray(pixels);
  const context = {
    getImageData: () => ({ data: data.slice() }),
    putImageData: (image) => { data = image.data; }
  };
  applyImageAdjustmentsToCanvas(context, data.length / 4, 1, adjustments, points);
  return [...data];
}

test("the default two-point curve is an exact identity across all 256 channel values", () => {
  assert.deepEqual([...curveLookup()], Array.from({ length: 256 }, (_, i) => i));
  assert.deepEqual([...curveLookup([])], [...curveLookup()]);
  const pixels = Array.from({ length: 256 }, (_, i) => [i, 255 - i, (i * 3) % 256, i]).flat();
  assert.deepEqual(adjusted(pixels), pixels);
  assert.deepEqual(adjusted(pixels, {}), pixels);
});

test("missing or invalid tone fields remain neutral, while slider values are bounded", () => {
  assert.deepEqual(normalizedToneAdjustments({ brightness: "25" }), { brightness: 25, contrast: 0, saturation: 0 });
  assert.deepEqual(normalizedToneAdjustments({ brightness: NaN, contrast: Infinity, saturation: "oops" }), { brightness: 0, contrast: 0, saturation: 0 });
  assert.deepEqual(normalizedToneAdjustments({ brightness: 101, contrast: -101, saturation: 10.4 }), { brightness: 100, contrast: -100, saturation: 10 });
});

test("brightness changes RGB in the requested direction and preserves alpha", () => {
  assert.deepEqual(adjusted([64, 128, 192, 128], { brightness: 20 }), [115, 179, 243, 128]);
  assert.deepEqual(adjusted([64, 128, 192, 128], { brightness: -20 }), [13, 77, 141, 128]);
});

test("contrast expands or compresses values around the midpoint", () => {
  const increased = adjusted([64, 128, 192, 255], { contrast: 30 });
  assert.ok(increased[0] < 64 && increased[1] === 128 && increased[2] > 192);
  assert.deepEqual(adjusted([64, 128, 192, 91], { contrast: -100 }), [128, 128, 128, 91]);
});

test("saturation produces grayscale or stronger color without changing alpha", () => {
  const source = [180, 80, 40, 127];
  const gray = adjusted(source, { saturation: -100 });
  assert.equal(gray[0], gray[1]);
  assert.equal(gray[1], gray[2]);
  assert.equal(gray[3], source[3]);
  const saturated = adjusted(source, { saturation: 50 });
  assert.ok(saturated[0] > source[0] && saturated[2] < source[2]);
});

test("custom curve controls affect pixels and reset restores the unchanged source", () => {
  const source = [128, 128, 128, 255];
  const points = [{ x: 0, y: 100 }, { x: 50, y: 20 }, { x: 100, y: 0 }];
  const output = adjusted(source, {}, points);
  assert.ok(output[0] > 200);
  assert.deepEqual(adjusted(source, {}, defaultCurvePoints), source);
  assert.deepEqual(sortedCurvePoints([...points].reverse()), points);
});

test("two endpoints with adjusted black and white levels remain a linear transform", () => {
  const lookup = curveLookup([{ x: 0, y: 80 }, { x: 100, y: 20 }]);
  for (let i = 0; i < 256; i++) assert.equal(lookup[i], Math.round(51 + (204 - 51) * i / 255));
});

test("preview and saved image paths call the shared pipeline and retain PNG transparency", async () => {
  const preview = await readFile(new URL("../src/components/MediaViews.jsx", import.meta.url), "utf8");
  const editor = await readFile(new URL("../src/NodeEditor.jsx", import.meta.url), "utf8");
  const previewFunction = preview.slice(preview.indexOf("async function createTonePreviewUrl("), preview.indexOf("export function OutputPreviewLightbox("));
  const saveFunction = editor.slice(editor.indexOf("async function createEditedPreviewLayoutImageBlob("), editor.indexOf("function normalizePreviewTextOverlay("));
  assert.match(previewFunction, /applyImageAdjustmentsToCanvas\(context, width, height, adjustments, points\)/);
  assert.match(saveFunction, /applyImageAdjustmentsToCanvas\(context, canvas.width, canvas.height, edit.adjustments, edit.points\)/);
  assert.match(previewFunction, /"image\/png"/);
  assert.match(saveFunction, /"image\/png"/);
  assert.doesNotMatch(editor, /function previewInterpolatedCurveOutput/);
});
