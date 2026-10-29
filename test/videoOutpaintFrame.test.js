import test from "node:test";
import assert from "node:assert/strict";
import { defaultOutpaintFrame, dragOutpaintFrame, normalizeOutpaintFrame, outpaintFrameGeometry, snapOutpaintFrame } from "../src/videoOutpaintFrame.js";
import { planVideoOutpaint, videoOutpaintFingerprint } from "../src/videoOutpaint.js";

test("default editable frames retain the centered fit at either target ratio", () => {
  const frame = defaultOutpaintFrame({ width: 1000, height: 1000 }, "16:9");
  assert.equal(frame.width, 16 / 9); assert.equal(frame.y, 0);
  assert.ok(Math.abs(frame.x - (1 - 16 / 9) / 2) < 1e-9);
  assert.equal(defaultOutpaintFrame({ width: 1000, height: 1000 }, "9:16").width, 1);
});
test("dragging can move outside the source and each corner keeps the opposite corner anchored", () => {
  const frame = { x: 0.1, y: 0.2, width: 1 };
  assert.deepEqual(dragOutpaintFrame(frame, "move", -0.5, 0.25, "16:9"), { x: -0.4, y: 0.45, width: 1 });
  for (const handle of ["nw", "ne", "sw", "se"]) {
    const next = dragOutpaintFrame(frame, handle, 0.2, 0.15, "16:9");
    const x = handle.includes("e") ? next.x : next.x + next.width;
    const y = handle.includes("s") ? next.y : next.y + next.width / (16 / 9);
    assert.ok(Math.abs(x - (handle.includes("e") ? frame.x : frame.x + frame.width)) < 1e-9);
    assert.ok(Math.abs(y - (handle.includes("s") ? frame.y : frame.y + frame.width / (16 / 9))) < 1e-9);
  }
});
test("offset frames crop source pixels and map only the visible intersection into the mask", () => {
  const geometry = outpaintFrameGeometry({ width: 128, height: 128 }, "1:1", { x: 0.5, y: -0.25, width: 1 }, { width: 576, height: 576 });
  assert.deepEqual(geometry.sourceCrop, { x: 64, y: 0, width: 64, height: 96 });
  assert.deepEqual([geometry.sourceWidth, geometry.sourceHeight, geometry.left, geometry.top], [288, 432, 0, 144]);
  assert.equal(geometry.needsOutpaint, true);
  assert.throws(() => outpaintFrameGeometry({ width: 128, height: 128 }, "1:1", { x: 1, y: 0, width: 1 }, { width: 576, height: 576 }), /overlap/);
});
test("a crop inside the source needs no paid inference and edited frames invalidate preparation", () => {
  const plan = planVideoOutpaint({ width: 1440, height: 1440, fps: 24, duration: 4 }, { aspectRatio: "16:9", frame: { x: 0.25, y: 0.25, width: 0.5 } });
  assert.equal(plan.needsOutpaint, false);
  assert.equal(plan.sourceCrop.x, 360);
  assert.equal(plan.sourceWidth, 1280); assert.equal(plan.sourceHeight, 720);
  assert.notEqual(videoOutpaintFingerprint("source", {}), videoOutpaintFingerprint("source", { frame: { x: 0, y: 0, width: 1 } }));
  assert.equal(normalizeOutpaintFrame({ x: "bad", y: 0, width: 1 }), null);
});

test("soft movement snaps edges and center with a release band", () => {
  const dimensions = { width: 1000, height: 1000 }, threshold = 0.008;
  const edge = snapOutpaintFrame({ x: -0.004, y: 0.2, width: 0.4 }, "move", "16:9", dimensions, { threshold });
  assert.equal(edge.frame.x, 0); assert.equal(edge.guides.x, 0);
  const centered = snapOutpaintFrame({ x: 0.249, y: 0.2, width: 0.5 }, "move", "16:9", dimensions, { threshold });
  assert.equal(centered.frame.x, 0.25); assert.equal(centered.guides.x, 0.5);
  const held = snapOutpaintFrame({ x: 0.261, y: 0.2, width: 0.5 }, "move", "16:9", dimensions, { threshold, previous: centered.state });
  assert.equal(held.frame.x, 0.25);
  const released = snapOutpaintFrame({ x: 0.265, y: 0.2, width: 0.5 }, "move", "16:9", dimensions, { threshold, previous: centered.state });
  assert.equal(released.frame.x, 0.265); assert.equal(released.guides.x, null);
});
test("resize snapping keeps the fixed ratio and anchored corner", () => {
  const result = snapOutpaintFrame({ x: 0.1, y: 0.1, width: 0.895 }, "se", "16:9", { width: 1000, height: 1000 }, { threshold: 0.008 });
  assert.equal(result.frame.width, 0.9); assert.equal(result.frame.x, 0.1); assert.equal(result.frame.y, 0.1);
  assert.equal(result.guides.x, 1);
  const portrait = snapOutpaintFrame({ x: 0.2, y: 0.496, width: 0.2 }, "move", "9:16", { width: 1000, height: 2000 }, { threshold: 0.008 });
  assert.ok(portrait.frame.width > 0);
  // Vertical centers follow the actual source height, rather than assuming a square source.
  const center = snapOutpaintFrame({ x: 0.2, y: 0.824, width: 0.2 }, "move", "9:16", { width: 1000, height: 2000 }, { threshold: 0.008 });
  assert.equal(center.guides.y, 1);
  assert.ok(Math.abs(center.frame.y + center.frame.width / (9 / 16) / 2 - 1) < 1e-9);
});
