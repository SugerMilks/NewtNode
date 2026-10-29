import React from "react";
import { normalizeProjectCanvases } from "./projectCanvases.js";

export const nodeDraftStorageKey = "seedance-node-editor-draft-v1";

export function loadNodeEditorDraft({ initialNodes = [], initialEdges = [], initialGroups = [], initialViewport = { x: 0, y: 0, scale: 1 }, normalizeEditorGraph, storageKey = nodeDraftStorageKey } = {}) {
  const fallbackGraph = normalizeProjectCanvases({ ...normalizeEditorGraph(initialNodes, initialEdges, initialGroups), viewport: initialViewport });
  const fallback = {
    nodes: fallbackGraph.nodes,
    edges: fallbackGraph.edges,
    groups: fallbackGraph.groups,
    canvases: fallbackGraph.canvases,
    activeCanvasId: fallbackGraph.activeCanvasId,
    viewport: initialViewport,
    projectId: null,
    projectName: "Untitled node project",
    savedProjectName: null,
    projectPackagePath: "",
    workflowFilePath: ""
  };

  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "null");
    if (!parsed || !Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return fallback;
    const graph = normalizeProjectCanvases({ ...parsed, ...normalizeEditorGraph(parsed.nodes, parsed.edges, parsed.groups) });
    return {
      nodes: graph.nodes,
      edges: graph.edges,
      groups: graph.groups,
      canvases: graph.canvases,
      activeCanvasId: graph.activeCanvasId,
      viewport: graph.viewport,
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

export function nodeEditorDraftSnapshot({
  nodes,
  edges,
  groups,
  canvases,
  activeCanvasId,
  viewport,
  projectId,
  projectName,
  savedProjectName,
  projectPackagePath,
  workflowFilePath
}) {
  return {
    nodes,
    edges,
    groups,
    canvases,
    activeCanvasId,
    viewport,
    projectId,
    projectName,
    savedProjectName,
    projectPackagePath,
    workflowFilePath
  };
}

export function useNodeEditorDraftPersistence(snapshot, { storageKey = nodeDraftStorageKey, delayMs = 900 } = {}) {
  const draftWriteTimerRef = React.useRef(null);
  const draftIdleCallbackRef = React.useRef(null);
  const pendingDraftSnapshotRef = React.useRef(null);

  const flushDraftSnapshot = React.useCallback(() => {
    if (draftWriteTimerRef.current) {
      window.clearTimeout(draftWriteTimerRef.current);
      draftWriteTimerRef.current = null;
    }
    if (draftIdleCallbackRef.current && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(draftIdleCallbackRef.current);
      draftIdleCallbackRef.current = null;
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
    if (draftIdleCallbackRef.current && "cancelIdleCallback" in window) {
      window.cancelIdleCallback(draftIdleCallbackRef.current);
      draftIdleCallbackRef.current = null;
    }
    draftWriteTimerRef.current = window.setTimeout(() => {
      draftWriteTimerRef.current = null;
      if ("requestIdleCallback" in window) {
        draftIdleCallbackRef.current = window.requestIdleCallback(() => {
          draftIdleCallbackRef.current = null;
          flushDraftSnapshot();
        }, { timeout: 2000 });
        return;
      }
      flushDraftSnapshot();
    }, delayMs);
  }, [snapshot, delayMs, flushDraftSnapshot]);

  React.useEffect(() => {
    window.addEventListener("pagehide", flushDraftSnapshot);
    return () => {
      window.removeEventListener("pagehide", flushDraftSnapshot);
      flushDraftSnapshot();
    };
  }, [flushDraftSnapshot]);
}
