import { nodeApi } from "../api/newtApi.js";
import { workflowContextPayload } from "../workflowContext.js";
import { smartTextOriginalPrompt, normalizeSmartTextGenerationContext } from "../smartTextPrompt.js";

export async function runTextNodeProcessing({
  node,
  incoming,
  imageInputs = [],
  generationContext,
  workflowContext,
  sourceLabel
}) {
  if ((incoming.imageIn?.length || 0) > imageInputs.length) throw new Error("A connected image is not ready. Generate or upload it before running Smart Text.");
  const { response, data } = await nodeApi.processText({
    text: smartTextOriginalPrompt(node.data.text, imageInputs.length > 0),
    textInputs: connectedTextInputItems(incoming.textIn, sourceLabel),
    imageInputs,
    generationContext: normalizeSmartTextGenerationContext(generationContext),
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

function connectedTextInputItems(items = [], sourceLabel) {
  return items
    .map(({ source }) => ({
      label: sourceLabel(source),
      text: source.type === "plainText" ? source.data.text : source.type === "text" ? source.data.resultText || source.data.text : source.data.resultText || source.data.prompt
    }))
    .filter((item) => item.text);
}
