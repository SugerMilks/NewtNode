export function outpaintRatio(value) {
  const [w, h] = String(value || "9:16").split(":").map(Number);
  return w > 0 && h > 0 ? w / h : 9 / 16;
}
export function normalizeOutpaintFrame(frame) {
  if (!frame || ![frame.x, frame.y, frame.width].every(value => Number.isFinite(Number(value)))) return null;
  return { x: Math.max(-32, Math.min(1, Number(frame.x))), y: Math.max(-32, Math.min(32, Number(frame.y))), width: Math.max(0.05, Math.min(32, Number(frame.width))) };
}
// All coordinates use source-width units, so a fixed ratio is independent of source dimensions.
export function defaultOutpaintFrame(dimensions, aspectRatio) {
  const sourceHeight = dimensions.height / dimensions.width;
  const ratio = outpaintRatio(aspectRatio);
  const width = Math.max(1, sourceHeight * ratio);
  return { x: (1 - width) / 2, y: (sourceHeight - width / ratio) / 2, width };
}
export function dragOutpaintFrame(frame, handle, dx, dy, aspectRatio) {
  if (handle === "move") return normalizeOutpaintFrame({ ...frame, x: frame.x + dx, y: frame.y + dy });
  const ratio = outpaintRatio(aspectRatio), east = handle.includes("e"), south = handle.includes("s");
  const anchorX = east ? frame.x : frame.x + frame.width;
  const anchorY = south ? frame.y : frame.y + frame.width / ratio;
  // Project the pointer onto the ratio-locked resize diagonal.
  const delta = ((east ? dx : -dx) + (south ? dy : -dy) / ratio) / (1 + 1 / ratio ** 2);
  const width = Math.max(0.05, Math.min(32, frame.width + delta));
  return normalizeOutpaintFrame({ x: east ? anchorX : anchorX - width, y: south ? anchorY : anchorY - width / ratio, width });
}

export function snapOutpaintFrame(frame, handle, aspectRatio, dimensions, { threshold, previous = null } = {}) {
  const distance = Number(threshold) || 0.01;
  const release = distance * 1.6;
  const ratio = outpaintRatio(aspectRatio);
  const sourceHeight = dimensions.height / dimensions.width;
  const guides = { x: null, y: null };
  if (handle === "move") {
    const axis = (position, size, sourceSize, held) => {
      if (held && Math.abs(position + size * held.fraction - held.target) <= release) return held;
      let best = null, nearest = distance;
      for (const fraction of [0.5, 0, 1]) for (const target of [sourceSize / 2, 0, sourceSize]) {
        const delta = Math.abs(position + size * fraction - target);
        if (delta < nearest || (!best && delta === nearest)) { nearest = delta; best = { fraction, target }; }
      }
      return best;
    };
    const x = axis(frame.x, frame.width, 1, previous?.x);
    const y = axis(frame.y, frame.width / ratio, sourceHeight, previous?.y);
    const next = { ...frame, x: x ? x.target - frame.width * x.fraction : frame.x, y: y ? y.target - frame.width / ratio * y.fraction : frame.y };
    return { frame: normalizeOutpaintFrame(next), guides: { x: x?.target ?? null, y: y?.target ?? null }, state: { x, y } };
  }
  const east = handle.includes("e"), south = handle.includes("s");
  const anchorX = east ? frame.x : frame.x + frame.width;
  const anchorY = south ? frame.y : frame.y + frame.width / ratio;
  const diagonal = Math.sqrt(1 + 1 / ratio ** 2);
  let width = previous?.width && Math.abs(previous.width - frame.width) * diagonal <= release ? previous.width : null;
  if (width === null) {
    let nearest = distance;
    const candidates = [0.5, 0, 1].map(target => east ? target - anchorX : anchorX - target);
    candidates.push(...[sourceHeight / 2, 0, sourceHeight].map(target => (south ? target - anchorY : anchorY - target) * ratio));
    for (const candidate of candidates) {
      const delta = Math.abs(candidate - frame.width) * diagonal;
      if (candidate >= 0.05 && candidate <= 32 && delta <= nearest) { nearest = delta; width = candidate; }
    }
  }
  if (width === null) return { frame, guides, state: null };
  const next = normalizeOutpaintFrame({ x: east ? anchorX : anchorX - width, y: south ? anchorY : anchorY - width / ratio, width });
  const cornerX = east ? next.x + next.width : next.x, cornerY = south ? next.y + next.width / ratio : next.y;
  guides.x = [0, 0.5, 1].find(target => Math.abs(cornerX - target) < distance / 8) ?? null;
  guides.y = [0, sourceHeight / 2, sourceHeight].find(target => Math.abs(cornerY - target) < distance / 8) ?? null;
  return { frame: next, guides, state: { width } };
}
export function outpaintFrameGeometry(dimensions, aspectRatio, frame, canvas) {
  const sourceWidth = Number(dimensions.width), sourceHeight = Number(dimensions.height);
  const rect = normalizeOutpaintFrame(frame) || defaultOutpaintFrame(dimensions, aspectRatio);
  const ratio = outpaintRatio(aspectRatio), frameHeight = rect.width / ratio;
  const right = Math.min(1, rect.x + rect.width), bottom = Math.min(sourceHeight / sourceWidth, rect.y + frameHeight);
  const x = Math.max(0, rect.x), y = Math.max(0, rect.y);
  if (right <= x || bottom <= y) throw new Error("The canvas frame must overlap the source video.");
  const even = value => Math.floor(value / 2) * 2;
  const cropX = even(x * sourceWidth), cropY = even(y * sourceWidth);
  const cropWidth = Math.min(even(sourceWidth - cropX), even((right - x) * sourceWidth));
  const cropHeight = Math.min(even(sourceHeight - cropY), even((bottom - y) * sourceWidth));
  if (cropWidth < 2 || cropHeight < 2) throw new Error("The frame overlaps too little of the source video. Move or resize it to include more footage.");
  const factor = canvas.width / (rect.width * sourceWidth);
  const fullWidth = rect.x >= -0.000001 && rect.x + rect.width <= 1.000001;
  const fullHeight = rect.y >= -0.000001 && rect.y + frameHeight <= sourceHeight / sourceWidth + 0.000001;
  const left = fullWidth ? 0 : Math.max(0, Math.min(canvas.width - 2, even((cropX - rect.x * sourceWidth) * factor)));
  const top = fullHeight ? 0 : Math.max(0, Math.min(canvas.height - 2, even((cropY - rect.y * sourceWidth) * factor)));
  const width = fullWidth ? canvas.width : Math.max(2, Math.min(canvas.width - left, even(cropWidth * factor)));
  const height = fullHeight ? canvas.height : Math.max(2, Math.min(canvas.height - top, even(cropHeight * factor)));
  const needsOutpaint = !fullWidth || !fullHeight;
  return { sourceCrop: { x: cropX, y: cropY, width: cropWidth, height: cropHeight }, sourceWidth: width, sourceHeight: height, left, top, frame: rect, needsOutpaint };
}
