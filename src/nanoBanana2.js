export const nanoBanana2FalTextEndpoint = "fal-ai/nano-banana-2";
export const nanoBanana2FalEditEndpoint = "fal-ai/nano-banana-2/edit";
export const nanoBanana2ThinkingLevel = "high";
export const nanoBanana2ResolutionOptions = ["2K", "1K", "4K", "0.5K"];

export const nanoBanana2Costs = Object.freeze({
  "0.5K": 0.062,
  "1K": 0.082,
  "2K": 0.122,
  "4K": 0.162
});

export function isNanoBanana2Model(model) {
  const normalized = String(model || "").trim().toLowerCase().replace(/[-_]+/g, " ");
  return normalized.includes("nano banana 2") || normalized.includes("gemini 3.1 flash image");
}

export function normalizeNanoBanana2Resolution(value) {
  const normalized = String(value || "2K").trim().toUpperCase();
  if (normalized === "0.5K" || normalized === "512") return "0.5K";
  return nanoBanana2ResolutionOptions.includes(normalized) ? normalized : "2K";
}

export function estimateNanoBanana2Cost(resolution) {
  return nanoBanana2Costs[normalizeNanoBanana2Resolution(resolution)];
}

export function buildNanoBanana2FalInput({ prompt, aspectRatio = "16:9", resolution = "2K", imageUrls = [] }) {
  const cleanImageUrls = Array.isArray(imageUrls) ? imageUrls.filter(Boolean).slice(0, 14) : [];
  return {
    prompt: String(prompt || "").trim(),
    num_images: 1,
    aspect_ratio: String(aspectRatio || "16:9"),
    output_format: "png",
    resolution: normalizeNanoBanana2Resolution(resolution),
    limit_generations: true,
    thinking_level: nanoBanana2ThinkingLevel,
    ...(cleanImageUrls.length ? { image_urls: cleanImageUrls } : {})
  };
}
