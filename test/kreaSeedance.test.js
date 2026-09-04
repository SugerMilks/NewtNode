import test from "node:test";
import assert from "node:assert/strict";
import {
  estimateKreaSeedanceCost,
  extractKreaJobResultUrl,
  kreaSeedanceEndpoint,
  resolveSeedanceRuntimeProvider
} from "../src/kreaSeedance.js";

test("Seedance prefers Fal and falls back to Krea", () => {
  assert.equal(resolveSeedanceRuntimeProvider({ falKey: "fal", kreaKey: "krea" }), "fal");
  assert.equal(resolveSeedanceRuntimeProvider({ falKey: "", kreaKey: "krea" }), "krea");
  assert.equal(resolveSeedanceRuntimeProvider({ falKey: "", kreaKey: "" }), "");
});

test("Krea Seedance uses the standard endpoint", () => {
  assert.equal(kreaSeedanceEndpoint(), "/generate/video/bytedance/seedance-2");
  assert.equal(kreaSeedanceEndpoint("Seedance 2.5"), "/generate/video/bytedance/seedance-2-5");
});

test("Krea Seedance pricing uses resolution and video-reference tier", () => {
  const cost = estimateKreaSeedanceCost({
    durationSeconds: 15,
    resolution: "720p",
    hasVideoReference: true
  });
  assert.equal(cost.unitRateUsd, 0.1911);
  assert.equal(cost.amountUsd, 2.8665);
});

test("Krea Seedance 2.5 pricing uses the current resolution and video-reference tiers", () => {
  const withoutVideo = estimateKreaSeedanceCost({
    modelName: "Seedance 2.5",
    durationSeconds: 30,
    resolution: "720p",
    hasVideoReference: false
  });
  const withVideo = estimateKreaSeedanceCost({
    modelName: "Seedance 2.5",
    durationSeconds: 30,
    resolution: "720p",
    hasVideoReference: true
  });

  assert.equal(withoutVideo.unitRateUsd, 0.2427);
  assert.equal(withoutVideo.amountUsd, 7.281);
  assert.equal(withVideo.unitRateUsd, 0.1452);
  assert.equal(withVideo.amountUsd, 4.356);
  assert.equal(withoutVideo.pricingSource, "krea-api-pricing-2026-08-29");
});

test("Krea Seedance 2.5 pricing covers every supported resolution", () => {
  assert.equal(estimateKreaSeedanceCost({ modelName: "Seedance 2.5", resolution: "480p" }).unitRateUsd, 0.1078);
  assert.equal(estimateKreaSeedanceCost({ modelName: "Seedance 2.5", resolution: "1080p", hasVideoReference: true }).unitRateUsd, 0.2572);
});

test("Krea result URLs normalize supported response shapes", () => {
  assert.equal(extractKreaJobResultUrl({ result: { urls: ["https://example.com/video.mp4"] } }), "https://example.com/video.mp4");
  assert.equal(
    extractKreaJobResultUrl({ result: { urls: [{ type: "thumbnail", url: "thumb" }, { type: "model", url: "video" }] } }),
    "video"
  );
  assert.equal(extractKreaJobResultUrl({ result: { urls: { output: "mapped" } } }), "mapped");
});
