import { normalizeVectorData } from "./ideogramVector.js";
export const vectorLookFields = ["designPreset", "lettering", "palette", "quality", "aspectRatio", "seed", "fontReference", "layoutReference", "vectorSavedMoodBoards"];
export function vectorDesignLook(data, moodBoards) {
  const normalized = normalizeVectorData(data);
  const settings = Object.fromEntries(vectorLookFields.map(key => [key, normalized[key]]));
  if (moodBoards !== undefined) settings.vectorSavedMoodBoards = moodBoards.map(item => ({ url: item.url, label: String(item.label || "Mood Board").slice(0, 200) }));
  return JSON.parse(JSON.stringify(settings));
}
export function updateVectorResultLabel(data, url, label) {
  const name = String(label || "").trim().slice(0, 120);
  return name ? { resultItems: data.resultItems.map(item => item.url === url ? { ...item, label: name } : item) } : {};
}
