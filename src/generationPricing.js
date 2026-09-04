import { estimateKreaImageCost, estimateKreaKlingCost, estimateKreaMiniMaxH3Cost } from "./kreaApi.js";
import { estimateKreaSeedanceCost } from "./kreaSeedance.js";
import { estimateMiniMaxH3FalCost } from "./minimaxH3.js";
import { estimateNanoBanana2Cost } from "./nanoBanana2.js";
import { estimateOpenAiImage2Cost } from "./openAiImage2.js";
import { reve21CostPerImage } from "./reve21.js";
import { estimateSeedance25FalCost } from "./seedance25.js";

const falImageRates = Object.freeze({
  "Nano Banana Pro": Object.freeze({ "1K": 0.15, "2K": 0.15, "4K": 0.3 }),
  "Krea 2 Large": Object.freeze({ standard: 0.06, reference: 0.065 })
});

const falKlingRates = Object.freeze({
  pro: Object.freeze({ silent: 0.112, audio: 0.14 }),
  "4k": Object.freeze({ silent: 0.42, audio: 0.42 })
});

const seedance20Rates = Object.freeze({
  tokenRate: 0.014,
  videoReferenceMultiplier: 0.6,
  fps: 24
});

const seedanceDimensions = Object.freeze({
  "480p": Object.freeze({
    "21:9": [992, 432], "16:9": [864, 496], "4:3": [752, 560],
    "1:1": [640, 640], "3:4": [560, 752], "9:16": [496, 864]
  }),
  "720p": Object.freeze({
    "21:9": [1470, 630], "16:9": [1280, 720], "4:3": [1112, 834],
    "1:1": [960, 960], "3:4": [834, 1112], "9:16": [720, 1280]
  }),
  "1080p": Object.freeze({
    "21:9": [2352, 1008], "16:9": [2048, 1152], "4:3": [1792, 1344],
    "1:1": [1536, 1536], "3:4": [1344, 1792], "9:16": [1152, 2048]
  }),
  "4k": Object.freeze({
    "21:9": [5040, 2160], "16:9": [3840, 2160], "4:3": [2880, 2160],
    "1:1": [2160, 2160], "3:4": [2160, 2880], "9:16": [2160, 3840]
  })
});

export function generationProviderFromSettings(settings = {}) {
  const preferences = settings.providerPreferences || {};
  if (preferences.fal !== false && settings.falKeyConfigured) return "fal";
  if (preferences.krea !== false && settings.kreaApiKeyConfigured) return "krea";
  if (preferences.krea === true && preferences.fal === false) return "krea";
  return "fal";
}

export function estimateImageRunCost({
  model,
  resolution = "2K",
  aspectRatio = "16:9",
  quality = "high",
  referenceCount = 0,
  batchCount = 1,
  provider = "fal"
} = {}) {
  const normalizedProvider = provider === "krea" ? "krea" : "fal";
  const references = Math.max(0, Number(referenceCount) || 0);
  let unitCost = null;

  if (model === "OpenAI Image 2") {
    unitCost = estimateOpenAiImage2Cost({
      resolution,
      size: orientationSize(aspectRatio),
      quality,
      edit: references > 0
    });
  } else if (model === "Nano Banana 2") {
    unitCost = normalizedProvider === "krea"
      ? estimateKreaImageCost({ modelName: model, resolution, referenceCount: references }).amountUsd
      : estimateNanoBanana2Cost(resolution);
  } else if (model === "Nano Banana Pro") {
    unitCost = normalizedProvider === "krea"
      ? estimateKreaImageCost({ modelName: model, resolution, referenceCount: references }).amountUsd
      : falImageRates[model][normalizedImageResolution(resolution)];
  } else if (model === "REVE 2.1") {
    unitCost = reve21CostPerImage;
  } else if (model === "Krea 2 Large") {
    unitCost = normalizedProvider === "krea"
      ? estimateKreaImageCost({ modelName: model, resolution, referenceCount: references }).amountUsd
      : references > 0 ? falImageRates[model].reference : falImageRates[model].standard;
  }

  return totalEstimate(unitCost, batchCount);
}

