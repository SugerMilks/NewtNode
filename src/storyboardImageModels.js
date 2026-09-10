import { creativeImageDefaultModel, storyboardImageModelOptions } from "./modelOptions.js";
import { isOpenAiImage25Model, openAiImage25KreaSelection } from "./openAiImage25.js";

export function normalizeStoryboardImageModel(value) {
  return storyboardImageModelOptions.includes(value) ? value : creativeImageDefaultModel;
}

export function storyboardImageSettings(data = {}, provider = "fal") {
  const model = normalizeStoryboardImageModel(data.model);
  const settings = { model, resolution: data.resolution || "1K", aspectRatio: data.aspectRatio || "16:9", quality: "high", background: "auto" };
  return provider === "krea" && isOpenAiImage25Model(model)
    ? { ...settings, ...openAiImage25KreaSelection(settings) }
    : settings;
}

export function storyboardCharacterImageSettings(data = {}, provider = "fal") {
  return storyboardImageSettings({ ...data, resolution: "4K", aspectRatio: "16:9" }, provider);
}
