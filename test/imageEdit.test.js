import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { imageEditSize, imageEditPoint, buildImageEditPrompt } from "../src/imageEdit.js";
import { buildOpenAiImage25FalRequest, openAiImage25Models } from "../src/openAiImage25.js";
import { prepareImageEdit, finishImageEdit } from "../server/image-edit.js";

const solid = (width, height, background) => sharp({ create: { width, height, channels: 4, background } }).png().toBuffer();
const pixel = async (buffer, x, y) => {
  const { data, info } = await sharp(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return [...data.subarray((y * info.width + x) * 4, (y * info.width + x) * 4 + 4)];
};

test("edit sizes satisfy the actual Sunburst payload limits across portrait, landscape and tiny images", () => {
  for (const [width, height] of [[1,1], [3,1], [1,3], [1920,1080], [1080,1920], [11162,3072], [4000,6000], [6000,4000], [3840,2160], [5000,1667], [1667,5000], [703,514]]) {
    if (width * height > 24000000) { assert.throws(() => imageEditSize(width, height)); continue; }
    const size = imageEditSize(width, height);
    const request = buildOpenAiImage25FalRequest({ model: openAiImage25Models.sunburst, prompt: "Edit this image", size: `${size.width}x${size.height}`, imageUrls: ["source"] });
    assert.deepEqual(request.input.image_size, size);
  }
  for (let w = 17; w < 3800; w += 117) for (let h = Math.ceil(w / 3); h <= Math.min(w * 3, 6000); h += 133) {
    const size = imageEditSize(w, h);
    assert.doesNotThrow(() => buildOpenAiImage25FalRequest({ model: openAiImage25Models.sunburst, prompt: "Edit this image", size: `${size.width}x${size.height}` }));
  }
  assert.throws(() => imageEditSize(4000, 1000), /aspect ratios/);
  assert.throws(() => imageEditSize(5000, 5000), /24 megapixels/);
});

test("drawing coordinates stay normalized after zoom and pan", () => {
  assert.deepEqual(imageEditPoint(200, 300, { left: 100, top: 100, width: 400, height: 800 }), { x: .25, y: .25 });
  assert.deepEqual(imageEditPoint(-40, 1200, { left: 100, top: 100, width: 400, height: 800 }), { x: 0, y: 1 });
});

test("prompt separates clean originals, instructional marks, sketches and removal", () => {
  assert.match(buildImageEditPrompt({ prompt: "Make the circled jacket blue", hasDrawing: true }), /Image 2 shows annotations/);
  assert.match(buildImageEditPrompt({ prompt: "Make the circled jacket blue", hasDrawing: true }), /Remove every guide mark/);
  assert.match(buildImageEditPrompt({ mode: "sketch", blank: true, hasDrawing: true }), /Create one finished image/);
  assert.match(buildImageEditPrompt({ mode: "remove", hasSelection: true }), /Remove the selected content/);
  assert.throws(() => buildImageEditPrompt({ mode: "remove" }), /Select the area/);
  assert.throws(() => buildImageEditPrompt({ mode: "sketch", blank: true }), /Describe|Draw/);
  assert.throws(() => buildImageEditPrompt({ prompt: "hello", blank: true }), /only available/);
  assert.throws(() => buildImageEditPrompt({ prompt: "a".repeat(16001) }), /16,000/);
});

test("annotations are a second reference while the original remains clean", async () => {
  const source = await solid(60, 90, "#224466"), drawing = await solid(60, 90, { r: 250, g: 20, b: 20, alpha: .5 });
  const prepared = await prepareImageEdit({ source, drawing, prompt: "Change the circled object" });
  assert.equal(prepared.images.length, 2);
  assert.deepEqual(await pixel(prepared.images[0], 10, 10), [34,68,102,255]);
  assert.notDeepEqual(await pixel(prepared.images[1], 10, 10), [34,68,102,255]);
  assert.equal(prepared.mask, null);
});

test("blank sketch sends only the sketch on white, never the original subject", async () => {
  const source = await solid(60, 90, "#224466"), drawing = await solid(60, 90, { r: 250, g: 20, b: 20, alpha: .5 });
  const prepared = await prepareImageEdit({ source, drawing, mode: "sketch", blank: true });
  assert.equal(prepared.images.length, 1);
  assert.ok((await pixel(prepared.images[0], 10, 10))[1] > 100);
});

test("mask is transparent inside selection and opaque outside; only selected pixels change", async () => {
  const source = await solid(60, 90, { r: 20, g: 60, b: 120, alpha: .8 });
  const selection = await sharp({ create: { width: 60, height: 90, channels: 4, background: "#00000000" } })
    .composite([{ input: await solid(10, 20, "#ffffff"), left: 20, top: 30 }]).png().toBuffer();
  const prepared = await prepareImageEdit({ source, selection, mode: "remove" });
  assert.equal((await pixel(prepared.mask, 0, 0))[3], 255);
  assert.equal((await pixel(prepared.mask, 25, 35))[3], 0);
  const result = await finishImageEdit(prepared, await solid(64, 96, "#fa1414"));
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.width, 60); assert.equal(metadata.height, 90);
  assert.deepEqual(await pixel(result, 0, 0), await pixel(prepared.original, 0, 0));
  assert.deepEqual(await pixel(result, 25, 35), [250,20,20,255]);
  const before = await sharp(prepared.original).raw().toBuffer(), after = await sharp(result).raw().toBuffer();
  for (let y = 0; y < 90; y++) for (let x = 0; x < 60; x++) {
    if (x >= 20 && x < 30 && y >= 30 && y < 50) continue;
    const index = (y * 60 + x) * 4;
    assert.deepEqual(after.subarray(index, index + 4), before.subarray(index, index + 4));
  }
});

