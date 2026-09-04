import { videoModelNames, videoModelOptions } from "./modelOptions.js";

export function videoModelSupportsFilmDirector(model = "") {
  const normalized = String(model || "").toLowerCase();
  const isSeedance = normalized.includes("seedance");
  const isKlingO3 = normalized.includes("kling") && (normalized.includes("o3") || normalized.includes("03"));
  const isMiniMaxH3 = normalized.includes("minimax") && normalized.includes("h3");
  return isSeedance || isKlingO3 || isMiniMaxH3;
}

export const filmDirectorVideoModelOptions = videoModelOptions.filter(videoModelSupportsFilmDirector);

export function normalizeFilmDirectorVideoModel(value = "", fallback = "") {
  if (filmDirectorVideoModelOptions.includes(value)) return value;
  if (filmDirectorVideoModelOptions.includes(fallback)) return fallback;
  return "";
}

export const defaultFilmDirectorVideoModel = videoModelNames.seedance;
