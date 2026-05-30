export function drawColorIdMattePickerCanvas(canvas, image) {
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

export function drawColorIdMatteVideoCanvas(canvas, video) {
  const width = video.videoWidth || 1;
  const height = video.videoHeight || 1;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  context.clearRect(0, 0, width, height);
  context.drawImage(video, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

export function renderColorIdMattePickerPreview(context, sourceImageData, color, tolerance, invert, view = "overlay") {
  if (view === "matte" && color) {
    context.putImageData(colorIdMatteImageData(sourceImageData, color, tolerance, invert).imageData, 0, 0);
    return;
  }

  if (view === "rgb") {
    context.putImageData(sourceImageData, 0, 0);
    return;
  }

  const preview = new ImageData(new Uint8ClampedArray(sourceImageData.data), sourceImageData.width, sourceImageData.height);
  if (color) {
    const { data } = preview;
    const source = sourceImageData.data;
    for (let index = 0; index < source.length; index += 4) {
      const matches = colorMatches(source, index, color, tolerance);
      if (matches !== invert) {
        data[index] = Math.round(source[index] * 0.35 + 221 * 0.65);
        data[index + 1] = Math.round(source[index + 1] * 0.35 + 198 * 0.65);
        data[index + 2] = Math.round(source[index + 2] * 0.35 + 49 * 0.65);
        data[index + 3] = 255;
      }
    }
  }
  context.putImageData(preview, 0, 0);
}

export function colorIdMatteImageData(sourceImageData, color, tolerance, invert) {
  const output = new ImageData(sourceImageData.width, sourceImageData.height);
  const source = sourceImageData.data;
  const target = output.data;
  let matchedPixels = 0;

  for (let index = 0; index < source.length; index += 4) {
    const matches = colorMatches(source, index, color, tolerance);
    const selected = matches !== invert;
    if (matches) matchedPixels += 1;
    const value = selected ? 255 : 0;
    target[index] = value;
    target[index + 1] = value;
    target[index + 2] = value;
    target[index + 3] = 255;
  }

  return { imageData: output, matchedPixels };
}

export function averageColorFromImageData(imageData, x, y, radius = 0) {
  const minX = Math.max(0, x - radius);
  const maxX = Math.min(imageData.width - 1, x + radius);
  const minY = Math.max(0, y - radius);
  const maxY = Math.min(imageData.height - 1, y + radius);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let sampleY = minY; sampleY <= maxY; sampleY += 1) {
    for (let sampleX = minX; sampleX <= maxX; sampleX += 1) {
      const index = (sampleY * imageData.width + sampleX) * 4;
      if (imageData.data[index + 3] === 0) continue;
      r += imageData.data[index];
      g += imageData.data[index + 1];
      b += imageData.data[index + 2];
      count += 1;
    }
  }

  if (!count) return null;
  return {
    r: Math.round(r / count),
    g: Math.round(g / count),
    b: Math.round(b / count)
  };
}

export function normalizeColorIdMatteColor(value) {
  if (typeof value === "string") return colorFromHex(value);
  if (!value || typeof value !== "object") return null;
  const color = {
    r: clampColorChannel(value.r),
    g: clampColorChannel(value.g),
    b: clampColorChannel(value.b)
  };
  return color.r === null || color.g === null || color.b === null ? null : color;
}

export function rgbToHex(color) {
  return `#${[color.r, color.g, color.b].map((channel) => (clampColorChannel(channel) ?? 0).toString(16).padStart(2, "0")).join("")}`;
}

export function colorIdMatteTolerance(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(96, Math.max(0, number)) : 0;
}

export function colorIdMatteSampleRadius(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(3, Math.max(0, number)) : 0;
}

export function colorIdMatteBlur(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(24, Math.max(0, number)) : 0;
}

export function colorIdMatteExpand(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(12, Math.max(-12, number)) : 0;
}

export function normalizeColorIdMatteItems(items = []) {
  if (!Array.isArray(items)) return [];
  return items
    .map((item, index) => {
      const color = normalizeColorIdMatteColor(item?.color || item?.selectedColor);
      if (!color) return null;
      return {
        id: String(item?.id || `matte-${index + 1}`),
        name: String(item?.name || `Matte ${index + 1}`).trim() || `Matte ${index + 1}`,
        color
      };
    })
    .filter(Boolean)
    .slice(0, 16);
}

export function colorIdMatteRunColors(data = {}) {
  const items = normalizeColorIdMatteItems(data.colorIdMatteItems);
  if (items.length) return items;
  const color = normalizeColorIdMatteColor(data.colorIdMatteColor);
  return color
    ? [
        {
          id: "selected",
          name: String(data.colorIdMatteName || "Color ID Matte").trim() || "Color ID Matte",
          color
        }
      ]
    : [];
}

function colorMatches(data, index, color, tolerance) {
  if (data[index + 3] === 0) return false;
  return (
    Math.abs(data[index] - color.r) <= tolerance &&
    Math.abs(data[index + 1] - color.g) <= tolerance &&
    Math.abs(data[index + 2] - color.b) <= tolerance
  );
}

function colorFromHex(value) {
  const match = String(value || "").trim().match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const hex = match[1];
  return {
    r: Number.parseInt(hex.slice(0, 2), 16),
    g: Number.parseInt(hex.slice(2, 4), 16),
    b: Number.parseInt(hex.slice(4, 6), 16)
  };
}

function clampColorChannel(value) {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(255, Math.max(0, number)) : null;
}
