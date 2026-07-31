export const kreaApiBaseUrl = "https://api.krea.ai";

export const kreaEndpoints = Object.freeze({
  image: Object.freeze({
    "Z-Image": "/generate/image/z-image/z-image",
    "Seedream 5.0 Pro": "/generate/image/bytedance/seedream-5-pro",
    "Nano Banana 2": "/generate/image/google/nano-banana-2",
    "Nano Banana Pro": "/generate/image/google/nano-banana-pro",
    "OpenAI Image 2": "/generate/image/openai/gpt-image-2",
    "Krea 2 Large": "/generate/image/krea/krea-2/large",
    "Luma Dream Machine": "/generate/image/luma/uni-1"
  }),
  video: Object.freeze({
    "Seedance 2.0": "/generate/video/bytedance/seedance-2",
    "Kling O3 Pro": "/generate/video/kling/kling-3.0",
    "Kling O3 4K": "/generate/video/kling/kling-3.0",
    "Gemini Omni Flash": "/generate/video/google/gemini-omni-flash"
  }),
  model3d: Object.freeze({
    "Hunyuan 3D 3.1 Pro": "/generate/3d/tencent/hunyuan3d-3.1-pro"
  }),
  videoEnhance: Object.freeze({
    "Topaz Video Upscale": "/enhance/video/topaz/video"
  })
});

const kreaImagePrices = Object.freeze({
  "Z-Image": Object.freeze({ "1K": 0.003 }),
  "Nano Banana 2": Object.freeze({ "1K": 0.08, "2K": 0.12, "4K": 0.16 }),
  "Nano Banana Pro": Object.freeze({ "1K": 0.15, "2K": 0.15, "4K": 0.3 }),
  "Krea 2 Large": Object.freeze({ "1K": 0.06 }),
  "Luma Dream Machine": Object.freeze({ "1K": 0.0404, "2K": 0.1, "4K": 0.1 })
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

  if (modelName === "Seedream 5.0 Pro") {
    const dimensions = dimensionsForAspectRatio(normalizedAspectRatio, normalizedResolution === "2K" ? 2048 : 1536);
    return compact({
      ...input,
      width: dimensions.width,
      height: dimensions.height,
      style_images: refs.slice(0, 10).map((url) => ({ url, strength: 1 }))
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

  if (modelName === "Luma Dream Machine") {
    const dimensions = dimensionsForAspectRatio(normalizedAspectRatio, resolutionScale(normalizedResolution));
    return compact({
      ...input,
      width: dimensions.width,
      height: dimensions.height,
      mode: normalizedResolution === "1K" ? "standard" : "max",
      output_format: "png",
      style_images: refs.slice(0, 9).map((url) => ({ url, strength: 1 }))
    });
  }

  if (modelName === "Z-Image") {
    return compact({
      ...input,
      aspect_ratio: normalizedAspectRatio,
      resolution: "1K",
      image_url: refs[0] || undefined
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
  if (modelName === "Z-Image" || modelName === "Krea 2 Large") return "1K";
  if (modelName === "Seedream 5.0 Pro") return requested === "1K" ? "1.5K" : "2K";
  return normalizeChoice(requested, ["1K", "2K", "4K"], "2K");
}

export function normalizeKreaImageAspectRatio(modelName, value) {
  const ratio = String(value || "16:9").match(/\d+(?:\.\d+)?:\d+(?:\.\d+)?/)?.[0] || "16:9";
  const options =
    modelName === "Z-Image"
      ? ["1:1", "4:3", "2:3", "16:9", "9:16"]
      : modelName === "Krea 2 Large"
        ? ["1:1", "4:3", "3:2", "16:9", "2.35:1", "4:5", "2:3", "9:16"]
        : modelName === "OpenAI Image 2"
          ? ["16:9", "2:1", "3:2", "4:3", "1:1", "3:4", "2:3", "1:2", "9:16"]
          : ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4"];
  return closestRatio(ratio, options);
}

export function estimateKreaImageCost({ modelName, resolution, referenceCount = 0 } = {}) {
  const normalizedResolution = normalizeKreaImageResolution(modelName, resolution);
  let amountUsd = kreaImagePrices[modelName]?.[normalizedResolution] ?? null;

  if (modelName === "Seedream 5.0 Pro") {
    const base = normalizedResolution === "2K" ? 0.0945 : 0.0473;
    amountUsd = base + Math.max(0, Number(referenceCount) - 1) * 0.00315;
  } else if (modelName === "Krea 2 Large" && referenceCount > 0) {
    amountUsd = 0.065;
  } else if (modelName === "Luma Dream Machine" && referenceCount > 0 && amountUsd != null) {
    amountUsd += Math.min(9, Number(referenceCount)) * 0.003;
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

function dimensionsForAspectRatio(value, longEdge) {
  const [left, right] = String(value || "1:1").split(":").map(Number);
  const ratio = left > 0 && right > 0 ? left / right : 1;
  const width = ratio >= 1 ? longEdge : longEdge * ratio;
  const height = ratio >= 1 ? longEdge / ratio : longEdge;
  return {
    width: Math.max(512, Math.round(width / 8) * 8),
    height: Math.max(512, Math.round(height / 8) * 8)
  };
}

function resolutionScale(value) {
  if (value === "4K") return 4096;
  if (value === "2K") return 2048;
  return 1024;
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
