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
