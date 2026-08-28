import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  clampContextMenuPosition,
  graphBoundsForNodes,
  normalizePlainTextNodeSize,
  positiveModulo,
  resizePlainTextNode,
  rectsOverlap
} from "../src/nodeGeometry.js";

test("graphBoundsForNodes uses estimated node dimensions", () => {
  assert.deepEqual(
    graphBoundsForNodes([
      { type: "image", x: 10, y: 20 },
      { type: "character", x: 500, y: -30 }
    ]),
    { left: 10, top: -30, right: 1260, bottom: 490 }
  );
});

test("rectsOverlap detects separated and overlapping rectangles", () => {
  assert.equal(rectsOverlap({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 9, top: 9, right: 20, bottom: 20 }), true);
  assert.equal(rectsOverlap({ left: 0, top: 0, right: 10, bottom: 10 }, { left: 10, top: 10, right: 20, bottom: 20 }), false);
});

test("clamp helpers bound values predictably", () => {
  assert.equal(clamp(12, 0, 10), 10);
  assert.equal(clamp(-4, 0, 10), 0);
  assert.equal(positiveModulo(-3, 28), 25);
  assert.deepEqual(clampContextMenuPosition(500, -20, { width: 320, height: 180 }, { width: 100, height: 80, inset: 8 }), { x: 212, y: 8 });
});

test("plain Text node dimensions resize independently and stay within usable limits", () => {
  assert.deepEqual(normalizePlainTextNodeSize({ textNodeWidth: 520, textNodeHeight: 340 }), { width: 520, height: 340 });
  assert.deepEqual(resizePlainTextNode({ width: 520, height: 340 }, { x: 120, y: -40 }), { width: 640, height: 300 });
  assert.deepEqual(resizePlainTextNode({ width: 250, height: 180 }, { x: -500, y: -500 }), { width: 240, height: 176 });
});

test("graphBoundsForNodes includes persisted plain Text node dimensions", () => {
  assert.deepEqual(
    graphBoundsForNodes([{ type: "plainText", x: 25, y: 35, data: { textNodeWidth: 640, textNodeHeight: 420 } }]),
    { left: 25, top: 35, right: 665, bottom: 455 }
  );
});
