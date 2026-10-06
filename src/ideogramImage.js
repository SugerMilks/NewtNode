import { ideogramImageEditEndpoint, buildIdeogramImageEditFalRequest } from "./ideogramImageEdit.js";

// Generation and edit contracts verified 2026-10-04 on Fal.
export const ideogramImageModelName = "Ideogram 4.5";
export const ideogramImageEndpoint = "ideogram/v4.5";
export const ideogramImageQualityOptions = ["low", "medium", "high"];
export const ideogramImageResolutionOptions = ["2K", "1K"];
export const ideogramImageAspectRatios = ["16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "2:1", "1:2"];
export const isIdeogramImageModel = model => model === ideogramImageModelName;

export function normalizeIdeogramImageQuality(value) {
  const quality = String(value ?? "").trim().toLowerCase();
  if (quality === "very_low") return "low";
  if (quality === "xhigh" || quality === "max") return "high";
  return ideogramImageQualityOptions.includes(quality) ? quality : "high";
}

// Exact provider presets, not arbitrary area-based or rounded aspect-ratio sizes.
const nativeSizes = {
  "1K": {
    "16:9": [1280, 720], "9:16": [720, 1280], "1:1": [1024, 1024],
    "4:3": [1152, 864], "3:4": [864, 1152], "3:2": [1248, 832],
    "2:3": [832, 1248], "4:5": [896, 1120], "5:4": [1120, 896],
    "2:1": [1440, 720], "1:2": [720, 1440]
  },
  "2K": {
    "16:9": [2560, 1440], "9:16": [1440, 2560], "1:1": [2048, 2048],
    "4:3": [2304, 1728], "3:4": [1728, 2304], "3:2": [2496, 1664],
    "2:3": [1664, 2496], "4:5": [1792, 2240], "5:4": [2240, 1792],
    "2:1": [2880, 1440], "1:2": [1440, 2880]
  }
};

function fail(message) {
  throw Object.assign(new Error(`${ideogramImageModelName}: ${message}`), { status: 400 });
}

export function ideogramImageSize({ resolution = "2K", aspectRatio = "16:9" } = {}) {
  if (!ideogramImageResolutionOptions.includes(resolution)) fail("choose 1K or 2K resolution; 4K is not supported.");
  if (!ideogramImageAspectRatios.includes(aspectRatio)) fail("choose a supported aspect ratio; 21:9 is not supported.");
  const [width, height] = nativeSizes[resolution][aspectRatio];
  return { width, height };
}

export function ideogramImageReferenceOrder(imagePromptUrls = [], sourceUrl = "") {
  if (!Array.isArray(imagePromptUrls) || imagePromptUrls.some(url => typeof url !== "string" || !/^\/(uploads|outputs|workflow-assets|storyboard)\/.+/.test(url)))
    fail("connect images uploaded or generated in NewtNode.");
  if (imagePromptUrls.length > 5) fail("connect one source image and up to four guide references (five images total).");
  if (new Set(imagePromptUrls).size !== imagePromptUrls.length) fail("the same image is connected more than once. Remove the duplicate reference.");
  if (typeof sourceUrl !== "string") fail("choose a valid source image.");
  const indexes = imagePromptUrls.map((_, index) => index);
  if (!imagePromptUrls.length || !sourceUrl) return indexes;
  const sourceIndex = imagePromptUrls.indexOf(sourceUrl);
  if (sourceIndex < 0) fail("the selected source image is no longer connected. Choose a source image again.");
  return [sourceIndex, ...indexes.filter(index => index !== sourceIndex)];
}

export function ideogramImagePrompt({ prompt, imagePromptUrls = [], imagePromptLabels = [], ideogramSourceUrl = "" }) {
  const order = ideogramImageReferenceOrder(imagePromptUrls, ideogramSourceUrl);
  if (!order.length) return prompt;
  const roles = order.map((index, position) => {
    const label = String(imagePromptLabels?.[index] || `Connected image ${index + 1}`).replace(/[\r\n]+/g, " ").slice(0, 120);
    return `${position === 0 ? "Source image (image 1)" : `Guide reference ${position} (image ${position + 1})`}: ${label}`;
  });
  return `${prompt}\n\nConnected image roles:\n${roles.join("\n")}\nEdit the source image according to the prompt. Additional images are guides, not separate outputs.`;
}

export function validateIdeogramImageRequest({ prompt, resolution, aspectRatio, quality = "high", enablePromptExpansion = true,
  imagePromptUrls = [], imagePromptLabels = [], ideogramSourceUrl = "", editMaskDataUrl = "", background = "auto", seed } = {}) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 10000) fail("use a prompt between 1 and 10,000 characters.");
  ideogramImageReferenceOrder(imagePromptUrls, ideogramSourceUrl);
  if (!Array.isArray(imagePromptLabels) || imagePromptLabels.some(label => typeof label !== "string")) fail("reference labels must be text.");
  if (ideogramImagePrompt({ prompt, imagePromptUrls, imagePromptLabels, ideogramSourceUrl }).length > 10000)
    fail("shorten the prompt; editing instructions and reference labels must fit within 10,000 characters.");
  if (editMaskDataUrl !== "") fail("edit masks are not supported by this generation model. Use Image Edit for a masked edit.");
  if (!["auto", "opaque"].includes(background)) fail("transparent output is not supported by this integration.");
  if (!ideogramImageQualityOptions.includes(quality)) fail("choose Low, Medium or High generation quality.");
  if (typeof enablePromptExpansion !== "boolean") fail("prompt expansion must be on or off.");
  // App limit follows the direct Ideogram API; Fal itself declares no integer bounds and accepts null.
  if (seed != null && (!Number.isInteger(seed) || seed < 0 || seed > 2147483647)) fail("seed must be an integer from 0 to 2,147,483,647.");
  return imagePromptUrls.length ? "auto" : ideogramImageSize({ resolution, aspectRatio });
}

