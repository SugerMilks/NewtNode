import { normalizeEditorTransitions, editorRemapTransitions } from "./editorTransitions.js";
import { normalizeEditorPosition } from "./editorClipPosition.js";
import { normalizeEditorFades } from "./editorFades.js";

export const editorLimits = Object.freeze({ tracks: 24, clips: 200, assets: 128, seconds: 7200, dimension: 4096 });
export const editorFrameRates = [24, 25, 30, 60];
const integer = (value, fallback = 0) => Number.isFinite(Number(value)) ? Math.round(Number(value)) : fallback;
export const clampEditor = (value, min, max) => Math.min(max, Math.max(min, value));
export const editorId = () => crypto.randomUUID();
const safeId = (value) => String(value || "").slice(0, 160);

export function normalizeEditorZoom(value) {
  const zoom = Number(value);
  return clampEditor(Number.isFinite(zoom) && zoom > 0 ? zoom : 48, 8, 400);
}

export function editorZoomStep(value, direction) {
  return normalizeEditorZoom(normalizeEditorZoom(value) * (direction > 0 ? 1.4 : 1 / 1.4));
}

export function createEditorTimeline() {
  return { version: 1, fps: 24, width: 1920, height: 1080, inFrame: 0, outFrame: null, assets: [], clips: [], imports: [], transitions: [],
    tracks: [{ id: "v2", kind: "video", name: "V2" }, { id: "v1", kind: "video", name: "V1" },
      { id: "a1", kind: "audio", name: "A1" }, { id: "a2", kind: "audio", name: "A2" }] };
}

export function normalizeEditorTimeline(input = {}) {
  const base = createEditorTimeline(), fps = editorFrameRates.includes(Number(input.fps)) ? Number(input.fps) : 24;
  const unique = (items) => [...new Map(items.map(item => [item.id, item])).values()];
  const tracks = unique((Array.isArray(input.tracks) && input.tracks.length ? input.tracks : base.tracks)
    .filter(t => t && ["video", "audio"].includes(t.kind)).slice(0, editorLimits.tracks).map(t => ({
      id: safeId(t.id), kind: t.kind, name: String(t.name || "Track").slice(0, 40), locked: t.locked === true, muted: t.muted === true
    })).filter(t => t.id));
  const assets = unique((Array.isArray(input.assets) ? input.assets : []).filter(a => a && a.id && a.url && ["video", "audio"].includes(a.type))
    .slice(0, editorLimits.assets).map(a => ({ id: safeId(a.id), url: String(a.url).slice(0, 4096), type: a.type,
      label: String(a.label || "Media").slice(0, 160), duration: clampEditor(Number(a.duration) || 0, 0, 86400),
      width: Math.max(0, integer(a.width)), height: Math.max(0, integer(a.height)), hasAudio: a.hasAudio === true,
      thumbnailUrl: String(a.thumbnailUrl || "").slice(0, 4096),
      waveform: (Array.isArray(a.waveform) ? a.waveform : []).slice(0, 512).map(n => clampEditor(Number(n) || 0, 0, 1)) })));
  const clips = unique((Array.isArray(input.clips) ? input.clips : []).slice(0, editorLimits.clips).flatMap(c => {
    if (!c) return [];
    const asset = assets.find(a => a.id === c.assetId), track = tracks.find(t => t.id === c.trackId);
    if (!asset || !track || (track.kind === "video" ? asset.type !== "video" : !asset.hasAudio)) return [];
    const sourceFrames = Math.floor(asset.duration * fps + 0.00001);
    const sourceIn = clampEditor(integer(c.sourceIn), 0, Math.max(0, sourceFrames - 1));
    const start = clampEditor(integer(c.start), 0, editorLimits.seconds * fps - 1);
    const duration = Math.min(Math.max(1, integer(c.duration, sourceFrames)), sourceFrames - sourceIn, editorLimits.seconds * fps - start);
    const positionX = track.kind === "video" ? normalizeEditorPosition(c.positionX) : 0;
    const positionY = track.kind === "video" ? normalizeEditorPosition(c.positionY) : 0;
    return duration > 0 && c.id ? [{ id: safeId(c.id), assetId: asset.id, trackId: track.id, start, sourceIn, duration,
      ...(positionX ? { positionX } : {}), ...(positionY ? { positionY } : {}),
      ...normalizeEditorFades({ ...c, duration }),
      linkGroup: safeId(c.linkGroup), volume: clampEditor(Number.isFinite(Number(c.volume)) ? Number(c.volume) : 1, 0, 1) }] : [];
  }));
  const end = Math.max(0, ...clips.map(c => c.start + c.duration));
  const inFrame = clampEditor(integer(input.inFrame), 0, Math.max(0, end - 1));
  return { version: 1, fps, width: clampEditor(integer(input.width, 1920), 2, editorLimits.dimension) & ~1,
    height: clampEditor(integer(input.height, 1080), 2, editorLimits.dimension) & ~1,
    inFrame, outFrame: input.outFrame == null ? null : clampEditor(integer(input.outFrame), inFrame + 1, Math.max(1, end)),
    tracks: [...tracks.filter(t => t.kind === "video"), ...tracks.filter(t => t.kind === "audio")], assets, clips,
    transitions: normalizeEditorTransitions({ fps, tracks, assets, clips }, input.transitions),
    imports: [...new Set((Array.isArray(input.imports) ? input.imports : []).filter(k => typeof k === "string"))].slice(-1024) };
}

