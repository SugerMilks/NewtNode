import { createNodeId, remapImportedGraph, resetCopiedNodeRuntime } from "./workflowState.js";

export const defaultCanvasId = "canvas-1";
export const defaultCanvasViewport = { x: 0, y: 0, scale: 1 };
export const canvasName = value => String(value || "").trim().slice(0, 80) || "Untitled Canvas";
const viewport = value => value && [value.x, value.y, value.scale].every(Number.isFinite) && value.scale > 0
  ? { x: value.x, y: value.y, scale: value.scale } : { ...defaultCanvasViewport };

export function projectGraphForStorage(value = {}) {
  value ||= {};
  const graph = { nodes: Array.isArray(value.nodes) ? value.nodes : [], edges: Array.isArray(value.edges) ? value.edges : [],
    groups: Array.isArray(value.groups) ? value.groups : [], viewport: viewport(value.viewport) };
  return Array.isArray(value.canvases) ? normalizeProjectCanvases({ ...graph, canvases: value.canvases, activeCanvasId: value.activeCanvasId }) : graph;
}

// Keep one flat graph for media packaging and running jobs; ownership controls its visible canvas.
export function normalizeProjectCanvases(graph = {}, legacyName = "Canvas 1") {
  const canvases = [], seen = new Set();
  for (const item of Array.isArray(graph.canvases) ? graph.canvases : []) {
    if (!item || typeof item.id !== "string" || !item.id || seen.has(item.id)) continue;
    seen.add(item.id);
    canvases.push({ id: item.id, name: canvasName(item.name), viewport: viewport(item.viewport) });
  }
  if (!canvases.length) { canvases.push({ id: defaultCanvasId, name: canvasName(legacyName), viewport: viewport(graph.viewport) }); seen.add(defaultCanvasId); }
  // Recover orphaned ownership instead of discarding nodes from a partially older save.
  for (const node of graph.nodes || []) {
    if (typeof node.canvasId === "string" && node.canvasId && !seen.has(node.canvasId)) {
      seen.add(node.canvasId);
      canvases.push({ id: node.canvasId, name: `Recovered Canvas ${canvases.length + 1}`, viewport: viewport() });
    }
  }
  const activeCanvasId = seen.has(graph.activeCanvasId) ? graph.activeCanvasId : canvases[0].id;
  const nodes = (graph.nodes || []).map(node => ({ ...node, canvasId: seen.has(node.canvasId) ? node.canvasId : canvases[0].id }));
  const byId = new Map(nodes.map(node => [node.id, node]));
  const edges = (graph.edges || []).filter(edge => byId.has(edge.from?.nodeId) && byId.get(edge.from.nodeId)?.canvasId === byId.get(edge.to?.nodeId)?.canvasId);
  const groups = (graph.groups || []).map(group => {
    const canvasId = seen.has(group.canvasId) ? group.canvasId : byId.get(group.nodeIds?.[0])?.canvasId || canvases[0].id;
    return { ...group, canvasId, nodeIds: (group.nodeIds || []).filter(id => byId.get(id)?.canvasId === canvasId) };
  });
  return { nodes, edges, groups, canvases, activeCanvasId, viewport: viewport(graph.viewport || canvases.find(item => item.id === activeCanvasId).viewport) };
}

export function canvasGraph(graph, id) {
  const nodes = graph.nodes.filter(node => node.canvasId === id), ids = new Set(nodes.map(node => node.id));
  return { nodes, edges: graph.edges.filter(edge => ids.has(edge.from.nodeId) && ids.has(edge.to.nodeId)),
    groups: graph.groups.filter(group => group.canvasId === id) };
}

export function replaceCanvasGraph(graph, id, next) {
  const oldIds = new Set(graph.nodes.filter(node => node.canvasId === id).map(node => node.id));
  return { nodes: [...graph.nodes.filter(node => node.canvasId !== id), ...next.nodes.map(node => ({ ...node, canvasId: id }))],
    edges: [...graph.edges.filter(edge => !oldIds.has(edge.from.nodeId) && !oldIds.has(edge.to.nodeId)), ...next.edges],
    groups: [...graph.groups.filter(group => group.canvasId !== id), ...next.groups.map(group => ({ ...group, canvasId: id }))] };
}

export function snapshotCanvases(canvases, activeCanvasId, currentViewport) {
  return canvases.map(item => item.id === activeCanvasId ? { ...item, viewport: viewport(currentViewport) } : item);
}

export function canvasTabDropTarget(rects, draggedId, clientX) {
  if (!Number.isFinite(clientX) || !rects.some(rect => rect.id === draggedId)) return null;
  const remaining = rects.filter(rect => rect.id !== draggedId);
  if (!remaining.length) return null;
  const next = remaining.findIndex(rect => clientX < (rect.left + rect.right) / 2);
  const index = next < 0 ? remaining.length : next;
  return { index, markerX: remaining[index] ? remaining[index].left - 2 : remaining.at(-1).right + 2 };
}

export function nodeIsWorking(node) {
  const data = node.data || {};
  const busy = status => ["running", "generating", "submitting", "compiling", "uploading", "planning", "revising", "reviewing-sequence", "reviewing", "queued", "compiling-characters", "compiling-board"].includes(status);
  return busy(data.status) || Boolean(data.coverageEnhancing) || busy(data.myNewtSummary?.status)
    || [data.coverageJob, data.outputJob, data.vectorJob, ...(data.coverageShotJobs || []), ...(data.storyboardFrames || [])].some(job => busy(job?.status))
    || Boolean(data.editorExportJob);
}

export function copyCanvasGraph(graph, id, targetId, { includeNewt = false } = {}) {
  const source = canvasGraph(graph, id);
  const copied = remapImportedGraph({ ...source, nodes: source.nodes.filter(node => includeNewt || node.type !== "myNewt") }, {}, createNodeId("canvas-copy"));
  return { ...copied, nodes: copied.nodes.map(node => ({ ...node, canvasId: targetId, data: resetCopiedNodeRuntime(node.data) })),
    groups: copied.groups.map(group => ({ ...group, canvasId: targetId })) };
}

export function transferCanvasNodes(graph, nodeIds, targetId, copy = false) {
  const ids = new Set(nodeIds), selected = graph.nodes.filter(node => ids.has(node.id));
  if (!selected.length || selected.some(nodeIsWorking)) throw new Error("Finish the selected nodes before moving or copying them.");
  if (selected.some(node => node.type === "myNewt")) throw new Error("Move creative nodes separately from Newt.");
  const subset = { nodes: selected, edges: graph.edges.filter(edge => ids.has(edge.from.nodeId) && ids.has(edge.to.nodeId)),
    groups: graph.groups.filter(group => group.nodeIds.length && group.nodeIds.every(id => ids.has(id))) };
  const next = copy ? remapImportedGraph(subset, {}, createNodeId("canvas-copy")) : subset;
  const moved = next.nodes.map(node => ({ ...node, canvasId: targetId, ...(copy ? { data: resetCopiedNodeRuntime(node.data) } : {}) }));
  return { nodes: [...graph.nodes.filter(node => copy || !ids.has(node.id)), ...moved],
    edges: [...graph.edges.filter(edge => copy || !ids.has(edge.from.nodeId) && !ids.has(edge.to.nodeId)), ...next.edges],
    groups: [...graph.groups.filter(group => copy || !subset.groups.includes(group)).map(group => copy ? group : { ...group, nodeIds: group.nodeIds.filter(id => !ids.has(id)) }),
      ...next.groups.map(group => ({ ...group, canvasId: targetId }))], selectedNodeIds: moved.map(node => node.id) };
}
