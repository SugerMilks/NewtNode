export const kreaApiBaseUrl = "https://api.krea.ai";

export const kreaEndpoints = Object.freeze({
  image: Object.freeze({
    "Nano Banana 2": "/generate/image/google/nano-banana-2",
    "Nano Banana Pro": "/generate/image/google/nano-banana-pro",
    "OpenAI Image 2": "/generate/image/openai/gpt-image-2",
    "Krea 2 Large": "/generate/image/krea/krea-2/large"
  }),
  video: Object.freeze({
    "Seedance 2.0": "/generate/video/bytedance/seedance-2",
    "Seedance 2.5": "/generate/video/bytedance/seedance-2-5",
    "MiniMax H3": "/generate/video/minimax/hailuo-3",
    "Kling O3 Pro": "/generate/video/kling/kling-3.0",
    "Kling O3 4K": "/generate/video/kling/kling-3.0"
  }),
  model3d: Object.freeze({
    "Hunyuan 3D 3.1 Pro": "/generate/3d/tencent/hunyuan3d-3.1-pro"
  }),
  videoEnhance: Object.freeze({
    "Topaz Video Upscale": "/enhance/video/topaz/video"
  })
});

const kreaImagePrices = Object.freeze({
  "Nano Banana 2": Object.freeze({ "1K": 0.08, "2K": 0.12, "4K": 0.16 }),
  "Nano Banana Pro": Object.freeze({ "1K": 0.15, "2K": 0.15, "4K": 0.3 }),
  "Krea 2 Large": Object.freeze({ "1K": 0.06 })
});

export function resolveFalKreaProvider({ falKey, kreaKey } = {}) {
  if (String(falKey || "").trim()) return "fal";
  if (String(kreaKey || "").trim()) return "krea";
  return "";
}

export function kreaEndpointForModel(kind, modelName) {
  return kreaEndpoints[kind]?.[modelName] || "";
}

export function supportsKreaModel(kind, modelName) {
  return Boolean(kreaEndpointForModel(kind, modelName));
}

export function shouldRetryKreaJobLookup({
  status,
  attempt,
  transientAttempt = attempt,
  maxGraceAttempts = 15,
  maxTransientAttempts = 5
} = {}) {
  const normalizedStatus = Number(status);
  if (normalizedStatus === 404) return Number(attempt) < Number(maxGraceAttempts);
  return [408, 425, 429, 500, 502, 503, 504, 524].includes(normalizedStatus)
    && Number(transientAttempt) < Number(maxTransientAttempts);
}

