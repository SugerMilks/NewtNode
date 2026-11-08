import { editorClipFade } from "./editorFades.js";

export const editorTransitionTypes = Object.freeze({
  crossDissolve: { label: "Cross Dissolve", kind: "video" },
  dipToBlack: { label: "Dip to Black", kind: "video" },
  crossFade: { label: "Cross Fade", kind: "audio" }
});

export function editorCuts(timeline, trackId) {
  const clips = timeline.clips.filter(c => c.trackId === trackId).sort((a, b) => a.start - b.start);
  return clips.slice(1).flatMap((right, i) => {
    const left = clips[i];
    return left.start + left.duration === right.start ? [{ leftId: left.id, rightId: right.id, frame: right.start, trackId }] : [];
  });
}

export function editorTransitionLimit(timeline, leftId, rightId, type) {
  const left = timeline.clips.find(c => c.id === leftId), right = timeline.clips.find(c => c.id === rightId);
  const track = timeline.tracks.find(t => t.id === left?.trackId);
  if (!left || !right || left.trackId !== right.trackId || left.start + left.duration !== right.start
    || editorTransitionTypes[type]?.kind !== track?.kind) return 0;
  // Reserve at most half of each clip so neighboring transitions never overlap.
  let half = Math.min(Math.floor(left.duration / 2), Math.floor(right.duration / 2), timeline.fps * 2,
    left.duration - (left.fadeIn || 0), right.duration - (right.fadeOut || 0));
  if (type === "crossFade") {
    const asset = timeline.assets.find(a => a.id === left.assetId);
    half = Math.min(half, right.sourceIn, Math.floor((asset?.duration || 0) * timeline.fps + .00001) - left.sourceIn - left.duration);
  }
  return Math.max(0, half * 2);
}

export function normalizeEditorTransitions(timeline, raw = timeline.transitions) {
  const seen = new Set();
  return (Array.isArray(raw) ? raw : []).slice(0, 200).flatMap(t => {
    if (!t || !Number.isFinite(t.duration)) return [];
    const key = `${t.leftId}:${t.rightId}`, max = editorTransitionLimit(timeline, t.leftId, t.rightId, t.type);
    const duration = Math.min(max, Math.floor(t.duration / 2) * 2);
    if (timeline.clips.find(c => c.id === t.leftId)?.fadeOut || timeline.clips.find(c => c.id === t.rightId)?.fadeIn) return [];
    if (seen.has(key) || duration < 2) return [];
    seen.add(key);
    return [{ leftId: t.leftId, rightId: t.rightId, type: t.type, duration }];
  });
}

export function editorSetTransition(timeline, leftId, rightId, type, duration = timeline.fps) {
  const left = timeline.clips.find(c => c.id === leftId), right = timeline.clips.find(c => c.id === rightId);
  const track = timeline.tracks.find(t => t.id === left?.trackId);
  if (!left || !right || left.trackId !== right.trackId || left.start + left.duration !== right.start) throw new Error("Choose the cut between two touching clips on the same track.");
  if (track?.locked) throw new Error("Unlock this track before changing its transition.");
  const transitions = (timeline.transitions || []).filter(t => t.leftId !== leftId || t.rightId !== rightId);
  if (type == null) return { ...timeline, transitions };
  if (editorTransitionTypes[type]?.kind !== track?.kind) throw new Error("Choose a transition for this track's media type.");
  const limit = editorTransitionLimit(timeline, leftId, rightId, type);
  if (limit < 2) throw new Error(type === "crossFade"
    ? "Cross Fade needs spare audio after the first clip and before the second. Trim their source edges, then bring the clips together. Clip timing has not changed."
    : "These clips are too short for a transition.");
  const frames = Math.min(limit, Math.max(2, Math.round(Number(duration) / 2) * 2));
  if (!Number.isFinite(frames)) throw new Error("Choose a valid transition duration.");
  const clips = timeline.clips.map(c => {
    if (c.id !== leftId && c.id !== rightId) return c;
    const next = { ...c }; delete next[c.id === leftId ? "fadeOut" : "fadeIn"]; return next;
  });
  return { ...timeline, clips, transitions: [...transitions, { leftId, rightId, type, duration: frames }] };
}