export function buildIdeogramImageFalInput(options = {}) {
  const image_size = validateIdeogramImageRequest(options);
  if (options.imagePromptUrls?.length) fail("reference images require the edit endpoint.");
  return { prompt: options.prompt, image_size, quality: options.quality ?? "high",
    enable_prompt_expansion: options.enablePromptExpansion ?? true, num_images: 1, sync_mode: false,
    ...(options.seed != null ? { seed: options.seed } : {}) };
}

export function buildIdeogramImageFalRequest(options = {}, uploadedUrls = []) {
  validateIdeogramImageRequest(options);
  if (!options.imagePromptUrls?.length) return { endpoint: ideogramImageEndpoint, input: buildIdeogramImageFalInput(options) };
  if (uploadedUrls.length !== options.imagePromptUrls.length) fail("one or more connected images could not be uploaded.");
  const request = buildIdeogramImageEditFalRequest({ prompt: ideogramImagePrompt(options), quality: options.quality,
    editPrecision: "regular", imageUrls: uploadedUrls });
  if (options.seed != null) request.input.seed = options.seed;
  return request;
}

export function ideogramImageCost({ provider = "fal", resolution = "2K", aspectRatio = "16:9", quality = "high", size, referenceCount = 0 } = {}) {
  return { amountUsd: null, currency: "USD", unit: "image", units: 1, mediaType: "image", estimated: true,
    model: ideogramImageModelName, provider, endpoint: referenceCount ? ideogramImageEditEndpoint : ideogramImageEndpoint,
    resolution: referenceCount ? "auto" : resolution, aspectRatio: referenceCount ? "auto" : aspectRatio, quality,
    ...(size === undefined ? {} : { size }), pricingStatus: "unavailable",
    pricingBasis: "Variable cost; an Ideogram 4.5 generation estimate has not been verified." };
}
