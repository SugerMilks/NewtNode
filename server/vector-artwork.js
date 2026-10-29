import { defaultTreeAdapter as tree } from "parse5";
import Color from "@img/colour";
import { compose, inverse, toSVG, translate } from "transformation-matrix";
import { vectorCanvasMatrix } from "../src/vectorLayerTransforms.js";
import { validateVectorText } from "../src/vectorArtwork.js";

const ns = "http://www.w3.org/2000/svg";
const attr = (node, name) => node.attrs?.find(a => a.name === name)?.value;
const solid = value => { try { const color = Color(value); return color.alpha() > 0 ? color.hexa().toLowerCase() : null; } catch { return null; } };
const drawables = new Set(["path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text", "tspan"]);
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };

export function vectorPaintEntries(root) {
  const entries = [];
  function visit(node, inherited = { fill: "black", stroke: "none", color: "black" }, owner = "") {
    if (!node.tagName || ["defs", "clipPath", "mask", "pattern", "linearGradient", "radialGradient"].includes(node.tagName)) return;
    const current = { ...inherited };
    for (const property of ["fill", "stroke", "color"]) { const value = attr(node, property); if (value && value !== "inherit") current[property] = value; }
    if (attr(node, "id") && node.tagName !== "tspan") owner = attr(node, "id");
    if (drawables.has(node.tagName)) for (const property of ["fill", "stroke"]) {
      const value = current[property] === "currentColor" ? current.color : current[property], color = solid(value);
      if (color) entries.push({ node, key: owner, property, color });
    }
    for (const child of node.childNodes || []) visit(child, current, owner);
  }
  visit(root); return entries;
}

export function vectorTextInfo(node) {
  if (node.tagName !== "text" || !attr(node, "id")?.startsWith("newt-text-")) return null;
  const lines = node.childNodes.filter(child => child.tagName === "tspan");
  const content = lines.map(line => line.childNodes.filter(child => child.nodeName === "#text").map(child => child.value).join("")).join("\n");
  const size = Number(attr(node, "font-size"));
  const description = node.childNodes.find(child => child.tagName === "desc")?.childNodes?.find(child => child.nodeName === "#text")?.value || "";
  let lineHeight;
  try { if (description.startsWith("newtnode-text:")) lineHeight = JSON.parse(description.slice(14)).lineHeight; } catch { /* Legacy text keeps the inferred spacing. */ }
  return { content, family: attr(node, "font-family"), size, weight: attr(node, "font-weight"), align: attr(node, "text-anchor"), spacing: Number(attr(node, "letter-spacing")),
    lineHeight: Number.isFinite(lineHeight) ? lineHeight : lines.length > 1 ? Number(attr(lines[1], "dy")) / size : 1.2, fill: (solid(attr(node, "fill")) || "#202020ff").slice(0, 7) };
}

