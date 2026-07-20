import assert from "node:assert/strict";
import test from "node:test";

import {
  buildNanoBanana2FalInput,
  estimateNanoBanana2Cost,
  isNanoBanana2Model,
  nanoBanana2FalEditEndpoint,
  nanoBanana2FalTextEndpoint,
  nanoBanana2ThinkingLevel,
  normalizeNanoBanana2Resolution
} from "../src/nanoBanana2.js";
import { imageModelNames, imageModelOptions, normalizeModelPreferences } from "../src/modelOptions.js";

test("Nano Banana 2 is registered as an opt-in image model", () => {
  assert.equal(imageModelNames.nanoBanana2, "Nano Banana 2");
  assert.ok(imageModelOptions.includes(imageModelNames.nanoBanana2));
  assert.equal(normalizeModelPreferences().image[imageModelNames.nanoBanana2], false);
});

test("Nano Banana 2 uses the dedicated fal generation and edit endpoints", () => {
  assert.equal(nanoBanana2FalTextEndpoint, "fal-ai/nano-banana-2");
  assert.equal(nanoBanana2FalEditEndpoint, "fal-ai/nano-banana-2/edit");
  assert.equal(isNanoBanana2Model("Nano Banana 2"), true);
  assert.equal(isNanoBanana2Model("gemini-3.1-flash-image"), true);
});

test("Nano Banana 2 requests high thinking and preserves reference inputs", () => {
  const input = buildNanoBanana2FalInput({
    prompt: "Place the character in the location.",
    aspectRatio: "21:9",
    resolution: "4K",
    imageUrls: ["https://example.com/character.png", "", "https://example.com/location.png"]
  });

  assert.deepEqual(input, {
    prompt: "Place the character in the location.",
    num_images: 1,
    aspect_ratio: "21:9",
    output_format: "png",
    resolution: "4K",
    limit_generations: true,
    thinking_level: nanoBanana2ThinkingLevel,
    image_urls: ["https://example.com/character.png", "https://example.com/location.png"]
  });
});

test("Nano Banana 2 normalizes resolution and reports high-thinking cost", () => {
  assert.equal(normalizeNanoBanana2Resolution("512"), "0.5K");
  assert.equal(normalizeNanoBanana2Resolution("unexpected"), "2K");
  assert.equal(estimateNanoBanana2Cost("0.5K"), 0.062);
  assert.equal(estimateNanoBanana2Cost("2K"), 0.122);
  assert.equal(estimateNanoBanana2Cost("4K"), 0.162);
});
