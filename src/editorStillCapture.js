import { appendResultItems } from "./mediaResults.js";
import { fileNameFromLocalUrl } from "./mediaAssets.js";
import { estimatedNodeRect, nonOverlappingPosition } from "./nodeGeometry.js";
import { createNodeId } from "./workflowState.js";

export function completeEditorStillCapture(nodes, editorId, jobId, result, options = {}) {
  const editor = nodes.find(node => node.id === editorId && node.type === "editor");
  const job = editor?.data.editorExportJob;
  if (!jobId || job?.id !== jobId || job.frame == null || !result?.url) return null;

  const still = { ...result, type: "image", mimeType: "image/png", fileName: result.fileName || fileNameFromLocalUrl(result.url) };
  const previous = editor.data.editorStills || [];
  const alreadySaved = previous.some(item => item.url === still.url);
  const completedNodes = nodes.map(node => node === editor ? { ...node, data: { ...node.data,
    editorExportJob: null, status: "complete", error: "", editorStills: alreadySaved ? previous : appendResultItems(previous, [still], "image")
  } } : node);
  // A recovered completion may already be saved. Never recreate a removed still node.
  if (alreadySaved) return { completedNodes, nodes: completedNodes, imageNode: null, still };

  const rect = options.editorRect || estimatedNodeRect(editor);
  const occupied = options.occupied || nodes.filter(node => node.canvasId === editor.canvasId).map(node => estimatedNodeRect(node));
  const position = nonOverlappingPosition({ width: 380, height: 400 }, { x: rect.right + 80, y: editor.y }, occupied);
  const imageNode = { id: createNodeId("image"), type: "image", canvasId: editor.canvasId, ...position, data: {
    ...options.imageData, title: `${editor.data.title || "Editor"} - ${still.label || "Still"}`,
    fileName: still.fileName, storedFileName: "", mimeType: still.mimeType, mediaType: "image", resultType: "image",
    resultUrl: still.url, thumbnailUrl: still.thumbnailUrl || "", resultItems: [still], selectedResultIndex: 0,
    status: "complete", error: ""
  } };
  return { completedNodes, nodes: [...completedNodes, imageNode], imageNode, still };
}
