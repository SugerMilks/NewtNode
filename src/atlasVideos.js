// Atlas schemas checked 2026-09-10; these IDs are not Kling v3 aliases.
// https://www.atlascloud.ai/docs/en/openapi-index
// https://www.atlascloud.ai/docs/more-models/bytedance/seedance-2.5-reference-to-video/generateVideo
// https://www.atlascloud.ai/docs/more-models/minimax/h3-reference-to-video/generateVideo
// https://www.atlascloud.ai/docs/more-models/kwaivgi/kling-video-o3-pro-reference-to-video/generateVideo
// https://www.atlascloud.ai/docs/more-models/kwaivgi/kling-video-o3-4k-image-to-video/generateVideo
const models = new Map([
  ["seedance 2.0", { id: "bytedance/seedance-2.0", family: "seedance", version: "2.0", limits: [9, 3, 3] }],
  ["seedance 2.5", { id: "bytedance/seedance-2.5", family: "seedance", version: "2.5", limits: [30, 10, 10] }],
  ["minimax h3", { id: "minimax/h3", family: "minimax", limits: [9, 3, 3] }]
]);
// O3 IDs exist, but Atlas only documents <<<element_N>>> for elements[], not
// mention bindings for this interface's flattened images[]/video references.
// Exclude both models from initial routing rather than change Director context.
const excludedKlingModels = new Set(["kling o3 pro", "kling o3 4k"]);
const ratios = ["16:9", "4:3", "1:1", "3:4", "9:16", "21:9"];
const seedance20Resolutions = ["480p", "720p", "720p-SR", "1080p", "1080p-SR", "1440p-SR", "4k"];
const seedance25Resolutions = ["480p", "720p", "720p-sr", "720p-esr", "1080p", "1080p-sr", "1080p-esr", "1080p-esr & 60fps", "1440p-sr", "1440p-esr", "4k-esr"];

export function supportsAtlasVideoModel(name) {
  return models.has(modelKey(name));
}

// Pure preflight: no uploads, credentials, network calls, clamping, or truncation.
// The caller must probe actual media size/duration/dimensions before uploading;
// URL strings (including local assets/preflight placeholders) cannot establish
// those limits. Local URLs are for preflight only; upload before sending the body.
export function buildAtlasVideoRequest({
  model, prompt, startImage = "", endImage = "", images = [], videos = [], audios = [],
  aspectRatio, duration, resolution, generateAudio = true, seed, ...unsupported
} = {}) {
  if (excludedKlingModels.has(modelKey(model))) {
    fail("Atlas Kling O3 is excluded from this integration until direct image/video reference mention syntax is verified. Documented <<<element_N>>> tokens require elements[], not images[]. Kling v3 will not be substituted.");
  }
  const spec = models.get(modelKey(model));
  if (!spec) fail(`Unsupported Atlas video model: ${String(model)}. Kling v3 is not an alias for O3.`);
  const unsupportedFields = Object.keys(unsupported).filter((field) => unsupported[field] !== undefined);
  if (unsupportedFields.length) fail(`Unsupported Atlas video settings: ${unsupportedFields.join(", ")}.`);
  if (typeof generateAudio !== "boolean") fail("Atlas generateAudio must be a boolean.");
  if (prompt !== undefined && typeof prompt !== "string") fail("Atlas prompt must be a string.");
  const first = startImage === "" ? "" : mediaUrl(startImage, "startImage");
  const last = endImage === "" ? "" : mediaUrl(endImage, "endImage");
  const refs = {
    images: mediaList(images, "images"),
    videos: mediaList(videos, "videos"),
    audios: mediaList(audios, "audios")
  };
  const hasReferences = Object.values(refs).some((items) => items.length);
  if (last && !first) fail("Atlas endImage requires startImage.");
  if (first && hasReferences) fail("Atlas frame inputs and reference inputs cannot be combined by this adapter. Disconnect one set; no inputs will be dropped.");
  Object.entries(refs).forEach(([kind, items], index) => {
    if (items.length > spec.limits[index]) fail(`Atlas ${model} supports at most ${spec.limits[index]} ${kind}; received ${items.length}.`);
  });
  const route = first ? "image-to-video" : hasReferences ? "reference-to-video" : "text-to-video";
  const hasPrompt = typeof prompt === "string" && prompt.trim().length > 0;
  if (!hasPrompt && (spec.family !== "seedance" || route === "text-to-video")) fail(`Atlas ${model} requires a nonempty prompt.`);
  const request = { model: `${spec.id}/${route}` };
  if (hasPrompt) request.prompt = prompt;
  if (seed !== undefined && !(spec.family === "seedance" && spec.version === "2.0")) {
    fail(`Atlas ${model} does not document a seed setting.`);
  }

  if (spec.family === "seedance") {
    const is25 = spec.version === "2.5";
    if (!is25 && refs.audios.length && !refs.images.length && !refs.videos.length) {
      fail("Atlas Seedance 2.0 audio references require an image or video reference.");
    }
    request.duration = videoDuration(duration, 4, is25 ? 30 : 15, 5, true);
    request.resolution = choice(resolution, is25 ? seedance25Resolutions : seedance20Resolutions, "720p", "resolution");
    request.ratio = aspect(aspectRatio, is25 && first ? ["adaptive"] : [...ratios, "adaptive"], first ? "adaptive" : "16:9");
    request.generate_audio = generateAudio;
    if (seed !== undefined) {
      const value = integer(seed, "seed");
      if (value < -1 || value > 4294967295) fail("Atlas Seedance 2.0 seed must be between -1 and 4294967295.");
      request.seed = value;
    }
    if (first) request.image = first;
    if (last) request.last_image = last;
    if (refs.images.length) request.reference_images = refs.images;
    if (refs.videos.length) request.reference_videos = refs.videos;
    if (refs.audios.length) request.reference_audios = refs.audios;
    if (hasPrompt) request.prompt = seedanceMentions(prompt, refs, is25);
    // NewtNode's reference route generates a new clip, not an implicit edit/extend.
    if (is25 && hasReferences) request.omni_reference_task_type = "reference";
    return request;
  }

  if (spec.family === "minimax") {
    if (refs.images.length + refs.videos.length + refs.audios.length > 12) fail("Atlas MiniMax H3 supports at most 12 reference files in total.");
    if (refs.audios.length && !refs.images.length && !refs.videos.length) fail("Atlas MiniMax H3 audio references require an image or video reference.");
    if (!generateAudio) fail("Atlas MiniMax H3 has native audio but no documented disable-audio field. Handle silent output separately before selecting this request.");
    // Live /models pages add 480P, but /docs OpenAPI does not; use their intersection.
    if (typeof resolution === "string" && resolution.trim().toUpperCase() === "480P") {
      fail("Atlas MiniMax H3 480P is disputed between official model and OpenAPI pages. Use 768P or 2K until confirmed.");
    }
    request.resolution = choice(resolution, ["768P", "2K"], "2K", "resolution");
    request.duration = videoDuration(duration, 4, 15, 8);
    request.ratio = aspect(aspectRatio, first ? ["adaptive"] : hasReferences ? [...ratios, "adaptive"] : ratios, first || hasReferences ? "adaptive" : "16:9");
    request.prompt_expansion = false;
    if (first) request.image = first;
    if (last) request.end_image = last;
    if (hasReferences) {
      request.refers = Object.entries(refs).flatMap(([kind, urls]) => urls.map((url) => ({ url, type: kind === "images" ? "image" : kind === "videos" ? "video" : "audio" })));
    }
    return request;
  }

  fail(`Unsupported Atlas video family: ${spec.family}.`);
}

