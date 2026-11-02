import { applyPricingQuote } from "./pricingCatalog.js";

// Verified against the Fal, Krea, and Atlas Cloud Kling 4 schemas on 2026-10-31.
export const kling4ModelName = "Kling 4";
export const kling4DurationOptions = Array.from({ length: 28 }, (_, index) => `${index + 3} seconds`);
export const kling4ResolutionOptions = ["1080p", "720p"];
export const kling4AspectRatioOptions = ["16:9", "9:16", "1:1", "21:9"];
export const kling4FalEndpoints = Object.freeze({
  text: "kling/v4/text-to-video",
  image: "kling/v4/image-to-video",
  reference: "kling/v4/reference-to-video"
});
export const kling4KreaEndpoint = "/generate/video/kling/kling-4";
export const kling4AtlasEndpoints = Object.freeze({
  text: "kwaivgi/kling-v4.0/text-to-video",
  image: "kwaivgi/kling-v4.0/image-to-video",
  reference: "kwaivgi/kling-v4.0/reference-to-video"
});

export function isKling4Model(model) {
  return /^kling\s*(?:v)?4(?:\.0)?$/i.test(String(model || "").trim());
}

function invalid(message) {
  throw Object.assign(new Error(`Kling 4: ${message}`), { status: 400 });
}

function durationSeconds(value = 5) {
  const match = String(value).trim().match(/^(\d+)(?:\s+seconds?)?$/i);
  const seconds = match ? Number(match[1]) : NaN;
  if (!Number.isInteger(seconds) || seconds < 3 || seconds > 30) invalid("duration must be a whole number from 3 to 30 seconds.");
  return seconds;
}

function resolutionValue(value = "1080p") {
  const resolution = String(value).trim().toLowerCase();
  if (!kling4ResolutionOptions.includes(resolution)) invalid("choose 720p or 1080p resolution.");
  return resolution;
}

function referenceList(value, label, maximum) {
  if (!Array.isArray(value) || value.some(url => typeof url !== "string" || !url.trim())) invalid(`${label} must contain valid media URLs.`);
  if (value.length > maximum) invalid(`${label} accepts at most ${maximum} file${maximum === 1 ? "" : "s"}. No references have been discarded.`);
  return value;
}

export function validateKling4Request({ prompt, duration = 5, resolution = "1080p", aspectRatio = "16:9",
  startFrames = [], endFrames = [], images = [], videos = [], audio = [], provider = "fal", generateAudio } = {}) {
  if (!["fal", "krea", "atlas"].includes(provider)) invalid("enable Fal, Krea, or Atlas Cloud.");
  if (typeof prompt !== "string" || !prompt.trim()) invalid("a prompt is required.");
  if (prompt.length > 26000) invalid("the complete prompt must not exceed 26,000 characters.");
  if (provider === "atlas" && prompt.length > 11000 && /[^\x00-\x7f]/.test(prompt)) invalid("Atlas prompts containing non-ASCII text must not exceed 11,000 characters in this integration.");
  referenceList(startFrames, "Start Frame", 1);
  referenceList(endFrames, "End Frame", 1);
  referenceList(images, "Reference Images and Character references", 10);
  referenceList(videos, "Reference Videos", 5);
  referenceList(audio, "Reference Audio", 0);
  if (generateAudio === false) invalid("the provider does not expose a silent-output toggle for this model.");
  if (provider !== "krea" && startFrames.length + endFrames.length + images.length > 10) {
    invalid(`${provider === "atlas" ? "Atlas Cloud" : "Fal"} accepts at most 10 images including Start Frame, End Frame, and Character references. No references have been discarded.`);
  }
  if (provider === "krea" && endFrames.length && (!startFrames.length || images.length || videos.length)) invalid("Krea End Frame requires Start Frame and cannot be combined with reference images or videos.");
  const ratio = String(aspectRatio).trim().match(/^(16:9|9:16|1:1|21:9)(?:\s+\([^)]*\))?$/)?.[1];
  if (!ratio) invalid("choose 16:9, 9:16, 1:1, or 21:9 aspect ratio.");
  return { prompt: prompt.trim(), durationSeconds: durationSeconds(duration), resolution: resolutionValue(resolution), aspectRatio: ratio,
    routeKind: images.length || videos.length || endFrames.length && !startFrames.length ? "reference" : startFrames.length ? "image" : "text" };
}

export function buildKling4Input(options = {}) {
  const normalized = validateKling4Request(options);
  const { provider = "fal", startFrames = [], endFrames = [], images = [], videos = [] } = options;
  const input = { prompt: normalized.prompt, duration: normalized.durationSeconds, resolution: normalized.resolution };
  if (provider === "krea") {
    const urls = [...startFrames, ...endFrames, ...images, ...videos];
    if (urls.some(url => url.length > 1024 || !/^(?:https?:|data:)/i.test(url))) invalid("Krea media URLs must be valid URIs no longer than 1,024 characters.");
    input.aspect_ratio = normalized.aspectRatio;
    if (startFrames.length) input.start_image = startFrames[0];
    if (endFrames.length) input.end_image = endFrames[0];
    if (images.length) input.reference_images = images;
    if (videos.length) input.reference_videos = videos;
    return { endpoint: kling4KreaEndpoint, input };
  }
  if (provider === "atlas") {
    const endpoint = kling4AtlasEndpoints[normalized.routeKind];
    input.model = endpoint;
    if (normalized.routeKind !== "image") input.aspect_ratio = normalized.aspectRatio;
    if (startFrames.length) input.image = startFrames[0];
    if (endFrames.length) input.last_image = endFrames[0];
    if (images.length) input.reference_images = images;
    if (videos.length) input.reference_videos = videos;
    return { endpoint, input };
  }
  if (normalized.routeKind !== "image") input.aspect_ratio = normalized.aspectRatio;
  if (startFrames.length) input.start_image_url = startFrames[0];
  if (endFrames.length) input.end_image_url = endFrames[0];
  if (images.length) input.image_urls = images;
  if (videos.length) input.video_urls = videos;
  return { endpoint: kling4FalEndpoints[normalized.routeKind], input };
}

