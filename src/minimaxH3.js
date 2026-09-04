export const minimaxH3ModelName = "MiniMax H3";
export const minimaxH3DurationOptions = Array.from({ length: 11 }, (_value, index) => `${index + 5} seconds`);
export const minimaxH3ResolutionOptions = ["2K", "768P", "480P", "4K"];
export const minimaxH3AspectRatioOptions = ["16:9", "21:9", "9:16", "1:1", "4:3", "3:4", "Adaptive"];
export const minimaxH3ReferenceLimits = Object.freeze({ images: 9, videos: 3, audio: 3, total: 12 });

export const minimaxH3FalEndpoints = Object.freeze({
  text: "minimax/h3/text-to-video",
  image: "minimax/h3/image-to-video",
  reference: "minimax/h3/reference-to-video"
});

const minimaxH3Rates = Object.freeze({
  "480P": 0.05,
  "768P": 0.08,
  "2K": 0.13,
  "4K": 0.16
});

export function isMiniMaxH3Model(model) {
  const normalized = String(model || "").trim().toLowerCase();
  return normalized.includes("minimax") && normalized.includes("h3");
}

export function normalizeMiniMaxH3Duration(value) {
  const seconds = Math.round(Number(String(value || "").match(/\d+/)?.[0]) || 5);
  return Math.min(15, Math.max(5, seconds));
}

export function normalizeMiniMaxH3Resolution(value) {
  const normalized = String(value || "2K").trim().toUpperCase();
  return minimaxH3ResolutionOptions.includes(normalized) ? normalized : "2K";
}

export function normalizeMiniMaxH3AspectRatio(value) {
  const normalized = String(value || "16:9").trim();
  if (/^adaptive$/i.test(normalized)) return "adaptive";
  const ratio = normalized.match(/\d+(?:\.\d+)?:\d+(?:\.\d+)?/)?.[0] || "16:9";
  return minimaxH3AspectRatioOptions.includes(ratio) ? ratio : "16:9";
}

export function miniMaxH3FalEndpoint({ startFrame = false, references = false } = {}) {
  if (startFrame) return minimaxH3FalEndpoints.image;
  if (references) return minimaxH3FalEndpoints.reference;
  return minimaxH3FalEndpoints.text;
}

export function estimateMiniMaxH3FalCost({ duration, resolution, referenceImageCount = 0, endpoint = "" } = {}) {
  const durationSeconds = normalizeMiniMaxH3Duration(duration);
  const normalizedResolution = normalizeMiniMaxH3Resolution(resolution);
  const unitRateUsd = minimaxH3Rates[normalizedResolution];
  const additionalReferenceImages = Math.max(0, Math.min(minimaxH3ReferenceLimits.images, Number(referenceImageCount) || 0) - 5);
  const referenceImageCostUsd = additionalReferenceImages * 0.08;
  return {
    amountUsd: Math.round((durationSeconds * unitRateUsd + referenceImageCostUsd) * 10000) / 10000,
    currency: "USD",
    unitRateUsd,
    units: durationSeconds,
    unit: "second",
    mediaType: "video",
    durationSeconds,
    resolution: normalizedResolution,
    additionalReferenceImages,
    referenceImageCostUsd,
    pricingBasis: "MiniMax H3 fal.ai output seconds plus reference images beyond the first five",
    pricingSource: "fal-model-page-2026-08-30",
    endpoint
  };
}

export function rewriteMiniMaxH3ReferenceMentions(prompt, references = []) {
  let output = String(prompt || "");
  references.forEach((reference, index) => {
    const tag = String(reference?.label || "").trim().replace(/^@+/, "");
    if (!tag) return;
    const type = reference?.type === "video" ? "Video" : reference?.type === "audio" ? "Audio" : "Image";
    const typeIndex = references.slice(0, index + 1).filter((item) => {
      const itemType = item?.type === "video" ? "video" : item?.type === "audio" ? "audio" : "image";
      return itemType === type.toLowerCase();
    }).length;
    output = output.replace(new RegExp(`@${escapeRegExp(tag)}(?![\\w-])`, "gi"), `${type} ${typeIndex}`);
  });
  return output;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