test("soft selections blend edges without darkening unselected pixels", async () => {
  const source = await solid(32, 32, "#0000ff"), selection = await solid(32, 32, { r: 255, g: 255, b: 255, alpha: .5 });
  const prepared = await prepareImageEdit({ source, selection, prompt: "change color" });
  const result = await finishImageEdit(prepared, await solid(32, 32, "#ff0000"));
  const value = await pixel(result, 0, 0);
  assert.ok(Math.abs(value[0] - 128) <= 1); assert.ok(Math.abs(value[2] - 127) <= 1); assert.equal(value[3], 255);
});

test("empty, mismatched and opaque layers are rejected before a generation", async () => {
  const source = await solid(32, 48, "#446688");
  await assert.rejects(prepareImageEdit({ source, selection: await solid(32, 48, "#00000000"), mode: "remove" }), /Select the area/);
  await assert.rejects(prepareImageEdit({ source, drawing: await solid(33, 48, "#ffffff"), prompt: "change" }), /matching/);
  await assert.rejects(prepareImageEdit({ source, drawing: await sharp(source).removeAlpha().png().toBuffer(), prompt: "change" }), /transparent PNG/);
  await assert.rejects(prepareImageEdit({ source: Buffer.from("broken"), prompt: "change" }));
});

test("EXIF orientation is normalized before masks are aligned", async () => {
  const source = await sharp(await solid(60, 90, "#ffffff")).jpeg().withMetadata({ orientation: 6 }).toBuffer();
  const prepared = await prepareImageEdit({ source, prompt: "change" });
  assert.equal(prepared.width, 90); assert.equal(prepared.height, 60);
});

test("grayscale images and selections normalize to consistent RGBA without corrupting masks", async () => {
  const source = await sharp(await solid(32, 48, "#777777")).toColourspace("b-w").png().toBuffer();
  const selection = await sharp(await solid(32, 48, "#ffffff")).toColourspace("b-w").png().toBuffer();
  const prepared = await prepareImageEdit({ source, selection, prompt: "Warm this image" });
  const result = await finishImageEdit(prepared, source);
  const metadata = await sharp(result).metadata();
  assert.equal(metadata.channels, 4); assert.equal(metadata.width, 32); assert.equal(metadata.height, 48);
  assert.deepEqual(await pixel(result, 1, 1), [119,119,119,255]);
});
