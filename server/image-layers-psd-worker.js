import { parentPort, workerData } from "node:worker_threads";
import { readFile, stat, writeFile } from "node:fs/promises";
import sharp from "sharp";
import { writePsdUint8Array } from "ag-psd";
import { raster, placedLayerPixels, transformedLayerPixels } from "./image-layers.js";
import { rasterLayerVisible } from "../src/rasterLayerFolders.js";

async function writeDocument({ document, files, output }) {
  const children = [], composites = [];
  const groups = new Map();
  function destination(id) {
    if (!id) return children;
    if (!groups.has(id)) {
      const folder = document.folders.find(item => item.id === id);
      const group = { name: folder.name, blendMode: "pass through", hidden: !folder.visible, opened: !folder.collapsed,
        protected: { all: folder.locked, position: folder.locked, composite: folder.locked }, children: [] };
      groups.set(id, group); destination(folder.parentId).push(group);
    }
    return groups.get(id).children;
  }
  for (const [index, layer] of document.layers.entries()) {
    if ((await stat(files[index])).size > 32 * 1024 * 1024) throw new Error("A layer exceeds the 32 MB source limit.");
    const source = await raster(await readFile(files[index]));
    const pixels = await transformedLayerPixels(source, layer);
    destination(layer.folderId).push({ name: layer.name, left: pixels.x, top: pixels.y, blendMode: "normal", opacity: layer.opacity,
      hidden: !layer.visible, protected: { all: layer.locked, position: layer.locked, composite: layer.locked },
      imageData: { data: pixels.data, width: pixels.width, height: pixels.height } });
    if (rasterLayerVisible(layer, document.folders)) {
      const placed = await placedLayerPixels(source, { ...layer, opacity: Math.round(layer.opacity * 255) / 255 }, document.width, document.height, pixels);
      if (placed) composites.push(placed);
    }
  }
  const data = await sharp({ create: { width: document.width, height: document.height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(composites).raw().toBuffer();
  // ag-psd's writer emits bottom-to-top records; keep the editor's stacking order.
  const bytes = writePsdUint8Array({ width: document.width, height: document.height, bitsPerChannel: 8,
    children, imageData: { data, width: document.width, height: document.height } }, { noBackground: true, generateThumbnail: false, trimImageData: false });
  await writeFile(output, bytes, { flag: "wx" });
  return bytes.length;
}

try { parentPort.postMessage({ bytes: await writeDocument(workerData) }); }
catch (error) { parentPort.postMessage({ error: error.message || "Could not build the layered PSD." }); }
