import test from "node:test";
import assert from "node:assert/strict";
import { estimateOutpaintTiming } from "../server/outpaint-timing.js";

test("alignment corrects advanced motion but refuses static or inconsistent evidence", () => {
  const stride = 32, frames = 100, start = 12, count = 70;
  const reference = Uint8Array.from({ length: stride * frames }, (_, i) => (Math.floor(i / stride) * 73 + i % stride * 17) % 256);
  const generated = new Uint8Array(reference.length);
  for (let i = 0; i < frames - 3; i++) generated.set(reference.subarray((i + 3) * stride, (i + 4) * stride), i * stride);
  const result = estimateOutpaintTiming(reference, generated, { stride, start, count, radius: 6 });
  assert.equal(result.applied, true); assert.equal(result.offsetFrames, -3);
  assert.equal(estimateOutpaintTiming(reference, reference, { stride, start, count, radius: 6 }).applied, false);
  const flat = new Uint8Array(reference.length).fill(127);
  assert.equal(estimateOutpaintTiming(flat, flat, { stride, start, count, radius: 6 }).applied, false);
  generated.set(reference.subarray(50 * stride), 50 * stride);
  assert.equal(estimateOutpaintTiming(reference, generated, { stride, start, count, radius: 6 }).applied, false);
});
