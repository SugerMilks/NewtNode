import { parseFragment, serializeOuter, defaultTreeAdapter as tree } from "parse5";
import { sanitizeVectorSvg } from "./vector-svg.js";
import { vectorCanvasMatrix, vectorTransformUpdates, combineVectorTransforms } from "../src/vectorLayerTransforms.js";
import { applyVectorArtworkOperation, vectorPaintEntries, vectorTextInfo } from "./vector-artwork.js";
import { vectorSelectionGroup } from "../src/vectorLayerOrganization.js";

const namespace = "http://www.w3.org/2000/svg";
const drawable = new Set(["g", "path", "rect", "circle", "ellipse", "line", "polyline", "polygon", "text"]);
const attribute = (node, name) => node.attrs?.find(a => a.name === name)?.value;
const setAttribute = (node, name, value) => {
  node.attrs = node.attrs.filter(a => a.name !== name);
  if (value != null) node.attrs.push({ name, value: String(value) });
};
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const canReleaseChildren = node => node.tagName === "g" && node.attrs.every(attr => ["id", "transform"].includes(attr.name)) && !node.childNodes.some(child => child.tagName && ![...drawable, "title", "desc"].includes(child.tagName));
const validName = value => {
  if (typeof value !== "string" || !value.trim() || value.length > 120 || /[\x00-\x1f\x7f]/.test(value)) fail("Layer names must contain 1-120 printable characters.");
  return value.trim();
};
const setName = (node, value) => {
  const title = tree.createElement("title", namespace, []);
  tree.insertText(title, validName(value));
  node.childNodes = node.childNodes.filter(child => child.tagName !== "title");
  title.parentNode = node; node.childNodes.unshift(title);
};

