import { storyboardImageDefaultModel, storyboardImageModelOptions } from "./modelOptions.js";
import { isOpenAiImage26Model, openAiImage26KreaSelection, migrateOpenAiImageModel } from "./openAiImage26.js";
import { isSeedream55Model, normalizeSeedream55Resolution, migrateSeedreamModel } from "./seedream55.js";
import { isNanoBanana21Model, nanoBanana21Ratios } from "./nanoBanana21.js";

export function normalizeStoryboardImageModel(value) {
  value = migrateSeedreamModel(migrateOpenAiImageModel(value));
  return storyboardImageModelOptions.includes(value) ? value : storyboardImageDefaultModel;
}

export function storyboardImageSettings(data = {}, provider = "fal") {
  const model = normalizeStoryboardImageModel(data.model);
  const settings = { model, resolution: data.resolution || "1K", aspectRatio: data.aspectRatio || "16:9", quality: "high", background: "auto" };
  if (isSeedream55Model(model)) settings.resolution = normalizeSeedream55Resolution(settings.resolution);
  if (isNanoBanana21Model(model) && !nanoBanana21Ratios(provider).includes(settings.aspectRatio)) settings.aspectRatio = "16:9";
  return provider === "krea" && isOpenAiImage26Model(model)
    ? { ...settings, ...openAiImage26KreaSelection(settings) }
    : settings;
}

export function storyboardCharacterImageSettings(data = {}, provider = "fal") {
  return storyboardImageSettings({ ...data, resolution: "4K", aspectRatio: "16:9" }, provider);
}
