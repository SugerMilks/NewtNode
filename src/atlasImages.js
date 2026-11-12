import { imageModelNames, nanoImageAspectRatios } from "./modelOptions.js";
import { seedream55AtlasBase, validateSeedream55Request } from "./seedream55.js";

// Verified 2026-09-10 against https://static.atlascloud.ai/model/schema/<model-id-with-dashes>.json.
// GPT Image 2.6 is not published on Atlas (catalog checked 2026-11-04).
const models = {
  [imageModelNames.seedream55]: { id: seedream55AtlasBase, family: "seedream", maxReferences: 10 },
  [imageModelNames.openAiImage2]: { id: "openai/gpt-image-2", family: "openai", maxReferences: 10 },
  [imageModelNames.nanoBananaPro]: { id: "google/nano-banana-pro", family: "nano", maxReferences: 10 }
};

export const atlasImageModels = Object.freeze(Object.keys(models));

export function supportsAtlasImageModel(name) {
  return typeof name === "string" && Object.hasOwn(models, name);
}

function fail(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function option(value, choices, field, model) {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  if (!choices.includes(normalized)) fail(`Atlas ${model}: unsupported ${field}; choose ${choices.join(", ")}.`);
  return normalized;
}

function validatePrompt(prompt, maxLength, model) {
  if (typeof prompt !== "string" || !prompt.trim()) fail(`Atlas ${model} needs a non-empty prompt.`);
  if (maxLength && Array.from(prompt).length > maxLength) {
    fail(`Atlas ${model} accepts a prompt of at most ${maxLength} characters.`);
  }
}

function validateReferences(images, maxReferences, model) {
  if (!Array.isArray(images)) fail(`Atlas ${model}: images must be an array of image strings.`);
  if (images.length > maxReferences) {
    fail(`Atlas ${model} accepts up to ${maxReferences} reference images. Remove extra references before running.`);
  }
  for (const image of images) {
    if (typeof image !== "string" || !image.trim()) {
      fail(`Atlas ${model}: every reference image must be a non-empty string.`);
    }
  }
}

function openAiAspectRatio(value, allowAuto, model) {
  if (allowAuto && typeof value === "string" && value.toLowerCase() === "auto") return "auto";
  if (typeof value !== "string" || !/^\d+(?:\.\d+)?:\d+(?:\.\d+)?$/.test(value)) {
    fail(`Atlas ${model}: unsupported aspectRatio; use a width:height ratio between 1:3 and 3:1.`);
  }
  const [width, height] = value.split(":").map(Number);
  const ratio = width / height;
  if (![width, height, ratio].every(Number.isFinite) || width <= 0 || height <= 0 || ratio < 1 / 3 || ratio > 3) {
    fail(`Atlas ${model}: aspectRatio must be between 1:3 and 3:1.`);
  }
  return ratio;
}

function validateOpenAiSize(size, allowAuto, model) {
  if (allowAuto && typeof size === "string" && size.toLowerCase() === "auto") return "auto";
  const match = typeof size === "string" && /^(\d+)x(\d+)$/.exec(size);
  const [width, height] = match ? match.slice(1).map(Number) : [];
  if (![width, height].every((edge) => Number.isInteger(edge) && edge >= 256 && edge <= 3840 && edge % 16 === 0)
    || Math.max(width / height, height / width) > 3 || width * height > 3840 * 2160) {
    fail(`Atlas ${model}: size must be WIDTHxHEIGHT with 256-3840px edges divisible by 16, aspect ratio 1:3 to 3:1, and at most 8294400 pixels.`);
  }
  return size;
}

function openAiSize({ size, ratio, aspectRatio, resolution, allowAuto, model }) {
  // Explicit full-size input is authoritative. Do not snap it to a preset or silently resize it.
  if (size !== undefined) return validateOpenAiSize(size, allowAuto, model);
  if (ratio === "auto") return "auto";

  // Match Newt's resolution/aspect sizing without importing server orchestration.
  const presets = {
    "1k": { "21:9": "1344x576", "16:9": "1280x720", "1:1": "1024x1024", "9:16": "720x1280" },
    "2k": { "21:9": "2048x880", "16:9": "2048x1152", "1:1": "2048x2048", "9:16": "1152x2048" },
    "4k": { "21:9": "3840x1648", "16:9": "3840x2160", "1:1": "2880x2880", "9:16": "2160x3840" }
  };
  if (presets[resolution][aspectRatio]) return presets[resolution][aspectRatio];
  const longSide = { "1k": 1280, "2k": 2048, "4k": 3840 }[resolution];
  const maxPixels = { "1k": 1024 ** 2, "2k": 2048 ** 2, "4k": 3840 * 2160 }[resolution];
  let width = ratio >= 1 ? longSide : longSide * ratio;
  let height = ratio >= 1 ? longSide / ratio : longSide;
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  width = Math.round(width * scale / 16) * 16;
  height = Math.round(height * scale / 16) * 16;
  // Rounding a derived size must not exceed the pixel budget or the 3:1 boundary.
  while (width * height > maxPixels || Math.max(width / height, height / width) > 3) {
    if (width >= height) width -= 16;
    else height -= 16;
  }
  return validateOpenAiSize(`${width}x${height}`, allowAuto, model);
}

/** Pure request construction. The caller owns uploads, media inspection, submission and accounting. */
export function buildAtlasImageRequest(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) fail("Atlas image settings must be an object.");
  const { model, prompt, images = [], aspectRatio = "16:9", resolution, quality = "high",
    size, maskUrl = "", background = "auto", ...unsupported } = options;
  if (!supportsAtlasImageModel(model)) fail("Unsupported Atlas image model. Choose an exact supported Newt image model name.");
  if (Object.keys(unsupported).length) fail(`Atlas ${model}: unsupported setting ${Object.keys(unsupported).join(", ")}.`);

  const config = models[model];
  if (config.family === "seedream") {
    const dimensions = validateSeedream55Request({ prompt, images, resolution, aspectRatio, maskUrl, background, provider: "atlas" });
    return { model: `${config.id}/${images.length ? "edit" : "text-to-image"}`, prompt,
      size: `${dimensions.width}*${dimensions.height}`, output_format: "png", background,
      enable_sync_mode: false, enable_base64_output: false,
      ...(images.length ? { reference_images: [...images] } : {}) };
  }
  const openAi = config.family === "openai";
  validateReferences(images, config.maxReferences, model);
  validatePrompt(prompt, null, model);
  if (typeof maskUrl !== "string" || (maskUrl && !maskUrl.trim())) fail(`Atlas ${model}: maskUrl must be an image string or empty.`);
  if (maskUrl) fail(`Atlas ${model} does not support masks.`);

  const selectedResolution = option(resolution === undefined ? "2K" : resolution, ["1k", "2k", "4k"], "resolution", model);
  const selectedQuality = option(quality, openAi ? ["low", "medium", "high"] : ["high"], "quality", model);
  option(background, ["auto"], "background", model);
  const mode = images.length ? "edit" : "text-to-image";
  const request = {
    model: `${config.id}/${mode}`,
    prompt,
    output_format: "png",
    enable_sync_mode: false
  };

  if (openAi) {
    const ratio = openAiAspectRatio(aspectRatio, false, model);
    request.size = openAiSize({ size, ratio, aspectRatio, resolution: selectedResolution, allowAuto: false, model });
    request.quality = selectedQuality;
  } else {
    // The shared adapter supplies OpenAI dimensions for every model; these models use only their native controls.
    request.aspect_ratio = option(aspectRatio, nanoImageAspectRatios, "aspectRatio", model);
    request.resolution = selectedResolution;
    // These image models have no quality field. High is Newt's neutral default, not a provider tier.
    request.media_resolution = "high";
  }

  if (images.length) request.images = [...images];
  return request;
}
