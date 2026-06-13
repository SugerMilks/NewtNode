export const nodeTypeDefinitions = [
  { type: "plainText", label: "Text" },
  { type: "image", label: "Image" },
  { type: "video", label: "Video" },
  { type: "preview", label: "Preview" },
  { type: "autoAspect", label: "Auto Aspect" },
  { type: "storyboard", label: "Storyboard" },
  { type: "character", label: "Character" },
  { type: "camera", label: "Camera" },
  { type: "composer", label: "Composer" },
  { type: "style", label: "Style" },
  { type: "transfer", label: "Mood Board" },
  { type: "utility", label: "Utility" },
  { type: "audio", label: "Audio" },
  { type: "model3d", label: "3D" },
  { type: "imageModel", label: "Image Model" },
  { type: "videoModel", label: "Video Model" },
  { type: "text", label: "Text Model" }
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
