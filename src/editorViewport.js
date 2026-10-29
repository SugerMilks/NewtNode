import { clampEditor, normalizeEditorZoom } from "./editorTimeline.js";

export const editorTrackHeaderWidth = 148;

export function editorZoomScrollLeft({ frame, fps, previousZoom, zoom, scrollLeft, viewportWidth, scrollWidth }) {
  const visible = Math.max(0, viewportWidth - editorTrackHeaderWidth);
  const time = Math.max(0, frame) / fps;
  const previousX = time * normalizeEditorZoom(previousZoom) - scrollLeft;
  // Keep a visible playhead stationary; recover an offscreen playhead at the center.
  const anchor = previousX >= 0 && previousX <= visible ? previousX : visible / 2;
  return clampEditor(time * normalizeEditorZoom(zoom) - anchor, 0, Math.max(0, scrollWidth - viewportWidth));
}

export function editorScrollbarGeometry({ viewportWidth, scrollWidth, scrollLeft, trackWidth }) {
  const maxScroll = Math.max(0, scrollWidth - viewportWidth);
  const visible = Math.max(0, viewportWidth - editorTrackHeaderWidth);
  const content = Math.max(1, scrollWidth - editorTrackHeaderWidth);
  const thumbWidth = Math.min(trackWidth, Math.max(32, trackWidth * Math.min(1, visible / content)));
  const travel = Math.max(0, trackWidth - thumbWidth);
  const left = maxScroll > 0 ? clampEditor(scrollLeft / maxScroll, 0, 1) * travel : 0;
  return { maxScroll, thumbWidth: maxScroll > 0 ? thumbWidth : trackWidth, travel, left };
}
