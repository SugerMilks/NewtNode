import sharp from "sharp";
import { buildImageEditPrompt, imageEditMaxPixels, imageEditSize } from "../src/imageEdit.js";

const decode = (buffer) => sharp(buffer, { limitInputPixels: imageEditMaxPixels, animated: false, failOn: "error" });

export async function prepareImageEdit({ source, drawing, selection, prompt, mode, blank = false }) {
  const original = await decode(source).rotate().ensureAlpha().png().toBuffer();
  const { width, height } = await decode(original).metadata();
  const size = imageEditSize(width, height);
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
  const submittedPrompt = buildImageEditPrompt({ prompt, mode, blank, hasDrawing: Boolean(drawing), hasSelection: Boolean(selection) });
  const canvas = blank ? await sharp({ create: { width, height, channels: 4, background: "#ffffff" } }).png().toBuffer() : original;
  const guide = drawing ? await decode(canvas).composite([{ input: drawing }]).png().toBuffer() : null;
  let mask = null;
  if (selection) {
    const alpha = await decode(selection).extractChannel(3).negate().toBuffer();
    mask = await sharp({ create: { width, height, channels: 3, background: "#ffffff" } }).joinChannel(alpha).png().toBuffer();
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