function modelKey(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function fail(message) {
  throw Object.assign(new Error(message), { status: 400 });
}

function choice(value, options, fallback, field) {
  if (value === undefined) return fallback;
  const selected = typeof value === "string" && options.find((option) => option.toLowerCase() === value.trim().toLowerCase());
  if (!selected) fail(`Atlas ${field} must be one of: ${options.join(", ")}.`);
  return selected;
}

function aspect(value, options, fallback) {
  if (value === undefined) return fallback;
  let normalized = value;
  if (typeof value === "string") {
    normalized = value.trim().replace(/\s+\((?:Landscape|Portrait)\)$/i, "");
    if (/^auto$/i.test(normalized)) normalized = "adaptive";
  }
  return choice(normalized, options, fallback, "aspectRatio");
}

function integer(value, field) {
  const parsed = typeof value === "number" ? value : typeof value === "string" && /^-?\d+$/.test(value.trim()) ? Number(value.trim()) : NaN;
  if (!Number.isSafeInteger(parsed)) fail(`Atlas ${field} must be an integer.`);
  return parsed;
}

function videoDuration(value, minimum, maximum, fallback, auto = false) {
  if (value === undefined) return fallback;
  if (auto && typeof value === "string" && /^auto$/i.test(value.trim())) return -1;
  const seconds = integer(typeof value === "string" ? value.trim().replace(/\s+seconds?$/i, "") : value, "duration");
  if (auto && seconds === -1) return -1;
  if (seconds < minimum || seconds > maximum) fail(`Atlas duration must be ${minimum}-${maximum} seconds${auto ? " or Auto (-1)" : ""}.`);
  return seconds;
}

function mediaList(value, field) {
  if (!Array.isArray(value)) fail(`Atlas ${field} must be an array of URLs.`);
  return Array.from(value, (url, index) => mediaUrl(url, `${field}[${index}]`));
}

function mediaUrl(value, field) {
  if (typeof value !== "string" || value !== value.trim() || /[\u0000-\u001f\u007f]/.test(value)) fail(`Atlas ${field} must be a local asset URL or an absolute HTTP(S) URL.`);
  if (/^\/(?:outputs|uploads|storyboard|workflow-assets)\/.+/.test(value)) return value;
  if (!/^https?:\/\//i.test(value)) fail(`Atlas ${field} must be a local asset URL or an absolute HTTP(S) URL.`);
  let url;
  try { url = new URL(value); } catch { fail(`Atlas ${field} must be a valid URL.`); }
  if (url.username || url.password || ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.hostname.endsWith(".localhost")) {
    fail(`Atlas ${field} must be a public URL without credentials.`);
  }
  return value;
}

function seedanceMentions(prompt, refs, is25) {
  // Accept the caller's Fal-style [Image1], @Image1, Image1, or Image 1.
  // Atlas 2.5 requires @Image1; Atlas 2.0 documents plain "image 1".
  return prompt.replace(/(?<![\w@/])(?:\[(image|video|audio)\s*(\d+)\]|@(image|video|audio)\s*(\d+)(?![\w-])|(image|video|audio)\s*(\d+)(?![\w-]|\.\w))/gi,
    (_match, bracketType, bracketIndex, atType, atIndex, plainType, plainIndex) => {
      const type = (bracketType || atType || plainType).toLowerCase();
      const index = Number(bracketIndex || atIndex || plainIndex);
      if (!Number.isSafeInteger(index) || index < 1 || index > refs[`${type}s`].length) {
        fail(`Atlas reference ${type} ${index} has no matching ${type} input.`);
      }
      return is25 ? `@${type[0].toUpperCase()}${type.slice(1)}${index}` : `${type} ${index}`;
    });
}
