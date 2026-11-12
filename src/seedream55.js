// Provider contracts checked 2026-11-11: Fal v5.5 and Atlas v5.5. Krea has no 5.5 endpoint.
export const seedream55ModelName = "Seedream 5.5";
export const seedream55ResolutionOptions = ["2K", "1K"];
export const seedream55AspectRatios = ["21:9", "16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3", "4:5", "5:4", "2:1", "1:2"];
export const seedream55AtlasBase = "bytedance/seedream-v5.5";
export const seedream55FalEndpoint = (referenceCount = 0) => `bytedance/seedream/v5.5/${referenceCount ? "edit" : "text-to-image"}`;
export const isSeedream55Model = model => model === seedream55ModelName;
export const normalizeSeedream55Resolution = value => seedream55ResolutionOptions.includes(String(value).toUpperCase()) ? String(value).toUpperCase() : "2K";

const sizes = {
  "1K": { "1:1": [1024, 1024], "4:3": [1152, 864], "3:4": [864, 1152], "16:9": [1424, 800], "9:16": [800, 1424], "3:2": [1248, 832], "2:3": [832, 1248], "21:9": [1568, 672] },
  "2K": { "1:1": [2048, 2048], "4:3": [2368, 1776], "3:4": [1776, 2368], "16:9": [2816, 1584], "9:16": [1584, 2816], "3:2": [2496, 1664], "2:3": [1664, 2496], "21:9": [3136, 1344] }
};
export const seedream55Ratios = provider => provider === "atlas" ? seedream55AspectRatios.filter(ratio => sizes["2K"][ratio]) : seedream55AspectRatios;

export function migrateSeedreamModel(value) {
  return ["Seedream 5.0 Pro", "Seedream 5.0", "Seedream 5 Pro"].includes(value) ? seedream55ModelName : value;
}

export function migrateSeedreamSettings(data) {
  if (!data || typeof data !== "object") return data;
  let result = data;
  for (const key of ["model", "characterSheetModel", "autoAspectModel", "frameItImageModel", "favoriteImageModel"]) {
    const value = migrateSeedreamModel(data[key]);
    if (value !== data[key]) { if (result === data) result = { ...data }; result[key] = value; }
  }
  return result;
}

export function migrateSeedreamPreferences(values = {}) {
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    const model = migrateSeedreamModel(key);
    if (model === key || !Object.hasOwn(values, model)) result[model] = value;
  }
  return result;
}

function fail(message) {
  throw Object.assign(new Error(`${seedream55ModelName}: ${message}`), { status: 400 });
}

export function seedream55Size({ resolution = "2K", aspectRatio = "16:9", provider = "fal" } = {}) {
  if (!["fal", "atlas"].includes(provider)) fail("requires Fal or Atlas Cloud. Krea does not currently offer Seedream 5.5.");
  if (!seedream55ResolutionOptions.includes(String(resolution).toUpperCase())) fail("choose 1K or 2K resolution; 4K is not supported.");
  if (!seedream55Ratios(provider).includes(aspectRatio)) fail(`choose a supported ${provider === "atlas" ? "Atlas Cloud " : ""}aspect ratio.`);
  const preset = sizes[String(resolution).toUpperCase()][aspectRatio];
  if (preset) return { width: preset[0], height: preset[1] };
  const [w, h] = aspectRatio.split(":").map(Number);
  const pixels = String(resolution).toUpperCase() === "1K" ? 1024 ** 2 : 2048 ** 2;
  return { width: Math.round(Math.sqrt(pixels * w / h)), height: Math.round(Math.sqrt(pixels * h / w)) };
}

export function validateSeedream55Request({ prompt, images = [], resolution, aspectRatio, provider = "fal", maskUrl = "", background = "auto" } = {}) {
  if (typeof prompt !== "string" || !prompt.trim()) fail("a prompt is required.");
  if (!Array.isArray(images) || images.length > 10 || images.some(image => typeof image !== "string" || !image.trim())) fail("use at most 10 reference images. Remove extra references before running.");
  if (maskUrl) fail("pixel edit masks are not supported. Use Image 2.6 Sunburst with Fal for masked editing.");
  if (!["auto", "opaque", "transparent"].includes(background)) fail("choose Auto, Opaque, or Transparent background.");
  return seedream55Size({ resolution, aspectRatio, provider });
}

export function buildSeedream55FalInput(options) {
  const image_size = validateSeedream55Request({ ...options, provider: "fal" });
  return { prompt: options.prompt, image_size, num_images: 1, output_format: "png", enable_safety_checker: true,
    sync_mode: false, background: options.background || "auto",
    ...(options.images?.length ? { image_urls: [...options.images] } : {}) };
}

export function seedream55Cost({ provider = "fal", referenceCount = 0 } = {}) {
  const endpoint = provider === "atlas" ? `${seedream55AtlasBase}/${referenceCount ? "edit" : "text-to-image"}`
    : provider === "fal" ? seedream55FalEndpoint(referenceCount) : "";
  // Fal's listing currently has a pending/zero placeholder, not a verified free rate.
  return { amountUsd: null, currency: "USD", unit: "image", units: 1, mediaType: "image", estimated: true,
    pricingStatus: "unavailable", endpoint, pricingBasis: "Seedream 5.5 needs a verified provider quote or settled charge; cost is unknown." };
}
