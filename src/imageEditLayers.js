import { layersDefaults, layersOutputPatch, normalizeLayersData, validateLayerDocument } from "./imageLayers.js";

export function originalLayerSeparation(document, documents = []) {
  if (!document) return null;
  const candidates = [document.originalSeparation,
    ...documents.filter(candidate => candidate.name === "Separation" && (candidate.id === document.id ||
      document.layers?.some(layer => candidate.layers?.some(original => original.id === layer.id && original.url === layer.url)))),
    document.name === "Separation" ? document : null];
  for (const candidate of candidates) {
    if (!candidate || candidate.width !== document.width || candidate.height !== document.height || candidate.sourceUrl !== document.sourceUrl) continue;
    try { return validateLayerDocument(candidate); } catch { /* Older incomplete metadata must not reset a different separation. */ }
  }
  return null;
}

export function retainLayerSeparation(document, original) {
  const baseline = originalLayerSeparation({ ...document, originalSeparation: original });
  return baseline ? { ...document, originalSeparation: baseline } : document;
}

export function imageLayersSessionKey(item, context = {}) {
  return `newtnode.image-edit-layers.v1:${JSON.stringify([context.projectId || "", context.workflowPackagePath || "", item.url])}`;
}

export function imageLayersResult(document) {
  const composite = document?.items?.[0];
  if (!composite?.url) throw new Error("Save a layer version before adding it to the canvas.");
  return { ...composite, label: "Layers", imageLayersDocument: document };
}

export function imageLayersInitialState(item, saved) {
  if (saved) return normalizeLayersData(saved, true);
  const document = item?.imageLayersDocument;
  if (document?.items?.[0]?.url === item.url) {
    try {
      validateLayerDocument(document);
      return normalizeLayersData({ ...layersDefaults, ...layersOutputPatch([document], document.id) });
    } catch { /* Keep the image usable if older layer metadata is incomplete. */ }
  }
  return normalizeLayersData(layersDefaults);
}

export function readImageLayersSession(key, storage) {
  try { return JSON.parse(storage.getItem(key) || "null"); } catch { return null; }
}

export function saveImageLayersSession(key, state, storage) {
  storage.setItem(key, JSON.stringify(state));
}

export function resizeRasterLayer(layer, corner, dx, dy) {
  const left = corner.includes("w"), top = corner.includes("n");
  const factor = Math.max(1 / Math.min(layer.width, layer.height), Math.min(8192 / Math.max(layer.width, layer.height),
    Math.sqrt(36000000 / (layer.width * layer.height)), Math.max((layer.width + (left ? -dx : dx)) / layer.width, (layer.height + (top ? -dy : dy)) / layer.height)));
  const width = Math.max(1, Math.round(layer.width * factor)), height = Math.max(1, Math.min(Math.floor(36000000 / width), Math.round(layer.height * factor)));
  return { x: layer.x + (left ? layer.width - width : 0), y: layer.y + (top ? layer.height - height : 0), width, height };
}
