import { resetCopiedNodeRuntime } from "../workflowState.js";

export function myNewtCheckpoint(graph, name = "Before My Newt task") {
  const clean = (value) => {
    if (Array.isArray(value)) return value.map(clean);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/apiKey|password|secret|accessToken|refreshToken|authorization|^__proto__$|^constructor$|^prototype$/i.test(key)).map(([key, entry]) => [key, clean(entry)]));
  };
  return { name: String(name).slice(0, 160), createdAt: new Date().toISOString(), graph: clean({ nodes: graph.nodes.filter((node) => node.type !== "myNewt"), edges: graph.edges.filter((edge) => !graph.nodes.some((node) => node.type === "myNewt" && node.id === edge.to.nodeId)), groups: graph.groups || [] }) };
}

export function restoreMyNewtCheckpoint(checkpoint, current) {
  if (!checkpoint?.graph || !Array.isArray(checkpoint.graph.nodes) || !Array.isArray(checkpoint.graph.edges)) throw new Error("This task has no usable recovery checkpoint.");
  const agents = current.nodes.filter((node) => node.type === "myNewt");
  const nodes = [...checkpoint.graph.nodes.filter((node) => node.type !== "myNewt").map((node) => ({ ...node, data: resetCopiedNodeRuntime(node.data) })), ...agents];
  const ids = new Set(nodes.map((node) => node.id));
  const agentIds = new Set(agents.map((node) => node.id));
  const edges = [...checkpoint.graph.edges, ...current.edges.filter((edge) => agentIds.has(edge.to.nodeId))].filter((edge) => ids.has(edge.from.nodeId) && ids.has(edge.to.nodeId));
  return { nodes, edges, groups: (checkpoint.graph.groups || []).map((group) => ({ ...group, nodeIds: group.nodeIds.filter((id) => ids.has(id)) })) };
}
