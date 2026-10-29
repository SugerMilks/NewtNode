export function suppliedCanvasGeometry(metadata, output, log) {
  const bounds = [...String(log).matchAll(/crop=(\d+):(\d+):(\d+):(\d+)/g)].map(m => m.slice(1).map(Number))
    .filter(([w, h, x, y]) => w > 0 && h > 0 && x >= 0 && y >= 0 && x + w <= metadata.width && y + h <= metadata.height);
  if (!bounds.length) throw new Error("Could not detect the picture inside the supplied canvas. Use a video with a visible picture and rectangular black outer borders.");
  // Union across the selected shot protects any source content visible in any frame.
  const x = Math.floor(Math.min(...bounds.map(b => b[2])) / 2) * 2;
  const y = Math.floor(Math.min(...bounds.map(b => b[3])) / 2) * 2;
  const right = Math.min(metadata.width, Math.ceil(Math.max(...bounds.map(b => b[2] + b[0])) / 2) * 2);
  const bottom = Math.min(metadata.height, Math.ceil(Math.max(...bounds.map(b => b[3] + b[1])) / 2) * 2);
  const left = Math.round(x * output.width / metadata.width / 2) * 2;
  const top = Math.round(y * output.height / metadata.height / 2) * 2;
  const r = Math.round(right * output.width / metadata.width / 2) * 2;
  const b = Math.round(bottom * output.height / metadata.height / 2) * 2;
  return { sourceCrop: { x, y, width: right - x, height: bottom - y }, left, top, sourceWidth: r - left, sourceHeight: b - top,
    needsOutpaint: left > 0 || top > 0 || r < output.width || b < output.height };
}

export function suppliedCanvasRatio(metadata) {
  const ratio = metadata.width / metadata.height;
  const match = [["9:16", 9 / 16], ["16:9", 16 / 9], ["1:1", 1]].find(([, value]) => Math.abs(ratio / value - 1) < 0.02);
  if (!match) throw new Error("Supplied canvas must be 9:16, 16:9, or square. Its framing is preserved; reformat it before connecting.");
  return match[0];
}
