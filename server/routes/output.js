import { createHash } from "node:crypto";
import path from "node:path";
import { normalizeOutputRequest, outputLimits, outputError, outputFileError, validateOutputDestinations,
  exportOutputItem, verifyOutputReceipt, revealOutputPath, createOutputReceiptStore } from "../output-export.js";

export function registerOutputRoutes(app, { resolveAsset, ffmpegPath, ffprobePath, receiptStorePath, probe, convert, publish, reveal = revealOutputPath } = {}) {
  if (typeof resolveAsset !== "function") throw new TypeError("Output requires a read-only managed resolveAsset(url) => { filePath } dependency.");
  const jobs = new Map(), receipts = createOutputReceiptStore(receiptStorePath);
  let inspecting = 0, revealing = 0;
  const publicJob = job => ({ id: job.id, status: job.status, progress: job.progress,
    results: job.results.map(result => ({ ...result })), ...(job.error ? { error: job.error } : {}), ...(job.warning ? { warning: job.warning } : {}) });
  const replyError = (res, error) => res.status(error.status || 400).json({ error: outputFileError(error) });

  app.post("/api/output/validate", async (req, res) => {
    if (inspecting >= outputLimits.inspections) return replyError(res, outputError("Output folder validation is busy. Try again shortly.", 429));
    inspecting++;
    try { res.json(await validateOutputDestinations(req.body?.destinations, req.body?.types)); }
    catch (error) { replyError(res, error); }
    finally { inspecting--; }
  });

  app.post("/api/output/export", (req, res) => {
    try {
      const request = normalizeOutputRequest(req.body), id = request.requestId;
      const digest = createHash("sha256").update(JSON.stringify(request)).digest("hex");
      const previous = jobs.get(id);
      if (previous) {
        if (previous.digest !== digest) throw outputError("This requestId already belongs to a different Output export. Use a new UUID for changed items or settings.", 409);
        return res.json(publicJob(previous));
      }
      if ([...jobs.values()].filter(job => job.status === "running").length >= outputLimits.concurrent) throw outputError("Two local Output exports are already running. Wait for one to finish or cancel it.", 429);
      // Retain IDs for the server session; evicting them could silently duplicate a retried export.
      if (jobs.size >= outputLimits.jobs) throw outputError("This server session's Output job history is full. Existing jobs remain readable; restart the server manually when no exports are running to begin a new session.", 429);
      const job = { id, digest, status: "running", progress: 0, results: [], controller: new AbortController() };
      jobs.set(id, job);
      res.status(202).json(publicJob(job));
      job.done = run(job, request);
    } catch (error) { replyError(res, error); }
  });

  app.get("/api/output/jobs/:id", (req, res) => {
    const job = jobs.get(String(req.params.id).toLowerCase());
    if (!job) return replyError(res, outputError("This Output job is not in this server session. The server may have restarted. Check the destination folder before starting another export.", 404));
    res.json(publicJob(job));
  });

  app.delete("/api/output/jobs/:id", (req, res) => {
    const job = jobs.get(String(req.params.id).toLowerCase());
    if (!job) return replyError(res, outputError("Output job not found in this server session.", 404));
    if (job.status === "running") job.controller.abort();
    // Keep running until the encoder has closed and temporary files have been cleaned up.
    res.json(publicJob(job));
  });

  app.post("/api/output/reveal", async (req, res) => {
    try {
      const filePath = req.body?.filePath;
      await receipts.ready;
      const receipt = typeof filePath === "string" && path.isAbsolute(filePath) ? receipts.find(filePath) : null;
      if (!receipt) throw outputError(`Reveal is allowed only for files or containing folders in Output's saved receipt allowlist. Older receipts may have expired, or the server restarted without receipt persistence. Open the saved path manually; do not re-export just to enable Reveal.${receipts.loadWarning ? ` ${receipts.loadWarning}` : ""}`, 403);
      if (revealing >= 2) throw outputError("A reveal request is already being opened. Try again shortly.", 429);
      revealing++;
      try {
        const options = await verifyOutputReceipt(receipt, filePath);
        await reveal(filePath, options);
        res.json({ revealed: true, filePath });
      } finally { revealing--; }
    } catch (error) { replyError(res, error); }
  });

  async function run(job, request) {
    await receipts.ready;
    const signal = job.controller.signal;
    for (let index = 0; index < request.items.length; index++) {
      const item = request.items[index];
      try {
        signal.throwIfAborted();
        const result = await exportOutputItem(item, request.destinations[item.type], {
          resolveAsset, ffmpegPath, ffprobePath, signal, probe, convert, publish, collision: request.collision,
          onProgress: progress => { if (Number.isFinite(progress)) job.progress = Math.max(job.progress, (index + Math.max(0, Math.min(0.99, progress))) / request.items.length); },
          onSaved: receipt => receipts.remember(receipt)
        });
        job.results.push(result);
        if (result.status === "saved") {
          try {
            const warning = await receipts.persist();
            if (warning) job.warning = warning;
          } catch (error) { job.warning = `The file was saved, but its Reveal receipt could not be persisted. ${outputFileError(error)}`; }
        }
      } catch (error) {
        job.results.push({ sourceUrl: item.url, type: item.type, filePath: "", fileName: "", status: "failed",
          error: signal.aborted ? "Export canceled before this item was saved." : outputFileError(error) });
      }
      job.progress = (index + 1) / request.items.length;
    }
    const failed = job.results.filter(result => result.status === "failed");
    job.status = signal.aborted ? "canceled" : failed.length === request.items.length ? "failed" : failed.length ? "partial" : "complete";
    job.progress = 1;
    if (signal.aborted) job.error = "Export canceled. Files already saved were retained; remaining items were not exported.";
    else if (failed.length) job.error = `${failed.length} of ${request.items.length} items failed. ${failed[0].error}`;
  }

  return { jobs, ready: receipts.ready };
}