export function editorEnd(timeline) { return Math.max(0, ...timeline.clips.map(c => c.start + c.duration)); }
export function editorRange(timeline) { return { start: timeline.inFrame, end: timeline.outFrame ?? editorEnd(timeline) }; }
export function editorTimecode(frame, fps = 24) {
  const f = Math.max(0, integer(frame));
  return [Math.floor(f / fps / 3600), Math.floor(f / fps / 60) % 60, Math.floor(f / fps) % 60, f % fps].map(n => String(n).padStart(2, "0")).join(":");
}

export function editorAddTrack(timeline, kind, id = editorId()) {
  if (timeline.tracks.length >= editorLimits.tracks) throw new Error(`An Editor supports up to ${editorLimits.tracks} tracks.`);
  const numbers = timeline.tracks.filter(t => t.kind === kind).map(t => Number(t.name.slice(1)) || 0);
  const track = { id, kind, name: `${kind === "video" ? "V" : "A"}${Math.max(0, ...numbers) + 1}`, locked: false, muted: false };
  return { ...timeline, tracks: kind === "video" ? [track, ...timeline.tracks] : [...timeline.tracks, track] };
}

function overlaps(a, b) { return a.trackId === b.trackId && a.start < b.start + b.duration && b.start < a.start + a.duration; }
export function validateEditorTimeline(timeline) {
  if (!timeline.tracks.length) throw new Error("Add a video or audio track first.");
  for (let i = 0; i < timeline.clips.length; i++) for (let j = i + 1; j < timeline.clips.length; j++) {
    if (overlaps(timeline.clips[i], timeline.clips[j])) throw new Error("Clips cannot overlap on the same track. Move the clip to another track.");
  }
  const clips = timeline.clips.map(({ fadeIn, fadeOut, ...clip }) => ({ ...clip, ...normalizeEditorFades({ ...clip, fadeIn, fadeOut }) }));
  return { ...timeline, clips, transitions: normalizeEditorTransitions({ ...timeline, clips }) };
}

