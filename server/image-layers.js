import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { readFile, stat, writeFile } from "node:fs/promises";
import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import sharp from "sharp";
import { writeJsonAtomic } from "./json-store.js";
import { rasterLayerVisible } from "../src/rasterLayerFolders.js";
import { confineLayerAlpha, prepareIsolatedLayer } from "./image-layer-separation.js";
import { layersEndpoint, layersModel, layersCost, validateLayersRequest, layersProviderInput, providerLayerName, providerLayerBounds, validateLayerDocument } from "../src/imageLayers.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const hash = value => createHash("sha256").update(value).digest("hex");
const validId = id => typeof id === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id);
const contextKeys = ["projectId", "projectName", "workflowName", "workflowPackageId", "workflowPackagePath", "nodeId", "nodeTitle"];
const contextOf = body => Object.fromEntries(contextKeys.map(key => [key, String(body[key] || "").slice(0, key.endsWith("Path") ? 4096 : 200)]));
const publicJob = job => ({ requestId: job.id, status: job.status, document: job.document, error: job.error || "", warning: job.warning || "" });

export function publicImageAddress(address) {
  // Use only public IPv4 addresses; pin the checked address for the actual connection.
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(address)) return false;
  const [a, b] = address.split(".").map(Number);
  return a > 0 && a < 224 && ![10, 127].includes(a) && !(a === 169 && b === 254) && !(a === 172 && b >= 16 && b <= 31) && !(a === 192 && [0, 168].includes(b)) && !(a === 100 && b >= 64 && b <= 127) && !(a === 198 && [18, 19].includes(b));
}

export async function readLayerDownload(value) {
  let url;
  try { url = new URL(value); } catch { throw fail("Invalid Atlas layer download URL.", 502); }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw fail("Unsupported Atlas layer download URL.", 502);
  const addresses = await lookup(url.hostname, { all: true, family: 4 });
  if (!addresses.length || addresses.some(item => !publicImageAddress(item.address))) throw fail("Atlas returned a non-public layer download address.", 502);
  return new Promise((resolve, reject) => {
    const request = httpsRequest(url, { lookup: (_host, options, callback) => options.all ? callback(null, [addresses[0]]) : callback(null, addresses[0].address, 4) }, response => {
      if (response.statusCode !== 200) { response.resume(); reject(fail("Could not download an Atlas layer. Check this request to retry saving.", 502)); return; }
      const chunks = []; let bytes = 0;
      response.on("data", chunk => { bytes += chunk.length; if (bytes > 32 * 1024 * 1024) request.destroy(fail("An Atlas layer exceeds the 32 MB safety limit.", 502)); else chunks.push(chunk); });
      response.on("error", reject); response.on("end", () => resolve(Buffer.concat(chunks)));
    });
    const timer = setTimeout(() => request.destroy(fail("Layer download interrupted. Check this request to retry saving.", 504)), 90000);
    request.on("close", () => clearTimeout(timer)); request.on("error", reject); request.end();
  });
}

export async function raster(buffer, maximum = 32 * 1024 * 1024) {
  if (!Buffer.isBuffer(buffer) || !buffer.length || buffer.length > maximum) throw fail("Choose a still image within the file size limit.");
  const options = { limitInputPixels: 36000000, failOn: "error" };
  const meta = await sharp(buffer, options).metadata();
  if (!["png", "jpeg", "webp"].includes(meta.format) || (meta.pages || 1) !== 1) throw fail("Layers accepts PNG, JPEG or WebP still images only.");
  const { data, info } = await sharp(buffer, options).rotate().ensureAlpha().png().toBuffer({ resolveWithObject: true });
  return { buffer: data, width: info.width, height: info.height };
}

