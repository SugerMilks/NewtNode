import { normalizeLayerRotation, rotatedLayerSize } from "./rasterLayerGeometry.js";
import { rasterFolderMembers } from "./rasterLayerFolders.js";

export const layersModel = "Seedream 5.5 Layers";
export const layersEndpoint = "bytedance/seedream-v5.5/layer-decomposition";
export const isLayersNode = node => node?.type === "utility" && node.data?.utilityMode === "image" && node.data?.utilityImageModel === "Layers";
export const layersDefaults = { layersPrompt: "", layersLimit: 8, layersResolution: "auto", layersDocuments: [], layersDocumentId: "", layersJob: null };
export const layersNamingInstruction = "Name every returned layer in concise English, describing the element it contains. Use English for layer-name metadata only: do not add labels to the image, translate visible text, or change the artwork. Name the bottom background layer Background.";
const fail = message => Object.assign(new Error(message), { status: 400 });
export const managedLayerUrl = url => typeof url === "string" && /^\/(?:uploads|outputs|workflow-assets)\//.test(url) && !/[\x00-\x1f]/.test(url);

export function validateLayersRequest(body = {}) {
  if (!managedLayerUrl(body.sourceUrl)) throw fail("Connect one saved image to Layers.");
  const prompt = body.prompt ?? "";
  if (typeof prompt !== "string" || prompt.length > 4000) throw fail("Keep separation instructions within 4,000 characters.");
  const limit = body.limit ?? 8;
  if (!Number.isInteger(limit) || limit < 2 || limit > 24) throw fail("Choose 2-24 total layers, including the background.");
  const resolution = body.resolution ?? "auto";
  if (!["auto", "1k", "1.5k", "2k"].includes(resolution)) throw fail("Choose Auto, 1K, 1.5K or 2K for Layers.");
  const layerOnly = body.layerOnly === true;
  if (layerOnly && (!Number.isFinite(body.sourceOpacity) || body.sourceOpacity < 0 || body.sourceOpacity > 1)) throw fail("Invalid source layer opacity.");
  return { sourceUrl: body.sourceUrl, prompt, limit, resolution, ...(layerOnly ? { layerOnly, sourceOpacity: body.sourceOpacity } : {}) };
}

export function layersProviderInput(request, image) {
  const prompt = [request.prompt, layersNamingInstruction, request.layerOnly ? "This is one isolated layer, not a complete scene. Separate only its existing visible elements. Preserve their shapes, composition and appearance. Do not invent a background, surroundings or new objects. Preserve the transparent area outside the source content." : ""].filter(Boolean).join("\n\n");
  return { model: layersEndpoint, image, prompt, num_images: request.limit, resolution: request.resolution,
    output_format: "png", enable_text_recognition: false, enable_sync_mode: false, enable_base64_output: false };
}

export function providerLayerName(metadata, index) {
  if (index === 0) return "Background";
  const name = typeof metadata?.name === "string"
    ? metadata.name.normalize("NFKC").replace(/[\p{Cc}\p{Cf}]/gu, " ").replace(/\s+/g, " ").trim() : "";
  // If the model ignores the naming language, use a neutral label rather than guessing a translation.
  const hasOtherScript = [...name].some(char => /\p{L}/u.test(char) && !/\p{Script_Extensions=Latin}/u.test(char));
  return name && /[A-Za-z]/.test(name) && !hasOtherScript ? name.slice(0, 100) : `Layer ${index}`;
}

// Atlas advertises a starting per-image price, without an unambiguous full-layer billing rule.
export function layersCost() {
  return { amountUsd: null, currency: "USD", pricingSource: "atlas-variable", pricingBasis: "Atlas Seedream 5.5 layer separation; final output count and account billing vary." };
}

export function providerLayerBounds(metadata, width, height, index, imageWidth, imageHeight) {
  if (index === 0) return { x: 0, y: 0, width, height };
  let box = metadata?.bounding_box?.absolute;
  if (!Array.isArray(box) || box.length !== 4) {
    const normalized = metadata?.bounding_box?.normalized;
    box = Array.isArray(normalized) && normalized.length === 4 ? normalized.map((n, i) => n * (i % 2 ? height : width) / 1000) : null;
  }
  if (!box && imageWidth === width && imageHeight === height) box = [0, 0, width, height];
  if (!box || !box.every(n => typeof n === "number" && Number.isFinite(n)) || box[0] < 0 || box[1] < 0 || box[2] > width + 1 || box[3] > height + 1 || box[2] <= box[0] || box[3] <= box[1])
    throw fail("Atlas returned a layer without valid placement. Check this request again to retry saving; no new generation is needed.");
  const [left, top, right, bottom] = box.map(Math.round);
  return { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) };
}

