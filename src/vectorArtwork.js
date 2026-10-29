import { compose, rotateDEG, scale, translate } from "transformation-matrix";

export const vectorEditorVersion = 6;
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
export const vectorTextDefaults = Object.freeze({ content: "Your text", family: "sans-serif", size: 48, weight: "400", align: "middle", spacing: 0, lineHeight: 1.2, fill: "#202020" });
export function validateVectorText(value) {
  if (!value || typeof value.content !== "string" || !value.content.trim() || value.content.length > 2000 || value.content.split("\n").length > 30 || /[\x00-\x08\x0b-\x1f\x7f]/.test(value.content)) fail("Enter 1-2,000 characters and at most 30 lines.");
  if (typeof value.family !== "string" || !/^[A-Za-z0-9 _-]{1,100}$/.test(value.family)) fail("Choose a supported local font family.");
  for (const [key, min, max] of [["size", 1, 1000], ["spacing", -100, 100], ["lineHeight", .5, 4]]) if (!Number.isFinite(value[key]) || value[key] < min || value[key] > max) fail(`Text ${key} is outside its supported range.`);
  if (!["100", "200", "300", "400", "500", "600", "700", "800", "900"].includes(value.weight) || !["start", "middle", "end"].includes(value.align) || !/^#[a-f0-9]{6}$/i.test(value.fill)) fail("Choose a valid weight, alignment and solid text color.");
  return Object.fromEntries(Object.keys(vectorTextDefaults).map(key => [key, value[key]]));
}
export function vectorPixelBox(box, doc) { return { left: box.left * doc.width / 100, top: box.top * doc.height / 100, width: box.width * doc.width / 100, height: box.height * doc.height / 100 }; }
export function vectorBoxUnion(boxes) {
  const left = Math.min(...boxes.map(b => b.left)), top = Math.min(...boxes.map(b => b.top));
  return { left, top, width: Math.max(...boxes.map(b => b.left + b.width)) - left, height: Math.max(...boxes.map(b => b.top + b.height)) - top };
}
export function vectorFinishingMatrix(box, action, amount = 15) {
  const x = box.left + box.width / 2, y = box.top + box.height / 2;
  if (action === "rotate") { if (!Number.isFinite(amount) || Math.abs(amount) > 360) fail("Choose a rotation between -360 and 360 degrees."); return rotateDEG(amount, x, y); }
  if (action === "flipX" || action === "flipY") return compose(translate(x, y), scale(action === "flipX" ? -1 : 1, action === "flipY" ? -1 : 1), translate(-x, -y));
  fail("Unknown transform.");
}
export function vectorAlignmentOperation(boxes, mode, canvas) {
  if (!boxes.length || boxes.length > 32) fail("Select up to 32 objects to align.");
  const union = boxes.length === 1 ? { left: 0, top: 0, width: canvas.width, height: canvas.height } : vectorBoxUnion(boxes);
  const translations = new Map();
  if (mode === "distributeX" || mode === "distributeY") {
    if (boxes.length < 3) fail("Select at least three objects to distribute.");
    const horizontal = mode === "distributeX", pos = horizontal ? "left" : "top", size = horizontal ? "width" : "height";
    const sorted = [...boxes].sort((a, b) => a[pos] - b[pos]), first = sorted[0], last = sorted.at(-1);
    const gap = (last[pos] + last[size] - first[pos] - sorted.reduce((sum, b) => sum + b[size], 0)) / (sorted.length - 1);
    let cursor = first[pos];
    for (const box of sorted) { translations.set(box.key, horizontal ? [cursor - box[pos], 0] : [0, cursor - box[pos]]); cursor += box[size] + gap; }
  } else {
    const options = { left: ["left", "width", 0], center: ["left", "width", .5], right: ["left", "width", 1], top: ["top", "height", 0], middle: ["top", "height", .5], bottom: ["top", "height", 1] };
    if (!options[mode]) fail("Unknown alignment.");
    const [pos, size, fraction] = options[mode];
    for (const box of boxes) { const delta = union[pos] + union[size] * fraction - box[pos] - box[size] * fraction; translations.set(box.key, pos === "left" ? [delta, 0] : [0, delta]); }
  }
  const operations = boxes.map(box => ({ type: "transform", keys: [box.key], matrix: translate(...translations.get(box.key)) }));
  return { type: "batch", operations };
}
export function vectorSnapMove(box, targets, threshold) {
  const axes = [["left", "width"], ["top", "height"]], offsets = [], guides = [];
  for (const [pos, size] of axes) {
    let best = threshold + 1, offset = 0, guide = null;
    for (const target of targets) for (const sourceFraction of [0, .5, 1]) for (const targetFraction of [0, .5, 1]) {
      const line = target[pos] + target[size] * targetFraction, delta = line - box[pos] - box[size] * sourceFraction;
      if (Math.abs(delta) <= threshold && Math.abs(delta) < best) { best = Math.abs(delta); offset = delta; guide = line; }
    }
    offsets.push(offset); guides.push(guide);
  }
  return { dx: offsets[0], dy: offsets[1], guides };
}
