import { nodeApi } from "../api/newtApi.js";
import { workflowContextPayload } from "../workflowContext.js";
import { normalizeSmartTextRequest } from "../smartTextPrompt.js";

export async function runTextNodeProcessing({
  node,
  incoming = {},
  imageInputs = [],
  videoInputs = [],
  generationContext,
  workflowContext,
  action = "generate"
}) {
  if ((incoming.imageIn?.length || 0) > imageInputs.length) throw new Error("A connected image is not ready. Generate or upload it before running Smart Text.");
  if ((incoming.videoIn?.length || 0) > videoInputs.length) throw new Error("A connected video is not ready. Generate, upload or export it before running Smart Text.");
  const { response, data } = await nodeApi.processText({
    ...normalizeSmartTextRequest({ text: node.data.text, imageInputs, videoInputs, generationContext, action,
      currentPrompt: node.data.resultText, revisionNote: node.data.smartTextRevision }),
    ...workflowContextPayload(workflowContext),
    nodeId: node.id,
    nodeTitle: node.data.title
  });
  if (!response.ok) throw new Error(data.error || "Text processing failed.");
  if (typeof data.text !== "string" || !data.text.trim()) throw new Error("Smart Text returned no prompt. Your previous output has been kept.");

  return {
    text: data.text.trim(),
    model: data.model || ""
  };
}

export function smartTextCompletionPatch(submittedNode, liveNode, processed, action) {
  return {
    status: "complete", error: "", resultText: processed.text, lastRunModel: processed.model,
    ...(action === "revise" && liveNode?.data.smartTextRevision === submittedNode.data.smartTextRevision ? { smartTextRevision: "" } : {})
  };
}