export function estimateVideoRunCost({
  model,
  duration = "5 seconds",
  resolution = "720p",
  aspectRatio = "16:9",
  generateAudio = true,
  hasVideoReference = false,
  referenceImageCount = 0,
  batchCount = 1,
  provider = "fal"
} = {}) {
  const normalizedProvider = provider === "krea" ? "krea" : "fal";
  const seconds = durationSeconds(duration, model === "Seedance 2.5" ? 15 : 5);
  let unitCost = null;

  if (model === "Seedance 2.0") {
    unitCost = normalizedProvider === "krea"
      ? estimateKreaSeedanceCost({ modelName: model, durationSeconds: seconds, resolution: normalizedVideoResolution(resolution), hasVideoReference }).amountUsd
      : estimateSeedance20FalCost({ duration: seconds, resolution, aspectRatio, hasVideoReference });
  } else if (model === "Seedance 2.5") {
    unitCost = normalizedProvider === "krea"
      ? estimateKreaSeedanceCost({ modelName: model, durationSeconds: seconds, resolution: normalizedVideoResolution(resolution), hasVideoReference }).amountUsd
      : estimateSeedance25FalCost({ duration: seconds, resolution, hasVideoReference }).amountUsd;
  } else if (model === "Kling O3 Pro" || model === "Kling O3 4K") {
    const mode = model === "Kling O3 4K" ? "4k" : "pro";
    unitCost = normalizedProvider === "krea"
      ? estimateKreaKlingCost({ durationSeconds: seconds, generateAudio, mode }).amountUsd
      : seconds * falKlingRates[mode][generateAudio ? "audio" : "silent"];
  } else if (model === "MiniMax H3") {
    unitCost = normalizedProvider === "krea"
      ? estimateKreaMiniMaxH3Cost({ durationSeconds: seconds, referenceImageCount }).amountUsd
      : estimateMiniMaxH3FalCost({ duration: seconds, resolution, referenceImageCount }).amountUsd;
  }

  return totalEstimate(unitCost, batchCount);
}

export function formatRunCost(amountUsd) {
  const amount = Number(amountUsd);
  if (!Number.isFinite(amount)) return "";
  if (amount > 0 && amount < 0.01) return "<$0.01";
  return `$${amount.toFixed(2)}`;
}

export function formatPricedRunLabel(label, amountUsd) {
  const cost = formatRunCost(amountUsd);
  return cost ? `${label} (${cost})` : label;
}

function estimateSeedance20FalCost({ duration, resolution, aspectRatio, hasVideoReference }) {
  const normalizedResolution = seedanceDimensions[String(resolution || "").toLowerCase()] ? String(resolution).toLowerCase() : "720p";
  const ratio = String(aspectRatio || "16:9").match(/\d+(?:\.\d+)?:\d+(?:\.\d+)?/)?.[0] || "16:9";
  const [width, height] = seedanceDimensions[normalizedResolution][ratio] || seedanceDimensions[normalizedResolution]["16:9"];
  const billedSeconds = Math.max(1, Number(duration) || 5);
  const tokensInThousands = (width * height * billedSeconds * seedance20Rates.fps) / 1024 / 1000;
  const multiplier = hasVideoReference ? seedance20Rates.videoReferenceMultiplier : 1;
  return roundCurrency(tokensInThousands * seedance20Rates.tokenRate * multiplier);
}

function totalEstimate(unitCost, batchCount) {
  if (!Number.isFinite(Number(unitCost))) return null;
  const count = Math.max(1, Math.round(Number(batchCount) || 1));
  return roundCurrency(Number(unitCost) * count);
}

function durationSeconds(value, fallback) {
  if (String(value || "").trim().toLowerCase() === "auto") return fallback;
  return Math.max(1, Number(String(value || "").match(/\d+/)?.[0]) || fallback);
}

function normalizedImageResolution(value) {
  const resolution = String(value || "2K").toUpperCase();
  return ["1K", "2K", "4K"].includes(resolution) ? resolution : "2K";
}

function normalizedVideoResolution(value) {
  const resolution = String(value || "720p").toLowerCase();
  return ["480p", "720p", "1080p", "4k"].includes(resolution) ? resolution : "720p";
}

function orientationSize(aspectRatio) {
  const ratio = String(aspectRatio || "16:9").match(/\d+(?:\.\d+)?:\d+(?:\.\d+)?/)?.[0] || "16:9";
  const [width, height] = ratio.split(":").map(Number);
  return `${width || 16}x${height || 9}`;
}

function roundCurrency(value) {
  return Math.round((Number(value) + Number.EPSILON) * 1000000) / 1000000;
}
