import { editorVideoSegments, editorVideoLayers, editorAudioSegments } from "./editorTransitions.js";

export const editorPlaybackLookaheadSeconds = 4;
export const editorPlaybackWarmLimit = 8;

export function editorPlaybackSchedule(timeline) {
  const tracks = new Map(timeline.tracks.map((t, rank) => [t.id, { ...t, rank }]));
  const segments = editorVideoSegments(timeline).filter(s => !tracks.get(s.trackId)?.muted)
    .sort((a, b) => tracks.get(a.trackId).rank - tracks.get(b.trackId).rank);
  // Include track reveals and dip midpoints, not just nominal clip starts. These
  // boundaries tell the decoder exactly which source frame will be needed next.
  const boundaries = [...new Set(segments.flatMap(s => [s.start, s.end,
    ...(s.clip?.fadeIn ? [s.clip.start + s.clip.fadeIn] : []),
    ...(s.clip?.fadeOut ? [s.clip.start + s.clip.duration - s.clip.fadeOut] : []),
    ...(s.transition?.type === "dipToBlack" ? [s.transition.cut] : [])]))].sort((a, b) => a - b);
  const video = [], media = [];
  for (let i = 0; i + 1 < boundaries.length; i++) {
    const start = boundaries[i], end = boundaries[i + 1];
    const visible = [];
    for (const segment of segments.filter(s => start >= s.start && start < s.end)) {
      visible.push(segment);
      const clip = segment.clip;
      if (!clip || !((clip.fadeIn && start < clip.start + clip.fadeIn) || (clip.fadeOut && end > clip.start + clip.duration - clip.fadeOut))) break;
    }
    if (!visible.length) continue;
    video.push({ start, end, segment: visible[0], segments: visible.reverse() });
    for (const segment of visible) for (const { clip } of editorVideoLayers(segment, start)) media.push({ clip, kind: "video", start, end });
  }
  const audio = editorAudioSegments(timeline).filter(s => !tracks.get(s.trackId)?.muted);
  media.push(...audio.map(s => ({ ...s, kind: "audio" })));
  const merged = [];
  for (const item of media.sort((a, b) => a.start - b.start || a.end - b.end)) {
    const previous = merged.findLast(s => s.clip.id === item.clip.id);
    if (previous?.end === item.start) previous.end = item.end;
    else merged.push({ ...item });
  }
  return { video, audio, media: merged.sort((a, b) => a.start - b.start) };
}

export function editorUpcomingMedia(schedule, frame, fps, activeIds, rate = 1) {
  const seen = new Set(activeIds), upcoming = [];
  const distance = fps * editorPlaybackLookaheadSeconds * Math.abs(rate);
  const candidates = rate < 0 ? schedule.media.filter(s => s.kind === "video").sort((a, b) => b.end - a.end) : schedule.media;
  for (const item of candidates) {
    const outside = rate < 0 ? item.end > frame || item.end < frame - distance : item.start <= frame || item.start > frame + distance;
    if (outside || seen.has(item.clip.id)) continue;
    seen.add(item.clip.id); upcoming.push(item);
    if (upcoming.length === editorPlaybackWarmLimit) break;
  }
  return upcoming;
}
