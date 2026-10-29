import { compose, fromDefinition, fromTransformAttribute, identity, inverse, scale, toSVG, translate } from "transformation-matrix";

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const finiteMatrix = matrix => ["a", "b", "c", "d", "e", "f"].every(key => typeof matrix?.[key] === "number" && Number.isFinite(matrix[key]) && Math.abs(matrix[key]) <= 1e9);
function parsedTransform(value) {
  if (!value) return identity();
  try {
    const matrices = fromDefinition(fromTransformAttribute(value));
    const result = matrices.length ? compose(matrices) : identity();
    if (!finiteMatrix(result)) throw new Error();
    return result;
  } catch { fail("This layer has an unsupported transform. Its original artwork is unchanged."); }
}

export function combineVectorTransforms(parent, child) {
  const result = compose(parsedTransform(parent), parsedTransform(child));
  if (!finiteMatrix(result)) fail("This group's transform is too large to ungroup safely.");
  return toSVG(result);
}

// Map SVG user coordinates to the actual artwork pixels, including letterboxing.
// SVG2 applies a root transform outside its viewBox transform.
export function vectorCanvasMatrix({ width, height, viewBox }, rootTransform = "", aspect = "xMidYMid meet") {
  const [x, y, w, h] = viewBox || [0, 0, width, height];
  let sx = width / w, sy = height / h;
  if (aspect !== "none") sx = sy = aspect.includes("slice") ? Math.max(sx, sy) : Math.min(sx, sy);
  const tx = -x * sx + (aspect.includes("xMid") ? (width - w * sx) / 2 : aspect.includes("xMax") ? width - w * sx : 0);
  const ty = -y * sy + (aspect.includes("YMid") ? (height - h * sy) / 2 : aspect.includes("YMax") ? height - h * sy : 0);
  return compose(parsedTransform(rootTransform), translate(tx, ty), scale(sx, sy));
}

export function vectorTransformUpdates(layers, keys, delta, canvas = identity(), { affine = false } = {}) {
  const determinant = delta?.a * delta?.d - delta?.b * delta?.c;
  if (!finiteMatrix(delta) || (affine ? Math.abs(determinant) < .0001 || Math.abs(determinant) > 10000 || Math.max(Math.abs(delta.a), Math.abs(delta.b), Math.abs(delta.c), Math.abs(delta.d)) > 100
    : delta.b !== 0 || delta.c !== 0 || delta.a < .01 || delta.d < .01 || delta.a > 100 || delta.d > 100)) fail(affine ? "Choose a bounded rotation or flip transform." : "Choose a bounded move or resize without flipping the artwork.");
  if (!Array.isArray(keys) || !keys.length || keys.length > 1000) fail("Select layers to move or resize.");
  const byKey = new Map(layers.map(layer => [layer.key, layer])), selected = new Set(keys), world = new Map([["", canvas]]);
  if (keys.some(key => !byKey.has(key))) fail("The selected layers no longer match this artwork.");
  const parentMatrix = key => {
    if (world.has(key)) return world.get(key);
    const layer = byKey.get(key);
    if (!layer) fail("The selected layers no longer match this artwork.");
    const result = compose(parentMatrix(layer.parentKey), parsedTransform(layer.transform));
    world.set(key, result); return result;
  };
  return [...selected].filter(key => {
    let parent = byKey.get(key).parentKey;
    while (parent) { if (selected.has(parent)) return false; parent = byKey.get(parent)?.parentKey; }
    return true;
  }).map(key => {
    const layer = byKey.get(key), parent = parentMatrix(layer.parentKey);
    if (!finiteMatrix(parent) || Math.abs(parent.a * parent.d - parent.b * parent.c) < 1e-12) fail("This layer's parent has a collapsed transform. Choose a different layer or group.");
    const result = compose(inverse(parent), delta, parent, parsedTransform(layer.transform));
    if (!finiteMatrix(result)) fail("This resize is too large. Use a smaller adjustment.");
    return { key, transform: toSVG(result) };
  });
}

export const vectorResizeHandles = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
export function vectorGestureTransform(box, handle, dx, dy, { free = false, center = false } = {}) {
  if (!handle) return { matrix: translate(dx, dy), box: { ...box, left: box.left + dx, top: box.top + dy } };
  const horizontal = /[ew]/.test(handle), vertical = /[ns]/.test(handle), corner = horizontal && vertical;
  const anchorX = box.left + box.width * (center ? .5 : handle.includes("w") ? 1 : 0);
  const anchorY = box.top + box.height * (center ? .5 : handle.includes("n") ? 1 : 0);
  let sx = horizontal ? 1 + dx * (handle.includes("w") ? -1 : 1) * (center ? 2 : 1) / box.width : 1;
  let sy = vertical ? 1 + dy * (handle.includes("n") ? -1 : 1) * (center ? 2 : 1) / box.height : 1;
  if (corner && !free) sx = sy = Math.abs(sx - 1) > Math.abs(sy - 1) ? sx : sy;
  sx = Math.min(100, Math.max(.01, sx)); sy = Math.min(100, Math.max(.01, sy));
  return { matrix: scale(sx, sy, anchorX, anchorY), box: { left: anchorX + (box.left - anchorX) * sx, top: anchorY + (box.top - anchorY) * sy, width: box.width * sx, height: box.height * sy } };
}
