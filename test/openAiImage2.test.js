import assert from "node:assert/strict";
import test from "node:test";

import { estimateOpenAiImage2Cost, estimateOpenAiImage2HighCost, normalizeOpenAiImage2Quality, openAiImage2Quality } from "../src/openAiImage2.js";

test("GPT Image 2 defaults to high quality while accepting draft qualities", () => {
  assert.equal(openAiImage2Quality, "high");
  assert.equal(normalizeOpenAiImage2Quality("medium"), "medium");
  assert.equal(normalizeOpenAiImage2Quality("LOW"), "low");
  assert.equal(normalizeOpenAiImage2Quality("unsupported"), "high");
});

test("GPT Image 2 estimates distinguish quality, generation, editing, size, and orientation", () => {
  assert.equal(estimateOpenAiImage2HighCost({ resolution: "1K", size: "1024x1024" }), 0.211);
  assert.equal(estimateOpenAiImage2HighCost({ resolution: "2K", size: "2048x1152", edit: true }), 0.158);
  assert.equal(estimateOpenAiImage2HighCost({ resolution: "4K", size: "3840x2160", edit: true }), 0.413);
  assert.equal(estimateOpenAiImage2Cost({ resolution: "4K", size: "3840x2160", quality: "medium" }), 0.101);
  assert.equal(estimateOpenAiImage2Cost({ resolution: "1K", size: "1024x1024", quality: "low", edit: true }), 0.015);
});
