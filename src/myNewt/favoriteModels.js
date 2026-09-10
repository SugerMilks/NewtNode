import { imageModelOptions, videoModelOptions } from "../modelOptions.js";
import { filmDirectorVideoModelSupportsMusic } from "../filmDirectorApproaches.js";

export function normalizeMyNewtFavoriteModels(data = {}) {
  return {
    favoriteImageModel: imageModelOptions.includes(data.favoriteImageModel) ? data.favoriteImageModel : "",
    favoriteVideoModel: videoModelOptions.includes(data.favoriteVideoModel) ? data.favoriteVideoModel : ""
  };
}

const modelFields = {
  imageModel: ["favoriteImageModel", "model", "imageModel"],
  coverage: ["favoriteImageModel", "model", "imageModel"],
  character: ["favoriteImageModel", "characterSheetModel", "imageModel"],
  videoModel: ["favoriteVideoModel", "model", "videoModel"],
  skillDirector: ["favoriteVideoModel", "skillVideoModel", "videoModel"]
};

// Only call during fresh node creation, never preset insertion, duplication or updates.
export function myNewtFavoriteCreationPatch(type, settings, catalog = [], explicitPatch = {}, { musicRequired = false } = {}) {
  const config = modelFields[type];
  if (!config) return {};
  const [preference, field, modelType] = config;
  if (Object.hasOwn(explicitPatch, field)) return {};
  const model = normalizeMyNewtFavoriteModels(settings)[preference];
  if (!model || !catalog.find((entry) => entry.type === modelType)?.options?.model?.includes(model)) return {};
  if (!catalog.find((entry) => entry.type === type)?.options?.[field]?.includes(model)) return {};
  if (modelType === "videoModel" && (musicRequired || explicitPatch.skillApproach === "music-video") && !filmDirectorVideoModelSupportsMusic(model)) return {};
  return { [field]: model };
}

export const myNewtFavoriteModelInstructions = "Favorite image and video models are soft preferences for NEW nodes you create from scratch, including compatible Character, Coverage and Director model choices. Prefer the configured favorite over another model only when the user has not explicitly requested a model and it supports the required inputs and settings. Respect enabled model options and provider capabilities; a favorite never enables a disabled model. Preserve models already selected in existing nodes, user content, saved workflow presets and duplicates, including presets inserted during this task. Never change those models just to match a favorite, even with permission to edit existing nodes. Change an existing model only when the user explicitly requests that change. A Director already controlling a Video node takes precedence. Storyboard's chosen image model and all reasoning/LLM models are unchanged. Use the actual chosen model in plan estimates and deliverables. Explain a necessary alternative when a favorite is unavailable or incompatible; do not silently drop references, shorten requested duration, change quality or resubmit a paid run to use it.";