export async function transformedLayerPixels(source, layer) {
  let pixels = await sharp(source.buffer).resize(layer.width, layer.height, { fit: "fill" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  // Materialize resize first: rotating before resize would stretch the expanded bounds.
  if (layer.rotation) pixels = await sharp(pixels.data, { raw: { width: pixels.info.width, height: pixels.info.height, channels: 4 } })
    .rotate(layer.rotation, { background: { r: 0, g: 0, b: 0, alpha: 0 } }).raw().toBuffer({ resolveWithObject: true });
  return { data: pixels.data, width: pixels.info.width, height: pixels.info.height,
    x: Math.round(layer.x + (layer.width - pixels.info.width) / 2), y: Math.round(layer.y + (layer.height - pixels.info.height) / 2) };
}

export async function placedLayerPixels(source, layer, width, height, transformed) {
  const pixels = transformed || await transformedLayerPixels(source, layer);
  let image = sharp(pixels.data, { raw: { width: pixels.width, height: pixels.height, channels: 4 } });
  const left = Math.max(0, -pixels.x), top = Math.max(0, -pixels.y);
  const visibleWidth = Math.min(pixels.width - left, width - Math.max(0, pixels.x));
  const visibleHeight = Math.min(pixels.height - top, height - Math.max(0, pixels.y));
  if (visibleWidth <= 0 || visibleHeight <= 0) return null;
  image = image.extract({ left, top, width: visibleWidth, height: visibleHeight });
  const { data, info } = await image.raw().toBuffer({ resolveWithObject: true });
  for (let i = 3; i < data.length; i += 4) data[i] = Math.round(data[i] * layer.opacity);
  // Sharp's resize metadata may report premultiplication, but these returned pixels are straight RGBA.
  return { input: await sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } }).png().toBuffer(), left: Math.max(0, pixels.x), top: Math.max(0, pixels.y) };
}

