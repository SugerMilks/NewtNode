import React from "react";

export const nodeDraftStorageKey = "seedance-node-editor-draft-v1";

export function loadNodeEditorDraft({ initialNodes = [], initialEdges = [], normalizeEditorGraph, storageKey = nodeDraftStorageKey } = {}) {
  const fallbackGraph = normalizeEditorGraph(initialNodes, initialEdges);
  const fallback = {
    nodes: fallbackGraph.nodes,
    edges: fallbackGraph.edges,
    groups: fallbackGraph.groups,
    viewport: { x: 0, y: 0, scale: 1 },
    projectId: null,
    projectName: "Untitled node project",
    savedProjectName: null,
    projectPackagePath: "",
    workflowFilePath: ""
  };

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return fallback;
    const graph = normalizeEditorGraph(parsed.nodes, parsed.edges, parsed.groups);
    return {
      nodes: graph.nodes,
      edges: graph.edges,
      groups: graph.groups,
      viewport: parsed.viewport || fallback.viewport,
      projectId: parsed.projectId || null,
      projectName: parsed.projectName || fallback.projectName,
      savedProjectName: parsed.savedProjectName || null,
      projectPackagePath: parsed.projectPackagePath || "",
      workflowFilePath: parsed.workflowFilePath || ""
    };
  } catch {
    return fallback;
  }
}

export function useNodeEditorDraftPersistence(snapshot, { storageKey = nodeDraftStorageKey, delayMs = 300 } = {}) {
  const draftWriteTimerRef = React.useRef(null);
  const pendingDraftSnapshotRef = React.useRef(null);

  const flushDraftSnapshot = React.useCallback(() => {
    if (draftWriteTimerRef.current) {
      window.clearTimeout(draftWriteTimerRef.current);
      draftWriteTimerRef.current = null;
    }

    const pendingSnapshot = pendingDraftSnapshotRef.current;
    if (!pendingSnapshot) return;

    try {
      window.localStorage.setItem(storageKey, JSON.stringify(pendingSnapshot));
      pendingDraftSnapshotRef.current = null;
    } catch {
      // Local persistence should never interrupt the node editor.
    }
  }, [storageKey]);

  React.useEffect(() => {
    pendingDraftSnapshotRef.current = snapshot;
    if (draftWriteTimerRef.current) {
      window.clearTimeout(draftWriteTimerRef.current);
    }
    draftWriteTimerRef.current = window.setTimeout(flushDraftSnapshot, delayMs);
  }, [snapshot, delayMs, flushDraftSnapshot]);

  React.useEffect(() => {
    window.addEventListener("pagehide", flushDraftSnapshot);
    return () => {
      window.removeEventListener("pagehide", flushDraftSnapshot);
      flushDraftSnapshot();
    };
  }, [flushDraftSnapshot]);
}