export function editorImportMedia(timeline, asset, importKey, makeId = editorId) {
  if (timeline.imports.includes(importKey)) return timeline;
  if (timeline.assets.length >= editorLimits.assets || timeline.clips.length + (asset.type === "video" && asset.hasAudio ? 2 : 1) > editorLimits.clips) {
    throw new Error("This sequence has reached its media or clip limit. Start another Editor sequence.");
  }
  let next = timeline;
  const findTrack = (kind, start, duration, preferred) => {
    let choices = next.tracks.filter(t => t.kind === kind && !t.locked);
    choices = [...choices.filter(t => t.name === preferred), ...choices.filter(t => t.name !== preferred)];
    let track = choices.find(t => !next.clips.some(c => overlaps(c, { trackId: t.id, start, duration })));
    if (!track) { next = editorAddTrack(next, kind, makeId()); track = next.tracks.find(t => !timeline.tracks.some(old => old.id === t.id) && t.kind === kind && !next.clips.some(c => overlaps(c, { trackId: t.id, start, duration }))); }
    return track;
  };
  const duration = Math.floor(asset.duration * next.fps + 0.00001);
  if (duration < 1) throw new Error("This media has no usable duration.");
  const start = asset.type === "video" ? Math.max(0, ...next.clips.filter(c => next.tracks.find(t => t.id === c.trackId)?.kind === "video").map(c => c.start + c.duration))
    : Math.max(0, ...next.clips.filter(c => next.tracks.find(t => t.id === c.trackId)?.name === "A2").map(c => c.start + c.duration));
  if (start + duration > editorLimits.seconds * next.fps) throw new Error("The sequence would exceed two hours.");
  const media = { ...asset, id: makeId() }, linkGroup = asset.type === "video" && asset.hasAudio ? makeId() : "";
  const track = findTrack(asset.type, start, duration, asset.type === "video" ? "V1" : "A2");
  let clips = [...next.clips, { id: makeId(), assetId: media.id, trackId: track.id, start, sourceIn: 0, duration, linkGroup, volume: 1 }];
  next = { ...next, clips };
  if (linkGroup) {
    const audioTrack = findTrack("audio", start, duration, "A1");
    clips = [...clips, { id: makeId(), assetId: media.id, trackId: audioTrack.id, start, sourceIn: 0, duration, linkGroup, volume: 1 }];
  }
  const firstVideo = asset.type === "video" && !timeline.assets.some(a => a.type === "video");
  return validateEditorTimeline(normalizeEditorTimeline({ ...next, clips, assets: [...next.assets, media], imports: [...next.imports, importKey],
    ...(firstVideo && asset.width && asset.height ? { width: asset.width, height: asset.height } : {}) }));
}

export function editorSelection(timeline, ids, linked = true) {
  const selected = new Set(ids), groups = new Set(timeline.clips.filter(c => selected.has(c.id) && c.linkGroup).map(c => c.linkGroup));
  return timeline.clips.filter(c => selected.has(c.id) || (linked && c.linkGroup && groups.has(c.linkGroup)));
}
export function editorMarqueeSelection(timeline, initial, hits, linked = true) {
  const locked = new Set(timeline.tracks.filter(t => t.locked).map(t => t.id));
  const lockedGroups = new Set(timeline.clips.filter(c => locked.has(c.trackId)).map(c => c.linkGroup).filter(Boolean));
  const eligible = timeline.clips.filter(c => hits.includes(c.id) && !locked.has(c.trackId) && (!linked || !lockedGroups.has(c.linkGroup)));
  return [...new Set([...initial, ...eligible.map(c => c.id)])];
}
function editable(timeline, clips) {
  if (clips.some(c => timeline.tracks.find(t => t.id === c.trackId)?.locked)) throw new Error("Unlock the selected clip's track and its linked track before editing.");
}

export function editorSetClipPosition(timeline, id, patch) {
  const clip = timeline.clips.find(c => c.id === id);
  if (!clip || timeline.tracks.find(t => t.id === clip.trackId)?.kind !== "video") return timeline;
  editable(timeline, [clip]);
  const next = { ...clip };
  for (const key of ["positionX", "positionY"]) if (Object.hasOwn(patch, key)) {
    const value = normalizeEditorPosition(patch[key]);
    if (value) next[key] = value;
    else delete next[key];
  }
  if (JSON.stringify(next) === JSON.stringify(clip)) return timeline;
  return { ...timeline, clips: timeline.clips.map(c => c.id === id ? next : c) };
}

