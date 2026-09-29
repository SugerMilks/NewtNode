// Provider contracts checked 2026-09-26: Fal v5/pro, Krea OpenAPI, Atlas v5.0-pro.
export const seedream5ProModelName = "Seedream 5.0 Pro";
export const seedream5ProResolutionOptions = ["2K", "1K"];
export const seedream5ProAspectRatios = ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "2:1", "1:2"];
export const seedream5ProKreaEndpoint = "/generate/image/bytedance/seedream-5-pro";
export const seedream5ProAtlasBase = "bytedance/seedream-v5.0-pro";
export const seedream5ProFalEndpoint = (referenceCount = 0) => `bytedance/seedream/v5/pro/${referenceCount ? "edit" : "text-to-image"}`;
export const isSeedream5ProModel = model => model === seedream5ProModelName;
export const normalizeSeedream5ProResolution = value => seedream5ProResolutionOptions.includes(String(value).toUpperCase()) ? String(value).toUpperCase() : "2K";

function fail(message) {
  throw Object.assign(new Error(`${seedream5ProModelName}: ${message}`), { status: 400 });
}

export function seedream5ProSize({ resolution = "2K", aspectRatio = "16:9" } = {}) {
  if (!seedream5ProResolutionOptions.includes(String(resolution).toUpperCase())) fail("choose 1K or 2K resolution; 4K is not supported.");
  if (!seedream5ProAspectRatios.includes(aspectRatio)) fail("choose a supported aspect ratio.");
  const [w, h] = aspectRatio.split(":").map(Number);
  const pixels = String(resolution).toUpperCase() === "1K" ? 1024 ** 2 : 2048 ** 2;
  // Sizes are area-based, not a fixed long edge: a 1280x720 '1K' is below the API minimum.
  const round = pixels === 1024 ** 2 ? Math.ceil : Math.floor;
  return { width: round(Math.sqrt(pixels * w / h)), height: round(Math.sqrt(pixels * h / w)) };
}

export function validateSeedream5ProRequest({ prompt, images = [], resolution, aspectRatio, maskUrl = "", background = "auto" } = {}) {
  if (typeof prompt !== "string" || !prompt.trim()) fail("a prompt is required.");
  if (!Array.isArray(images) || images.length > 10 || images.some(image => typeof image !== "string" || !image.trim())) fail("use at most 10 reference images. Remove extra references before running.");
  if (maskUrl) fail("pixel edit masks are not supported. Use an Image 2.5 model for masked editing.");
  if (!["auto", "opaque"].includes(background)) fail("transparent output is not supported by this integration.");
  return seedream5ProSize({ resolution, aspectRatio });
}

export function buildSeedream5ProFalInput(options) {
  const image_size = validateSeedream5ProRequest(options);
  return { prompt: options.prompt, image_size, num_images: 1, output_format: "png", enable_safety_checker: true,
    ...(options.images?.length ? { image_urls: [...options.images] } : {}) };
}

export function seedream5ProCost({ provider = "fal", resolution = "2K", aspectRatio = "16:9", referenceCount = 0 } = {}) {
  const endpoint = provider === "krea" ? seedream5ProKreaEndpoint : provider === "atlas"
    ? `${seedream5ProAtlasBase}/${referenceCount ? "edit" : "text-to-image"}` : seedream5ProFalEndpoint(referenceCount);
  const cost = { amountUsd: null, currency: "USD", unit: "image", units: 1, mediaType: "image", estimated: true,
    pricingStatus: "unavailable", endpoint, pricingBasis: "Seedream Pro cost is unknown for these settings." };
  if (!["fal", "krea"].includes(provider) || !Number.isInteger(referenceCount) || referenceCount < 0 || referenceCount > 10) return cost;
  let size;
  try { size = seedream5ProSize({ resolution, aspectRatio }); } catch { return cost; }
  const lowerTier = size.width * size.height <= 1536 ** 2;
  const base = provider === "krea" ? lowerTier ? 0.045 : 0.09 : lowerTier ? 0.0675 : 0.135;
  const extra = Math.max(0, referenceCount - 1) * (provider === "krea" ? 0.003 : 0.0045);
  return { ...cost, amountUsd: Math.round((base + extra) * 1e6) / 1e6, pricingStatus: "estimated", resolution,
    resolutionTier: lowerTier ? "1.5k" : "2k", pricingCheckedAt: "2026-09-26",
    pricingSource: provider === "krea" ? "https://api.krea.ai/openapi.json" : `https://fal.ai/models/${endpoint}`,
    pricingBasis: "Published Seedream Pro estimate by output pixel area, plus reference images after the first; final billing may differ." };
}
