import test from "node:test";
import assert from "node:assert/strict";
import {
  clamp,
  clampContextMenuPosition,
  graphBoundsForNodes,
  localPortPointFromRects,
  normalizePlainTextNodeSize,
  nonOverlappingPosition,
  positiveModulo,
  resizePlainTextNode,
  rectsOverlap,
  scenePortPoint
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

test("Storyboard insertion reserves its full canvas width including a saved scale", () => {
  assert.equal(graphBoundsForNodes([{ type: "storyboard", x: 20, y: 0 }]).right, 940);
  assert.equal(graphBoundsForNodes([{ type: "storyboard", x: 20, y: 0, data: { storyboardScale: 2 } }]).right, 1860);
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

test("port geometry remains attached to a node independently of the viewport", () => {
  const localPoint = localPortPointFromRects(
    { left: 718, top: 434, width: 16, height: 16 },
    { left: 480, top: 320, width: 248, height: 240 },
    0.8
  );

  assert.deepEqual(localPoint, { x: 307.5, y: 152.5 });
  assert.deepEqual(scenePortPoint({ x: 900, y: -120 }, localPoint), { x: 1207.5, y: 32.5 });
  assert.deepEqual(scenePortPoint({ x: 1040, y: 35 }, localPoint), { x: 1347.5, y: 187.5 });
});

test("agent placement skips every measured obstacle without moving existing nodes", () => {
  const occupied = [{ left: 0, top: 0, right: 700, bottom: 1100 }, { left: 900, top: -100, right: 1400, bottom: 1800 }, { left: 1500, top: 50, right: 1800, bottom: 1000 }];
  const original = structuredClone(occupied);
  const position = nonOverlappingPosition({ width: 920, height: 1500 }, { x: 10, y: 20 }, occupied);
  assert.deepEqual(position, { x: 1880, y: 20 });
  for (const obstacle of occupied) assert.equal(rectsOverlap({ left: position.x, top: position.y, right: position.x + 920, bottom: position.y + 1500 }, obstacle), false);
  assert.deepEqual(occupied, original);
  assert.deepEqual(nonOverlappingPosition({ width: 100, height: 100 }, { x: -800, y: -800 }, occupied), { x: -800, y: -800 });
});

test("measured node growth and rapid successive creation are rechecked for overlap", () => {
  const obstacle = { left: 400, top: 0, right: 900, bottom: 1000 };
  const first = nonOverlappingPosition({ width: 100, height: 100 }, { x: 0, y: 0 }, [obstacle]);
  assert.equal(first.x, 0);
  const grown = nonOverlappingPosition({ width: 980, height: 900 }, first, [obstacle]);
  assert.equal(grown.x, 980);
  const second = nonOverlappingPosition({ width: 370, height: 600 }, first, [obstacle, { left: grown.x, top: grown.y, right: grown.x + 980, bottom: grown.y + 900 }]);
  assert.equal(second.x, 2040);
});
