export function normalizeEditorPosition(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(Math.max(-100, Math.min(100, number)) * 10) / 10 : 0;
}

// Percent-of-sequence offsets keep framing consistent when the output size changes.
export function editorClipOffset(clip, width, height) {
  return { x: Math.round(normalizeEditorPosition(clip.positionX) * width / 100),
    y: Math.round(normalizeEditorPosition(clip.positionY) * height / 100) };
}
