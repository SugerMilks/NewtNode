import { buildSeedream5ProFalInput, seedream5ProFalEndpoint } from "../src/seedream5Pro.js";

export function createSeedream5ProGenerator({ readLocalAsset, uploadImageInputToFal, promptWithReferenceLabels, subscribeFal, firstFalImageResult }) {
  return async function generate({ prompt, imagePromptUrls = [], imagePromptLabels = [], aspectRatio, resolution = "2K", editMaskDataUrl, background }) {
    buildSeedream5ProFalInput({ prompt, images: imagePromptUrls, aspectRatio, resolution, maskUrl: editMaskDataUrl, background });
    const imageInputs = [];
    for (const [index, url] of imagePromptUrls.entries()) {
      const asset = await readLocalAsset(url);
      if (!asset.mimeType.startsWith("image/")) throw Object.assign(new Error("Seedream Pro references must be images."), { status: 400 });
      imageInputs.push({ ...asset, label: imagePromptLabels[index] });
    }
    const submittedPrompt = promptWithReferenceLabels(prompt, imageInputs);
    const images = await Promise.all(imageInputs.map(uploadImageInputToFal));
    const input = buildSeedream5ProFalInput({ prompt: submittedPrompt, images, aspectRatio, resolution });
    const endpoint = seedream5ProFalEndpoint(images.length);
    const result = await subscribeFal(endpoint, { input, logs: true });
    const remoteImage = firstFalImageResult(result?.data);
    if (!remoteImage?.url) throw Object.assign(new Error("Fal completed Seedream 5.0 Pro but returned no image."), { status: 502 });
    return { endpoint, requestId: result?.requestId || result?.request_id || "", remoteImage, resolution,
      size: input.image_size, submittedPrompt, description: result?.data?.description || "" };
  };
}
