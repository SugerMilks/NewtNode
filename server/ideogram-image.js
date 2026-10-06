import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { ideogramImageModelName, ideogramImageEndpoint, buildIdeogramImageFalRequest, validateIdeogramImageRequest, ideogramImageReferenceOrder, ideogramImageCost } from "../src/ideogramImage.js";
import { ideogramImageEditEndpoint } from "../src/ideogramImageEdit.js";
import { createIdeogramFalClient } from "./image-edit.js";

export function createIdeogramImageGenerator({ subscribeFal, firstFalImageResult, readLocalAsset, uploadImageInputToFal, createClient = createIdeogramFalClient }) {
  return async function generate(options, credential) {
    // Validate the raw reference list and mask before creating a client or making any request.
    validateIdeogramImageRequest(options);
    const order = ideogramImageReferenceOrder(options.imagePromptUrls, options.ideogramSourceUrl);
    const endpoint = order.length ? ideogramImageEditEndpoint : ideogramImageEndpoint;
    const key = String(credential || "").trim();
    if (!key) throw Object.assign(new Error("Enable Fal in Settings for Ideogram 4.5 image generation. Krea and Atlas Cloud are not supported for this model."), { status: 400 });
    // Decode every local input before the first upload; never drop a bad reference.
    const images = [];
    for (const index of order) {
      const asset = await readLocalAsset(options.imagePromptUrls[index]);
      if (!asset.mimeType?.startsWith("image/") || !asset.buffer?.length || asset.buffer.length > 25 * 1024 * 1024)
        throw Object.assign(new Error("Ideogram references must be images no larger than 25 MB each."), { status: 400 });
      let buffer, info;
      try {
        ({ data: buffer, info } = await sharp(asset.buffer, { limitInputPixels: 24_000_000, animated: false, failOn: "error" })
          .rotate().png().toBuffer({ resolveWithObject: true }));
      } catch { throw Object.assign(new Error("A connected Ideogram image could not be decoded. Use an image up to 24 megapixels."), { status: 400 }); }
      if (buffer.length > 25 * 1024 * 1024 || info.width / info.height > 6 || info.height / info.width > 6)
        throw Object.assign(new Error("Ideogram references must fit within 25 MB and a 1:6 to 6:1 aspect ratio."), { status: 400 });
      images.push({ buffer, mimeType: "image/png", fileName: `reference-${index + 1}.png` });
    }
    const client = createClient(key, endpoint);
    const uploadedUrls = await Promise.all(images.map((image, index) => uploadImageInputToFal(image, index, client)));
    const { input } = buildIdeogramImageFalRequest(options, uploadedUrls);
    const result = await subscribeFal(endpoint, { input, logs: true }, { route: "generate-image", model: ideogramImageModelName }, client, key);
    const remoteImage = firstFalImageResult(result?.data);
    if (!remoteImage?.url) throw Object.assign(new Error("Ideogram 4.5 completed but returned no image. Check Fal history before rerunning."), { status: 502 });
    return { endpoint, requestId: result?.requestId || result?.request_id || "", remoteImage,
      submittedPrompt: input.prompt, size: input.image_size, quality: input.quality, enablePromptExpansion: input.enable_prompt_expansion,
      referenceCount: order.length, sourceUrl: order.length ? options.imagePromptUrls[order[0]] : "", editPrecision: input.edit_precision,
      ...(Number.isInteger(result?.data?.seed) ? { seed: result.data.seed } : {}) };
  };
}

export function createIdeogramImageHandler({ getKey, subscribeFal, firstFalImageResult, readLocalAsset, uploadImageInputToFal, downloadImage, appendHistory, projectFromBody, nodeFromBody, createClient }) {
  const generate = createIdeogramImageGenerator({ subscribeFal, firstFalImageResult, readLocalAsset, uploadImageInputToFal, createClient });
  return async function runIdeogramImageModel(req, res) {
    const body = req.body;
    const resolution = body.resolution === undefined ? "2K" : body.resolution;
    const aspectRatio = body.aspectRatio === undefined ? "16:9" : body.aspectRatio;
    const options = { ...body, prompt: String(body.prompt || "").trim(), resolution, aspectRatio };
    const generation = await generate(options, getKey());
    let output;
    try {
      output = await downloadImage(req, generation.remoteImage.url, "ideogram-4.5", generation.remoteImage.content_type || generation.remoteImage.mimeType);
    } catch (error) {
      throw Object.assign(new Error(`Ideogram 4.5 completed, but NewtNode could not save the image. Check Fal history before rerunning. ${error.message}`), { status: 502, cause: error });
    }
    const cost = ideogramImageCost({ provider: "fal.ai", resolution, aspectRatio, quality: generation.quality, size: generation.size, referenceCount: generation.referenceCount });
    const settings = { model: ideogramImageModelName, resolution: generation.referenceCount ? "auto" : resolution,
      aspectRatio: generation.referenceCount ? "auto" : aspectRatio, requestedAspectRatio: body.requestedAspectRatio || aspectRatio,
      imageSize: generation.size, quality: generation.quality, enablePromptExpansion: generation.enablePromptExpansion,
      imagePromptCount: generation.referenceCount, sourceUrl: generation.sourceUrl, editPrecision: generation.editPrecision,
      maskedEdit: false, ...(body.seed !== undefined && body.seed !== null ? { requestedSeed: body.seed } : {}),
      ...(generation.seed !== undefined ? { seed: generation.seed } : {}) };
    let warning = "";
    try {
      await appendHistory({ id: generation.requestId || randomUUID(), createdAt: new Date().toISOString(), mediaType: "image", provider: "fal.ai",
        modelName: ideogramImageModelName, endpoint: generation.endpoint, mode: generation.referenceCount ? "Image edit with references" : "Image generation", prompt: options.prompt, submittedPrompt: generation.submittedPrompt,
        project: projectFromBody(body), node: nodeFromBody(body), settings, cost, remoteImage: generation.remoteImage,
        localImage: output.publicPath, localThumbnail: output.thumbnailPublicPath, outputFileName: output.fileName, outputBytes: output.bytes, text: "" });
    } catch { warning = "Image saved, but this run could not be added to History."; }
    return res.json({ provider: "fal.ai", model: ideogramImageModelName, endpoint: generation.endpoint, requestId: generation.requestId,
      ...(generation.seed !== undefined ? { seed: generation.seed } : {}), text: "", cost, ...(warning ? { warning } : {}),
      image: { ...generation.remoteImage, localUrl: output.publicPath, thumbnailUrl: output.thumbnailPublicPath,
        fileName: output.fileName, mimeType: output.mimeType, model: ideogramImageModelName, quality: generation.quality,
        sourceUrl: generation.sourceUrl, imagePromptCount: generation.referenceCount, editPrecision: generation.editPrecision,
        enablePromptExpansion: generation.enablePromptExpansion, ...(generation.seed !== undefined ? { seed: generation.seed } : {}) } });
  };
}
