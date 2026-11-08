import { createEditorTimeline, normalizeEditorTimeline } from "../../src/editorTimeline.js";

export function transitionTimeline(fps = 24) {
  return normalizeEditorTimeline({ ...createEditorTimeline(), fps, width: 160, height: 90,
    assets: ["red", "blue"].map(id => ({ id, type: "video", label: id, url: `/uploads/editor-qa/${id}.mp4`, duration: 4, width: 160, height: 90, hasAudio: true })),
    clips: ["v1", "a1"].flatMap(trackId => ["red", "blue"].map((assetId, i) => ({ id: `${trackId}-${assetId}`, assetId, trackId,
      start: i * fps * 2, sourceIn: fps, duration: fps * 2, volume: 1, linkGroup: assetId }))) });
}

export function fadeTimeline() {
  const t = transitionTimeline();
  return normalizeEditorTimeline({ ...t, clips: [
    { ...t.clips[0], id: "foreground", trackId: "v2", sourceIn: 0, start: 12, duration: 72 },
    { ...t.clips[1], id: "background", trackId: "v1", sourceIn: 0, start: 0, duration: 96, linkGroup: "" },
    { ...t.clips[2], id: "sound", sourceIn: 0, start: 12, duration: 72 }
  ] });
}
