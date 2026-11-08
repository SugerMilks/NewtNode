export const openAiImage26Models = Object.freeze({
  sunburst: "OpenAI Image 2.6 Sunburst",
  flare: "OpenAI Image 2.6 Flare"
});
export const openAiImage26QualityOptions = ["low", "medium", "high"];
export const openAiImage26KreaQualityOptions = [...openAiImage26QualityOptions, "xhigh", "max"];
export function openAiImage26Qualities(provider) { return provider === "krea" ? openAiImage26KreaQualityOptions : openAiImage26QualityOptions; }
// Live Fal and Krea OpenAPI schemas verified 2026-11-04. Atlas has no published 2.6 route yet.
export const openAiImage26KreaAspectRatios = ["16:9", "2:1", "3:2", "4:3", "1:1", "3:4", "2:3", "1:2", "9:16"];
export const openAiImage26KreaResolutionOptions = ["1K", "2K", "4K"];
export const openAiImage26BackgroundOptions = ["auto", "opaque", "transparent"];

export function openAiImage26Variant(model) {
  const value = String(model || "").trim().toLowerCase();
  return /(?:^|\/)gpt-image-2\.6[/-](sunburst|flare)(?:\/(?:edit|text-to-image))?$/.exec(value)?.[1]
    || /^(?:openai|gpt) image 2\.6 (sunburst|flare)$/.exec(value)?.[1] || "";
}

export function migrateOpenAiImageModel(value) {
  const legacy = typeof value === "string" ? value.replace(/([ -]image[ -]2\.)5(?=[ /-])/i, "$16") : value;
  const variant = openAiImage26Variant(legacy);
  return variant ? openAiImage26Models[variant] : value;
}

export function migrateOpenAiImageSettings(data = {}) {
  const patch = {};
  // Only current selections, never saved outputs, billed history or in-flight receipts.
  for (const key of ["model", "characterSheetModel", "autoAspectModel", "frameItImageModel", "favoriteImageModel"]) {
    if (Object.hasOwn(data, key)) patch[key] = migrateOpenAiImageModel(data[key]);
  }
  return { ...data, ...patch };
}

export function migrateOpenAiImagePreferences(values = {}) {
  const next = { ...values };
  for (const [oldName, enabled] of Object.entries(values)) {
    const name = migrateOpenAiImageModel(oldName);
    if (name !== oldName) { if (!Object.hasOwn(values, name)) next[name] = enabled; delete next[oldName]; }
  }
  return next;
}

export function isOpenAiImage26Model(model) { return Boolean(openAiImage26Variant(model)); }
export function normalizeOpenAiImage26Quality(value, provider = "krea") {
  const quality = String(value || "").toLowerCase();
  return openAiImage26Qualities(provider).includes(quality) ? quality : "high";
}
export function normalizeOpenAiImage26Background(value) {
  return openAiImage26BackgroundOptions.includes(value) ? value : "auto";
}

export function openAiImage26KreaSelection(data = {}) {
  const [width, height] = String(data.aspectRatio || "16:9").split(":").map(Number);
  const ratio = width > 0 && height > 0 ? width / height : 16 / 9;
  const distance = value => { const [w, h] = value.split(":").map(Number); return Math.abs(Math.log(ratio / (w / h))); };
  const aspectRatio = data.aspectRatio === "Auto" ? "Auto" : openAiImage26KreaAspectRatios.includes(data.aspectRatio)
    ? data.aspectRatio : openAiImage26KreaAspectRatios.reduce((best, value) => distance(value) < distance(best) ? value : best);
  const resolution = String(data.resolution || "2K").toUpperCase();
  return { resolution: openAiImage26KreaResolutionOptions.includes(resolution) ? resolution : "2K", aspectRatio, quality: normalizeOpenAiImage26Quality(data.quality),
    background: openAiImage26Variant(data.model) === "sunburst" ? "auto" : normalizeOpenAiImage26Background(data.background) };
}

export function validateOpenAiImage26KreaRequest({ model, resolution, aspectRatio, referenceCount = 0, background, editMaskDataUrl } = {}) {
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!openAiImage26KreaResolutionOptions.includes(String(resolution || "2K").toUpperCase()) || !openAiImage26KreaAspectRatios.includes(aspectRatio))
    fail(`Krea GPT Image 2.6 supports 1K, 2K or 4K in ${openAiImage26KreaAspectRatios.join(", ")}. Choose a supported format or enable Fal for other ratios.`);
  if (referenceCount > 10) fail("Krea GPT Image 2.6 accepts up to 10 reference images. Remove extra references before running.");
  if (editMaskDataUrl) fail("Krea GPT Image 2.6 does not currently accept edit masks. Enable Fal for a masked edit.");
  if (openAiImage26Variant(model) === "sunburst" && background && background !== "auto")
    fail("Krea Sunburst does not currently offer a background setting. Use Auto or enable Fal.");
}

export function buildOpenAiImage26FalRequest({ model, prompt, size, quality, imageUrls = [], maskUrl, background } = {}) {
  const variant = openAiImage26Variant(model);
  const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };
  if (!variant) fail("Choose GPT Image 2.6 Sunburst or Flare.");
  if (String(prompt || "").trim().length < 2 || String(prompt).length > 32000) fail("GPT Image 2.6 needs a prompt between 2 and 32,000 characters.");
  if (imageUrls.length > 16) fail("Fal GPT Image 2.6 accepts up to 16 reference images. Remove extra references before running.");
  if (maskUrl && !imageUrls.length) fail("An edit mask needs a reference image.");
  const [width, height] = String(size || "").split("x").map(Number);
  if (![width, height].every((v) => Number.isInteger(v) && v > 0 && v <= 3840 && v % 16 === 0)
    || Math.max(width / height, height / width) > 3 || width * height < 655360 || width * height > 8294400)
    fail("GPT Image 2.6 requires valid image dimensions up to 4K.");
  return {
    endpoint: `openai/gpt-image-2.6/${variant}/${imageUrls.length ? "edit" : "text-to-image"}`,
    input: { prompt, image_size: { width, height }, quality: normalizeOpenAiImage26Quality(quality, "fal"),
      background: normalizeOpenAiImage26Background(background), num_images: 1, output_format: "png", sync_mode: false,
      ...(imageUrls.length ? { image_urls: imageUrls } : {}), ...(maskUrl ? { mask_url: maskUrl } : {}) }
  };
}

export function openAiImage26Cost({ model, provider, endpoint, resolution, size, quality } = {}) {
  // Never reuse an older model's fixed per-image estimate for variable token billing.
  return { amountUsd: null, currency: "USD", unit: "image", units: 1, mediaType: "image", model,
    provider, endpoint, resolution, size, quality,
    pricingBasis: "Variable token-based cost; GPT Image 2.6 per-image estimate is not yet verified.",
    pricingSource: "gpt-image-2.6-provider-docs-2026-11-04" };
}
