import { canvasToBlob, loadCanvasImage } from "./canvasMedia.js";
import { drawImageEditMarks } from "./imageEdit.js";
import { vectorGuideLimits, validateVectorMarks } from "./vectorGuidance.js";
import { nodeApi } from "./api/newtApi.js";
import { appendWorkflowContextFormFields } from "./workflowContext.js";
import { vectorCanvasFont } from "./vectorFonts.js";

export function guideCanvas(width, height) {
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  return canvas;
}

export function drawGuideBackground(canvas, image) {
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (image) {
    const w = image.naturalWidth || image.width, h = image.naturalHeight || image.height;
    const scale = Math.min(canvas.width / w, canvas.height / h);
    ctx.drawImage(image, (canvas.width - w * scale) / 2, (canvas.height - h * scale) / 2, w * scale, h * scale);
  }
}

export async function renderVectorLayout(layout) {
  const marks = validateVectorMarks(layout.marks);
  const canvas = guideCanvas(layout.width, layout.height), overlay = guideCanvas(layout.width, layout.height);
  let image;
  if (layout.backgroundUrl) {
    try { image = await loadCanvasImage(layout.backgroundUrl); }
    catch { throw new Error("The layout background could not be loaded. Choose another image or a blank canvas."); }
  }
  drawGuideBackground(canvas, image);
  drawImageEditMarks(overlay.getContext("2d"), marks, canvas.width, canvas.height);
  const pixels = overlay.getContext("2d").getImageData(0, 0, overlay.width, overlay.height).data;
  if (!pixels.some((value, index) => index % 4 === 3 && value > 0)) throw new Error("Draw a layout before applying it.");
  canvas.getContext("2d").drawImage(overlay, 0, 0);
  return canvasToBlob(canvas, "image/png");
}

export async function readVectorGuideFile(file) {
  if (!file || !file.size || file.size > vectorGuideLimits.bytes) throw new Error("Choose a reference or font file up to 10 MB.");
  const extension = file.name.split(".").at(-1).toLowerCase();
  if (["ttf", "otf", "woff", "woff2"].includes(extension)) {
    const buffer = await file.arrayBuffer();
    const signature = buffer.byteLength >= 4 ? new DataView(buffer).getUint32(0) : 0;
    if (![0x00010000, 0x4f54544f, 0x774f4646, 0x774f4632, 0x74727565].includes(signature)) throw new Error("That file is not a supported font.");
    const family = `VectorGuide${crypto.randomUUID().replaceAll("-", "")}`;
    let face;
    try { face = await new FontFace(family, buffer).load(); }
    catch { throw new Error("This font could not be opened. Try a TTF, OTF, WOFF or WOFF2 file, or upload a sample image."); }
    return { kind: "font", family, face, label: file.name };
  }
  if (!["png", "jpg", "jpeg", "webp"].includes(extension)) throw new Error("Choose a PNG, JPEG, WebP, TTF, OTF, WOFF or WOFF2 file.");
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error("That image could not be opened. Choose a PNG, JPEG or WebP image."); }
  try {
    if (bitmap.width * bitmap.height > vectorGuideLimits.pixels) throw new Error("Use a font reference image up to 24 megapixels.");
    const scale = Math.min(1, 1536 / Math.max(bitmap.width, bitmap.height));
    const canvas = guideCanvas(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    drawGuideBackground(canvas, bitmap);
    return { kind: "image", blob: await canvasToBlob(canvas, "image/png"), label: file.name };
  } finally { bitmap.close(); }
}

export function drawFontSpecimen(canvas, family, sample) {
  const ctx = canvas.getContext("2d"), text = sample.trim();
  drawGuideBackground(canvas);
  if (!text) return;
  let lines = [], size = 100;
  // Wrap even unbroken strings, then fit all lines without clipping the specimen.
  for (; size >= 12; size -= 2) {
    ctx.font = vectorCanvasFont(family, size);
    lines = [];
    for (const paragraph of text.split("\n")) {
      let line = "";
      for (const char of paragraph) {
        if (line && ctx.measureText(line + char).width > canvas.width - 120) { lines.push(line); line = ""; }
        line += char;
      }
      lines.push(line);
    }
    if (lines.length * size * 1.5 <= canvas.height - 120) break;
  }
  ctx.fillStyle = "#111111"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const top = (canvas.height - (lines.length - 1) * size * 1.5) / 2;
  lines.forEach((line, index) => ctx.fillText(line, canvas.width / 2, top + index * size * 1.5));
}

export async function saveVectorGuide(blob, fileName, workflowContext, upload = nodeApi.uploadAsset) {
  if (!blob || blob.size > vectorGuideLimits.bytes) throw new Error("The rendered reference exceeds 10 MB. Simplify it before saving.");
  const form = new FormData();
  form.append("asset", blob, fileName);
  appendWorkflowContextFormFields(form, workflowContext);
  const { response, data } = await upload(form, "Vector reference save");
  if (!response.ok || !data?.asset?.localUrl) throw new Error(data?.error || "Could not save this reference. Your previous reference is unchanged.");
  return data.asset.localUrl;
}
