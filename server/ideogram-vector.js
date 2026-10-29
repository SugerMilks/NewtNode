import path from "node:path";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import sharp from "sharp";
import { writeJsonAtomic } from "./json-store.js";
import { sanitizeVectorSvg } from "./vector-svg.js";
import { validateIdeogramVectorRequest, ideogramVectorCost } from "../src/ideogramVector.js";

export const ideogramVectorEndpoints = {
  generate: "ideogram/vector/text-to-vector",
  vectorize: "ideogram/vector/image-to-vector"
};
const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const hash = value => createHash("sha256").update(value).digest("hex");
const validId = id => typeof id === "string" && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id);
const model = "Ideogram Vector";
const maxOutputBytes = 20 * 1024 * 1024;

export function ideogramVectorProviderInput(request, imageUrls) {
  if (request.mode === "vectorize") return { image_url: imageUrls[0], mode: request.vectorizeMode };
  return { prompt: request.prompt, quality: request.quality, aspect_ratio: request.aspectRatio, num_images: 1,
    ...(Number.isInteger(request.seed) ? { seed: request.seed } : {}),
    ...(imageUrls.length ? { image_urls: imageUrls } : {}) };
}

export async function validateVectorImage(image, { mode = "generate" } = {}) {
  const maximum = (mode === "vectorize" ? 50 : 10) * 1024 * 1024;
  if (!Buffer.isBuffer(image?.buffer) || !image.buffer.length || image.buffer.length > maximum)
    throw fail(`Ideogram Vector ${mode === "vectorize" ? "source images" : "references"} must be no larger than ${maximum / 1024 / 1024} MB.`);
  let metadata;
  try { metadata = await sharp(image.buffer, { limitInputPixels: 64000000, animated: false, failOn: "error" }).metadata(); }
  catch { throw fail("Choose a valid PNG, JPEG or WebP still image with no more than 64 megapixels."); }
  if (!["png", "jpeg", "webp"].includes(metadata.format) || !metadata.width || !metadata.height || (metadata.pages || 1) > 1)
    throw fail("Ideogram Vector accepts PNG, JPEG or WebP still images. Convert animated or vector sources to a still image first.");
  // Decode locally, before any upload, to reject truncated or malformed images.
  try { await sharp(image.buffer, { limitInputPixels: 64000000, animated: false, failOn: "error" }).resize(1, 1).raw().toBuffer(); }
  catch { throw fail("The source image could not be decoded. Choose an intact PNG, JPEG or WebP file."); }
  return { ...image, mimeType: `image/${metadata.format}`, fileName: image.fileName || `vector-reference.${metadata.format === "jpeg" ? "jpg" : metadata.format}` };
}

export async function renderVectorPreview(svgInput) {
  const sanitized = sanitizeVectorSvg(svgInput);
  const { data: png, info } = await sharp(Buffer.from(sanitized.svg), { limitInputPixels: 64000000, density: 72, failOn: "error" })
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true }).png().toBuffer({ resolveWithObject: true });
  return { ...sanitized, png, width: info.width, height: info.height, vectorWidth: sanitized.width, vectorHeight: sanitized.height };
}

export async function readGeneratedVector(url, fetchImpl = fetch) {
  let parsed;
  try { parsed = new URL(url); } catch { throw fail("Fal returned an invalid SVG download URL.", 502); }
  const trustedHost = parsed.hostname === "fal.media" || parsed.hostname.endsWith(".fal.media") || parsed.hostname === "storage.googleapis.com";
  if (parsed.protocol !== "https:" || !trustedHost || parsed.username || parsed.password || (parsed.port && parsed.port !== "443"))
    throw fail("Fal returned an unsupported SVG download location. Check Fal History for the completed vector.", 502);
  const response = await fetchImpl(parsed.href, { signal: AbortSignal.timeout(90000), redirect: "error" });
  if (!response.ok || !response.body) throw fail("Could not download the completed SVG. Check Fal History before rerunning.", 502);
  if (Number(response.headers.get("content-length")) > maxOutputBytes) throw fail("The generated SVG exceeds the 20 MB local safety limit.", 502);
  const reader = response.body.getReader(), chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxOutputBytes) throw fail("The generated SVG exceeds the 20 MB local safety limit.", 502);
      chunks.push(Buffer.from(value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks);
}

const contextKeys = ["projectId", "projectName", "workflowName", "workflowPackageId", "workflowPackagePath", "nodeId", "nodeTitle"];
const publicJob = job => ({ requestId: job.id, status: job.status === "submitting" || job.status === "saving" ? "running" : job.status,
  ...(job.item ? { item: job.item } : {}), warning: job.warning || "", ...(job.error ? { error: job.error } : {}) });

