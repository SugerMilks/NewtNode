import { imageModelNames } from "./modelOptions.js";
import { openAiImage2Quality } from "./openAiImage2.js";

export const characterSheetModelOptions = [
  imageModelNames.nanoBanana2,
  imageModelNames.nanoBananaPro,
  imageModelNames.openAiImage2
];

export function normalizeCharacterSheetModel(value) {
  return characterSheetModelOptions.includes(value) ? value : imageModelNames.nanoBanana2;
}

export function characterSheetGenerationSettings(value) {
  const model = normalizeCharacterSheetModel(value);
  return {
    model,
    resolution: "4K",
    ...(model === imageModelNames.openAiImage2 ? { quality: openAiImage2Quality } : {})
  };
}
