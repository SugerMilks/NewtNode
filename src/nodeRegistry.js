import { normalizeNodePreferences } from "./nodePreferences.js";

export const nodeTypeDefinitions = [
  { type: "myNewt", label: "Newt" },
  { type: "plainText", label: "Text" },
  { type: "text", label: "Smart Text" },
  { type: "imageModel", label: "Image Model" },
  { type: "videoModel", label: "Video Model" },
  { type: "audioModel", label: "Audio Model" },
  { type: "preview", label: "Preview" },
  { type: "style", label: "Style" },
  { type: "transfer", label: "Mood Board" },
  { type: "character", label: "Character" },
  { type: "camera", label: "Camera" },
  { type: "skillDirector", label: "Director" },
  { type: "storyboard", label: "Storyboard" },
  { type: "coverage", label: "Coverage" },
  { type: "composer", label: "Composer" },
  { type: "image", label: "Image" },
  { type: "video", label: "Video" },
  { type: "audio", label: "Audio" },
  { type: "utility", label: "Utility" }
];

const nodeTypeMap = new Map(nodeTypeDefinitions.map((definition) => [definition.type, definition]));

export function nodeMenuEntries(catalog, preferences) {
  const { myNewt } = normalizeNodePreferences(preferences);
  return catalog.filter((entry) => entry.type !== "myNewt" || myNewt);
}

export function nodeTypeDefinition(type) {
  return nodeTypeMap.get(type) || null;
}

export function nodeTypeLabel(type, fallback = "Node") {
  return nodeTypeDefinition(type)?.label || fallback;
}

export function nodeTypeForOutputItem(item) {
  if (item?.type === "image") return "image";
  if (item?.type === "video") return "video";
  if (item?.type === "audio") return "audio";
  if (item?.type === "model3d") return "model3d";
  return "";
}