export function editorMove(timeline, ids, delta, { linked = true, anchorId, trackId } = {}) {
  const selected = editorSelection(timeline, ids, linked); editable(timeline, selected);
  if (!selected.length) return timeline;
  const amount = Math.max(integer(delta), -Math.min(...selected.map(c => c.start))), picked = new Set(selected.map(c => c.id));
  const anchor = selected.find(c => c.id === anchorId), original = timeline.tracks.find(t => t.id === anchor?.trackId), target = timeline.tracks.find(t => t.id === trackId);
  if (trackId && (!target || target.locked || original?.kind !== target.kind)) throw new Error("Choose an unlocked track of the same media type.");
  const kindTracks = timeline.tracks.filter(t => t.kind === original?.kind);
  const shift = target ? kindTracks.indexOf(target) - kindTracks.indexOf(original) : 0;
  const clips = timeline.clips.map(c => {
    if (!picked.has(c.id)) return c;
    let destination = c.trackId;
    if (shift && kindTracks.some(t => t.id === c.trackId)) {
      const nextTrack = kindTracks[kindTracks.findIndex(t => t.id === c.trackId) + shift];
      if (!nextTrack || nextTrack.locked) throw new Error("The selected clips need unlocked tracks with the same spacing.");
      destination = nextTrack.id;
    }
    return { ...c, start: c.start + amount, trackId: destination };
  });
  if (clips.some(c => c.start + c.duration > editorLimits.seconds * timeline.fps)) throw new Error("The sequence would exceed two hours.");
  return validateEditorTimeline({ ...timeline, clips });
}

export function editorTrim(timeline, id, edge, delta, linked = true) {
  const selected = editorSelection(timeline, [id], linked); editable(timeline, selected);
  if (!selected.length) return timeline;
  const ids = new Set(selected.map(c => c.id));
  const min = edge === "left" ? Math.max(...selected.map(c => -Math.min(c.start, c.sourceIn))) : Math.max(...selected.map(c => 1 - c.duration));
  const max = edge === "left" ? Math.min(...selected.map(c => c.duration - 1)) : Math.min(...selected.map(c => Math.min(
    Math.floor(timeline.assets.find(a => a.id === c.assetId).duration * timeline.fps + 0.00001) - c.sourceIn - c.duration,
    editorLimits.seconds * timeline.fps - c.start - c.duration)));
  const amount = clampEditor(integer(delta), min, max);
  return validateEditorTimeline({ ...timeline, clips: timeline.clips.map(c => !ids.has(c.id) ? c : edge === "left"
    ? { ...c, start: c.start + amount, sourceIn: c.sourceIn + amount, duration: c.duration - amount }
    : { ...c, duration: c.duration + amount }) });
}

export function editorSplit(timeline, frame, ids = [], linked = true, makeId = editorId) {
  const targets = ids.length ? editorSelection(timeline, ids, linked) : timeline.clips;
  const cuttable = targets.filter(c => frame > c.start && frame < c.start + c.duration);
  if (ids.length) editable(timeline, cuttable);
  const lockedGroups = new Set(timeline.clips.filter(c => timeline.tracks.find(t => t.id === c.trackId)?.locked).map(c => c.linkGroup).filter(Boolean));
  const selected = new Set(cuttable.filter(c => !timeline.tracks.find(t => t.id === c.trackId)?.locked && (!linked || !lockedGroups.has(c.linkGroup))).map(c => c.id));
  if (!selected.size) return timeline;
  if (timeline.clips.length + selected.size > editorLimits.clips) throw new Error("This sequence has reached its clip limit.");
  const rightGroups = new Map(), rightIds = new Map();
  const clips = timeline.clips.flatMap(c => {
    if (!selected.has(c.id)) return [c];
    const length = integer(frame) - c.start;
    if (c.linkGroup && !rightGroups.has(c.linkGroup)) rightGroups.set(c.linkGroup, makeId());
    const rightId = makeId(); rightIds.set(c.id, rightId);
    const { fadeIn, fadeOut, ...plain } = c;
    return [{ ...plain, duration: length, ...normalizeEditorFades({ duration: length, fadeIn }) },
      { ...plain, id: rightId, start: integer(frame), sourceIn: c.sourceIn + length,
        duration: c.duration - length, ...normalizeEditorFades({ duration: c.duration - length, fadeOut }), linkGroup: c.linkGroup ? rightGroups.get(c.linkGroup) : "" }];
  });
  return normalizeEditorTimeline({ ...timeline, clips, transitions: (timeline.transitions || []).map(t => ({ ...t, leftId: rightIds.get(t.leftId) || t.leftId })) });
}

