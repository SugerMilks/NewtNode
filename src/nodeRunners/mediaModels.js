import { nodeApi } from "../api/newtApi.js";
import { workflowContextPayload } from "../workflowContext.js";

export async function runImageModelGeneration({ node, prompt, aspectRatio, imagePromptItems, workflowContext, index }) {
  const { response, data } = await nodeApi.generateImage({
    prompt,
    model: node.data.model,
    aspectRatio: aspectRatio || node.data.aspectRatio,
    requestedAspectRatio: node.data.aspectRatio,
    resolution: node.data.resolution,
    imagePromptUrls: imagePromptItems.map((item) => item.url),
    imagePromptLabels: imagePromptItems.map((item) => item.label),
    ...workflowContextPayload(workflowContext),
    nodeId: node.id,
    nodeTitle: node.data.title
  });
  if (!response.ok) throw new Error(`Run ${index + 1}: ${data.error || "Image generation failed."}`);

  return {
    url: data.image.localUrl,
    type: "image",
    label: `Image ${index + 1}`,
    text: data.text || "",
    cost: data.cost
  };
}

export async function run3DModelGeneration({ node, imageViewUrls, workflowContext, model, generateType, faceCount }) {
  if (!imageViewUrls.front) throw new Error("Connect a front image to the 3D node.");

  const { response, data } = await nodeApi.generate3d({
    model,
    imageViewUrls,
    generateType,
    enablePbr: Boolean(node.data.enablePbr),
    faceCount,
    ...workflowContextPayload(workflowContext),
    nodeId: node.id,
    nodeTitle: node.data.title
  });
  if (!response.ok) throw new Error(data.error || "3D generation failed.");

  return {
    url: data.model.localUrl,
    type: "model3d",
    label: data.model.label || data.model.fileName || "3D model",
    text: data.text || "",
    thumbnailUrl: data.thumbnail?.localUrl || "",
    seed: data.seed,
    cost: data.cost
  };
}

export async function runCharacterSheetGeneration({ node, prompt, portrait, wardrobe, workflowContext, characterTag }) {
  const references = [
    { url: portrait.localUrl, label: "The Character portrait reference" },
    ...(wardrobe?.localUrl ? [{ url: wardrobe.localUrl, label: "Selected wardrobe sheet" }] : [])
  ];
  const { response, data } = await nodeApi.generateImage({
    prompt,
    model: "OpenAI Image 2",
    aspectRatio: "16:9",
    resolution: "4K",
    imagePromptUrls: references.map((item) => item.url),
    imagePromptLabels: references.map((item) => item.label),
    ...workflowContextPayload(workflowContext),
    nodeId: node.id,
    nodeTitle: `${node.data.title || "Character"} Character Sheet`
  }, "Character sheet generation");
  if (!response.ok) throw new Error(data.error || "Character sheet generation failed.");

  return {
    url: data.image.localUrl,
    type: "image",
    label: `@${characterTag} Character Sheet`,
    fileName: data.image.fileName,
    text: data.text || "",
    cost: data.cost
  };
}
