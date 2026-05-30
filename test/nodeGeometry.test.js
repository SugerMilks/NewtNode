import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  clampContextMenuPosition,
  graphBoundsForNodes,
  positiveModulo,
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
