import { buildAtlasImageRequest } from "../src/atlasImages.js";
import { buildAtlasVideoRequest } from "../src/atlasVideos.js";
import { estimateAtlasImageCost, estimateAtlasVideoCost } from "../src/atlasPricing.js";
import { imageModelNames } from "../src/modelOptions.js";
import { seedanceDraftCost } from "../src/seedanceDraft.js";
import { isSeedream55Model } from "../src/seedream55.js";

export function createAtlasMedia({ client, readLocalAsset, imageSize, labelPrompt, validateVideoAssets = async () => {}, quoteInput = async () => null }) {
  async function quotedCost(cost, input, key) {
    try { const quote = await quoteInput(input, key); return quote ? { ...cost, ...quote, unitRateUsd: cost.units > 0 ? quote.amountUsd / cost.units : null } : cost; }
    catch { return cost; }
  }
  async function image({ model, prompt, imageInputs = [], aspectRatio, resolution = "2K", quality = "high", background = "auto", editMaskInput, size: explicitSize }, key) {
    const openAi = model === imageModelNames.openAiImage2;
    const size = openAi ? explicitSize === undefined ? imageSize({ aspectRatio, resolution }) : explicitSize : undefined;
    if (!openAi) quality = "high";
    if (!isSeedream55Model(model)) background = "auto";
    const submittedPrompt = labelPrompt(prompt, imageInputs);
    const options = { model, prompt: submittedPrompt, aspectRatio, resolution, quality, size, background };
    // Validate the complete request before sending even reference files to the provider.
    buildAtlasImageRequest({ ...options, images: imageInputs.map(() => "https://reference.invalid/image.png"), maskUrl: editMaskInput ? "https://reference.invalid/mask.png" : "" });
    let cost = estimateAtlasImageCost({ ...options, referenceCount: imageInputs.length });
    const images = [];
    for (const asset of imageInputs) images.push(await client.upload(asset, key));
    const input = buildAtlasImageRequest({ ...options, images });
    cost = await quotedCost(cost, input, key);
    const result = await client.generate({ mediaType: "image", input, key });
    return { ...result, endpoint: input.model, provider: "Atlas Cloud", cost,
      remoteImage: { url: result.url, content_type: "image/png" },
      maskedEdit: null,
      size: input.size || size, quality: input.quality || quality, resolution, submittedPrompt, resultText: "" };
  }

  async function video({ startImage = "", endImage = "", images = [], videos = [], audios = [], ...options }, key) {
    const sourceAspect = (Boolean(startImage) && options.model !== "Seedance 2.0") || options.seedanceTask === "edit";
    if (sourceAspect) options.aspectRatio = "auto";
    if (options.seedanceTask === "edit") options.duration = "auto";
    // H3 always generates native audio; the caller removes it locally for a silent run.
    if (options.model === "MiniMax H3") options.generateAudio = true;
    const placeholder = "https://reference.invalid/media";
    buildAtlasVideoRequest({ ...options, startImage: startImage ? placeholder : "", endImage: endImage ? placeholder : "",
      images: images.map(() => placeholder), videos: videos.map(() => placeholder), audios: audios.map(() => placeholder) });
    await validateVideoAssets({ ...options, startImage, endImage, images, videos, audios });
    const routeKind = startImage ? "image-to-video" : images.length || videos.length || audios.length ? "reference-to-video" : "text-to-video";
    let cost = estimateAtlasVideoCost({ ...options, routeKind, referenceImageCount: images.length, hasVideoReference: videos.length > 0 });
    const uploaded = {};
    const upload = async (source) => client.upload(typeof source === "string" ? await readLocalAsset(source) : source, key);
    for (const [field, values] of Object.entries({ images, videos, audios })) {
      uploaded[field] = [];
      for (const source of values) uploaded[field].push(await upload(source));
    }
    const input = buildAtlasVideoRequest({ ...options, ...uploaded,
      startImage: startImage ? await upload(startImage) : "",
      endImage: endImage ? await upload(endImage) : "" });
    cost = options.seedanceDraft ? seedanceDraftCost("preview", "atlas") : await quotedCost(cost, input, key);
    const result = await client.generate({ mediaType: "video", input, key });
    return { ...result, endpoint: input.model, cost, input, sourceAspect, provider: "Atlas Cloud",
      remoteVideo: { url: result.url, content_type: "video/mp4" } };
  }
  return { image, video };
}
