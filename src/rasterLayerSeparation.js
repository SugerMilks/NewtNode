import { validateLayerDocument } from "./imageLayers.js";
import { sameRasterLayers } from "./rasterLayerSelection.js";
import { rasterLayerLocked, rasterLayerVisible } from "./rasterLayerFolders.js";

export function insertLayerSeparation(document, target, result, folderId) {
  const layer = document.layers.find(item => item.id === target.id);
  if (!layer || !sameRasterLayers([layer], [target]) || rasterLayerLocked(layer, document.folders) || !rasterLayerVisible(layer, document.folders))
    throw new Error("The source layer has changed. Its separation is preserved; restore the original layer before applying it.");
  if (!result?.layerSeparation?.alphaProtected || result.layerSeparation.sourceUrl !== target.url || result.layerSeparation.sourceOpacity !== target.opacity)
    throw new Error("This separation does not match the selected layer or its transparency.");
  const separated = validateLayerDocument(result);
  if (separated.layers.length < 2) throw new Error("The separation needs at least two layers.");
  if (separated.folders?.length || separated.layers.some(child => child.x || child.y || child.rotation || child.opacity !== 1 || child.width !== separated.width || child.height !== separated.height))
    throw new Error("The separated layers do not match the source layer's canvas. Check the existing request again without generating.");
  const children = separated.layers.map((child, index) => ({ ...child, id: `${folderId}-${index}`, folderId,
    x: target.x, y: target.y, width: target.width, height: target.height, rotation: target.rotation || 0,
    opacity: 1, visible: true, locked: false }));
  const layers = [...document.layers]; layers.splice(layers.indexOf(layer), 1, ...children);
  const folder = { id: folderId, name: `${target.name} layers`.slice(0, 100), visible: true, locked: false, collapsed: false,
    ...(target.folderId ? { parentId: target.folderId } : {}) };
  const next = { ...document, layers, folders: [...(document.folders || []), folder] };
  validateLayerDocument(next);
  return next;
}

export function layerSeparationCapacity(document, target) {
  if (!target || (document.folders || []).length >= 24) return 0;
  for (let count = 25 - document.layers.length; count >= 2; count--) {
    try {
      const layers = document.layers.flatMap(layer => layer.id === target.id ? Array.from({ length: count }, (_, i) => ({ ...layer, id: `capacity-${i}` })) : [layer]);
      validateLayerDocument({ ...document, layers }); return count;
    } catch { /* Try a smaller count before any paid submission. */ }
  }
  return 0;
}

export const layerSeparationKey = (document, context, nodeId) => `newtnode.layer-separation.v1:${JSON.stringify([context?.projectId, context?.workflowPackageId, context?.workflowPackagePath, nodeId, document.id, document.sourceUrl])}`;
export function readLayerSeparation(key, storage) {
  try {
    const value = JSON.parse(storage.getItem(key));
    if (!value?.target || !value.baseline || !value.data) return null;
    validateLayerDocument(value.baseline);
    if (!value.baseline.layers.some(layer => sameRasterLayers([layer], [value.target]))) return null;
    return value;
  } catch { return null; }
}
