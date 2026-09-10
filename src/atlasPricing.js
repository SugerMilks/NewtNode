import { getPricingCatalog, pricingQuote } from "./pricingCatalog.js";

export const ATLAS_PRICING_URL = "https://api.atlascloud.ai/api/v1/pricing/models";
export const ATLAS_PRICING_CHECKED_AT = "2026-09-10";
export const ATLAS_RULES_VERSION = 1;
const round = (value) => Math.round(value * 1e6) / 1e6;
const imageRatios = ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"];
const imageModels = {
  "Nano Banana 2": "google/nano-banana-2", "Nano Banana Pro": "google/nano-banana-pro",
  "REVE 2.1": "reve-ai/reve-2.1", "OpenAI Image 2": "openai/gpt-image-2",
  "OpenAI Image 2.5 Sunburst": "openai/gpt-image-2.5-sunburst",
  "OpenAI Image 2.5 Flare": "openai/gpt-image-2.5-flare"
};
const videoModels = { "Seedance 2.0": "bytedance/seedance-2.0", "Seedance 2.5": "bytedance/seedance-2.5", "MiniMax H3": "minimax/h3" };
const routeAliases = { t2i: "text-to-image", i2i: "edit", t2v: "text-to-video", i2v: "image-to-video", r2v: "reference-to-video" };

// Only these standard routes have sufficiently explicit, non-token billing rules.
export const atlasPricingSpecs = Object.fromEntries([
  ...["2", "pro"].flatMap((version) => ["text-to-image", "edit"].map((route) => [
    `google/nano-banana-${version}/${route}`,
    { kind: "image", resolutions: version === "2" ? { "1k": 0.08, "2k": 0.12, "4k": 0.16 } : { "1k": 0.14, "4k": 0.24 },
      imageSearch: version === "2", maxReferences: version === "2" ? 14 : 10 }
  ])),
  ...["text-to-video", "image-to-video", "reference-to-video"].map((route) => [
    `minimax/h3/${route}`, { kind: "video", resolutions: { "768p": 0.08, "2k": 0.13 }, reference: route === "reference-to-video" }
  ])
]);

export const atlasPricingEndpoints = [
  ...Object.keys(atlasPricingSpecs), "google/nano-banana-2/reference-to-image",
  ...["text-to-image", "edit", "remix"].map((route) => `reve-ai/reve-2.1/${route}`),
  ...["2", "2.5-sunburst", "2.5-flare"].flatMap((version) => ["text-to-image", "edit"].map((route) => `openai/gpt-image-${version}/${route}`)),
  ...["2.0", "2.5"].flatMap((version) => ["text-to-video", "image-to-video", "reference-to-video"].map((route) => `bytedance/seedance-${version}/${route}`))
];

export function atlasPriceRows(endpoint) {
  const spec = atlasPricingSpecs[endpoint];
  if (!spec) return [];
  if (spec.kind === "image") return Object.entries(spec.resolutions).flatMap(([resolution, amount]) =>
    [false, true].flatMap((web) => (spec.imageSearch ? [false, true] : [false]).map((search) => ({
      row_id: `resolution-${resolution}${web ? "-enable_web_search" : ""}${search ? "-enable_image_search" : ""}-total`,
      billing_unit: "/pic", price_role: web || search ? "total" : "base", estimated: false, requires_quote: true,
      official_price: String(round(amount + (web ? 0.014 : 0) + (search ? 0.014 : 0))),
      quote_defaults: { resolution, num_images: 1, enable_web_search: web, ...(spec.imageSearch ? { enable_image_search: search } : {}) }
    }))));
  const defaults = { duration: 5, prompt_expansion: false, resolution: "768p" };
  return [
    ...Object.entries(spec.resolutions).map(([resolution, amount]) => ({ row_id: resolution, billing_unit: "/s", price_role: "base",
      official_price: String(amount), quote_defaults: { ...defaults, resolution } })),
    ...(spec.reference ? [
      ...Object.entries(spec.resolutions).map(([resolution, amount]) => ({ row_id: `${resolution}-reference-video`, billing_unit: "/s", price_role: "addon",
        official_price: String(amount), quote_defaults: { ...defaults, resolution } })),
      { row_id: "reference-image-after-five", billing_unit: "/image", price_role: "addon", official_price: "0.04", quote_defaults: defaults }
    ] : []),
    { row_id: "prompt-expansion", billing_unit: "/request", price_role: "addon", official_price: "0.117", quote_defaults: { ...defaults, prompt_expansion: true } }
  ].map((row) => ({ ...row, estimated: false, requires_quote: true }));
}

