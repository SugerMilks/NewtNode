import assert from "node:assert/strict";
import test from "node:test";

import { clampCropRect, containedMediaSize, moveCropRect, resizeCropRect } from "../src/mediaPreviewLayout.js";

test("portrait lightbox images fit completely inside the available stage", () => {
  const size = containedMediaSize({
    naturalWidth: 1024,
    naturalHeight: 1792,
    availableWidth: 1070,
    availableHeight: 750
  });

  assert.ok(size.width <= 1070);
  assert.ok(size.height <= 750);
  assert.ok(Math.abs(size.width / size.height - 1024 / 1792) < 0.000001);
});

test("landscape and square lightbox images retain their native aspect", () => {
  const landscape = containedMediaSize({
    naturalWidth: 1920,
    naturalHeight: 1080,
    availableWidth: 900,
    availableHeight: 700
  });
  const square = containedMediaSize({
    naturalWidth: 1200,
    naturalHeight: 1200,
    availableWidth: 900,
    availableHeight: 700
  });

  assert.deepEqual(landscape, { width: 900, height: 506.25 });
  assert.deepEqual(square, { width: 700, height: 700 });
});

test("lightbox images are not enlarged beyond their native dimensions", () => {
  assert.deepEqual(containedMediaSize({
    naturalWidth: 400,
    naturalHeight: 600,
    availableWidth: 1000,
    availableHeight: 1000
  }), { width: 400, height: 600 });
  assert.deepEqual(containedMediaSize(), { width: 0, height: 0 });
});

test("crop rectangles retain independent width and height values", () => {
  assert.deepEqual(clampCropRect({ x: 10, y: 12, width: 60, height: 35 }), {
    x: 10,
    y: 12,
    width: 60,
    height: 35
  });

  assert.deepEqual(moveCropRect({ x: 10, y: 12, width: 60, height: 35 }, 80, 80), {
    x: 40,
    y: 65,
    width: 60,
    height: 35
  });
});

test("crop resize is freeform unless Shift is held", () => {
  const startRect = { x: 8, y: 8, width: 60, height: 60 };
  const freeform = resizeCropRect({
    startRect,
    pointer: { x: 78, y: 48 },
    editorWidth: 1200,
    editorHeight: 800
  });
  const locked = resizeCropRect({
    startRect,
    pointer: { x: 78, y: 48 },
    editorWidth: 1200,
    editorHeight: 800,
    lockAspect: true
  });

  assert.deepEqual(freeform, { x: 8, y: 8, width: 70, height: 40 });
  const startPixelAspect = (60 * 1200) / (60 * 800);
  const lockedPixelAspect = (locked.width * 1200) / (locked.height * 800);
  assert.ok(Math.abs(lockedPixelAspect - startPixelAspect) < 0.000001);
});

test("grabbing anywhere on the crop handle does not jump the crop to the pointer", () => {
  const startRect = { x: 8, y: 8, width: 60, height: 40 };
  const startPoint = { x: 69, y: 49 };
  const options = { startRect, startPoint, editorWidth: 400, editorHeight: 800 };
  assert.deepEqual(resizeCropRect({ ...options, pointer: startPoint }), startRect);
  assert.deepEqual(resizeCropRect({ ...options, pointer: { x: 74, y: 54 } }), {
    ...startRect, width: 65, height: 45
  });
});

test("portrait Shift resize stays inside image bounds while preserving the starting ratio", () => {
  const startRect = { x: 20, y: 30, width: 40, height: 25 };
  for (const pointer of [{ x: 200, y: 200 }, { x: -100, y: -100 }]) {
    const next = resizeCropRect({ startRect, pointer, editorWidth: 400, editorHeight: 800, lockAspect: true });
    assert.ok(next.x + next.width <= 100.000001);
    assert.ok(next.y + next.height <= 100.000001);
    assert.ok(Math.abs(next.width / next.height - startRect.width / startRect.height) < 0.000001);
    assert.ok(next.width >= 8 && next.height >= 8);
  }
});