export function editorDelete(timeline, ids, linked = true) {
  const selected = editorSelection(timeline, ids, linked); editable(timeline, selected);
  const removed = new Set(selected.map(c => c.id));
  return normalizeEditorTimeline({ ...timeline, clips: timeline.clips.filter(c => !removed.has(c.id)) });
}

export function editorUnlink(timeline, ids) {
  const selected = editorSelection(timeline, ids, true); editable(timeline, selected);
  const groups = new Set(selected.map(c => c.linkGroup).filter(Boolean));
  return { ...timeline, clips: timeline.clips.map(c => groups.has(c.linkGroup) ? { ...c, linkGroup: "" } : c) };
}

export const editorClipboardMime = "application/x-newtnode-editor-clips";
export function editorCopyClips(timeline, ids, linked = true) {
  const clips = editorSelection(timeline, ids, linked);
  if (!clips.length) return null;
  const first = Math.min(...clips.map(c => c.start));
  return JSON.parse(JSON.stringify({ kind: "newtnode-editor-clips", version: 1, fps: timeline.fps,
    anchorTrackId: timeline.clips.find(c => c.id === ids[0])?.trackId,
    tracks: timeline.tracks.filter(t => clips.some(c => c.trackId === t.id)),
    assets: timeline.assets.filter(a => clips.some(c => c.assetId === a.id)),
    clips: clips.map(c => ({ ...c, start: c.start - first })),
    transitions: editorRemapTransitions(timeline.transitions, new Map(clips.map(c => [c.id, c.id]))) }));
}

