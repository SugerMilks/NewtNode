import React from "react";
import { imageLayersApi } from "../api/newtApi.js";
import { normalizeLayersData, layersOutputPatch, validateLayersRequest } from "../imageLayers.js";
import { workflowContextPayload } from "../workflowContext.js";
import { originalLayerSeparation, retainLayerSeparation } from "../imageEditLayers.js";

export function useImageLayers({ node, workflowContext, onUpdate, preserveSelection = false, api = imageLayersApi, beforeSubmit }) {
  const data = normalizeLayersData(node.data), current = React.useRef(data), updater = React.useRef(onUpdate);
  current.current = data; updater.current = onUpdate;
  const preserveRef = React.useRef(preserveSelection); preserveRef.current = preserveSelection;
  const scope = JSON.stringify([node.id, workflowContext?.projectId, workflowContext?.workflowPackageId, workflowContext?.workflowPackagePath]);
  const scopeRef = React.useRef(scope); scopeRef.current = scope;
  const token = React.useRef(null), timer = React.useRef(null), saveToken = React.useRef(null);
  const [working, setWorking] = React.useState(false), [saving, setSaving] = React.useState(false);
  const update = patch => { current.current = { ...current.current, ...patch }; updater.current(node.id, patch); };
  const context = () => ({ ...workflowContextPayload(workflowContext), nodeId: node.id, nodeTitle: node.data.title || "Layers" });
  React.useEffect(() => {
    if (current.current.layersJob) update({ layersJob: { ...current.current.layersJob, status: "uncertain" } });
    setWorking(false); setSaving(false);
    return () => { clearTimeout(timer.current); token.current = null; saveToken.current = null; };
  }, [scope]);
  const valid = operation => token.current === operation && scopeRef.current === operation.scope;
  function accept(response, operation) {
    if (!valid(operation)) return;
    if (response.status === "completed" && response.document) {
      const previous = current.current, documents = previous.layersDocuments.filter(doc => doc.id !== response.document.id);
      documents.push(retainLayerSeparation(response.document, response.document));
      const follow = !preserveRef.current && previous.layersDocumentId === operation.documentId;
      update({ ...layersOutputPatch(documents, follow ? response.document.id : previous.layersDocumentId, follow ? 0 : previous.selectedResultIndex), layersJob: null, status: "complete", error: response.warning || "" });
      token.current = null; setWorking(false);
    } else if (["preparing", "submitting", "running", "saving"].includes(response.status)) {
      update({ layersJob: { ...current.current.layersJob, status: response.status }, status: "running" });
      timer.current = setTimeout(() => poll(operation), 1800);
    } else {
      update({ layersJob: { ...current.current.layersJob, status: "uncertain", error: response.error }, status: "error" });
      token.current = null; setWorking(false);
    }
  }
  const failed = (error, operation) => {
    if (!valid(operation)) return;
    update(error.noSubmission ? { layersJob: null, error: error.message, status: "error" } : { layersJob: { ...current.current.layersJob, status: "uncertain", error: error.message }, status: "error" });
    token.current = null; setWorking(false);
  };
  async function poll(operation) {
    try { accept(await api.job(operation.id), operation); } catch (error) { failed(error, operation); }
  }
  async function start(source) {
    if (token.current || current.current.layersJob) return;
    let request;
    try { request = validateLayersRequest({ sourceUrl: source?.url, prompt: current.current.layersPrompt, limit: current.current.layersLimit, resolution: current.current.layersResolution }); }
    catch (error) { update({ error: error.message }); return; }
    const operation = { id: crypto.randomUUID(), scope, documentId: current.current.layersDocumentId };
    const pending = { layersJob: { requestId: operation.id, status: "submitting" }, status: "running", error: "" };
    try { beforeSubmit?.(pending); } catch { update({ error: "Could not store the recovery details. Free some browser storage before separating this image. No generation was submitted." }); return; }
    token.current = operation; update(pending); setWorking(true);
    try { accept(await api.start({ ...request, ...context(), requestId: operation.id }), operation); } catch (error) { failed(error, operation); }
  }
  function check() {
    if (token.current || !current.current.layersJob) return;
    const operation = { id: current.current.layersJob.requestId, scope, documentId: current.current.layersDocumentId }; token.current = operation;
    setWorking(true); poll(operation);
  }
  function stop() {
    token.current = null; clearTimeout(timer.current); setWorking(false);
    update({ layersJob: { ...current.current.layersJob, status: "uncertain", error: "Stopped waiting. Atlas may still finish and charge this separation. Check the existing request to recover it." }, status: "error" });
  }
  async function save(document) {
    if (saveToken.current) return false;
    const operation = { scope }; saveToken.current = operation;
    const validSave = () => saveToken.current === operation && scopeRef.current === operation.scope;
    setSaving(true);
    try {
      const response = await api.save({ document, ...context() });
      if (!validSave()) return false;
      const saved = retainLayerSeparation(response.document, originalLayerSeparation(document, current.current.layersDocuments));
      update({ ...layersOutputPatch([...current.current.layersDocuments, saved], saved.id), error: "" });
      return saved;
    } catch (error) { if (validSave()) update({ error: error.message }); return false; }
    finally { if (validSave()) { saveToken.current = null; setSaving(false); } }
  }
  return { data, update, working, saving, start, check, stop, save,
    release: () => { if (!working) update({ layersJob: null, status: current.current.resultUrl ? "complete" : "ready", error: "" }); } };
}
