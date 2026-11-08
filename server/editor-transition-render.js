import { editorVideoSegments, editorAudioSegments } from "../src/editorTransitions.js";
import { editorRange } from "../src/editorTimeline.js";
import { editorPositionFilter } from "./editor-position-render.js";

const seconds = value => Number(value.toFixed(8));

export function buildEditorTransitionRenderArgs(timeline, files, outputPath, { frame = null } = {}) {
  const range = frame == null ? editorRange(timeline) : { start: frame, end: frame + 1 };
  const { fps, width, height, tracks } = timeline, count = range.end - range.start, duration = seconds(count / fps);
  const args = ["-hide_banner", "-loglevel", "error", "-nostdin", "-y", "-filter_complex_threads", "1"];
  const filters = [`color=c=black:s=${width}x${height}:r=${fps},trim=end_frame=${count},settb=expr=1/${fps},setpts=N,format=yuv420p[base]`];
  let input = 0, label = 0, picture = "base";
  const visible = s => !tracks.find(t => t.id === s.trackId)?.muted && s.start < range.end && s.end > range.start;
  const fileFor = clip => {
    const file = files.get(clip.assetId);
    if (!file?.filePath) throw new Error("An Editor source file is missing.");
    return file.filePath;
  };
  function videoInput(clip, start, end) {
    const asset = timeline.assets.find(a => a.id === clip.assetId), available = Math.floor(asset.duration * fps + .00001);
    const wanted = clip.sourceIn + start - clip.start, length = end - start;
    const first = Math.min(available - 1, Math.max(0, wanted));
    const last = Math.min(available, Math.max(first + 1, wanted + length));
    const before = Math.min(length - 1, Math.max(0, -wanted)), after = Math.max(1, length - (last - first) - before);
    const name = `source${label++}`;
    args.push("-t", String(seconds((last + 1) / fps)), "-i", fileFor(clip));
    // Preserve the source's FPS sampling phase. Missing video handles hold the edge frame,
    // never shorten the sequence or reveal a lower track during an opaque transition.
    filters.push(`[${input++}:v:0]setpts=PTS-STARTPTS,fps=${fps}:start_time=0,trim=start_frame=${first}:end_frame=${last},settb=expr=1/${fps},setpts=N,tpad=start_mode=clone:start=${before}:stop_mode=clone:stop=${after},trim=end_frame=${length},setpts=N,scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:black,setsar=1${editorPositionFilter(clip, width, height)},format=gbrp[${name}]`);
    return name;
  }
  const video = editorVideoSegments(timeline).filter(visible).sort((a, b) => tracks.findIndex(t => t.id === b.trackId) - tracks.findIndex(t => t.id === a.trackId) || a.start - b.start);
  for (const segment of video) {
    const start = Math.max(segment.start, range.start), end = Math.min(segment.end, range.end), offset = start - range.start;
    let source;
    if (segment.transition) {
      const t = segment.transition, a = videoInput(t.left, start, end), b = videoInput(t.right, start, end);
      const p = `(T*${fps}+${start - t.start})/${t.duration}`;
      const expression = t.type === "dipToBlack" ? `A*max(0,1-2*(${p}))+B*max(0,2*(${p})-1)` : `A*(1-(${p}))+B*(${p})`;
      source = `blend${label++}`;
      filters.push(`[${a}][${b}]blend=all_expr='${expression}':shortest=1[${source}]`);
    } else {
      source = videoInput(segment.clip, start, end);
      const clip = segment.clip;
      if (clip.fadeIn || clip.fadeOut) {
        const faded = `fade${label++}`;
        const fades = [clip.fadeIn ? `fade=t=in:st=0:d=${seconds((clip.fadeIn - 1) / fps)}:alpha=1` : "",
          clip.fadeOut ? `fade=t=out:st=${seconds((clip.duration - clip.fadeOut) / fps)}:d=${seconds((clip.fadeOut - 1) / fps)}:alpha=1` : ""].filter(Boolean);
        filters.push(`[${source}]format=yuva420p,settb=expr=1/${fps},setpts=N+${start - clip.start},${fades.join(",")},setpts=N[${faded}]`);
        source = faded;
      }
    }
    const placed = `placed${label++}`, mixed = `mix${label++}`;
    filters.push(`[${source}]settb=expr=1/${fps},setpts=N+${offset}[${placed}]`);
    filters.push(`[${picture}][${placed}]overlay=eof_action=repeat:repeatlast=1:enable='gte(round(t*${fps}),${offset})*lt(round(t*${fps}),${end - range.start})'[${mixed}]`);
    picture = mixed;
  }
  if (frame == null) {
    filters.push(`anullsrc=r=48000:cl=stereo,atrim=duration=${duration}[silence]`);
    const audio = [];
    for (const segment of editorAudioSegments(timeline).filter(visible)) {
      const start = Math.max(segment.start, range.start), end = Math.min(segment.end, range.end), clip = segment.clip;
      const length = seconds((end - start) / fps), offset = Math.round((start - range.start) * 48000 / fps);
      args.push("-ss", String(seconds((clip.sourceIn + start - clip.start) / fps)), "-t", String(length), "-i", fileFor(clip));
      const ramp = t => `clip((t*${fps}+${start - t.start})/${t.duration},0,1)`;
      const gain = `${clip.volume}${segment.fadeIn ? `*(${ramp(segment.fadeIn)})` : ""}${segment.fadeOut ? `*(1-${ramp(segment.fadeOut)})` : ""}`
        + (clip.fadeIn ? `*clip((t*${fps}+${start - clip.start})/${clip.fadeIn - 1},0,1)` : "")
        + (clip.fadeOut ? `*clip((${clip.start + clip.duration - 1 - start}-t*${fps})/${clip.fadeOut - 1},0,1)` : "");
      const name = `audio${label++}`;
      filters.push(`[${input++}:a:0]atrim=duration=${length},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,aeval=exprs='val(ch)*(${gain})':c=same,adelay=${offset}S:all=1[${name}]`);
      audio.push(`[${name}]`);
    }
    filters.push(`[silence]${audio.join("")}amix=inputs=${audio.length + 1}:duration=first:normalize=0,alimiter=limit=0.98:level=false:latency=true[audio]`);
  }
  args.push("-filter_complex", filters.join(";"), "-map", `[${picture}]`);
  if (frame == null) args.push("-map", "[audio]", "-c:v", "libx264", "-preset", "fast", "-crf", "18", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-movflags", "+faststart", "-t", String(duration));
  else args.push("-an", "-c:v", "png", "-update", "1");
  args.push("-frames:v", String(count), "-threads", "2", "-progress", "pipe:1", outputPath);
  return args;
}
