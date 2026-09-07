import { nodeTypeDefinitions } from "../nodeRegistry.js";
import { resetCopiedNodeRuntime, remapImportedGraph, createNodeId } from "../workflowState.js";
import { estimatedNodeRect, groupToRect } from "../nodeGeometry.js";
import { cleanReferenceTag } from "../referenceTags.js";

const types = new Set(nodeTypeDefinitions.map((entry) => entry.type));
const privateField = /^(?:.*apiKey.*|.*password.*|.*secret.*|accessToken|refreshToken|authorization|jobId|myNewtSummary)$/i;
export const newtPresetInputRoles = Object.freeze({ image: ["Image", "Location", "Prop"], character: ["Character"], transfer: ["Mood Board"], video: ["Video"], audio: ["Audio"] });

export const newtPresetDisplayName = (preset) => `${preset.name} (${preset.isSystem ? "System" : "User"})`;

function presetData(value) {
  if (Array.isArray(value)) return value.map(presetData);
  if (!value || typeof value !== "object") return value;
  const result = Object.fromEntries(Object.entries(value).filter(([key]) => !privateField.test(key) && !["__proto__", "constructor", "prototype"].includes(key))
    .map(([key, entry]) => [key, presetData(entry)]));
  if (["running", "planning", "compiling", "uploading", "generating"].includes(result.status)) result.status = result.resultUrl ? "complete" : "ready";
  return result;
}

export function buildNewtPresetGraph(graph = {}, selectedIds = (graph.nodes || []).map((node) => node.id), measured = {}) {
  const selected = new Set(selectedIds), ids = new Set();
  const nodes = (graph.nodes || []).filter((node) => {
    if (typeof node.id !== "string" || !node.id || !selected.has(node.id) || node.type === "myNewt" || !types.has(node.type) || ids.has(node.id)) return false;
    ids.add(node.id); return true;
  }).map((node) => {
    const size = measured[node.id] || node.presetSize;
    return {
      id: node.id, type: node.type, x: Number(node.x) || 0, y: Number(node.y) || 0,
      data: presetData(resetCopiedNodeRuntime(node.data)),
      ...(size?.width > 0 && size?.height > 0 ? { presetSize: { width: size.width, height: size.height } } : {})
    };
  });
  if (!nodes.length) throw new Error("Select at least one creative node to save a Newt Preset.");
  if (nodes.length > 250) throw new Error("A Newt Preset can contain up to 250 nodes.");
  const edges = (graph.edges || []).filter((edge) => ids.has(edge.from?.nodeId) && ids.has(edge.to?.nodeId))
    .map((edge) => ({ id: edge.id, from: { nodeId: edge.from.nodeId, port: edge.from.port }, to: { nodeId: edge.to.nodeId, port: edge.to.port }, color: edge.color }));
  const groups = (graph.groups || []).filter((group) => group.nodeIds?.length && group.nodeIds.every((id) => ids.has(id)))
    .map((group) => ({ ...presetData(group), nodeIds: [...group.nodeIds] }));
  const slots = (Array.isArray(graph.slots) ? graph.slots : []).filter((slot) => ids.has(slot.nodeId)).map((slot) => {
    const type = nodes.find((node) => node.id === slot.nodeId).type;
    if (!newtPresetInputRoles[type]?.includes(slot.role)) throw new Error("Choose a valid preset input role.");
    return { nodeId: slot.nodeId, type, role: slot.role, label: String(slot.label || slot.role).slice(0, 100) };
  });
  if (new Set(slots.map((slot) => slot.nodeId)).size !== slots.length) throw new Error("Each preset input must be unique.");
  return { nodes, edges, groups, ...(slots.length ? { slots } : {}) };
}

export function instantiateNewtPreset(graph, offset = {}) {
  const clean = buildNewtPresetGraph(graph);
  const next = remapImportedGraph(clean, offset);
  const ids = new Map(clean.nodes.map((node, index) => [node.id, next.nodes[index].id]));
  // Director manifests, Preview layouts, and scene tabs also carry node references.
  const remap = (value) => {
    if (typeof value === "string") return ids.get(value) || value;
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [ids.get(key) || key, remap(entry)]));
    return value;
  };
  next.nodes = next.nodes.map((node) => ({ ...node, data: remap(node.data) }));
  next.edges = next.edges.map((edge) => ({ ...edge, id: createNodeId("edge") }));
  next.groups = next.groups.map((group) => ({ ...group, id: createNodeId("group") }));
  if (clean.slots) next.slots = clean.slots.map((slot) => ({ ...slot, originalNodeId: slot.nodeId, nodeId: ids.get(slot.nodeId) }));
  return next;
}

