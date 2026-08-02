export const nodeTypeDefinitions = [
  { type: "plainText", label: "Text" },
  { type: "text", label: "Smart Text" },
  { type: "imageModel", label: "Image Model" },
  { type: "videoModel", label: "Video Model" },
  { type: "preview", label: "Preview" },
  { type: "style", label: "Style" },
  { type: "transfer", label: "Mood Board" },
  { type: "character", label: "Character" },
  { type: "camera", label: "Camera" },
  { type: "skillDirector", label: "Film Director" },
  { type: "storyboard", label: "Storyboard" },
  { type: "coverage", label: "Coverage" },
  { type: "composer", label: "Composer" },
  { type: "frameIt", label: "Frame It" },
  { type: "autoAspect", label: "Auto Aspect" },
  { type: "model3d", label: "3D" },
  { type: "image", label: "Image" },
  { type: "video", label: "Video" },
  { type: "audio", label: "Audio" },
  { type: "utility", label: "Utility" }
];

const nodeTypeMap = new Map(nodeTypeDefinitions.map((definition) => [definition.type, definition]));

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
