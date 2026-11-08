import { randomUUID, createHash } from "node:crypto";
import { stat, rm } from "node:fs/promises";
import path from "node:path";
import { editorEnd } from "../../src/editorTimeline.js";
import { normalizeEditorTransitions } from "../../src/editorTransitions.js";
import { probeEditorMedia, validateEditorRequest, buildEditorRenderArgs, executeEditorFfmpeg, editorWaveform } from "../editor-render.js";
import { normalizeEditorExportPath, prepareEditorExport, saveEditorExport } from "../editor-export.js";

export function registerEditorRoutes(app, { resolveAsset, createTarget, recordHistory, ffmpegPath, ffprobePath,
  probe = filePath => probeEditorMedia(filePath, ffprobePath), execute = (args, options) => executeEditorFfmpeg(ffmpegPath, args, options),
  waveform = (filePath, duration) => editorWaveform(filePath, duration, ffmpegPath) }) {
  const jobs = new Map(), probes = new Map();
  let inspecting = 0;
  const errorReply = (res, error) => res.status(error.status || 400).json({ error: error.message || "Editor request failed." });
  async function source(url) {
    if (typeof url !== "string" || !/^\/(?:uploads|outputs|workflow-assets)\//.test(url)) throw new Error("Use media uploaded or generated in NewtNode.");
    const { filePath } = await resolveAsset(url), info = await stat(filePath);
    if (!info.isFile()) throw new Error("The Editor source is not a media file.");
    const key = `${filePath}:${info.size}:${info.mtimeMs}`;
    if (!probes.has(key)) {
      if (probes.size >= 128) probes.delete(probes.keys().next().value);
      const metadata = await probe(filePath); probes.set(key, metadata);
    }
    return { filePath, ...probes.get(key) };
  }
  app.post("/api/editor/media", async (req, res) => {
    if (inspecting >= 2) return res.status(429).json({ error: "Editor media inspection is busy. Try the connection again shortly." });
    inspecting++;
    try {
      const media = await source(req.body?.url);
      if (req.body?.type && media.type !== req.body.type) throw new Error("The connected file does not match this media input.");
      let thumbnailUrl = "", peaks = [], warning = "";
      if (media.type === "video") {
        const target = await createTarget(req, "editor-thumbnail", ".jpg", "dependencies");
        try {
          await execute(["-v", "error", "-nostdin", "-y", "-i", media.filePath, "-frames:v", "1", "-vf", "scale=240:160:force_original_aspect_ratio=decrease", "-update", "1", target.filePath]);
          thumbnailUrl = target.publicPath;
        } catch { await rm(target.filePath, { force: true }).catch(() => {}); warning = "Thumbnail unavailable; the original media is retained."; }
      }
      if (media.hasAudio) {
        try { peaks = await waveform(media.filePath, media.duration); }
        catch { warning = "Waveform unavailable; audio is still included."; }
      }
      const { filePath, ...metadata } = media;
      res.json({ ...metadata, url: req.body.url, thumbnailUrl, waveform: peaks, warning });
    } catch (error) { errorReply(res, error); }
    finally { inspecting--; }
  });
  const publicJob = job => ({ id: job.id, status: job.status, progress: job.progress, result: job.result, error: job.error, warning: job.warning, savedFilePath: job.savedFilePath });
  app.get("/api/editor/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "This local export is no longer available. The server may have restarted; check History before exporting again." });
    res.json(publicJob(job));
  });
  app.delete("/api/editor/jobs/:id", (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: "Export not found." });
    if (job.status === "running") job.controller.abort();
    res.json(publicJob(job));
  });
  app.post("/api/editor/render", async (req, res) => {
    try {
      const body = req.body || {}, id = String(body.requestId || "");
      if (!/^[a-zA-Z0-9-]{16,80}$/.test(id)) throw new Error("A valid export request ID is required.");
      const digest = createHash("sha256").update(JSON.stringify(body)).digest("hex");
      if (jobs.has(id)) {
        if (jobs.get(id).digest !== digest) return res.status(409).json({ error: "This export request ID is already in use." });
        return res.json(publicJob(jobs.get(id)));
      }
      if ([...jobs.values()].filter(j => j.status === "running").length >= 2) return res.status(429).json({ error: "Two local exports are already running. Wait for one to finish." });
      const timeline = validateEditorRequest(body.timeline);
      const frame = body.frame == null ? null : Number(body.frame);
      if (frame != null && (!Number.isInteger(frame) || frame < 0 || frame >= editorEnd(timeline))) throw new Error("Choose a frame inside the sequence for the still grab.");
      const exportFilePath = body.exportFilePath ? normalizeEditorExportPath(body.exportFilePath) : "";
      if (frame != null && exportFilePath) throw new Error("A save destination is only supported for a sequence export.");
      for (const [key, job] of jobs) if (job.status !== "running" && Date.now() - job.createdAt > 3600000) jobs.delete(key);
      if (jobs.size >= 200) throw new Error("The local export history is full. Try again after older exports expire.");
      const job = { id, digest, status: "running", progress: 0, createdAt: Date.now(), controller: new AbortController() };
      jobs.set(id, job);
      res.status(202).json(publicJob(job));
      void render(job, req, timeline, frame, exportFilePath);
    } catch (error) { errorReply(res, error); }
  });

  async function render(job, req, timeline, frame, exportFilePath) {
    let target;
    try {
      const files = new Map();
      for (const asset of timeline.assets.filter(a => timeline.clips.some(c => c.assetId === a.id))) {
        job.controller.signal.throwIfAborted();
        const file = await source(asset.url); files.set(asset.id, file);
        if (asset.type !== file.type || asset.hasAudio !== file.hasAudio) throw new Error(`The source for ${asset.label} changed. Reconnect the current media.`);
        for (const clip of timeline.clips.filter(c => c.assetId === asset.id)) if ((clip.sourceIn + clip.duration) / timeline.fps > file.duration + 1 / timeline.fps) throw new Error(`The source for ${asset.label} is shorter than its timeline clip.`);
      }
      const actual = { ...timeline, assets: timeline.assets.map(a => ({ ...a, duration: files.get(a.id)?.duration ?? a.duration })) };
      if (JSON.stringify(normalizeEditorTransitions(actual)) !== JSON.stringify(timeline.transitions)) throw new Error("The audio sources no longer have enough spare media for a crossfade. Reconnect the current media.");
      const destination = exportFilePath ? await prepareEditorExport(exportFilePath, files.values()) : null;
      job.controller.signal.throwIfAborted();
      target = await createTarget(req, frame == null ? "editor-sequence" : "editor-still", frame == null ? ".mp4" : ".png");
      const length = frame == null ? ((timeline.outFrame ?? editorEnd(timeline)) - timeline.inFrame) / timeline.fps : 1 / timeline.fps;
      await execute(buildEditorRenderArgs(timeline, files, target.filePath, { frame }), { signal: job.controller.signal, onProgress: time => { job.progress = Math.min(0.99, Math.max(0, time / length)); } });
      job.controller.signal.throwIfAborted();
      if (!(await stat(target.filePath)).size) throw new Error("The local renderer produced an empty file.");
      const type = frame == null ? "video" : "image", createdAt = new Date().toISOString();
      if (destination) {
        try {
          await saveEditorExport(target.filePath, destination, { signal: job.controller.signal });
          job.savedFilePath = destination.filePath;
        } catch (error) {
          job.controller.signal.throwIfAborted();
          job.warning = `The export is available in NewtNode, but could not be saved to ${destination.filePath}. ${error.message} Use Last export to download the completed video.`;
        }
      }
      const cost = { amountUsd: 0, currency: "USD", pricingSource: "local-ffmpeg", pricingBasis: "Local Editor export", units: 1, unit: "export" };
      const fileName = destination ? path.basename(destination.filePath) : target.fileName;
      job.result = { url: target.publicPath, type, label: req.body.nodeTitle || "Editor", fileName,
        mimeType: frame == null ? "video/mp4" : "image/png", width: timeline.width, height: timeline.height, durationSeconds: frame == null ? length : undefined, fps: timeline.fps, cost, createdAt };
      try {
        await recordHistory({ id: randomUUID(), createdAt, mediaType: type, provider: "local", modelName: "Editor", endpoint: "local/editor",
          mode: frame == null ? "Timeline export" : "Timeline still", project: { id: req.body.projectId, name: req.body.projectName || req.body.workflowName },
          node: { id: req.body.nodeId, title: req.body.nodeTitle }, cost, settings: { fps: timeline.fps, width: timeline.width, height: timeline.height,
            inFrame: timeline.inFrame, outFrame: timeline.outFrame ?? editorEnd(timeline), frame, durationSeconds: length },
          [frame == null ? "localVideo" : "localImage"]: target.publicPath, outputFileName: fileName });
      } catch { job.warning = [job.warning, "The export is saved, but it could not be added to History."].filter(Boolean).join(" "); }
      job.status = "complete"; job.progress = 1;
    } catch (error) {
      if (target) await rm(target.filePath, { force: true }).catch(() => {});
      job.status = job.controller.signal.aborted ? "canceled" : "failed";
      job.error = job.controller.signal.aborted ? "Export canceled." : error.message;
    }
  }
  return { jobs };
}
