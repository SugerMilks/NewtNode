import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { stat, rename, rm, access } from "node:fs/promises";

// Display-only proxies. Canonical MOV URLs still flow to downloads, exports,
// workflow packages, and downstream models.
export function registerVideoPreviewRoute(app, { limiter, resolveAsset, runFfmpeg, cacheDir }) {
  const jobs = new Map();
  app.get("/api/video-preview", limiter, async (req, res) => {
    try {
      const url = String(req.query.url || "");
      if (!/^\/(?:uploads|outputs|workflow-assets|saved_workflows)\//.test(url) || !/\.(?:mov|qt)$/i.test(url)) throw new Error("Only managed local MOV files can be previewed.");
      const source = await resolveAsset(url);
      const info = await stat(source.filePath);
      const key = createHash("sha256").update(`${url}:${info.size}:${info.mtimeMs}`).digest("hex").slice(0, 24);
      const name = `${key}-preview.mp4`, target = path.join(cacheDir, name);
      const exists = await access(target).then(() => true, () => false);
      if (!exists && !jobs.has(target)) {
        const job = (async () => {
          const temporary = `${target}.${randomUUID()}.mp4`;
          try {
            await runFfmpeg(["-y", "-i", source.filePath, "-map", "0:v:0", "-map", "0:a?", "-vf", "scale=trunc(iw/2)*2:trunc(ih/2)*2", "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-c:a", "aac", "-movflags", "+faststart", temporary], "Video display preview", 600000);
            await rename(temporary, target);
          } finally { await rm(temporary, { force: true }); }
        })().finally(() => jobs.delete(target));
        jobs.set(target, job);
      }
      if (jobs.has(target)) await jobs.get(target);
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, `/outputs/thumbnails/runtime/${name}`);
    } catch (error) { res.status(400).json({ error: error.message || "Could not create video preview." }); }
  });
}
