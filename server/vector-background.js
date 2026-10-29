import sharp from "sharp";
import { editVectorDocument } from "./vector-layers.js";

// Be deliberately conservative: identify the bottommost single solid backdrop,
// not similarly colored artwork or a semantic background assembled from paths.
export async function vectorBackgroundSetup(doc) {
  if (doc.backgroundKeys.length) return null;
  const visible = doc.layers.filter(layer => layer.kind !== "g" && !layer.hidden && !layer.parentHidden);
  const candidate = visible[0];
  if (visible.length < 2 || !["rect", "path", "polygon"].includes(candidate.kind) || candidate.locked || candidate.parentLocked) return null;
  const isolated = editVectorDocument(doc.svg, { isolate: [candidate.key] });
  const density = Math.max(1, Math.min(72, Math.max(72 / Math.min(doc.width, doc.height), 72 * 256 / Math.max(doc.width, doc.height))));
  const raster = await sharp(Buffer.from(isolated.svg), { density, limitInputPixels: 64000000, failOn: "error" }).ensureAlpha().raw().toBuffer();
  for (let i = 0; i < raster.length; i += 4) {
    if (raster[i + 3] !== 255 || [0, 1, 2].some(channel => Math.abs(raster[i + channel] - raster[channel]) > 1)) return null;
  }
  const foreground = editVectorDocument(doc.svg, { operations: [{ type: "visibility", keys: [candidate.key], visible: false }] });
  const alpha = await sharp(Buffer.from(foreground.svg), { density, limitInputPixels: 64000000 }).ensureAlpha().extractChannel("alpha").raw().toBuffer();
  if (!alpha.some(value => value > 4)) return null;
  return { type: "batch", operations: [{ type: "background", keys: [candidate.key] },
    { type: "rename", key: candidate.key, name: "Background" }, { type: "visibility", keys: [candidate.key], visible: false }] };
}
