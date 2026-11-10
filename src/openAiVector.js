import { openAiImage26Models, openAiImage26Variant } from "./openAiImage26.js";

export const openAiVectorModels = Object.freeze(Object.values(openAiImage26Models));
export const openAiVectorQualities = Object.freeze(["low", "medium", "high", "xhigh", "max"]);
export const openAiVectorComplexities = Object.freeze(["low", "medium", "high"]);
export const openAiVectorBackgrounds = Object.freeze(["auto", "transparent", "opaque"]);
export const openAiVectorAspectRatios = Object.freeze(["auto", "1:1", "1:3", "1:2", "9:16", "10:16", "2:3", "3:4", "4:5", "5:4", "4:3", "3:2", "16:10", "16:9", "2:1", "3:1"]);
export const openAiVectorAuthoringModel = "gpt-6-astra";
export const openAiVectorReferenceNotice = "GPT Image 2.6 SVG is text-only. Use Ideogram for image, Mood Board, font or drawing references, or disconnect/disable those references.";
export const isOpenAiVectorModel = model => openAiVectorModels.includes(model);
const invalid = message => { throw Object.assign(new Error(message), { status: 400 }); };

export function validateOpenAiVectorRequest(body = {}) {
  if (!isOpenAiVectorModel(body.model)) invalid("Choose GPT Image 2.6 Sunburst or Flare for SVG generation.");
  if ((body.mode ?? "generate") !== "generate") invalid("GPT Image 2.6 SVG supports Text to vector only. Choose Ideogram to vectorize an image.");
  if (!Array.isArray(body.images ?? [])) invalid("Vector image references must be an array.");
  if (body.images?.length) invalid(openAiVectorReferenceNotice);
  if (body.seed !== "" && body.seed != null) invalid("GPT Image 2.6 SVG does not support a seed.");
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";
  if (!prompt || [...prompt].length > 32000) invalid("GPT Image 2.6 SVG needs a design brief of 1 to 32,000 characters, including design direction, lettering and palette.");
  const quality = body.quality ?? "medium", aspectRatio = body.aspectRatio ?? "1:1";
  const complexity = body.complexity ?? "high", background = body.background ?? "auto";
  if (!openAiVectorQualities.includes(quality)) invalid("Choose a supported GPT Image 2.6 vector quality.");
  if (!openAiVectorAspectRatios.includes(aspectRatio)) invalid("GPT Image 2.6 SVG supports aspect ratios from 1:3 to 3:1.");
  if (!openAiVectorComplexities.includes(complexity)) invalid("Choose Low, Medium or High complexity.");
  if (!openAiVectorBackgrounds.includes(background)) invalid("Choose Auto, Transparent or Opaque background.");
  if (body.svgModel != null && body.svgModel !== openAiVectorAuthoringModel) invalid("Unsupported SVG authoring model.");
  return { model: body.model, mode: "generate", prompt, images: [], quality, aspectRatio, complexity, background, svgModel: openAiVectorAuthoringModel };
}

export function openAiVectorEndpoint(model) {
  if (!isOpenAiVectorModel(model)) invalid("Choose a supported GPT Image 2.6 vector model.");
  return `openai/gpt-image-2.6/${openAiImage26Variant(model)}/text-to-image`;
}

export function openAiVectorProviderInput(body) {
  const request = validateOpenAiVectorRequest(body);
  const [w, h] = request.aspectRatio.split(":").map(Number);
  // Exact ratios on the 16px grid; about 2K reference raster, not an SVG resolution limit.
  const unit = Math.floor(2048 / (Math.max(w, h) * 16)) * 16;
  return { prompt: request.prompt, image_size: request.aspectRatio === "auto" ? "auto" : { width: w * unit, height: h * unit },
    quality: request.quality, reasoning_effort: request.complexity, background: request.background,
    output_format: "svg", svg_model: request.svgModel, num_images: 1, sync_mode: false };
}

export function openAiVectorCost(options = {}) {
  return { amountUsd: null, currency: "USD", provider: "fal.ai", model: options.model, unit: "svg",
    pricingSource: `https://fal.ai/models/${openAiVectorEndpoint(options.model)}/api`, checkedAt: "2026-11-09",
    pricingBasis: "Variable cost for the reference image and SVG authoring. No reliable per-SVG estimate; the settled Fal charge is recorded when available." };
}
