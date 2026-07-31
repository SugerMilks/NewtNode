import test from "node:test";
import assert from "node:assert/strict";

import {
  buildKreaImageInput,
  estimateKreaKlingCost,
  extractKreaJobResultUrl,
  extractKreaJobResultUrls,
  kreaEndpointForModel,
  normalizeKreaImageResolution,
  resolveFalKreaProvider,
  supportsKreaModel
} from "../src/kreaApi.js";

test("Fal remains preferred when Fal and Krea are both enabled", () => {
  assert.equal(resolveFalKreaProvider({ falKey: "fal-key", kreaKey: "krea-key" }), "fal");
  assert.equal(resolveFalKreaProvider({ falKey: "", kreaKey: "krea-key" }), "krea");
  assert.equal(resolveFalKreaProvider({ falKey: "", kreaKey: "" }), "");
});

test("current shared NewtNode models resolve to Krea endpoints", () => {
  [
    "Z-Image",
    "Seedream 5.0 Pro",
    "Nano Banana 2",
    "Nano Banana Pro",
    "OpenAI Image 2",
    "Krea 2 Large",
    "Luma Dream Machine"
  ].forEach((name) => assert.equal(supportsKreaModel("image", name), true, name));

  assert.equal(kreaEndpointForModel("video", "Seedance 2.0"), "/generate/video/bytedance/seedance-2");
  assert.equal(kreaEndpointForModel("video", "Kling O3 Pro"), "/generate/video/kling/kling-3.0");
  assert.equal(kreaEndpointForModel("video", "Gemini Omni Flash"), "/generate/video/google/gemini-omni-flash");
  assert.equal(kreaEndpointForModel("model3d", "Hunyuan 3D 3.1 Pro"), "/generate/3d/tencent/hunyuan3d-3.1-pro");
});

test("OpenAI Image 2 Krea input preserves high quality, references, and output controls", () => {
  assert.deepEqual(buildKreaImageInput({
    modelName: "OpenAI Image 2",
    prompt: "A practical studio still",
    referenceUrls: ["https://example.com/a.png", "https://example.com/b.png"],
    aspectRatio: "16:9",
    resolution: "4K",
    quality: "high"
  }), {
    prompt: "A practical studio still",
    quality: "high",
    image_urls: ["https://example.com/a.png", "https://example.com/b.png"],
    aspect_ratio: "16:9",
    resolution: "4K"
  });
});

test("Seedream and Krea 2 adapt references to their provider-specific fields", () => {
  const seedream = buildKreaImageInput({
    modelName: "Seedream 5.0 Pro",
    prompt: "Editorial portrait",
    referenceUrls: ["https://example.com/style.png"],
    aspectRatio: "9:16",
    resolution: "2K"
  });
  assert.deepEqual(seedream.style_images, [{ url: "https://example.com/style.png", strength: 1 }]);
  assert.ok(seedream.height > seedream.width);

  const krea = buildKreaImageInput({
    modelName: "Krea 2 Large",
    prompt: "Campaign frame",
    referenceUrls: ["https://example.com/style.png"],
    creativity: "raw"
  });
  assert.equal(krea.creativity, "raw");
  assert.deepEqual(krea.image_style_references, [{ url: "https://example.com/style.png", strength: 0.7 }]);
  assert.equal(normalizeKreaImageResolution("Krea 2 Large", "4K"), "1K");
});

test("Krea job URL extraction accepts string, object, and typed model results", () => {
  assert.deepEqual(extractKreaJobResultUrls({ result: { urls: ["https://example.com/a.png"] } }), ["https://example.com/a.png"]);
  assert.deepEqual(
    extractKreaJobResultUrls({ result: { urls: { image: { url: "https://example.com/b.png" } } } }),
    ["https://example.com/b.png"]
  );
  assert.equal(
    extractKreaJobResultUrl({
      result: {
        urls: [
          { type: "thumbnail", url: "https://example.com/thumb.png" },
          { type: "model", url: "https://example.com/model.glb" }
        ]
      }
    }),
    "https://example.com/model.glb"
  );
});

test("Krea Kling cost uses mode and audio-specific published rates", () => {
  assert.equal(estimateKreaKlingCost({ durationSeconds: 5, generateAudio: false, mode: "pro" }).amountUsd, 1.176);
  assert.equal(estimateKreaKlingCost({ durationSeconds: 5, generateAudio: true, mode: "4k" }).amountUsd, 2.205);
});