export function kreaErrorMessage(data, fallback = "Krea request failed.") {
  const error = data?.error;
  const directMessage = [
    error?.message,
    typeof error === "string" ? error : "",
    data?.message,
    data?.detail
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  if (directMessage && directMessage !== "[object Object]") {
    if (looksLikeHtml(directMessage)) {
      const status = Number(data?._httpStatus) || htmlStatusCode(directMessage);
      if (status === 524 || /timeout occurred/i.test(directMessage)) {
        return `${fallback} Krea timed out while confirming or checking the generation (HTTP 524). The job may still be processing in Krea; check Krea history before retrying to avoid a duplicate charge.`;
      }
      return `${fallback} Krea returned an unexpected HTML error page${status ? ` (HTTP ${status})` : ""}. Please retry after a moment.`;
    }
    return directMessage;
  }

  const code = String(error?.code || "").trim();
  const jobId = String(data?.job_id || "").trim();
  if (code === "internal") {
    return [
      fallback,
      `Krea reported an internal provider error${jobId ? ` for job ${jobId}` : ""}.`,
      "The request was accepted, but video processing failed upstream. Retry once; if it repeats, switch the provider or video model."
    ].join(" ");
  }
  if (code) {
    return `${fallback} Krea error: ${code}${jobId ? ` (job ${jobId})` : ""}.`;
  }

  return fallback;
}

function looksLikeHtml(value) {
  return /<!doctype\s+html|<html\b|<head\b|<body\b/i.test(String(value || ""));
}

function htmlStatusCode(value) {
  const text = String(value || "");
  const match = text.match(/(?:\||>|\s)(4\d\d|5\d\d)\s*:\s*[^<]*(?:<|$)/i)
    || text.match(/\b(?:HTTP\s*)?(4\d\d|5\d\d)\b/i);
  return Number(match?.[1]) || 0;
}

export function buildKreaImageInput({
  modelName,
  prompt,
  referenceUrls = [],
  aspectRatio = "16:9",
  resolution = "2K",
  quality = "high",
  creativity = "raw"
} = {}) {
  const normalizedResolution = normalizeKreaImageResolution(modelName, resolution);
  const normalizedAspectRatio = normalizeKreaImageAspectRatio(modelName, aspectRatio);
  const refs = referenceUrls.filter(Boolean);
  const input = { prompt: String(prompt || "").trim() };

  if (modelName === "OpenAI Image 2") {
    return compact({
      ...input,
      quality: normalizeChoice(quality, ["low", "medium", "high", "auto"], "high"),
      image_urls: refs.slice(0, 10),
      aspect_ratio: normalizedAspectRatio,
      resolution: normalizedResolution
    });
  }

  if (modelName === "Nano Banana 2" || modelName === "Nano Banana Pro") {
    return compact({
      ...input,
      image_urls: refs.slice(0, 14),
      aspect_ratio: normalizedAspectRatio,
      resolution: normalizedResolution
    });
  }

  if (modelName === "Krea 2 Large") {
    return compact({
      ...input,
      image_style_references: refs.slice(0, 10).map((url) => ({ url, strength: 0.7 })),
      aspect_ratio: normalizedAspectRatio,
      resolution: "1K",
      creativity: normalizeChoice(creativity, ["raw", "low", "medium", "high"], "raw")
    });
  }

  return compact({
    ...input,
    image_urls: refs,
    aspect_ratio: normalizedAspectRatio,
    resolution: normalizedResolution
  });
}

export function normalizeKreaImageResolution(modelName, value) {
  const requested = String(value || "2K").toUpperCase();
  if (modelName === "Krea 2 Large") return "1K";
  return normalizeChoice(requested, ["1K", "2K", "4K"], "2K");
}

export function normalizeKreaImageAspectRatio(modelName, value) {
  const ratio = String(value || "16:9").match(/\d+(?:\.\d+)?:\d+(?:\.\d+)?/)?.[0] || "16:9";
  const options =
    modelName === "Krea 2 Large"
        ? ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"]
        : modelName === "OpenAI Image 2"
          ? ["16:9", "2:1", "3:2", "4:3", "1:1", "3:4", "2:3", "1:2", "9:16"]
          : ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"];
  return closestRatio(ratio, options);
}

export function estimateKreaImageCost({ modelName, resolution, referenceCount = 0 } = {}) {
  const normalizedResolution = normalizeKreaImageResolution(modelName, resolution);
  let amountUsd = kreaImagePrices[modelName]?.[normalizedResolution] ?? null;

  if (modelName === "Krea 2 Large" && referenceCount > 0) {
    amountUsd = 0.065;
  }

  return {
    amountUsd: amountUsd == null ? null : roundCurrency(amountUsd),
    currency: "USD",
    unit: "image",
    units: 1,
    mediaType: "image",
    resolution: normalizedResolution,
    pricingBasis: amountUsd == null
      ? `${modelName} generation through Krea; current public API documentation does not list a fixed local estimate`
      : `${modelName} Krea API fixed-price estimate`,
    pricingSource: "krea-api-docs-2026-07-30"
  };
}

export function estimateKreaKlingCost({ durationSeconds, generateAudio, mode }) {
  const normalizedMode = mode === "4k" ? "4k" : mode === "pro" ? "pro" : "std";
  const rate =
    normalizedMode === "4k"
      ? 0.441
      : normalizedMode === "pro"
        ? generateAudio ? 0.3528 : 0.2352
        : generateAudio ? 0.2646 : 0.1764;
  const seconds = Math.max(3, Math.min(15, Number(durationSeconds) || 5));
  return {
    amountUsd: roundCurrency(rate * seconds),
    currency: "USD",
    unitRateUsd: rate,
    units: seconds,
    unit: "second",
    mediaType: "video",
    durationSeconds: seconds,
    pricingBasis: `Krea Kling 3.0 ${normalizedMode} per-second estimate${generateAudio ? " with audio" : ""}`,
    pricingSource: "krea-api-docs-2026-07-30"
  };
}

export function buildKreaMiniMaxH3Input({
  prompt,
  startImage,
  endImage,
  referenceImages = [],
  referenceVideos = [],
  referenceAudios = [],
  aspectRatio = "16:9",
  duration = 5
} = {}) {
  const durationSeconds = Number(String(duration || "").match(/\d+/)?.[0]) || 5;
  return compact({
    prompt: String(prompt || "").trim(),
    start_image: startImage || undefined,
    end_image: endImage || undefined,
    aspect_ratio: normalizeKreaMiniMaxH3AspectRatio(aspectRatio),
    reference_images: referenceImages.filter(Boolean).slice(0, 9),
    reference_videos: referenceVideos.filter(Boolean).slice(0, 3),
    reference_audios: referenceAudios.filter(Boolean).slice(0, 3),
    duration: Math.min(15, Math.max(5, Math.round(durationSeconds)))
  });
}

export function normalizeKreaMiniMaxH3AspectRatio(value) {
  const normalized = String(value || "16:9").trim().toLowerCase();
  return ["adaptive", "21:9", "16:9", "4:3", "1:1", "3:4", "9:16"].includes(normalized)
    ? normalized
    : "16:9";
}

export function estimateKreaMiniMaxH3Cost({ durationSeconds, referenceImageCount = 0 } = {}) {
  const requestedSeconds = Number(String(durationSeconds || "").match(/\d+/)?.[0]) || 5;
  const seconds = Math.min(15, Math.max(5, Math.round(requestedSeconds)));
  const additionalReferenceImages = Math.max(0, Math.min(9, Number(referenceImageCount) || 0) - 5);
  const unitRateUsd = 0.1365;
  const referenceImageCostUsd = additionalReferenceImages * 0.042;
  return {
    amountUsd: roundCurrency(seconds * unitRateUsd + referenceImageCostUsd),
    currency: "USD",
    unitRateUsd,
    units: seconds,
    unit: "second",
    mediaType: "video",
    durationSeconds: seconds,
    additionalReferenceImages,
    referenceImageCostUsd: roundCurrency(referenceImageCostUsd),
    pricingBasis: "Krea MiniMax H3 output seconds plus reference images beyond the first five",
    pricingSource: "krea-openapi-2026-08-30"
  };
}

export function extractKreaJobResultUrls(job) {
  const urls = job?.result?.urls;
  if (typeof urls === "string" && urls.trim()) return [urls.trim()];
  if (Array.isArray(urls)) {
    return urls
      .map((item) => typeof item === "string" ? item : item?.url)
      .map((url) => String(url || "").trim())
      .filter(Boolean);
  }
  if (urls && typeof urls === "object") {
    return Object.values(urls)
      .map((item) => typeof item === "string" ? item : item?.url)
      .map((url) => String(url || "").trim())
      .filter(Boolean);
  }
  return [];
}

export function extractKreaJobResultUrl(job) {
  const urls = job?.result?.urls;
  if (Array.isArray(urls)) {
    const model = urls.find((item) => item?.type === "model" && item?.url);
    if (model?.url) return model.url;
  }
  return extractKreaJobResultUrls(job)[0] || "";
}

function compact(value) {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && (!Array.isArray(item) || item.length)));
}

function normalizeChoice(value, options, fallback) {
  const normalized = String(value || "").toLowerCase();
  return options.find((option) => option.toLowerCase() === normalized) || fallback;
}

function ratioNumber(value) {
  const [left, right] = String(value || "1:1").split(":").map(Number);
  return left > 0 && right > 0 ? left / right : 1;
}

function closestRatio(value, options) {
  const target = ratioNumber(value);
  return options.reduce((best, option) => {
    return Math.abs(ratioNumber(option) - target) < Math.abs(ratioNumber(best) - target) ? option : best;
  }, options[0]);
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000000) / 1000000;
}
