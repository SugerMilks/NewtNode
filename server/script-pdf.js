import { Worker } from "node:worker_threads";
import { createHash } from "node:crypto";
import { scriptFileByteLimit } from "../src/storyboardScriptImport.js";

export function validatePdfBytes(buffer) {
  if (!buffer?.length || buffer.length > scriptFileByteLimit) throw new Error("Choose a PDF no larger than 40 MB.");
  if (!Buffer.from(buffer).subarray(0, 1024).includes(Buffer.from("%PDF-"))) throw new Error("This file is not a valid PDF.");
}

export function readScriptPdf(buffer, page = null, timeout = 60000) {
  validatePdfBytes(buffer);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./script-pdf-worker.js", import.meta.url), { workerData: { buffer, page }, resourceLimits: { maxOldGenerationSizeMb: 384 } });
    let done = false;
    const finish = (error, value) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      void worker.terminate();
      error ? reject(error) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error("PDF reading took too long. Try exporting a smaller or flattened PDF.")), timeout);
    worker.on("message", result => finish(result.error ? new Error(result.error) : null, result));
    worker.on("error", error => finish(error));
    worker.on("exit", code => { if (!done) finish(new Error(`PDF reader stopped (${code}). Export a fresh PDF and try again.`)); });
  });
}

export function createScriptPdfReader(readAsset) {
  const cache = new Map();
  return async url => {
    const asset = await readAsset(url);
    validatePdfBytes(asset.buffer);
    const digest = createHash("sha256").update(asset.buffer).digest("hex");
    let entry = cache.get(digest);
    if (!entry) {
      const parsed = await readScriptPdf(asset.buffer);
      entry = { ...parsed, digest, buffer: asset.buffer };
      if (cache.size >= 3) cache.delete(cache.keys().next().value);
      cache.set(digest, entry);
    }
    return entry;
  };
}
