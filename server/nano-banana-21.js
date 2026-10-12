import { buildNanoBanana21Input, nanoBanana21ModelName, nanoBanana21FalTextEndpoint, nanoBanana21FalEditEndpoint } from "../src/nanoBanana21.js";
import { createSingleSubmissionFalClient } from "./fal-single-submission.js";

export function createNanoBanana21Generator({ readLocalAsset, uploadImageInputToFal, promptWithReferenceLabels, subscribeFal, firstFalImageResult, createClient = createSingleSubmissionFalClient }) {
  return async function generate({ prompt, imagePromptUrls = [], imagePromptLabels = [], aspectRatio, resolution = "2K", editMaskDataUrl, background }, credential) {
    buildNanoBanana21Input({ prompt, images: imagePromptUrls, aspectRatio, resolution, maskUrl: editMaskDataUrl, background });
    const key = String(credential || "").trim();
    if (!key) throw Object.assign(new Error("Enable Fal in Settings for Nano Banana 2.1."), { status: 400 });
    const imageInputs = [];
    for (const [index, url] of imagePromptUrls.entries()) {
      const asset = await readLocalAsset(url);
      if (!asset.mimeType?.startsWith("image/")) throw Object.assign(new Error("Nano Banana 2.1 references must be images."), { status: 400 });
      imageInputs.push({ ...asset, label: imagePromptLabels[index] });
    }
    const submittedPrompt = promptWithReferenceLabels(prompt, imageInputs);
    // Validate the expanded prompt before uploading any references.
    buildNanoBanana21Input({ prompt: submittedPrompt, images: imagePromptUrls, aspectRatio, resolution });
    const endpoint = imageInputs.length ? nanoBanana21FalEditEndpoint : nanoBanana21FalTextEndpoint;
    const client = createClient({ credentials: key, endpoint, model: nanoBanana21ModelName });
    const images = await Promise.all(imageInputs.map((image, index) => uploadImageInputToFal(image, index, client)));
    const input = buildNanoBanana21Input({ prompt: submittedPrompt, images, aspectRatio, resolution });
    const result = await subscribeFal(endpoint, { input, logs: true }, { route: "generate-image", model: nanoBanana21ModelName }, client, key);
    const remoteImage = firstFalImageResult(result?.data);
    if (!remoteImage?.url) throw Object.assign(new Error("Fal completed Nano Banana 2.1 but returned no image. Check provider history before rerunning."), { status: 502 });
    return { endpoint, requestId: result?.requestId || result?.request_id || "", remoteImage, resolution,
      submittedPrompt, thinkingLevel: input.thinking_level, description: result?.data?.description || "" };
  };
}
