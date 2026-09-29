import { storyboardImageDefaultModel, storyboardImageModelOptions } from "./modelOptions.js";
import { isOpenAiImage25Model, openAiImage25KreaSelection } from "./openAiImage25.js";
import { isSeedream5ProModel, normalizeSeedream5ProResolution } from "./seedream5Pro.js";

export function normalizeStoryboardImageModel(value) {
  return storyboardImageModelOptions.includes(value) ? value : storyboardImageDefaultModel;
}

export function storyboardImageSettings(data = {}, provider = "fal") {
  const model = normalizeStoryboardImageModel(data.model);
  const settings = { model, resolution: data.resolution || "1K", aspectRatio: data.aspectRatio || "16:9", quality: "high", background: "auto" };
  if (isSeedream5ProModel(model)) settings.resolution = normalizeSeedream5ProResolution(settings.resolution);
  return provider === "krea" && isOpenAiImage25Model(model)
    ? { ...settings, ...openAiImage25KreaSelection(settings) }
    : settings;
}

export function storyboardCharacterImageSettings(data = {}, provider = "fal") {
  return storyboardImageSettings({ ...data, resolution: "4K", aspectRatio: "16:9" }, provider);
}
