export const defaultToneAdjustments = { brightness: 0, contrast: 0, saturation: 0 };
export const defaultCurvePoints = [{ x: 0, y: 100 }, { x: 100, y: 0 }];
export const maxCurvePoints = 7;

export function clampCurveNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(max, Math.max(min, numeric));
}

export function sortedCurvePoints(points = defaultCurvePoints) {
  const safePoints = Array.isArray(points) && points.length ? points : defaultCurvePoints;
  const normalized = safePoints
    .map((point) => ({
      x: clampCurveNumber(point?.x, 0, 100),
      y: clampCurveNumber(point?.y, 0, 100)
    }))
    .sort((a, b) => a.x - b.x);
  const withoutNearEndpoints = normalized.filter((point) => point.x > 0.5 && point.x < 99.5);
  return [
    { x: 0, y: normalized[0]?.x <= 0.5 ? normalized[0].y : 100 },
    ...withoutNearEndpoints.slice(0, maxCurvePoints - 2),
    { x: 100, y: normalized[normalized.length - 1]?.x >= 99.5 ? normalized[normalized.length - 1].y : 0 }
  ];
}

function curveControlPoints(points = defaultCurvePoints) {
  const controls = sortedCurvePoints(points).map((point) => ({
    input: Math.round(clampCurveNumber(point.x, 0, 100) * 2.55),
    output: Math.round(clampCurveNumber(100 - point.y, 0, 100) * 2.55)
  }));
  return controls.filter((point, index) => index === 0 || point.input !== controls[index - 1].input);
}

function interpolatedCurveOutput(points, input) {
  if (points.length < 2) return input;
  if (points.length === 2) {
    const [start, end] = points;
    const range = Math.max(1, end.input - start.input);
    const t = clampCurveNumber((input - start.input) / range, 0, 1);
    return Math.round(clampCurveNumber(start.output + (end.output - start.output) * t, 0, 255));
  }
  let segmentIndex = 0;
  while (segmentIndex < points.length - 2 && input > points[segmentIndex + 1].input) {
    segmentIndex += 1;
  }
  const p0 = points[Math.max(0, segmentIndex - 1)];
  const p1 = points[segmentIndex];
  const p2 = points[Math.min(segmentIndex + 1, points.length - 1)];
  const p3 = points[Math.min(segmentIndex + 2, points.length - 1)];
  const range = Math.max(1, p2.input - p1.input);
  const t = clampCurveNumber((input - p1.input) / range, 0, 1);
  const t2 = t * t;
  const t3 = t2 * t;
  const output = 0.5 * (
    (2 * p1.output) +
    (-p0.output + p2.output) * t +
    (2 * p0.output - 5 * p1.output + 4 * p2.output - p3.output) * t2 +
    (-p0.output + 3 * p1.output - 3 * p2.output + p3.output) * t3
  );
  return Math.round(clampCurveNumber(output, 0, 255));
}

export function curveLookup(points = defaultCurvePoints) {
  const controls = curveControlPoints(points);
  const lookup = new Uint8ClampedArray(256);
  for (let input = 0; input < 256; input += 1) {
    lookup[input] = interpolatedCurveOutput(controls, input);
  }
  return lookup;
}

export function applyCurveToImageData(context, width, height, points = defaultCurvePoints) {
  const imageData = context.getImageData(0, 0, width, height);
  const lookup = curveLookup(points);
  for (let index = 0; index < imageData.data.length; index += 4) {
    imageData.data[index] = lookup[imageData.data[index]];
    imageData.data[index + 1] = lookup[imageData.data[index + 1]];
    imageData.data[index + 2] = lookup[imageData.data[index + 2]];
  }
  context.putImageData(imageData, 0, 0);
}

export function normalizedToneAdjustments(adjustments = defaultToneAdjustments) {
  const normalize = (value) => Number.isFinite(Number(value)) ? Math.round(clampCurveNumber(value, -100, 100)) : 0;
  return {
    brightness: normalize(adjustments?.brightness),
    contrast: normalize(adjustments?.contrast),
    saturation: normalize(adjustments?.saturation)
  };
}

function applyToneAdjustmentsToImageData(context, width, height, adjustments = defaultToneAdjustments) {
  const { brightness, contrast, saturation } = normalizedToneAdjustments(adjustments);
  const imageData = context.getImageData(0, 0, width, height);
  const brightnessOffset = brightness * 2.55;
  const contrastValue = contrast * 2.55;
  const contrastFactor = (259 * (contrastValue + 255)) / (255 * (259 - contrastValue));
  const saturationFactor = 1 + saturation / 100;
  for (let index = 0; index < imageData.data.length; index += 4) {
    let red = contrastFactor * (imageData.data[index] - 128) + 128 + brightnessOffset;
    let green = contrastFactor * (imageData.data[index + 1] - 128) + 128 + brightnessOffset;
    let blue = contrastFactor * (imageData.data[index + 2] - 128) + 128 + brightnessOffset;
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    red = luminance + (red - luminance) * saturationFactor;
    green = luminance + (green - luminance) * saturationFactor;
    blue = luminance + (blue - luminance) * saturationFactor;
    imageData.data[index] = clampCurveNumber(red, 0, 255);
    imageData.data[index + 1] = clampCurveNumber(green, 0, 255);
    imageData.data[index + 2] = clampCurveNumber(blue, 0, 255);
  }
  context.putImageData(imageData, 0, 0);
}

export function applyImageAdjustmentsToCanvas(context, width, height, adjustments = defaultToneAdjustments, points = defaultCurvePoints) {
  applyToneAdjustmentsToImageData(context, width, height, adjustments);
  applyCurveToImageData(context, width, height, points);
}
