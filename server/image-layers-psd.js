import path from "node:path";
import { createHash } from "node:crypto";
import { Worker } from "node:worker_threads";
import { rm } from "node:fs/promises";
import { validateLayerDocument } from "../src/imageLayers.js";
import { prepareFileExport, saveEditorExport } from "./editor-export.js";

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
export function normalizePsdExportPath(value) {
  if (typeof value !== "string" || !value.trim() || /[\x00-\x1f]/.test(value) || !path.isAbsolute(value)) throw fail("Choose an absolute save path for the PSD export.");
  const extension = path.extname(value);
  if (extension && extension.toLowerCase() !== ".psd") throw fail("Save the layered image with a .psd extension.");
  return path.resolve(extension ? value : `${value}.psd`);
}

export function renderLayersPsd(document, files, output) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./image-layers-psd-worker.js", import.meta.url), { workerData: { document, files, output } });
    let result;
    worker.once("message", message => { result = message; });
    worker.once("error", reject);
    worker.once("exit", code => code === 0 && result?.bytes ? resolve(result.bytes) : reject(new Error(result?.error || "PSD export was interrupted. The original layers are unchanged.")));
  });
}

export function createLayersPsdService({ resolveAsset, createTarget, render = renderLayersPsd, saveCopy = saveEditorExport }) {
  const jobs = new Map();
  const publicJob = job => ({ requestId: job.id, status: job.status, result: job.result, error: job.error || "", warning: job.warning || "" });
  async function exportJob(job, body, document, exportFilePath) {
    let target;
    try {
      const sources = [];
      for (const layer of document.layers) sources.push(await resolveAsset(layer.url));
      const protectedSources = [...sources];
      if (document.sourceUrl) protectedSources.push(await resolveAsset(document.sourceUrl));
      const destination = await prepareFileExport(exportFilePath, protectedSources, "layer source file");
      target = await createTarget(body, "layers", ".psd");
      const bytes = await render(document, sources.map(source => source.filePath), target.filePath);
      job.result = { url: target.publicPath, fileName: path.basename(destination.filePath), documentId: document.id,
        mimeType: "image/vnd.adobe.photoshop", bytes, layerCount: document.layers.length, width: document.width, height: document.height };
      try { await saveCopy(target.filePath, destination); job.result.savedFilePath = destination.filePath; }
      catch (error) { job.warning = `The PSD was created in NewtNode, but its destination copy could not be saved. ${error.message} Download the saved PSD below.`; }
      job.status = "completed";
    } catch (error) {
      if (target) await rm(target.filePath, { force: true }).catch(() => {});
      job.status = "failed"; job.error = error.message;
    }
  }
  return {
    start(body = {}) {
      const id = body.requestId;
      if (typeof id !== "string" || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(id)) throw fail("A valid PSD export request ID is required.");
      const document = validateLayerDocument(body.document), exportFilePath = normalizePsdExportPath(body.exportFilePath);
      const digest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
      if (jobs.has(id)) {
        if (jobs.get(id).digest !== digest) throw fail("This PSD export belongs to different settings.", 409);
        return publicJob(jobs.get(id));
      }
      if ([...jobs.values()].some(job => job.status === "running")) throw fail("A PSD is already being exported. Wait for it to finish.", 429);
      for (const [key, job] of jobs) if (job.status !== "running" && Date.now() - job.createdAt > 3600000) jobs.delete(key);
      if (jobs.size >= 200) throw fail("The local export history is full. Try again after older exports expire.", 429);
      const job = { id, digest, status: "running", createdAt: Date.now() }; jobs.set(id, job);
      void exportJob(job, body, document, exportFilePath);
      return publicJob(job);
    },
    inspect(id) {
      if (!jobs.has(id)) throw fail("This PSD export is not available after a restart. Check the chosen destination before exporting again.", 404);
      return publicJob(jobs.get(id));
    }
  };
}