// Only rewrite names of actually supplied references; never cascade substitutions.
// Atlas numbers additional images after the supplied keyframes.
export function rewriteKling4ReferenceMentions(prompt, { images = [], videos = [], provider = "fal", startFrames = [], endFrames = [] } = {}) {
  const imageOffset = provider === "atlas" ? startFrames.length + endFrames.length : 0;
  const references = [
    ...images.map((item, index) => ({ ...item, target: provider === "atlas" ? `@image_${index + imageOffset + 1}` : `@Image${index + 1}` })),
    ...videos.map((item, index) => ({ ...item, target: provider === "atlas" ? `@video_${index + 1}` : `@Video${index + 1}` }))
  ];
  const byLabel = new Map();
  for (const item of references) for (const raw of [item.label, ...(item.aliases || [])]) {
    const label = String(raw || "").trim().replace(/^@+/, "").toLowerCase();
    if (!label) continue;
    if (byLabel.has(label) && byLabel.get(label) !== item.target) invalid(`reference name @${label} is ambiguous. Give each reference a unique name.`);
    byLabel.set(label, item.target);
  }
  const names = [...byLabel.keys()].sort((a, b) => b.length - a.length).map(name => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const rewritten = names.length ? String(prompt).replace(new RegExp(`(?<![\\p{L}\\p{N}._%+-])@(${names.join("|")})(?![\\p{L}\\p{N}_-])`, "giu"), (_match, name) => byLabel.get(name.toLowerCase())) : String(prompt);
  const allowed = new Set(references.map(item => item.target.toLowerCase()));
  if (provider === "atlas") for (let index = 1; index <= imageOffset; index++) allowed.add(`@image_${index}`);
  for (const [tag] of rewritten.matchAll(/(?<![\p{L}\p{N}._%+-])@[\p{L}\p{N}_-]+/gu)) {
    if (!allowed.has(tag.toLowerCase())) invalid(`reference tag ${tag} has no matching supplied image or video. Reconnect the reference or correct the tag before generating.`);
  }
  return rewritten;
}

export function estimateKling4Cost({ provider = "fal", duration = 5, resolution = "1080p", endpoint = "",
  hasVideoReference = false, referenceVideoDurationSeconds = null } = {}) {
  let seconds;
  let size;
  try { seconds = durationSeconds(duration); size = resolutionValue(resolution); } catch { return { amountUsd: null, currency: "USD", estimated: true, pricingStatus: "unavailable", pricingBasis: "Unsupported Kling 4 billing settings." }; }
  const supported = provider === "fal" || provider === "krea";
  const videoBilling = provider === "fal" && hasVideoReference;
  const inputSeconds = referenceVideoDurationSeconds == null ? null : Number(referenceVideoDurationSeconds);
  const billableSeconds = videoBilling ? Number.isFinite(inputSeconds) && inputSeconds > 0 ? Math.max(seconds + inputSeconds, 2 * seconds) : null : seconds;
  const unitRateUsd = supported ? videoBilling ? size === "720p" ? 0.094 : 0.141 : size === "720p" ? 0.157 : 0.235 : null;
  const cost = { amountUsd: supported && billableSeconds != null ? Math.round(unitRateUsd * billableSeconds * 1e6) / 1e6 : null,
    currency: "USD", estimated: true, pricingStatus: supported && billableSeconds != null ? "bundled" : "unavailable",
    unitRateUsd, units: billableSeconds, unit: "second", mediaType: "video", durationSeconds: seconds, resolution: size,
    pricingSource: provider === "atlas" ? "https://www.atlascloud.ai/models/kwaivgi/kling-v4.0/reference-to-video" : provider === "krea" ? "https://www.krea.ai/docs/api-reference/video/kling-40" : "https://fal.ai/models/kling/v4/reference-to-video",
    pricingCheckedAt: "2026-10-31T00:00:00Z",
    pricingBasis: !supported ? "Atlas Cloud Kling 4 full request pricing is unverified; retain unknown cost until a request-specific charge is available."
      : videoBilling ? "Fal Kling 4 video-reference estimate: input plus output seconds, minimum twice output duration; input duration is required."
      : `${provider === "krea" ? "Krea" : "Fal"} Kling 4 published output-second estimate; not a settled charge.`, endpoint };
  return provider === "krea" ? applyPricingQuote(cost, "krea", kling4KreaEndpoint, { duration: seconds, resolution: size }) : cost;
}
