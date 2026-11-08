import { editorClipOffset } from "../src/editorClipPosition.js";

export function editorPositionFilter(clip, width, height) {
  const { x, y } = editorClipOffset(clip, width, height);
  if (!x && !y) return "";
  // Shift the fitted picture inside its black sequence matte. RGB prevents chroma
  // subsampling from rounding odd-pixel offsets, including on still exports.
  return `,format=gbrp,pad=${width + Math.abs(x)}:${height + Math.abs(y)}:${Math.max(0, x)}:${Math.max(0, y)}:black,crop=${width}:${height}:${Math.max(0, -x)}:${Math.max(0, -y)}:exact=1`;
}
