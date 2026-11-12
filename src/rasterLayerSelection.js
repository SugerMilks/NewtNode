import { validateLayerDocument } from "./imageLayers.js";
import { resizeRasterLayer } from "./imageEditLayers.js";
import { normalizeLayerRotation, rotateLayerPoint, rotatedLayerBounds } from "./rasterLayerGeometry.js";
import { rasterLayerLocked } from "./rasterLayerFolders.js";

export const sameRasterLayers = (left, right) => left.length === right.length && left.every((layer, index) =>
  ["id", "url", "name", "x", "y", "width", "height", "opacity", "visible", "locked", "folderId"].every(key => layer[key] === right[index][key]) &&
  normalizeLayerRotation(layer.rotation || 0) === normalizeLayerRotation(right[index].rotation || 0));

export function selectRasterLayers(layers, selected, id, { toggle = false, keep = false } = {}) {
  const valid = selected.filter(value => layers.some(layer => layer.id === value));
  if (!layers.some(layer => layer.id === id)) return valid;
  if (toggle) return valid.includes(id) ? valid.filter(value => value !== id) : [...valid, id];
  return keep && valid.includes(id) ? valid : [id];
}

export const editableRasterLayers = (layers, ids, folders = []) => layers.filter(layer => ids.includes(layer.id) && !rasterLayerLocked(layer, folders));

export function rasterSelectionBounds(layers, ids, folders = []) {
  const selected = editableRasterLayers(layers, ids, folders).map(rotatedLayerBounds);
  if (!selected.length) return null;
  const x = Math.min(...selected.map(layer => layer.x)), y = Math.min(...selected.map(layer => layer.y));
  return { x, y, width: Math.max(...selected.map(layer => layer.x + layer.width)) - x,
    height: Math.max(...selected.map(layer => layer.y + layer.height)) - y };
}

export function translateRasterLayers(document, ids, dx, dy) {
  const selected = editableRasterLayers(document.layers, ids, document.folders);
  if (!selected.length) return document.layers;
  // Clamp a shared delta so a boundary never pulls the selected layers apart.
  dx = Math.round(Math.max(...selected.map(layer => -document.width * 4 - layer.x), Math.min(dx, ...selected.map(layer => document.width * 4 - layer.x))));
  dy = Math.round(Math.max(...selected.map(layer => -document.height * 4 - layer.y), Math.min(dy, ...selected.map(layer => document.height * 4 - layer.y))));
  return document.layers.map(layer => selected.includes(layer) ? { ...layer, x: layer.x + dx, y: layer.y + dy } : layer);
}

export function resizeRasterSelection(document, ids, corner, dx, dy) {
  const selected = editableRasterLayers(document.layers, ids, document.folders);
  if (selected.length === 1 && selected[0].rotation) {
    const layer = selected[0], delta = rotateLayerPoint(dx, dy, -layer.rotation);
    const next = resizeRasterLayer(layer, corner, delta.x, delta.y);
    const shift = rotateLayerPoint(next.x + next.width / 2 - layer.x - layer.width / 2, next.y + next.height / 2 - layer.y - layer.height / 2, layer.rotation);
    const resized = { ...layer, width: next.width, height: next.height,
      x: Math.round(layer.x + layer.width / 2 + shift.x - next.width / 2),
      y: Math.round(layer.y + layer.height / 2 + shift.y - next.height / 2) };
    return validateLayerDocument({ ...document, layers: document.layers.map(item => item.id === layer.id ? resized : item) }).layers;
  }
  const bounds = rasterSelectionBounds(document.layers, ids, document.folders);
  if (!bounds) return document.layers;
  const next = resizeRasterLayer(bounds, corner, dx, dy), scaleX = next.width / bounds.width, scaleY = next.height / bounds.height;
  const layers = document.layers.map(layer => selected.includes(layer) ? {
    ...layer, x: Math.round(next.x + (layer.x - bounds.x) * scaleX), y: Math.round(next.y + (layer.y - bounds.y) * scaleY),
    width: Math.max(1, Math.round(layer.width * scaleX)), height: Math.max(1, Math.round(layer.height * scaleY))
  } : layer);
  return validateLayerDocument({ ...document, layers }).layers;
}

export function rotateRasterSelection(document, ids, degrees, snap = false) {
  const selected = editableRasterLayers(document.layers, ids, document.folders), bounds = rasterSelectionBounds(document.layers, ids, document.folders);
  if (!bounds || !Number.isFinite(degrees)) return document.layers;
  const base = selected.length === 1 ? selected[0].rotation || 0 : 0;
  const delta = snap ? Math.round((base + degrees) / 15) * 15 - base : degrees;
  const cx = bounds.x + bounds.width / 2, cy = bounds.y + bounds.height / 2;
  const layers = document.layers.map(layer => {
    if (!selected.includes(layer)) return layer;
    const center = rotateLayerPoint(layer.x + layer.width / 2 - cx, layer.y + layer.height / 2 - cy, delta);
    return { ...layer, x: Math.round(cx + center.x - layer.width / 2), y: Math.round(cy + center.y - layer.height / 2),
      rotation: normalizeLayerRotation(Math.round(((layer.rotation || 0) + delta) * 100) / 100) };
  });
  return validateLayerDocument({ ...document, layers }).layers;
}

export function duplicateRasterSelection(document, ids, createId) {
  const selectedIds = [], layers = document.layers.flatMap(layer => {
    if (!ids.includes(layer.id) || rasterLayerLocked(layer, document.folders)) return [layer];
    const id = createId(); selectedIds.push(id);
    return [layer, { ...layer, id, name: `${layer.name} copy`.slice(0, 100) }];
  });
  return { layers: validateLayerDocument({ ...document, layers }).layers, selectedIds };
}

export function dropRasterSelection(layers, ids, targetId) {
  const selected = editableRasterLayers(layers, ids), target = layers.find(layer => layer.id === targetId);
  if (!target || target.locked || !selected.length || ids.includes(targetId)) return layers;
  const next = layers.filter(layer => !selected.includes(layer));
  const after = layers.indexOf(selected[0]) < layers.indexOf(target);
  next.splice(next.indexOf(target) + Number(after), 0, ...selected);
  return next;
}

export function rasterComparisonPercent(clientX, bounds, offset = 0) {
  return Math.max(0, Math.min(100, (clientX - offset - bounds.left) / Math.max(1, bounds.width) * 100));
}