export function atlasPricingEntry(endpoint, rows = atlasPriceRows(endpoint)) {
  const spec = atlasPricingSpecs[endpoint];
  if (!spec) return null;
  const points = [];
  if (spec.kind === "image") {
    for (const row of rows) points.push({ amount: Number(row.official_price), dimensions: row.quote_defaults });
  } else {
    const rate = (id) => Number(rows.find((row) => row.row_id === id)?.official_price);
    // Materialize exact request totals so per-request add-ons are never multiplied by duration.
    for (const resolution of Object.keys(spec.resolutions)) for (let duration = 4; duration <= 15; duration++) {
      for (const promptExpansion of [false, true]) for (let references = spec.reference ? 1 : 0; references <= (spec.reference ? 16 : 0); references++) {
        points.push({ amount: round(rate(resolution) * duration + (promptExpansion ? rate("prompt-expansion") : 0)
          + (spec.reference ? Math.max(0, references - 5) * rate("reference-image-after-five") : 0)),
        dimensions: { resolution, duration, promptExpansion, ...(spec.reference ? { referenceImageCount: references } : {}) } });
      }
    }
  }
  return { currency: "USD", unit: "request", source: ATLAS_PRICING_URL, priceKind: "standard", rulesVersion: ATLAS_RULES_VERSION, points };
}

const bundled = { version: 1, revision: `atlas-standard-${ATLAS_PRICING_CHECKED_AT}`, entries: Object.fromEntries(
  Object.keys(atlasPricingSpecs).map((endpoint) => [`atlas:${endpoint}`, { ...atlasPricingEntry(endpoint), checkedAt: ATLAS_PRICING_CHECKED_AT }])) };

function result(endpoint, basis, quote = null) {
  return { provider: "atlas", endpoint, currency: "USD", estimated: true, amountUsd: null,
    unit: "request", units: 1, mediaType: endpoint.includes("video") ? "video" : "image",
    pricingSource: ATLAS_PRICING_URL, ...quote, pricingBasis: basis };
}

function quoteCost(endpoint, dimensions, snapshot) {
  const current = snapshot ?? getPricingCatalog();
  const entry = current?.entries?.[`atlas:${endpoint}`];
  const source = entry ? current : bundled;
  if (entry && (entry.priceKind !== "standard" || entry.rulesVersion !== ATLAS_RULES_VERSION || entry.source !== ATLAS_PRICING_URL || entry.unit !== "request"))
    return result(endpoint, "Atlas standard billing rules are unverified; cost is unknown.");
  const quote = pricingQuote("atlas", endpoint, dimensions, 1, source);
  return result(endpoint, quote ? "Atlas Cloud published standard USD price for these exact billing settings; no promotional or account discount."
    : "Atlas has no verified standard price for these billing settings.", quote);
}

function endpointFor(options, models, fallback) {
  if (options.model != null && options.modelName != null && options.model !== options.modelName) return "";
  const model = options.model ?? options.modelName;
  const route = routeAliases[options.routeKind] ?? options.routeKind ?? fallback;
  if (typeof model !== "string") return "";
  if (model.includes("/")) return atlasPricingEndpoints.includes(model) && (!options.routeKind || model.endsWith(`/${route}`)) ? model : "";
  return models[model] ? `${models[model]}/${route}` : "";
}

