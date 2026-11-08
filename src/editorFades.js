export const editorFadeKey = edge => edge === "left" ? "fadeIn" : "fadeOut";

export function normalizeEditorFades(clip, scale = 1) {
  const frames = value => Number.isFinite(Number(value)) ? Math.max(0, Math.round(Number(value) * scale)) : 0;
  const fadeIn = Math.min(clip.duration, frames(clip.fadeIn));
  const fadeOut = Math.min(clip.duration - (fadeIn >= 2 ? fadeIn : 0), frames(clip.fadeOut));
  return { ...(fadeIn >= 2 ? { fadeIn } : {}), ...(fadeOut >= 2 ? { fadeOut } : {}) };
}

export function editorClipFade(clip, frame) {
  const age = frame - clip.start;
  const clamp = n => Math.max(0, Math.min(1, n));
  return (clip.fadeIn ? clamp(age / (clip.fadeIn - 1)) : 1)
    * (clip.fadeOut ? clamp((clip.duration - 1 - age) / (clip.fadeOut - 1)) : 1);
}

export function editorSetFade(timeline, clipId, edge, duration = timeline.fps) {
  const clip = timeline.clips.find(c => c.id === clipId);
  if (!clip || !["left", "right"].includes(edge)) throw new Error("Choose a clip edge first.");
  if (timeline.tracks.find(t => t.id === clip.trackId)?.locked) throw new Error("Unlock this track before changing its fade.");
  if (!Number.isFinite(duration) || duration < 0) throw new Error("Choose a valid fade length.");
  const key = editorFadeKey(edge), opposite = editorFadeKey(edge === "left" ? "right" : "left");
  const otherTransition = (timeline.transitions || []).find(t => edge === "left" ? t.leftId === clipId : t.rightId === clipId);
  const limit = clip.duration - Math.max(clip[opposite] || 0, (otherTransition?.duration || 0) / 2);
  if (duration && limit < 2) throw new Error("This clip needs at least two available frames for a fade. Shorten its other fade first.");
  const next = { ...clip };
  if (duration) next[key] = Math.min(limit, Math.max(2, Math.round(duration)));
  else delete next[key];
  // A clip edge has either a standalone fade or a two-clip transition, never both.
  const transitions = duration ? (timeline.transitions || []).filter(t => edge === "left" ? t.rightId !== clipId : t.leftId !== clipId) : timeline.transitions;
  return { ...timeline, clips: timeline.clips.map(c => c.id === clipId ? next : c), transitions };
}

export function editorResizeFade(timeline, clipId, edge, deltaFrames) {
  const clip = timeline.clips.find(c => c.id === clipId), duration = clip?.[editorFadeKey(edge)];
  if (!duration || !Number.isFinite(deltaFrames)) throw new Error("Select an existing fade to resize it.");
  return editorSetFade(timeline, clipId, edge, Math.max(2, duration + Math.round(deltaFrames) * (edge === "left" ? 1 : -1)));
}
