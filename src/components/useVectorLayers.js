import React from "react";
import { ideogramVectorApi } from "../api/newtApi.js";
import { appendVectorLayerResult } from "../ideogramVector.js";
import { workflowContextPayload } from "../workflowContext.js";
import { stepVectorLayerHistory } from "../vectorLayerHistory.js";
import { needsVectorLayerSetup, needsVectorGroupSetup, prepareVectorLayerState } from "../vectorLayerOrganization.js";
import { vectorEditorVersion } from "../vectorArtwork.js";

export function useVectorLayers({ node, data, update, workflowContext, api = ideogramVectorApi, open = false }) {
  const item = data.resultItems[data.selectedResultIndex];
  const operations = data.vectorLayerDrafts.find(draft => draft.svgUrl === item?.svgUrl)?.operations || [];
  const signature = JSON.stringify(operations);
  const needsView = open || operations.length > 0;
  const rootScope = JSON.stringify([node.id, workflowContext?.projectId, workflowContext?.workflowPackageId, workflowContext?.workflowPackagePath]);
  const scope = `${rootScope}:${item?.svgUrl || ""}`;
  const latest = React.useRef(); latest.current = { rootScope, scope, data, update, api, item, operations, signature };
  const [view, setView] = React.useState(null), [error, setError] = React.useState(""), [saving, setSaving] = React.useState(false);
  const [redo, setRedo] = React.useState([]), [retry, setRetry] = React.useState(0);
  const history = React.useRef(); history.current = { operations, redo };
  const saveToken = React.useRef(null);
  React.useEffect(() => {
    setSaving(false); setError("");
    return () => { saveToken.current?.controller.abort(); saveToken.current = null; };
  }, [rootScope]);
  React.useEffect(() => { setRedo([]); setError(""); }, [scope]);
  React.useEffect(() => {
    if (!needsView || !item?.svgUrl) return;
    const controller = new AbortController(); let active = true;
    setError("");
    const timer = setTimeout(async () => {
      try {
        const prepareBackground = open && needsVectorLayerSetup(item, operations);
        const prepareGroups = open && needsVectorGroupSetup(item);
        const response = await latest.current.api.inspectLayers({ editorVersion: vectorEditorVersion, svgUrl: item.svgUrl, operations, prepareBackground, prepareGroups, backgroundKeys: item.vectorBackgroundKeys || [], lockedKeys: item.vectorLockedKeys || [] }, { signal: controller.signal });
        if (active && latest.current.scope === scope && latest.current.signature === signature) {
          const next = (prepareBackground || prepareGroups) && response.initialOperation ? [...operations, response.initialOperation] : operations;
          if (prepareBackground || prepareGroups) {
            history.current = { operations: next, redo: [] }; setRedo([]);
            latest.current.update(current => prepareVectorLayerState(current, item.svgUrl, response.initialOperation, { background: prepareBackground, groups: prepareGroups }));
          }
          setView({ ...response, scope, signature: JSON.stringify(next) });
        }
      } catch (e) { if (active && !controller.signal.aborted) setError(e.message); }
    }, 100);
    return () => { active = false; clearTimeout(timer); controller.abort(); };
  }, [scope, signature, needsView, open, retry]);
  const currentView = view?.scope === scope ? view : null;
  const pending = needsView && item?.svgUrl && currentView?.signature !== signature;
  const [preview, setPreview] = React.useState(null);
  React.useEffect(() => {
    if (!currentView?.svg) { setPreview(null); return; }
    const url = URL.createObjectURL(new Blob([currentView.svg], { type: "image/svg+xml" }));
    setPreview({ scope, url });
    return () => URL.revokeObjectURL(url);
  }, [scope, currentView?.svg]);
  const replace = next => {
    const sourceSvgUrl = item.svgUrl;
    update(current => ({ vectorLayerDrafts: [...(current.vectorLayerDrafts || []).filter(draft => draft.svgUrl !== sourceSvgUrl),
      ...(next.length ? [{ svgUrl: sourceSvgUrl, operations: next }] : [])] }));
  };
  const commitHistory = next => {
    history.current = next; setRedo(next.redo); replace(next.operations);
  };
  const stepHistory = action => {
    if (saveToken.current) return;
    const next = stepVectorLayerHistory(history.current, action);
    if (next !== history.current) { setError(""); commitHistory(next); }
  };
  const edit = operation => {
    if (saving || pending) return;
    if (operations.length >= 500) { setError("Save a version before making more layer edits."); return; }
    // Respond to switches immediately while the safe preview is rebuilt locally.
    setView(current => {
      if (current?.scope !== scope) return current;
      const backgroundKeys = operation.type === "background" ? operation.keys : current.backgroundKeys;
      const visibilityKeys = operation.type === "visibility" ? operation.keys : operation.type === "backgroundVisibility" ? backgroundKeys : [];
      const layers = current.layers.map(layer => ({ ...layer, background: backgroundKeys.includes(layer.key),
        ...(visibilityKeys.includes(layer.key) ? { hidden: !operation.visible } : {}),
        ...(operation.type === "rename" && layer.key === operation.key ? { name: operation.name } : {}) }));
      return { ...current, layers, backgroundKeys, backgroundVisible: backgroundKeys.some(key => !layers.find(layer => layer.key === key)?.hidden) };
    });
    commitHistory({ operations: [...history.current.operations, operation], redo: [] });
  };
  async function save(isolate = []) {
    if (saveToken.current || pending || !currentView || error) return;
    const token = { controller: new AbortController(), rootScope };
    saveToken.current = token; setSaving(true); setError("");
    const selectedNames = currentView.layers.filter(layer => isolate.includes(layer.key)).map(layer => layer.name);
    const body = { editorVersion: vectorEditorVersion, requestId: crypto.randomUUID(), svgUrl: item.svgUrl, sourceHash: currentView.sourceHash, operations, groupsPrepared: item.vectorGroupsPrepared === true,
      backgroundKeys: item.vectorBackgroundKeys || [], lockedKeys: item.vectorLockedKeys || [], isolate,
      label: isolate.length ? selectedNames.join(" + ").slice(0, 120) : `${item.label || "Vector"} - Edited`.slice(0, 120),
      nodeId: node.id, nodeTitle: data.title || "Vector", ...workflowContextPayload(workflowContext) };
    try {
      const response = await api.saveLayers(body, { signal: token.controller.signal });
      if (saveToken.current !== token || latest.current.rootScope !== rootScope) return;
      latest.current.update(current => appendVectorLayerResult(current, response.item, { sourceSvgUrl: item.svgUrl, operations, selectionOnly: isolate.length > 0 }));
      if (response.warning) setError(response.warning);
      return response;
    } catch (e) { if (saveToken.current === token && latest.current.rootScope === rootScope) setError(e.message); }
    finally { if (saveToken.current === token) { saveToken.current = null; setSaving(false); } }
  }
  return { scope, operations, replaceOperations: next => { commitHistory({ operations: next, redo: [] }); setError(""); }, doc: currentView, previewUrl: preview?.scope === scope ? preview.url : "", dirty: operations.length > 0, pending, error, saving, edit, save,
    undo: () => stepHistory("undo"), redo: () => stepHistory("redo"),
    reset: () => { commitHistory({ operations: [], redo: [] }); setError(""); }, canUndo: operations.length > 0, canRedo: redo.length > 0,
    retry: () => setRetry(value => value + 1) };
}
