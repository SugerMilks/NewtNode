import test from "node:test";
import assert from "node:assert/strict";
import {
  characterSheetGenerationSettings,
  characterSheetModelOptions,
  normalizeCharacterSheetModel
} from "../src/characterSheetModels.js";
import { imageModelNames } from "../src/modelOptions.js";

test("character sheets default to Nano Banana 2 at high-thinking 4K", () => {
  assert.equal(normalizeCharacterSheetModel(""), imageModelNames.nanoBanana2);
  assert.deepEqual(characterSheetGenerationSettings(""), {
    model: imageModelNames.nanoBanana2,
    resolution: "4K"
  });
  assert.ok(characterSheetModelOptions.includes(imageModelNames.nanoBanana2));
  assert.ok(characterSheetModelOptions.includes(imageModelNames.openAiImage2));
});

test("character sheets support Nano Banana Pro at 4K", () => {
  assert.ok(characterSheetModelOptions.includes(imageModelNames.nanoBananaPro));
  assert.deepEqual(characterSheetGenerationSettings(imageModelNames.nanoBananaPro), {
    model: imageModelNames.nanoBananaPro,
    resolution: "4K"
  });
});

test("character sheets support OpenAI Image 2 at 4K", () => {
  assert.ok(characterSheetModelOptions.includes(imageModelNames.openAiImage2));
  assert.deepEqual(characterSheetGenerationSettings(imageModelNames.openAiImage2), {
    model: imageModelNames.openAiImage2,
    resolution: "4K",
    quality: "high"
  });
});
