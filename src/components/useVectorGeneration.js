import React from "react";
import { ideogramVectorApi } from "../api/newtApi.js";
import { appendVectorResult, buildVectorBatchRequests, normalizeVectorData } from "../ideogramVector.js";
import { workflowContextPayload } from "../workflowContext.js";

function remainingNotice(job) {
  const remaining = Math.max(0, (Number(job?.batchCount) || 1) - (Number(job?.batchIndex) || 1));
  return remaining ? `${remaining} remaining generation${remaining === 1 ? " was" : "s were"} not started.` : "";
}

export function useVectorGeneration({ node, onUpdate, workflowContext, api = ideogramVectorApi }) {
  const data = normalizeVectorData(node.data);
  const dataRef = React.useRef(data), updateRef = React.useRef(onUpdate), operation = React.useRef(null), epoch = React.useRef(0);
  dataRef.current = data; updateRef.current = onUpdate;
  const [working, setWorking] = React.useState(false);
  const scope = JSON.stringify([node.id, workflowContext?.projectId, workflowContext?.workflowPackageId, workflowContext?.workflowPackagePath]);
  const scopeRef = React.useRef(scope); scopeRef.current = scope;
  const update = patch => {
    if (typeof patch === "function") patch = patch(dataRef.current);
    if (!patch) return;
    dataRef.current = { ...dataRef.current, ...patch };
    updateRef.current(node.id, patch);
  };
  React.useEffect(() => {
    epoch.current += 1;
    setWorking(false);
    if (dataRef.current.vectorJob && ["submitting", "running"].includes(dataRef.current.vectorJob.status)) {
      update({ vectorJob: { ...dataRef.current.vectorJob, status: "uncertain", error: ["Check the existing request before generating again.", remainingNotice(dataRef.current.vectorJob)].filter(Boolean).join(" ") }, status: "error" });
    }
    return () => { epoch.current += 1; operation.current?.controller?.abort(); operation.current = null; };
  }, [scope]);

  const accepts = token => operation.current === token && token.epoch === epoch.current && token.scope === scopeRef.current;
  const finish = (response, token) => {
    if (!accepts(token)) return false;
    const job = dataRef.current.vectorJob;
    if (job?.requestId !== token.requestId) return false;
    if (response.status === "completed" && response.item) {
      const selectNew = token.followSelection !== false && dataRef.current.resultUrl === job.selectedUrl;
      const result = appendVectorResult(dataRef.current, response.item, { selectNew });
      token.followSelection = selectNew;
      token.selectedUrl = result.resultUrl;
      update({ ...result, vectorWarning: [dataRef.current.vectorWarning, response.warning, token.recovering && remainingNotice(job)].filter(Boolean).join(" ") });
      return true;
    } else {
      const status = ["failed", "uncertain"].includes(response.status) ? response.status : "running";
      update({ vectorJob: { ...job, status, error: [response.error || response.warning, remainingNotice(job)].filter(Boolean).join(" ") }, status: status === "running" ? "running" : "error" });
      return false;
    }
  };
  const settle = token => { if (accepts(token)) { operation.current = null; setWorking(false); } };

  async function start({ prompt, images, moodBoards }) {
    if (operation.current || dataRef.current.vectorJob) return;
    let requests;
    try { requests = buildVectorBatchRequests(dataRef.current, { prompt, images, moodBoards }); }
    catch (error) { update({ error: error.message }); return; }
    const context = { nodeId: node.id, nodeTitle: node.data.title || "Vector", ...workflowContextPayload(workflowContext) };
    const token = { epoch: epoch.current, scope, controller: new AbortController(), selectedUrl: dataRef.current.resultUrl, followSelection: true };
    operation.current = token; setWorking(true);
    update({ error: "", vectorWarning: "" });
    try {
      // Each saved result completes before another paid request starts. Never replay this queue on recovery.
      for (const [index, request] of requests.entries()) {
        if (!accepts(token)) break;
        const requestId = crypto.randomUUID(); token.requestId = requestId;
        update({ vectorJob: { requestId, status: "submitting", mode: request.mode, selectedUrl: token.followSelection ? token.selectedUrl : null,
          batchIndex: index + 1, batchCount: requests.length, createdAt: new Date().toISOString() }, status: "running" });
        const response = await api.generate({ ...request, requestId, ...context }, { signal: token.controller.signal });
        if (!finish(response, token)) break;
      }
    } catch (error) {
      if (!accepts(token)) return;
      const message = [error.message || "The response was interrupted. Check this request or History before generating again.", remainingNotice(dataRef.current.vectorJob)].filter(Boolean).join(" ");
      if (error.noSubmission === true) update({ vectorJob: null, status: "error", error: message });
      else update({ vectorJob: { ...dataRef.current.vectorJob, status: "uncertain", error: message }, status: "error" });
    } finally { settle(token); }
  }

  async function check() {
    const job = dataRef.current.vectorJob;
    if (!job || operation.current) return;
    const token = { requestId: job.requestId, epoch: epoch.current, scope, recovering: true };
    operation.current = token; setWorking(true);
    try { finish(await api.job(job.requestId), token); }
    catch (error) {
      if (accepts(token)) update({ vectorJob: { ...dataRef.current.vectorJob, status: "uncertain", error: error.message || "Could not check the existing request. Check History or Fal before generating again." }, status: "error" });
    } finally { settle(token); }
  }

  function stopWaiting() {
    const token = operation.current;
    if (!token) return;
    operation.current = null; token.controller?.abort(); setWorking(false);
    update({ vectorJob: { ...dataRef.current.vectorJob, status: "uncertain", error: ["Stopped waiting. Generation may still finish and be billed. Check this request or History before generating again.", remainingNotice(dataRef.current.vectorJob)].filter(Boolean).join(" ") }, status: "error" });
  }

  function release() {
    if (operation.current) return;
    update({ vectorJob: null, status: dataRef.current.resultItems.length ? "complete" : "idle", error: "", vectorWarning: "Previous request released from this node. Any provider work may still complete in History." });
  }
  return { data, update, working, start, check, stopWaiting, release };
}
