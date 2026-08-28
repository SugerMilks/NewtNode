import assert from "node:assert/strict";
import test from "node:test";

import {
  estimateSeedance25FalCost,
  isSeedance25Model,
  normalizeSeedance25AspectRatio,
  normalizeSeedance25Duration,
  normalizeSeedance25Resolution,
  seedance25AspectRatioOptions,
  seedance25DurationOptions,
  seedance25FalEndpoint,
  seedance25ReferenceLimits,
  seedance25ResolutionOptions
} from "../src/seedance25.js";

test("Seedance 2.5 exposes only verified Fal controls", () => {
  assert.equal(seedance25DurationOptions[0], "Auto");
  assert.equal(seedance25DurationOptions[1], "4 seconds");
  assert.equal(seedance25DurationOptions.at(-1), "30 seconds");
  assert.deepEqual(seedance25ResolutionOptions, ["720p", "1080p", "480p"]);
  assert.deepEqual(seedance25AspectRatioOptions, ["Auto", "21:9", "16:9 (Landscape)", "4:3", "1:1", "3:4", "9:16 (Portrait)"]);
});

test("Seedance 2.5 selects the route-specific Fal endpoint", () => {
  assert.equal(seedance25FalEndpoint("text-to-video"), "bytedance/seedance-2.5/text-to-video");
  assert.equal(seedance25FalEndpoint("image-to-video"), "bytedance/seedance-2.5/image-to-video");
  assert.equal(seedance25FalEndpoint("reference-to-video"), "bytedance/seedance-2.5/reference-to-video");
});

test("Seedance 2.5 normalization protects provider limits", () => {
  assert.equal(isSeedance25Model("Seedance 2.5"), true);
  assert.equal(normalizeSeedance25Duration("Auto"), "auto");
  assert.equal(normalizeSeedance25Duration("30 seconds"), "30");
  assert.equal(normalizeSeedance25Duration("31 seconds"), "15");
  assert.equal(normalizeSeedance25Resolution("4K"), "720p");
  assert.equal(normalizeSeedance25Resolution("1080P"), "1080p");
  assert.equal(normalizeSeedance25Resolution("1920p"), "1080p");
  assert.equal(normalizeSeedance25Resolution("1920x1080"), "1080p");
  assert.equal(normalizeSeedance25AspectRatio("9:16 (Portrait)"), "9:16");
  assert.equal(normalizeSeedance25AspectRatio("Auto"), "auto");
});

test("Seedance 2.5 reference caps match the published multimodal schema", () => {
  assert.deepEqual(seedance25ReferenceLimits, { images: 30, videos: 10, audio: 10, total: 50 });
});

test("Seedance 2.5 Fal pricing uses resolution and video-reference multiplier", () => {
  assert.equal(estimateSeedance25FalCost({ duration: "10", resolution: "720p" }).amountUsd, 4.73);
  assert.equal(estimateSeedance25FalCost({ duration: "10", resolution: "1080p" }).amountUsd, 11.3724);
  assert.equal(
    estimateSeedance25FalCost({ duration: "10", resolution: "480p", hasVideoReference: true }).amountUsd,
    1.323
  );
});
