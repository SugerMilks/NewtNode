export function cloneGraphState(state) {
  return {
    nodes: (state.nodes || []).map(cloneNode),
    edges: (state.edges || []).map(cloneEdge),
    groups: (state.groups || []).map(cloneGroup),
    viewport: { ...(state.viewport || { x: 0, y: 0, scale: 1 }) },
    selectedNodeIds: [...(state.selectedNodeIds || [])],
    selectedEdgeId: state.selectedEdgeId || null
  };
}

export function workflowStateFingerprint(state = {}) {
  return JSON.stringify({
    nodes: (state.nodes || []).map(cloneNode),
    edges: (state.edges || []).map(cloneEdge),
    groups: (state.groups || []).map(cloneGroup),
    projectName: String(state.projectName || "Untitled node project").trim() || "Untitled node project",
    projectPackagePath: state.projectPackagePath || ""
  });
}

export function cloneNode(node) {
  return {
    ...node,
    data: JSON.parse(JSON.stringify(node?.data || {}))
  };
}

export function createNodeId(type, suffix = "") {
  const randomPart = Math.random().toString(36).slice(2, 8);
  return [type, Date.now(), suffix, randomPart].filter(Boolean).join("-");
}

export function resetCopiedNodeRuntime(data = {}) {
  if (!["running", "uploading"].includes(data.status)) return data;

  return {
    ...data,
    status: "ready",
    error: "",
    resultUrl: "",
    resultItems: [],
    selectedResultIndex: 0,
    resultText: ""
  };
}

export function sameStringList(first = [], second = []) {
  if (first.length !== second.length) return false;
  return first.every((value, index) => value === second[index]);
}

export function sameEdgeList(first = [], second = []) {
  if (first.length !== second.length) return false;
  return first.every((edge, index) => {
    const nextEdge = second[index];
    return (
      edge.id === nextEdge?.id &&
      edge.from?.nodeId === nextEdge.from?.nodeId &&
      edge.from?.port === nextEdge.from?.port &&
      edge.to?.nodeId === nextEdge.to?.nodeId &&
      edge.to?.port === nextEdge.to?.port &&
      edge.color === nextEdge.color
    );
  });
}

export function dedupeEdges(edges) {
  const seen = new Set();
  return edges.filter((edge) => {
    const key = `${edge.from.nodeId}:${edge.from.port}->${edge.to.nodeId}:${edge.to.port}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function clearStaleRunningState(node) {
  if (node.data?.status !== "running") return node;

  return {
    ...node,
    data: {
      ...node.data,
      status: node.data.resultUrl ? "complete" : "ready"
    }
  };
}

export function remapImportedGraph(graph = {}, offset = {}, stamp = Date.now()) {
  const idMap = new Map();
  const safeOffset = {
    x: Number(offset.x) || 0,
    y: Number(offset.y) || 0
  };
  const nodes = graph.nodes || [];
  const edges = graph.edges || [];
  const groups = graph.groups || [];

  const remappedNodes = nodes.map((node, index) => {
    const nextId = createNodeId(node.type, `import-${stamp}-${index}`);
    idMap.set(node.id, nextId);
    return {
      ...cloneNode(node),
      id: nextId,
      x: Math.round(node.x + safeOffset.x),
      y: Math.round(node.y + safeOffset.y)
    };
  });

  const remappedEdges = edges
    .filter((edge) => idMap.has(edge.from.nodeId) && idMap.has(edge.to.nodeId))
    .map((edge, index) => ({
      ...cloneEdge(edge),
      id: `edge-import-${stamp}-${index}`,
      from: {
        ...edge.from,
        nodeId: idMap.get(edge.from.nodeId)
      },
      to: {
        ...edge.to,
        nodeId: idMap.get(edge.to.nodeId)
      }
    }));

  const remappedGroups = groups.map((group, index) => ({
    ...cloneGroup(group),
    id: `group-import-${stamp}-${index}`,
    x: Math.round(group.x + safeOffset.x),
    y: Math.round(group.y + safeOffset.y),
    nodeIds: (group.nodeIds || []).map((nodeId) => idMap.get(nodeId)).filter(Boolean)
  }));

  return {
    nodes: remappedNodes,
    edges: remappedEdges,
    groups: remappedGroups
  };
}

export function cloneEdge(edge) {
  return {
    ...edge,
    from: { ...edge.from },
    to: { ...edge.to }
  };
}

export function cloneGroup(group) {
  return {
    ...group,
    nodeIds: [...(group.nodeIds || [])]
  };
}
