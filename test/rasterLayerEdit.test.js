import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { prepareImageEdit, finishImageEdit } from "../server/image-edit.js";
import { imageEditModels, buildImageEditPrompt } from "../src/imageEdit.js";
import { applyRasterLayerEdit, rasterLayerEditPoint } from "../src/rasterLayerEdit.js";
import { rotateLayerPoint } from "../src/rasterLayerGeometry.js";

const rgba = (bytes, width = 16, height = 16) => sharp(Buffer.from(bytes), { raw: { width, height, channels: 4 } }).png().toBuffer();
const solid = (r, g, b, a) => Array.from({ length: 256 }, () => [r, g, b, a]).flat();
const sourceBytes = Array.from({ length: 256 }, (_, i) => [20, 80, 160, i]).flat();

for (const model of imageEditModels) test(`${model}: layer edits preserve all alpha values and invisible pixels exactly`, async () => {
  const source = await rgba(sourceBytes);
  const prepared = await prepareImageEdit({ source, model, prompt: "Make the dress red", mode: "edit", preserveAlpha: true });
  assert.match(prepared.submittedPrompt, /isolated layer/);
  assert.match(prepared.submittedPrompt, /exact silhouette/);
  const output = await finishImageEdit(prepared, await rgba(solid(240, 20, 40, 100)));
  const bytes = await sharp(output).raw().toBuffer();
  for (let i = 0; i < 256; i++) {
    assert.equal(bytes[i * 4 + 3], i);
    assert.deepEqual([...bytes.subarray(i * 4, i * 4 + 3)], i ? [240, 20, 40] : [20, 80, 160]);
  }
});

test("painted layer selections protect every unselected RGBA pixel and blend RGB without changing alpha", async () => {
  const source = await rgba(sourceBytes), selectionBytes = solid(255, 255, 255, 0);
  selectionBytes[103] = 128; selectionBytes[107] = 255;
  const prepared = await prepareImageEdit({ source, selection: await rgba(selectionBytes), model: imageEditModels[0], mode: "edit", prompt: "Recolor only this dress", preserveAlpha: true });
  const result = await sharp(await finishImageEdit(prepared, await rgba(solid(240, 20, 40, 255)))).raw().toBuffer();
  for (let p = 0; p < 256; p++) {
    assert.equal(result[p * 4 + 3], p);
    if (p === 25) assert.deepEqual([...result.subarray(100, 103)], [130, 50, 100]);
    else if (p === 26) assert.deepEqual([...result.subarray(104, 107)], [240, 20, 40]);
    else assert.deepEqual([...result.subarray(p * 4, p * 4 + 4)], sourceBytes.slice(p * 4, p * 4 + 4));
  }
});

test("empty and transparent-only selections are rejected rather than editing the whole layer", async () => {
  const source = await rgba(sourceBytes), outside = solid(255, 255, 255, 0); outside[3] = 255;
  for (const selection of [await rgba(solid(255, 255, 255, 0)), await rgba(outside)])
    await assert.rejects(prepareImageEdit({ source, selection, prompt: "Red", preserveAlpha: true }), /selection|visible part/);
  await assert.rejects(prepareImageEdit({ source: await rgba(solid(30, 40, 50, 0)), prompt: "Red", preserveAlpha: true }), /visible part/);
});

test("opaque whole-layer Ideogram edits omit the unusable all-edit provider mask but retain local alpha protection", async () => {
  const prepared = await prepareImageEdit({ source: await rgba(solid(30, 40, 50, 255)), prompt: "Blue", model: imageEditModels[0], preserveAlpha: true });
  assert.equal(prepared.mask, null); assert.ok(prepared.selection);
  assert.doesNotMatch(prepared.submittedPrompt, /provided edit mask/);
  for (const args of [{ mode: "remove", hasSelection: true }, { mode: "sketch", blank: true, hasDrawing: true }])
    assert.throws(() => buildImageEditPrompt({ ...args, preserveAlpha: true, prompt: "Edit" }), /Layer edits/);
});

test("layer edit replaces only pixels, preserves layout and siblings, rejects stale/locked sources and unsafe results", () => {
  const target = { id: "subject", url: "/outputs/original.png", name: "Woman", x: 31, y: -8, width: 137, height: 211, rotation: 35, opacity: .7, visible: true, locked: false };
  const sibling = { ...target, id: "background", url: "/outputs/bg.png" }, layers = [sibling, target];
  const result = { url: "/outputs/edited.png", alphaUrl: "/outputs/edited.png", preserveAlpha: true };
  const next = applyRasterLayerEdit(layers, target, result);
  assert.equal(next[0], sibling); assert.deepEqual(next[1], { ...target, url: result.url }); assert.equal(layers[1].url, target.url);
  for (const change of [{ locked: true }, { x: 32 }, { url: "/outputs/replaced.png" }])
    assert.throws(() => applyRasterLayerEdit([sibling, { ...target, ...change }], target, result), /changed/);
  for (const invalid of [{ ...result, url: "https://example.com/x" }, { ...result, preserveAlpha: false }, { ...result, alphaUrl: "wrong" }])
    assert.throws(() => applyRasterLayerEdit(layers, target, invalid), /transparency/);
});

test("selection coordinates respect layer placement, scale, rotation and zoom", () => {
  const rect = { left: 500, top: -120 };
  for (const rotation of [0, 30, 90, -65, 179]) for (const scale of [.5, 1, 2]) {
    const layer = { x: 15, y: 40, width: 120, height: 240, rotation };
    const local = rotateLayerPoint((.25 - .5) * layer.width, (.75 - .5) * layer.height, rotation);
    const point = rasterLayerEditPoint(rect.left + (local.x + layer.x + layer.width / 2) * scale, rect.top + (local.y + layer.y + layer.height / 2) * scale, layer, rect, scale);
    assert.ok(Math.abs(point.x - .25) < 1e-9); assert.ok(Math.abs(point.y - .75) < 1e-9);
  }
});