// Edits address real objects, never colors or inferred semantic regions. Resources
// stay outside the layer tree so visibility changes cannot break clips/gradients.
export function editVectorDocument(input, { operations = [], backgroundKeys = [], lockedKeys = [], isolate = [] } = {}) {
  if (!Array.isArray(operations) || operations.length > 500) fail("Save a version before making more than 500 layer edits.");
  if (Buffer.byteLength(JSON.stringify(operations)) > 256 * 1024) fail("Save a version before adding more layer edit data.");
  operations = operations.flatMap(operation => {
    if (operation?.type !== "batch") return [operation];
    if (!Array.isArray(operation.operations) || !operation.operations.length || operation.operations.length > 100 || operation.operations.some(entry => !entry || entry.type === "batch")) fail("Invalid layer edit batch.");
    return operation.operations;
  });
  if (operations.length > 500) fail("Save a version before making more than 500 layer edits.");
  const safe = sanitizeVectorSvg(input, { allowEmpty: true });
  const root = parseFragment(safe.svg).childNodes.find(node => node.tagName === "svg");
  const nodes = new Map(), usedIds = new Set();
  const collectIds = node => { if (attribute(node, "id")) usedIds.add(attribute(node, "id")); for (const child of node.childNodes || []) if (child.attrs) collectIds(child); };
  collectIds(root);
  let next = 0;
  function register(parent) {
    for (const node of parent.childNodes || []) {
      if (!drawable.has(node.tagName)) continue;
      if (nodes.size >= 5000) fail("This artwork exceeds the 5,000-object layer editor limit. Its original SVG is still available to download.");
      let id = attribute(node, "id");
      if (!id) {
        do { id = `newt-object-${++next}`; } while (usedIds.has(id));
        usedIds.add(id); setAttribute(node, "id", id);
      }
      nodes.set(id, node);
      if (node.tagName === "g") register(node);
    }
  }
  register(root);
  const keys = value => {
    if (!Array.isArray(value) || value.length > 1000 || value.some(key => typeof key !== "string" || !nodes.has(key))) fail("The selected layers no longer match this artwork. Reopen Layers and try again.");
    return [...new Set(value)];
  };
  let background = keys(backgroundKeys);
  const locked = new Set(keys(lockedKeys));
  const ancestorLocked = node => node && node !== root && (locked.has(attribute(node, "id")) || ancestorLocked(node.parentNode));
  const assertEditable = (chosen, descendants = false) => {
    for (const key of chosen) {
      const node = nodes.get(key);
      if (ancestorLocked(node)) fail("Unlock the layer or its parent before editing it.");
      if (descendants) for (const lockedKey of locked) {
        let child = nodes.get(lockedKey);
        while (child && child !== root) { if (child === node) fail("Unlock the layers in this group before editing it."); child = child.parentNode; }
      }
    }
  };
  const removeKeys = node => {
    const key = attribute(node, "id"); nodes.delete(key); locked.delete(key); background = background.filter(value => value !== key);
    for (const child of node.childNodes || []) if (drawable.has(child.tagName)) removeKeys(child);
  };
  for (const operation of operations) {
    if (!operation || typeof operation !== "object") fail("Invalid layer edit.");
    if (applyVectorArtworkOperation(operation, { root, nodes, usedIds, safe, keys, assertEditable, setAttribute, setName })) continue;
    if (operation.type === "rename") {
      const chosen = keys([operation.key]); assertEditable(chosen); setName(nodes.get(chosen[0]), operation.name);
    } else if (operation.type === "renameMany") {
      if (!Array.isArray(operation.names) || operation.names.length > 32) fail("Name up to 32 layers at a time.");
      for (const entry of operation.names) {
        const chosen = keys([entry.key]); assertEditable(chosen); setName(nodes.get(chosen[0]), entry.name);
      }
    } else if (operation.type === "lock") {
      if (typeof operation.locked !== "boolean") fail("Choose a layer lock state.");
      for (const key of keys(operation.keys)) {
        if (ancestorLocked(nodes.get(key).parentNode)) fail("Unlock the parent group first.");
        operation.locked ? locked.add(key) : locked.delete(key);
      }
    } else if (operation.type === "transform" || operation.type === "affine") {
      const chosen = keys(operation.keys); assertEditable(chosen, true);
      const entries = [...nodes].map(([key, node]) => ({ key, parentKey: node.parentNode === root ? "" : attribute(node.parentNode, "id"), transform: attribute(node, "transform") }));
      const canvas = vectorCanvasMatrix(safe, attribute(root, "transform"), attribute(root, "preserveAspectRatio") || "xMidYMid meet");
      for (const entry of vectorTransformUpdates(entries, chosen, operation.matrix, canvas, { affine: operation.type === "affine" })) setAttribute(nodes.get(entry.key), "transform", entry.transform);
    } else if (operation.type === "opacity") {
      if (typeof operation.opacity !== "number" || !Number.isFinite(operation.opacity) || operation.opacity < 0 || operation.opacity > 1) fail("Opacity must be between 0 and 100 percent.");
      const chosen = keys(operation.keys); assertEditable(chosen, true);
      for (const key of chosen) setAttribute(nodes.get(key), "opacity", operation.opacity);
    } else if (operation.type === "delete") {
      const chosen = keys(operation.keys); assertEditable(chosen, true);
      for (const key of chosen) {
        const node = nodes.get(key); if (!node) continue;
        node.parentNode.childNodes = node.parentNode.childNodes.filter(child => child !== node); removeKeys(node);
      }
    } else if (operation.type === "reorder") {
      const chosen = keys(operation.keys), target = nodes.get(keys([operation.target])[0]);
      if (!["before", "after"].includes(operation.position) || !chosen.length || chosen.includes(operation.target)) fail("Choose a different layer as the reorder destination.");
      assertEditable(chosen, true);
      const parent = target.parentNode;
      if (chosen.some(key => nodes.get(key).parentNode !== parent)) fail("Reorder layers within their existing group to preserve their positioning.");
      if (ancestorLocked(parent)) fail("Unlock the parent group first.");
      const ordered = parent.childNodes.filter(child => chosen.includes(attribute(child, "id")));
      parent.childNodes = parent.childNodes.filter(child => !ordered.includes(child));
      parent.childNodes.splice(parent.childNodes.indexOf(target) + (operation.position === "after" ? 1 : 0), 0, ...ordered);
    } else if (operation.type === "ungroup") {
      const chosen = keys(operation.keys); assertEditable(chosen, true);
      for (const key of chosen) {
        const group = nodes.get(key);
        if (!group || group.tagName !== "g" || group.attrs.some(attr => !["id", "transform"].includes(attr.name))) fail("This group carries appearance or positioning. Keep it grouped to preserve the artwork.");
        const children = group.childNodes.filter(child => child.tagName !== "title" && child.tagName !== "desc"), parent = group.parentNode;
        if (attribute(group, "transform")) for (const child of children) {
          if (drawable.has(child.tagName)) setAttribute(child, "transform", combineVectorTransforms(attribute(group, "transform"), attribute(child, "transform")));
          else if (child.tagName) fail("This group contains shared resources. Keep it grouped to preserve the artwork.");
        }
        parent.childNodes.splice(parent.childNodes.indexOf(group), 1, ...children);
        for (const child of children) child.parentNode = parent;
        nodes.delete(key); locked.delete(key); background = background.filter(value => value !== key);
      }
    }
    else if (operation.type === "visibility") {
      if (typeof operation.visible !== "boolean") fail("Choose a layer visibility state.");
      for (const key of keys(operation.keys)) {
        setAttribute(nodes.get(key), "display", operation.visible ? "inline" : "none");
        if (operation.visible) setAttribute(nodes.get(key), "visibility", "visible");
      }
    } else if (operation.type === "background") background = keys(operation.keys);
    else if (operation.type === "backgroundVisibility") {
      if (typeof operation.visible !== "boolean") fail("Choose a background visibility state.");
      for (const key of background) {
        setAttribute(nodes.get(key), "display", operation.visible ? "inline" : "none");
        if (operation.visible) setAttribute(nodes.get(key), "visibility", "visible");
      }
    } else if (operation.type === "group") {
      const chosenKeys = keys(operation.keys); assertEditable(chosenKeys, true);
      let chosen = chosenKeys.map(key => nodes.get(key));
      if (!chosen.length || (chosen.length < 2 && operation.singleton !== true)) fail("Select at least two adjacent objects in the same group.");
      if (nodes.size >= 5000) fail("The artwork has reached the 5,000-object layer editor limit.");
      let parent = chosen[0].parentNode, anchor;
      if (operation.mode === "selection") {
        const entries = [];
        const describe = (parent, parentKey = "") => {
          let index = 0;
          for (const node of parent.childNodes.filter(node => drawable.has(node.tagName))) {
            const key = attribute(node, "id");
            entries.push({ key, parentKey, index: index++, locked: locked.has(key), parentLocked: Boolean(ancestorLocked(parent)), canReparent: canReleaseChildren(node) });
            if (node.tagName === "g") describe(node, key);
          }
        };
        describe(root);
        const plan = vectorSelectionGroup(entries, chosenKeys);
        if (plan.reason) fail(plan.reason);
        chosen = plan.keys.map(key => nodes.get(key)); parent = nodes.get(plan.parentKey) || root; anchor = nodes.get(plan.anchorKey);
        // Carry only pure ancestor transforms. Never detach children from
        // inherited paint, clipping, opacity, or shared-resource containers.
        const updates = chosen.map(node => {
          let transform = attribute(node, "transform"), changed = false;
          for (let ancestor = node.parentNode; ancestor !== parent; ancestor = ancestor.parentNode) {
            if (attribute(ancestor, "transform")) { transform = combineVectorTransforms(attribute(ancestor, "transform"), transform); changed = true; }
          }
          return { node, transform, changed };
        });
        for (const update of updates) if (update.changed) setAttribute(update.node, "transform", update.transform);
      } else {
        if (operation.mode != null) fail("Unsupported layer grouping mode.");
        const siblings = parent.childNodes.filter(node => drawable.has(node.tagName));
        const indices = chosen.map(node => siblings.indexOf(node)).sort((a, b) => a - b);
        if (chosen.some(node => node.parentNode !== parent) || indices.some((index, i) => index !== indices[0] + i)) fail("Group adjacent objects within the same parent to preserve the artwork's stacking order.");
        chosen = siblings.slice(indices[0], indices.at(-1) + 1); anchor = chosen.at(-1);
      }
      if (typeof operation.id !== "string" || !/^newt-group-[a-f0-9-]{36}$/.test(operation.id) || usedIds.has(operation.id)) fail("Invalid or duplicate layer group.");
      const group = tree.createElement("g", namespace, [{ name: "id", value: operation.id }]);
      setName(group, operation.name || "Group");
      parent.childNodes.splice(parent.childNodes.indexOf(anchor) + 1, 0, group); group.parentNode = parent;
      for (const node of chosen) {
        node.parentNode.childNodes = node.parentNode.childNodes.filter(child => child !== node);
        tree.appendChild(group, node);
      }
      nodes.set(operation.id, group); usedIds.add(operation.id);
    } else fail("Unsupported layer edit.");
  }
  const selected = keys(isolate);
  const layers = [];
  const paints = vectorPaintEntries(root), palette = [...new Set(paints.map(entry => entry.color))].sort();
  const paintsByKey = new Map();
  for (const entry of paints) { if (!paintsByKey.has(entry.key)) paintsByKey.set(entry.key, new Set()); paintsByKey.get(entry.key).add(entry.color); }
  function describe(parent, parentKey = "", depth = 0, parentHidden = false) {
    let index = 0;
    for (const node of parent.childNodes) {
      if (!drawable.has(node.tagName)) continue;
      const key = attribute(node, "id"), hidden = attribute(node, "display") === "none" || ["hidden", "collapse"].includes(attribute(node, "visibility"));
      const title = node.childNodes.find(child => child.tagName === "title");
      const titleText = title?.childNodes.filter(child => child.nodeName === "#text").map(child => child.value).join("");
      const fill = attribute(node, "fill");
      const labels = { g: "Group", path: "Path", rect: "Rectangle", circle: "Circle", ellipse: "Ellipse", text: "Text", line: "Line", polyline: "Polyline", polygon: "Polygon" };
      const opacityValue = attribute(node, "opacity"), opacity = opacityValue?.endsWith("%") ? Number(opacityValue.slice(0, -1)) / 100 : Number(opacityValue ?? 1);
      layers.push({ key, parentKey, depth, index: index++, kind: node.tagName, name: (titleText || (key.startsWith("newt-object-") ? `${labels[node.tagName]} ${key.slice(12)}` : key)).slice(0, 120),
        locked: locked.has(key), parentLocked: Boolean(ancestorLocked(node.parentNode)), opacity: Math.max(0, Math.min(1, opacity)),
        canUngroup: canReleaseChildren(node), canReparent: canReleaseChildren(node),
        hidden, parentHidden, background: background.includes(key), color: /^#[a-f0-9]{3,8}$/i.test(fill || "") ? fill : null,
        paints: [...(paintsByKey.get(key) || [])], text: vectorTextInfo(node) });
      if (node.tagName === "g") describe(node, key, depth + 1, parentHidden || hidden);
    }
  }
  describe(root);
  if (selected.length) {
    const keep = new Set();
    for (const key of selected) {
      let node = nodes.get(key);
      const descendants = current => { keep.add(current); for (const child of current.childNodes || []) if (drawable.has(child.tagName)) descendants(child); };
      descendants(node);
      while (node && node !== root) { keep.add(node); node = node.parentNode; }
    }
    for (const node of nodes.values()) if (!keep.has(node)) setAttribute(node, "display", "none");
  }
  // Revalidate the modified document before it can reach either the browser or Sharp.
  const result = sanitizeVectorSvg(serializeOuter(root), { allowEmpty: true });
  return { ...result, layers, palette, lockedKeys: [...locked], backgroundKeys: background, backgroundVisible: background.some(key => !layers.find(layer => layer.key === key)?.hidden) };
}
