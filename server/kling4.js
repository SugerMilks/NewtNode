import {
  buildKling4Input,
  estimateKling4Cost,
  kling4AtlasEndpoints,
  kling4FalEndpoints,
  kling4KreaEndpoint,
  kling4ModelName,
  rewriteKling4ReferenceMentions,
  validateKling4Request
} from "../src/kling4.js";
import { extractKreaJobResultUrl } from "../src/kreaApi.js";
import { createSingleSubmissionFalClient } from "./fal-single-submission.js";

const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
const array = (value, name) => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) fail(`Kling 4 ${name} must be a list.`);
  return value;
};

function references(urls, labels, name) {
  return array(urls, name).map((url, index) => ({ url, label: labels?.[index] || "" }));
}

function uniqueReferences(items) {
  const result = new Map();
  for (const item of items) {
    if (!item || typeof item.url !== "string" || !item.url) fail("Kling 4 has an invalid reference. Reconnect the source; no references were discarded.");
    const previous = result.get(item.url);
    const aliases = [...new Set([
      previous?.label, ...(previous?.aliases || []), item.label, ...(item.aliases || [])
    ].filter(label => typeof label === "string" && label.trim()))];
    result.set(item.url, { ...previous, ...item, label: item.label || previous?.label || "", aliases });
  }
  return [...result.values()];
}

export async function validateKling4Media({ provider, startFrames, endFrames, images, videos }, inspectAsset) {
  let totalVideoSeconds = 0;
  for (const [kind, urls] of [["image", [...startFrames, ...endFrames, ...images]], ["video", videos]]) {
    for (const [index, url] of urls.entries()) {
      const asset = await inspectAsset(url, kind);
      const label = `Kling 4 ${kind} reference ${index + 1}`;
      if (!asset?.mimeType?.startsWith(`${kind}/`)) fail(`${label} is not a ${kind} file.`);
      if (!(asset.width > 0 && asset.height > 0 && asset.bytes > 0)) fail(`${label} could not be inspected. Use a valid local ${kind} file.`);
      if (kind === "video") {
        if (!(Number.isFinite(asset.duration) && asset.duration > 0)) fail(`${label} has no readable duration.`);
        totalVideoSeconds += asset.duration;
      }
      if (provider === "krea") continue;
      if (provider === "atlas" && !(kind === "image" ? ["image/jpeg", "image/png"] : ["video/mp4", "video/quicktime"]).includes(asset.mimeType)) {
        fail(`${label} needs ${kind === "image" ? "JPG, JPEG or PNG" : "MP4 or MOV"} format for Atlas Cloud.`);
      }
      const maxBytes = (kind === "image" ? 30 : 300) * 1024 * 1024;
      if (asset.bytes > maxBytes) fail(`${label} exceeds ${provider === "atlas" ? "Atlas Cloud's" : "Fal's"} ${maxBytes / 1024 / 1024} MiB limit.`);
      const ratio = asset.width / asset.height;
      if (ratio < 0.4 || ratio > 2.5) fail(`${label} needs an aspect ratio between 0.4 and 2.5.`);
      if (kind === "image") {
        if (asset.width < 300 || asset.height < 300) fail(`${label} needs dimensions of at least 300 × 300 pixels.`);
      } else {
        if (!(asset.width >= 700 && asset.width <= 4553 && asset.height >= 700 && asset.height <= 4553)) fail(`${label} needs width and height between 700 and 4553 pixels.`);
        if (!(asset.duration >= 3 && asset.duration <= 30.05)) fail(`${label} must be between 3 and 30 seconds.`);
        if (provider === "fal" && !(asset.fps >= 23.9 && asset.fps <= 60.05)) fail(`${label} needs a frame rate between 24 and 60 fps.`);
      }
    }
  }
  if (totalVideoSeconds > 30.05) fail("Kling 4's combined video references exceed 30 seconds. Shorten the references; none have been discarded.");
  return { referenceVideoDurationSeconds: totalVideoSeconds };
}

