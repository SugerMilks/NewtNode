export const normalizeLayerRotation = angle => Math.round((((angle % 360 + 540) % 360) - 180) * 1e8) / 1e8;

export function rotateLayerPoint(x, y, degrees) {
  const radians = degrees * Math.PI / 180, cos = Math.cos(radians), sin = Math.sin(radians);
  return { x: x * cos - y * sin, y: x * sin + y * cos };
}

export function rotatedLayerBounds(layer) {
  const radians = (layer.rotation || 0) * Math.PI / 180;
  const cos = Math.abs(Math.cos(radians)), sin = Math.abs(Math.sin(radians));
  const width = layer.width * cos + layer.height * sin, height = layer.width * sin + layer.height * cos;
  return { x: layer.x + (layer.width - width) / 2, y: layer.y + (layer.height - height) / 2, width, height };
}

export function rotatedLayerSize(layer) {
  const bounds = rotatedLayerBounds(layer);
  return { width: Math.ceil(bounds.width - 1e-8), height: Math.ceil(bounds.height - 1e-8) };
}
