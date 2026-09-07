import { buildNewtPresetGraph, instantiateNewtPreset } from "./presets.js";
import { graphBoundsForNodes, groupToRect } from "../nodeGeometry.js";

export function buildMyNewtDuplicateGraph(graph, nodeIds, count = 1) {
  if (!Number.isInteger(count) || count < 1 || count > 10 || !nodeIds.length || nodeIds.length * count > 100) throw new Error("Duplicate 1 to 10 copies, up to 100 new nodes at a time.");
  const originals = nodeIds.map((id) => graph.nodes.find((node) => node.id === id));
  if (originals.some((node) => !node || node.type === "myNewt")) throw new Error("Choose creative nodes to duplicate, not My Newt.");
  if (originals.some((node) => ["running", "planning", "compiling", "uploading", "generating"].includes(node.data?.status))) throw new Error("Wait for the selected nodes to finish before duplicating them.");
  const clean = buildNewtPresetGraph(graph, nodeIds);
  const rects = [graphBoundsForNodes(clean.nodes), ...clean.groups.map(groupToRect)];
  const bounds = { left: Math.min(...rects.map((rect) => rect.left)), top: Math.min(...rects.map((rect) => rect.top)), right: Math.max(...rects.map((rect) => rect.right)) };
  const selected = new Set(nodeIds), names = new Set(graph.nodes.map((node) => node.data?.title));
  const groupNames = new Set((graph.groups || []).map((group) => group.name));
  const result = { nodes: [], edges: [], groups: [], externalEdges: [] };
  for (let i = 0; i < count; i++) {
    const copy = instantiateNewtPreset(clean, { x: -bounds.left + i * (bounds.right - bounds.left + 120), y: -bounds.top });
    const ids = new Map(clean.nodes.map((node, index) => [node.id, copy.nodes[index].id]));
    for (const node of copy.nodes) {
      const base = `${node.data.title || node.type} Copy`; let name = base, index = 2;
      while (names.has(name)) name = `${base} ${index++}`;
      names.add(name); node.data.title = name;
    }
    for (const group of copy.groups) {
      const base = `${group.name || "Group"} Copy`; let name = base, index = 2;
      while (groupNames.has(name)) name = `${base} ${index++}`;
      groupNames.add(name); group.name = name;
    }
    result.nodes.push(...copy.nodes); result.edges.push(...copy.edges); result.groups.push(...copy.groups);
    result.externalEdges.push(...graph.edges.filter((edge) => selected.has(edge.to.nodeId) && !selected.has(edge.from.nodeId)).map((edge) => ({ ...edge, to: { ...edge.to, nodeId: ids.get(edge.to.nodeId) } })));
  }
  return result;
}
