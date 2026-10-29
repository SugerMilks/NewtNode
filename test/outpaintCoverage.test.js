import test from "node:test";
import assert from "node:assert/strict";
import { inspectOutpaintCoverage } from "../server/outpaint-coverage.js";
import { matchingGeometry } from "../server/outpaint-geometry.js";

test("empty padding that is revealed over time is incomplete generation, not a color seam", () => {
  const g = matchingGeometry({ width: 192, height: 192, left: 0, top: 48, sourceWidth: 192, sourceHeight: 96 });
  const reference = Buffer.alloc(g.stride * 6, 100), raw = Buffer.from(reference);
  for (let f = 0; f < 3; f++) raw.fill(0, f * g.stride, f * g.stride + 20 * g.width * 3);
  const coverage = inspectOutpaintCoverage(reference, raw, g, 6, 24);
  assert.equal(coverage.missingFillFrames, 3); assert.equal(coverage.regions[0].region, "top");
  assert.equal(coverage.regions[0].firstFilledFrame, 3);
  assert.equal(inspectOutpaintCoverage(reference, reference, g, 6, 24).missingFillFrames, 0);
  assert.equal(inspectOutpaintCoverage(Buffer.alloc(reference.length), raw, g, 6, 24).missingFillFrames, 0, "Do not reinterpret an intentional source fade");
  const empty = Buffer.from(reference);
  for (let f = 0; f < 6; f++) empty.fill(0, f * g.stride, f * g.stride + 20 * g.width * 3);
  assert.equal(inspectOutpaintCoverage(reference, empty, g, 6, 24, { requireFullCoverage: true }).missingFillFrames, 6, "Masked preparation must also reject permanently empty padding");
});
