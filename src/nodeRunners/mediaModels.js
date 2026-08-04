import { nodeApi } from "../api/newtApi.js";
import { characterSheetGenerationSettings } from "../characterSheetModels.js";
import { workflowContextPayload } from "../workflowContext.js";

export async function runImageModelGeneration({ node, prompt, aspectRatio, imagePromptItems, workflowContext, index }) {
  const { response, data } = await nodeApi.generateImage({
    prompt,
    model: node.data.model,
    aspectRatio: aspectRatio || node.data.aspectRatio,
    requestedAspectRatio: node.data.aspectRatio,
    resolution: node.data.resolution,
    quality: node.data.quality,
    kreaCreativity: node.data.kreaCreativity,
    seedreamLayers: Boolean(node.data.seedreamLayers),
    imagePromptUrls: imagePromptItems.map((item) => item.url),
    imagePromptLabels: imagePromptItems.map((item) => item.label),
    ...workflowContextPayload(workflowContext),
    nodeId: node.id,
    nodeTitle: node.data.title
  });
  if (!response.ok) throw new Error(`Run ${index + 1}: ${data.error || "Image generation failed."}`);

  const images = Array.isArray(data.images) && data.images.length ? data.images : [data.image].filter(Boolean);
  return images.map((image, imageIndex) => ({
    url: image.localUrl,
    thumbnailUrl: image.thumbnailUrl || "",
    type: "image",
    label: image.label || (data.layerSeparation ? `Layer ${imageIndex + 1}` : `Image ${index + 1}`),
    text: data.text || "",
    cost: imageIndex === 0 ? data.cost : null,
    layerIndex: image.layerIndex || null
  }));
}

export async function runCoverageGeneration({
  node,
  sourceImageUrl,
  shot,
  aspectRatio,
  workflowContext,
  index
}) {
  const { response, data } = await nodeApi.generateImage({
    prompt: shot.prompt,
    model: node.data.model,
    aspectRatio,
    requestedAspectRatio: aspectRatio,
    resolution: node.data.resolution,
    quality: node.data.quality,
    seedreamLayers: false,
    imagePromptUrls: [sourceImageUrl],
    imagePromptLabels: ["Coverage base image"],
    ...workflowContextPayload(workflowContext),
    nodeId: node.id,
    nodeTitle: `${node.data.title || "Coverage"} ${String(index + 1).padStart(2, "0")}`,
    outputFileNameBase: coverageOutputFileNameBase(node.data.title, index, shot.label)
  });
  if (!response.ok) throw new Error(`Run ${index + 1}: ${data.error || "Coverage generation failed."}`);

  const image = Array.isArray(data.images) && data.images.length ? data.images[0] : data.image;
  if (!image?.localUrl) throw new Error(`Run ${index + 1}: Coverage generation returned no image.`);

  return {
    url: image.localUrl,
    thumbnailUrl: image.thumbnailUrl || "",
    type: "image",
    label: `${String(index + 1).padStart(2, "0")} ${shot.label}`,
    text: data.text || "",
    cost: data.cost,
    sourceUrl: image.localUrl,
    shotId: shot.id
  };
}

export async function runAutoAspectGeneration({
  node,
  sourceImageUrl,
  aspectRatio,
  workflowContext,
  index
}) {
  const prompt = [
    `Transform the provided image into a ${aspectRatio} aspect ratio.`,
    node.data.removeTextGraphics
      ? "Remove all readable text, title lettering, logos, award laurels, credits, subtitles, CTAs, legal copy, product labels, graphic marks, and typography. Fill removed areas naturally as if those graphics were never present."
      : "Preserve the original visual identity, subject matter, typography, readable text, logo placement, graphic hierarchy, color palette, lighting, and overall style.",
    "Extend, crop, reframe, and reposition elements only as needed so the result feels intentionally designed for the new frame.",
    node.data.removeTextGraphics
      ? "Do not invent unrelated subjects, replace the design, or add new text, logos, or graphic marks."
      : "Do not invent unrelated subjects, replace the design, or remove important text or brand elements."
  ].join(" ");
  const outputLabel = `${aspectRatio}${node.data.removeTextGraphics ? " Clean" : ""} Auto Aspect`;
  const outputFileNameBase = autoAspectOutputFileNameBase(node.data.title, aspectRatio);

  const { response, data } = await nodeApi.generateImage({
    prompt,
    model: node.data.model || "OpenAI Image 2",
    aspectRatio,
    requestedAspectRatio: aspectRatio,
    resolution: node.data.resolution || "2K",
    imagePromptUrls: [sourceImageUrl],
    imagePromptLabels: ["Original image to reformat"],
    ...workflowContextPayload(workflowContext),
    nodeId: node.id,
    nodeTitle: `${node.data.title || "Auto Aspect"} ${aspectRatio}`,
    outputFileNameBase
  });
  if (!response.ok) throw new Error(`Run ${index + 1}: ${data.error || "Auto Aspect generation failed."}`);

  return {
    url: data.image.localUrl,
    thumbnailUrl: data.image.thumbnailUrl || "",
    type: "image",
    label: outputLabel,
    text: data.text || "",
    cost: data.cost,
    aspectRatio,
    key: aspectRatio
  };
}

function autoAspectOutputFileNameBase(title, aspectRatio) {
  const safeTitle = String(title || "auto_aspect")
    .trim()
    .replace(/\.[A-Za-z0-9]{1,8}$/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 72) || "auto_aspect";
  const safeRatio = String(aspectRatio || "")
    .trim()
    .replace(/:/g, "x")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safeRatio ? `${safeTitle}_${safeRatio}` : safeTitle;
}

function coverageOutputFileNameBase(title, index, label) {
  const safeTitle = String(title || "coverage")
    .trim()
    .replace(/\.[A-Za-z0-9]{1,8}$/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 56) || "coverage";
  const safeLabel = String(label || `angle_${index + 1}`)
    .trim()
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48) || `angle_${index + 1}`;
  return `${safeTitle}_${String(index + 1).padStart(2, "0")}_${safeLabel}`;
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

export async function runCharacterSheetGeneration({ node, prompt, portrait, wardrobe, workflowContext, characterTag, sheetKind = "image" }) {
  const isVideoSheet = sheetKind === "video";
  const generationSettings = characterSheetGenerationSettings(node.data.characterSheetModel);
  const references = [
    { url: portrait.localUrl, label: "The Character portrait reference" },
    ...(wardrobe?.localUrl ? [{ url: wardrobe.localUrl, label: "Selected wardrobe sheet" }] : [])
  ];
  const { response, data } = await nodeApi.generateImage({
    prompt,
    ...generationSettings,
    aspectRatio: "16:9",
    imagePromptUrls: references.map((item) => item.url),
    imagePromptLabels: references.map((item) => item.label),
    ...workflowContextPayload(workflowContext),
    nodeId: node.id,
    nodeTitle: `${node.data.title || "Character"}${isVideoSheet ? " CU Video" : ""} Character Sheet`
  }, "Character sheet generation");
  if (!response.ok) throw new Error(data.error || "Character sheet generation failed.");

  return {
    url: data.image.localUrl,
    thumbnailUrl: data.image.thumbnailUrl || "",
    type: "image",
    label: `@${characterTag}${isVideoSheet ? " CU Video" : ""} Character Sheet`,
    fileName: data.image.fileName,
    text: data.text || "",
    cost: data.cost
  };
}
