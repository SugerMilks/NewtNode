import { rotateLayerPoint } from "./rasterLayerGeometry.js";
import { managedLayerUrl } from "./imageLayers.js";
import { sameRasterLayers } from "./rasterLayerSelection.js";

export function rasterLayerEditPoint(clientX, clientY, layer, rect, scale) {
  const cx = layer.x + layer.width / 2, cy = layer.y + layer.height / 2;
  const point = rotateLayerPoint((clientX - rect.left) / scale - cx, (clientY - rect.top) / scale - cy, -(layer.rotation || 0));
  return { x: Math.max(0, Math.min(1, point.x / layer.width + .5)), y: Math.max(0, Math.min(1, point.y / layer.height + .5)) };
}

export function applyRasterLayerEdit(layers, target, result) {
  const current = layers.find(layer => layer.id === target.id);
  if (!current || current.locked || !sameRasterLayers([current], [target])) throw new Error("This layer changed while editing. Keep the generated image in History and reopen Edit Layer.");
  if (!managedLayerUrl(result?.url) || result.preserveAlpha !== true || result.alphaUrl !== result.url)
    throw new Error("The edit did not return a transparency-preserved layer. The original layer is unchanged.");
  return layers.map(layer => layer.id === target.id ? { ...layer, url: result.url } : layer);
}
