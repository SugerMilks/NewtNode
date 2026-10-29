import { vectorCanvasMatrix, vectorTransformUpdates } from "./vectorLayerTransforms.js";
import { validateVectorText } from "./vectorArtwork.js";
import { compose, inverse, toSVG, translate } from "transformation-matrix";

// Validated XML stays detached and is rendered only through image/blob URLs.
export function createVectorLayerRenderer(doc) {
  const original = new DOMParser().parseFromString(doc.svg, "image/svg+xml");
  if (original.querySelector("parsererror")) throw new Error("Could not read the artwork preview.");
  const byKey = new Map(doc.layers.map(layer => [layer.key, layer])), cache = new Map();
  function transformedSvg(keys, matrix, rootKey = "") {
    const copy = original.cloneNode(true), elements = new Map([...copy.querySelectorAll("[id]")].map(element => [element.id, element]));
    const root = copy.documentElement;
    const canvas = vectorCanvasMatrix(doc, root.getAttribute("transform"), root.getAttribute("preserveAspectRatio") || "xMidYMid meet");
    const entries = doc.layers.map(layer => ({ ...layer, transform: elements.get(layer.key)?.getAttribute("transform") }));
    for (const entry of vectorTransformUpdates(entries, keys, matrix, canvas)) elements.get(entry.key).setAttribute("transform", entry.transform);
    if (rootKey) isolate(copy, [rootKey]);
    return new XMLSerializer().serializeToString(copy);
  }
  function isolate(copy, keys) {
    const keep = new Set(), selected = new Set(keys);
    for (const layer of doc.layers) {
      let current = layer;
      while (current) {
        if (selected.has(current.key)) { keep.add(layer.key); break; }
        current = byKey.get(current.parentKey);
      }
    }
    for (const key of keys) {
      let current = byKey.get(key);
      while (current) { keep.add(current.key); current = byKey.get(current.parentKey); }
    }
    for (const element of copy.querySelectorAll("[id]")) if (byKey.has(element.id) && !keep.has(element.id)) element.remove();
    return copy;
  }
  function isolatedSvg(keys) {
    const copy = isolate(original.cloneNode(true), keys);
    return new XMLSerializer().serializeToString(copy);
  }
  function textSvg(operation, rootKey = "") {
    const value = validateVectorText(operation.text), copy = original.cloneNode(true), root = copy.documentElement;
    const elements = new Map([...copy.querySelectorAll("[id]")].map(element => [element.id, element]));
    let node = elements.get(operation.key);
    if (operation.type === "text") {
      const layer = byKey.get(operation.key);
      if (!node || !layer?.text || layer.locked || layer.parentLocked) throw new Error("Choose an unlocked editable text layer.");
    } else if (operation.type === "addText") {
      const canvas = vectorCanvasMatrix(doc, root.getAttribute("transform"), root.getAttribute("preserveAspectRatio") || "xMidYMid meet");
      if (Math.abs(canvas.a * canvas.d - canvas.b * canvas.c) < 1e-12) throw new Error("The canvas has a collapsed transform.");
      node = copy.createElementNS(root.namespaceURI, "text"); node.id = operation.id;
      node.setAttribute("transform", toSVG(compose(inverse(canvas), translate(operation.x, operation.y))));
      root.appendChild(node);
      for (const key of operation.replaceKeys) elements.get(key)?.setAttribute("display", "none");
    } else throw new Error("Choose a text edit to preview.");
    // Match the saved text operation while retaining its parent and transform.
    for (const [name, val] of Object.entries({ "font-family": value.family, "font-size": value.size, "font-weight": value.weight, "text-anchor": value.align, "letter-spacing": value.spacing, fill: value.fill, stroke: "none", x: 0, y: 0 })) node.setAttribute(name, String(val));
    for (const child of [...node.childNodes]) if (child.localName !== "title") child.remove();
    value.content.split("\n").forEach((line, i) => {
      const span = copy.createElementNS(root.namespaceURI, "tspan");
      span.setAttribute("x", "0"); span.setAttribute("dy", String(i ? value.size * value.lineHeight : 0));
      span.textContent = line || " "; node.appendChild(span);
    });
    if (rootKey) isolate(copy, [rootKey]);
    return new XMLSerializer().serializeToString(copy);
  }
  async function raster(keys) {
    const key = JSON.stringify(keys);
    if (cache.has(key)) return cache.get(key);
    const action = async () => {
      const url = URL.createObjectURL(new Blob([isolatedSvg(keys)], { type: "image/svg+xml" }));
      try {
        const image = new Image(); image.src = url; await image.decode();
        const canvas = document.createElement("canvas"), scale = Math.min(1, 640 / Math.max(doc.width, doc.height));
        canvas.width = Math.max(1, Math.round(doc.width * scale)); canvas.height = Math.max(1, Math.round(doc.height * scale));
        const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        return { canvas, data: ctx.getImageData(0, 0, canvas.width, canvas.height).data };
      } finally { URL.revokeObjectURL(url); }
    };
    const promise = action(); cache.set(key, promise);
    while (cache.size > 32) cache.delete(cache.keys().next().value);
    return promise;
  }
  async function hitTest(x, y, deep = false, rootKey = "") {
    if (x < 0 || y < 0 || x >= 1 || y >= 1) return null;
    async function hit(keys) {
      const { canvas, data } = await raster(keys);
      return data[(Math.floor(y * canvas.height) * canvas.width + Math.floor(x * canvas.width)) * 4 + 3] > 4;
    }
    async function find(parentKey) {
      let candidates = doc.layers.filter(layer => layer.parentKey === parentKey && !layer.hidden && !layer.parentHidden && !layer.locked && !layer.parentLocked).sort((a, b) => a.index - b.index);
      if (!candidates.length || !await hit(candidates.map(layer => layer.key))) return null;
      // Binary partition in paint order bounds work even for thousands of paths.
      while (candidates.length > 1) {
        const middle = Math.floor(candidates.length / 2), front = candidates.slice(middle);
        candidates = await hit(front.map(layer => layer.key)) ? front : candidates.slice(0, middle);
      }
      const layer = candidates[0];
      return deep && layer.kind === "g" ? await find(layer.key) || layer.key : layer.key;
    }
    return find(rootKey);
  }
  async function bounds(keys) {
    if (!keys.length) return null;
    const { canvas, data } = await raster(keys);
    let left = canvas.width, top = canvas.height, right = -1, bottom = -1;
    for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) if (data[(y * canvas.width + x) * 4 + 3] > 4) {
      left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y);
    }
    return right < 0 ? null : { left: left / canvas.width * 100, top: top / canvas.height * 100, width: (right - left + 1) / canvas.width * 100, height: (bottom - top + 1) / canvas.height * 100 };
  }
  async function marquee(box, parentKey = "") {
    const candidates = doc.layers.filter(layer => layer.parentKey === parentKey && !layer.hidden && !layer.parentHidden && !layer.locked && !layer.parentLocked);
    if (candidates.length > 128) throw new Error("This level has many objects. Group them or select a range in the Layers panel.");
    const selected = [];
    for (const layer of candidates) { const b = await bounds([layer.key]); if (b && b.left < box.left + box.width && b.left + b.width > box.left && b.top < box.top + box.height && b.top + b.height > box.top) selected.push(layer.key); }
    return selected;
  }
  return { isolatedSvg, hitTest, bounds, transformedSvg, textSvg, marquee };
}

export function vectorLayerRows(layers, expanded, query = "") {
  if (query.trim()) return layers.filter(layer => layer.name.toLowerCase().includes(query.trim().toLowerCase()));
  const children = new Map();
  for (const layer of layers) { if (!children.has(layer.parentKey)) children.set(layer.parentKey, []); children.get(layer.parentKey).push(layer); }
  const rows = [];
  function visit(parent) {
    for (const layer of (children.get(parent) || []).slice().sort((a, b) => b.index - a.index)) {
      rows.push(layer); if (expanded.has(layer.key)) visit(layer.key);
    }
  }
  visit(""); return rows;
}
