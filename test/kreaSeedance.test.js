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

test("Krea result URLs normalize supported response shapes", () => {
  assert.equal(extractKreaJobResultUrl({ result: { urls: ["https://example.com/video.mp4"] } }), "https://example.com/video.mp4");
  assert.equal(
    extractKreaJobResultUrl({ result: { urls: [{ type: "thumbnail", url: "thumb" }, { type: "model", url: "video" }] } }),
    "video"
  );
  assert.equal(extractKreaJobResultUrl({ result: { urls: { output: "mapped" } } }), "mapped");
});