export function editorPasteClips(timeline, clipboard, frame, { targetTrackId, makeId = editorId } = {}) {
  if (clipboard?.kind !== "newtnode-editor-clips" || clipboard.version !== 1 || !editorFrameRates.includes(clipboard.fps)
    || !["tracks", "clips", "assets"].every(k => Array.isArray(clipboard[k]) && clipboard[k].length > 0 && clipboard[k].length <= editorLimits[k])) {
    throw new Error("The clipboard does not contain valid Editor clips.");
  }
  const copied = normalizeEditorTimeline(clipboard);
  if (["tracks", "clips", "assets"].some(k => copied[k].length !== clipboard[k].length)
    || copied.assets.some(a => !/^\/(?:uploads|outputs|workflow-assets)\//.test(a.url))) throw new Error("The clipboard contains invalid Editor media.");
  if (timeline.clips.length + copied.clips.length > editorLimits.clips) throw new Error("This sequence has reached its clip limit.");
  const start = Math.max(0, integer(frame)), factor = timeline.fps / copied.fps;
  let next = timeline;
  const trackIds = new Map(), assetIds = new Map(), groups = new Map(), clipIds = new Map();
  for (const track of copied.tracks) {
    const target = targetTrackId && track.id === clipboard.anchorTrackId ? next.tracks.find(t => t.id === targetTrackId && t.kind === track.kind) : null;
    let match = target || next.tracks.find(t => t.id === track.id && t.kind === track.kind) || next.tracks.find(t => t.name === track.name && t.kind === track.kind);
    if (!match) { const id = makeId(); next = editorAddTrack(next, track.kind, id); match = next.tracks.find(t => t.id === id); }
    if (match.locked) throw new Error(`Unlock ${match.name} before pasting clips.`);
    trackIds.set(track.id, match.id);
  }
  for (const asset of copied.assets) {
    let match = next.assets.find(a => a.url === asset.url && a.type === asset.type && a.duration === asset.duration && a.hasAudio === asset.hasAudio);
    if (!match) { match = { ...asset, id: makeId() }; next = { ...next, assets: [...next.assets, match] }; }
    assetIds.set(asset.id, match.id);
  }
  if (next.assets.length > editorLimits.assets) throw new Error("This sequence has reached its media limit.");
  const clips = copied.clips.map(c => {
    if (c.linkGroup && !groups.has(c.linkGroup)) groups.set(c.linkGroup, makeId());
    const sourceIn = Math.round(c.sourceIn * factor), asset = copied.assets.find(a => a.id === c.assetId);
    const duration = Math.min(Math.max(1, Math.round((c.start + c.duration) * factor) - Math.round(c.start * factor)), Math.floor(asset.duration * timeline.fps + .00001) - sourceIn);
    const id = makeId(); clipIds.set(c.id, id);
    const { fadeIn, fadeOut, ...plain } = c;
    return { ...plain, ...normalizeEditorFades({ duration, fadeIn, fadeOut }, factor), id, start: start + Math.round(c.start * factor), sourceIn, duration,
      trackId: trackIds.get(c.trackId), assetId: assetIds.get(c.assetId), linkGroup: c.linkGroup ? groups.get(c.linkGroup) : "" };
  });
  if (clips.some(c => c.duration < 1 || c.start + c.duration > editorLimits.seconds * timeline.fps)) throw new Error("The pasted clips exceed their source or sequence bounds.");
  return validateEditorTimeline({ ...next, clips: [...next.clips, ...clips], transitions: [...(next.transitions || []), ...editorRemapTransitions(copied.transitions, clipIds, factor)] });
}

export function editorEditPoint(timeline, frame, direction) {
  const points = [...new Set([0, editorEnd(timeline), ...timeline.clips.flatMap(c => [c.start, c.start + c.duration])])].sort((a, b) => a - b);
  return direction < 0 ? points.filter(p => p < frame).at(-1) ?? 0 : points.find(p => p > frame) ?? editorEnd(timeline);
}

export function editorGapAt(timeline, trackId, frame) {
  if (!timeline.tracks.some(t => t.id === trackId) || frame < 0) return null;
  const clips = timeline.clips.filter(c => c.trackId === trackId);
  if (clips.some(c => frame >= c.start && frame < c.start + c.duration)) return null;
  const next = clips.filter(c => c.start > frame).sort((a, b) => a.start - b.start)[0];
  if (!next) return null;
  const start = Math.max(0, ...clips.filter(c => c.start + c.duration <= frame).map(c => c.start + c.duration));
  return { trackId, start, end: next.start };
}

export function editorRippleDeleteGap(timeline, gap) {
  const current = gap && editorGapAt(timeline, gap.trackId, gap.start);
  if (!current || current.start !== gap.start || current.end !== gap.end) throw new Error("Select an empty gap between clips first.");
  if (timeline.tracks.find(t => t.id === gap.trackId)?.locked) throw new Error("Unlock this track before ripple deleting its gap.");
  // Move downstream edits together, including linked sound. Never trim unrelated material to force a collision through.
  const selected = editorSelection(timeline, timeline.clips.filter(c => c.start >= gap.end).map(c => c.id), true);
  editable(timeline, selected);
  const distance = gap.end - gap.start;
  if (selected.some(c => c.start < gap.end)) throw new Error("A linked clip crosses this gap. Align or unlink it before ripple deleting.");
  try { return normalizeEditorTimeline(editorMove(timeline, selected.map(c => c.id), -distance)); }
  catch (error) {
    if (/overlap/.test(error.message)) throw new Error("Ripple delete would overlap other clips. Move or trim the blocking material first.");
    throw error;
  }
}

export function editorDuplicate(timeline, ids, linked = true, makeId = editorId) {
  const selected = editorSelection(timeline, ids, linked); editable(timeline, selected);
  if (!selected.length) return timeline;
  if (timeline.clips.length + selected.length > editorLimits.clips) throw new Error("This sequence has reached its clip limit.");
  const first = Math.min(...selected.map(c => c.start));
  const tracks = new Set(selected.map(c => c.trackId)), groups = new Map(), clipIds = new Map();
  const end = Math.max(...timeline.clips.filter(c => tracks.has(c.trackId)).map(c => c.start + c.duration));
  const clips = selected.map(c => {
    if (c.linkGroup && !groups.has(c.linkGroup)) groups.set(c.linkGroup, makeId());
    const id = makeId(); clipIds.set(c.id, id);
    return { ...c, id, start: c.start + end - first, linkGroup: c.linkGroup ? groups.get(c.linkGroup) : "" };
  });
  if (clips.some(c => c.start + c.duration > editorLimits.seconds * timeline.fps)) throw new Error("The sequence would exceed two hours.");
  return validateEditorTimeline({ ...timeline, clips: [...timeline.clips, ...clips], transitions: [...(timeline.transitions || []), ...editorRemapTransitions(timeline.transitions, clipIds)] });
}

export function editorSetFrameRate(timeline, fps) {
  if (!editorFrameRates.includes(fps) || fps === timeline.fps) return timeline;
  const convert = f => Math.round(f * fps / timeline.fps);
  return validateEditorTimeline(normalizeEditorTimeline({ ...timeline, fps, inFrame: convert(timeline.inFrame), outFrame: timeline.outFrame == null ? null : convert(timeline.outFrame),
    transitions: (timeline.transitions || []).map(t => ({ ...t, duration: Math.max(2, Math.round(convert(t.duration) / 2) * 2) })),
    clips: timeline.clips.map(({ fadeIn, fadeOut, ...c }) => {
      const duration = Math.max(1, convert(c.start + c.duration) - convert(c.start));
      return { ...c, ...normalizeEditorFades({ duration, fadeIn, fadeOut }, fps / timeline.fps), start: convert(c.start), sourceIn: convert(c.sourceIn), duration };
    }) }));
}

export function editorSnap(timeline, frame, excluded = [], threshold = 6, playhead = 0) {
  const omitted = new Set(excluded);
  const candidates = [0, playhead, timeline.inFrame, timeline.outFrame, ...timeline.clips.filter(c => !omitted.has(c.id)).flatMap(c => [c.start, c.start + c.duration])].filter(Number.isFinite);
  const closest = candidates.sort((a, b) => Math.abs(a - frame) - Math.abs(b - frame))[0];
  return Math.abs(closest - frame) <= threshold ? closest : integer(frame);
}

export function editorActiveClips(timeline, frame) {
  const active = timeline.clips.filter(c => frame >= c.start && frame < c.start + c.duration && !timeline.tracks.find(t => t.id === c.trackId)?.muted);
  const videoTracks = timeline.tracks.filter(t => t.kind === "video");
  const video = videoTracks.map(t => active.find(c => c.trackId === t.id)).find(Boolean) || null;
  return { video, audio: active.filter(c => timeline.tracks.find(t => t.id === c.trackId)?.kind === "audio") };
}

export function editorRenderSignature(timeline) {
  return JSON.stringify({ fps: timeline.fps, width: timeline.width, height: timeline.height, inFrame: timeline.inFrame, outFrame: timeline.outFrame,
    tracks: timeline.tracks.map(({ id, kind, muted }) => ({ id, kind, muted })), clips: timeline.clips,
    ...(timeline.transitions?.length ? { transitions: timeline.transitions } : {}),
    assets: timeline.assets.map(({ id, url }) => ({ id, url })) });
}
