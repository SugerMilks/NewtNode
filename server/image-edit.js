import sharp from "sharp";
import { createFalClient } from "@fal-ai/client";
import { buildOpenAiImage25FalRequest, openAiImage25Models } from "../src/openAiImage25.js";
import { ideogramImageEditModel, validateIdeogramImageEditRequest, buildIdeogramImageEditFalRequest } from "../src/ideogramImageEdit.js";
import { buildImageEditPrompt, imageEditMaxPixels, imageEditSize } from "../src/imageEdit.js";

const decode = (buffer) => sharp(buffer, { limitInputPixels: imageEditMaxPixels, animated: false, failOn: "error" });

export async function prepareImageEdit({ source, drawing, selection, prompt, mode, blank = false, model = openAiImage25Models.sunburst }) {
  const original = await decode(source).rotate().ensureAlpha().png().toBuffer();
  const { width, height } = await decode(original).metadata();
  const size = imageEditSize(width, height, model);
  async function layer(buffer) {
    if (!buffer) return null;
    const metadata = await decode(buffer).metadata();
    if (metadata.format !== "png" || !metadata.hasAlpha || metadata.width !== width || metadata.height !== height)
      throw new Error("Drawing and selection layers must be transparent PNGs matching the original image dimensions.");
    const { data } = await decode(buffer).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    let visible = false;
    for (let i = 3; i < data.length; i += 4) if (data[i]) { visible = true; break; }
    return visible ? buffer : null;
  }
  drawing = await layer(drawing);
  selection = await layer(selection);
  if (blank && selection) throw new Error("Blank sketches cannot use a selection mask.");
  const submittedPrompt = buildImageEditPrompt({ prompt, mode, blank, model, hasDrawing: Boolean(drawing), hasSelection: Boolean(selection) });
  const canvas = blank ? await sharp({ create: { width, height, channels: 4, background: "#ffffff" } }).png().toBuffer() : original;
  const guide = drawing ? await decode(canvas).composite([{ input: drawing }]).png().toBuffer() : null;
  let mask = null;
  if (selection) {
    if (model === ideogramImageEditModel) {
      const alpha = await decode(selection).extractChannel(3).raw().toBuffer();
      let edited = false, protectedPixels = false;
      const pixels = Buffer.alloc(alpha.length);
      for (let p = 0; p < alpha.length; p++) {
        pixels[p] = alpha[p] >= 128 ? 0 : 255;
        if (pixels[p] === 0) edited = true; else protectedPixels = true;
      }
      if (!edited || !protectedPixels) throw new Error("Ideogram 4.5 masks need both selected and protected areas. Paint a selection covering part of the image, or clear it for a full-image edit.");
      mask = await sharp(pixels, { raw: { width, height, channels: 1 } }).png().toBuffer();
    } else {
      const alpha = await decode(selection).extractChannel(3).negate().toBuffer();
      mask = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).joinChannel(alpha).png().toBuffer();
    }
  }
  return { original, width, height, size, selection, mask, submittedPrompt,
    images: blank ? [guide] : [original, guide].filter(Boolean) };
}

export async function finishImageEdit(prepared, generated) {
  const { data: result, info } = await decode(generated).rotate().resize(prepared.width, prepared.height, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (prepared.selection) {
    const original = await decode(prepared.original).ensureAlpha().raw().toBuffer();
    const mask = await decode(prepared.selection).extractChannel(3).raw().toBuffer();
    // Composite in premultiplied alpha; unselected pixels remain byte-for-byte identical.
    for (let p = 0; p < mask.length; p++) {
      const i = p * 4, m = mask[p] / 255;
      if (m === 0) { original.copy(result, i, i, i + 4); continue; }
      const a = result[i + 3] / 255 * m, b = original[i + 3] / 255 * (1 - m), alpha = a + b;
      for (let c = 0; c < 3; c++) result[i + c] = alpha ? Math.round((result[i + c] * a + original[i + c] * b) / alpha) : 0;
      result[i + 3] = Math.round(alpha * 255);
    }
  }
  // Resize metadata may mark input as premultiplied; our edited bytes are straight RGBA.
  return sharp(result, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer();
}

// Dependencies are supplied by the existing server provider adapter, keeping uploads and
// paid submissions on its configured Fal client and allowing offline transport checks.
export async function generateFalImageEdit({ model, prompt, quality, editPrecision, size, images, mask }, { uploadImage, subscribe, firstImage }) {
  const ideogram = model === ideogramImageEditModel;
  if (ideogram) {
    if (!Array.isArray(images) || !images[0]) throw Object.assign(new Error("Ideogram 4.5 needs a source image."), { status: 400 });
    validateIdeogramImageEditRequest({ prompt, quality, editPrecision, referenceCount: images.length - 1, hasMask: Boolean(mask) });
    if ([...images, mask].filter(Boolean).some((buffer) => buffer.length > 25 * 1024 * 1024))
      throw Object.assign(new Error("Ideogram 4.5 source, guide and mask PNGs must each be at most 25 MB. Use a smaller source image."), { status: 400 });
  }
  const imageUrls = await Promise.all(images.map((buffer, index) => uploadImage({ buffer, mimeType: "image/png", fileName: `edit-reference-${index + 1}.png` }, index)));
  const maskUrl = mask ? await uploadImage({ buffer: mask, mimeType: "image/png", fileName: "edit-mask.png" }, images.length) : undefined;
  const { endpoint, input } = ideogram
    ? buildIdeogramImageEditFalRequest({ prompt, quality, editPrecision, imageUrls, maskUrl })
    : buildOpenAiImage25FalRequest({ model, prompt, quality, size, imageUrls, maskUrl });
  const result = await subscribe(endpoint, { input, logs: true }, { route: "edit-image", model });
  const remoteImage = firstImage(result?.data);
  if (!remoteImage?.url) throw Object.assign(new Error("The model returned no edited image. Check Fal history before rerunning."), { status: 502 });
  return { endpoint, remoteImage, ...(ideogram && Number.isInteger(result?.data?.seed) ? { seed: result.data.seed } : {}) };
}

export function createIdeogramImageEditClient(credentials, fetchImpl = fetch) {
  return createIdeogramFalClient(credentials, "ideogram/v4.5/edit", fetchImpl);
}

export function createIdeogramFalClient(credentials, endpoint, fetchImpl = fetch) {
  let submitted = false;
  const operation = endpoint.endsWith("/edit") ? "edit" : "generation";
  // The SDK retries queue submissions even with maxRetries: 0. A request-scoped
  // fetch guard enforces one outbound paid POST while allowing status/result reads.
  return createFalClient({ credentials, retry: { maxRetries: 0 }, fetch: async (input, init = {}) => {
    const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
    const method = String(init.method || input?.method || "GET").toUpperCase();
    const paidSubmission = method === "POST" && url.hostname === "queue.fal.run" && url.pathname.replace(/\/$/, "") === `/${endpoint}`;
    if (paidSubmission) {
      if (submitted) throw Object.assign(new Error(`Ideogram 4.5 submission could not be confirmed. Check Fal history before rerunning; NewtNode did not resubmit the ${operation}.`), { status: 502 });
      submitted = true;
    }
    try { return await fetchImpl(input, init); }
    catch (error) {
      if (!paidSubmission) throw error;
      throw Object.assign(new Error(`Ideogram 4.5 submission could not be confirmed. Check Fal history before rerunning. ${error.message}`), { status: 502, cause: error });
    }
  } });
}
