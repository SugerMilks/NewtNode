export const PRICE_REFRESH_MS = 24 * 60 * 60 * 1000;
export const PRICE_EXPIRY_MS = 7 * PRICE_REFRESH_MS;
export const QUOTE_TTL_MS = 5 * 60 * 1000;

export function priceState(entry, now = Date.now()) {
  if (!entry) return "unavailable";
  if (entry.invalidatedAt) return "unavailable";
  const checked = Date.parse(entry.checkedAt);
  if (!Number.isFinite(checked) || checked > now + 60000) return "unavailable";
  if (now - checked > PRICE_EXPIRY_MS) return "expired";
  return entry.verificationFailed || now - checked > PRICE_REFRESH_MS ? "stale" : "current";
}

// Only settings that affect the supported estimate contracts belong in this key.
// No prompts, media URLs, API keys or project data are stored with a display quote.
export function generationQuoteSettings(options = {}) {
  const kind = options.kind || (options.duration != null ? "video" : "image");
  return {
    kind, provider: options.provider || "fal", model: options.model || "",
    resolution: options.resolution || (kind === "video" ? "720p" : "2K"),
    aspectRatio: options.aspectRatio || "16:9", quality: options.quality || "high",
    duration: kind === "video" ? String(options.duration ?? "5 seconds") : "",
    ...(kind === "video" && options.seedanceTask === "edit" ? { seedanceTask: "edit" } : {}),
    ...(kind === "video" && options.seedanceDraft === true ? { seedanceDraft: true } : {}),
    generateAudio: options.generateAudio !== false,
    referenceCount: Number(options.referenceCount || 0), referenceImageCount: Number(options.referenceImageCount || 0),
    hasVideoReference: Boolean(options.hasVideoReference), startFrameCount: Number(options.startFrameCount || 0),
    endFrameCount: Number(options.endFrameCount || 0), audioReferenceCount: Number(options.audioReferenceCount || 0),
    batchCount: Math.max(1, Math.round(Number(options.batchCount) || 1))
  };
}

export const generationQuoteKey = (options) => JSON.stringify(generationQuoteSettings(options));
