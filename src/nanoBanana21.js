export const nanoBanana21ModelName = "Nano Banana 2.1";
export const nanoBanana21FalTextEndpoint = "google/nano-banana-2.1";
export const nanoBanana21FalEditEndpoint = `${nanoBanana21FalTextEndpoint}/edit`;
export const nanoBanana21KreaEndpoint = "/generate/image/google/nano-banana-2.1";
export const nanoBanana21ResolutionOptions = ["2K", "1K", "4K"];
export const nanoBanana21AspectRatios = ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "4:1", "1:4", "8:1", "1:8"];
export const nanoBanana21ThinkingLevel = "high";
export const nanoBanana21KreaPrices = Object.freeze({ "1K": 0.03, "2K": 0.0505, "4K": 0.0755 });

export function isNanoBanana21Model(model) {
  return ["nano banana 2.1", nanoBanana21FalTextEndpoint, nanoBanana21FalEditEndpoint, "gemini-nano-banana-2.1"]
    .includes(String(model || "").trim().toLowerCase());
}

export function nanoBanana21Ratios(provider = "fal") {
  // Krea's published enum currently omits 8:1, unlike Fal's schema.
  return provider === "krea" ? nanoBanana21AspectRatios.filter(ratio => ratio !== "8:1") : nanoBanana21AspectRatios;
}

export function validateNanoBanana21Request({ prompt, images = [], resolution = "2K", aspectRatio = "16:9", provider = "fal", maskUrl, background = "auto" } = {}) {
  const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!["fal", "krea"].includes(provider)) fail("Nano Banana 2.1 requires Fal or Krea in Settings. Atlas Cloud support is not yet verified.");
  if (typeof prompt !== "string" || prompt.trim().length < 3 || prompt.trim().length > 50000) fail("Nano Banana 2.1 needs a prompt between 3 and 50,000 characters.");
  if (!nanoBanana21ResolutionOptions.includes(resolution)) fail("Nano Banana 2.1 supports 1K, 2K, or 4K resolution.");
  if (!nanoBanana21Ratios(provider).includes(aspectRatio)) fail(`Choose a supported Nano Banana 2.1 aspect ratio for ${provider === "krea" ? "Krea" : "Fal"}.`);
  if (!Array.isArray(images) || images.length > 14 || images.some(url => typeof url !== "string" || !url.trim())) fail("Nano Banana 2.1 accepts up to 14 valid image references. Remove extra or missing references before running.");
  if (maskUrl || (background && background !== "auto" && background !== "opaque")) fail("Nano Banana 2.1 does not support pixel masks or transparent backgrounds in this integration. Use Image Edit for masked edits.");
}

export function buildNanoBanana21Input({ prompt, images = [], aspectRatio = "16:9", resolution = "2K", provider = "fal", ...rest } = {}) {
  validateNanoBanana21Request({ prompt, images, aspectRatio, resolution, provider, ...rest });
  return {
    prompt: prompt.trim(), aspect_ratio: aspectRatio, resolution, thinking_level: nanoBanana21ThinkingLevel,
    ...(images.length ? { image_urls: images } : {}),
    ...(provider === "fal" ? { num_images: 1, output_format: "png", limit_generations: true } : {})
  };
}

export function nanoBanana21Cost({ provider = "fal", resolution = "2K", referenceCount = 0 } = {}) {
  return {
    amountUsd: provider === "krea" ? nanoBanana21KreaPrices[resolution] ?? null : null,
    currency: "USD", unit: "image", units: 1, mediaType: "image", model: nanoBanana21ModelName, resolution,
    thinkingLevel: nanoBanana21ThinkingLevel,
    endpoint: provider === "krea" ? nanoBanana21KreaEndpoint : referenceCount ? nanoBanana21FalEditEndpoint : nanoBanana21FalTextEndpoint,
    pricingBasis: provider === "krea" ? "Krea published fixed-price estimate; not a settled charge." : "Nano Banana 2.1 Fal pricing is not yet verified; the actual charge may vary.",
    pricingSource: provider === "krea" ? "krea-openapi-2026-10-06" : "unverified"
  };
}
