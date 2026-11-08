import sharp from "sharp";
import { imageEditMaxPixels } from "../src/imageEdit.js";
import { finishImageEdit } from "./image-edit.js";

const decode = buffer => sharp(buffer, { limitInputPixels: imageEditMaxPixels, animated: false, failOn: "error" });
const invalid = message => Object.assign(new Error(message), { status: 400 });

export async function normalizeOpenAiEditMask(mask, source) {
  if (!source?.buffer) throw invalid("An edit mask needs a reference image.");
  const image = await decode(source.buffer).metadata();
  const { data, info } = await decode(mask.buffer).toColourspace("srgb").ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width !== image.width || info.height !== image.height) {
    throw invalid("The edit mask must match the first reference image dimensions.");
  }
  let transparent = false;
  for (let i = 3; i < data.length; i += 4) if (data[i] < 255) { transparent = true; break; }
  if (!transparent) {
    // Older Character clients sent opaque grayscale masks: white meant edit, black meant preserve.
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== data[i + 1] || data[i] !== data[i + 2]) throw invalid("The edit mask needs transparency or a black-and-white selection.");
      const alpha = 255 - data[i];
      data[i] = data[i + 1] = data[i + 2] = 255;
      data[i + 3] = alpha;
      if (alpha < 255) transparent = true;
    }
    if (!transparent) throw invalid("The edit mask contains no editable region.");
  }
  const buffer = await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
  return { ...mask, buffer, mimeType: "image/png", fileName: "edit-mask.png" };
}

export async function openAiImage26Mask(mask) {
  // Fal 2.6 uses white=edit, black=keep. Keep the alpha mask for local restoration.
  return { ...mask, buffer: await decode(mask.buffer).extractChannel(3).negate().png().toBuffer() };
}

export async function finishOpenAiMaskedEdit({ source, mask }, generated) {
  const { width, height } = await decode(source).metadata();
  const selectionImage = decode(mask).extractChannel(3).negate();
  const selectionPixels = await selectionImage.clone().raw().toBuffer();
  const feather = Math.min(48, Math.round(Math.min(width, height) / 40));
  if (feather > 0 && selectionPixels.every(alpha => alpha === 0 || alpha === 255)) {
    const softened = await selectionImage.clone().blur(Math.max(0.3, feather / 3)).raw().toBuffer();
    // Feather inward only to soften joins without changing protected faces.
    for (let p = 0; p < selectionPixels.length; p++) {
      if (selectionPixels[p]) selectionPixels[p] = Math.max(0, softened[p] * 2 - 255);
    }
  }
  const selectionAlpha = await sharp(selectionPixels, { raw: { width, height, channels: 1 } }).png().toBuffer();
  const selection = await sharp({ create: { width, height, channels: 3, background: "#fff" } })
    .joinChannel(selectionAlpha).png().toBuffer();
  // Providers can return only the edited area, with black pixels elsewhere.
  // Reuse the image editor's compositor to restore protected RGBA pixels from the base.
  return finishImageEdit({ original: source, width, height, selection }, generated);
}
