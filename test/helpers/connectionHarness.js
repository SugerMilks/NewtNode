// Exercise the actual canvas handlers with isolated state, never a saved project.
export function createConnectionHarness(source, options = {}) {
  function handler(name, nextName, bindings) {
    const start = source.indexOf(`  function ${name}(`);
    const end = source.indexOf(`  function ${nextName}(`, start);
    if (start < 0 || end < 0) throw new Error(`Missing canvas handler: ${name}`);
    return new Function(...Object.keys(bindings), `return (${source.slice(start, end).trim()});`)(...Object.values(bindings));
  }
  const state = {
    draftEdge: options.draftEdge ?? null,
    dragState: options.dragState ?? null,
    edges: options.edges || [],
    menu: null,
    undoCount: 0,
    stopCount: 0,
    status: "",
    patches: []
  };
  const openNodeContextMenuAtPoint = (x, y) => { state.menu = { x, y }; };
  return {
    state,
    finishConnection(event) {
      return handler("finishConnection", "canCreateEdge", {
        draftEdge: state.draftEdge,
        dragState: state.dragState,
        document: options.document,
        stopNodeDrag: () => { state.stopCount += 1; state.dragState = null; },
        setDraftEdge: value => { state.draftEdge = typeof value === "function" ? value(state.draftEdge) : value; },
        setSaveStatus: value => { state.status = value; },
        pushUndoSnapshot: () => { state.undoCount += 1; },
        nodesRef: { current: options.nodes || [] },
        getConnectionError: options.getConnectionError || (() => ""),
        isAutoAspectNode: node => node?.type === "autoAspect",
        isCoverageNode: node => node?.type === "coverage",
        isComposerCharacterInputPort: () => false,
        setEdges: update => { state.edges = update(state.edges); },
        updateNode: (id, patch) => { state.patches.push({ id, patch }); },
        resetAutoAspectOutputPatch: () => ({ resultUrl: "" }),
        resetCoverageOutputPatch: () => ({ resultItems: [] }),
        screenToScene: (x, y) => ({ x, y }),
        openNodeContextMenuAtPoint
      })(event);
    },
    openContextMenu(event) {
      return handler("openCanvasContextMenu", "openNodeContextMenuAtPoint", { openNodeContextMenuAtPoint })(event);
    }
  };
}