export function editorTransitionWindows(timeline) {
  return normalizeEditorTransitions(timeline).map(t => {
    const left = timeline.clips.find(c => c.id === t.leftId), right = timeline.clips.find(c => c.id === t.rightId);
    return { ...t, left, right, trackId: left.trackId, cut: right.start, start: right.start - t.duration / 2, end: right.start + t.duration / 2 };
  });
}

export function editorResizeTransition(timeline, leftId, rightId, edge, deltaFrames) {
  const current = timeline.transitions?.find(t => t.leftId === leftId && t.rightId === rightId);
  if (!current) throw new Error("This transition is no longer at the cut. Select it again.");
  if (!["left", "right"].includes(edge) || !Number.isFinite(deltaFrames)) throw new Error("Choose a valid transition edge and duration.");
  const duration = current.duration + Math.round(deltaFrames) * (edge === "left" ? -2 : 2);
  const next = editorSetTransition(timeline, leftId, rightId, current.type, duration);
  return next.transitions.at(-1).duration === current.duration ? timeline : next;
}

export function editorRemapTransitions(transitions, ids, durationScale = 1) {
  return (transitions || []).filter(t => ids.has(t.leftId) && ids.has(t.rightId)).map(t => ({ ...t,
    leftId: ids.get(t.leftId), rightId: ids.get(t.rightId), duration: Math.max(2, Math.round(t.duration * durationScale / 2) * 2) }));
}

// These same intervals drive the live canvas and FFmpeg, including partial exports/stills.
export function editorVideoSegments(timeline) {
  const windows = editorTransitionWindows(timeline).filter(t => editorTransitionTypes[t.type].kind === "video");
  const pieces = timeline.clips.filter(c => timeline.tracks.find(t => t.id === c.trackId)?.kind === "video").flatMap(clip => {
    const incoming = windows.find(t => t.rightId === clip.id), outgoing = windows.find(t => t.leftId === clip.id);
    const start = incoming?.end ?? clip.start, end = outgoing?.start ?? clip.start + clip.duration;
    return end > start ? [{ trackId: clip.trackId, start, end, clip }] : [];
  });
  return [...pieces, ...windows.map(transition => ({ trackId: transition.trackId, start: transition.start, end: transition.end, transition }))];
}

export function editorVideoLayers(segment, frame) {
  if (!segment.transition) return [{ clip: segment.clip, opacity: 1 }];
  const t = segment.transition, p = Math.min(1, Math.max(0, (frame - t.start) / t.duration));
  if (t.type === "dipToBlack") return [{ clip: frame < t.cut ? t.left : t.right, opacity: Math.abs(2 * p - 1) }];
  return [{ clip: t.left, opacity: 1 }, { clip: t.right, opacity: p }];
}

export function editorAudioSegments(timeline) {
  const windows = editorTransitionWindows(timeline).filter(t => t.type === "crossFade");
  return timeline.clips.filter(c => timeline.tracks.find(t => t.id === c.trackId)?.kind === "audio").map(clip => {
    const fadeIn = windows.find(t => t.rightId === clip.id), fadeOut = windows.find(t => t.leftId === clip.id);
    return { clip, trackId: clip.trackId, start: fadeIn?.start ?? clip.start, end: fadeOut?.end ?? clip.start + clip.duration, fadeIn, fadeOut };
  });
}

export function editorAudioGain(segment, frame) {
  const ramp = t => Math.min(1, Math.max(0, (frame - t.start) / t.duration));
  return segment.clip.volume * editorClipFade(segment.clip, frame) * (segment.fadeIn ? ramp(segment.fadeIn) : 1) * (segment.fadeOut ? 1 - ramp(segment.fadeOut) : 1);
}
