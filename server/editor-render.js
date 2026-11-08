import { spawn, execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { normalizeEditorTimeline, validateEditorTimeline, editorRange, editorLimits } from "../src/editorTimeline.js";
import { buildEditorTransitionRenderArgs } from "./editor-transition-render.js";
import { editorPositionFilter } from "./editor-position-render.js";

const execFile = promisify(execFileCallback);
const seconds = value => Number(value.toFixed(8));

export async function probeEditorMedia(filePath, ffprobePath) {
  const { stdout } = await execFile(ffprobePath, ["-v", "error", "-show_format", "-show_streams", "-of", "json", filePath],
    { windowsHide: true, timeout: 30000, maxBuffer: 2 * 1024 * 1024 });
  const data = JSON.parse(stdout), video = data.streams?.find(s => s.codec_type === "video" && !s.disposition?.attached_pic);
  const audio = data.streams?.find(s => s.codec_type === "audio");
  const duration = Number(data.format?.duration || video?.duration || audio?.duration);
  if (!Number.isFinite(duration) || duration <= 0 || (!video && !audio)) throw new Error("This file has no playable video or audio duration.");
  const rotation = Number(video?.side_data_list?.find(s => s.rotation != null)?.rotation || video?.tags?.rotate || 0);
  const rotated = Math.abs(rotation) % 180 === 90;
  return { type: video ? "video" : "audio", duration, width: Number(rotated ? video?.height : video?.width) || 0,
    height: Number(rotated ? video?.width : video?.height) || 0, hasAudio: Boolean(audio) };
}

export function validateEditorRequest(raw) {
  if (!raw || typeof raw !== "object" || !Array.isArray(raw.clips) || !Array.isArray(raw.assets) || !Array.isArray(raw.tracks)) throw new Error("Provide a valid Editor timeline.");
  if (raw.clips.length > editorLimits.clips || raw.assets.length > editorLimits.assets || raw.tracks.length > editorLimits.tracks) throw new Error("The timeline exceeds the Editor's track, clip or media limit.");
  const timeline = normalizeEditorTimeline(raw);
  if (raw.transitions != null && (!Array.isArray(raw.transitions) || raw.transitions.length > 200
    || raw.transitions.length !== timeline.transitions.length || raw.transitions.some((t, i) => !t || ["leftId", "rightId", "type", "duration"].some(k => t[k] !== timeline.transitions[i]?.[k])))) {
    throw new Error("The timeline contains an invalid transition. Check its clips and available source handles.");
  }
  if (timeline.clips.length !== raw.clips.length || timeline.assets.length !== raw.assets.length || timeline.tracks.length !== raw.tracks.length) throw new Error("The timeline contains invalid or duplicate media, clips or tracks.");
  for (const c of raw.clips) {
    const normalized = timeline.clips.find(n => n.id === c.id);
    if (["start", "sourceIn", "duration"].some(k => !Number.isInteger(c[k]) || normalized[k] !== c[k])) throw new Error("A clip extends beyond its source or sequence bounds.");
    for (const key of ["positionX", "positionY"]) if (Object.hasOwn(c, key)
      && (typeof c[key] !== "number" || !Number.isFinite(c[key]) || Math.abs(c[key]) > 100
        || (c[key] !== 0 && timeline.tracks.find(t => t.id === c.trackId)?.kind !== "video"))) {
      throw new Error("Video clip positions must be between -100% and 100%.");
    }
    for (const key of ["fadeIn", "fadeOut"]) if (Object.hasOwn(c, key)
      && (!Number.isInteger(c[key]) || c[key] < 0 || (normalized[key] || 0) !== c[key])) {
      throw new Error("Clip fades must fit within the clip and use whole frames (at least two frames per fade).");
    }
  }
  for (const a of timeline.assets) if (!/^\/(?:uploads|outputs|workflow-assets)\//.test(a.url) || /[\0\r\n]/.test(a.url)) throw new Error("Editor media must be uploaded or generated in NewtNode first.");
  if (!timeline.clips.length) throw new Error("Connect media before exporting.");
  validateEditorTimeline(timeline);
  const range = editorRange(timeline);
  if (range.end <= range.start) throw new Error("The Out point must be after the In point.");
  return timeline;
}

export function buildEditorRenderArgs(timeline, files, outputPath, { frame = null } = {}) {
  if (timeline.transitions?.length || timeline.clips.some(c => c.fadeIn || c.fadeOut)) return buildEditorTransitionRenderArgs(timeline, files, outputPath, { frame });
  const range = frame == null ? editorRange(timeline) : { start: frame, end: frame + 1 };
  const fps = timeline.fps, duration = seconds((range.end - range.start) / fps), tracks = timeline.tracks;
  const clips = timeline.clips.filter(c => !tracks.find(t => t.id === c.trackId)?.muted && c.start < range.end && c.start + c.duration > range.start
    && (frame == null || tracks.find(t => t.id === c.trackId)?.kind === "video"));
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-filter_complex_threads", "1"];
  const filters = [`color=c=black:s=${timeline.width}x${timeline.height}:r=${fps},trim=end_frame=${range.end - range.start},settb=expr=1/${fps},setpts=N,format=yuv420p[base]`];
  const segments = clips.map((clip, index) => {
    const start = Math.max(clip.start, range.start), end = Math.min(clip.start + clip.duration, range.end);
    const sourceFrame = clip.sourceIn + start - clip.start, frameCount = end - start, offsetFrame = start - range.start;
    const sourceTime = seconds(sourceFrame / fps), length = seconds(frameCount / fps), offset = seconds(offsetFrame / fps);
    const file = files.get(clip.assetId);
    if (!file?.filePath) throw new Error("An Editor source file is missing.");
    const kind = tracks.find(t => t.id === clip.trackId).kind;
    // Convert video to the sequence frame grid before trimming. Independent fractional seeks
    // change the sampling phase at a razor cut, especially when source and sequence FPS differ.
    if (kind === "video") args.push("-t", String(seconds((sourceFrame + frameCount + 1) / fps)), "-i", file.filePath);
    else args.push("-ss", String(sourceTime), "-t", String(length), "-i", file.filePath);
    return { clip, index, start: offset, length, sourceFrame, frameCount, offsetFrame, kind };
  });
  let picture = "base";
  const video = segments.filter(s => s.kind === "video").sort((a, b) => tracks.findIndex(t => t.id === b.clip.trackId) - tracks.findIndex(t => t.id === a.clip.trackId) || a.clip.start - b.clip.start);
  for (const s of video) {
    filters.push(`[${s.index}:v:0]setpts=PTS-STARTPTS,fps=${fps}:start_time=0,trim=start_frame=${s.sourceFrame}:end_frame=${s.sourceFrame + s.frameCount},tpad=stop_mode=clone:stop=1,trim=end_frame=${s.frameCount},settb=expr=1/${fps},setpts=N+${s.offsetFrame},scale=${timeline.width}:${timeline.height}:force_original_aspect_ratio=decrease,pad=${timeline.width}:${timeline.height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1${editorPositionFilter(s.clip, timeline.width, timeline.height)}[v${s.index}]`);
    filters.push(`[${picture}][v${s.index}]overlay=eof_action=repeat:repeatlast=1:enable='gte(round(t*${fps}),${s.offsetFrame})*lt(round(t*${fps}),${s.offsetFrame + s.frameCount})'[mix${s.index}]`);
    picture = `mix${s.index}`;
  }
  if (frame == null) {
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[silence]`);
    const audio = segments.filter(s => s.kind === "audio");
    for (const s of audio) {
      filters.push(`[${s.index}:a:0]atrim=duration=${s.length},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,volume=${s.clip.volume},adelay=${Math.round(s.start * 48000)}S:all=1[a${s.index}]`);
    }
    filters.push(`[silence]${audio.map(s => `[a${s.index}]`).join("")}amix=inputs=${audio.length + 1}:duration=first:normalize=0,alimiter=limit=0.98:level=false:latency=true[audio]`);
  }
  args.push("-filter_complex", filters.join(";"), "-map", `[${picture}]`);
  if (frame == null) args.push("-map", "[audio]", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", String(duration));
  else args.push("-an", "-c:v", "png", "-update", "1");
  args.push("-frames:v", String(range.end - range.start), "-threads", "2", "-progress", "pipe:1", outputPath);
  return args;
}

export function executeEditorFfmpeg(ffmpegPath, args, { signal, onProgress = () => {} } = {}) {
  return new Promise((resolve, reject) => {
    let stderr = "", pending = "", settled = false;
    const child = spawn(ffmpegPath, args, { windowsHide: true, signal, stdio: ["ignore", "pipe", "pipe"] });
    const finish = error => { if (settled) return; settled = true; error ? reject(error) : resolve(); };
    child.stderr.on("data", data => { stderr = (stderr + data).slice(-6000); });
    child.stdout.on("data", data => {
      pending += data;
      const lines = pending.split("\n"); pending = lines.pop();
      for (const line of lines) if (line.startsWith("out_time_us=")) onProgress(Number(line.slice(12)) / 1000000);
    });
    // Cancellation emits an error before close. Wait for file handles to close before cleanup.
    child.on("error", error => { if (error.name !== "AbortError") finish(error); });
    child.on("close", code => finish(code === 0 ? null : new Error(signal?.aborted ? "Export canceled." : `Editor export failed. ${stderr.trim() || `FFmpeg exited with code ${code}.`}`)));
  });
}

export async function editorWaveform(filePath, duration, ffmpegPath) {
  if (duration > editorLimits.seconds) return [];
  const { stdout } = await execFile(ffmpegPath, ["-v", "error", "-nostdin", "-i", filePath, "-vn", "-ac", "1", "-ar", "1000", "-f", "f32le", "pipe:1"],
    { windowsHide: true, timeout: 60000, encoding: "buffer", maxBuffer: (editorLimits.seconds * 1000 + 10000) * 4 });
  const count = Math.floor(stdout.length / 4), peaks = Array(256).fill(0);
  for (let i = 0; i < count; i++) peaks[Math.min(255, Math.floor(i * 256 / count))] = Math.max(peaks[Math.min(255, Math.floor(i * 256 / count))], Math.min(1, Math.abs(stdout.readFloatLE(i * 4))));
  return peaks;
}
