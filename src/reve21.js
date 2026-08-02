export const reve21FalTextEndpoint = "reve/2.1/text-to-image";
export const reve21FalEditEndpoint = "reve/2.1/edit";
export const reve21FalRemixEndpoint = "reve/2.1/remix";
export const reve21CostPerImage = 0.25;

export const reve21AspectRatios = [
  "4:1",
  "3:1",
  "21:9",
  "2:1",
  "17:9",
  "16:9",
  "3:2",
  "4:3",
  "5:4",
  "1:1",
  "4:5",
  "3:4",
  "2:3",
  "9:16",
  "1:2",
  "1:3",
  "1:4"
];

export const reve21ResolutionOptions = ["4K"];

export function isReve21Model(model) {
  const normalized = String(model || "").toLowerCase();
  return normalized.includes("reve") && (normalized.includes("2.1") || normalized.includes("21"));
}

export function normalizeReve21AspectRatio(value) {
  const ratio = String(value || "16:9").match(/\d+(?:\.\d+)?:\d+(?:\.\d+)?/)?.[0] || "16:9";
  return reve21AspectRatios.includes(ratio) ? ratio : "16:9";
}

export function reve21EndpointForReferenceCount(referenceCount) {
  if (Number(referenceCount) <= 0) return reve21FalTextEndpoint;
  if (Number(referenceCount) === 1) return reve21FalEditEndpoint;
  return reve21FalRemixEndpoint;
}

export function estimateReve21ImageCost({ endpoint } = {}) {
  return {
    amountUsd: reve21CostPerImage,
    currency: "USD",
    unitRateUsd: reve21CostPerImage,
    units: 1,
    unit: "image",
    mediaType: "image",
    resolution: "4K",
    pricingBasis: "REVE 2.1 fal.ai fixed per-image price for generation, edit, and remix",
    pricingSource: "fal-pricing-api-2026-08-02",
    endpoint: String(endpoint || "")
  };
}

export function buildReve21FalRequest({ prompt, imageUrls = [], imageLabels = [], aspectRatio = "16:9" } = {}) {
  const references = imageUrls
    .map((url, index) => ({
      url: String(url || "").trim(),
      label: cleanReve21ReferenceLabel(imageLabels[index], index)
    }))
    .filter((item) => item.url)
    .slice(0, 8);
  const referenceCount = references.length;
  const endpoint = reve21EndpointForReferenceCount(referenceCount);
  const submittedPrompt = reve21PromptWithReferences(prompt, references);
  const input = {
    prompt: submittedPrompt,
    aspect_ratio: normalizeReve21AspectRatio(aspectRatio),
    num_images: 1,
    output_format: "png",
    sync_mode: false
  };

  if (referenceCount === 1) input.image_url = references[0].url;
  if (referenceCount > 1) input.image_urls = references.map((item) => item.url);

  return {
    endpoint,
    input,
    mode: referenceCount === 0 ? "generate" : referenceCount === 1 ? "edit" : "remix",
    referenceCount,
    referenceLabels: references.map((item) => item.label),
    submittedPrompt
  };
}

function reve21PromptWithReferences(prompt, references) {
  const cleanPrompt = String(prompt || "").trim();
  if (!references.length) return cleanPrompt;
  const setup = references.map((reference, index) => "<frame>" + index + "</frame> = " + reference.label + ".");
  return ["Reference setup:", ...setup, "", cleanPrompt].join("\n");
}

function cleanReve21ReferenceLabel(value, index) {
  const clean = String(value || "")
    .replace(/[\r\n]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
  return clean || "Reference " + (index + 1);
}
