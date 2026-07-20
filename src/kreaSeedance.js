export const kreaApiBaseUrl = "https://api.krea.ai";

const kreaSeedanceRates = Object.freeze({
  standard: Object.freeze({
    "480p": Object.freeze({ withVideoReference: 0.0849, withoutVideoReference: 0.1415 }),
    "720p": Object.freeze({ withVideoReference: 0.1911, withoutVideoReference: 0.3186 }),
    "1080p": Object.freeze({ withVideoReference: 0.4301, withoutVideoReference: 0.7168 }),
    "4k": Object.freeze({ withVideoReference: 1.7203, withoutVideoReference: 2.8671 })
  }),
  fast: Object.freeze({
    "480p": Object.freeze({ withVideoReference: 0.0677, withoutVideoReference: 0.1129 }),
    "720p": Object.freeze({ withVideoReference: 0.1524, withoutVideoReference: 0.254 })
  })
});

export function resolveSeedanceRuntimeProvider({ falKey, kreaKey } = {}) {
  if (String(falKey || "").trim()) return "fal";
  if (String(kreaKey || "").trim()) return "krea";
  return "";
}

export function kreaSeedanceEndpoint(speed) {
  return speed === "fast"
    ? "/generate/video/bytedance/seedance-2-fast"
    : "/generate/video/bytedance/seedance-2";
}

export function estimateKreaSeedanceCost({ speed, durationSeconds, resolution, hasVideoReference }) {
  const tier = speed === "fast" ? "fast" : "standard";
  const fallbackResolution = tier === "fast" ? "720p" : "720p";
  const normalizedResolution = kreaSeedanceRates[tier][resolution] ? resolution : fallbackResolution;
  const rate = kreaSeedanceRates[tier][normalizedResolution][
    hasVideoReference ? "withVideoReference" : "withoutVideoReference"
  ];
  const seconds = Math.max(1, Number(durationSeconds) || 5);

  return {
    amountUsd: roundCurrency(seconds * rate),
    currency: "USD",
    unitRateUsd: rate,
    units: seconds,
    unit: "second",
    mediaType: "video",
    resolution: normalizedResolution,
    durationSeconds: seconds,
    pricingBasis: `Krea Seedance 2 ${tier} per-second estimate (${hasVideoReference ? "with" : "without"} video reference)`,
    pricingSource: "krea-api-pricing-2026-07-12"
  };
}

export function extractKreaJobResultUrl(job) {
  const urls = job?.result?.urls;
  if (typeof urls === "string" && urls.trim()) return urls.trim();

  if (Array.isArray(urls)) {
    const preferred = urls.find((item) => item?.type === "model" && typeof item?.url === "string");
    if (preferred?.url) return preferred.url;
    for (const item of urls) {
      if (typeof item === "string" && item.trim()) return item.trim();
      if (typeof item?.url === "string" && item.url.trim()) return item.url.trim();
    }
  }

  if (urls && typeof urls === "object") {
    for (const value of Object.values(urls)) {
      if (typeof value === "string" && value.trim()) return value.trim();
      if (typeof value?.url === "string" && value.url.trim()) return value.url.trim();
    }
  }

  return "";
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000000) / 1000000;
}
