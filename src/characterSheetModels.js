import { creativeImageDefaultModel, imageModelNames } from "./modelOptions.js";
import { openAiImage2Quality } from "./openAiImage2.js";
import { isOpenAiImage25Model } from "./openAiImage25.js";
import { isSeedream5ProModel } from "./seedream5Pro.js";

export const characterSheetDefaultModel = imageModelNames.nanoBananaPro;

export const characterSheetModelOptions = [
  creativeImageDefaultModel,
  imageModelNames.nanoBanana2,
  imageModelNames.nanoBananaPro,
  imageModelNames.openAiImage2,
  imageModelNames.seedream5Pro
];

export function normalizeCharacterSheetModel(value) {
  return characterSheetModelOptions.includes(value) ? value : characterSheetDefaultModel;
}

export function characterSheetGenerationSettings(value, provider = "fal") {
  const model = normalizeCharacterSheetModel(value);
  if (isOpenAiImage25Model(model) && provider === "krea") {
    throw new Error("GPT Image 2.5 Character sheets require Fal or Atlas for protected wardrobe edits; Krea does not accept edit masks. Enable Fal or Atlas, or choose Nano Banana 2, Nano Banana Pro, or Image 2 for Krea.");
  }
  return {
    model,
    resolution: isSeedream5ProModel(model) ? "2K" : "4K",
    ...(model === imageModelNames.openAiImage2 || isOpenAiImage25Model(model) ? { quality: openAiImage2Quality } : {})
  };
}
