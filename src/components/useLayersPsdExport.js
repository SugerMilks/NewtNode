import React from "react";
import { imageLayersApi } from "../api/newtApi.js";
import { chooseLayersPsdPath } from "../imageLayersPsd.js";
import { workflowContextPayload } from "../workflowContext.js";

export function useLayersPsdExport({ node, workflowContext, onUpdate, api = imageLayersApi, choosePath = chooseLayersPsdPath }) {
  const scope = JSON.stringify([node.id, workflowContext?.projectId, workflowContext?.workflowPackageId, workflowContext?.workflowPackagePath]);
  const current = React.useRef({ node, workflowContext, scope, onUpdate }); current.current = { node, workflowContext, scope, onUpdate };
  const token = React.useRef(null), timer = React.useRef(null);
  const [busy, setBusy] = React.useState(false), [error, setError] = React.useState("");
  const patch = data => current.current.onUpdate(current.current.node.id, data);
  React.useEffect(() => {
    if (current.current.node.data.layersPsdJob) patch({ layersPsdJob: { ...current.current.node.data.layersPsdJob, status: "uncertain" } });
    setBusy(false); setError("");
    return () => { token.current = null; clearTimeout(timer.current); };
  }, [scope]);
  const valid = operation => token.current === operation && current.current.scope === operation.scope;
  function accept(response, operation) {
    if (!valid(operation)) return;
    if (response.status === "running") {
      patch({ layersPsdJob: { requestId: operation.id, status: "running" } });
      timer.current = setTimeout(() => poll(operation), 700);
    } else {
      if (response.status === "completed" && response.result) patch({ layersPsdJob: null, layersPsdExport: response.result });
      else patch({ layersPsdJob: null });
      setError(response.warning || response.error || ""); token.current = null; setBusy(false);
    }
  }
  function failed(error, operation, submitted = true) {
    if (!valid(operation)) return;
    patch({ layersPsdJob: submitted && !error.noSubmission ? { requestId: operation.id, status: "uncertain" } : null });
    setError(error.message); token.current = null; setBusy(false);
  }
  async function poll(operation) {
    try { accept(await api.psdJob(operation.id), operation); } catch (error) { failed(error, operation); }
  }
  async function start(document) {
    if (token.current || current.current.node.data.layersPsdJob || !document) return;
    const snapshot = structuredClone(document), context = { ...workflowContextPayload(workflowContext), nodeId: node.id, nodeTitle: node.data.title || "Layers" };
    const operation = { id: crypto.randomUUID(), scope }; token.current = operation; setBusy(true); setError("");
    let submitted = false;
    try {
      const filePath = await choosePath({ title: node.data.title || "Layers", workflowContext });
      if (!valid(operation)) return;
      if (!filePath) { token.current = null; setBusy(false); return; }
      patch({ layersPsdJob: { requestId: operation.id, status: "running" } }); submitted = true;
      accept(await api.exportPsd({ ...context, requestId: operation.id, document: snapshot, exportFilePath: filePath }), operation);
    } catch (error) { failed(error, operation, submitted); }
  }
  function check() {
    const job = current.current.node.data.layersPsdJob;
    if (token.current || !job) return;
    const operation = { id: job.requestId, scope }; token.current = operation; setBusy(true); setError(""); poll(operation);
  }
  function release() {
    if (!token.current) { patch({ layersPsdJob: null }); setError(""); }
  }
  return { busy, error, start, check, release };
}