export function bindNewtPresetInputs(graph, bindings = {}, availableNodes = []) {
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) throw new Error("Provide preset input bindings by slot ID.");
  const slotIds = new Set((graph.slots || []).map((slot) => slot.originalNodeId || slot.nodeId));
  if (Object.keys(bindings).some((id) => !slotIds.has(id))) throw new Error("A preset input no longer exists. Reload the preset before binding assets.");
  const replacements = new Map(), names = [];
  for (const slot of graph.slots || []) {
    const id = bindings[slot.originalNodeId || slot.nodeId];
    if (!id) continue;
    const source = availableNodes.find((node) => node.id === id), old = graph.nodes.find((node) => node.id === slot.nodeId);
    if (!source || source.type !== slot.type) throw new Error(`Choose a matching ${slot.role} for ${slot.label}.`);
    replacements.set(slot.nodeId, id);
    const oldName = cleanReferenceTag(old.data?.characterName || old.data?.title), newName = cleanReferenceTag(source.data?.characterName || source.data?.title);
    if (oldName && newName && oldName !== newName) names.push([oldName, newName]);
  }
  if (!replacements.size) return graph;
  const affected = new Set(replacements.keys());
  let size = -1;
  while (affected.size !== size) { size = affected.size; for (const edge of graph.edges) if (affected.has(edge.from.nodeId)) affected.add(edge.to.nodeId); }
  const nameMap = new Map(names.map(([from, to]) => [from.toLowerCase(), to]));
  const tagPattern = names.length ? new RegExp(`@(${names.map(([from]) => from.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?![\\w-])`, "gi") : null;
  const rewrite = (value) => {
    if (typeof value === "string") {
      if (replacements.has(value)) return replacements.get(value);
      if (/^(?:https?:|data:|\/outputs\/|\/uploads\/|\/workflow-assets\/)/.test(value)) return value;
      return tagPattern ? value.replace(tagPattern, (match, name) => `@${nameMap.get(name.toLowerCase())}`) : value;
    }
    if (Array.isArray(value)) return value.map(rewrite);
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [replacements.get(key) || key, rewrite(entry)]));
    return value;
  };
  const nodes = graph.nodes.filter((node) => !replacements.has(node.id)).map((node) => {
    let data = rewrite(node.data);
    if (affected.has(node.id)) {
      data = { ...data, resultUrl: "", resultItems: [], resultText: "", error: "", status: "ready", locked: false, selectedResultIndex: 0 };
      if (node.type === "skillDirector") data = { ...data, skillDirectorBuilt: false, skillDirectorLocks: {}, styleDirection: "", motionDirection: "", shotList: "", skillDirectorRevisionHistory: [], skillDirectorScenes: [], skillDirectorActiveSceneId: "", compiledPrompt: "" };
      if (node.type === "storyboard") data = { ...data, storyboardFrames: [], storyboardBoardUrl: "", storyboardPlanFingerprint: "" };
      if (node.type === "preview") data = { ...data, previewLayout: [], previewLayoutItems: [] };
    }
    return { ...node, data };
  });
  return { ...graph, nodes, edges: graph.edges.filter((edge) => !replacements.has(edge.to.nodeId)).map((edge) => ({ ...edge, from: { ...edge.from, nodeId: replacements.get(edge.from.nodeId) || edge.from.nodeId } })), groups: graph.groups.map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => !replacements.has(id)) })) };
}

export function newtPresetOffset(graph, occupied = []) {
  const rects = [...graph.nodes.map((node) => estimatedNodeRect(node)), ...(graph.groups || []).map(groupToRect)];
  return {
    x: (occupied.length ? Math.max(...occupied.map((rect) => rect.right)) + 80 : 120) - Math.min(...rects.map((rect) => rect.left)),
    y: (occupied.length ? Math.min(...occupied.map((rect) => rect.top)) : 120) - Math.min(...rects.map((rect) => rect.top))
  };
}