const count = (value) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : NaN;
const flag = (value) => typeof value === "boolean" ? value : null;
const conflicting = (options, aliases) => aliases.some((names) => {
  const values = names.filter((key) => options[key] != null).map((key) => options[key]);
  return values.some((value) => value !== values[0]);
});

export function estimateAtlasImageCost(options = {}) {
  const references = count(options.referenceCount ?? options.images?.length ?? 0);
  const endpoint = endpointFor(options, imageModels, references > 0 ? "edit" : "text-to-image");
  const spec = atlasPricingSpecs[endpoint];
  if (spec?.kind !== "image") return result(endpoint, "Atlas route pricing is unavailable or token-billed; a fixed image cost is unknown.");
  const web = flag(options.enableWebSearch ?? options.enable_web_search ?? false);
  const search = flag(options.enableImageSearch ?? options.enable_image_search ?? false);
  const resolution = String(options.resolution ?? "").toLowerCase();
  const edit = endpoint.endsWith("/edit");
  if (!Number.isFinite(references) || (edit ? references < 1 || references > spec.maxReferences : references !== 0)
    || conflicting(options, [["enableWebSearch", "enable_web_search"], ["enableImageSearch", "enable_image_search"], ["numImages", "num_images", "n"]])
    || (options.images != null && (!Array.isArray(options.images) || options.images.length !== references))
    || web === null || search === null || (!spec.imageSearch && search)
    || (options.numImages ?? options.num_images ?? options.n ?? 1) !== 1
    || (options.videoClipCount ?? options.video_clips?.length ?? 0) !== 0 || options.hasVideoReference
    || options.size != null || (options.aspectRatio != null && !imageRatios.includes(options.aspectRatio)))
    return result(endpoint, "Atlas input settings are outside the verified image pricing contract.");
  return quoteCost(endpoint, { resolution, num_images: 1, enable_web_search: web,
    ...(spec.imageSearch ? { enable_image_search: search } : {}) }, options.snapshot);
}

export function estimateAtlasVideoCost(options = {}) {
  const references = count(options.referenceImageCount ?? 0);
  const startFrames = count(options.startFrameCount ?? 0);
  const hasVideo = flag(options.hasVideoReference ?? false);
  const endpoint = endpointFor(options, videoModels, startFrames === 1 ? "image-to-video"
    : hasVideo || references > 1 ? "reference-to-video" : references === 1 ? "image-to-video" : "text-to-video");
  const spec = atlasPricingSpecs[endpoint];
  if (spec?.kind !== "video") return result(endpoint, "Atlas video tokens and runtime billing are not a verified fixed request price; cost is unknown.");
  const text = String(options.durationSeconds ?? options.duration ?? "");
  const duration = /^(?:[4-9]|1[0-5])(?: seconds?)?$/.test(text) ? Number(text.split(" ")[0]) : NaN;
  const promptExpansion = flag(options.promptExpansion ?? options.prompt_expansion ?? false);
  const resolution = String(options.resolution ?? "").toLowerCase();
  if (!Number.isFinite(duration) || !Number.isFinite(references) || promptExpansion === null || hasVideo !== false
    || !Number.isFinite(startFrames) || startFrames > 1 || (startFrames && !endpoint.endsWith("/image-to-video"))
    || conflicting(options, [["promptExpansion", "prompt_expansion"]])
    || (options.referenceVideoDuration ?? 0) !== 0 || options.refers != null || options.video_urls?.length
    || (spec.reference ? references < 1 || references > 16 : endpoint.endsWith("/text-to-video") ? references !== 0 : references > 2))
    return result(endpoint, "Atlas video duration or reference billing is outside the verified contract; reference-video cost needs a runtime quote.");
  return quoteCost(endpoint, { resolution, duration, promptExpansion, ...(spec.reference ? { referenceImageCount: references } : {}) }, options.snapshot);
}