export function createKling4Generator({
  isLocalAssetUrl,
  inspectAsset,
  uploadToFal,
  uploadToKrea,
  uploadToAtlas,
  subscribeFal,
  runKreaGeneration,
  runAtlasGeneration,
  quoteAtlasInput = async () => null,
  createClient = createSingleSubmissionFalClient
}) {
  return async function generate(body, credentials = {}) {
    // Capture the provider and its key before inspection/uploads. A settings
    // change or a provider error must never switch or replay this request.
    const falKey = String(credentials.falKey || "").trim();
    const kreaKey = String(credentials.kreaKey || "").trim();
    const atlasKey = String(credentials.atlasKey || "").trim();
    const provider = falKey ? "fal" : kreaKey ? "krea" : atlasKey ? "atlas" : "";
    const key = provider === "fal" ? falKey : provider === "krea" ? kreaKey : atlasKey;
    if (!provider) fail("Enable Fal, Krea or Atlas Cloud in Settings to generate with Kling 4.");

    const directorReferences = array(body.directorReferences, "Director references");
    const imageReferences = uniqueReferences([
      ...references(body.referenceImageUrls, body.referenceImageLabels, "image references"),
      ...references(body.characterReferenceUrls, body.characterReferenceLabels, "Character references"),
      ...directorReferences.filter(item => ["image", "character", "prop", "location"].includes(item?.type)).map(item => ({ url: item.url, label: item.tag || item.label }))
    ]);
    const videoReferences = uniqueReferences([
      ...references(body.referenceVideoUrls, body.referenceVideoLabels, "video references"),
      ...directorReferences.filter(item => item?.type === "video").map(item => ({ url: item.url, label: item.tag || item.label }))
    ]);
    const request = {
      provider,
      prompt: body.prompt,
      duration: body.duration,
      resolution: body.resolution,
      aspectRatio: body.aspectRatio,
      generateAudio: body.generateAudio,
      startFrames: array(body.startFrameUrls, "start frames"),
      endFrames: array(body.endFrameUrls, "end frames"),
      images: imageReferences.map(item => item.url),
      videos: videoReferences.map(item => item.url),
      audio: [...array(body.referenceAudioUrls, "audio references"), ...directorReferences.filter(item => item?.type === "audio").map(item => item.url)]
    };
    validateKling4Request(request);
    for (const url of [...request.startFrames, ...request.endFrames, ...request.images, ...request.videos]) {
      if (typeof url !== "string" || !isLocalAssetUrl(url)) fail("Kling 4 accepts only managed local reference assets. Reconnect or upload the source before generating.");
    }
    request.prompt = rewriteKling4ReferenceMentions(String(body.prompt || ""), { images: imageReferences, videos: videoReferences, provider,
      startFrames: request.startFrames, endFrames: request.endFrames });
    const prepared = validateKling4Request(request);
    const { referenceVideoDurationSeconds } = await validateKling4Media(request, inspectAsset);
    const endpoint = provider === "fal" ? kling4FalEndpoints[prepared.routeKind] : provider === "krea" ? kling4KreaEndpoint : kling4AtlasEndpoints[prepared.routeKind];
    let cost = estimateKling4Cost({ provider, duration: prepared.durationSeconds, resolution: prepared.resolution, endpoint,
      hasVideoReference: request.videos.length > 0, referenceVideoDurationSeconds });
    const client = provider === "fal" ? createClient({ credentials: key, endpoint, model: kling4ModelName }) : null;
    const uploaded = new Map();
    const upload = async url => {
      if (!uploaded.has(url)) uploaded.set(url, provider === "fal" ? uploadToFal(url, client) : provider === "krea" ? uploadToKrea(url, key) : uploadToAtlas(url, key));
      return uploaded.get(url);
    };
    const [startFrames, endFrames, images, videos] = await Promise.all([
      Promise.all(request.startFrames.map(upload)), Promise.all(request.endFrames.map(upload)),
      Promise.all(request.images.map(upload)), Promise.all(request.videos.map(upload))
    ]);
    const { input } = buildKling4Input({ ...request, startFrames, endFrames, images, videos });
    if (provider === "atlas") {
      try {
        const quote = await quoteAtlasInput(input, key);
        if (quote) cost = { ...cost, ...quote, unitRateUsd: cost.units > 0 ? quote.amountUsd / cost.units : null };
      } catch { /* A price lookup must never cancel or replay a generation. */ }
    }
    const result = provider === "fal"
      ? await subscribeFal(endpoint, { input, logs: true }, { route: "generate-video", model: kling4ModelName }, client, key)
      : provider === "krea" ? await runKreaGeneration({ endpoint, input, label: kling4ModelName, apiKey: key, waitUntilTerminal: true })
        : await runAtlasGeneration({ mediaType: "video", input, key });
    const videoUrl = provider === "fal" ? result?.data?.video?.url : provider === "krea" ? extractKreaJobResultUrl(result?.job) : result?.url;
    const providerName = provider === "fal" ? "fal.ai" : provider === "krea" ? "Krea" : "Atlas Cloud";
    if (!videoUrl) throw Object.assign(new Error(`${providerName} completed Kling 4 but returned no video URL. Check provider history before rerunning.`), { status: 502 });
    const remoteVideo = provider === "fal" ? result.data.video : { url: videoUrl, content_type: "video/mp4", file_name: "kling-4.mp4" };
    return {
      endpoint,
      provider: providerName,
      requestId: result?.requestId || result?.request_id || "",
      remoteVideo,
      submittedPrompt: request.prompt,
      cost,
      settings: {
        duration: String(prepared.durationSeconds), resolution: prepared.resolution,
        aspectRatio: prepared.routeKind === "image" ? "source frame" : prepared.aspectRatio,
        routeKind: prepared.routeKind, runtimeProvider: provider,
        startFrameCount: request.startFrames.length, endFrameCount: request.endFrames.length,
        referenceImageCount: images.length, referenceVideoCount: videos.length,
        referenceVideoDurationSeconds,
        referenceImageNames: imageReferences.map(item => item.label), referenceVideoNames: videoReferences.map(item => item.label),
        ...(body.filmDirector ? { directorPromptMode: "compiled narrative" } : {})
      }
    };
  };
}
