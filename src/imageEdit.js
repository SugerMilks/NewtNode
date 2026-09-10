export const imageEditColors = ["#f4f4f4", "#191919", "#ed5959", "#f4a340", "#e4cf37", "#57bd83", "#42b9d0", "#648cf5"];
export const imageEditModes = ["edit", "sketch", "remove"];
export const imageEditMaxPixels = 24000000;

export function imageEditPoint(clientX, clientY, rect) {
  return { x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)) };
}

export function imageEditSize(width, height) {
  if (![width, height].every((value) => Number.isInteger(value) && value > 0) || width * height > imageEditMaxPixels)
    throw new Error("This image is too large for the editor. Use an image up to 24 megapixels.");
  if (Math.max(width / height, height / width) > 3) throw new Error("Image 2.5 supports aspect ratios between 1:3 and 3:1. Crop this image before generating an edit.");
  let scale = Math.min(1, 3840 / Math.max(width, height), Math.sqrt(8294400 / (width * height)));
  scale = Math.max(scale, Math.sqrt(655360 / (width * height)));
  let w = Math.min(3840, Math.round(width * scale / 16) * 16);
  let h = Math.min(3840, Math.round(height * scale / 16) * 16);
  while (w * h < 655360) { if (w <= h) w += 16; else h += 16; }
  while (w * h > 8294400) { if (w >= h) w -= 16; else h -= 16; }
  if (w > h * 3) h = Math.ceil(w / 3 / 16) * 16;
  if (h > w * 3) w = Math.ceil(h / 3 / 16) * 16;
  return { width: w, height: h };
}

export function buildImageEditPrompt({ prompt = "", mode = "edit", hasDrawing = false, hasSelection = false, blank = false }) {
  if (!imageEditModes.includes(mode)) throw new Error("Choose an image editing method.");
  const brief = String(prompt).trim();
  if (brief.length > 16000) throw new Error("Keep the edit prompt under 16,000 characters.");
  if (blank && mode !== "sketch") throw new Error("A blank canvas is only available for Render sketch.");
  if (mode === "remove" && !hasSelection) throw new Error("Select the area to remove first.");
  if (!brief && mode !== "remove" && !(mode === "sketch" && hasDrawing)) throw new Error("Describe the edit you want to make.");
  if (blank && !hasDrawing) throw new Error("Draw your sketch before generating.");
  return [
    blank ? "Create one finished image from the supplied sketch." : "Edit image 1, the clean original. Keep its exact framing, aspect ratio, composition, identities, lighting and texture except where the requested change requires otherwise.",
    hasDrawing ? mode === "sketch"
      ? "The drawn marks are a composition sketch. Turn their shapes, placement and colors into finished visual content according to the brief. Preserve the sketch's intended arrangement, not its rough pen texture unless requested."
      : "Image 2 shows annotations over the same original. Circles, arrows, outlines, handwriting and colored strokes are editing instructions and location guides, not artwork to copy into the result. Interpret them together with the brief. Remove every guide mark from the final image; use the clean original to recover the underlying content. Only include literal text if the brief explicitly requests visible text."
      : "Use the written brief to direct the edit.",
    hasSelection ? "The transparent area of the provided edit mask is the selected region. Change only that region. Preserve everything else. Do not reproduce the selection overlay." : "",
    mode === "remove" ? "Remove the selected content and reconstruct the exposed area naturally from its surroundings. Do not add replacement objects unless requested." : "",
    brief ? `USER EDIT BRIEF:\n${brief}` : mode === "sketch" ? "Render a polished finished version of the sketch." : "",
    "Return one image only. Do not add comparison panels, interface controls, borders, or annotation marks."
  ].filter(Boolean).join("\n\n");
}

export function drawImageEditMarks(context, marks, width, height, layer = "drawing") {
  context.clearRect(0, 0, width, height);
  for (const mark of marks.filter((item) => item.layer === layer)) {
    if (!mark.points?.length) continue;
    const points = mark.points.map((p) => ({ x: p.x * width, y: p.y * height }));
    const first = points[0], last = points.at(-1);
    const size = Math.max(1, mark.size * Math.min(width, height));
    context.save();
    context.globalCompositeOperation = mark.tool === "eraser" ? "destination-out" : "source-over";
    context.globalAlpha = layer === "selection" ? 1 : mark.opacity ?? 1;
    context.strokeStyle = context.fillStyle = layer === "selection" ? "#ffffff" : mark.color;
    context.lineWidth = size;
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    if (mark.tool === "text") {
      context.font = `600 ${size * 4}px Arial, sans-serif`;
      context.textBaseline = "top";
      String(mark.text || "").split("\n").forEach((line, i) => context.fillText(line, first.x, first.y + i * size * 4.8));
    } else if (mark.tool === "rectangle") {
      context.rect(first.x, first.y, last.x - first.x, last.y - first.y);
      layer === "selection" ? context.fill() : context.stroke();
    } else if (mark.tool === "ellipse") {
      context.ellipse((first.x + last.x) / 2, (first.y + last.y) / 2, Math.max(0.5, Math.abs(last.x - first.x) / 2), Math.max(0.5, Math.abs(last.y - first.y) / 2), 0, 0, Math.PI * 2);
      layer === "selection" ? context.fill() : context.stroke();
    } else {
      context.moveTo(first.x, first.y);
      for (const point of points.slice(1)) context.lineTo(point.x, point.y);
      if (points.length === 1) { context.arc(first.x, first.y, size / 2, 0, Math.PI * 2); context.fill(); }
      else context.stroke();
      if (mark.tool === "arrow") {
        const angle = Math.atan2(last.y - first.y, last.x - first.x), head = size * 4;
        context.beginPath(); context.moveTo(last.x, last.y);
        context.lineTo(last.x - head * Math.cos(angle - 0.5), last.y - head * Math.sin(angle - 0.5));
        context.moveTo(last.x, last.y);
        context.lineTo(last.x - head * Math.cos(angle + 0.5), last.y - head * Math.sin(angle + 0.5)); context.stroke();
      }
    }
    context.restore();
  }
}

export function imageEditHasPixels(context, width, height) {
  const pixels = context.getImageData(0, 0, width, height).data;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i]) return true;
  return false;
}