// Private receipts make a repeated request a lookup, including after a restart.
// A stopped browser only stops waiting: submitted provider work keeps saving here.
export function createIdeogramVectorService({ directory, getKey, clientFor, readSource, uploadImage, subscribe,
  save, recordHistory, readGenerated = readGeneratedVector, render = renderVectorPreview, charge = async () => null,
  estimateCost = ideogramVectorCost }) {
  const active = new Map(), activeNodes = new Map(), recovery = new Map();
  const receiptPath = id => {
    if (!validId(id)) throw fail("A valid Vector request ID is required.");
    return path.join(directory, `${id}.json`);
  };
  async function read(id) {
    try { return JSON.parse(await readFile(receiptPath(id), "utf8")); }
    catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  const write = job => writeJsonAtomic(receiptPath(job.id), job, { mode: 0o600 });

  async function finish(job) {
    if (!job.item) {
      const artwork = await render(await readGenerated(job.remote.url));
      const output = await save(job.context, artwork);
      job.item = { ...output, type: "image", mimeType: "image/png", model, provider: "fal.ai", cost: job.cost,
        label: job.context.nodeTitle || model, sourceUrl: output.url,
        width: artwork.width, height: artwork.height, vectorWidth: artwork.vectorWidth, vectorHeight: artwork.vectorHeight,
        shapeCount: artwork.shapeCount, vectorMode: job.request.mode, vectorSettings: job.request,
        ...(job.request.mode === "generate" ? { vectorQuality: job.request.quality } : { vectorizeMode: job.request.vectorizeMode, referenceSourceUrl: job.request.images[0].url }),
        ...(Number.isInteger(job.seed) ? { seed: job.seed } : {}) };
      await write(job);
    }
    if (!job.historyRecorded) {
      try {
        await recordHistory({ id: job.id, createdAt: job.createdAt, mediaType: "image", provider: "fal.ai", modelName: model,
          endpoint: job.endpoint, requestId: job.providerRequestId || "", mode: job.request.mode === "vectorize" ? "Image to Vector" : "Text to Vector",
          prompt: job.request.prompt || "", submittedPrompt: job.request.prompt || "",
          project: { id: job.context.projectId || "node-workspace", name: job.context.projectName || "Node workspace" },
          node: { id: job.context.nodeId, title: job.context.nodeTitle || model },
          settings: { ...job.request, width: job.item.width, height: job.item.height, vectorWidth: job.item.vectorWidth, vectorHeight: job.item.vectorHeight,
            shapeCount: job.item.shapeCount, ...(Number.isInteger(job.seed) ? { seed: job.seed } : {}) },
          localImage: job.item.url, localSvg: job.item.svgUrl, localThumbnail: job.item.thumbnailUrl,
          outputFileName: job.item.fileName, outputBytes: job.item.bytes, cost: job.cost });
        job.historyRecorded = true;
      } catch { job.warning = "SVG and PNG saved, but this run could not be added to History."; }
    }
    job.status = "completed"; job.error = "";
    await write(job);
    return publicJob(job);
  }

  async function inspectExisting(job) {
    if (job.status === "completed" || job.status === "failed") return publicJob(job);
    if (job.item || job.remote) {
      try { return await finish(job); }
      catch (error) {
        job.status = "uncertain";
        job.error = `The provider completed this vector, but local saving failed. Check this request again to retry saving without generating. ${error.message}`;
        await write(job); return publicJob(job);
      }
    }
    if (!job.providerRequestId) return { ...publicJob(job), status: "uncertain", error: job.error || "Submission was interrupted and cannot be confirmed. Check Fal History before starting a new vector. This request will not be resubmitted." };
    const key = String(getKey() || "").trim();
    if (!key || hash(key) !== job.credential) throw fail("Restore the original enabled Fal key to check this vector. No new generation was submitted.", 409);
    const client = clientFor(key, job.endpoint);
    const state = await client.queue.status(job.endpoint, { requestId: job.providerRequestId, logs: false });
    if (["FAILED", "CANCELED", "CANCELLED"].includes(state.status)) {
      job.status = "failed"; job.error = "Fal reported that this vector failed or was cancelled."; await write(job); return publicJob(job);
    }
    if (state.status !== "COMPLETED") return { ...publicJob(job), status: "running" };
    const result = await client.queue.result(job.endpoint, { requestId: job.providerRequestId });
    captureResult(job, result);
    const reported = await charge(job.providerRequestId, job.endpoint, key).catch(() => null);
    if (reported) job.cost = reported;
    await write(job);
    return inspectExisting(job);
  }

  function captureResult(job, result) {
    const data = result?.data || result;
    const images = data?.images;
    if (!Array.isArray(images) || images.length !== 1 || typeof images[0]?.url !== "string" || !images[0].url)
      throw fail("Fal returned no single SVG result. Check Fal History before starting another vector.", 502);
    job.remote = { url: images[0].url };
    if (Number.isInteger(data.seed)) job.seed = data.seed;
    if (result.requestId || result.request_id) job.providerRequestId = result.requestId || result.request_id;
    job.status = "saving";
  }

  async function execute(id, request, context, fingerprint) {
    let job = await read(id);
    if (job) {
      if (job.fingerprint !== fingerprint) throw fail("This Vector request ID belongs to different settings. No generation was resubmitted.", 409);
      const existing = await recover(job);
      if (existing.status === "completed") return existing;
      throw fail(existing.error || "This vector is still processing. Check the existing request; it will not be submitted again.", job.errorStatus || 409);
    }
    const key = String(getKey() || "").trim();
    if (!key) throw fail("Enable your existing Fal API key in Settings for Ideogram Vector. No other provider is used.");
    const nodeKey = context.nodeId ? `${context.projectId}:${context.nodeId}` : `request:${id}`;
    if (activeNodes.has(nodeKey)) throw fail("This Vector node already has a request running. Check that request before generating again.", 409);
    if (activeNodes.size >= 2) throw fail("Two vectors are already processing. Wait for one to finish before starting another.", 429);
    activeNodes.set(nodeKey, id);
    try {
      const endpoint = ideogramVectorEndpoints[request.mode];
      const client = clientFor(key, endpoint);
      // Every reference is validated before the first file can leave this computer.
      const images = await Promise.all(request.images.map(async image => validateVectorImage(await readSource(image.url, request.mode), request)));
      const imageUrls = [];
      for (let i = 0; i < images.length; i++) imageUrls.push(await uploadImage(images[i], i, client));
      job = { id, request, context, fingerprint, credential: hash(key), endpoint, createdAt: new Date().toISOString(),
        status: "submitting", cost: estimateCost(request) };
      // No paid call may begin unless intent was safely written first.
      await write(job);
      let enqueueWrite = Promise.resolve();
      try {
        const result = await subscribe(endpoint, { input: ideogramVectorProviderInput(request, imageUrls), logs: true,
          onEnqueue: providerRequestId => {
            if (typeof providerRequestId === "string" && providerRequestId) {
              job.providerRequestId = providerRequestId;
              enqueueWrite = enqueueWrite.then(() => write(job)).catch(() => {});
            }
          } }, { route: "ideogram-vector", model, node: context.nodeId }, client, key);
        await enqueueWrite;
        captureResult(job, result);
        const reported = await charge(job.providerRequestId, endpoint, key).catch(() => null);
        if (reported) job.cost = reported;
        await write(job);
        return await finish(job);
      } catch (error) {
        await enqueueWrite;
        const completed = Boolean(job.remote || job.item);
        job.status = completed || job.providerRequestId || ![400, 401, 403, 422].includes(error.status) ? "uncertain" : "failed";
        job.errorStatus = job.status === "uncertain" ? 502 : error.status || 502;
        job.error = completed
          ? `The provider completed this vector, but local saving failed. Check this request again to retry saving without generating. ${error.message}`
          : `Vector generation could not be confirmed. Check Fal History or this request before starting another vector. It was not automatically retried. ${error.message}`;
        await write(job).catch(() => {});
        throw fail(job.error, job.errorStatus);
      }
    } finally { if (activeNodes.get(nodeKey) === id) activeNodes.delete(nodeKey); }
  }

  async function recover(job) {
    if (recovery.has(job.id)) return recovery.get(job.id);
    const task = inspectExisting(job);
    recovery.set(job.id, task);
    try { return await task; }
    finally { if (recovery.get(job.id) === task) recovery.delete(job.id); }
  }

  return {
    async start(body = {}) {
      receiptPath(body.requestId);
      const request = validateIdeogramVectorRequest(body);
      const context = Object.fromEntries(contextKeys.map(key => [key, String(body[key] || "").slice(0, key.endsWith("Path") ? 4096 : 200)]));
      const fingerprint = hash(JSON.stringify({ request, context }));
      const existing = active.get(body.requestId);
      if (existing) {
        if (existing.fingerprint !== fingerprint) throw fail("This Vector request ID belongs to different settings. No generation was resubmitted.", 409);
        return existing.promise;
      }
      const entry = { fingerprint, status: "running" };
      entry.promise = execute(body.requestId, request, context, fingerprint);
      active.set(body.requestId, entry);
      try { return await entry.promise; }
      finally { if (active.get(body.requestId) === entry) active.delete(body.requestId); }
    },
    async inspect(id) {
      receiptPath(id);
      if (active.has(id)) return { requestId: id, status: "running", warning: "" };
      const job = await read(id);
      if (!job) throw fail("This Vector request is not recorded on this installation. Check Fal History before creating another vector.", 404);
      return recover(job);
    }
  };
}
