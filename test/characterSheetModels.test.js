import test from "node:test";
import assert from "node:assert/strict";
import {
  characterSheetGenerationSettings,
  characterSheetModelOptions,
  normalizeCharacterSheetModel
} from "../src/characterSheetModels.js";
import { imageModelNames } from "../src/modelOptions.js";

test("character sheets default to OpenAI Image 2 at high-quality 4K", () => {
  assert.equal(normalizeCharacterSheetModel(""), imageModelNames.openAiImage2);
  assert.deepEqual(characterSheetGenerationSettings(""), {
    model: imageModelNames.openAiImage2,
    resolution: "4K",
    quality: "high"
  });
});

test("character sheets support Nano Banana Pro at 4K", () => {
  assert.ok(characterSheetModelOptions.includes(imageModelNames.nanoBananaPro));
  assert.deepEqual(characterSheetGenerationSettings(imageModelNames.nanoBananaPro), {
    model: imageModelNames.nanoBananaPro,
    resolution: "4K"
  });
});

test("character sheets use Seedream's supported 2K output", () => {
  assert.ok(characterSheetModelOptions.includes(imageModelNames.seedream5Pro));
  assert.deepEqual(characterSheetGenerationSettings(imageModelNames.seedream5Pro), {
    model: imageModelNames.seedream5Pro,
    resolution: "2K"
  });
});
