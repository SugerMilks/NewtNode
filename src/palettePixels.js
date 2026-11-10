// Shared by browser grade extraction and the local Looks importer.
export function dominantPaletteFromPixels(pixels, limit = 10) {
  const buckets = new Map(), bucketSize = 24;
  for (let index = 0; index < pixels.length; index += 4) {
    if (pixels[index + 3] < 32) continue;
    const r = pixels[index], g = pixels[index + 1], b = pixels[index + 2];
    const key = [r, g, b].map(value => Math.min(255, Math.round(value / bucketSize) * bucketSize)).join(",");
    const bucket = buckets.get(key) || { r: 0, g: 0, b: 0, count: 0 };
    bucket.r += r; bucket.g += g; bucket.b += b; bucket.count++;
    buckets.set(key, bucket);
  }
  const total = [...buckets.values()].reduce((sum, bucket) => sum + bucket.count, 0) || 1;
  const candidates = [...buckets.values()].map(bucket => ({
    r: Math.round(bucket.r / bucket.count), g: Math.round(bucket.g / bucket.count), b: Math.round(bucket.b / bucket.count),
    percent: Math.round(bucket.count / total * 1000) / 10
  })).sort((a, b) => b.percent - a.percent);
  const selected = [];
  for (const color of candidates) {
    if (selected.length < limit && !selected.some(other => Math.hypot(other.r - color.r, other.g - color.g, other.b - color.b) < 30)) selected.push(color);
  }
  return selected.length >= limit ? selected : candidates.slice(0, limit);
}