export function createLayersService({ directory, client, getKey, resolveAsset, createTarget, recordHistory, readGenerated = readLayerDownload }) {
  const active = new Map(), reservations = new Map(), preparing = new Set();
  const receiptPath = id => { if (!validId(id)) throw fail("A valid Layers request ID is required."); return path.join(directory, `${id}.json`); };
  const write = job => writeJsonAtomic(receiptPath(job.id), job, { mode: 0o600 });
  const read = async id => { try { return JSON.parse(await readFile(receiptPath(id), "utf8")); } catch (e) { if (e.code === "ENOENT") return null; throw e; } };
  async function localImage(url) {
    const { filePath } = await resolveAsset(url);
    if ((await stat(filePath)).size > 32 * 1024 * 1024) throw fail("Layers source images must be no larger than 32 MB.");
    return raster(await readFile(filePath));
  }
  async function savePng(context, buffer, name) {
    const target = await createTarget(context, name, ".png");
    await writeFile(target.filePath, buffer, { flag: "wx" });
    return { url: target.publicPath, fileName: target.fileName, bytes: buffer.length, type: "image", mimeType: "image/png", label: name };
  }
  async function placedPixels(layer, width, height) {
    return placedLayerPixels(await localImage(layer.url), layer, width, height);
  }
  const blank = (width, height) => sharp({ create: { width, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });

  async function saveDocument(raw, context) {
    const doc = validateLayerDocument(raw);
    const composites = [], items = [];
    // Each output has the complete canvas dimensions, retaining registration and alpha on drag/export.
    for (const [index, layer] of doc.layers.entries()) {
      const pixels = await placedPixels(layer, doc.width, doc.height);
      const buffer = await blank(doc.width, doc.height).composite(pixels ? [pixels] : []).png().toBuffer();
      const item = await savePng(context, buffer, `layers-${String(index + 1).padStart(2, "0")}`);
      items.push({ ...item, label: layer.name, layerId: layer.id, width: doc.width, height: doc.height, alphaUrl: item.url });
      if (pixels && rasterLayerVisible(layer, doc.folders)) composites.push(pixels);
    }
    const composite = await savePng(context, await blank(doc.width, doc.height).composite(composites).png().toBuffer(), "layers-composite");
    return { ...doc, id: randomUUID(), createdAt: new Date().toISOString(),
      items: [{ ...composite, label: "Composite", width: doc.width, height: doc.height, alphaUrl: composite.url }, ...items] };
  }

  async function finish(job) {
    if (!job.document) {
      const outputs = job.remote?.outputs, metadata = job.remote?.layers;
      if (!Array.isArray(outputs) || outputs.length < 2 || outputs.length > job.request.limit || !Array.isArray(metadata) || metadata.length !== outputs.length) throw fail("Atlas returned incomplete layer data. No new generation was submitted.", 502);
      job.savedLayers ||= [];
      // A resumed, unfinished separation may have cached names from an older server.
      job.savedLayers = job.savedLayers.map((layer, index) => ({ ...layer, name: providerLayerName(metadata[index], index) }));
      for (let index = job.savedLayers.length; index < outputs.length; index++) {
        const image = await raster(await readGenerated(outputs[index]));
        if (!index) { job.width = image.width; job.height = image.height; }
        const bounds = providerLayerBounds(metadata[index], job.width, job.height, index, image.width, image.height);
        const z = metadata[index]?.z_index;
        if (!Number.isInteger(z) || z < 0 || (index === 0 && z !== 0) || (index > 0 && z <= metadata[index - 1]?.z_index)) throw fail("Atlas returned an invalid layer order.", 502);
        const item = await savePng(job.context, image.buffer, `layers-source-${index + 1}`);
        job.savedLayers.push({ id: `${job.id}-${index}`, url: item.url, name: providerLayerName(metadata[index], index),
          ...bounds, visible: true, locked: false, opacity: 1 });
        await write(job);
      }
      let layers = job.savedLayers, width = job.width, height = job.height;
      if (job.request.layerOnly) {
        if (!job.protectedLayers) {
          const source = await localImage(job.sourceSnapshot);
          width = source.width; height = source.height;
          const sourcePixels = await sharp(source.buffer).ensureAlpha().raw().toBuffer();
          const remaining = new Float32Array(width * height).fill(1), protectedLayers = [];
          // Process top to bottom, keeping every child on the original layer's native canvas.
          for (const layer of [...layers].reverse()) {
            const pixels = await placedPixels(layer, job.width, job.height);
            const full = await blank(job.width, job.height).composite(pixels ? [pixels] : []).png().toBuffer();
            const data = await sharp(full).resize(width, height, { fit: "fill" }).ensureAlpha().raw().toBuffer();
            confineLayerAlpha(data, sourcePixels, remaining, job.request.sourceOpacity);
            const item = await savePng(job.context, await sharp(data, { raw: { width, height, channels: 4 } }).png().toBuffer(), "layer-separation-source");
            protectedLayers.unshift({ ...layer, url: item.url, x: 0, y: 0, width, height });
          }
          job.protectedLayers = protectedLayers; job.nativeWidth = width; job.nativeHeight = height; await write(job);
        }
        layers = job.protectedLayers; width = job.nativeWidth; height = job.nativeHeight;
      }
      job.document = await saveDocument({ name: "Separation", sourceUrl: job.request.sourceUrl, width, height, layers }, job.context);
      if (job.request.layerOnly) job.document.layerSeparation = { sourceUrl: job.request.sourceUrl, sourceOpacity: job.request.sourceOpacity, alphaProtected: true };
      job.document.id = job.id;
      await write(job);
    }
    if (!job.historyRecorded) {
      await history(job, "completed");
      job.historyRecorded = true;
    }
    job.status = "completed"; job.error = ""; await write(job);
  }
  async function history(job, status) {
    await recordHistory({ id: job.id, createdAt: job.createdAt, mediaType: "image", provider: "Atlas Cloud", modelName: layersModel,
        endpoint: layersEndpoint, requestId: job.providerId, mode: "Layers", prompt: job.request.prompt,
        project: { id: job.context.projectId, name: job.context.projectName }, node: { id: job.context.nodeId, title: job.context.nodeTitle || "Layers" },
        settings: { ...job.request, ...(job.submittedPrompt ? { submittedPrompt: job.submittedPrompt } : {}), outputCount: job.savedLayers?.length || 0 }, cost: layersCost(), status,
        error: status === "completed" ? undefined : job.error,
        localImage: job.document?.items[0]?.url, outputFileName: job.document?.items[0]?.fileName,
        localLayers: job.document?.items.slice(1).map(item => item.url) || [] });
  }
  function launch(job, key, submit = false, source) {
    const task = (async () => {
      try {
        if (submit) {
          const image = await client.upload({ buffer: source.buffer, mimeType: "image/png", fileName: "layers-reference.png" }, key);
          const input = layersProviderInput(job.request, image);
          job.submittedPrompt = input.prompt;
          job.status = "submitting"; job.submissionAttempted = true; await write(job);
          const submitted = await client.submit({ mediaType: "image", key, input });
          job.providerId = submitted.requestId; job.status = "running"; await write(job);
        }
        if (!job.remote) {
          const result = await client.waitForResult({ mediaType: "image", model: layersEndpoint, requestId: job.providerId, key });
          job.remote = { outputs: result.job.outputs, layers: result.job.layers }; job.status = "saving"; await write(job);
        }
        await finish(job);
      } catch (error) {
        job.status = "uncertain";
        job.error = job.remote ? `Atlas completed the separation, but local saving needs attention. Check again to retry saving without generating. ${error.message}`
          : `Layers could not confirm completion. Check this request or Atlas history before generating again. ${error.message}`;
        if (job.providerId || job.remote || job.submissionAttempted) await history(job, "uncertain").catch(() => {});
        await write(job).catch(() => {});
      } finally { active.delete(job.id); }
    })();
    active.set(job.id, task);
  }
  async function start(body = {}) {
    receiptPath(body.requestId);
    const request = validateLayersRequest(body), context = contextOf(body);
    const digest = hash(JSON.stringify({ request, context }));
    if (reservations.has(body.requestId)) {
      const entry = reservations.get(body.requestId);
      if (entry.digest !== digest) throw fail("This Layers request belongs to different settings.", 409);
      return entry.promise;
    }
    const promise = (async () => {
      const existing = await read(body.requestId);
      if (existing) { if (existing.digest !== digest) throw fail("This Layers request belongs to different settings.", 409); return publicJob(existing); }
      if (active.size + preparing.size >= 2) throw fail("Two layer separations are already running. Wait for one to finish.", 429);
      preparing.add(body.requestId);
      try {
      const key = String(getKey() || "").trim();
      if (!key) throw fail("Enable Atlas Cloud in Settings to use Layers. No generation was submitted.");
      let source = await localImage(request.sourceUrl);
      if (source.buffer.length > 30 * 1024 * 1024 || (!request.layerOnly && source.width * source.height < 512 * 512) || source.width / source.height < 1 / 16 || source.width / source.height > 16) throw fail("Layers requires a source of at least 262,144 pixels, within 30 MB and a 1:16 to 16:1 aspect ratio.");
      const job = { id: body.requestId, digest, request, context, credential: hash(key), status: "preparing", createdAt: new Date().toISOString() };
      if (request.layerOnly) {
        const prepared = await prepareIsolatedLayer(source, request.limit);
        if (prepared.buffer.length > 30 * 1024 * 1024) throw fail("This layer is too large to submit safely.");
        job.sourceSnapshot = (await savePng(context, source.buffer, "layer-separation-original")).url;
        source = prepared;
      }
      await write(job); launch(job, key, true, source); return publicJob(job);
      } finally { preparing.delete(body.requestId); }
    })();
    reservations.set(body.requestId, { digest, promise });
    try { return await promise; } finally { reservations.delete(body.requestId); }
  }
  return { start,
    async inspect(id) {
      const job = await read(id);
      if (!job) throw fail("This Layers request is not confirmed. Check Atlas history before starting another.", 404);
      if (!active.has(id) && job.status !== "completed") {
        if (!job.remote && !job.providerId) return { ...publicJob(job), status: "uncertain", error: job.error || "Submission was interrupted. Check Atlas history; this request will not be resubmitted." };
        const key = String(getKey() || "").trim();
        if (!job.remote && (!key || hash(key) !== job.credential)) throw fail("Restore the original enabled Atlas key to check this request.", 409);
        if (active.size + preparing.size >= 2) throw fail("Two layer jobs are running. Check again when one finishes.", 429);
        active.set(id, null);
        try { job.status = job.remote ? "saving" : "running"; await write(job); launch(job, key); }
        catch (error) { active.delete(id); throw error; }
      }
      return publicJob(job);
    },
    async save(body) { return { document: await saveDocument(body.document, contextOf(body)) }; }
  };
}
