import { buildSeedream55FalInput, seedream55FalEndpoint, seedream55ModelName } from "../src/seedream55.js";
import { createSingleSubmissionFalClient } from "./fal-single-submission.js";

export function createSeedream55Generator({ readLocalAsset, uploadImageInputToFal, promptWithReferenceLabels, subscribeFal, firstFalImageResult, createClient = createSingleSubmissionFalClient }) {
  return async function generate({ prompt, imagePromptUrls = [], imagePromptLabels = [], aspectRatio, resolution = "2K", editMaskDataUrl, background }, credential) {
    buildSeedream55FalInput({ prompt, images: imagePromptUrls, aspectRatio, resolution, maskUrl: editMaskDataUrl, background });
    const key = String(credential || "").trim();
    if (!key) throw Object.assign(new Error("Enable Fal or Atlas Cloud in Settings for Seedream 5.5. Krea does not currently offer it."), { status: 400 });
    const imageInputs = [];
    for (const [index, url] of imagePromptUrls.entries()) {
      const asset = await readLocalAsset(url);
      if (!asset.mimeType?.startsWith("image/")) throw Object.assign(new Error("Seedream 5.5 references must be images."), { status: 400 });
      imageInputs.push({ ...asset, label: imagePromptLabels[index] });
    }
    const submittedPrompt = promptWithReferenceLabels(prompt, imageInputs);
    buildSeedream55FalInput({ prompt: submittedPrompt, images: imagePromptUrls, aspectRatio, resolution, background });
    const endpoint = seedream55FalEndpoint(imageInputs.length);
    const client = createClient({ credentials: key, endpoint, model: seedream55ModelName });
    const images = await Promise.all(imageInputs.map((image, index) => uploadImageInputToFal(image, index, client)));
    const input = buildSeedream55FalInput({ prompt: submittedPrompt, images, aspectRatio, resolution, background });
    const result = await subscribeFal(endpoint, { input, logs: true }, { route: "generate-image", model: seedream55ModelName }, client, key);
    const remoteImage = firstFalImageResult(result?.data);
    if (!remoteImage?.url) throw Object.assign(new Error("Fal completed Seedream 5.5 but returned no image."), { status: 502 });
    return { endpoint, requestId: result?.requestId || result?.request_id || "", remoteImage, resolution,
      size: input.image_size, submittedPrompt, description: result?.data?.description || "" };
  };
}
