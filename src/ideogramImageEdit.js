export const ideogramImageEditModel = "Ideogram 4.5";
export const ideogramImageEditEndpoint = "ideogram/v4.5/edit";
export const ideogramImageEditQualityOptions = ["very_low", "low", "medium", "high"];
export const ideogramImageEditPrecisionOptions = ["regular", "high"];

const fail = (message) => { throw Object.assign(new Error(message), { status: 400 }); };

export function validateIdeogramImageEditRequest({ prompt, quality = "high", editPrecision = "regular", referenceCount = 0, hasMask = false } = {}) {
  if (typeof prompt !== "string" || !prompt.trim() || prompt.length > 10000)
    fail("Ideogram 4.5 needs a prompt between 1 and 10,000 characters, including editing instructions. Shorten the edit brief.");
  if (!ideogramImageEditQualityOptions.includes(quality)) fail("Choose a valid Ideogram 4.5 quality.");
  if (!ideogramImageEditPrecisionOptions.includes(editPrecision)) fail("Choose Regular or High edit precision for Ideogram 4.5.");
  const maximum = hasMask ? 3 : 4;
  if (!Number.isInteger(referenceCount) || referenceCount < 0 || referenceCount > maximum)
    fail(`Ideogram 4.5 accepts up to ${maximum} guide references${hasMask ? " with a mask" : ""}, in addition to the source image.`);
}

export function buildIdeogramImageEditFalRequest({ prompt, quality = "high", editPrecision = "regular", imageUrls = [], maskUrl } = {}) {
  if (!Array.isArray(imageUrls) || !imageUrls.length || imageUrls.some((url) => typeof url !== "string" || !url.trim()))
    fail("Ideogram 4.5 needs a source image and valid guide references.");
  validateIdeogramImageEditRequest({ prompt, quality, editPrecision, referenceCount: imageUrls.length - 1, hasMask: Boolean(maskUrl) });
  return { endpoint: ideogramImageEditEndpoint,
    input: { prompt, image_url: imageUrls[0], ...(imageUrls.length > 1 ? { reference_image_urls: imageUrls.slice(1) } : {}),
      ...(maskUrl ? { mask_url: maskUrl } : {}), edit_precision: editPrecision, quality,
      image_size: "auto", num_images: 1, sync_mode: false } };
}

export function ideogramImageEditCost({ provider = "fal.ai", endpoint = ideogramImageEditEndpoint, quality, editPrecision, size } = {}) {
  return { amountUsd: null, currency: "USD", unit: "image", units: 1, mediaType: "image", model: ideogramImageEditModel,
    provider, endpoint, quality, editPrecision, size,
    pricingBasis: "Ideogram 4.5 edit pricing varies by quality and precision; the Fal per-image charge is not yet verified.",
    pricingSource: "ideogram-4.5-fal-edit-docs-2026-10-04" };
}
