import test from "node:test";
import assert from "node:assert/strict";
import {
  characterSheetGenerationSettings,
  characterSheetDefaultModel,
  characterSheetModelOptions,
  normalizeCharacterSheetModel
} from "../src/characterSheetModels.js";
import { imageModelNames } from "../src/modelOptions.js";

test("character sheets default to Nano Banana Pro at 4K, without Flare", () => {
  assert.equal(characterSheetDefaultModel, imageModelNames.nanoBananaPro);
  assert.equal(normalizeCharacterSheetModel(""), imageModelNames.nanoBananaPro);
  assert.deepEqual(characterSheetGenerationSettings(""), {
    model: imageModelNames.nanoBananaPro,
    resolution: "4K"
  });
  assert.ok(!characterSheetModelOptions.includes(imageModelNames.openAiImage25Flare));
  assert.ok(characterSheetModelOptions.includes(imageModelNames.nanoBanana2));
  assert.ok(characterSheetModelOptions.includes(imageModelNames.openAiImage2));
});

test("explicit saved Character models are preserved", () => {
  for (const model of characterSheetModelOptions) {
    assert.equal(normalizeCharacterSheetModel(model), model);
    if (model !== imageModelNames.openAiImage25Sunburst) assert.equal(characterSheetGenerationSettings(model).model, model);
  }
  assert.deepEqual(characterSheetGenerationSettings(imageModelNames.openAiImage25Sunburst), {
    model: imageModelNames.openAiImage25Sunburst, resolution: "4K", quality: "high"
  });
});

test("Krea Character sheets reject unsupported Sunburst fidelity before generation", () => {
  assert.throws(() => characterSheetGenerationSettings(imageModelNames.openAiImage25Sunburst, "krea"), /require Fal/);
  assert.deepEqual(characterSheetGenerationSettings(imageModelNames.nanoBanana2, "krea"), { model: imageModelNames.nanoBanana2, resolution: "4K" });
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
