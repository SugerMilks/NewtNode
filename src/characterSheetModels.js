import { creativeImageDefaultModel, imageModelNames } from "./modelOptions.js";
import { openAiImage2Quality } from "./openAiImage2.js";
import { isOpenAiImage26Model, migrateOpenAiImageModel } from "./openAiImage26.js";
import { isSeedream55Model, migrateSeedreamModel } from "./seedream55.js";
import { isRetiredNanoBanana2Model } from "./retiredImageModels.js";
import { isNanoBanana21Model } from "./nanoBanana21.js";

export const characterSheetDefaultModel = imageModelNames.nanoBananaPro;

export const characterSheetModelOptions = [
  creativeImageDefaultModel,
  imageModelNames.nanoBanana21,
  imageModelNames.nanoBananaPro,
  imageModelNames.openAiImage2,
  imageModelNames.seedream55
];

export function normalizeCharacterSheetModel(value) {
  value = migrateSeedreamModel(migrateOpenAiImageModel(value));
  if (isRetiredNanoBanana2Model(value)) return imageModelNames.nanoBanana21;
  return characterSheetModelOptions.includes(value) ? value : characterSheetDefaultModel;
}

export function characterSheetGenerationSettings(value, provider = "fal") {
  const model = normalizeCharacterSheetModel(value);
  if (isSeedream55Model(model) && !["fal", "atlas"].includes(provider)) throw new Error("Seedream 5.5 requires Fal or Atlas Cloud. Krea does not currently offer it.");
  if (isNanoBanana21Model(model) && provider === "atlas") throw new Error("Nano Banana 2.1 requires Fal or Krea. Choose Nano Banana Pro for Atlas Cloud.");
  if (isOpenAiImage26Model(model) && provider !== "fal") {
    throw new Error("GPT Image 2.6 Character sheets require Fal for protected wardrobe edits. Krea does not accept edit masks and Atlas Cloud has no verified 2.6 endpoint. Enable Fal or choose another Character model.");
  }
  return {
    model,
    resolution: isSeedream55Model(model) ? "2K" : "4K",
    ...(model === imageModelNames.openAiImage2 || isOpenAiImage26Model(model) ? { quality: openAiImage2Quality } : {})
  };
}
