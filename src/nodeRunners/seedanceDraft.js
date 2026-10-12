import { nodeApi } from "../api/newtApi.js";
import { workflowContextPayload } from "../workflowContext.js";
import { normalizeVideoGenerationResult } from "./videoModels.js";
import { selectedSeedanceDraft, finishedSeedanceDraftState } from "../seedanceDraft.js";

export async function finishSeedanceDraft({ node, workflowContext, getCurrent, update, complete = nodeApi.completeSeedanceDraft }) {
  const draft = selectedSeedanceDraft(node.data);
  if (!draft || node.data.status === "running") return { status: "skipped" };
  const receiptId = draft.seedanceDraft.receiptId;
  const finished = node.data.resultItems.find(item => item.seedanceDraftSource === receiptId);
  if (finished) {
    update(finishedSeedanceDraftState(node.data, receiptId, finished));
    return { status: "complete" };
  }
  const operation = crypto.randomUUID();
  update({ status: "running", seedanceFinishing: operation, error: "" });
  const current = () => {
    const next = getCurrent();
    return next?.data.seedanceFinishing === operation && next.data.status === "running"
      && next.data.resultItems?.some(item => item.seedanceDraft?.receiptId === receiptId) ? next : null;
  };
  try {
    const result = await complete({ receiptId, ...workflowContextPayload(workflowContext), nodeId: node.id, nodeTitle: node.data.title });
    if (current()) update({ ...finishedSeedanceDraftState(current().data, receiptId, normalizeVideoGenerationResult(result, 0)),
      status: "complete", seedanceFinishing: "", error: "" });
    return { status: "complete" };
  } catch (error) {
    if (current()) update({ status: "error", seedanceFinishing: "", error: error.message });
    return { status: "error", error };
  }
}
