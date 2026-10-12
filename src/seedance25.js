export const seedance25ModelName = "Seedance 2.5";

export const seedance25DurationOptions = [
  "Auto",
  ...Array.from({ length: 27 }, (_value, index) => `${index + 4} seconds`)
];

export const seedance25ResolutionOptions = ["720p", "1080p", "480p"];
export const seedance25AspectRatioOptions = [
  "Auto",
  "21:9",
  "16:9 (Landscape)",
  "4:3",
  "1:1",
  "3:4",
  "9:16 (Portrait)"
];

export const seedance25ReferenceLimits = Object.freeze({
  images: 30,
  videos: 10,
  audio: 10,
  total: 50
});

export const seedance25FalEndpoints = Object.freeze({
  "text-to-video": "bytedance/seedance-2.5/text-to-video",
  "image-to-video": "bytedance/seedance-2.5/image-to-video",
  "reference-to-video": "bytedance/seedance-2.5/reference-to-video"
});

const seedance25FalRates = Object.freeze({
  "480p": 0.2205,
  "720p": 0.473,
  "1080p": 1.13724
});

export function isSeedance25Model(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("seedance") && normalized.includes("2.5");
}

export function seedance25FalEndpoint(routeKind) {
  return seedance25FalEndpoints[routeKind] || seedance25FalEndpoints["text-to-video"];
}

// Same model/endpoint, different operation. Never infer editing from a prompt.
// Fal and Atlas reference-to-video schemas verified 2026-10-06.
export function validateSeedance25Task({ model, seedanceTask = "reference", provider,
  videos = [], startFrames = [], endFrames = [], filmDirector } = {}) {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!["reference", "edit"].includes(seedanceTask)) fail("Unknown Seedance task. Choose Generate Video or Edit Existing Video.");
  if (seedanceTask === "reference") return false;
  if (!isSeedance25Model(model)) fail("Edit Existing Video requires Seedance 2.5.");
  if (provider && !["atlas", "fal"].includes(provider)) fail("Seedance video editing is verified for Fal and Atlas only. No provider has been changed.");
  if (!Array.isArray(videos) || videos.length !== 1) fail("Edit Existing Video requires exactly one connected Reference Video.");
  if (!Array.isArray(startFrames) || !Array.isArray(endFrames)) fail("Invalid frame inputs for Edit Existing Video.");
  if (startFrames.length || endFrames.length) fail("Edit Existing Video cannot use Start or End Frames. Connect the look reference to Reference Image instead.");
  if (filmDirector) fail("Disconnect Director before editing an existing video; its scene timing must not override the source clip.");
  return true;
}

export function validateSeedance25EditDuration(duration) {
  if (!Number.isFinite(duration) || duration < 4 || duration > 30) {
    throw Object.assign(new Error("Edit Existing Video requires a readable source video between 4 and 30 seconds. No generation was submitted."), { status: 400 });
  }
  return duration;
}

export function validateSeedance25ReferenceTags(prompt, { images = 0, videos = 0, audio = 0 } = {}) {
  const counts = { image: images, video: videos, audio };
  const invalid = [...String(prompt || "").matchAll(/(?<![A-Za-z0-9._%+-])@([A-Za-z0-9_-]+)|\[(Image\d+|Video\d+|Audio\d+)\]/gi)]
    .map((match) => match[1] || match[2]).filter((tag) => {
      const match = tag.match(/^(Image|Video|Audio)([1-9]\d*)$/i);
      return !match || Number(match[2]) > counts[match[1].toLowerCase()];
    });
  if (invalid.length) throw Object.assign(new Error(`Unmatched reference tags: ${[...new Set(invalid)].map((tag) => `@${tag}`).join(", ")}. Match the connected node names exactly, or use numbered references such as @Image1 and @Video1.`), { status: 400 });
}

export function normalizeSeedance25Duration(value, fallback = "15") {
  if (String(value || "").trim().toLowerCase() === "auto") return "auto";
  const seconds = Number.parseInt(String(value || "").match(/\d+/)?.[0] || "", 10);
  if (Number.isFinite(seconds) && seconds >= 4 && seconds <= 30) return String(seconds);
  return normalizeSeedance25Duration(fallback, "15");
}

export function normalizeSeedance25Resolution(value, fallback = "720p") {
  const normalized = String(value || "").trim().toLowerCase();
  // Provider schemas call a 1920x1080 landscape output "1080p".
  if (normalized === "1920p" || normalized === "1920x1080") return "1080p";
  return seedance25ResolutionOptions.find((option) => option.toLowerCase() === normalized)
    || seedance25ResolutionOptions.find((option) => option.toLowerCase() === String(fallback || "").toLowerCase())
    || "720p";
}

export function normalizeSeedance25AspectRatio(value, fallback = "16:9") {
  if (String(value || "").trim().toLowerCase() === "auto") return "auto";
  const ratio = String(value || "").match(/\d+(?:\.\d+)?:\d+(?:\.\d+)?/)?.[0] || "";
  const allowed = ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16"];
  return allowed.includes(ratio) ? ratio : allowed.includes(fallback) ? fallback : "16:9";
}

export function estimateSeedance25FalCost({ duration, resolution, hasVideoReference = false } = {}) {
  const normalizedResolution = normalizeSeedance25Resolution(resolution);
  const durationSeconds = String(duration || "").toLowerCase() === "auto"
    ? 15
    : Math.min(30, Math.max(4, Number.parseInt(String(duration || "").match(/\d+/)?.[0] || "15", 10)));
  const baseRate = seedance25FalRates[normalizedResolution];
  const unitRateUsd = hasVideoReference ? baseRate * 0.6 : baseRate;

  return {
    amountUsd: roundCurrency(durationSeconds * unitRateUsd),
    currency: "USD",
    unitRateUsd: roundCurrency(unitRateUsd),
    units: durationSeconds,
    unit: "second",
    mediaType: "video",
    resolution: normalizedResolution,
    durationSeconds,
    pricingBasis: `Seedance 2.5 fal.ai per-second estimate${hasVideoReference ? " with the published video-reference multiplier" : ""}`,
    pricingSource: "fal-model-page-2026-08-18"
  };
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000000) / 1000000;
}