export function applyVectorArtworkOperation(operation, context) {
  const { root, nodes, usedIds, safe, keys, assertEditable, setAttribute, setName } = context;
  const within = (key, selected) => { let node = nodes.get(key); while (node && node !== root) { if (selected.has(attr(node, "id"))) return true; node = node.parentNode; } return false; };
  if (operation.type === "paint") {
    const selected = new Set(keys(operation.keys || []));
    if (!selected.size && operation.all !== true) fail("Select artwork or choose All artwork.");
    if (!/^#[a-f0-9]{6}$/i.test(operation.to || "") || !/^#[a-f0-9]{8}$/i.test(operation.from || "")) fail("Choose valid source and replacement colors.");
    const entries = vectorPaintEntries(root).filter(entry => entry.color === operation.from.toLowerCase() && (operation.all === true || within(entry.key, selected)));
    assertEditable([...new Set(entries.map(entry => entry.key))]);
    for (const entry of entries) setAttribute(entry.node, entry.property, `${operation.to}${entry.color.slice(7)}`);
    return true;
  }
  if (operation.type === "text" || operation.type === "addText") {
    const value = validateVectorText(operation.text);
    let node;
    if (operation.type === "text") {
      const chosen = keys([operation.key]); assertEditable(chosen);
      node = nodes.get(chosen[0]);
      if (!vectorTextInfo(node)) fail("This lettering is not editable text. Use Replace with Text to create a new text layer.");
    } else {
      if (nodes.size >= 5000 || !/^newt-text-[a-f0-9-]{36}$/.test(operation.id || "") || usedIds.has(operation.id)) fail("Invalid text layer or object limit reached.");
      if (![operation.x, operation.y].every(n => Number.isFinite(n) && Math.abs(n) <= 32768)) fail("Choose a bounded text position.");
      const replaced = keys(operation.replaceKeys || []); assertEditable(replaced, true);
      // Replacement hides, rather than deletes, the original outlines.
      for (const key of replaced) setAttribute(nodes.get(key), "display", "none");
      node = tree.createElement("text", ns, [{ name: "id", value: operation.id }]);
      const canvas = vectorCanvasMatrix(safe, attr(root, "transform"), attr(root, "preserveAspectRatio") || "xMidYMid meet");
      if (Math.abs(canvas.a * canvas.d - canvas.b * canvas.c) < 1e-12) fail("The canvas has a collapsed transform.");
      setAttribute(node, "transform", toSVG(compose(inverse(canvas), translate(operation.x, operation.y))));
      tree.appendChild(root, node); nodes.set(operation.id, node); usedIds.add(operation.id);
    }
    for (const [name, val] of Object.entries({ "font-family": value.family, "font-size": value.size, "font-weight": value.weight, "text-anchor": value.align, "letter-spacing": value.spacing, fill: value.fill, stroke: "none", x: 0, y: 0 })) setAttribute(node, name, val);
    node.childNodes = node.childNodes.filter(child => child.tagName === "title");
    if (operation.type === "addText") setName(node, `Text - ${value.content.split("\n")[0]}`.slice(0, 120));
    const description = tree.createElement("desc", ns, []);
    tree.insertText(description, `newtnode-text:${JSON.stringify({ lineHeight: value.lineHeight })}`); tree.appendChild(node, description);
    value.content.split("\n").forEach((line, i) => {
      const span = tree.createElement("tspan", ns, [{ name: "x", value: "0" }, { name: "dy", value: String(i ? value.size * value.lineHeight : 0) }]);
      tree.insertText(span, line || " "); tree.appendChild(node, span);
    });
    return true;
  }
  if (operation.type === "canvas") {
    const { x, y, width, height, id } = operation;
    if (![x, y, width, height].every(Number.isFinite) || Math.abs(x) > 32768 || Math.abs(y) > 32768 || width < 1 || height < 1 || width > 16384 || height > 16384 || width * height > 64000000) fail("Choose a canvas within the image size limits.");
    if (nodes.size >= 5000 || !/^newt-group-[a-f0-9-]{36}$/.test(id || "") || usedIds.has(id)) fail("Invalid canvas group or object limit reached.");
    const check = node => { if (node.attrs?.some(a => /%/.test(a.value) && /^(?:x|y|x1|x2|y1|y2|cx|cy|r|rx|ry|width|height|font-size|stroke-width)$/.test(a.name))) fail("This SVG uses relative dimensions. Keep its canvas size to preserve the artwork."); for (const child of node.childNodes || []) check(child); }; check(root);
    if (attr(root, "clip-path") || attr(root, "mask")) fail("Keep this canvas size to preserve its root clipping or mask.");
    const canvas = vectorCanvasMatrix(safe, attr(root, "transform"), attr(root, "preserveAspectRatio") || "xMidYMid meet");
    if (Math.abs(canvas.a * canvas.d - canvas.b * canvas.c) < 1e-12) fail("The canvas has a collapsed transform.");
    const clipId = `${id}-viewport`;
    if (usedIds.has(clipId)) fail("This canvas identifier is already in use.");
    const defs = tree.createElement("defs", ns, []), clip = tree.createElement("clipPath", ns, [{ name: "id", value: clipId }, { name: "clipPathUnits", value: "userSpaceOnUse" }]);
    const rectangle = tree.createElement("rect", ns, [{ name: "width", value: String(safe.width) }, { name: "height", value: String(safe.height) }, { name: "transform", value: toSVG(inverse(canvas)) }]);
    tree.appendChild(clip, rectangle); tree.appendChild(defs, clip); tree.appendChild(root, defs); usedIds.add(clipId);
    const group = tree.createElement("g", ns, [{ name: "id", value: id }, { name: "transform", value: toSVG(compose(translate(-x, -y), canvas)) }]);
    // Fitting must not reveal shapes previously outside the original viewport.
    setAttribute(group, "clip-path", `url(#${clipId})`);
    setName(group, "Artwork");
    const children = root.childNodes.filter(child => nodes.has(attr(child, "id")));
    root.childNodes = root.childNodes.filter(child => !children.includes(child));
    for (const child of children) tree.appendChild(group, child);
    tree.appendChild(root, group); nodes.set(id, group); usedIds.add(id);
    setAttribute(root, "transform", null); setAttribute(root, "width", width); setAttribute(root, "height", height); setAttribute(root, "viewBox", `0 0 ${width} ${height}`); setAttribute(root, "preserveAspectRatio", "none");
    Object.assign(safe, { width, height, viewBox: [0, 0, width, height] });
    return true;
  }
  return false;
}
