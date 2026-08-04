import { imageModelNames } from "./modelOptions.js";
import { openAiImage2Quality } from "./openAiImage2.js";

export const characterSheetModelOptions = [
  imageModelNames.openAiImage2,
  imageModelNames.nanoBananaPro,
  imageModelNames.seedream5Pro
];

export function normalizeCharacterSheetModel(value) {
  return characterSheetModelOptions.includes(value) ? value : imageModelNames.openAiImage2;
}

export function characterSheetGenerationSettings(value) {
  const model = normalizeCharacterSheetModel(value);
  return {
    model,
    resolution: model === imageModelNames.seedream5Pro ? "2K" : "4K",
    ...(model === imageModelNames.openAiImage2 ? { quality: openAiImage2Quality } : {})
  };
}