export function validateLayerDocument(raw) {
  if (!raw || !Number.isInteger(raw.width) || !Number.isInteger(raw.height) || raw.width < 1 || raw.height < 1 || raw.width > 8192 || raw.height > 8192 || raw.width * raw.height > 36000000)
    throw fail("Invalid Layers canvas dimensions.");
  if (!Array.isArray(raw.layers) || !raw.layers.length || raw.layers.length > 24) throw fail("A Layers document needs 1-24 layers.");
  if (raw.width * raw.height * (raw.layers.length + 1) > 160000000) throw fail("This layer stack is too large to render safely. Use fewer layers or a smaller resolution.");
  const ids = new Set();
  const folderIds = new Set();
  if (raw.folders !== undefined && (!Array.isArray(raw.folders) || raw.folders.length > 24)) throw fail("A Layers document supports up to 24 folders.");
  const folders = (raw.folders || []).map(folder => {
    if (!folder || typeof folder.id !== "string" || !folder.id || folder.id.length > 100 || folderIds.has(folder.id)) throw fail("Invalid layer folder identity.");
    folderIds.add(folder.id);
    if (folder.parentId !== undefined && (typeof folder.parentId !== "string" || !folder.parentId)) throw fail("Invalid parent folder.");
    return { id: folder.id, name: String(folder.name || "Folder").slice(0, 100), visible: folder.visible !== false, locked: folder.locked === true, collapsed: folder.collapsed === true, ...(folder.parentId ? { parentId: folder.parentId } : {}) };
  });
  for (const folder of folders) {
    const seen = new Set([folder.id]); let id = folder.parentId;
    while (id) {
      if (!folderIds.has(id) || seen.has(id)) throw fail("Invalid or circular layer folder hierarchy.");
      seen.add(id); id = folders.find(item => item.id === id).parentId;
    }
  }
  const layers = raw.layers.map(layer => {
    if (typeof layer.id !== "string" || !layer.id || layer.id.length > 100 || ids.has(layer.id) || folderIds.has(layer.id) || !managedLayerUrl(layer.url)) throw fail("Invalid layer source or identity.");
    if (layer.folderId !== undefined && (typeof layer.folderId !== "string" || !folderIds.has(layer.folderId))) throw fail("Invalid layer folder membership.");
    ids.add(layer.id);
    const numbers = [layer.x, layer.y, layer.width, layer.height, layer.opacity ?? 1, layer.rotation ?? 0];
    if (!numbers.every(Number.isFinite) || Math.abs(layer.x) > raw.width * 4 || Math.abs(layer.y) > raw.height * 4 || layer.width < 1 || layer.height < 1 || layer.width > 8192 || layer.height > 8192 || layer.width * layer.height > 36000000 || numbers[4] < 0 || numbers[4] > 1) throw fail("Invalid layer size, position or opacity.");
    const rotation = normalizeLayerRotation(numbers[5]);
    const size = rotatedLayerSize({ ...layer, width: Math.round(layer.width), height: Math.round(layer.height), rotation });
    if (size.width > 8192 || size.height > 8192 || size.width * size.height > 36000000) throw fail("The rotated layer is too large to render safely.");
    return { id: layer.id, url: layer.url, name: String(layer.name || "Layer").slice(0, 100),
      ...(layer.folderId ? { folderId: layer.folderId } : {}),
      x: Math.round(layer.x), y: Math.round(layer.y), width: Math.round(layer.width), height: Math.round(layer.height),
      ...(rotation ? { rotation } : {}),
      opacity: numbers[4], visible: layer.visible !== false, locked: layer.locked === true };
  });
  for (const folder of folders) {
    const members = new Set(rasterFolderMembers(layers, folders, folder.id).map(layer => layer.id));
    const indexes = layers.flatMap((layer, index) => members.has(layer.id) ? [index] : []);
    if (!indexes.length || indexes.at(-1) - indexes[0] + 1 !== indexes.length) throw fail("Folder layers must stay together in the stack.");
  }
  if (layers.reduce((sum, layer) => { const size = rotatedLayerSize(layer); return sum + size.width * size.height; }, 0) > 128000000) throw fail("The combined layer dimensions are too large to render safely.");
  return { id: String(raw.id || "").slice(0, 100), name: String(raw.name || "Layers").slice(0, 100), width: raw.width, height: raw.height,
    ...(folders.length ? { folders } : {}),
    sourceUrl: managedLayerUrl(raw.sourceUrl) ? raw.sourceUrl : "", layers };
}

export function layersOutputPatch(documents, id, selected = 0) {
  const document = documents.find(doc => doc.id === id) || documents.at(-1);
  const resultItems = document?.items || [];
  const selectedResultIndex = Math.max(0, Math.min(resultItems.length - 1, Math.trunc(selected) || 0));
  return { layersDocuments: documents, layersDocumentId: document?.id || "", resultItems,
    selectedResultIndex, resultUrl: resultItems[selectedResultIndex]?.url || "", resultType: "image" };
}

export function normalizeLayersData(data = {}, restore = false) {
  const documents = Array.isArray(data.layersDocuments) ? data.layersDocuments.filter(doc => doc?.id && Array.isArray(doc.layers) && Array.isArray(doc.items)) : [];
  return { ...layersDefaults, ...data,
    layersLimit: Number.isInteger(data.layersLimit) && data.layersLimit >= 2 && data.layersLimit <= 24 ? data.layersLimit : 8,
    layersResolution: ["auto", "1k", "1.5k", "2k"].includes(data.layersResolution) ? data.layersResolution : "auto",
    ...layersOutputPatch(documents, data.layersDocumentId, data.selectedResultIndex),
    layersJob: data.layersJob ? { ...data.layersJob, ...(restore && ["running", "submitting"].includes(data.layersJob.status) ? { status: "uncertain" } : {}) } : null };
}

export function moveLayer(layers, id, targetId) {
  const from = layers.findIndex(layer => layer.id === id), to = layers.findIndex(layer => layer.id === targetId);
  if (from < 0 || to < 0 || from === to || layers[from].locked || layers[to].locked) return layers;
  const next = [...layers], [layer] = next.splice(from, 1); next.splice(to, 0, layer); return next;
}
