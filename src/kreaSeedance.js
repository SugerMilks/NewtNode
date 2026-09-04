import {
  extractKreaJobResultUrl,
  kreaApiBaseUrl,
  kreaEndpointForModel,
  resolveFalKreaProvider
} from "./kreaApi.js";

export { extractKreaJobResultUrl, kreaApiBaseUrl };

const kreaSeedanceRates = Object.freeze({
  standard: Object.freeze({
    "480p": Object.freeze({ withVideoReference: 0.0849, withoutVideoReference: 0.1415 }),
    "720p": Object.freeze({ withVideoReference: 0.1911, withoutVideoReference: 0.3186 }),
    "1080p": Object.freeze({ withVideoReference: 0.4301, withoutVideoReference: 0.7168 }),
    "4k": Object.freeze({ withVideoReference: 1.7203, withoutVideoReference: 2.8671 })
  }),
  seedance25: Object.freeze({
    "480p": Object.freeze({ withVideoReference: 0.0645, withoutVideoReference: 0.1078 }),
    "720p": Object.freeze({ withVideoReference: 0.1452, withoutVideoReference: 0.2427 }),
    "1080p": Object.freeze({ withVideoReference: 0.2572, withoutVideoReference: 0.4299 })
  })
});

export function resolveSeedanceRuntimeProvider({ falKey, kreaKey } = {}) {
  return resolveFalKreaProvider({ falKey, kreaKey });
}

export function kreaSeedanceEndpoint(modelName = "Seedance 2.0") {
  return kreaEndpointForModel("video", modelName);
}

export function estimateKreaSeedanceCost({ modelName = "Seedance 2.0", durationSeconds, resolution, hasVideoReference }) {
  const pricingTier = modelName === "Seedance 2.5" ? "seedance25" : "standard";
  const rates = kreaSeedanceRates[pricingTier];
  const normalizedResolution = rates[resolution] ? resolution : "720p";
  const rate = rates[normalizedResolution][
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
    pricingBasis: `Krea ${modelName === "Seedance 2.5" ? "Seedance 2.5" : "Seedance 2 standard"} per-second estimate (${hasVideoReference ? "with" : "without"} video reference)`,
    pricingSource: modelName === "Seedance 2.5"
      ? "krea-api-pricing-2026-08-29"
      : "krea-api-pricing-2026-07-12"
  };
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000000) / 1000000;
}
