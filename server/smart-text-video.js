import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { smartTextMaxVideos } from "../src/smartTextPrompt.js";

export function smartTextVideoSampleTimes(duration, fps = 24) {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error("The video duration could not be read. Re-upload a playable video before running Smart Text.");
  const frameDuration = 1 / (Number.isFinite(fps) && fps > 0 ? fps : 24);
  const end = Math.max(0, duration - Math.max(frameDuration, 0.05));
  const count = end === 0 ? 1 : Math.min(8, Math.max(2, Math.ceil(duration / frameDuration)));
  return Array.from({ length: count }, (_, index) => end * index / Math.max(1, count - 1));
}

export function createSmartTextVideoSampler({ resolveAsset, probeVideo, runFfmpeg }) {
  return async function sampleVideos(inputs = []) {
    if (inputs.length > smartTextMaxVideos) throw new Error(`Smart Text supports up to ${smartTextMaxVideos} video references.`);
    if (!inputs.length) return { frames: [], videos: [] };
    // Prepare every source before starting extraction. Remote URLs and arbitrary local files are not accepted.
    const sources = [];
    for (const [index, input] of inputs.entries()) {
      if (!/^\/(uploads|outputs|workflow-assets)\//.test(input?.url || "")) throw new Error("Smart Text can only review managed project videos. Upload the video first.");
      const source = await resolveAsset(input.url);
      if (!/\.(mp4|mov|webm|mkv|m4v)$/i.test(source.fileName || source.filePath)) throw new Error("Connect a playable video to Smart Text's Video input.");
      const info = await stat(source.filePath);
      if (!info.isFile() || info.size > 512 * 1024 * 1024) throw new Error("Smart Text video references must be files of 512 MB or less.");
      const metadata = await probeVideo(source.filePath);
      if (!(metadata.width > 0 && metadata.height > 0)) throw new Error("The reference does not contain a readable video track.");
      const times = smartTextVideoSampleTimes(Number(metadata.duration), Number(metadata.fps));
      sources.push({ ...source, url: input.url, label: `Video ${index + 1} (${input.label || input.tag || "Reference"})`, duration: Number(metadata.duration), times });
    }
    const directory = await mkdtemp(path.join(tmpdir(), "newt-smart-text-video-"));
    const frames = [], videos = [];
    try {
      for (const [clip, source] of sources.entries()) {
        for (const [index, time] of source.times.entries()) {
          const fileName = `clip-${clip + 1}-frame-${index + 1}.jpg`;
          const output = path.join(directory, fileName);
          await runFfmpeg(["-hide_banner", "-loglevel", "error", "-y", "-ss", time.toFixed(6), "-i", source.filePath,
            "-map", "0:v:0", "-frames:v", "1", "-an", "-vf", "scale='min(1024,iw)':'min(1024,ih)':force_original_aspect_ratio=decrease", "-q:v", "3", output], "Smart Text video review", 30000);
          const buffer = await readFile(output);
          if (!buffer.length) throw new Error("A video frame could not be decoded. Your previous prompt has been kept.");
          frames.push({ type: "image", label: `${source.label}, sample ${index + 1}/${source.times.length}, ${time.toFixed(3)}s of ${source.duration.toFixed(3)}s`,
            asset: { buffer, fileName, mimeType: "image/jpeg" } });
        }
        videos.push({ url: source.url, label: source.label, duration: source.duration, sampleTimes: source.times, frameCount: source.times.length });
      }
      return { frames, videos };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  };
}
